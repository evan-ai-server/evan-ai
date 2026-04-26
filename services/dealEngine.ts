/**
 * Evan AI — Deal Intelligence Engine
 *
 * Two-phase verdict system:
 *   Phase 1 (FAST): instant heuristic verdict from available signals (<2s thinking)
 *   Phase 2 (DEEP): refined analysis after full market data
 *
 * Guardrails:
 *   - Floor Rule: items under $15 → PASS (shipping/labor kills margin)
 *   - Stale Data Penalty: data >7d old → confidence drops to low, verdict → CHECK
 *   - Oracle Fallback: low-confidence gemini vision → prioritize platform liquidity
 *   - Fail-Safe: if fast logic throws, return synthetic CHECK placeholder
 *
 * _meta: hooks into Finance Layer for commission/ROI tracking.
 */

// ── Types ────────────────────────────────────────────────────────────────────────

export type DealConfidence = "low" | "medium" | "high";
export type DealVerdict = "BUY" | "PASS" | "CHECK";
export type RiskLevel = "low" | "medium" | "high";

export interface FastVerdict {
  estimated_price: number;
  confidence: DealConfidence;
  verdict: DealVerdict;
}

export interface DeepAnalysis {
  resale_range: { low: number; high: number };
  expected_profit: number;
  platform_best: string;
  fees_estimate: number;
  risk_level: RiskLevel;
  reasoning: string;
}

export interface DealMeta {
  potential_commission: number;
  roi_percentage: number;
  processing_ms: number;
}

export interface DealResult {
  fast: FastVerdict;
  deep: DeepAnalysis;
  _meta: DealMeta;
}

// ── Input contract ───────────────────────────────────────────────────────────────

export interface DealInput {
  /** Price the user is paying / seller is asking */
  scannedPrice: number | null;
  /** Cheapest market listing found */
  cheapestPrice: number | null;
  /** Average market price across live listings */
  avgMarket: number | null;
  /** Market spread low */
  spreadLow: number | null;
  /** Market spread high */
  spreadHigh: number | null;
  /** Estimated resale value */
  estimatedResale: number | null;
  /** Expected flip profit (resale - cost) */
  expectedProfit: number | null;
  /** Vision confidence 0–1 */
  visionConfidence: number;
  /** Vision source identifier */
  visionSource: string | null;
  /** Number of market listings found */
  totalMatches: number;
  /** Best platform/store for this item */
  store: string | null;
  /** Category of the item */
  category: string | null;
  /** Buy score 0–100 from computeInsights */
  buyScore: number;
  /** Existing buy verdict from computeInsights */
  buyVerdict: string | null;
  /** Resale velocity (Fast / Medium / Slow) */
  resaleVelocity: string | null;
  /** Liquidity label */
  liquidity: string | null;
  /** Timestamp of the market data (ms since epoch) */
  dataTimestamp: number | null;
}

// ── Constants ────────────────────────────────────────────────────────────────────

const FLOOR_PRICE = 15;
const STALE_DATA_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const COMMISSION_RATE = 0.05; // 5% hypothetical platform fee tracking
const PLATFORM_FEES: Record<string, number> = {
  ebay: 0.1313,     // 13.13% (final value + payment processing)
  mercari: 0.10,    // 10%
  poshmark: 0.20,   // 20%
  depop: 0.10,      // 10%
  facebook: 0.05,   // 5% (shipping label)
  offerup: 0.0,     // local = free
  craigslist: 0.0,
};

// ── Engine ────────────────────────────────────────────────────────────────────────

/**
 * Phase 1: Fast Verdict — instant heuristic, <2ms compute.
 * Uses whatever signals are available. Never waits for anything.
 */
