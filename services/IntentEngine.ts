/**
 * Evan AI — IntentEngine (OPUS 4.8 — Predictive Control Layer)
 *
 * Classifies user scan intent from behavioral signals.
 * Drives execution strategy, prediction weighting, and prewarm aggressiveness.
 *
 * Intent Taxonomy:
 *   QUICK_CHECK    — "is this worth it?" (standard scan, high priority)
 *   DEEP_RESEARCH  — "should I buy this?" (deliberate, critical priority)
 *   COMPARE        — "which is better?" (sequential comparison, high priority)
 *   IMPULSE        — "give me deals" (rapid-fire, low priority, batch-eligible)
 *   REPEAT_VERIFY  — "did the price change?" (re-check, use cache, low priority)
 *
 * Architecture:
 *   - Maintains bounded scan history (circular buffer, 20 entries max)
 *   - classifyIntent() is pure: DealInput + history → ScanIntent
 *   - O(1) per classification (bounded lookbacks against bounded history)
 *   - Zero side effects during classification, zero I/O
 *
 * Guarantees:
 *   - Classification always succeeds (defaults to QUICK_CHECK)
 *   - No unbounded memory (circular buffer with hard cap)
 *   - Race-safe (no shared mutable state during classify)
 */

import type { DealInput } from "./dealEngine";
import { ScanObserver } from "./ScanObserver";

// ── Intent Types ────────────────────────────────────────────────────────

export type ScanIntentType =
  | "QUICK_CHECK"
  | "DEEP_RESEARCH"
  | "COMPARE"
  | "IMPULSE"
  | "REPEAT_VERIFY";

export type ScanPriority = "CRITICAL" | "HIGH" | "LOW";

export interface ScanIntent {
  /** Classified intent type */
  type: ScanIntentType;
  /** Classification confidence 0–1 */
  confidence: number;
  /** Which behavioral signals contributed to this classification */
  signals: string[];
  /** Execution strategy derived from intent */
  strategy: IntentStrategy;
}

export interface IntentStrategy {
  /** Scheduling priority */
  priority: ScanPriority;
  /** How aggressively to prewarm next prediction (0–1) */
  prewarmAggression: number;
  /** Max time budget before degrading to fallback (ms) */
  timeoutBudgetMs: number;
  /** Whether this scan can be batched with similar intents */
  batchEligible: boolean;
}

// ── Scan History ────────────────────────────────────────────────────────

export interface ScanHistoryEntry {
  scanId: string;
  fingerprint: string;
  category: string;
  priceBucket: number;
  store: string;
  timestamp: number;
  intentType: ScanIntentType;
  outcomeRecorded: boolean;
}

// ── Constants ───────────────────────────────────────────────────────────

const MAX_HISTORY = 20;

/** Time gap thresholds for intent heuristics */
const IMPULSE_WINDOW_MS = 3_000;
const IMPULSE_MIN_SESSION_SCANS = 2;
const COMPARE_WINDOW_MS = 30_000;
const DEEP_RESEARCH_PRICE_THRESHOLD = 100;
const DEEP_RESEARCH_GAP_MS = 60_000;
const REPEAT_WINDOW_MS = 300_000;

// ── Strategy Presets ────────────────────────────────────────────────────
// Each intent maps to a fixed execution strategy.
// LearningEngine may adjust these over time via parameter updates.

const STRATEGY_MAP: Record<ScanIntentType, IntentStrategy> = {
  QUICK_CHECK: {
    priority: "HIGH",
    prewarmAggression: 0.5,
    timeoutBudgetMs: 10_000,
    batchEligible: false,
  },
  DEEP_RESEARCH: {
    priority: "CRITICAL",
    prewarmAggression: 0.3,
    timeoutBudgetMs: 15_000,
    batchEligible: false,
  },
  COMPARE: {
    priority: "HIGH",
    prewarmAggression: 0.8,
    timeoutBudgetMs: 10_000,
    batchEligible: false,
  },
  IMPULSE: {
    priority: "LOW",
    prewarmAggression: 0.9,
    timeoutBudgetMs: 5_000,
    batchEligible: true,
  },
  REPEAT_VERIFY: {
    priority: "LOW",
    prewarmAggression: 0.0,
    timeoutBudgetMs: 5_000,
    batchEligible: false,
  },
};

