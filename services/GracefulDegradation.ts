/**
 * Evan AI — GracefulDegradation (Adaptive Mode System) [OPUS 4.8 Resilience]
 *
 * Manages pipeline execution modes under varying health conditions.
 * Automatically degrades pipeline complexity when failures mount,
 * and recovers to full mode when health stabilizes.
 *
 * Modes (ordered by severity):
 *   NORMAL    — Full pipeline: scan → verdict → dopamine → deep → aspiration
 *   DEGRADED  — Skip deep analysis: scan → verdict → dopamine → complete
 *   CRITICAL  — Fast verdict only: scan → verdict → complete (no dopamine)
 *   SAFE_MODE — Minimal: scan → immediate result, no prediction, no learning
 *
 * Architecture:
 *   - Hysteresis: requires sustained anomaly count to escalate
 *   - Cooldown: minimum dwell time in each mode before transitions
 *   - Auto-recovery: de-escalates after sustained health
 *   - All mode changes logged via ScanObserver
 *
 * Guarantees:
 *   - No oscillation between modes (hysteresis + cooldown)
 *   - Pipeline always runs — only complexity changes
 *   - Mode is a suggestion — orchestrator checks and decides
 *   - O(1) mode check per scan
 */

import { ScanObserver } from "./ScanObserver";
import type { ScanPhase } from "../hooks/useEvanBrain";

// ── Types ──────────────────────────────────────────────────────────────────

export type DegradationMode = "NORMAL" | "DEGRADED" | "CRITICAL" | "SAFE_MODE";

export interface ModeConfig {
  /** Whether to run deep analysis */
  enableDeepAnalysis: boolean;
  /** Whether to run dopamine animation */
  enableDopamine: boolean;
  /** Whether to run aspiration/paywall engine */
  enableAspiration: boolean;
  /** Whether to run predictive pipeline (predict + prewarm) */
  enablePrediction: boolean;
  /** Whether to run learning engine */
  enableLearning: boolean;
  /** Phase contract timeout multiplier (higher = more lenient) */
  timeoutMultiplier: number;
}

export interface DegradationState {
  /** Current mode */
  mode: DegradationMode;
  /** When the current mode was entered */
  enteredAt: number;
  /** Consecutive anomaly count (escalation pressure) */
  anomalyPressure: number;
  /** Consecutive clean scan count (de-escalation pressure) */
  healthPressure: number;
  /** Total mode transitions */
  totalTransitions: number;
  /** History of mode changes */
  history: ModeTransition[];
}

export interface ModeTransition {
  from: DegradationMode;
  to: DegradationMode;
  reason: string;
  timestamp: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Mode configs — what each mode enables */
const MODE_CONFIGS: Record<DegradationMode, ModeConfig> = {
  NORMAL: {
    enableDeepAnalysis: true,
    enableDopamine: true,
    enableAspiration: true,
    enablePrediction: true,
    enableLearning: true,
    timeoutMultiplier: 1.0,
  },
  DEGRADED: {
    enableDeepAnalysis: false,
    enableDopamine: true,
    enableAspiration: false,
    enablePrediction: true,
    enableLearning: true,
    timeoutMultiplier: 1.5,
  },
  CRITICAL: {
    enableDeepAnalysis: false,
    enableDopamine: false,
    enableAspiration: false,
    enablePrediction: false,
    enableLearning: false,
    timeoutMultiplier: 2.0,
  },
  SAFE_MODE: {
    enableDeepAnalysis: false,
    enableDopamine: false,
    enableAspiration: false,
    enablePrediction: false,
    enableLearning: false,
    timeoutMultiplier: 3.0,
  },
};

/** Mode severity order (index = severity level) */
const MODE_ORDER: DegradationMode[] = [
  "NORMAL",
  "DEGRADED",
  "CRITICAL",
  "SAFE_MODE",
];

/** Anomaly count threshold to escalate to next mode */
const ESCALATION_THRESHOLDS: Record<DegradationMode, number> = {
  NORMAL: 3,      // 3 anomalies → DEGRADED
  DEGRADED: 2,    // 2 more anomalies → CRITICAL
  CRITICAL: 2,    // 2 more anomalies → SAFE_MODE
  SAFE_MODE: Infinity, // Cannot escalate further
};

/** Clean scan count threshold to de-escalate */
const DEESCALATION_THRESHOLD = 5;

/** Minimum dwell time (ms) in a mode before allowing transition */
const MIN_DWELL_MS = 10_000;

/** Max mode history entries */
const MAX_HISTORY = 50;

// ── GracefulDegradation ────────────────────────────────────────────────────

class _GracefulDegradation {
  private _state: DegradationState = {
    mode: "NORMAL",
    enteredAt: Date.now(),
    anomalyPressure: 0,
    healthPressure: 0,
    totalTransitions: 0,
    history: [],
  };

