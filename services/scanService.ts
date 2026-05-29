/**
 * Evan AI — Scan Service
 *
 * Clean type contract and utility layer for the scan pipeline.
 * The actual API calls (analyzePhotoToQuery, searchMarket, runScan) live in
 * app/index.tsx and are tightly bound to React state. This module provides:
 *   - TypeScript interfaces for scan results and archive entries
 *   - A normalizer that maps the internal card shape to a stable ScanResult
 *   - Confidence and profit-margin utilities
 */

// ── Core Interfaces ───────────────────────────────────────────────────────────

/**
 * Structured output from the Neural Scan Pipeline.
 * Every field is derived from the raw server + market response in runScan().
 */
export interface ScanResult {
  /** Identified product name (from vision query or listing title) */
  itemName: string;
  /** Vision AI certainty, 0–1. Below 0.30 = low signal. */
  confidenceScore: number;
  /** Average market resale price across live listings (null if no listings found) */
  marketPrice: number | null;
  /**
   * Flip profit margin %, calculated as (expectedResale - scannedPrice) / scannedPrice × 100.
   * Positive = you can flip for profit. Null if insufficient price data.
   */
  profitMargin: number | null;
  /**
   * Preliminary authenticity flag derived from server authenticityIntel.
   * true = likely authentic, false = suspicious/fake, null = not assessed.
   */
  isAuthentic: boolean | null;

  // ── Extended fields (pass-through from card) ───────────────────────────────
  /** The price the seller is asking (user's input) */
  scannedPrice: number | null;
  /** Lowest found market price */
  cheapestPrice: number | null;
  /** How much cheaper the market is vs. scannedPrice (0 if already cheaper) */
  savedAmount: number;
  /** Estimated flip profit in dollars (expectedResale − scannedPrice) */
  expectedProfit: number | null;
  /** Estimated resale value */
  estimatedResale: number | null;
  /** Three-state verdict: "BUY" | "HOLD" | "PASS" (string typed for legacy entries). */
  buyVerdict: string | null;
  /** Product category inferred from vision query */
  category: string | null;
  /** Marketplace source of cheapest listing */
  store: string | null;
  /** Direct buy link for cheapest listing */
  buyLink: string | null;
  /** Listing image URL */
  image: string | null;
  /** Canonical vision search query */
  visionQuery: string | null;
  /** Top 3 alternative listings */
  alternatives: any[];

  // ── Deal Engine output (attached after runDealEngine) ───────────────────
  /** Two-phase deal intelligence result */
  dealResult?: import("./dealEngine").DealResult;
}

// Re-export Deal Engine types for convenience
export type {
  DealResult,
  FastVerdict,
  DeepAnalysis,
  DealMeta,
  DealConfidence,
  DealVerdict,
  RiskLevel,
  DealInput,
} from "./dealEngine";

/**
 * A single entry in the user's scan archive (persisted to AsyncStorage).
 */
export interface ArchiveEntry {
  id: string;
  uri: string | null;
  title: string;
  timestamp: string;
  resultCard: ScanResult;
}

// ── Normalizer ─────────────────────────────────────────────────────────────────

/**
 * Maps the internal card object (assembled in runScan) to a clean ScanResult.
 * Non-destructive: spreads all original card fields so no data is lost.
 *
 * Usage inside runScan (after card is built):
 *   const normalized = normalizeScanCard(card);
 */
