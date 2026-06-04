/**
 * Evan AI — OPUS MAX RiskAgent
 *
 * Identifies uncertainty, anomalies, and risk.
 * Has VETO POWER — if veto is true, orchestrator MUST return RISK.
 *
 * OPUS MAX upgrades:
 *   - CRITICAL risk level (score >= 0.75) — auto-veto, no exceptions
 *   - Tighter flag scoring with weighted contributions
 *   - Combined-flag escalation (multiple flags compound risk)
 *   - Category-aware risk modifiers
 *
 * ONE job: assess risk and flag dangers.
 * Stateless. Deterministic. <1ms.
 */

import type { Agent, AgentContext, AgentResult, RiskOutput, AgentRiskLevel } from "./AgentTypes";
import { TuningService } from "../TuningService";

// ── Constants ──────────────────────────────────────────────────────────

const STALE_DATA_MS = 7 * 24 * 60 * 60 * 1000;

// ── Risk thresholds ───────────────────────────────────────────────────

const RISK_CRITICAL = 0.75;
const RISK_HIGH = 0.55;
const RISK_MEDIUM = 0.30;

// ── Agent ──────────────────────────────────────────────────────────────

export class RiskAgent implements Agent<RiskOutput> {
  name = "RiskAgent";

  execute(ctx: AgentContext): AgentResult<RiskOutput> {
    const t0 = performance.now();
    const { input } = ctx;

    const flags: string[] = [];
    let score = 0;

    // ── Vision confidence ──────────────────────────────────────────
    if (input.visionConfidence < 0.2) {
      score += 0.30;
      flags.push("LOW_VISION_CONFIDENCE");
    } else if (input.visionConfidence < 0.4) {
      score += 0.15;
      flags.push("MODERATE_VISION_CONFIDENCE");
    }

    // ── Market depth ───────────────────────────────────────────────
    if (input.totalMatches < 2) {
      score += 0.30;
      flags.push("THIN_MARKET");
    } else if (input.totalMatches < 5) {
      score += 0.15;
      flags.push("LIMITED_COMPS");
    }

    // ── Price spread volatility ────────────────────────────────────
    if (input.spreadLow != null && input.spreadHigh != null && input.avgMarket) {
      const spreadPct =
        ((input.spreadHigh - input.spreadLow) / input.avgMarket) * 100;
      if (spreadPct > 80) {
        score += 0.25;
        flags.push("EXTREME_PRICE_VOLATILITY");
      } else if (spreadPct > 50) {
        score += 0.15;
        flags.push("HIGH_PRICE_VOLATILITY");
      } else if (spreadPct > 30) {
        score += 0.08;
        flags.push("MODERATE_VOLATILITY");
      }
    }

    // ── Margin risk ────────────────────────────────────────────────
    const sp = input.scannedPrice ?? 0;
    const resale = input.estimatedResale ?? input.avgMarket ?? input.cheapestPrice ?? 0;
    const rawProfit = input.expectedProfit ?? (resale - sp);
    if (sp > 0 && rawProfit / sp < 0.05) {
      score += 0.20;
      flags.push("THIN_MARGIN");
    } else if (sp > 0 && rawProfit / sp < 0.15) {
      score += 0.10;
      flags.push("NARROW_MARGIN");
    }

    // ── Stale data ─────────────────────────────────────────────────
    if (
      input.dataTimestamp != null &&
      Date.now() - input.dataTimestamp > STALE_DATA_MS
    ) {
      score += 0.20;
      flags.push("STALE_DATA");
    }

    // ── Floor price ────────────────────────────────────────────────
    if (sp > 0 && sp < 15) {
      score += 0.15;
      flags.push("BELOW_FLOOR_PRICE");
    }

    // ── High-ticket item risk ────────────────────────────────────
    if (sp > 500 && rawProfit > 0 && rawProfit / sp < 0.20) {
      score += 0.10;
      flags.push("HIGH_CAPITAL_RISK");
    }

    // ── Category-aware risk ──────────────────────────────────────
    const cat = (input.category || "").toLowerCase();
    if (/(luxury|gucci|louis|prada|rolex|designer)/.test(cat)) {
      if (input.visionConfidence < 0.6) {
        score += 0.10;
        flags.push("LUXURY_AUTH_RISK");
      }
    }

    // ── Compound risk escalation ───────────────────────────────────
    if (flags.length >= 4) {
      score += 0.10;
    }

    // ── SITT riskTolerance adjustment ─────────────────────────────
    const t = TuningService.getThresholds();
    const toleranceAdjust = (0.5 - t.riskTolerance) * 0.10;
    score += toleranceAdjust;

    // ── Clamp ──────────────────────────────────────────────────────
    score = Math.min(1, Math.max(0, Math.round(score * 1000) / 1000));

    // ── Risk level (OPUS MAX: includes CRITICAL tier) ──────────────
    let riskLevel: AgentRiskLevel;
    if (score >= RISK_CRITICAL) riskLevel = "critical";
    else if (score >= RISK_HIGH) riskLevel = "high";
    else if (score >= RISK_MEDIUM) riskLevel = "medium";
    else riskLevel = "low";

    // ── Veto logic (OPUS MAX: CRITICAL always vetoes) ──────────────
    // Veto if:
    //   1. CRITICAL risk (unconditional)
    //   2. HIGH risk AND (low vision OR thin market)
    const hasLowVision = input.visionConfidence < 0.3;
    const hasThinMarket = input.totalMatches < 3;

    let veto = false;
    let vetoReason: string | null = null;

    if (riskLevel === "critical") {
      veto = true;
      vetoReason = `CRITICAL risk (${score.toFixed(2)}): ${flags.join(", ")}`;
    } else if (riskLevel === "high" && (hasLowVision || hasThinMarket)) {
      veto = true;
      vetoReason = `High risk (${score.toFixed(2)}) with ${hasLowVision ? "low vision confidence" : "thin market"}`;
    }

    // ── Confidence = certainty about the assessment ────────────────
    // More flags = more data points = more certain about risk
    let confidence: number;
    if (flags.length >= 4) confidence = 0.95;
    else if (flags.length >= 3) confidence = 0.85;
    else if (flags.length >= 2) confidence = 0.75;
    else if (flags.length >= 1) confidence = 0.65;
    else confidence = 0.50;

    return {
      result: { riskScore: score, riskLevel, flags, veto, vetoReason },
      confidence,
      latencyMs: Math.round((performance.now() - t0) * 100) / 100,
    };
  }
}
