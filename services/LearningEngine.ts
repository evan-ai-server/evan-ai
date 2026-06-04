/**
 * Evan AI — LearningEngine (OPUS 4.8 — Predictive Control Layer)
 *
 * Online learning loop that continuously improves the predictive pipeline.
 * Tracks prediction accuracy, prewarm hit rate, and user engagement signals.
 * Updates engine parameters using exponential moving averages (EMA).
 *
 * Feedback Loops:
 *   1. Prediction accuracy → category affinity weight
 *   2. Prewarm hit rate → prewarm confidence threshold
 *   3. Scan latency trends → timeout budget calibration
 *
 * Architecture:
 *   - EMA-based parameter updates (α = 0.15, smooth, no oscillation)
 *   - Updates every 10 scans (amortized, not per-scan)
 *   - All parameters have safe clamps (never drift to dangerous extremes)
 *   - Persisted to AsyncStorage (fire-and-forget)
 *   - Reads ScanObserver latency data (no duplication)
 *
 * Guarantees:
 *   - O(1) per recordScanOutcome call
 *   - Bounded memory (50 snapshots max, 1 state object)
 *   - Never blocks UI thread (async persistence only)
 *   - Graceful cold-start (defaults work fine with 0 data)
 *   - No ML libraries — pure deterministic math
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScanObserver } from "./ScanObserver";
import { PredictiveEngine } from "./PredictiveEngine";

// ── Types ───────────────────────────────────────────────────────────────

export interface LearningState {
  /** Rolling prediction accuracy (EMA, 0–1) */
  predictionAccuracy: number;
  /** Rolling prewarm cache hit rate (EMA, 0–1) */
  prewarmHitRate: number;
  /** Total scans processed by learning engine */
  totalScans: number;
  /** Total correct predictions */
  totalCorrectPredictions: number;
  /** Adaptive prewarm confidence threshold */
  prewarmThreshold: number;
  /** Adaptive impulse detection window (ms) */
  impulseWindowMs: number;
  /** Category affinity weight (0–1) */
  categoryAffinityWeight: number;
  /** Last parameter update timestamp */
  lastUpdated: number;
}

export interface LearningSnapshot {
  state: LearningState;
  avgLatencyMs: number;
  intentDistribution: Record<string, number>;
  timestamp: number;
}

// ── Constants ───────────────────────────────────────────────────────────

const LEARNING_KEY = "EVAN_LEARNING_STATE_V1";
const SNAPSHOTS_KEY = "EVAN_LEARNING_SNAPSHOTS_V1";

const EMA_ALPHA = 0.15;
const UPDATE_INTERVAL = 10;
const MAX_SNAPSHOTS = 50;

/** Parameter safety clamps — never let values drift to dangerous extremes */
const CLAMPS = {
  prewarmThreshold: { min: 0.3, max: 0.9 },
  impulseWindowMs: { min: 1_500, max: 6_000 },
  categoryAffinityWeight: { min: 0.1, max: 0.6 },
} as const;