export function normalizeScanCard(card: any, scannedPrice?: number | null): ScanResult {
  const sp = card.scannedPrice ?? scannedPrice ?? null;
  const marketPriceRaw = card.marketPrice ?? card.avgMarket ?? card.price ?? null;
  const mp = Number.isFinite(marketPriceRaw) ? (marketPriceRaw as number) : null;

  // Profit margin: if already stamped on card use it, otherwise derive from expectedProfit
  let profitMargin: number | null = null;
  if (card.profitMargin != null && Number.isFinite(card.profitMargin)) {
    profitMargin = card.profitMargin as number;
  } else if (
    Number.isFinite(sp) && (sp as number) > 0 &&
    Number.isFinite(card.expectedProfit) && card.expectedProfit != null
  ) {
    profitMargin = Math.round(((card.expectedProfit as number) / (sp as number)) * 100);
  }

  // isAuthentic: if already stamped on card use it, otherwise derive from authenticityIntel
  const isAuthentic: boolean | null =
    card.isAuthentic !== undefined && card.isAuthentic !== null
      ? Boolean(card.isAuthentic)
      : _deriveIsAuthentic(card.authenticityIntel);

  return {
    // ── The 5 required fields ──
    itemName: card.itemName || card.title || "",
    confidenceScore: card.confidenceScore ?? card.visionConfidence ?? 0,
    marketPrice: mp,
    profitMargin,
    isAuthentic,

    // ── Extended fields ──
    scannedPrice: Number.isFinite(sp) ? (sp as number) : null,
    cheapestPrice: Number.isFinite(card.price) ? card.price : null,
    savedAmount: Number.isFinite(card.savedAmount) ? card.savedAmount : 0,
    expectedProfit: Number.isFinite(card.expectedProfit) ? card.expectedProfit : null,
    estimatedResale: Number.isFinite(card.estimatedResale) ? card.estimatedResale : null,
    buyVerdict: card.buyVerdict ?? null,
    category: card.category ?? null,
    store: card.store ?? null,
    buyLink: card.buyLink ?? null,
    image: card.image ?? null,
    visionQuery: card.visionQuery ?? null,
    alternatives: Array.isArray(card.alternatives) ? card.alternatives : [],

    // Spread all original fields so components see unchanged data
    ...card,
  };
}

// ── Authenticity Derivation ───────────────────────────────────────────────────

function _deriveIsAuthentic(authenticityIntel: any): boolean | null {
  if (!authenticityIntel) return null;
  const v = String(authenticityIntel.verdict || "").toLowerCase();
  if (v === "likely_authentic" || v === "authentic") return true;
  if (v === "likely_fake" || v === "suspicious" || v === "counterfeit") return false;
  // "unknown" or unexpected values — cannot assess
  return null;
}

// ── Confidence Utilities ──────────────────────────────────────────────────────

/** Minimum confidence to be considered a reliable match (mirrors CONFIDENCE_THRESHOLD in index.tsx) */
export const SCAN_CONFIDENCE_THRESHOLD = 0.30;

/** Returns true when the vision signal is too weak to trust the identification. */
export function isLowConfidenceResult(result: Pick<ScanResult, "confidenceScore">): boolean {
  return result.confidenceScore < SCAN_CONFIDENCE_THRESHOLD;
}

/**
 * Returns a user-facing hint for weak scans.
 * Empty string when confidence is acceptable.
 */
export function getLowConfidenceHint(result: Pick<ScanResult, "confidenceScore">): string {
  const score = result.confidenceScore;
  if (score < 0.15) return "Very low signal — hold steady, improve lighting, or crop tighter.";
  if (score < SCAN_CONFIDENCE_THRESHOLD) return "Low signal — try better lighting or a clearer angle.";
  return "";
}

// ── Profit Margin ─────────────────────────────────────────────────────────────

/**
 * Computes flip profit margin: (resalePrice - costPrice) / costPrice × 100.
 * Returns null when either value is invalid or costPrice is zero.
 */
export function computeProfitMargin(
  costPrice: number | null | undefined,
  resalePrice: number | null | undefined
): number | null {
  if (
    !Number.isFinite(costPrice) || !costPrice ||
    !Number.isFinite(resalePrice) || !resalePrice
  ) return null;
  return Math.round(((resalePrice! - costPrice!) / costPrice!) * 100);
}

// ── Autonomous Deal Hunter ────────────────────────────────────────────────────

export interface DealAlert {
  /** Stable ID for deduplication (query + price bucket) */
  id: string;
  query: string;
  /** Three-state verdict from server: "BUY" | "HOLD" | "PASS". */
  verdict: string;
  /** Best market price found */
  bestPrice: number;
  /** Deal score 0–1 */
  dealScore: number;
  /** Direct listing URL (may be null) */
  url: string | null;
  /** Listing image URL (may be null) */
  image: string | null;
  detectedAt: number;
}

export interface DealHunterConfig {
  apiBase: string;
  /** Interval between sweeps in ms. Default: 15 minutes. */
  intervalMs?: number;
  /** Minimum deal score [0–1] to fire alert. Default: 0.65. */
  minDealScore?: number;
  onAlert: (alert: DealAlert) => void;
  onError?: (err: Error) => void;
  onSweepStart?: (queries: string[]) => void;
  onSweepComplete?: (alertCount: number) => void;
}

/**
 * Autonomous Deal Hunter — background sweep engine.
 *
 * Polls /deal/hunt for each tracked query on a configurable interval.
 * Fires onAlert for any listing that exceeds minDealScore.
 * Deduplicates alerts within a price bucket (~5% window) to avoid noise.
 *
 * Usage:
 *   const hunter = new AutonomousDealHunter({ apiBase, onAlert });
 *   hunter.setQueries(["Nike Air Jordan 1", "Supreme Box Logo Hoodie"]);
 *   hunter.start();
 *   // ...later
 *   hunter.stop();
 */