// ── Input Fingerprinting ────────────────────────────────────────────────

/**
 * Compute a compact, deterministic fingerprint for a DealInput.
 * Used for repeat-scan detection and prewarm cache keying.
 *
 * Fingerprint = category:priceBucket:store
 * Price bucket = nearest $10 (reduces noise while preserving signal).
 */
export function computeInputFingerprint(input: DealInput): string {
  const priceBucket =
    input.scannedPrice != null
      ? Math.round(input.scannedPrice / 10) * 10
      : 0;
  const category = (input.category || "unknown").toLowerCase().slice(0, 30);
  const store = (input.store || "unknown").toLowerCase().slice(0, 20);
  return `${category}:${priceBucket}:${store}`;
}

// ── Engine ──────────────────────────────────────────────────────────────

class _IntentEngine {
  private _history: ScanHistoryEntry[] = [];
  private _sessionScanCount = 0;

  // ── Classification ──────────────────────────────────────────────────

  /**
   * Classify the intent behind a scan.
   *
   * Decision tree (priority order):
   *   1. REPEAT_VERIFY — same fingerprint within 5 minutes
   *   2. IMPULSE       — <3s gap + 2+ scans in session
   *   3. COMPARE       — same category + <30s gap
   *   4. DEEP_RESEARCH — high price / first scan / >60s gap
   *   5. QUICK_CHECK   — default
   *
   * O(1) — bounded lookback against bounded history.
   */
  classifyIntent(input: DealInput): ScanIntent {
    const now = Date.now();
    const fingerprint = computeInputFingerprint(input);
    const category = (input.category || "unknown").toLowerCase();
    const signals: string[] = [];

    // ── Check 1: REPEAT_VERIFY ──────────────────────────────────────
    const repeatMatch = this._findRecentFingerprint(
      fingerprint,
      REPEAT_WINDOW_MS,
      now,
    );
    if (repeatMatch) {
      signals.push(`repeat:${repeatMatch.scanId}`);
      signals.push(`repeat:age_${now - repeatMatch.timestamp}ms`);
      return this._build("REPEAT_VERIFY", 0.9, signals);
    }

    // ── Check 2: IMPULSE ────────────────────────────────────────────
    const lastEntry = this._history[this._history.length - 1];
    const timeSinceLastMs = lastEntry ? now - lastEntry.timestamp : Infinity;

    if (
      timeSinceLastMs < IMPULSE_WINDOW_MS &&
      this._sessionScanCount >= IMPULSE_MIN_SESSION_SCANS
    ) {
      signals.push(`impulse:gap_${timeSinceLastMs}ms`);
      signals.push(`impulse:session_${this._sessionScanCount}_scans`);
      return this._build("IMPULSE", 0.85, signals);
    }

    // ── Check 3: COMPARE ────────────────────────────────────────────
    if (
      lastEntry &&
      timeSinceLastMs < COMPARE_WINDOW_MS &&
      lastEntry.category === category
    ) {
      signals.push(`compare:same_cat_${category}`);
      signals.push(`compare:gap_${timeSinceLastMs}ms`);

      // Boost confidence if 2+ recent scans in the same category
      const recentSameCat = this._countRecentCategory(
        category,
        COMPARE_WINDOW_MS,
        now,
      );
      const confidence = recentSameCat >= 2 ? 0.9 : 0.7;
      return this._build("COMPARE", confidence, signals);
    }

    // ── Check 4: DEEP_RESEARCH ──────────────────────────────────────
    const price = input.scannedPrice ?? 0;
    if (price > DEEP_RESEARCH_PRICE_THRESHOLD) {
      signals.push(`deep:high_price_$${price}`);
      return this._build("DEEP_RESEARCH", 0.8, signals);
    }
    if (this._sessionScanCount === 0) {
      signals.push("deep:first_scan");
      return this._build("DEEP_RESEARCH", 0.7, signals);
    }
    if (timeSinceLastMs > DEEP_RESEARCH_GAP_MS) {
      signals.push(`deep:long_gap_${Math.round(timeSinceLastMs / 1000)}s`);
      return this._build("DEEP_RESEARCH", 0.65, signals);
    }

    // ── Default: QUICK_CHECK ────────────────────────────────────────
    signals.push("default:no_strong_signal");
    return this._build("QUICK_CHECK", 0.6, signals);
  }