const DEFAULT_STATE: LearningState = {
  predictionAccuracy: 0,
  prewarmHitRate: 0,
  totalScans: 0,
  totalCorrectPredictions: 0,
  prewarmThreshold: 0.6,
  impulseWindowMs: 3_000,
  categoryAffinityWeight: 0.3,
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

class _LearningEngine {
  private _state: LearningState = { ...DEFAULT_STATE };
  private _snapshots: LearningSnapshot[] = [];
  private _loaded = false;
  private _intentCounts = new Map<string, number>();
  private _scansSinceLastUpdate = 0;

  // ── Initialization ──────────────────────────────────────────────────

  /**
   * Load persisted learning state from AsyncStorage.
   * Safe to call multiple times (idempotent).
   */
  async load(): Promise<void> {
    if (this._loaded) return;

    try {
      const [stateRaw, snapRaw] = await Promise.all([
        AsyncStorage.getItem(LEARNING_KEY),
        AsyncStorage.getItem(SNAPSHOTS_KEY),
      ]);

      if (stateRaw) {
        const parsed = JSON.parse(stateRaw);
        if (parsed && typeof parsed.totalScans === "number") {
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

    ScanObserver.emit("info", "lifecycle", "LEARNING_ENGINE_LOADED", null, "idle", {
      totalScans: this._state.totalScans,
      predictionAccuracy: this._state.predictionAccuracy.toFixed(3),
      prewarmThreshold: this._state.prewarmThreshold,
      categoryAffinityWeight: this._state.categoryAffinityWeight,
      snapshotCount: this._snapshots.length,
    });
  }

  // ── Outcome Recording ─────────────────────────────────────────────

  /**
   * Record a completed scan for learning.
   *
   * Updates rolling metrics (EMA), checks if parameter update is due,
   * and triggers adaptation every UPDATE_INTERVAL scans.
   *
   * O(1) per call — bounded state updates, no loops.
   */
  recordScanOutcome(
    input: { category: string | null; scannedPrice: number | null },
    intentType: string,
    prewarmHit: boolean,
  ): void {
    this._state.totalScans++;
    this._scansSinceLastUpdate++;

    // Track intent distribution (for snapshot diagnostics)
    this._intentCounts.set(
      intentType,
      (this._intentCounts.get(intentType) ?? 0) + 1,
    );

    // Evaluate prediction accuracy
    const predictionCorrect = PredictiveEngine.evaluatePrediction(input);
    if (predictionCorrect) this._state.totalCorrectPredictions++;

    // Update rolling metrics via EMA
    this._state.predictionAccuracy = emaUpdate(
      this._state.predictionAccuracy,
      predictionCorrect ? 1 : 0,
      EMA_ALPHA,
    );

    this._state.prewarmHitRate = emaUpdate(
      this._state.prewarmHitRate,
      prewarmHit ? 1 : 0,
      EMA_ALPHA,
    );

    // Check if parameter update is due
    if (this._scansSinceLastUpdate >= UPDATE_INTERVAL) {
      this._updateParameters();
      this._scansSinceLastUpdate = 0;
    }

    ScanObserver.emit("info", "lifecycle", "LEARNING_OUTCOME", null, "idle", {
      totalScans: this._state.totalScans,
      predictionCorrect,
      prewarmHit,
      rollingAccuracy: this._state.predictionAccuracy.toFixed(3),
      rollingHitRate: this._state.prewarmHitRate.toFixed(3),
    });
  }

  // ── Parameter Adaptation ──────────────────────────────────────────

  /**
   * Update engine parameters based on accumulated feedback.
   *
   * Three adaptation loops:
   *   1. Prewarm threshold: low hit rate → raise (be selective)
   *   2. Category weight: high accuracy → trust more
   *   3. Impulse window: (future — currently static)
   *
   * All updates are clamped to safe ranges.
   */
  private _updateParameters(): void {
    const adjustments: string[] = [];

    // ── Loop 1: Prewarm threshold adaptation ────────────────────────
    if (this._state.prewarmHitRate < 0.2 && this._state.totalScans > 20) {
      // Low hit rate → raise threshold (be more selective about prewarming)
      const delta = 0.05;
      this._state.prewarmThreshold = clamp(
        this._state.prewarmThreshold + delta,
        CLAMPS.prewarmThreshold.min,
        CLAMPS.prewarmThreshold.max,
      );
      adjustments.push(
        `prewarm_threshold +${delta} (hit_rate ${this._state.prewarmHitRate.toFixed(2)} < 0.2)`,
      );
    } else if (this._state.prewarmHitRate > 0.6) {
      // High hit rate → lower threshold (prewarm more aggressively)
      const delta = 0.03;
      this._state.prewarmThreshold = clamp(
        this._state.prewarmThreshold - delta,
        CLAMPS.prewarmThreshold.min,
        CLAMPS.prewarmThreshold.max,
      );
      adjustments.push(
        `prewarm_threshold -${delta} (hit_rate ${this._state.prewarmHitRate.toFixed(2)} > 0.6)`,
      );
    }

    // ── Loop 2: Category affinity weight adaptation ─────────────────
    if (this._state.predictionAccuracy > 0.6) {
      // Predictions are accurate → trust category signal more
      const delta = 0.02;
      this._state.categoryAffinityWeight = clamp(
        this._state.categoryAffinityWeight + delta,
        CLAMPS.categoryAffinityWeight.min,
        CLAMPS.categoryAffinityWeight.max,
      );
      adjustments.push(
        `category_weight +${delta} (accuracy ${this._state.predictionAccuracy.toFixed(2)} > 0.6)`,
      );
    } else if (
      this._state.predictionAccuracy < 0.3 &&
      this._state.totalScans > 30
    ) {
      // Predictions are bad → trust category signal less
      const delta = 0.02;
      this._state.categoryAffinityWeight = clamp(
        this._state.categoryAffinityWeight - delta,
        CLAMPS.categoryAffinityWeight.min,
        CLAMPS.categoryAffinityWeight.max,
      );
      adjustments.push(
        `category_weight -${delta} (accuracy ${this._state.predictionAccuracy.toFixed(2)} < 0.3)`,
      );
    }

    this._state.lastUpdated = Date.now();

    // ── Record snapshot ─────────────────────────────────────────────
    const avgLatencies = ScanObserver.getAverageLatencies();

    const snapshot: LearningSnapshot = {
      state: { ...this._state },
      avgLatencyMs: avgLatencies.totalScanDuration ?? 0,
      intentDistribution: Object.fromEntries(this._intentCounts),
      timestamp: Date.now(),
    };

    if (this._snapshots.length >= MAX_SNAPSHOTS) {
      this._snapshots.shift();
    }
    this._snapshots.push(snapshot);

    // Persist (fire-and-forget, non-blocking)
    this._persist().catch(() => {});

    ScanObserver.emit("info", "lifecycle", "LEARNING_PARAMETERS_UPDATED", null, "idle", {
      adjustments:
        adjustments.length > 0 ? adjustments.join("; ") : "NO_CHANGE",
      prewarmThreshold: this._state.prewarmThreshold,
      categoryAffinityWeight: this._state.categoryAffinityWeight,
      predictionAccuracy: this._state.predictionAccuracy.toFixed(3),
      prewarmHitRate: this._state.prewarmHitRate.toFixed(3),
      totalScans: this._state.totalScans,
    });
  }

  // ── Queries ───────────────────────────────────────────────────────

  /** Current learning state (read-only copy) */
  getState(): Readonly<LearningState> {
    return { ...this._state };
  }

  /** Evolution snapshots (for debugging/UI) */
  getSnapshots(): readonly LearningSnapshot[] {
    return this._snapshots;
  }

  /** Adaptive prewarm confidence threshold (used by orchestrator) */
  getPrewarmThreshold(): number {
    return this._state.prewarmThreshold;
  }

  /** Category affinity weight (used by PredictiveEngine) */
  getCategoryAffinityWeight(): number {
    return this._state.categoryAffinityWeight;
  }

  // ── Persistence ───────────────────────────────────────────────────

  private async _persist(): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.setItem(LEARNING_KEY, JSON.stringify(this._state)),
        AsyncStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(this._snapshots)),
      ]);
    } catch {
      // Persistence failure is non-fatal — state lives in memory
    }
  }

  /** Reset all state (for testing) */
  reset(): void {
    this._state = { ...DEFAULT_STATE };
    this._snapshots = [];
    this._intentCounts.clear();
    this._scansSinceLastUpdate = 0;
    this._loaded = false;
  }
}

// ── Export Singleton ─────────────────────────────────────────────────────

export const LearningEngine = new _LearningEngine();