function computeFastVerdict(input: DealInput): FastVerdict {
  const sp = input.scannedPrice;
  const resale = input.estimatedResale ?? input.avgMarket ?? input.cheapestPrice;

  // Estimated price: best available signal
  const estimated_price = resale ?? sp ?? 0;

  // ── Guardrail: Floor Rule ──────────────────────────────────────────────────
  if (estimated_price > 0 && estimated_price < FLOOR_PRICE) {
    return { estimated_price, confidence: "low", verdict: "PASS" };
  }

  // ── Guardrail: Stale Data Penalty ──────────────────────────────────────────
  const isStale =
    input.dataTimestamp != null &&
    Date.now() - input.dataTimestamp > STALE_DATA_MS;

  if (isStale) {
    return { estimated_price, confidence: "low", verdict: "CHECK" };
  }

  // ── Confidence mapping ─────────────────────────────────────────────────────
  let confidence: DealConfidence = "medium";
  if (input.visionConfidence >= 0.7 && input.totalMatches >= 8) {
    confidence = "high";
  } else if (input.visionConfidence < 0.3 || input.totalMatches < 3) {
    confidence = "low";
  }

  // ── Guardrail: Oracle Fallback ─────────────────────────────────────────────
  // If vision source is gemini and confidence is low, force CHECK
  if (input.visionSource === "gemini" && confidence === "low") {
    return { estimated_price, confidence: "low", verdict: "CHECK" };
  }

  // ── Verdict logic ──────────────────────────────────────────────────────────
  // Primary: if resale > 1.5x price → BUY
  if (sp != null && sp > 0 && resale != null && resale > 0) {
    const ratio = resale / sp;
    if (ratio >= 1.5) return { estimated_price, confidence, verdict: "BUY" };
    if (ratio < 0.9) return { estimated_price, confidence, verdict: "PASS" };
  }

  // Secondary: use buyScore from existing insights
  if (input.buyScore >= 70) return { estimated_price, confidence, verdict: "BUY" };
  if (input.buyScore >= 46) return { estimated_price, confidence, verdict: "CHECK" };

  return { estimated_price, confidence, verdict: "PASS" };
}

/**
 * Phase 2: Deep Analysis — refined reasoning with full market context.
 */
function computeDeepAnalysis(input: DealInput): DeepAnalysis {
  const sp = input.scannedPrice ?? 0;
  const resale = input.estimatedResale ?? input.avgMarket ?? input.cheapestPrice ?? 0;
  const low = input.spreadLow ?? resale * 0.85;
  const high = input.spreadHigh ?? resale * 1.15;

  // Best platform selection
  const platform_best = inferBestPlatform(input);

  // Fees estimate based on platform
  const feeRate = PLATFORM_FEES[platform_best.toLowerCase()] ?? 0.10;
  const fees_estimate = Math.round(resale * feeRate * 100) / 100;

  // Expected profit after fees
  const rawProfit = input.expectedProfit ?? (resale - sp);
  const expected_profit = Math.max(0, Math.round((rawProfit - fees_estimate) * 100) / 100);

  // Risk assessment
  const risk_level = assessRisk(input);

  // Reasoning (max 2 sentences)
  const reasoning = buildReasoning(input, expected_profit, platform_best, risk_level);

  return {
    resale_range: {
      low: Math.round(low * 100) / 100,
      high: Math.round(high * 100) / 100,
    },
    expected_profit,
    platform_best,
    fees_estimate,
    risk_level,
    reasoning,
  };
}

/**
 * Compute _meta for Finance Layer tracking.
 */