  // ── History Management ──────────────────────────────────────────────

  /**
   * Record a completed scan into history.
   * Called by the orchestrator after handleScan produces a scanId.
   */
  recordScan(
    scanId: string,
    input: DealInput,
    intentType: ScanIntentType,
  ): void {
    const entry: ScanHistoryEntry = {
      scanId,
      fingerprint: computeInputFingerprint(input),
      category: (input.category || "unknown").toLowerCase(),
      priceBucket:
        input.scannedPrice != null
          ? Math.round(input.scannedPrice / 10) * 10
          : 0,
      store: (input.store || "unknown").toLowerCase(),
      timestamp: Date.now(),
      intentType,
      outcomeRecorded: false,
    };

    // Circular buffer — O(1) amortized
    if (this._history.length >= MAX_HISTORY) {
      this._history.shift();
    }
    this._history.push(entry);
    this._sessionScanCount++;

    ScanObserver.emit("info", "lifecycle", "INTENT_RECORDED", scanId, "scanning", {
      intentType,
      fingerprint: entry.fingerprint,
      sessionScanCount: this._sessionScanCount,
      historySize: this._history.length,
    });
  }

  /**
   * Mark a scan's outcome as recorded (for learning feedback).
   */
  markOutcomeRecorded(scanId: string): void {
    for (let i = this._history.length - 1; i >= 0; i--) {
      if (this._history[i].scanId === scanId) {
        this._history[i].outcomeRecorded = true;
        return;
      }
    }
  }

  // ── Queries ───────────────────────────────────────────────────────

  /** Read-only view of scan history (most recent last) */
  getHistory(): readonly ScanHistoryEntry[] {
    return this._history;
  }

  /** Session scan count (resets on session boundary) */
  getSessionScanCount(): number {
    return this._sessionScanCount;
  }

  /** Reset session counter (e.g., app backgrounded > 5 min) */
  resetSession(): void {
    this._sessionScanCount = 0;
  }

  // ── Internals ─────────────────────────────────────────────────────

  private _build(
    type: ScanIntentType,
    confidence: number,
    signals: string[],
  ): ScanIntent {
    return {
      type,
      confidence,
      signals,
      strategy: { ...STRATEGY_MAP[type] },
    };
  }

  /**
   * Find the most recent history entry matching a fingerprint within a time window.
   * Scans backward from newest — O(k) where k is entries within window.
   */
  private _findRecentFingerprint(
    fingerprint: string,
    windowMs: number,
    now: number,
  ): ScanHistoryEntry | null {
    for (let i = this._history.length - 1; i >= 0; i--) {
      const entry = this._history[i];
      if (now - entry.timestamp > windowMs) break; // past window
      if (entry.fingerprint === fingerprint) return entry;
    }
    return null;
  }

  /**
   * Count recent entries in the same category within a time window.
   */
  private _countRecentCategory(
    category: string,
    windowMs: number,
    now: number,
  ): number {
    let count = 0;
    for (let i = this._history.length - 1; i >= 0; i--) {
      const entry = this._history[i];
      if (now - entry.timestamp > windowMs) break;
      if (entry.category === category) count++;
    }
    return count;
  }

  /** Reset all state (for testing) */
  reset(): void {
    this._history = [];
    this._sessionScanCount = 0;
  }
}

// ── Export Singleton ─────────────────────────────────────────────────────

export const IntentEngine = new _IntentEngine();
