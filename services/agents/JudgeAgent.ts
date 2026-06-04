/**
 * Evan AI — OPUS 4.9 JudgeAgent
 *
 * Produces the primary verdict. Wraps the existing dealEngine
 * fast verdict logic so the agent system builds on proven math.
 *
 * ONE job: given input, return BUY / PASS / CHECK with confidence.
 * Stateless. Deterministic. <1ms.
 */

import type { Agent, AgentContext, AgentResult, JudgeOutput } from "./AgentTypes";
import type { DealConfidence, DealVerdict } from "../dealEngine";
import { TuningService } from "../TuningService";

// ── Constants ──────────────────────────────────────────────────────────

const FLOOR_PRICE = 15;
const STALE_DATA_MS = 7 * 24 * 60 * 60 * 1000;

// ── Confidence → number mapping ────────────────────────────────────────

const CONFIDENCE_MAP: Record<DealConfidence, number> = {
  high: 0.9,
  medium: 0.65,
  low: 0.3,
};

// ── Agent ──────────────────────────────────────────────────────────────

export class JudgeAgent implements Agent<JudgeOutput> {
  name = "JudgeAgent";

  execute(ctx: AgentContext): AgentResult<JudgeOutput> {
    const t0 = performance.now();
    const { input } = ctx;
    const t = TuningService.getThresholds();

    const sp = input.scannedPrice ?? 0;
    const resale =
      input.estimatedResale ?? input.avgMarket ?? input.cheapestPrice ?? 0;
    const ratio = sp > 0 ? resale / sp : 0;
    const rawProfit = resale - sp;

    // ── Guardrails (same as dealEngine) ────────────────────────────
    if (sp > 0 && sp < FLOOR_PRICE) {
      return this._result("PASS", 0.3, ratio, rawProfit, t0);
    }

    const isStale =
      input.dataTimestamp != null &&
      Date.now() - input.dataTimestamp > STALE_DATA_MS;
    if (isStale) {
      return this._result("CHECK", 0.2, ratio, rawProfit, t0);
    }

    // ── Confidence from input quality ──────────────────────────────
    let qual: DealConfidence = "medium";
    if (input.visionConfidence >= 0.7 && input.totalMatches >= 8) {
      qual = "high";
    } else if (input.visionConfidence < 0.3 || input.totalMatches < 3) {
      qual = "low";
    }

    if (input.visionSource === "gemini" && qual === "low") {
      return this._result("CHECK", 0.2, ratio, rawProfit, t0);
    }
    if (resale <= 0 || qual === "low") {
      return this._result("CHECK", 0.2, ratio, rawProfit, t0);
    }

    // ── Verdict logic (SITT-tunable thresholds) ────────────────────
    let verdict: DealVerdict;
    if (sp > 0) {
      if (ratio >= t.buyRatio) verdict = "BUY";
      else if (ratio < t.passRatio) verdict = "PASS";
      else verdict = "CHECK";
    } else {
      if (input.buyScore >= 70) verdict = "BUY";
      else if (input.buyScore >= 46) verdict = "CHECK";
      else verdict = "PASS";
    }

    return this._result(verdict, CONFIDENCE_MAP[qual], ratio, rawProfit, t0);
  }

  private _result(
    verdict: DealVerdict,
    confidence: number,
    ratio: number,
    profit: number,
    t0: number,
  ): AgentResult<JudgeOutput> {
    return {
      result: { verdict, ratio, profit },
      confidence,
      latencyMs: Math.round((performance.now() - t0) * 100) / 100,
    };
  }
}