export class AutonomousDealHunter {
  private queries: string[] = [];
  private intervalMs: number;
  private minDealScore: number;
  private apiBase: string;
  private timer: ReturnType<typeof setInterval> | null = null;
  private onAlert: (alert: DealAlert) => void;
  private onError: (err: Error) => void;
  private onSweepStart: ((queries: string[]) => void) | undefined;
  private onSweepComplete: ((alertCount: number) => void) | undefined;
  // Dedup set: query:priceBucket → expiry timestamp
  private _seen: Map<string, number> = new Map();
  private readonly _seenTtlMs = 60 * 60 * 1000; // 1 hour — re-alert if price changes significantly

  constructor(config: DealHunterConfig) {
    this.apiBase       = config.apiBase;
    this.intervalMs    = config.intervalMs    ?? 15 * 60 * 1000;
    this.minDealScore  = config.minDealScore  ?? 0.65;
    this.onAlert       = config.onAlert;
    this.onError       = config.onError ?? (() => {});
    this.onSweepStart  = config.onSweepStart;
    this.onSweepComplete = config.onSweepComplete;
  }

  setQueries(queries: string[]): void {
    this.queries = queries.filter((q) => q && q.trim().length >= 3).slice(0, 50);
  }

  setApiBase(base: string): void {
    this.apiBase = base;
  }

  start(): void {
    if (this.timer) return; // already running
    this._sweep(); // immediate first sweep
    this.timer = setInterval(() => this._sweep(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  get isRunning(): boolean {
    return this.timer !== null;
  }

  private async _sweep(): Promise<void> {
    const queries = [...this.queries];
    if (!queries.length || !this.apiBase) return;

    this.onSweepStart?.(queries);
    this._pruneSeenCache();

    let alertCount = 0;
    // Fan out requests in parallel — at most 5 at a time to avoid hammering
    for (let i = 0; i < queries.length; i += 5) {
      const batch = queries.slice(i, i + 5);
      await Promise.allSettled(batch.map((q) => this._huntQuery(q).then((fired) => {
        if (fired) alertCount++;
      })));
    }

    this.onSweepComplete?.(alertCount);
  }

  private async _huntQuery(query: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.apiBase}/deal/hunt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(12000),
      });

      if (!res.ok) return false;

      const json = await res.json().catch(() => null);
      if (!json?.ok || !json.payload) return false;

      const payload   = json.payload;
      const verdict   = String(payload.verdict || payload.deal?.verdict || "").toUpperCase();
      const dealScore = Number(payload.dealScore ?? payload.deal?.score ?? 0);
      const bestPrice = Number(payload.bestPrice ?? payload.price ?? 0);

      // Only surface strong deals — BUY verdict or high deal score.
      const isHot =
        dealScore >= this.minDealScore ||
        verdict === "BUY" ||
        // Legacy strings still recognised so cached deals don't silently disappear.
        verdict === "GREAT FLIP" ||
        verdict === "STRONG BUY";

      if (!isHot || !Number.isFinite(bestPrice) || bestPrice <= 0) return false;

      // Deduplicate: bucket price to nearest 5% bracket so small fluctuations don't re-alert
      const priceBucket = Math.round(bestPrice / (bestPrice * 0.05 + 1));
      const dedupKey = `${query.toLowerCase()}:${priceBucket}`;
      const now = Date.now();

      if (this._seen.has(dedupKey)) return false; // already alerted recently
      this._seen.set(dedupKey, now + this._seenTtlMs);

      const items: any[] = Array.isArray(json.items) ? json.items : [];
      const best = items[0] ?? null;

      const alert: DealAlert = {
        id: `${dedupKey}:${now}`,
        query,
        verdict: payload.verdict ?? verdict,
        bestPrice,
        dealScore,
        url:   best?.url || best?.buyLink || best?.link || null,
        image: best?.image || null,
        detectedAt: now,
      };

      this.onAlert(alert);
      return true;
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        this.onError(new Error(`DealHunter sweep failed for "${query}": ${err?.message || err}`));
      }
      return false;
    }
  }

  private _pruneSeenCache(): void {
    const now = Date.now();
    for (const [key, expiry] of this._seen) {
      if (expiry < now) this._seen.delete(key);
    }
  }
}
