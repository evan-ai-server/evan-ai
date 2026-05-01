/**
 * Evan AI — PhaseContract (Liveness Guarantees)
 *
 * Eliminates reliance on time-based recovery (watchdogs).
 * Every phase has a CONTRACT: a deterministic exit path with
 * tiered escalation and progress tracking.
 *
 * Architecture:
 *   - Each phase defines: timeout, escalation threshold, expected exits
 *   - Active contract monitors progress signals from the pipeline
 *   - Escalation fires before timeout (warning, not action)
 *   - Timeout fires as last resort (force-advance or abort)
 *   - User-driven phases (idle, paywall, complete, error) have no contract
 *
 * Liveness Proof:
 *   - Every non-user-driven phase has a finite timeout
 *   - Every timeout triggers a callback (never silent stall)
 *   - The pipeline is provably live: no phase can stall indefinitely
 *
 * Handshake Protocol (dopamine example):
 *   1. Orchestrator enters dopamine_phase → contract starts
 *   2. DopamineLayer mounts → sends "component_mounted" signal
 *   3. DopamineLayer renders → markDopamineRendered → contract fulfilled
 *   4. If no ack by escalation (4s) → warning logged
 *   5. If no ack by timeout (8s) → force-advance (last resort)
 */

import type { ScanPhase } from "../hooks/useEvanBrain";
import { ScanObserver } from "./ScanObserver";

// ── Types ───────────────────────────────────────────────────────────────────

export interface PhaseContractDef {
  /** Max time in this phase before timeout fires (Infinity = no timeout) */
  timeoutMs: number;
  /** Time before escalation warning fires (Infinity = no escalation) */
  escalationMs: number;
  /** Valid exit transitions from this phase */
  expectedExits: ScanPhase[];
  /** Optional progress signals to track (for diagnostics) */
  progressSignals?: string[];
}

export interface ContractCallbacks {
  /** Fired at escalation threshold — warning, not action */
  onEscalation: (
    phase: ScanPhase,
    scanId: string,
    receivedSignals: string[],
  ) => void;
  /** Fired at timeout — last resort, force-advance or abort */
  onTimeout: (
    phase: ScanPhase,
    scanId: string,
    receivedSignals: string[],
  ) => void;
}

export interface ActiveContractState {
  phase: ScanPhase;
  scanId: string;
  enteredAt: number;
  receivedSignals: string[];
  escalated: boolean;
  timedOut: boolean;
  elapsedMs: number;
}

// ── Phase Contract Definitions ──────────────────────────────────────────────
// Every phase has a contract. Phases with Infinity timeout are user-driven
// and get no active monitoring.

export const PHASE_CONTRACTS: Record<ScanPhase, PhaseContractDef> = {
  idle: {
    timeoutMs: Infinity,
    escalationMs: Infinity,
    expectedExits: ["scanning"],
  },
  scanning: {
    timeoutMs: 10_000,
    escalationMs: 5_000,
    expectedExits: ["fast_verdict", "error"],
    progressSignals: ["deal_engine_started"],
  },
  fast_verdict: {
    timeoutMs: 500,
    escalationMs: 200,
    expectedExits: ["dopamine_phase", "error"],
  },
  dopamine_phase: {
    timeoutMs: 8_000,
    escalationMs: 4_000,
    expectedExits: ["deep_analysis", "error"],
    progressSignals: ["component_mounted", "animation_started", "ack_received"],
  },
  deep_analysis: {
    timeoutMs: 2_000,
    escalationMs: 1_000,
    expectedExits: ["aspiration_phase", "complete", "error"],
  },
  aspiration_phase: {
    timeoutMs: 3_000,
    escalationMs: 1_500,
    expectedExits: ["paywall", "complete", "error"],
  },
  paywall: {
    timeoutMs: Infinity,
    escalationMs: Infinity,
    expectedExits: ["complete", "error"],
  },
  complete: {
    timeoutMs: Infinity,
    escalationMs: Infinity,
    expectedExits: ["idle", "scanning"],
  },
  error: {
    timeoutMs: Infinity,
    escalationMs: Infinity,
    expectedExits: ["idle"],
  },
};

// ── Active Contract ─────────────────────────────────────────────────────────

class ActiveContract {
  readonly phase: ScanPhase;
  readonly scanId: string;
  readonly enteredAt: number;

  private _def: PhaseContractDef;
  private _callbacks: ContractCallbacks;
  private _escalationTimer: ReturnType<typeof setTimeout> | null = null;
  private _timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private _receivedSignals: string[] = [];
  private _escalated = false;
  private _timedOut = false;
  private _cancelled = false;

