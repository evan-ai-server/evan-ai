/**
 * Evan AI — SelfHealingController (Automated Recovery) [OPUS 4.8 Resilience]
 *
 * Reacts to anomalies detected by AnomalyDetector and executes
 * recovery strategies to restore pipeline health without human intervention.
 *
 * Recovery Strategies (ordered by severity):
 *   1. SOFT_RESET    — Cancel active contract, reset phase to idle
 *   2. ROLLBACK      — Restore from last known-good snapshot
 *   3. FULL_RESTART  — Abort everything, flush queue, full reset
 *   4. FALLBACK_MODE — Switch degradation mode (reduce pipeline complexity)
 *
 * Decision Tree:
 *   anomaly.severity === "low"      → FALLBACK_MODE (nudge toward DEGRADED)
 *   anomaly.severity === "medium"   → SOFT_RESET
 *   anomaly.severity === "high"     → ROLLBACK
 *   anomaly.severity === "critical" → FULL_RESTART
 *   anomaly.type === "TRANSITION"   → ROLLBACK (always — state corruption)
 *   anomaly.type === "RESOURCE"     → FALLBACK_MODE (reduce load)
 *
 * Architecture:
 *   - Subscribes to AnomalyDetector events
 *   - All healing goes through ScanGovernor (preserves invariants)
 *   - Cooldown prevents thrashing (no healing within 5s of last)
 *   - Max consecutive healings capped (circuit breaker)
 *   - Every action logged to ForensicLog
 *   - Snapshots captured before and after healing
 *
 * Guarantees:
 *   - Never violates core invariants (single scan, valid transitions)
 *   - Never heals during idle/complete (no-op if pipeline healthy)
 *   - Bounded: max 3 healings per scan before circuit breaks
 *   - Deterministic: same anomaly → same recovery action
 */

import type { ScanPhase } from "../hooks/useEvanBrain";
import { useEvanBrain } from "../hooks/useEvanBrain";
import { ScanGovernor } from "./ScanGovernor";
import { PhaseContractManager } from "./PhaseContract";
import { ScanScheduler } from "./ScanScheduler";
import { ScanObserver } from "./ScanObserver";
import { SnapshotManager } from "./SnapshotManager";
import { ForensicLog } from "./ForensicLog";
import { GracefulDegradation } from "./GracefulDegradation";
import { AnomalyDetector, type Anomaly, type AnomalySeverity } from "./AnomalyDetector";

// ── Types ──────────────────────────────────────────────────────────────────

export type HealingStrategy =
  | "SOFT_RESET"
  | "ROLLBACK"
  | "FULL_RESTART"
  | "FALLBACK_MODE";

export interface HealingAction {
  /** Unique action ID */
  id: string;
  /** Strategy applied */
  strategy: HealingStrategy;
  /** Anomaly that triggered the healing */
  triggeredBy: Anomaly;
  /** Scan that was active when healing started */
  scanId: string | null;
  /** Phase when healing started */
  phaseBefore: ScanPhase;
  /** Phase after healing completed */
  phaseAfter: ScanPhase;
  /** Whether healing succeeded */
  success: boolean;
  /** Timestamp */
  timestamp: number;
  /** Duration of healing (ms) */
  durationMs: number;
  /** Snapshot ID captured before healing */
  preSnapshotId: string | null;
  /** Snapshot ID captured after healing */
  postSnapshotId: string | null;
}

export interface HealingState {
  /** Whether healing is currently in progress */
  isHealing: boolean;
  /** Total healing actions taken */
  totalActions: number;
  /** Consecutive healings for current scan */
  consecutiveForScan: number;
  /** Last healing timestamp */
  lastHealingAt: number;
  /** Circuit breaker tripped */
  circuitBroken: boolean;
  /** History of healing actions */
  history: HealingAction[];
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Minimum time between healing actions (ms) */
const COOLDOWN_MS = 5_000;

/** Max consecutive healings per scan before circuit breaks */
const MAX_CONSECUTIVE = 3;

/** Max healing history entries */
const MAX_HISTORY = 50;

/** Phases that should not trigger healing (already in safe state) */
const SAFE_PHASES: ScanPhase[] = ["idle", "complete"];

let _healSeq = 0;
function nextHealId(): string {
  _healSeq += 1;
  return `heal_${Date.now()}_${_healSeq}`;
}

// ── Decision Tree ──────────────────────────────────────────────────────────

/**
 * Select recovery strategy based on anomaly characteristics.
 * Pure function — no side effects.
 */
function selectStrategy(anomaly: Anomaly, currentPhase: ScanPhase): HealingStrategy {
  // Transition anomalies = state corruption → always rollback
  if (anomaly.type === "TRANSITION") return "ROLLBACK";

  // Resource pressure → reduce pipeline complexity
  if (anomaly.type === "RESOURCE") return "FALLBACK_MODE";

  // Severity-based decision tree
  switch (anomaly.severity) {
    case "critical":
      return "FULL_RESTART";
    case "high":
      return "ROLLBACK";
    case "medium":
      return "SOFT_RESET";
    case "low":
      return "FALLBACK_MODE";
    default:
      return "SOFT_RESET";
  }
}

// ── SelfHealingController ──────────────────────────────────────────────────

class _SelfHealingController {
  private _state: HealingState = {
    isHealing: false,
    totalActions: 0,
    consecutiveForScan: 0,
    lastHealingAt: 0,
    circuitBroken: false,
    history: [],
  };
  /** Track which scanId the consecutive counter is for */
  private _consecutiveScanId: string | null = null;
  /** AnomalyDetector subscription */
  private _unsubscribe: (() => void) | null = null;

