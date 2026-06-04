/**
 * Evan AI — OPUS 4.9 PredictorAgent
 *
 * Forecasts the expected outcome of a deal.
 * Computes expected profit after platform fees, selects best platform.
 *
 * ONE job: given input, forecast profit + upside probability.
 * Stateless. Deterministic. <1ms.
 */

import type { Agent, AgentContext, AgentResult, PredictorOutput } from "./AgentTypes";

// ── Platform fee table ─────────────────────────────────────────────────

const PLATFORM_FEES: Record<string, number> = {
  ebay: 0.1313,
  mercari: 0.10,
  poshmark: 0.20,
  depop: 0.10,
  facebook: 0.05,
  offerup: 0.0,
  craigslist: 0.0,
};

// ── Agent ──────────────────────────────────────────────────────────────

export class PredictorAgent implements Agent<PredictorOutput> {
  name = "PredictorAgent";

  execute(ctx: AgentContext): AgentResult<PredictorOutput> {
    const t0 = performance.now();
    const { input } = ctx;

    const sp = input.scannedPrice ?? 0;
    const resale =
      input.estimatedResale ?? input.avgMarket ?? input.cheapestPrice ?? 0;

    // ── Select best platform ───────────────────────────────────────
    const bestPlatform = this._inferPlatform(input);
    const feeRate = PLATFORM_FEES[bestPlatform.toLowerCase()] ?? 0.10;
    const feesEstimate = Math.round(resale * feeRate * 100) / 100;

    // ── Expected profit ────────────────────────────────────────────
    const rawProfit = input.expectedProfit ?? (resale - sp);
    const expectedProfit = Math.max(0, Math.round((rawProfit - feesEstimate) * 100) / 100);

    // ── Upside probability ─────────────────────────────────────────
    // Based on ratio strength + market depth + vision confidence + spread
    const ratio = sp > 0 ? resale / sp : 0;
    let upside = 0;

    if (ratio >= 2.0) upside = 0.85;
    else if (ratio >= 1.5) upside = 0.70;
    else if (ratio >= 1.2) upside = 0.50;
    else if (ratio >= 1.0) upside = 0.30;
    else upside = 0.10;

    // Market depth modifier
    if (input.totalMatches >= 20) upside = Math.min(1, upside + 0.10);
    else if (input.totalMatches < 3) upside = Math.max(0, upside - 0.15);

    // Vision confidence modifier
    if (input.visionConfidence < 0.3) upside = Math.max(0, upside - 0.20);

    // Spread-aware modifier: tight spread = more predictable, boost upside
    // Wide spread = volatile pricing, reduce upside
    if (input.spreadLow != null && input.spreadHigh != null && input.avgMarket && input.avgMarket > 0) {
      const spreadPct = ((input.spreadHigh - input.spreadLow) / input.avgMarket) * 100;
      if (spreadPct < 15) {
        upside = Math.min(1, upside + 0.08); // tight spread — predictable market
      } else if (spreadPct > 60) {
        upside = Math.max(0, upside - 0.10); // wide spread — volatile pricing
      }
    }

    // Resale velocity modifier
    const velocity = (input.resaleVelocity || "").toLowerCase();
    if (velocity === "fast") upside = Math.min(1, upside + 0.05);
    else if (velocity === "slow") upside = Math.max(0, upside - 0.08);

    upside = Math.round(upside * 100) / 100;

    // ── Confidence = f(data completeness) ──────────────────────────
    let confidence = 0.5;
    if (sp > 0 && resale > 0 && input.totalMatches >= 8) confidence = 0.8;
    else if (sp > 0 && resale > 0) confidence = 0.6;
    else confidence = 0.3;

    return {
      result: { expectedProfit, upsideProbability: upside, bestPlatform, feesEstimate },
      confidence,
      latencyMs: Math.round((performance.now() - t0) * 100) / 100,
    };
  }

  private _inferPlatform(input: { category: string | null; store: string | null; liquidity: string | null }): string {
    const cat = (input.category || "").toLowerCase();
    if (/(sneaker|jordan|nike|adidas|shoe)/.test(cat)) return "eBay";
    if (/(luxury|louis vuitton|gucci|prada|coach)/.test(cat)) return "Poshmark";
    if (/(electronics|iphone|ipad|ps5|xbox|camera)/.test(cat)) return "eBay";
    if (/(vintage|antique|collectible|comic|trading card)/.test(cat)) return "eBay";

    const liq = (input.liquidity || "").toLowerCase();
    if (liq === "very high" || liq === "high") return "eBay";
    if (liq === "low") return "Facebook Marketplace";

    return "eBay";
  }
}
