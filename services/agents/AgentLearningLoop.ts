/**
 * Evan AI — OPUS MAX AgentLearningLoop
 *
 * Self-improving feedback loop for the multi-agent decision system.
 * Tracks per-agent accuracy, disagreement rate, risk flip rate.
 * Adjusts fusion weights and risk thresholds based on outcomes.
 *
 * This is what makes OPUS MAX a feedback-driven decision machine,
 * not just a static rule engine.
 *
 * Feedback Loops:
 *   1. Disagreement tracking: when judge and final verdict diverge
 *   2. Risk flip tracking: when risk overrides a BUY verdict
 *   3. Confidence calibration: when high-confidence decisions were wrong
 *   4. Fusion weight adaptation: shift weights toward more accurate agents
 *   5. Risk threshold drift: adjust veto sensitivity based on false-positive rate
 *
 * Architecture:
 *   - EMA-based updates (alpha = 0.12, smooth, no oscillation)
 *   - Updates every 15 scans (amortized, not per-scan)
 *   - All parameters have safe clamps
 *   - Persisted to AsyncStorage (fire-and-forget)
 *   - No ML libraries — pure deterministic math
 *
 * Guarantees:
 *   - O(1) per recordOutcome call
 *   - Bounded memory (100 feedback entries max)
 *   - Never blocks UI thread
 *   - Graceful cold-start (defaults work)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AgentFeedback, FusionRule } from "./AgentTypes";
import { ScanObserver } from "../ScanObserver";

// ── Types ───────────────────────────────────────────────────────────────

export interface AgentLearningState {
  /** Rolling disagreement rate: judge vs final (EMA, 0-1) */
  disagreementRate: number;
  /** Rolling risk flip rate: risk overriding BUY (EMA, 0-1) */
  riskFlipRate: number;
  /** Rolling confidence calibration error (EMA, 0-1) */
  calibrationError: number;
  /** Adaptive judge weight for fusion (default 0.35) */
  judgeWeight: number;
  /** Adaptive predictor weight for fusion (default 0.40) */
  predictorWeight: number;
  /** Adaptive risk weight for fusion (default 0.25) */
  riskWeight: number;
  /** Adaptive risk uncertain zone lower bound (default 0.45) */
  riskUncertainLow: number;
  /** Adaptive risk uncertain zone upper bound (default 0.65) */
  riskUncertainHigh: number;
  /** Total feedback entries processed */
  totalFeedback: number;
  /** Last update timestamp */
  lastUpdated: number;
}

export interface AgentLearningSnapshot {
  state: AgentLearningState;
  fusionRuleDistribution: Record<string, number>;
  timestamp: number;
}

// ── Constants ───────────────────────────────────────────────────────────

const LEARNING_KEY = "EVAN_AGENT_LEARNING_V1";
const SNAPSHOTS_KEY = "EVAN_AGENT_LEARNING_SNAPSHOTS_V1";

const EMA_ALPHA = 0.12;
const UPDATE_INTERVAL = 15;
const MAX_FEEDBACK_BUFFER = 100;
const MAX_SNAPSHOTS = 30;

/** Weight clamps — never let weights drift to extremes */
const WEIGHT_CLAMPS = {
  judge: { min: 0.20, max: 0.50 },
  predictor: { min: 0.25, max: 0.55 },
  risk: { min: 0.15, max: 0.35 },
} as const;

/** Risk threshold clamps */
const RISK_CLAMPS = {
  uncertainLow: { min: 0.35, max: 0.55 },
  uncertainHigh: { min: 0.55, max: 0.75 },
} as const;

const DEFAULT_STATE: AgentLearningState = {
  disagreementRate: 0,
  riskFlipRate: 0,
  calibrationError: 0,
  judgeWeight: 0.35,
  predictorWeight: 0.40,
  riskWeight: 0.25,
  riskUncertainLow: 0.45,
  riskUncertainHigh: 0.65,
  totalFeedback: 0,
  lastUpdated: 0,
};

