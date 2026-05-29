/**
 * Evan AI — ScanScheduler 2.0 (Priority + Preemption + Backpressure)
 *
 * OPUS 4.8 upgrade: reactive FIFO → proactive priority queue.
 *
 * Prevents system overload under extreme scan input rates.
 * Queues scan requests with priority ordering, enforces concurrency limits,
 * applies backpressure policies, and supports preemption.
 *
 * Architecture:
 *   - Priority queue: CRITICAL > HIGH > LOW (FIFO within same level)
 *   - Newest-wins drop strategy under debounce window
 *   - Age-boost starvation prevention (LOW→HIGH at 5s, HIGH→CRITICAL at 10s)
 *   - Preemption: CRITICAL arriving while LOW processing → cancel LOW
 *   - Overload detection: input rate > processing rate
 *   - Structured metrics: queue length, wait time, drop count, priority breakdown
 *   - Dispatcher pattern: scheduler calls orchestrator, not vice versa
 *
 * Guarantees:
 *   - No uncontrolled concurrent scan execution
 *   - Rapid duplicate scans debounced (default: 100ms window)
 *   - No starvation: age-boost ensures every scan eventually runs
 *   - Queue overflow detected and reported via ScanObserver
 *   - O(n) enqueue (n ≤ 3 typical), O(1) dequeue, O(1) metric reads
 */

import { ScanObserver } from "./ScanObserver";
import type { DealInput } from "../services/dealEngine";
import type { ScanPriority } from "./IntentEngine";

// ── Types ───────────────────────────────────────────────────────────────────

export interface QueuedScan {
  /** Unique ticket ID for tracking */
  ticketId: string;
  /** The scan input to dispatch */
  input: DealInput;
  /** Timestamp when enqueued */
  enqueuedAt: number;
  /** OPUS 4.8: scheduling priority (default: HIGH for backward compat) */
  priority: ScanPriority;
}

export interface SchedulerMetrics {
  /** Current queue depth */
  queueLength: number;
  /** Number of scans currently processing (0 or 1) */
  activeScans: number;
  /** Lifetime enqueue count */
  totalEnqueued: number;
  /** Lifetime drop count (debounce + cancel + flush) */
  totalDropped: number;
  /** Lifetime dispatch count */
  totalDispatched: number;
  /** Rolling average wait time (ms) */
  avgWaitTimeMs: number;
  /** OPUS 4.8: lifetime preemption count */
  totalPreemptions: number;
  /** OPUS 4.8: lifetime age-boost count */
  totalAgeBoosts: number;
  /** OPUS 4.8: priority of currently processing scan (null if idle) */
  activePriority: ScanPriority | null;
}

// ── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_CONCURRENCY = 1;
const DEFAULT_DEBOUNCE_MS = 100;
const MAX_WAIT_TIME_SAMPLES = 50;
const OVERLOAD_THRESHOLD_MULTIPLIER = 3;

/** Priority rank: lower number = higher priority */
const PRIORITY_RANK: Record<ScanPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  LOW: 2,
};

/** Age-boost thresholds (starvation prevention) */
const AGE_BOOST_LOW_TO_HIGH_MS = 5_000;
const AGE_BOOST_HIGH_TO_CRITICAL_MS = 10_000;

let _ticketSeq = 0;
function generateTicketId(): string {
  _ticketSeq += 1;
  return `ticket_${Date.now()}_${_ticketSeq}`;
}

// ── Scheduler ───────────────────────────────────────────────────────────────

class _ScanScheduler {
  private _queue: QueuedScan[] = [];
  private _isProcessing = false;
  private _concurrencyLimit = DEFAULT_CONCURRENCY;
  private _debounceMs = DEFAULT_DEBOUNCE_MS;
  private _lastEnqueueTime = 0;
  private _dispatcher: ((input: DealInput) => void) | null = null;
  private _preemptCallback: (() => void) | null = null;
  private _activePriority: ScanPriority | null = null;
  private _waitTimes: number[] = [];
  private _totalEnqueued = 0;
  private _totalDropped = 0;
  private _totalDispatched = 0;
  private _totalPreemptions = 0;
  private _totalAgeBoosts = 0;

  // ── Configuration ─────────────────────────────────────────────────────

  /**
   * Set the dispatch function — called when a queued scan is ready to execute.
   * Typically wired to orchestrator.handleScan.
   */
  setDispatcher(fn: (input: DealInput) => void): void {
    this._dispatcher = fn;
  }

  /**
   * OPUS 4.8: Set the preemption callback.
   * Called when a CRITICAL scan arrives and should preempt a LOW-priority scan.
   * Typically wired to orchestrator.cancelSequence.
   */
  setPreemptCallback(fn: () => void): void {
    this._preemptCallback = fn;
  }

