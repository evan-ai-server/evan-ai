/**
 * Evan AI — PredictiveEngine (OPUS 4.8 — Predictive Control Layer)
 *
 * Predicts the next likely scan before it happens.
 * Feeds predictions to PrewarmEngine for computation preloading.
 *
 * Prediction Strategies:
 *   1. Category Affinity — repeated categories predict continuation
 *   2. Price Momentum    — EMA of recent prices predicts next range
 *   3. Store Loyalty     — repeated stores predict same store
 *
 * Combined confidence: if 2+ strategies agree on category, confidence boosted.
 *
 * Architecture:
 *   - Reads from IntentEngine's scan history (no duplication)
 *   - predict() is deterministic: same history → same prediction
 *   - Tracks prediction accuracy for LearningEngine feedback
 *   - O(1) per prediction (bounded history, 3 fixed strategies)
 *
 * Guarantees:
 *   - Always returns a prediction (confidence may be 0)
 *   - No I/O, no side effects beyond internal counters
 *   - Deterministic: same history → same prediction
 *   - Bounded memory: no internal buffers (reads IntentEngine's)
 */

import { IntentEngine, type ScanHistoryEntry } from "./IntentEngine";
import { ScanObserver } from "./ScanObserver";

// ── Types ───────────────────────────────────────────────────────────────

export type PredictionBasis =
  | "category_affinity"
  | "price_momentum"
  | "store_loyalty"
  | "none";

export interface ScanPrediction {
  /** Predicted next category (null = no prediction) */
  category: string | null;
  /** Predicted next price range (null = no prediction) */
  priceRange: { low: number; high: number } | null;
  /** Predicted store (null = no prediction) */
  store: string | null;
  /** Prediction confidence 0–1 */
  confidence: number;
  /** Which strategy produced this prediction */
  basis: PredictionBasis;
  /** Predicted input fingerprint (for prewarm cache keying) */
  fingerprint: string | null;
  /** When this prediction was generated */
  computedAt: number;
}

// ── Constants ───────────────────────────────────────────────────────────

const MIN_HISTORY_FOR_PREDICTION = 2;
const CATEGORY_LOOKBACK = 5;
const PRICE_EMA_ALPHA = 0.4;
const CATEGORY_AFFINITY_MIN = 2;
const CATEGORY_STRONG_AFFINITY = 3;
const PRICE_RANGE_FACTOR = 0.3;
const MAX_PREDICTION_AGE_MS = 60_000;
const STORE_LOYALTY_MIN = 3;

// ── Engine ──────────────────────────────────────────────────────────────

class _PredictiveEngine {
  private _lastPrediction: ScanPrediction | null = null;
  private _predictionCount = 0;
  private _hitCount = 0;

  // ── Prediction ──────────────────────────────────────────────────────

  /**
   * Generate a prediction based on current scan history.
   *
   * Runs 3 strategies, picks the one with highest confidence,
   * then boosts confidence if multiple strategies agree on category.
   *
   * O(1) — bounded lookback against bounded history.
   */
  predict(): ScanPrediction {
    const history = IntentEngine.getHistory();

    if (history.length < MIN_HISTORY_FOR_PREDICTION) {
      return this._noPrediction();
    }

    // Run all strategies
    const strategies: ScanPrediction[] = [
      this._categoryAffinity(history),
      this._priceMomentum(history),
      this._storeLoyalty(history),
    ];

    // Pick highest confidence
    let best = strategies[0];
    for (let i = 1; i < strategies.length; i++) {
      if (strategies[i].confidence > best.confidence) {
        best = strategies[i];
      }
    }

    // Agreement boost: if 2+ strategies agree on category, boost confidence
    if (best.category) {
      const agreedCount = strategies.filter(
        (s) => s.category != null && s.category === best.category,
      ).length;
      if (agreedCount >= 2) {
        best = { ...best, confidence: Math.min(0.95, best.confidence + 0.1) };
      }
    }

    // Build composite fingerprint from prediction
    if (best.category && best.priceRange) {
      const priceBucket =
        Math.round(
          ((best.priceRange.low + best.priceRange.high) / 2) / 10,
        ) * 10;
      best = {
        ...best,
        fingerprint: `${best.category}:${priceBucket}:${best.store || "unknown"}`,
      };
    }

    this._lastPrediction = best;
    this._predictionCount++;

    ScanObserver.emit("info", "lifecycle", "PREDICTION_GENERATED", null, "idle", {
      confidence: best.confidence,
      basis: best.basis,
      category: best.category,
      priceRange: best.priceRange,
      store: best.store,
      predictionCount: this._predictionCount,
      accuracy: this.getAccuracy().toFixed(3),
    });

    return best;
  }

  // ── Evaluation ──────────────────────────────────────────────────────

  /**
   * Evaluate whether the last prediction was accurate.
   * Called after a scan completes with the actual input.
   *
   * A prediction is a "hit" if:
   *   - Category matches, OR
   *   - Actual price falls within predicted range
   */
  evaluatePrediction(input: {
    category: string | null;
    scannedPrice: number | null;
  }): boolean {
    if (!this._lastPrediction || !this._lastPrediction.category) return false;

    const now = Date.now();
    if (now - this._lastPrediction.computedAt > MAX_PREDICTION_AGE_MS) {
      return false;
    }

    const categoryMatch =
      input.category != null &&
      input.category.toLowerCase() === this._lastPrediction.category;

    let priceMatch = false;
    if (this._lastPrediction.priceRange && input.scannedPrice != null) {
      priceMatch =
        input.scannedPrice >= this._lastPrediction.priceRange.low &&
        input.scannedPrice <= this._lastPrediction.priceRange.high;
    }

    const hit = categoryMatch || priceMatch;
    if (hit) this._hitCount++;

    return hit;
  }

