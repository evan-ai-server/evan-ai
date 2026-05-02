/**
 * Evan AI — ReplayEngine (Deterministic Replay) [OPUS 4.8 Resilience]
 *
 * Records scan pipeline events in a deterministic event log.
 * Enables replay of scans from event logs + snapshot checkpoints.
 *
 * Modes:
 *   - RECORD:   Capture events during normal execution
 *   - SHADOW:   Replay in parallel, compare with live execution
 *   - RECOVERY: Replay after failure to restore deterministic state
 *
 * Architecture:
 *   - Event sourcing: every state-changing action is an event
 *   - Snapshots serve as replay checkpoints (skip to nearest snapshot)
 *   - Replay produces a simulated state sequence, not mutations
 *   - Shadow mode compares simulated vs actual state at checkpoints
 *   - Validation: replay must produce identical state for identical events
 *
 * Guarantees:
 *   - Deterministic: same events → same state sequence
 *   - Bounded: max 500 events in ring buffer
 *   - Idempotent: replaying the same events always produces the same result
 *   - Non-mutating: replay doesn't touch the live store
 */

import type { ScanPhase } from "../hooks/useEvanBrain";
import { SnapshotManager, type PipelineSnapshot, type BrainStateSlice } from "./SnapshotManager";
import { ForensicLog } from "./ForensicLog";
import { ScanObserver, type ObserverEvent } from "./ScanObserver";

// ── Types ──────────────────────────────────────────────────────────────────

export type ReplayEventType =
  | "SCAN_STARTED"
  | "FAST_VERDICT"
  | "ENTER_DOPAMINE"
  | "DOPAMINE_ACK"
  | "DEEP_ANALYSIS"
  | "ENTER_ASPIRATION"
  | "SCAN_COMPLETE"
  | "SHOW_PAYWALL"
  | "HIDE_PAYWALL"
  | "SET_ERROR"
  | "RESET_SCAN";

export interface ReplayEvent {
  /** Event sequence number (monotonically increasing) */
  seq: number;
  /** Event type (maps to TransitionAction types) */
  type: ReplayEventType;
  /** Timestamp when event occurred */
  timestamp: number;
  /** ScanId at event time */
  scanId: string | null;
  /** Phase BEFORE event */
  phaseBefore: ScanPhase;
  /** Phase AFTER event */
  phaseAfter: ScanPhase;
  /** Event payload (action-specific data) */
  payload: Record<string, unknown>;
  /** Snapshot ID captured at this event (null if no snapshot) */
  snapshotId: string | null;
}

export type ReplayMode = "shadow" | "recovery";

export interface ReplayResult {
  /** Whether replay matched expectations */
  success: boolean;
  /** Number of events replayed */
  eventsReplayed: number;
  /** Simulated final state */
  finalState: SimulatedState;
  /** Mismatches found (empty if success) */
  mismatches: ReplayMismatch[];
  /** Duration of replay (ms) */
  replayDurationMs: number;
}

export interface ReplayMismatch {
  /** Event sequence number where mismatch occurred */
  atSeq: number;
  /** Event type that caused mismatch */
  eventType: ReplayEventType;
  /** Field path that mismatched */
  field: string;
  /** Expected value (from snapshot) */
  expected: unknown;
  /** Actual value (from replay simulation) */
  actual: unknown;
}

/** Simulated state — produced by replay, never touches the real store */
export interface SimulatedState {
  phase: ScanPhase;
  scanId: string | null;
  dopamineRendered: boolean;
  paywallVisible: boolean;
  hasError: boolean;
  hasDealResult: boolean;
}

// ── Valid Phase Transitions (for replay simulation) ────────────────────────