  /** Set maximum concurrent scans (default: 1) */
  setConcurrency(limit: number): void {
    this._concurrencyLimit = Math.max(1, limit);
  }

  /** Set debounce window in ms (default: 100) */
  setDebounce(ms: number): void {
    this._debounceMs = Math.max(0, ms);
  }

  // ── Queue Operations ──────────────────────────────────────────────────

  /**
   * Enqueue a scan for processing.
   *
   * OPUS 4.8 upgrades:
   *   - Priority-ordered insertion (CRITICAL > HIGH > LOW)
   *   - Preemption: CRITICAL arriving while LOW processing → cancel LOW
   *   - Age-boost checked on every processNext (starvation prevention)
   *
   * If the previous enqueue was within the debounce window,
   * the OLDER queued scan is dropped (newest-wins strategy).
   *
   * Returns a ticket ID for tracking/cancellation.
   */
  enqueue(input: DealInput, priority: ScanPriority = "HIGH"): string {
    const now = Date.now();
    this._totalEnqueued++;

    // Debounce: drop previous queued scan if within window
    if (
      now - this._lastEnqueueTime < this._debounceMs &&
      this._queue.length > 0
    ) {
      const dropped = this._queue.pop()!;
      this._totalDropped++;
      ScanObserver.emit("info", "lifecycle", "SCAN_DROPPED", null, "idle", {
        droppedTicketId: dropped.ticketId,
        droppedPriority: dropped.priority,
        reason: "debounce_newest_wins",
        waitMs: now - dropped.enqueuedAt,
      });
    }

    const ticket: QueuedScan = {
      ticketId: generateTicketId(),
      input,
      enqueuedAt: now,
      priority,
    };

    // Priority-ordered insertion: insert at end of same-priority block
    this._insertSorted(ticket);
    this._lastEnqueueTime = now;

    ScanObserver.emit("info", "priority", "SCAN_ENQUEUED", null, "idle", {
      ticketId: ticket.ticketId,
      priority,
      queueLength: this._queue.length,
      isProcessing: this._isProcessing,
      activePriority: this._activePriority,
    });

    // Detect overload
    if (this.isOverloaded()) {
      ScanObserver.emit("warn", "lifecycle", "SCHEDULER_OVERLOAD", null, "idle", {
        queueLength: this._queue.length,
        concurrencyLimit: this._concurrencyLimit,
        threshold: this._concurrencyLimit * OVERLOAD_THRESHOLD_MULTIPLIER,
      });
    }

    // ── Preemption check ──────────────────────────────────────────────
    // If a CRITICAL scan arrives and we're processing a LOW scan,
    // preempt the LOW scan so CRITICAL runs next.
    if (
      this._isProcessing &&
      priority === "CRITICAL" &&
      this._activePriority === "LOW" &&
      this._preemptCallback
    ) {
      this._totalPreemptions++;
      ScanObserver.emit("warn", "priority", "SCAN_PREEMPTED", null, "idle", {
        preemptedPriority: this._activePriority,
        incomingPriority: priority,
        ticketId: ticket.ticketId,
        totalPreemptions: this._totalPreemptions,
      });
      // Preempt: cancel the active LOW scan.
      // The callback triggers cancelSequence → scanFinished → _processNext.
      this._preemptCallback();
    } else {
      this._processNext();
    }

    return ticket.ticketId;
  }

  /**
   * Cancel a specific queued scan by ticket ID.
   * Returns true if the scan was found and removed.
   */
  cancel(ticketId: string): boolean {
    const idx = this._queue.findIndex((q) => q.ticketId === ticketId);
    if (idx < 0) return false;

    this._queue.splice(idx, 1);
    this._totalDropped++;
    ScanObserver.emit("info", "lifecycle", "SCAN_CANCELLED_QUEUE", null, "idle", {
      ticketId,
      remainingInQueue: this._queue.length,
    });
    return true;
  }

  /**
   * Flush the entire queue — cancel all pending scans.
   */
  flush(): void {
    const count = this._queue.length;
    if (count === 0) return;

    this._totalDropped += count;
    this._queue = [];
    ScanObserver.emit("info", "lifecycle", "QUEUE_FLUSHED", null, "idle", {
      droppedCount: count,
    });
  }

  /**
   * Called when the active scan finishes (complete, error, or aborted).
   * Releases the concurrency slot and dispatches the next queued scan.
   */
  scanFinished(): void {
    this._isProcessing = false;
    this._activePriority = null;
    ScanObserver.emit("info", "lifecycle", "SCAN_SLOT_RELEASED", null, "idle", {
      queueLength: this._queue.length,
    });
    this._processNext();
  }

  // ── Internal ──────────────────────────────────────────────────────────

