/**
 * Evan AI — ScanScheduler (Backpressure + Throughput Control)
 *
 * Prevents system overload under extreme scan input rates.
 * Queues scan requests, enforces concurrency limits, and applies
 * backpressure policies to protect the pipeline.
 *
 * Architecture:
 *   - FIFO queue with configurable concurrency limit (default: 1)
 *   - Newest-wins drop strategy under debounce window
 *   - Overload detection: input rate > processing rate
 *   - Structured metrics: queue length, wait time, drop count
 *   - Dispatcher pattern: scheduler calls orchestrator, not vice versa
 *
 * Guarantees:
 *   - No uncontrolled concurrent scan execution
 *   - Rapid duplicate scans debounced (default: 100ms window)
 *   - Queue overflow detected and reported via ScanObserver
 *   - O(1) enqueue, O(1) dequeue, O(1) metric reads
 */

import { ScanObserver } from "./ScanObserver";
import type { DealInput } from "../services/dealEngine";

// ── Types ───────────────────────────────────────────────────────────────────

export interface QueuedScan {
  /** Unique ticket ID for tracking */
  ticketId: string;
  /** The scan input to dispatch */
  input: DealInput;
  /** Timestamp when enqueued */
  enqueuedAt: number;
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
}

// ── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_CONCURRENCY = 1;
const DEFAULT_DEBOUNCE_MS = 100;
const MAX_WAIT_TIME_SAMPLES = 50;
const OVERLOAD_THRESHOLD_MULTIPLIER = 3;

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
  private _waitTimes: number[] = [];
  private _totalEnqueued = 0;
  private _totalDropped = 0;
  private _totalDispatched = 0;

  // ── Configuration ─────────────────────────────────────────────────────

  /**
   * Set the dispatch function — called when a queued scan is ready to execute.
   * Typically wired to orchestrator.handleScan.
   */
  setDispatcher(fn: (input: DealInput) => void): void {
    this._dispatcher = fn;
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
   * If the previous enqueue was within the debounce window,
   * the OLDER queued scan is dropped (newest-wins strategy).
   *
   * Returns a ticket ID for tracking/cancellation.
   */
  enqueue(input: DealInput): string {
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
        reason: "debounce_newest_wins",
        waitMs: now - dropped.enqueuedAt,
      });
    }

    const ticket: QueuedScan = {
      ticketId: generateTicketId(),
      input,
      enqueuedAt: now,
    };
    this._queue.push(ticket);
    this._lastEnqueueTime = now;

    ScanObserver.emit("info", "lifecycle", "SCAN_ENQUEUED", null, "idle", {
      ticketId: ticket.ticketId,
      queueLength: this._queue.length,
      isProcessing: this._isProcessing,
    });

    // Detect overload
    if (this.isOverloaded()) {
      ScanObserver.emit("warn", "lifecycle", "SCHEDULER_OVERLOAD", null, "idle", {
        queueLength: this._queue.length,
        concurrencyLimit: this._concurrencyLimit,
        threshold: this._concurrencyLimit * OVERLOAD_THRESHOLD_MULTIPLIER,
      });
    }

    this._processNext();
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
    ScanObserver.emit("info", "lifecycle", "SCAN_SLOT_RELEASED", null, "idle", {
      queueLength: this._queue.length,
    });
    this._processNext();
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private _processNext(): void {
    if (this._isProcessing) return;
    if (this._queue.length === 0) return;
    if (!this._dispatcher) return;

    this._isProcessing = true;
    const next = this._queue.shift()!;

    // Track wait time
    const waitTime = Date.now() - next.enqueuedAt;
    this._waitTimes.push(waitTime);
    if (this._waitTimes.length > MAX_WAIT_TIME_SAMPLES) {
      this._waitTimes.shift();
    }

    this._totalDispatched++;

    ScanObserver.emit("info", "lifecycle", "SCAN_DISPATCHED", null, "idle", {
      ticketId: next.ticketId,
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

  // ── Reset (for testing) ───────────────────────────────────────────────

  reset(): void {
    this._queue = [];
    this._isProcessing = false;
    this._waitTimes = [];
    this._totalEnqueued = 0;
    this._totalDropped = 0;
    this._totalDispatched = 0;
    this._lastEnqueueTime = 0;
  }
}

// ── Export Singleton ─────────────────────────────────────────────────────────

export const ScanScheduler = new _ScanScheduler();