  // ── Queries ───────────────────────────────────────────────────────

  /** Rolling prediction accuracy (hits / total) */
  getAccuracy(): number {
    return this._predictionCount > 0
      ? this._hitCount / this._predictionCount
      : 0;
  }

  /** Last generated prediction (may be stale) */
  getLastPrediction(): ScanPrediction | null {
    return this._lastPrediction;
  }

  /** Total predictions generated */
  getPredictionCount(): number {
    return this._predictionCount;
  }

  // ── Strategy: Category Affinity ───────────────────────────────────

  /**
   * If recent scans cluster around the same category,
   * predict the next scan will be in that category too.
   */
  private _categoryAffinity(
    history: readonly ScanHistoryEntry[],
  ): ScanPrediction {
    const counts = new Map<string, number>();
    const lookback = Math.min(CATEGORY_LOOKBACK, history.length);

    for (let i = history.length - 1; i >= history.length - lookback; i--) {
      const cat = history[i].category;
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }

    // Find dominant category
    let topCategory = "";
    let topCount = 0;
    for (const [cat, count] of counts) {
      if (count > topCount) {
        topCategory = cat;
        topCount = count;
      }
    }

    if (topCount < CATEGORY_AFFINITY_MIN) return this._noPrediction();

    const confidence =
      topCount >= CATEGORY_STRONG_AFFINITY ? 0.7 : 0.4;

    // Derive average price for predicted category
    const categoryEntries = [];
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].category === topCategory) {
        categoryEntries.push(history[i]);
        if (categoryEntries.length >= 5) break;
      }
    }
    const avgPrice =
      categoryEntries.length > 0
        ? categoryEntries.reduce((s, h) => s + h.priceBucket, 0) /
          categoryEntries.length
        : 0;

    return {
      category: topCategory,
      priceRange:
        avgPrice > 0
          ? {
              low: Math.round(avgPrice * (1 - PRICE_RANGE_FACTOR)),
              high: Math.round(avgPrice * (1 + PRICE_RANGE_FACTOR)),
            }
          : null,
      store: this._dominantStore(history),
      confidence,
      basis: "category_affinity",
      fingerprint: null,
      computedAt: Date.now(),
    };
  }

  // ── Strategy: Price Momentum ──────────────────────────────────────

  /**
   * EMA of recent scan prices predicts next price range.
   * Useful when user is browsing a consistent price tier.
   */
  private _priceMomentum(
    history: readonly ScanHistoryEntry[],
  ): ScanPrediction {
    if (history.length < 3) return this._noPrediction();

    // Compute EMA over all history entries with nonzero price
    let ema = 0;
    let initialized = false;
    for (let i = 0; i < history.length; i++) {
      const p = history[i].priceBucket;
      if (p <= 0) continue;
      if (!initialized) {
        ema = p;
        initialized = true;
      } else {
        ema = PRICE_EMA_ALPHA * p + (1 - PRICE_EMA_ALPHA) * ema;
      }
    }

    if (!initialized || ema <= 0) return this._noPrediction();

    const last = history[history.length - 1];
    return {
      category: last.category,
      priceRange: {
        low: Math.round(ema * (1 - PRICE_RANGE_FACTOR)),
        high: Math.round(ema * (1 + PRICE_RANGE_FACTOR)),
      },
      store: this._dominantStore(history),
      confidence: 0.35,
      basis: "price_momentum",
      fingerprint: null,
      computedAt: Date.now(),
    };
  }

  // ── Strategy: Store Loyalty ───────────────────────────────────────

  /**
   * If user is repeatedly scanning from the same store,
   * predict next scan will be the same store.
   */
  private _storeLoyalty(
    history: readonly ScanHistoryEntry[],
  ): ScanPrediction {
    const counts = new Map<string, number>();
    const lookback = Math.min(5, history.length);

    for (let i = history.length - 1; i >= history.length - lookback; i--) {
      const store = history[i].store;
      counts.set(store, (counts.get(store) ?? 0) + 1);
    }

    let topStore = "";
    let topCount = 0;
    for (const [store, count] of counts) {
      if (count > topCount) {
        topStore = store;
        topCount = count;
      }
    }

    if (topCount < STORE_LOYALTY_MIN) return this._noPrediction();

    const last = history[history.length - 1];
    return {
      category: last.category,
      priceRange: null,
      store: topStore,
      confidence: 0.3,
      basis: "store_loyalty",
      fingerprint: null,
      computedAt: Date.now(),
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────

  /**
   * Find the most common store in recent history.
   */
  private _dominantStore(
    history: readonly ScanHistoryEntry[],
  ): string | null {
    if (history.length === 0) return null;
    const counts = new Map<string, number>();
    const lookback = Math.min(5, history.length);
    for (let i = history.length - 1; i >= history.length - lookback; i--) {
      const store = history[i].store;
      counts.set(store, (counts.get(store) ?? 0) + 1);
    }
    let top = "";
    let topCount = 0;
    for (const [store, count] of counts) {
      if (count > topCount) {
        top = store;
        topCount = count;
      }
    }
    return topCount >= 2 ? top : null;
  }

  private _noPrediction(): ScanPrediction {
    return {
      category: null,
      priceRange: null,
      store: null,
      confidence: 0,
      basis: "none",
      fingerprint: null,
      computedAt: Date.now(),
    };
  }

  /** Reset all state (for testing) */
  reset(): void {
    this._lastPrediction = null;
    this._predictionCount = 0;
    this._hitCount = 0;
  }
}

// ── Export Singleton ─────────────────────────────────────────────────────

export const PredictiveEngine = new _PredictiveEngine();