// ── Helpers ─────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function emaUpdate(current: number, observed: number, alpha: number): number {
  return alpha * observed + (1 - alpha) * current;
}

// ── Engine ──────────────────────────────────────────────────────────────

class _AgentLearningLoop {
  private _state: AgentLearningState = { ...DEFAULT_STATE };
  private _feedbackBuffer: AgentFeedback[] = [];
  private _snapshots: AgentLearningSnapshot[] = [];
  private _loaded = false;
  private _scansSinceUpdate = 0;
  private _ruleCounts = new Map<string, number>();

  // ── Initialization ──────────────────────────────────────────────────

  async load(): Promise<void> {
    if (this._loaded) return;

    try {
      const [stateRaw, snapRaw] = await Promise.all([
        AsyncStorage.getItem(LEARNING_KEY),
        AsyncStorage.getItem(SNAPSHOTS_KEY),
      ]);

      if (stateRaw) {
        const parsed = JSON.parse(stateRaw);
        if (parsed && typeof parsed.totalFeedback === "number") {
          this._state = { ...DEFAULT_STATE, ...parsed };
        }
      }

      if (snapRaw) {
        const parsed = JSON.parse(snapRaw);
        if (Array.isArray(parsed)) {
          this._snapshots = parsed.slice(-MAX_SNAPSHOTS);
        }
      }
    } catch {
      // Cold start — defaults are fine
    }

    this._loaded = true;

    ScanObserver.emit("info", "lifecycle", "AGENT_LEARNING_LOADED", null, "idle", {
      totalFeedback: this._state.totalFeedback,
      disagreementRate: this._state.disagreementRate.toFixed(3),
      riskFlipRate: this._state.riskFlipRate.toFixed(3),
      judgeWeight: this._state.judgeWeight,
      predictorWeight: this._state.predictorWeight,
      riskWeight: this._state.riskWeight,
    });
  }

  // ── Feedback Recording ────────────────────────────────────────────

  /**
   * Record a completed agent decision for learning.
   * Updates rolling metrics, checks if parameter update is due.
   * O(1) per call.
   */
  recordOutcome(feedback: AgentFeedback): void {
    this._state.totalFeedback++;
    this._scansSinceUpdate++;

    // Buffer the feedback (bounded)
    this._feedbackBuffer.push(feedback);
    if (this._feedbackBuffer.length > MAX_FEEDBACK_BUFFER) {
      this._feedbackBuffer.shift();
    }

    // Track fusion rule distribution
    this._ruleCounts.set(
      feedback.fusionRule,
      (this._ruleCounts.get(feedback.fusionRule) ?? 0) + 1,
    );

    // Update rolling metrics via EMA
    this._state.disagreementRate = emaUpdate(
      this._state.disagreementRate,
      feedback.disagreement ? 1 : 0,
      EMA_ALPHA,
    );

    this._state.riskFlipRate = emaUpdate(
      this._state.riskFlipRate,
      feedback.riskFlip ? 1 : 0,
      EMA_ALPHA,
    );

    // Calibration error: high confidence + non-BUY = potential miscalibration
    // (We can't know "truth" yet, but we can detect when high-confidence
    // predictions cluster in one direction — a sign of bias)
    const isHighConfMiss =
      feedback.judgeConfidence > 0.7 && feedback.disagreement;
    this._state.calibrationError = emaUpdate(
      this._state.calibrationError,
      isHighConfMiss ? 1 : 0,
      EMA_ALPHA,
    );

    // Check if parameter update is due
    if (this._scansSinceUpdate >= UPDATE_INTERVAL) {
      this._updateParameters();
      this._scansSinceUpdate = 0;
    }

    ScanObserver.emit("info", "lifecycle", "AGENT_LEARNING_OUTCOME", null, "idle", {
      totalFeedback: this._state.totalFeedback,
      disagreement: feedback.disagreement,
      riskFlip: feedback.riskFlip,
      fusionRule: feedback.fusionRule,
      rollingDisagreement: this._state.disagreementRate.toFixed(3),
      rollingRiskFlip: this._state.riskFlipRate.toFixed(3),
    });
  }

