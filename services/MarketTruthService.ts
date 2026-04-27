/**
 * Evan AI — Market Truth Service
 *
 * Ground truth layer for the Self-Improving Threshold Tuning System (SITT).
 *
 * Stores ONLY real flip outcomes — items the user actually bought and sold.
 * Not predictions. Not estimates. Only realized profit.
 *
 * This is the reward signal the tuning loop learns from.
 *
 * Persistence: AsyncStorage (fire-and-forget writes, bounded buffer).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// ── Types ────────────────────────────────────────────────────────────────────

export interface RealFlipOutcome {
  /** Original scan ID (links back to the deal engine's verdict) */
  scanId: string;
  /** What the user paid */
  boughtPrice: number;
  /** What the user actually sold for */
  soldPrice: number;
  /** Realized profit (soldPrice - boughtPrice) — no predictions */
  profit: number;
  /** Platform the item was sold on */
  platform: string;
  /** Hours between purchase and sale */
  holdTimeHours: number;
  /** When this outcome was recorded (ms since epoch) */
  timestamp: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "EVAN_MARKET_TRUTH_V1";
const FLIP_BUFFER_SIZE = 200;

// ── Performance metrics (computed from buffer) ──────────────────────────────

export interface FlipPerformance {
  /** Total flips in the buffer */
  totalFlips: number;
  /** Percentage of flips with positive profit */
  winRate: number;
  /** Average ROI across all flips */
  avgROI: number;
  /** Average realized profit per flip */
  avgProfit: number;
  /** Median realized profit */
  medianProfit: number;
  /** Average hold time in hours */
  avgHoldTimeHours: number;
  /** Number of false positives (bought but lost money) */
  falsePositives: number;
}

// ── Service ──────────────────────────────────────────────────────────────────

class _MarketTruthService {
  private _buffer: RealFlipOutcome[] = [];
  private _loaded = false;
  private _listeners: Array<(perf: FlipPerformance) => void> = [];

  // ── Load from storage (call once at app init) ────────────────────────────

  async load(): Promise<void> {
    if (this._loaded) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this._buffer = parsed.slice(-FLIP_BUFFER_SIZE);
        }
      }
    } catch {}
    this._loaded = true;
  }

  // ── Submit a realized flip outcome ────────────────────────────────────────

  async recordOutcome(params: {
    scanId: string;
    boughtPrice: number;
    soldPrice: number;
    platform: string;
    /** Purchase timestamp (ms since epoch) — used to compute hold time */
    boughtAt: number;
  }): Promise<RealFlipOutcome> {
    const now = Date.now();
    const holdTimeHours = Math.max(0, (now - params.boughtAt) / (1000 * 60 * 60));

    const outcome: RealFlipOutcome = {
      scanId: params.scanId,
      boughtPrice: params.boughtPrice,
      soldPrice: params.soldPrice,
      profit: params.soldPrice - params.boughtPrice,
      platform: params.platform,
      holdTimeHours: Math.round(holdTimeHours * 10) / 10,
      timestamp: now,
    };

    // Append to buffer (bounded)
    this._buffer.push(outcome);
    if (this._buffer.length > FLIP_BUFFER_SIZE) {
      this._buffer.splice(0, this._buffer.length - FLIP_BUFFER_SIZE);
    }

    // Persist (fire-and-forget)
    this._persist().catch(() => {});

    // Notify listeners
    const perf = this.computePerformance();
    for (const fn of this._listeners) {
      try { fn(perf); } catch {}
    }

    console.log(
      `[MARKET_TRUTH] Recorded flip: $${params.boughtPrice} -> $${params.soldPrice} ` +
      `(${outcome.profit >= 0 ? "+" : ""}$${outcome.profit.toFixed(2)}) ` +
      `on ${params.platform}, held ${outcome.holdTimeHours}h. ` +
      `Buffer: ${this._buffer.length}/${FLIP_BUFFER_SIZE}`
    );

    return outcome;
  }

  // ── Performance metrics ───────────────────────────────────────────────────

  computePerformance(): FlipPerformance {
    const flips = this._buffer;
    const n = flips.length;

    if (n === 0) {
      return {
        totalFlips: 0,
        winRate: 0,
        avgROI: 0,
        avgProfit: 0,
        medianProfit: 0,
        avgHoldTimeHours: 0,
        falsePositives: 0,
      };
    }

    const profits = flips.map((f) => f.profit);
    const wins = flips.filter((f) => f.profit > 0).length;
    const losses = flips.filter((f) => f.profit <= 0).length;
    const rois = flips.map((f) =>
      f.boughtPrice > 0 ? f.profit / f.boughtPrice : 0
    );

    // Median
    const sorted = [...profits].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianProfit =
      sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];

    return {
      totalFlips: n,
      winRate: wins / n,
      avgROI: rois.reduce((s, r) => s + r, 0) / n,
      avgProfit: profits.reduce((s, p) => s + p, 0) / n,
      medianProfit,
      avgHoldTimeHours:
        flips.reduce((s, f) => s + f.holdTimeHours, 0) / n,
      falsePositives: losses,
    };
  }

  // ── Buffer access ─────────────────────────────────────────────────────────

  getBuffer(): readonly RealFlipOutcome[] {
    return this._buffer;
  }

  getBufferSize(): number {
    return this._buffer.length;
  }

  // ── Listener for tuning triggers ──────────────────────────────────────────

  onOutcomeRecorded(fn: (perf: FlipPerformance) => void): () => void {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== fn);
    };
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  private async _persist(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this._buffer));
    } catch {}
  }
}

// ── Export singleton ──────────────────────────────────────────────────────────
export const MarketTruthService = new _MarketTruthService();
