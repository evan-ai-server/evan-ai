/**
 * Evan AI — Self-Improving Threshold Tuning Service (SITT)
 *
 * Closed-loop feedback system that adjusts DealEngine thresholds
 * based on REALIZED profit — not predictions, not estimates.
 *
 * Core loop:
 *   1. User scans → DealEngine gives verdict using current thresholds
 *   2. User buys → User sells → MarketTruthService records outcome
 *   3. Every 25 flips → TuningService detects bias and adjusts thresholds
 *   4. Next scan uses updated thresholds → loop closes
 *
 * No ML libraries. Deterministic math. Transparent. Auditable.
 *
 * Persistence: AsyncStorage for thresholds + evolution history.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  MarketTruthService,
  type RealFlipOutcome,
  type FlipPerformance,
} from "./MarketTruthService";

// ── Types ────────────────────────────────────────────────────────────────────

export interface DynamicThresholds {
  /** Ratio threshold for BUY verdict (default 1.5) */
  buyRatio: number;
  /** Ratio threshold below which → PASS (default 1.2) */
  passRatio: number;
  /** Minimum profit after fees to keep BUY (default 5) */
  minProfit: number;
  /** Risk tolerance 0–1 (default 0.5) — higher = more aggressive */
  riskTolerance: number;
}