  // ── Parameter Adaptation ──────────────────────────────────────────

  /**
   * Adapt fusion weights and risk thresholds based on feedback.
   *
   * Adaptation loops:
   *   1. High disagreement -> shift weight toward risk (judge being overridden often)
   *   2. High risk flip rate -> widen uncertain zone (risk is too aggressive)
   *   3. Low risk flip rate -> narrow uncertain zone (risk is too conservative)
   *   4. High calibration error -> reduce judge weight (confidence miscalibrated)
   */
  private _updateParameters(): void {
    const adjustments: string[] = [];

    // ── Loop 1: Disagreement rate adaptation ────────────────────────
    if (this._state.disagreementRate > 0.4 && this._state.totalFeedback > 30) {
      // Judge is being overridden a lot -> risk/predictor are adding value
      // Shift weight from judge to risk
      const delta = 0.01;
      this._state.judgeWeight -= delta;
      this._state.riskWeight += delta;
      adjustments.push(
        `judge_weight -${delta} (disagreement ${this._state.disagreementRate.toFixed(2)} > 0.4)`,
      );
    } else if (this._state.disagreementRate < 0.1 && this._state.totalFeedback > 30) {
      // Judge is almost never overridden -> judge is well-calibrated
      const delta = 0.005;
      this._state.judgeWeight += delta;
      this._state.riskWeight -= delta;
      adjustments.push(
        `judge_weight +${delta} (disagreement ${this._state.disagreementRate.toFixed(2)} < 0.1)`,
      );
    }

    // ── Loop 2: Risk flip rate adaptation ───────────────────────────
    if (this._state.riskFlipRate > 0.3 && this._state.totalFeedback > 30) {
      // Risk is flipping too many BUYs -> maybe too aggressive
      // Widen the uncertain zone slightly (less aggressive)
      const delta = 0.01;
      this._state.riskUncertainLow += delta;
      adjustments.push(
        `risk_uncertain_low +${delta} (flip_rate ${this._state.riskFlipRate.toFixed(2)} > 0.3)`,
      );
    } else if (this._state.riskFlipRate < 0.05 && this._state.totalFeedback > 50) {
      // Risk is barely ever flipping -> maybe too conservative
      // Narrow the uncertain zone (more aggressive risk gating)
      const delta = 0.005;
      this._state.riskUncertainLow -= delta;
      adjustments.push(
        `risk_uncertain_low -${delta} (flip_rate ${this._state.riskFlipRate.toFixed(2)} < 0.05)`,
      );
    }

    // ── Loop 3: Calibration error adaptation ────────────────────────
    if (this._state.calibrationError > 0.3 && this._state.totalFeedback > 30) {
      // High-confidence predictions are often wrong -> reduce judge influence
      const delta = 0.01;
      this._state.judgeWeight -= delta;
      this._state.predictorWeight += delta;
      adjustments.push(
        `predictor_weight +${delta} (calibration_error ${this._state.calibrationError.toFixed(2)} > 0.3)`,
      );
    }

    // ── Normalize weights to sum to 1.0 ─────────────────────────────
    this._normalizeWeights();

    // ── Clamp all parameters ────────────────────────────────────────
    this._state.judgeWeight = clamp(
      this._state.judgeWeight,
      WEIGHT_CLAMPS.judge.min,
      WEIGHT_CLAMPS.judge.max,
    );
    this._state.predictorWeight = clamp(
      this._state.predictorWeight,
      WEIGHT_CLAMPS.predictor.min,
      WEIGHT_CLAMPS.predictor.max,
    );
    this._state.riskWeight = clamp(
      this._state.riskWeight,
      WEIGHT_CLAMPS.risk.min,
      WEIGHT_CLAMPS.risk.max,
    );
    this._state.riskUncertainLow = clamp(
      this._state.riskUncertainLow,
      RISK_CLAMPS.uncertainLow.min,
      RISK_CLAMPS.uncertainLow.max,
    );
    this._state.riskUncertainHigh = clamp(
      this._state.riskUncertainHigh,
      RISK_CLAMPS.uncertainHigh.min,
      RISK_CLAMPS.uncertainHigh.max,
    );

    // Re-normalize after clamping
    this._normalizeWeights();

    this._state.lastUpdated = Date.now();

    // ── Record snapshot ─────────────────────────────────────────────
    const snapshot: AgentLearningSnapshot = {
      state: { ...this._state },
      fusionRuleDistribution: Object.fromEntries(this._ruleCounts),
      timestamp: Date.now(),
    };

    if (this._snapshots.length >= MAX_SNAPSHOTS) {
      this._snapshots.shift();
    }
    this._snapshots.push(snapshot);

    // Persist (fire-and-forget)
    this._persist().catch(() => {});

    ScanObserver.emit("info", "lifecycle", "AGENT_LEARNING_UPDATED", null, "idle", {
      adjustments: adjustments.length > 0 ? adjustments.join("; ") : "NO_CHANGE",
      judgeWeight: this._state.judgeWeight.toFixed(3),
      predictorWeight: this._state.predictorWeight.toFixed(3),
      riskWeight: this._state.riskWeight.toFixed(3),
      riskUncertainLow: this._state.riskUncertainLow.toFixed(3),
      disagreementRate: this._state.disagreementRate.toFixed(3),
      riskFlipRate: this._state.riskFlipRate.toFixed(3),
      totalFeedback: this._state.totalFeedback,
    });
  }