  constructor(
    phase: ScanPhase,
    scanId: string,
    def: PhaseContractDef,
    callbacks: ContractCallbacks,
  ) {
    this.phase = phase;
    this.scanId = scanId;
    this.enteredAt = Date.now();
    this._def = def;
    this._callbacks = callbacks;

    // ── Start escalation timer ──────────────────────────────────────────
    if (Number.isFinite(def.escalationMs)) {
      this._escalationTimer = setTimeout(() => {
        this._escalationTimer = null;
        if (this._cancelled) return;
        this._escalated = true;

        ScanObserver.emit(
          "warn",
          "lifecycle",
          "CONTRACT_ESCALATION",
          scanId,
          phase,
          {
            elapsedMs: Date.now() - this.enteredAt,
            receivedSignals: [...this._receivedSignals],
            expectedSignals: def.progressSignals ?? [],
            contractDef: {
              escalationMs: def.escalationMs,
              timeoutMs: def.timeoutMs,
            },
          },
        );

        callbacks.onEscalation(phase, scanId, [...this._receivedSignals]);
      }, def.escalationMs);
    }

    // ── Start timeout timer (last resort) ───────────────────────────────
    if (Number.isFinite(def.timeoutMs)) {
      this._timeoutTimer = setTimeout(() => {
        this._timeoutTimer = null;
        if (this._cancelled) return;
        this._timedOut = true;

        ScanObserver.emit(
          "error",
          "lifecycle",
          "CONTRACT_TIMEOUT",
          scanId,
          phase,
          {
            elapsedMs: Date.now() - this.enteredAt,
            receivedSignals: [...this._receivedSignals],
            expectedSignals: def.progressSignals ?? [],
            contractDef: {
              escalationMs: def.escalationMs,
              timeoutMs: def.timeoutMs,
            },
          },
        );

        callbacks.onTimeout(phase, scanId, [...this._receivedSignals]);
      }, def.timeoutMs);
    }

    ScanObserver.emit("info", "lifecycle", "CONTRACT_STARTED", scanId, phase, {
      timeoutMs: def.timeoutMs,
      escalationMs: def.escalationMs,
      expectedExits: def.expectedExits,
      progressSignals: def.progressSignals ?? [],
    });
  }

  /**
   * Receive a progress signal from the pipeline.
   * Signals are tracked for diagnostics — they do NOT cancel timers.
   * Only an explicit exit() cancels the contract.
   */
  receiveSignal(signal: string): void {
    if (this._cancelled) return;
    this._receivedSignals.push(signal);

    ScanObserver.emit(
      "info",
      "lifecycle",
      "CONTRACT_SIGNAL",
      this.scanId,
      this.phase,
      {
        signal,
        totalSignals: this._receivedSignals.length,
        elapsedMs: Date.now() - this.enteredAt,
      },
    );
  }

  /**
   * Cancel the contract — phase exited normally.
   * Clears all timers and logs fulfillment.
   */
  cancel(): void {
    if (this._cancelled) return;
    this._cancelled = true;

    if (this._escalationTimer) {
      clearTimeout(this._escalationTimer);
      this._escalationTimer = null;
    }
    if (this._timeoutTimer) {
      clearTimeout(this._timeoutTimer);
      this._timeoutTimer = null;
    }

    ScanObserver.emit(
      "info",
      "lifecycle",
      "CONTRACT_FULFILLED",
      this.scanId,
      this.phase,
      {
        elapsedMs: Date.now() - this.enteredAt,
        receivedSignals: [...this._receivedSignals],
        escalated: this._escalated,
        timedOut: this._timedOut,
      },
    );
  }

  /** Snapshot of current contract state (for debugging/testing) */
  getState(): ActiveContractState {
    return {
      phase: this.phase,
      scanId: this.scanId,
      enteredAt: this.enteredAt,
      receivedSignals: [...this._receivedSignals],
      escalated: this._escalated,
      timedOut: this._timedOut,
      elapsedMs: Date.now() - this.enteredAt,
    };
  }
}

// ── Phase Contract Manager ──────────────────────────────────────────────────

class _PhaseContractManager {
  private _active: ActiveContract | null = null;

  /**
   * Enter a new phase contract. Cancels any existing contract.
   *
   * Phases with Infinity timeout (idle, complete, error, paywall)
   * get no active contract — they're user-driven.
   */
  enter(
    phase: ScanPhase,
    scanId: string,
    callbacks: ContractCallbacks,
  ): void {
    // Cancel existing contract (phase transition = previous fulfilled)
    this._active?.cancel();
    this._active = null;

    const def = PHASE_CONTRACTS[phase];
    if (!Number.isFinite(def.timeoutMs)) {
      // User-driven phase — no contract needed
      return;
    }

    this._active = new ActiveContract(phase, scanId, def, callbacks);
  }

  /**
   * Send a progress signal to the active contract.
   * No-op if no contract is active.
   */
  signal(progressSignal: string): void {
    this._active?.receiveSignal(progressSignal);
  }

  /**
   * Phase exited normally — cancel the active contract.
   * Must be called at EVERY phase transition to prevent timer leaks.
   */
  exit(): void {
    this._active?.cancel();
    this._active = null;
  }

  /**
   * Get the current active contract state (for debugging/testing).
   * Returns null if no contract is active.
   */
  getActive(): ActiveContractState | null {
    return this._active?.getState() ?? null;
  }

  /** Whether a contract is currently active */
  hasActive(): boolean {
    return this._active !== null;
  }

  /** Reset all state (for testing) */
  reset(): void {
    this._active?.cancel();
    this._active = null;
  }
}

// ── Export Singleton ─────────────────────────────────────────────────────────

export const PhaseContractManager = new _PhaseContractManager();