  // ── Lifecycle ─────────────────────────────────────────────────────────

  /**
   * Start listening to anomalies and auto-healing.
   */
  start(): void {
    if (this._unsubscribe) return;

    this._unsubscribe = AnomalyDetector.onAnomaly((anomaly) => {
      this._handleAnomaly(anomaly);
    });
  }

  /** Stop auto-healing. */
  stop(): void {
    this._unsubscribe?.();
    this._unsubscribe = null;
  }

  // ── Anomaly Handler ───────────────────────────────────────────────────

  private _handleAnomaly(anomaly: Anomaly): void {
    const brain = useEvanBrain.getState();
    const currentPhase = brain.phase;
    const scanId = brain.scanId;

    // ── Guard: don't heal if already in safe state ──────────────────
    if (SAFE_PHASES.includes(currentPhase)) return;

    // ── Guard: don't heal if already healing ────────────────────────
    if (this._state.isHealing) return;

    // ── Guard: cooldown ─────────────────────────────────────────────
    if (Date.now() - this._state.lastHealingAt < COOLDOWN_MS) return;

    // ── Guard: circuit breaker ──────────────────────────────────────
    if (this._consecutiveScanId === scanId) {
      if (this._state.consecutiveForScan >= MAX_CONSECUTIVE) {
        if (!this._state.circuitBroken) {
          this._state.circuitBroken = true;
          ScanObserver.emit("critical", "lifecycle", "HEALING_CIRCUIT_BROKEN", scanId, currentPhase, {
            consecutiveHealings: this._state.consecutiveForScan,
            max: MAX_CONSECUTIVE,
            anomaly: anomaly.description,
          });
          ForensicLog.recordHealing(scanId, currentPhase, "CIRCUIT_BREAKER", "failed",
            `Max ${MAX_CONSECUTIVE} consecutive healings reached — manual intervention needed`);
        }
        return;
      }
    } else {
      // New scan — reset consecutive counter
      this._consecutiveScanId = scanId;
      this._state.consecutiveForScan = 0;
      this._state.circuitBroken = false;
    }

    // ── Select strategy ─────────────────────────────────────────────
    const strategy = selectStrategy(anomaly, currentPhase);

    // ── Execute healing ─────────────────────────────────────────────
    this._execute(strategy, anomaly, scanId, currentPhase);
  }

  // ── Strategy Execution ────────────────────────────────────────────────

  private _execute(
    strategy: HealingStrategy,
    anomaly: Anomaly,
    scanId: string | null,
    phaseBefore: ScanPhase,
  ): void {
    this._state.isHealing = true;
    const startTime = Date.now();

    // Capture pre-healing snapshot
    let preSnapshotId: string | null = null;
    try {
      const preSnap = SnapshotManager.capture("healing_pre");
      preSnapshotId = preSnap.id;
    } catch {}

    ForensicLog.recordHealing(scanId, phaseBefore, strategy, "started", anomaly.description);

    ScanObserver.emit("warn", "lifecycle", "HEALING_STARTED", scanId, phaseBefore, {
      strategy,
      anomalyId: anomaly.id,
      anomalyType: anomaly.type,
      anomalySeverity: anomaly.severity,
      preSnapshotId,
    });

    let success = false;

    try {
      switch (strategy) {
        case "SOFT_RESET":
          success = this._softReset(scanId);
          break;
        case "ROLLBACK":
          success = this._rollback(scanId);
          break;
        case "FULL_RESTART":
          success = this._fullRestart(scanId);
          break;
        case "FALLBACK_MODE":
          success = this._fallbackMode(anomaly);
          break;
      }
    } catch (err: any) {
      ScanObserver.emit("error", "lifecycle", "HEALING_EXCEPTION", scanId, phaseBefore, {
        strategy,
        error: err?.message ?? "unknown",
      });
    }

    // Capture post-healing snapshot
    let postSnapshotId: string | null = null;
    try {
      const postSnap = SnapshotManager.capture("healing_post");
      postSnapshotId = postSnap.id;
    } catch {}

    const phaseAfter = useEvanBrain.getState().phase;
    const durationMs = Date.now() - startTime;

    // Record action
    const action: HealingAction = {
      id: nextHealId(),
      strategy,
      triggeredBy: anomaly,
      scanId,
      phaseBefore,
      phaseAfter,
      success,
      timestamp: startTime,
      durationMs,
      preSnapshotId,
      postSnapshotId,
    };

    if (this._state.history.length >= MAX_HISTORY) {
      this._state.history.shift();
    }
    this._state.history.push(action);

    this._state.totalActions++;
    this._state.consecutiveForScan++;
    this._state.lastHealingAt = Date.now();
    this._state.isHealing = false;

    ForensicLog.recordHealing(
      scanId,
      phaseAfter,
      strategy,
      success ? "completed" : "failed",
      `${phaseBefore} → ${phaseAfter} (${durationMs}ms)`,
    );

    ScanObserver.emit(
      success ? "info" : "error",
      "lifecycle",
      success ? "HEALING_COMPLETED" : "HEALING_FAILED",
      scanId,
      phaseAfter,
      {
        strategy,
        phaseBefore,
        phaseAfter,
        durationMs,
        postSnapshotId,
        consecutiveForScan: this._state.consecutiveForScan,
      },
    );

    // If healing succeeded, notify GracefulDegradation of healthy state
    if (success && phaseAfter === "idle") {
      GracefulDegradation.recordHealthy();
    }
  }