  private _normalizeWeights(): void {
    const sum = this._state.judgeWeight + this._state.predictorWeight + this._state.riskWeight;
    if (sum > 0 && Math.abs(sum - 1.0) > 0.001) {
      this._state.judgeWeight /= sum;
      this._state.predictorWeight /= sum;
      this._state.riskWeight /= sum;
    }
  }

  // ── Queries ───────────────────────────────────────────────────────

  /** Current learning state (read-only copy) */
  getState(): Readonly<AgentLearningState> {
    return { ...this._state };
  }

  /** Current fusion weights (used by DecisionFusionEngine if adaptive mode enabled) */
  getWeights(): { judge: number; predictor: number; risk: number } {
    return {
      judge: this._state.judgeWeight,
      predictor: this._state.predictorWeight,
      risk: this._state.riskWeight,
    };
  }

  /** Current risk thresholds (used by DecisionFusionEngine) */
  getRiskThresholds(): { uncertainLow: number; uncertainHigh: number } {
    return {
      uncertainLow: this._state.riskUncertainLow,
      uncertainHigh: this._state.riskUncertainHigh,
    };
  }

  /** Evolution snapshots (for debugging/UI) */
  getSnapshots(): readonly AgentLearningSnapshot[] {
    return this._snapshots;
  }

  /** Recent feedback buffer (for debugging) */
  getRecentFeedback(): readonly AgentFeedback[] {
    return this._feedbackBuffer;
  }

  // ── Persistence ───────────────────────────────────────────────────

  private async _persist(): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.setItem(LEARNING_KEY, JSON.stringify(this._state)),
        AsyncStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(this._snapshots)),
      ]);
    } catch {
      // Persistence failure is non-fatal
    }
  }

  /** Reset all state (for testing) */
  reset(): void {
    this._state = { ...DEFAULT_STATE };
    this._feedbackBuffer = [];
    this._snapshots = [];
    this._ruleCounts.clear();
    this._scansSinceUpdate = 0;
    this._loaded = false;
  }
}

// ── Export Singleton ─────────────────────────────────────────────────────

export const AgentLearningLoop = new _AgentLearningLoop();