export interface ThresholdSnapshot {
  thresholds: DynamicThresholds;
  winRate: number;
  avgROI: number;
  avgProfit: number;
  avgHoldTimeHours: number;
  totalFlips: number;
  adjustment: string;
  timestamp: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const THRESHOLDS_KEY = "EVAN_DYNAMIC_THRESHOLDS_V1";
const EVOLUTION_KEY = "EVAN_THRESHOLD_EVOLUTION_V1";

/** Run tuning every N realized flips */
const TUNING_INTERVAL = 25;

/** Maximum evolution history entries */
const MAX_EVOLUTION_ENTRIES = 100;

/** Clamps — never let thresholds drift to dangerous extremes */
const CLAMP = {
  buyRatio:      { min: 1.15, max: 2.5 },
  passRatio:     { min: 1.0,  max: 2.0 },
  minProfit:     { min: 2,    max: 25 },
  riskTolerance: { min: 0.1,  max: 0.9 },
} as const;

/** Default thresholds — matches current hardcoded dealEngine values */
const DEFAULT_THRESHOLDS: DynamicThresholds = {
  buyRatio: 1.5,
  passRatio: 1.2,
  minProfit: 5,
  riskTolerance: 0.5,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Sigmoid confidence weight.
 * Prevents early-data volatility: few flips → weak influence, many → strong.
 * W = 1 / (1 + e^(-n/30))
 */
function confidenceWeight(n: number): number {
  return 1 / (1 + Math.exp(-n / 30));
}

// ── Service ──────────────────────────────────────────────────────────────────

class _TuningService {
  private _thresholds: DynamicThresholds = { ...DEFAULT_THRESHOLDS };
  private _evolution: ThresholdSnapshot[] = [];
  private _loaded = false;
  private _lastTunedAtFlipCount = 0;
  private _unsubscribe: (() => void) | null = null;

  // ── Initialization ────────────────────────────────────────────────────────

  async load(): Promise<void> {
    if (this._loaded) return;

    try {
      const [tRaw, eRaw] = await Promise.all([
        AsyncStorage.getItem(THRESHOLDS_KEY),
        AsyncStorage.getItem(EVOLUTION_KEY),
      ]);

      if (tRaw) {
        const parsed = JSON.parse(tRaw);
        if (parsed && typeof parsed.buyRatio === "number") {
          this._thresholds = parsed;
        }
      }

      if (eRaw) {
        const parsed = JSON.parse(eRaw);
        if (Array.isArray(parsed)) {
          this._evolution = parsed.slice(-MAX_EVOLUTION_ENTRIES);
        }
      }
    } catch {}

    // Track where we last tuned so we know when the next interval hits
    this._lastTunedAtFlipCount = MarketTruthService.getBufferSize();

    // Subscribe to new outcomes — check if tuning is due after each flip
    this._unsubscribe = MarketTruthService.onOutcomeRecorded(
      (perf: FlipPerformance) => {
        this._checkAndTune(perf);
      }
    );

    this._loaded = true;

    console.log(
      `[SITT] Loaded thresholds: buyRatio=${this._thresholds.buyRatio.toFixed(2)}, ` +
      `passRatio=${this._thresholds.passRatio.toFixed(2)}, ` +
      `minProfit=$${this._thresholds.minProfit.toFixed(0)}, ` +
      `riskTolerance=${this._thresholds.riskTolerance.toFixed(2)}. ` +
      `Evolution history: ${this._evolution.length} snapshots.`
    );
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Current dynamic thresholds (read-only copy) */
  getThresholds(): Readonly<DynamicThresholds> {
    return { ...this._thresholds };
  }

  /** Full evolution history for debugging / UI */
  getEvolution(): readonly ThresholdSnapshot[] {
    return this._evolution;
  }

  /** Force a manual tune (e.g. from a debug menu) */
  forceTune(): ThresholdSnapshot | null {
    const perf = MarketTruthService.computePerformance();
    if (perf.totalFlips < 5) return null; // not enough data
    return this._runTuning(perf);
  }

  /** Reset thresholds to defaults (e.g. from settings) */
  async resetToDefaults(): Promise<void> {
    this._thresholds = { ...DEFAULT_THRESHOLDS };
    this._lastTunedAtFlipCount = 0;
    await this._persistThresholds();

    const snapshot: ThresholdSnapshot = {
      thresholds: { ...this._thresholds },
      winRate: 0,
      avgROI: 0,
      avgProfit: 0,
      avgHoldTimeHours: 0,
      totalFlips: 0,
      adjustment: "MANUAL_RESET",
      timestamp: Date.now(),
    };
    this._evolution.push(snapshot);
    await this._persistEvolution();

    console.log("[THRESHOLD_EVOLUTION] Manual reset to defaults.");
  }

  // ── Core tuning logic ─────────────────────────────────────────────────────

  private _checkAndTune(perf: FlipPerformance): void {
    const currentCount = perf.totalFlips;
    const flipsSinceLastTune = currentCount - this._lastTunedAtFlipCount;

    if (flipsSinceLastTune >= TUNING_INTERVAL) {
      this._runTuning(perf);
    }
  }

  private _runTuning(perf: FlipPerformance): ThresholdSnapshot {
    const flips = MarketTruthService.getBuffer();
    const n = flips.length;
    const W = confidenceWeight(n);
    const adjustments: string[] = [];

    const before = { ...this._thresholds };

    // ── STEP A: Detect system bias ──────────────────────────────────────

    // Aggression correction: too many false positives
    if (perf.winRate < 0.4) {
      const delta = 0.05 * W;
      this._thresholds.buyRatio += delta;
      this._thresholds.passRatio += 0.03 * W;
      adjustments.push(
        `TIGHTEN: winRate ${(perf.winRate * 100).toFixed(0)}% < 40% → ` +
        `buyRatio +${delta.toFixed(3)}`
      );
    }

    // Opportunity correction: leaving money on the table
    if (perf.avgROI > 0.4 && perf.winRate > 0.7) {
      const delta = 0.05 * W;
      this._thresholds.buyRatio -= delta;
      this._thresholds.passRatio -= 0.02 * W;
      adjustments.push(
        `LOOSEN: avgROI ${(perf.avgROI * 100).toFixed(0)}% > 40% & ` +
        `winRate ${(perf.winRate * 100).toFixed(0)}% > 70% → ` +
        `buyRatio -${delta.toFixed(3)}`
      );
    }

    // Volume correction: high profit but low volume
    if (perf.avgProfit > 20 && n < 50) {
      const delta = 1 * W;
      this._thresholds.minProfit -= delta;
      adjustments.push(
        `VOLUME: avgProfit $${perf.avgProfit.toFixed(0)} > $20 & ` +
        `only ${n} flips → minProfit -$${delta.toFixed(1)}`
      );
    }

    // ── STEP B: Market regime detection (hold time) ─────────────────────

    if (this._evolution.length > 0) {
      const lastSnap = this._evolution[this._evolution.length - 1];
      if (lastSnap.avgHoldTimeHours > 0 && perf.avgHoldTimeHours > 0) {
        const holdTimeChange =
          (perf.avgHoldTimeHours - lastSnap.avgHoldTimeHours) /
          lastSnap.avgHoldTimeHours;

        // If hold time increased >20%, market is cooling → raise minProfit
        if (holdTimeChange > 0.2) {
          const delta = 1.5 * W;
          this._thresholds.minProfit += delta;
          adjustments.push(
            `REGIME: holdTime +${(holdTimeChange * 100).toFixed(0)}% → ` +
            `minProfit +$${delta.toFixed(1)} (slower market)`
          );
        }

        // If hold time decreased >20%, market is heating → can loosen
        if (holdTimeChange < -0.2) {
          const delta = 0.5 * W;
          this._thresholds.minProfit -= delta;
          adjustments.push(
            `REGIME: holdTime ${(holdTimeChange * 100).toFixed(0)}% → ` +
            `minProfit -$${delta.toFixed(1)} (faster market)`
          );
        }
      }
    }

    // ── STEP C: Clamp all thresholds to safe ranges ─────────────────────

    this._thresholds.buyRatio = clamp(
      this._thresholds.buyRatio,
      CLAMP.buyRatio.min,
      CLAMP.buyRatio.max
    );
    this._thresholds.passRatio = clamp(
      this._thresholds.passRatio,
      CLAMP.passRatio.min,
      CLAMP.passRatio.max
    );
    this._thresholds.minProfit = clamp(
      this._thresholds.minProfit,
      CLAMP.minProfit.min,
      CLAMP.minProfit.max
    );
    this._thresholds.riskTolerance = clamp(
      this._thresholds.riskTolerance,
      CLAMP.riskTolerance.min,
      CLAMP.riskTolerance.max
    );

    // Invariant: passRatio must always be < buyRatio
    if (this._thresholds.passRatio >= this._thresholds.buyRatio) {
      this._thresholds.passRatio = this._thresholds.buyRatio - 0.1;
    }

    // ── STEP D: Record evolution snapshot ───────────────────────────────

    const adjustmentStr =
      adjustments.length > 0 ? adjustments.join("; ") : "NO_CHANGE";

    const snapshot: ThresholdSnapshot = {
      thresholds: { ...this._thresholds },
      winRate: perf.winRate,
      avgROI: perf.avgROI,
      avgProfit: perf.avgProfit,
      avgHoldTimeHours: perf.avgHoldTimeHours,
      totalFlips: perf.totalFlips,
      adjustment: adjustmentStr,
      timestamp: Date.now(),
    };

    this._evolution.push(snapshot);
    if (this._evolution.length > MAX_EVOLUTION_ENTRIES) {
      this._evolution.splice(0, this._evolution.length - MAX_EVOLUTION_ENTRIES);
    }

    this._lastTunedAtFlipCount = perf.totalFlips;

    // Persist (fire-and-forget)
    this._persistThresholds().catch(() => {});
    this._persistEvolution().catch(() => {});

    // Log evolution event
    console.log(
      `[THRESHOLD_EVOLUTION] Tuning complete (${n} flips, W=${W.toFixed(3)}). ` +
      `Adjustments: ${adjustmentStr}. ` +
      `New thresholds: buyRatio=${this._thresholds.buyRatio.toFixed(2)}, ` +
      `passRatio=${this._thresholds.passRatio.toFixed(2)}, ` +
      `minProfit=$${this._thresholds.minProfit.toFixed(1)}, ` +
      `riskTolerance=${this._thresholds.riskTolerance.toFixed(2)}. ` +
      `Performance: winRate=${(perf.winRate * 100).toFixed(0)}%, ` +
      `avgROI=${(perf.avgROI * 100).toFixed(0)}%, ` +
      `avgProfit=$${perf.avgProfit.toFixed(2)}`
    );

    return snapshot;
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  private async _persistThresholds(): Promise<void> {
    try {
      await AsyncStorage.setItem(
        THRESHOLDS_KEY,
        JSON.stringify(this._thresholds)
      );
    } catch {}
  }

  private async _persistEvolution(): Promise<void> {
    try {
      await AsyncStorage.setItem(
        EVOLUTION_KEY,
        JSON.stringify(this._evolution)
      );
    } catch {}
  }
}

// ── Export singleton ──────────────────────────────────────────────────────────
export const TuningService = new _TuningService();
