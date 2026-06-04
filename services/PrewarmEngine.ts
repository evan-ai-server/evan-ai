/**
 * Evan AI — PrewarmEngine (OPUS 4.8 — Predictive Control Layer)
 *
 * Prewarms computation to reduce perceived scan latency.
 *
 * Two layers:
 *   1. Result Cache — LRU of recent DealResults for REPEAT_VERIFY scans
 *   2. Warm Start Artifact — pre-computed hints for predicted next scan
 *
 * Result Cache:
 *   - Keyed by input fingerprint (category:priceBucket:store)
 *   - Max 5 entries, 30-second TTL
 *   - LRU eviction: oldest entry removed when at capacity
 *   - Serves repeat scans instantly (skip runDealEngine entirely)
 *
 * Warm Start Artifact:
 *   - Pre-resolved thresholds and platform hints for predicted input
 *   - Created when PredictiveEngine confidence exceeds threshold
 *   - 60-second TTL (predictions are inherently short-lived)
 *   - Used by DealEngine as fast-start optimization
 *
 * Architecture:
 *   - Cancel-safe: AbortController for async prewarm operations
 *   - Non-blocking: prewarm runs via queueMicrotask
 *   - Memory-safe: bounded cache, TTL eviction, no growth leaks
 *   - O(1) cache lookup and eviction
 *
 * Guarantees:
 *   - Never blocks UI thread
 *   - Never serves stale data (TTL enforced on every query)
 *   - Bounded memory: max 5 cached results + 1 warm artifact
 */

import type { DealInput, DealResult } from "./dealEngine";
import { computeInputFingerprint } from "./IntentEngine";
import type { ScanPrediction } from "./PredictiveEngine";
import { ScanObserver } from "./ScanObserver";

// ── Types ───────────────────────────────────────────────────────────────

export interface WarmStartArtifact {
  /** Predicted input fingerprint */
  fingerprint: string;
  /** Predicted category */
  predictedCategory: string | null;
  /** Predicted price range */
  predictedPriceRange: { low: number; high: number } | null;
  /** Snapshot of SITT thresholds at prewarm time */
  thresholdSnapshot: {
    buyRatio: number;
    passRatio: number;
    minProfit: number;
  };
  /** When this artifact was computed */
  computedAt: number;
}

interface CachedResult {
  fingerprint: string;
  result: DealResult;
  cachedAt: number;
}

// ── Constants ───────────────────────────────────────────────────────────

const MAX_CACHE_SIZE = 5;
const CACHE_TTL_MS = 30_000;
const WARM_START_TTL_MS = 60_000;

// ── Engine ──────────────────────────────────────────────────────────────

class _PrewarmEngine {
  private _resultCache: CachedResult[] = [];
  private _warmArtifact: WarmStartArtifact | null = null;
  private _abortController: AbortController | null = null;

  // Metrics
  private _totalQueries = 0;
  private _totalHits = 0;
  private _totalWarmHits = 0;

  // ── Result Cache ────────────────────────────────────────────────────

  /**
   * Query the result cache. Returns cached DealResult if a fresh match exists.
   * O(n) where n ≤ 5 — effectively O(1).
   */
  queryCache(input: DealInput): DealResult | null {
    this._totalQueries++;
    const fingerprint = computeInputFingerprint(input);
    const now = Date.now();

    // Scan backward (most recent first)
    for (let i = this._resultCache.length - 1; i >= 0; i--) {
      const entry = this._resultCache[i];

      // Evict stale on read
      if (now - entry.cachedAt > CACHE_TTL_MS) continue;

      if (entry.fingerprint === fingerprint) {
        this._totalHits++;
        ScanObserver.emit("info", "lifecycle", "PREWARM_CACHE_HIT", null, "idle", {
          fingerprint,
          ageMs: now - entry.cachedAt,
          hitRate: this._hitRate(),
        });
        return entry.result;
      }
    }

    ScanObserver.emit("info", "lifecycle", "PREWARM_CACHE_MISS", null, "idle", {
      fingerprint,
      cacheSize: this._resultCache.length,
      hitRate: this._hitRate(),
    });
    return null;
  }