const REPLAY_TRANSITIONS: Record<ReplayEventType, {
  requiredPhases: ScanPhase[] | null;
  nextPhase: ScanPhase | null;
}> = {
  SCAN_STARTED:     { requiredPhases: null,                                       nextPhase: "scanning" },
  FAST_VERDICT:     { requiredPhases: ["scanning"],                               nextPhase: "fast_verdict" },
  ENTER_DOPAMINE:   { requiredPhases: ["fast_verdict"],                           nextPhase: "dopamine_phase" },
  DOPAMINE_ACK:     { requiredPhases: ["dopamine_phase"],                         nextPhase: null },
  DEEP_ANALYSIS:    { requiredPhases: ["dopamine_phase"],                         nextPhase: "deep_analysis" },
  ENTER_ASPIRATION: { requiredPhases: ["deep_analysis"],                          nextPhase: "aspiration_phase" },
  SCAN_COMPLETE:    { requiredPhases: ["deep_analysis", "aspiration_phase", "paywall"], nextPhase: "complete" },
  SHOW_PAYWALL:     { requiredPhases: ["aspiration_phase"],                       nextPhase: "paywall" },
  HIDE_PAYWALL:     { requiredPhases: null,                                       nextPhase: "complete" },
  SET_ERROR:        { requiredPhases: null,                                       nextPhase: "error" },
  RESET_SCAN:       { requiredPhases: null,                                       nextPhase: "idle" },
};

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_EVENTS = 500;

/** Map from ObserverEvent names to ReplayEventTypes */
const OBSERVER_TO_REPLAY: Record<string, ReplayEventType> = {
  "idle → scanning": "SCAN_STARTED",
  "complete → scanning": "SCAN_STARTED",
  "scanning → fast_verdict": "FAST_VERDICT",
  "fast_verdict → dopamine_phase": "ENTER_DOPAMINE",
  "dopamine_phase → deep_analysis": "DEEP_ANALYSIS",
  "deep_analysis → aspiration_phase": "ENTER_ASPIRATION",
  "deep_analysis → complete": "SCAN_COMPLETE",
  "aspiration_phase → paywall": "SHOW_PAYWALL",
  "aspiration_phase → complete": "SCAN_COMPLETE",
  "paywall → complete": "SCAN_COMPLETE",
};

// ── ReplayEngine ───────────────────────────────────────────────────────────

class _ReplayEngine {
  /** Event log ring buffer */
  private _events: ReplayEvent[] = [];
  /** Monotonically increasing sequence number */
  private _seq = 0;
  /** ScanObserver subscription */
  private _unsubscribe: (() => void) | null = null;
  /** Per-scan event index */
  private _scanIndex = new Map<string, number[]>();

  // ── Lifecycle ─────────────────────────────────────────────────────────

  /**
   * Start recording events from ScanObserver.
   * Captures phase transitions as replay events.
   */
  start(): void {
    if (this._unsubscribe) return;

    this._unsubscribe = ScanObserver.onEvent((event) => {
      if (event.category === "phase_transition") {
        this._recordTransition(event);
      }
      if (event.event === "DOPAMINE_ACK") {
        this._recordEvent("DOPAMINE_ACK", event.scanId, event.phase, event.phase, event.data);
      }
    });
  }

  /** Stop recording. */
  stop(): void {
    this._unsubscribe?.();
    this._unsubscribe = null;
  }

  // ── Event Recording ───────────────────────────────────────────────────

  private _recordTransition(event: ObserverEvent): void {
    const replayType = OBSERVER_TO_REPLAY[event.event];
    if (!replayType) return;

    const phaseBefore = (event.data.fromPhase as ScanPhase) ?? event.previousPhase ?? "idle";
    const phaseAfter = (event.data.toPhase as ScanPhase) ?? event.phase;

    this._recordEvent(replayType, event.scanId, phaseBefore, phaseAfter, event.data);
  }