  // ── Recovery Strategies ───────────────────────────────────────────────

  /**
   * SOFT_RESET: Cancel active contract, reset scan to idle.
   * Lightest recovery — just rewinds the pipeline to start.
   */
  private _softReset(scanId: string | null): boolean {
    PhaseContractManager.exit();

    if (scanId) {
      ScanGovernor.setError(scanId, "Self-healing: soft reset triggered");
    }
    ScanGovernor.resetScan();
    ScanScheduler.scanFinished();

    return useEvanBrain.getState().phase === "idle";
  }

  /**
   * ROLLBACK: Restore from the last known-good snapshot.
   * Used when state corruption is detected.
   */
  private _rollback(scanId: string | null): boolean {
    const lastGood = SnapshotManager.getLastGood();

    if (!lastGood) {
      // No good snapshot available — fall back to soft reset
      return this._softReset(scanId);
    }

    PhaseContractManager.exit();

    // We cannot directly restore brain state from snapshot because
    // the Zustand store actions enforce invariants. Instead, we
    // reset to idle (the known-good state) and let the pipeline restart.
    if (scanId) {
      ScanGovernor.markAborted(scanId);
      ScanGovernor.setError(scanId, "Self-healing: rollback to last known-good state");
    }
    ScanGovernor.resetScan();
    ScanScheduler.scanFinished();

    return useEvanBrain.getState().phase === "idle";
  }

  /**
   * FULL_RESTART: Nuclear option — abort everything, flush queue, full reset.
   * Used for critical anomalies where the system is deeply compromised.
   */
  private _fullRestart(scanId: string | null): boolean {
    // Cancel all contracts
    PhaseContractManager.exit();

    // Mark scan as aborted
    if (scanId) {
      ScanGovernor.markAborted(scanId);
    }

    // Flush the entire scan queue
    ScanScheduler.flush();

    // Reset Governor state
    ScanGovernor.resetScan();
    ScanScheduler.scanFinished();

    return useEvanBrain.getState().phase === "idle";
  }

  /**
   * FALLBACK_MODE: Don't reset the scan — just escalate degradation mode.
   * Used for resource pressure or low-severity anomalies.
   */
  private _fallbackMode(anomaly: Anomaly): boolean {
    const currentMode = GracefulDegradation.getMode();

    // Already in maximum degradation — escalate to soft reset
    if (currentMode === "SAFE_MODE") {
      return this._softReset(anomaly.scanId);
    }

    GracefulDegradation.recordAnomaly(
      `Self-healing fallback: ${anomaly.description}`,
    );

    // Record as success — mode change is the action, not a pipeline reset
    return true;
  }

  // ── Queries ───────────────────────────────────────────────────────────

  /** Current healing state */
  getState(): Readonly<HealingState> {
    return { ...this._state, history: [...this._state.history] };
  }

  /** Healing history */
  getHistory(): readonly HealingAction[] {
    return this._state.history;
  }

  /** Whether the circuit breaker is tripped */
  isCircuitBroken(): boolean {
    return this._state.circuitBroken;
  }

  /** Success rate of healing actions */
  getSuccessRate(): number {
    if (this._state.history.length === 0) return 1;
    const successes = this._state.history.filter((a) => a.success).length;
    return successes / this._state.history.length;
  }

  // ── Reset ─────────────────────────────────────────────────────────────

  reset(): void {
    this.stop();
    this._state = {
      isHealing: false,
      totalActions: 0,
      consecutiveForScan: 0,
      lastHealingAt: 0,
      circuitBroken: false,
      history: [],
    };
    this._consecutiveScanId = null;
  }
}

// ── Export Singleton ─────────────────────────────────────────────────────────

export const SelfHealingController = new _SelfHealingController();