  /**
   * Store a scan result in the cache. Called after pipeline completes.
   * LRU eviction: oldest removed when at capacity.
   */
  cacheResult(input: DealInput, result: DealResult): void {
    const fingerprint = computeInputFingerprint(input);
    const now = Date.now();

    // Remove stale entries
    this._evictStale(now);

    // Update existing entry if same fingerprint
    const existingIdx = this._resultCache.findIndex(
      (e) => e.fingerprint === fingerprint,
    );
    if (existingIdx >= 0) {
      this._resultCache.splice(existingIdx, 1);
    }

    // Evict oldest if at capacity
    if (this._resultCache.length >= MAX_CACHE_SIZE) {
      this._resultCache.shift();
    }

    this._resultCache.push({ fingerprint, result, cachedAt: now });
  }

  // ── Warm Start Artifact ─────────────────────────────────────────────

  /**
   * Create a warm start artifact from a prediction.
   * Non-blocking: runs in microtask to yield to UI thread.
   * Cancel-safe: aborts if a new prewarm is requested.
   */
  prewarm(
    prediction: ScanPrediction,
    thresholds: { buyRatio: number; passRatio: number; minProfit: number },
  ): void {
    if (prediction.confidence <= 0 || !prediction.category) return;

    // Cancel any pending prewarm
    this.cancelPrewarm();

    this._abortController = new AbortController();
    const signal = this._abortController.signal;

    queueMicrotask(() => {
      if (signal.aborted) return;

      this._warmArtifact = {
        fingerprint: prediction.fingerprint ?? "",
        predictedCategory: prediction.category,
        predictedPriceRange: prediction.priceRange,
        thresholdSnapshot: { ...thresholds },
        computedAt: Date.now(),
      };

      ScanObserver.emit("info", "lifecycle", "WARM_ARTIFACT_CREATED", null, "idle", {
        fingerprint: this._warmArtifact.fingerprint,
        category: prediction.category,
        confidence: prediction.confidence,
      });
    });
  }

  /**
   * Get the warm start artifact if it matches the incoming input.
   * Returns null if no artifact, stale, or fingerprint mismatch.
   */
  getWarmArtifact(input: DealInput): WarmStartArtifact | null {
    if (!this._warmArtifact) return null;

    const now = Date.now();
    if (now - this._warmArtifact.computedAt > WARM_START_TTL_MS) {
      this._warmArtifact = null;
      return null;
    }

    const fingerprint = computeInputFingerprint(input);
    if (this._warmArtifact.fingerprint === fingerprint) {
      this._totalWarmHits++;
      ScanObserver.emit("info", "lifecycle", "WARM_ARTIFACT_HIT", null, "scanning", {
        fingerprint,
        ageMs: now - this._warmArtifact.computedAt,
      });
      return this._warmArtifact;
    }

    return null;
  }

  /** Cancel any in-flight prewarm operation */
  cancelPrewarm(): void {
    this._abortController?.abort();
    this._abortController = null;
  }

  // ── Queries ───────────────────────────────────────────────────────

  /** Result cache hit rate */
  getHitRate(): number {
    return this._hitRate();
  }

  /** Warm artifact hit count */
  getWarmHitCount(): number {
    return this._totalWarmHits;
  }

  /** Current cache size */
  getCacheSize(): number {
    return this._resultCache.length;
  }

  /** Whether a warm artifact is currently available */
  hasWarmArtifact(): boolean {
    if (!this._warmArtifact) return false;
    return Date.now() - this._warmArtifact.computedAt < WARM_START_TTL_MS;
  }

  // ── Internals ─────────────────────────────────────────────────────

  private _evictStale(now: number): void {
    while (
      this._resultCache.length > 0 &&
      now - this._resultCache[0].cachedAt > CACHE_TTL_MS
    ) {
      this._resultCache.shift();
    }
  }

  private _hitRate(): number {
    return this._totalQueries > 0
      ? Math.round((this._totalHits / this._totalQueries) * 1000) / 1000
      : 0;
  }

  /** Reset all state (for testing) */
  reset(): void {
    this._resultCache = [];
    this._warmArtifact = null;
    this.cancelPrewarm();
    this._totalQueries = 0;
    this._totalHits = 0;
    this._totalWarmHits = 0;
  }
}

// ── Export Singleton ─────────────────────────────────────────────────────

export const PrewarmEngine = new _PrewarmEngine();
