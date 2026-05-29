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
 *
 * SITT Integration: thresholds (buyRatio, passRatio, minProfit) are now dynamic.
 * TuningService adjusts them based on realized flip outcomes.
 */

import { TuningService } from "./TuningService";

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

// ── Hot Deal Layer (HDL) ────────────────────────────────────────────────────

export type HotDealTier = "VIRAL" | "HOT" | "WARM" | "COLD";

export interface HotDeal {
  score: number;
  tier: HotDealTier;
  isTriggered: boolean;
  triggers: string[];
  hooks: {
    loss_framing: string | null;
    near_miss: boolean;
    near_miss_hint: string | null;
  };
}

// ── Paywall Revenue Engine ──────────────────────────────────────────────────

export type PaywallTriggerReason =
  | "ASPIRATION_VIRAL"
  | "ASPIRATION_HOT"
  | "ASPIRATION_PROFIT"
  | "LIMIT_REACHED"
  | "NONE";

export interface PaywallSignal {
  freeScansUsed: number;
  freeLimit: number;
  remaining: number;
  projectedValue: number;
  revenueOpportunity: number;
  unlockMessage?: string;
  /** Aspiration-based trigger reason (momentum, not depletion) */
  triggerReason: PaywallTriggerReason;
  /** Whether this is an aspiration trigger (high-momentum moment) */
  isAspirationTrigger: boolean;
}

// ── Viral Hook (Retention) ──────────────────────────────────────────────────

export interface ViralHook {
  shareText: string;
  urgencyScore: number;
}