  // ── Mode Queries ──────────────────────────────────────────────────────

  /** Current degradation mode */
  getMode(): DegradationMode {
    return this._state.mode;
  }

  /** Current mode configuration (what's enabled/disabled) */
  getConfig(): ModeConfig {
    return MODE_CONFIGS[this._state.mode];
  }

  /** Full degradation state */
  getState(): Readonly<DegradationState> {
    return { ...this._state, history: [...this._state.history] };
  }

  /** Whether a specific pipeline stage is enabled */
  isEnabled(stage: keyof ModeConfig): boolean {
    const config = MODE_CONFIGS[this._state.mode];
    return config[stage] as boolean;
  }

  // ── Pressure Signals ──────────────────────────────────────────────────

  /**
   * Record an anomaly — increases escalation pressure.
   * If pressure exceeds threshold, escalates to next mode.
   */
  recordAnomaly(reason: string): void {
    this._state.anomalyPressure++;
    this._state.healthPressure = 0; // Reset de-escalation counter

    const threshold = ESCALATION_THRESHOLDS[this._state.mode];
    if (this._state.anomalyPressure >= threshold) {
      this._escalate(reason);
    }
  }

  /**
   * Record a healthy scan — increases de-escalation pressure.
   * If enough clean scans occur, de-escalates to previous mode.
   */
  recordHealthy(): void {
    this._state.healthPressure++;

    if (
      this._state.mode !== "NORMAL" &&
      this._state.healthPressure >= DEESCALATION_THRESHOLD &&
      this._canTransition()
    ) {
      this._deescalate();
    }
  }

  /**
   * Force a specific mode (for manual intervention or testing).
   * Bypasses hysteresis and cooldown.
   */
  forceMode(mode: DegradationMode, reason: string): void {
    if (mode === this._state.mode) return;
    this._transition(mode, `forced: ${reason}`);
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private _escalate(reason: string): void {
    const currentIdx = MODE_ORDER.indexOf(this._state.mode);
    if (currentIdx >= MODE_ORDER.length - 1) return; // Already at max

    if (!this._canTransition()) return;

    const nextMode = MODE_ORDER[currentIdx + 1];
    this._transition(nextMode, `escalation: ${reason}`);
  }

  private _deescalate(): void {
    const currentIdx = MODE_ORDER.indexOf(this._state.mode);
    if (currentIdx <= 0) return; // Already at NORMAL

    const prevMode = MODE_ORDER[currentIdx - 1];
    this._transition(prevMode, "de-escalation: sustained health");
  }

  private _canTransition(): boolean {
    return Date.now() - this._state.enteredAt >= MIN_DWELL_MS;
  }

  private _transition(to: DegradationMode, reason: string): void {
    const from = this._state.mode;

    const transition: ModeTransition = {
      from,
      to,
      reason,
      timestamp: Date.now(),
    };

    // Store history (bounded)
    if (this._state.history.length >= MAX_HISTORY) {
      this._state.history.shift();
    }
    this._state.history.push(transition);

    this._state.mode = to;
    this._state.enteredAt = Date.now();
    this._state.anomalyPressure = 0;
    this._state.healthPressure = 0;
    this._state.totalTransitions++;

    ScanObserver.emit("warn", "lifecycle", "DEGRADATION_MODE_CHANGE", null, "idle" as ScanPhase, {
      from,
      to,
      reason,
      totalTransitions: this._state.totalTransitions,
      config: MODE_CONFIGS[to],
    });
  }

  // ── Reset ─────────────────────────────────────────────────────────────

  reset(): void {
    this._state = {
      mode: "NORMAL",
      enteredAt: Date.now(),
      anomalyPressure: 0,
      healthPressure: 0,
      totalTransitions: 0,
      history: [],
    };
  }
}

// ── Export Singleton ─────────────────────────────────────────────────────────

export const GracefulDegradation = new _GracefulDegradation();