  private _recordEvent(
    type: ReplayEventType,
    scanId: string | null,
    phaseBefore: ScanPhase,
    phaseAfter: ScanPhase,
    payload: Record<string, unknown>,
  ): void {
    this._seq++;

    // Capture snapshot at key transitions
    let snapshotId: string | null = null;
    const snapshotTriggers: ReplayEventType[] = [
      "SCAN_STARTED", "FAST_VERDICT", "DOPAMINE_ACK",
      "DEEP_ANALYSIS", "SCAN_COMPLETE", "SET_ERROR",
    ];
    if (snapshotTriggers.includes(type)) {
      const triggerMap: Record<string, string> = {
        SCAN_STARTED: "scan_started",
        FAST_VERDICT: "fast_verdict_ready",
        DOPAMINE_ACK: "dopamine_rendered",
        DEEP_ANALYSIS: "deep_analysis_ready",
        SCAN_COMPLETE: "scan_complete",
        SET_ERROR: "scan_error",
      };
      const trigger = triggerMap[type] as any;
      if (trigger) {
        const snapshot = SnapshotManager.capture(trigger);
        snapshotId = snapshot.id;
      }
    }

    const event: ReplayEvent = {
      seq: this._seq,
      type,
      timestamp: Date.now(),
      scanId,
      phaseBefore,
      phaseAfter,
      payload,
      snapshotId,
    };

    // Ring buffer
    if (this._events.length >= MAX_EVENTS) {
      const evicted = this._events.shift()!;
      // Clean up scan index
      if (evicted.scanId) {
        const seqs = this._scanIndex.get(evicted.scanId);
        if (seqs) {
          const idx = seqs.indexOf(evicted.seq);
          if (idx >= 0) seqs.splice(idx, 1);
          if (seqs.length === 0) this._scanIndex.delete(evicted.scanId);
        }
      }
    }
    this._events.push(event);

    // Update scan index
    if (scanId) {
      if (!this._scanIndex.has(scanId)) {
        this._scanIndex.set(scanId, []);
      }
      this._scanIndex.get(scanId)!.push(this._seq);
    }
  }

  // ── Replay ────────────────────────────────────────────────────────────

  /**
   * Replay a scan's events and produce a simulated state sequence.
   *
   * In SHADOW mode: compares simulated state against snapshots at checkpoints.
   * In RECOVERY mode: returns the final simulated state for restoration.
   *
   * Does NOT mutate the live store — pure simulation.
   *
   * Performance: O(n) where n = events for the scan.
   */
  replay(scanId: string, mode: ReplayMode = "shadow"): ReplayResult {
    const startTime = Date.now();
    const events = this.getEventsForScan(scanId);

    if (events.length === 0) {
      return {
        success: false,
        eventsReplayed: 0,
        finalState: this._initialState(),
        mismatches: [{
          atSeq: 0,
          eventType: "SCAN_STARTED",
          field: "events",
          expected: ">0",
          actual: "0",
        }],
        replayDurationMs: 0,
      };
    }

    let state = this._initialState();
    const mismatches: ReplayMismatch[] = [];

    for (const event of events) {
      // Apply event to simulated state
      state = this._applyEvent(state, event);

      // In shadow mode, validate against snapshot checkpoints
      if (mode === "shadow" && event.snapshotId) {
        const snapshot = SnapshotManager.restore(event.snapshotId);
        if (snapshot) {
          const eventMismatches = this._compareWithSnapshot(
            state,
            snapshot,
            event.seq,
            event.type,
          );
          mismatches.push(...eventMismatches);
        }
      }
    }

    const result: ReplayResult = {
      success: mismatches.length === 0,
      eventsReplayed: events.length,
      finalState: state,
      mismatches,
      replayDurationMs: Date.now() - startTime,
    };

    // Log mismatches to ForensicLog
    if (mismatches.length > 0) {
      ForensicLog.record(
        scanId,
        "replay_mismatch",
        state.phase,
        `Replay found ${mismatches.length} mismatch(es)`,
        { mismatches, mode },
      );

      ScanObserver.emit(
        "error",
        "invariant_violation",
        "REPLAY_MISMATCH",
        scanId,
        state.phase,
        {
          mismatchCount: mismatches.length,
          mode,
          eventsReplayed: events.length,
          firstMismatch: mismatches[0],
        },
      );
    }

    return result;
  }

  // ── Simulation ────────────────────────────────────────────────────────

  private _initialState(): SimulatedState {
    return {
      phase: "idle",
      scanId: null,
      dopamineRendered: false,
      paywallVisible: false,
      hasError: false,
      hasDealResult: false,
    };
  }