  /**
   * Insert a scan into the queue in priority order.
   * Within the same priority level, FIFO is preserved.
   * O(n) where n is queue length (typically 0–3).
   */
  private _insertSorted(scan: QueuedScan): void {
    const rank = PRIORITY_RANK[scan.priority];
    let insertIdx = this._queue.length; // default: end of queue

    // Find the first entry with a LOWER priority (higher rank number)
    for (let i = 0; i < this._queue.length; i++) {
      if (PRIORITY_RANK[this._queue[i].priority] > rank) {
        insertIdx = i;
        break;
      }
    }

    this._queue.splice(insertIdx, 0, scan);
  }

  /**
   * Age-boost starvation prevention.
   * Promotes entries that have been waiting too long.
   * O(n) scan — n ≤ OVERLOAD_THRESHOLD (typically 3).
   */
  private _applyAgeBoost(): void {
    const now = Date.now();
    let boosted = false;

    for (const scan of this._queue) {
      const ageMs = now - scan.enqueuedAt;
      if (scan.priority === "LOW" && ageMs > AGE_BOOST_LOW_TO_HIGH_MS) {
        scan.priority = "HIGH";
        boosted = true;
        this._totalAgeBoosts++;
      } else if (scan.priority === "HIGH" && ageMs > AGE_BOOST_HIGH_TO_CRITICAL_MS) {
        scan.priority = "CRITICAL";
        boosted = true;
        this._totalAgeBoosts++;
      }
    }

    if (boosted) {
      // Re-sort after boosting (stable sort preserves FIFO within priority)
      this._queue.sort(
        (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
      );
      ScanObserver.emit("info", "priority", "AGE_BOOST_APPLIED", null, "idle", {
        queueLength: this._queue.length,
        totalAgeBoosts: this._totalAgeBoosts,
      });
    }
  }

  private _processNext(): void {
    if (this._isProcessing) return;
    if (this._queue.length === 0) return;
    if (!this._dispatcher) return;

    // Apply age-boost before dispatch (starvation prevention)
    this._applyAgeBoost();

    this._isProcessing = true;
    const next = this._queue.shift()!;
    this._activePriority = next.priority;

    // Track wait time
    const waitTime = Date.now() - next.enqueuedAt;
    this._waitTimes.push(waitTime);
    if (this._waitTimes.length > MAX_WAIT_TIME_SAMPLES) {
      this._waitTimes.shift();
    }

    this._totalDispatched++;

    ScanObserver.emit("info", "priority", "SCAN_DISPATCHED", null, "idle", {
      ticketId: next.ticketId,
      priority: next.priority,
      waitMs: waitTime,
      remainingInQueue: this._queue.length,
    });

    // Dispatch to orchestrator
    this._dispatcher(next.input);
  }

  // ── Queries ───────────────────────────────────────────────────────────

  /** Get current scheduler metrics */
  getMetrics(): SchedulerMetrics {
    const avgWait =
      this._waitTimes.length > 0
        ? Math.round(
            this._waitTimes.reduce((a, b) => a + b, 0) /
              this._waitTimes.length,
          )
        : 0;

    return {
      queueLength: this._queue.length,
      activeScans: this._isProcessing ? 1 : 0,
      totalEnqueued: this._totalEnqueued,
      totalDropped: this._totalDropped,
      totalDispatched: this._totalDispatched,
      avgWaitTimeMs: avgWait,
      totalPreemptions: this._totalPreemptions,
      totalAgeBoosts: this._totalAgeBoosts,
      activePriority: this._activePriority,
    };
  }

  /**
   * Whether the scheduler is overloaded (queue > threshold).
   * Overload = input rate exceeds processing rate.
   */
  isOverloaded(): boolean {
    return (
      this._queue.length >
      this._concurrencyLimit * OVERLOAD_THRESHOLD_MULTIPLIER
    );
  }

  /** Current queue depth */
  getQueueLength(): number {
    return this._queue.length;
  }

  /** Whether a scan is currently being processed */
  isProcessing(): boolean {
    return this._isProcessing;
  }

  /** OPUS 4.8: priority of the currently processing scan */
  getActivePriority(): ScanPriority | null {
    return this._activePriority;
  }

  // ── Reset (for testing) ───────────────────────────────────────────────

  reset(): void {
    this._queue = [];
    this._isProcessing = false;
    this._activePriority = null;
    this._waitTimes = [];
    this._totalEnqueued = 0;
    this._totalDropped = 0;
    this._totalDispatched = 0;
    this._totalPreemptions = 0;
    this._totalAgeBoosts = 0;
    this._lastEnqueueTime = 0;
  }
}

// ── Export Singleton ─────────────────────────────────────────────────────────

export const ScanScheduler = new _ScanScheduler();