function computeMeta(
  input: DealInput,
  deep: DeepAnalysis,
  processingMs: number
): DealMeta {
  const sp = input.scannedPrice ?? 0;
  const roi_percentage =
    sp > 0 ? Math.round((deep.expected_profit / sp) * 10000) / 100 : 0;
  const potential_commission =
    Math.round(deep.expected_profit * COMMISSION_RATE * 100) / 100;

  return {
    potential_commission,
    roi_percentage,
    processing_ms: Math.round(processingMs),
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

function inferBestPlatform(input: DealInput): string {
  const cat = (input.category || "").toLowerCase();
  const liq = (input.liquidity || "").toLowerCase();

  // Category-specific platform affinity
  if (/(sneaker|jordan|nike|adidas|shoe)/.test(cat)) return "eBay";
  if (/(luxury|louis vuitton|gucci|prada|coach)/.test(cat)) return "Poshmark";
  if (/(electronics|iphone|ipad|ps5|xbox|camera)/.test(cat)) return "eBay";
  if (/(vintage|antique|collectible|comic|trading card)/.test(cat)) return "eBay";
  if (/(music|guitar|amp)/.test(cat)) return "eBay";

  // If store is already known and makes sense, use it
  if (input.store) {
    const s = input.store.toLowerCase();
    if (s.includes("ebay")) return "eBay";
    if (s.includes("mercari")) return "Mercari";
    if (s.includes("poshmark")) return "Poshmark";
  }

  // High liquidity → eBay (largest audience); low → Facebook/local
  if (liq === "very high" || liq === "high") return "eBay";
  if (liq === "low") return "Facebook Marketplace";

  return "eBay";
}

function assessRisk(input: DealInput): RiskLevel {
  let riskScore = 0;

  // Low confidence = risk
  if (input.visionConfidence < 0.3) riskScore += 2;
  else if (input.visionConfidence < 0.5) riskScore += 1;

  // Few market comps = risk
  if (input.totalMatches < 3) riskScore += 2;
  else if (input.totalMatches < 8) riskScore += 1;

  // Wide spread = volatile market
  if (input.spreadLow != null && input.spreadHigh != null && input.avgMarket) {
    const spreadPct = ((input.spreadHigh - input.spreadLow) / input.avgMarket) * 100;
    if (spreadPct > 60) riskScore += 2;
    else if (spreadPct > 30) riskScore += 1;
  }

  // Negative or tiny margin
  const profit = input.expectedProfit ?? 0;
  const sp = input.scannedPrice ?? 0;
  if (sp > 0 && profit / sp < 0.1) riskScore += 1;

  if (riskScore >= 4) return "high";
  if (riskScore >= 2) return "medium";
  return "low";
}

function buildReasoning(
  input: DealInput,
  expectedProfit: number,
  platform: string,
  risk: RiskLevel
): string {
  const sp = input.scannedPrice;
  const resale = input.estimatedResale ?? input.avgMarket ?? 0;
  const matches = input.totalMatches;

  const parts: string[] = [];

  if (sp && resale > 0) {
    const margin = Math.round(((resale - sp) / sp) * 100);
    if (margin > 0) {
      parts.push(
        `${margin}% margin at $${expectedProfit.toFixed(0)} profit on ${platform}`
      );
    } else {
      parts.push(`Market is ${Math.abs(margin)}% below your price`);
    }
  }

  if (matches > 20) {
    parts.push(`strong liquidity with ${matches} active listings`);
  } else if (matches < 5) {
    parts.push(`thin market (${matches} listings) — ${risk} risk`);
  } else {
    parts.push(`${matches} listings suggest ${risk === "low" ? "stable" : "moderate"} demand`);
  }

  // Cap to 2 sentences
  return parts.slice(0, 2).join("; ") + ".";
}

// ── Public API ────────────────────────────────────────────────────────────────────

/** Fail-safe placeholder — returned when fast logic throws */
const FAILSAFE_RESULT: DealResult = {
  fast: { estimated_price: 0, confidence: "low", verdict: "CHECK" },
  deep: {
    resale_range: { low: 0, high: 0 },
    expected_profit: 0,
    platform_best: "eBay",
    fees_estimate: 0,
    risk_level: "high",
    reasoning: "Analysis unavailable — verify manually before purchasing.",
  },
  _meta: { potential_commission: 0, roi_percentage: 0, processing_ms: 0 },
};

/**
 * Run the full two-phase deal intelligence engine.
 *
 * Phase 1 returns synchronously-fast. Phase 2 refines.
 * The entire call is synchronous (no I/O) — all data comes from the caller.
 *
 * Guardrails (floor, stale, oracle, fail-safe) are enforced automatically.
 */
export function runDealEngine(input: DealInput): DealResult {
  const t0 = performance.now();

  try {
    // ── Phase 1: Fast Verdict ──────────────────────────────────────────────
    const fast = computeFastVerdict(input);

    // ── Phase 2: Deep Analysis ─────────────────────────────────────────────
    const deep = computeDeepAnalysis(input);

    // ── Guardrail: Floor Rule (deep override) ──────────────────────────────
    // Even if fast said BUY, deep can override if after-fees profit is garbage
    if (fast.verdict === "BUY" && deep.expected_profit < 5) {
      fast.verdict = "CHECK";
      deep.reasoning = `Profit after fees ($${deep.expected_profit.toFixed(0)}) too thin to justify flip; ${deep.reasoning}`;
    }

    // ── Guardrail: Deep risk override ──────────────────────────────────────
    // High risk + BUY → downgrade to CHECK
    if (fast.verdict === "BUY" && deep.risk_level === "high") {
      fast.verdict = "CHECK";
    }

    const processingMs = performance.now() - t0;
    const _meta = computeMeta(input, deep, processingMs);

    return { fast, deep, _meta };
  } catch (err) {
    // ── Guardrail: Fail-Safe ───────────────────────────────────────────────
    const processingMs = performance.now() - t0;
    return {
      ...FAILSAFE_RESULT,
      _meta: {
        ...FAILSAFE_RESULT._meta,
        processing_ms: Math.round(processingMs),
      },
    };
  }
}

/**
 * Maps a DealVerdict back to the existing buyVerdict string format
 * used throughout the app (for backward compatibility).
 */
export function dealVerdictToBuyVerdict(
  verdict: DealVerdict,
  buyScore: number
): string {
  if (verdict === "BUY") {
    return buyScore >= 82 ? "GREAT FLIP" : "GOOD BUY";
  }
  if (verdict === "PASS") return "RISKY";
  return "MEH"; // CHECK
}