  /**
   * Apply a single event to simulated state.
   * Pure function — no side effects.
   */
  private _applyEvent(state: SimulatedState, event: ReplayEvent): SimulatedState {
    const transition = REPLAY_TRANSITIONS[event.type];

    // Phase transition
    const next = { ...state };

    if (transition.nextPhase) {
      next.phase = transition.nextPhase;
    }

    // Event-specific state changes
    switch (event.type) {
      case "SCAN_STARTED":
        next.scanId = event.scanId;
        next.dopamineRendered = false;
        next.paywallVisible = false;
        next.hasError = false;
        next.hasDealResult = false;
        break;
      case "FAST_VERDICT":
        next.hasDealResult = true;
        break;
      case "DOPAMINE_ACK":
        next.dopamineRendered = true;
        break;
      case "SHOW_PAYWALL":
        next.paywallVisible = true;
        break;
      case "HIDE_PAYWALL":
        next.paywallVisible = false;
        break;
      case "SET_ERROR":
        next.hasError = true;
        next.paywallVisible = false;
        next.dopamineRendered = false;
        break;
      case "RESET_SCAN":
        next.scanId = null;
        next.dopamineRendered = false;
        next.paywallVisible = false;
        next.hasError = false;
        next.hasDealResult = false;
        break;
    }

    return next;
  }

  /**
   * Compare simulated state against a snapshot checkpoint.
   */
  private _compareWithSnapshot(
    simulated: SimulatedState,
    snapshot: PipelineSnapshot,
    seq: number,
    eventType: ReplayEventType,
  ): ReplayMismatch[] {
    const mismatches: ReplayMismatch[] = [];
    const actual = snapshot.brain;

    if (simulated.phase !== actual.phase) {
      mismatches.push({
        atSeq: seq,
        eventType,
        field: "phase",
        expected: actual.phase,
        actual: simulated.phase,
      });
    }

    if (simulated.dopamineRendered !== actual.dopamineRendered) {
      mismatches.push({
        atSeq: seq,
        eventType,
        field: "dopamineRendered",
        expected: actual.dopamineRendered,
        actual: simulated.dopamineRendered,
      });
    }

    if (simulated.paywallVisible !== actual.paywallVisible) {
      mismatches.push({
        atSeq: seq,
        eventType,
        field: "paywallVisible",
        expected: actual.paywallVisible,
        actual: simulated.paywallVisible,
      });
    }

    if (simulated.hasError !== (actual.error !== null)) {
      mismatches.push({
        atSeq: seq,
        eventType,
        field: "hasError",
        expected: actual.error !== null,
        actual: simulated.hasError,
      });
    }

    if (simulated.hasDealResult !== (actual.dealResult !== null)) {
      mismatches.push({
        atSeq: seq,
        eventType,
        field: "hasDealResult",
        expected: actual.dealResult !== null,
        actual: simulated.hasDealResult,
      });
    }

    return mismatches;
  }

  // ── Queries ───────────────────────────────────────────────────────────

  /** All events for a scan (ordered by sequence) */
  getEventsForScan(scanId: string): ReplayEvent[] {
    const seqs = this._scanIndex.get(scanId);
    if (!seqs) return [];
    return this._events.filter((e) => seqs.includes(e.seq));
  }

  /** Full event log */
  getEvents(): readonly ReplayEvent[] {
    return this._events;
  }

  /** Event count */
  getEventCount(): number {
    return this._events.length;
  }

  /** Get events between two sequence numbers */
  getEventRange(fromSeq: number, toSeq: number): ReplayEvent[] {
    return this._events.filter((e) => e.seq >= fromSeq && e.seq <= toSeq);
  }

  // ── Reset ─────────────────────────────────────────────────────────────

  reset(): void {
    this.stop();
    this._events = [];
    this._seq = 0;
    this._scanIndex.clear();
  }
}

// ── Export Singleton ─────────────────────────────────────────────────────────

export const ReplayEngine = new _ReplayEngine();