export interface DealResult {
  fast: FastVerdict;
  deep: DeepAnalysis;
  hot_deal: HotDeal;
  viralHook: ViralHook | null;
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
const COMMISSION_RATE = 0.03; // 3% estimated platform commission
const PLATFORM_FEES: Record<string, number> = {
  ebay: 0.1313,     // 13.13% (final value + payment processing)
  mercari: 0.10,    // 10%
  poshmark: 0.20,   // 20%
  depop: 0.10,      // 10%
  facebook: 0.05,   // 5% (shipping label)
  offerup: 0.0,     // local = free
  craigslist: 0.0,
};

// ── Hot Deal Scoring (3-axis dopamine formula) ──────────────────────────────────

const HDL_TIER_VIRAL = 80;
const HDL_TIER_HOT   = 60;
const HDL_TIER_WARM  = 35;

/**
 * Calculate Hot Deal Score (S_hd) from 3 dopamine axes:
 *   1. Profit Shock  — raw dollar excitement
 *   2. Ratio Spike   — psychological "how many X" multiplier
 *   3. Liquidity Tension — "this will sell fast" urgency
 *
 * Pure function, <1ms compute. Does not block scan pipeline.
 */
function calculateHotDealScore(
  input: DealInput,
  deep: DeepAnalysis,
): HotDeal {
  const sp = input.scannedPrice ?? 0;
  const resale = input.estimatedResale ?? input.avgMarket ?? input.cheapestPrice ?? 0;
  const ratio = sp > 0 ? resale / sp : 0;
  const profit = deep.expected_profit;

  // ── Axis 1: Profit Shock (P_s) ────────────────────────────────────────────
  let profitScore = 0;
  if (profit > 50) profitScore = 40;
  else if (profit > 20) profitScore = 25;
  else if (profit > 10) profitScore = 15;
  else if (profit > 0) profitScore = 5;

  // ── Axis 2: Ratio Spike (R_s) ────────────────────────────────────────────
  let ratioScore = 0;
  if (ratio >= 2.5) ratioScore = 40;
  else if (ratio >= 1.8) ratioScore = 25;
  else if (ratio >= 1.3) ratioScore = 10;

  // ── Axis 3: Liquidity Tension (L_s) ──────────────────────────────────────
  const liq = (input.liquidity || "").toLowerCase();
  const matches = input.totalMatches;
  let liquidityScore = 0;
  if (liq === "very high" || liq === "high" || matches >= 20) liquidityScore = 20;
  else if (liq === "medium" || matches >= 8) liquidityScore = 10;
  else liquidityScore = 5;

  let score = profitScore + ratioScore + liquidityScore;

  // ── Risk penalty (guardrail — don't label risky deals as VIRAL) ───────────
  if (deep.risk_level === "high") score -= 20;
  else if (deep.risk_level === "medium") score -= 10;

  score = Math.max(0, Math.min(100, score));

  // ── Tier assignment ───────────────────────────────────────────────────────
  let tier: HotDealTier = "COLD";
  if (score >= HDL_TIER_VIRAL) tier = "VIRAL";
  else if (score >= HDL_TIER_HOT) tier = "HOT";
  else if (score >= HDL_TIER_WARM) tier = "WARM";

  // ── Dopamine triggers (TikTok-style badges) ──────────────────────────────
  const triggers: string[] = [];
  if (ratio >= 2) triggers.push("2x+ flip detected");
  if (profit > 30) triggers.push("HIGH PROFIT ALERT");
  if (deep.risk_level === "low") triggers.push("SAFE MONEY");
  if (deep.platform_best.toLowerCase() === "ebay") triggers.push("FAST LIQUID MARKET");

  // ── Behavioral hooks ──────────────────────────────────────────────────────
  let loss_framing: string | null = null;
  if (profit > 0) {
    loss_framing = `You'd miss ~$${Math.round(profit)} if skipped`;
  }

  // Near-miss: within 5 points of next tier up
  let near_miss = false;
  let near_miss_hint: string | null = null;
  if (tier === "COLD" && score >= HDL_TIER_WARM - 5) {
    near_miss = true;
    near_miss_hint = `${HDL_TIER_WARM - score} points from WARM deal status`;
  } else if (tier === "WARM" && score >= HDL_TIER_HOT - 5) {
    near_miss = true;
    const gap = HDL_TIER_HOT - score;
    near_miss_hint = `$${Math.max(1, Math.round(gap * 1.5))} more profit to reach HOT status`;
  } else if (tier === "HOT" && score >= HDL_TIER_VIRAL - 5) {
    near_miss = true;
    near_miss_hint = `${HDL_TIER_VIRAL - score} points from VIRAL`;
  }

  // isTriggered: only fire UI interruption for VIRAL/HOT on fresh BUY scans
  const isTriggered = tier === "VIRAL" || tier === "HOT";

  return {
    score,
    tier,
    isTriggered,
    triggers,
    hooks: { loss_framing, near_miss, near_miss_hint },
  };
}

// ── Viral Hook computation ──────────────────────────────────────────────────────

/**
 * Generate a shareable viral hook for deals scoring 60+.
 * Returns null for sub-HOT deals — no share text for weak finds.
 */
function computeViralHook(
  input: DealInput,
  deep: DeepAnalysis,
  hotScore: number,
): ViralHook | null {
  if (hotScore < HDL_TIER_HOT) return null;

  const price = input.scannedPrice ?? 0;
  const resale = input.estimatedResale ?? input.avgMarket ?? 0;
  const ratioStr = price > 0 ? (resale / price).toFixed(1) : "?";

  const shareText =
    `I just found a $${Math.round(price)} item that flips for ` +
    `$${Math.round(resale)} (${ratioStr}x) on Evan AI!`;

  // Map score 60–100 → urgency 40–100
  const urgencyScore = Math.min(
    100,
    Math.round(40 + ((hotScore - HDL_TIER_HOT) / (100 - HDL_TIER_HOT)) * 60),
  );

  return { shareText, urgencyScore };
}

// ── Engine ────────────────────────────────────────────────────────────────────────

/**
 * Phase 1: Fast Verdict — instant heuristic, <2ms compute.
 * Uses whatever signals are available. Never waits for anything.
 *
 * SITT: buyRatio and passRatio are now pulled from TuningService
 * dynamic thresholds instead of hardcoded 1.5 / 1.2.
 */
function computeFastVerdict(input: DealInput): FastVerdict {
  const sp = input.scannedPrice;
  const resale = input.estimatedResale ?? input.avgMarket ?? input.cheapestPrice;

  // Pull dynamic thresholds (sync read — no I/O, <0.01ms)
  const t = TuningService.getThresholds();

  // Estimated price: best available signal
  const estimated_price = resale ?? sp ?? 0;

  // ── Guardrail: Floor Rule ──────────────────────────────────────────────────
  // Spec: scanned_price < $15 → PASS (shipping/labor kills margin)
  if (sp != null && sp > 0 && sp < FLOOR_PRICE) {
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

  // ── Guardrail: Missing or low-confidence resale → CHECK ────────────────────
  if (resale == null || resale <= 0 || confidence === "low") {
    return { estimated_price, confidence: "low", verdict: "CHECK" };
  }

  // ── Verdict logic ──────────────────────────────────────────────────────────
  // Primary: ratio-based heuristic (SITT-tunable thresholds)
  if (sp != null && sp > 0) {
    const ratio = resale / sp;
    if (ratio >= t.buyRatio) return { estimated_price, confidence, verdict: "BUY" };
    if (ratio < t.passRatio) return { estimated_price, confidence, verdict: "PASS" };
    // passRatio ≤ ratio < buyRatio → CHECK
    return { estimated_price, confidence, verdict: "CHECK" };
  }

  // Secondary: use buyScore when scanned_price unavailable (graceful degradation)
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
  // Spec: potential_commission = resale_mid * 0.03
  const resaleMid = (deep.resale_range.low + deep.resale_range.high) / 2;
  const potential_commission =
    Math.round(resaleMid * COMMISSION_RATE * 100) / 100;

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
  hot_deal: {
    score: 0,
    tier: "COLD",
    isTriggered: false,
    triggers: [],
    hooks: { loss_framing: null, near_miss: false, near_miss_hint: null },
  },
  viralHook: null,
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
    // SITT: minProfit is now dynamic — TuningService adjusts it based on realized outcomes
    const t = TuningService.getThresholds();
    if (fast.verdict === "BUY" && deep.expected_profit < t.minProfit) {
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

    // ── Phase 3: Hot Deal Layer (non-blocking, <1ms) ────────────────────────
    const hot_deal = calculateHotDealScore(input, deep);

    // Only trigger HDL for BUY verdicts (emotion layer sits on top of logic)
    if (fast.verdict !== "BUY") {
      hot_deal.isTriggered = false;
    }

    // ── Phase 4: Viral Hook (share text for HOT+ deals) ────────────────────
    const viralHook = computeViralHook(input, deep, hot_deal.score);

    return { fast, deep, hot_deal, viralHook, _meta };
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
 * Maps a DealVerdict to the canonical three-state buyVerdict string.
 * BUY / PASS pass through; CHECK collapses to HOLD.
 */
export function dealVerdictToBuyVerdict(verdict: DealVerdict): "BUY" | "HOLD" | "PASS" {
  if (verdict === "BUY") return "BUY";
  if (verdict === "PASS") return "PASS";
  return "HOLD";
}

// ── Paywall Revenue Engine ──────────────────────────────────────────────────────

/**
 * Compute paywall signal from scan state + deal profit + hot deal tier.
 * Called from the UI layer (needs subscription state the engine doesn't own).
 *
 * Zero-blocking: purely descriptive — never stops a scan mid-flow.
 *
 * Aspiration Engine: triggers on high-momentum moments (HOT/VIRAL deals),
 * not just scan depletion. Shows "Value Missed" to drive upgrades.
 */
export function computePaywallSignal(
  freeScansUsed: number,
  freeLimit: number,
  expectedProfit: number,
  hotDealTier?: HotDealTier,
): PaywallSignal {
  const remaining = Math.max(0, freeLimit - freeScansUsed);
  const projectedValue = Math.round(expectedProfit);
  const revenueOpportunity = Math.round(expectedProfit * 0.15 * 100) / 100;

  // ── Aspiration trigger classification ─────────────────────────────────
  let triggerReason: PaywallTriggerReason = "NONE";
  if (hotDealTier === "VIRAL") {
    triggerReason = "ASPIRATION_VIRAL";
  } else if (hotDealTier === "HOT") {
    triggerReason = "ASPIRATION_HOT";
  } else if (expectedProfit >= 20) {
    triggerReason = "ASPIRATION_PROFIT";
  } else if (remaining <= 0) {
    triggerReason = "LIMIT_REACHED";
  }

  const isAspirationTrigger =
    triggerReason === "ASPIRATION_VIRAL" ||
    triggerReason === "ASPIRATION_HOT" ||
    triggerReason === "ASPIRATION_PROFIT";

  // ── Copy: aspiration-first, limit-second ──────────────────────────────
  let unlockMessage: string | undefined;
  if (isAspirationTrigger && projectedValue > 0) {
    unlockMessage =
      `You just found ~$${projectedValue} in profit. ` +
      `Pro users see 3\u20135x more opportunities like this.`;
  } else if (remaining <= 1 && projectedValue > 0) {
    unlockMessage =
      `This scan identified ~$${projectedValue} in profit. ` +
      `Upgrade to unlock unlimited Viral Deal alerts.`;
  } else if (remaining <= 1) {
    unlockMessage =
      "You're one scan away from unlocking HOT DEAL detection boosts";
  }

  return {
    freeScansUsed,
    freeLimit,
    remaining,
    projectedValue,
    revenueOpportunity,
    unlockMessage,
    triggerReason,
    isAspirationTrigger,
  };
}
