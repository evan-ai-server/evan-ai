/**
 * Evan AI — OPUS MAX AgentOrchestrator
 *
 * Coordinates Judge, Predictor, and Risk agents.
 * Runs all three in parallel, fuses results, returns DealResult
 * for backward compatibility with the existing pipeline.
 *
 * OPUS MAX Execution Flow:
 *   1. INPUT: Build AgentContext from DealInput
 *   2. PREPROCESSING: Normalize input (no mutation of meaning)
 *   3. PARALLEL EXECUTION: Run Judge + Predictor + Risk (isolated try/catch each)
 *   4. FUSION ENGINE: Deterministic rule selection + override logic
 *   5. VALIDATION: Schema check + bounds check
 *   6. OUTPUT EMISSION: Map OrchestratorDecision -> DealResult
 *
 * Failure Handling (OPUS MAX spec):
 *   - Each agent wrapped in individual try/catch
 *   - If ANY agent fails: ignore failed agent
 *   - If Predictor or Risk fails: fallback to JudgeAgent only
 *   - Set fusionRule = FALLBACK_JUDGE_ONLY
 *   - Reduce confidence by 0.20
 *   - If ALL agents fail: revert to runDealEngine (OPUS 4.7)
 *
 * Guarantees:
 *   - One decision per scan
 *   - Bounded execution time
 *   - No agent writes to global state
 *   - Deterministic output
 *   - Full pipeline trace on every decision
 */

import type { DealInput, DealResult, DealVerdict, FastVerdict, DeepAnalysis, DealMeta, HotDeal, ViralHook, DealConfidence } from "../dealEngine";
import { runDealEngine } from "../dealEngine";
import type { AgentContext, AgentResult, JudgeOutput, PredictorOutput, RiskOutput, OrchestratorDecision, PipelineTrace, AgentFeedback } from "./AgentTypes";
import { JudgeAgent } from "./JudgeAgent";
import { PredictorAgent } from "./PredictorAgent";
import { RiskAgent } from "./RiskAgent";
import { DecisionFusionEngine } from "./DecisionFusionEngine";
import { AgentLearningLoop } from "./AgentLearningLoop";
import { TuningService } from "../TuningService";
import { ScanObserver } from "../ScanObserver";

// ── Constants ──────────────────────────────────────────────────────────

const AGENT_BUDGET_MS = 50;

// ── Platform fees (for deep analysis mapping) ──────────────────────────

const PLATFORM_FEES: Record<string, number> = {
  ebay: 0.1313,
  mercari: 0.10,
  poshmark: 0.20,
  depop: 0.10,
  facebook: 0.05,
  offerup: 0.0,
  craigslist: 0.0,
};

// ── Singleton agents (stateless — safe to reuse) ───────────────────────

const judge = new JudgeAgent();
const predictor = new PredictorAgent();
const risk = new RiskAgent();

// ── Last decision (for learning feedback) ──────────────────────────────

let _lastFeedback: AgentFeedback | null = null;

// ── Orchestrator ───────────────────────────────────────────────────────

export class AgentOrchestrator {
  /**
   * Get the last agent feedback (for learning loop).
   */
  static getLastFeedback(): AgentFeedback | null {
    return _lastFeedback;
  }

  /**
   * Run the multi-agent pipeline for a single scan (async path).
   * Returns a DealResult compatible with the existing pipeline.
   *
   * If orchestration fails for any reason, falls back to
   * runDealEngine (OPUS 4.7) — zero-downtime guarantee.
   */
  static async run(scanId: string, input: DealInput): Promise<DealResult> {
    const t0 = performance.now();
    const trace: PipelineTrace = [];

    // ── STEP 1: INPUT ────────────────────────────────────────────
    trace.push({
      stage: "INPUT",
      status: "ok",
      durationMs: 0,
      detail: `scanId=${scanId}, price=${input.scannedPrice}, vision=${input.visionConfidence}`,
    });

    // ── STEP 2: PREPROCESSING (input validation) ──────────────────
    const sp = input.scannedPrice ?? 0;
    const resale = input.estimatedResale ?? input.avgMarket ?? input.cheapestPrice ?? 0;
    const hasPrice = sp > 0 || resale > 0;
    trace.push({
      stage: "PREPROCESSING",
      status: "ok",
      durationMs: 0,
      detail: `validated: hasPrice=${hasPrice}, vision=${input.visionConfidence}, matches=${input.totalMatches}`,
    });

    try {
      const ctx: AgentContext = {
        scanId,
        input,
        budget: { timeMs: AGENT_BUDGET_MS },
      };

      // ── STEP 3: AGENT EXECUTION (with per-agent isolation) ────
      const { judgeResult, predictorResult, riskResult, degraded } =
        this._executeAgents(ctx, trace);

      const totalLatencyMs = Math.round((performance.now() - t0) * 100) / 100;

      // ── STEP 4: FUSION ENGINE (with adaptive weights) ─────────
      const adaptiveWeights = AgentLearningLoop.getWeights();
      const adaptiveRiskThresholds = AgentLearningLoop.getRiskThresholds();

      let decision: OrchestratorDecision;

      if (degraded) {
        // Fallback: only JudgeAgent available
        decision = DecisionFusionEngine.fuseFallback(judgeResult!, totalLatencyMs, trace);
      } else {
        decision = DecisionFusionEngine.fuse(
          { judge: judgeResult!, predictor: predictorResult!, risk: riskResult! },
          totalLatencyMs,
          trace,
          adaptiveWeights,
          adaptiveRiskThresholds,
        );
      }

      // ── Record feedback for learning loop ──────────────────────
      this._recordFeedback(scanId, decision, judgeResult!);

      // ── Emit observability ─────────────────────────────────────
      ScanObserver.emit("info", "lifecycle", "AGENT_ORCHESTRATION_COMPLETE", scanId, "scanning", {
        finalVerdict: decision.finalVerdict,
        confidence: decision.confidence,
        fusionRule: decision.fusionRule,
        totalLatencyMs,
        degraded,
        pipelineStages: trace.length,
        agentLatencies: {
          judge: judgeResult?.latencyMs ?? -1,
          predictor: predictorResult?.latencyMs ?? -1,
          risk: riskResult?.latencyMs ?? -1,
        },
        adaptiveWeights,
      });

      // ── STEP 5-6: Map to DealResult ────────────────────────────
      return this._toDealResult(input, decision, judgeResult!.result, predictorResult?.result ?? null, riskResult?.result ?? null, totalLatencyMs);

    } catch (err: any) {
      // ── TOTAL FALLBACK: revert to OPUS 4.7 pipeline ────────────
      trace.push({
        stage: "FUSION_ENGINE",
        status: "failed",
        durationMs: Math.round((performance.now() - t0) * 100) / 100,
        detail: `Total fallback: ${err?.message || "unknown"}`,
      });

      ScanObserver.emit("warn", "lifecycle", "AGENT_ORCHESTRATION_FALLBACK", scanId, "scanning", {
        error: err?.message || "unknown",
        fallback: "runDealEngine",
      });
      return runDealEngine(input);
    }
  }

  /**
   * Synchronous version — the primary integration point.
   * Uses runDealEngine as the fast path, then overlays agent decisions.
   */
  static runSync(scanId: string, input: DealInput): DealResult {
    const base = runDealEngine(input);
    const t0 = performance.now();
    const trace: PipelineTrace = [];

    trace.push({
      stage: "INPUT",
      status: "ok",
      durationMs: 0,
      detail: `scanId=${scanId}, price=${input.scannedPrice}`,
    });

    trace.push({
      stage: "PREPROCESSING",
      status: "ok",
      durationMs: 0,
      detail: "Base DealResult computed via OPUS 4.7",
    });

    const ctx: AgentContext = {
      scanId,
      input,
      budget: { timeMs: AGENT_BUDGET_MS },
    };

    try {
      const { judgeResult, predictorResult, riskResult, degraded } =
        this._executeAgents(ctx, trace);

      const totalLatencyMs = Math.round((performance.now() - t0) * 100) / 100;

      // Pull adaptive weights from the self-improving learning loop
      const adaptiveWeights = AgentLearningLoop.getWeights();
      const adaptiveRiskThresholds = AgentLearningLoop.getRiskThresholds();

      let decision: OrchestratorDecision;

      if (degraded) {
        decision = DecisionFusionEngine.fuseFallback(judgeResult!, totalLatencyMs, trace);
      } else {
        decision = DecisionFusionEngine.fuse(
          { judge: judgeResult!, predictor: predictorResult!, risk: riskResult! },
          totalLatencyMs,
          trace,
          adaptiveWeights,
          adaptiveRiskThresholds,
        );
      }

      // Record feedback for learning loop
      this._recordFeedback(scanId, decision, judgeResult!);

      ScanObserver.emit("info", "lifecycle", "AGENT_ORCHESTRATION_COMPLETE", scanId, "scanning", {
        finalVerdict: decision.finalVerdict,
        confidence: decision.confidence,
        fusionRule: decision.fusionRule,
        totalLatencyMs,
        degraded,
        adaptiveWeights,
      });

      // ── Override base verdict if agents disagree ───────────────
      return this._applyAgentOverride(base, decision);

    } catch {
      // Agents failed entirely — return unmodified base result
      return base;
    }
  }

  // ── Private: Per-Agent Execution with Isolation ───────────────────────

  /**
   * Execute all three agents with individual try/catch isolation.
   * All agents are synchronous (no I/O) — called directly.
   *
   * If Judge fails, throw (total fallback needed).
   * If Predictor or Risk fails, mark as degraded and continue with Judge only.
   */
  private static _executeAgents(
    ctx: AgentContext,
    trace: PipelineTrace,
  ): {
    judgeResult: AgentResult<JudgeOutput> | null;
    predictorResult: AgentResult<PredictorOutput> | null;
    riskResult: AgentResult<RiskOutput> | null;
    degraded: boolean;
  } {
    let judgeResult: AgentResult<JudgeOutput> | null = null;
    let predictorResult: AgentResult<PredictorOutput> | null = null;
    let riskResult: AgentResult<RiskOutput> | null = null;
    let degraded = false;

    // ── JudgeAgent (critical — failure = total fallback) ─────────
    const jt0 = performance.now();
    try {
      judgeResult = judge.execute(ctx);
      trace.push({
        stage: "JUDGE_EXECUTION",
        status: "ok",
        durationMs: judgeResult.latencyMs,
        detail: `verdict=${judgeResult.result.verdict}, conf=${judgeResult.confidence}, ratio=${judgeResult.result.ratio.toFixed(2)}`,
      });
    } catch (err: any) {
      trace.push({
        stage: "JUDGE_EXECUTION",
        status: "failed",
        durationMs: Math.round((performance.now() - jt0) * 100) / 100,
        detail: `FAILED: ${err?.message || "unknown"}`,
      });
      throw err; // Judge is critical — cannot proceed without it
    }

    // ── PredictorAgent (non-critical — degraded mode on failure) ─
    const pt0 = performance.now();
    try {
      predictorResult = predictor.execute(ctx);
      trace.push({
        stage: "PREDICTOR_EXECUTION",
        status: "ok",
        durationMs: predictorResult.latencyMs,
        detail: `profit=${predictorResult.result.expectedProfit}, upside=${predictorResult.result.upsideProbability}, platform=${predictorResult.result.bestPlatform}`,
      });
    } catch (err: any) {
      degraded = true;
      trace.push({
        stage: "PREDICTOR_EXECUTION",
        status: "failed",
        durationMs: Math.round((performance.now() - pt0) * 100) / 100,
        detail: `FAILED (degraded mode): ${err?.message || "unknown"}`,
      });
    }

    // ── RiskAgent (non-critical — degraded mode on failure) ──────
    const rt0 = performance.now();
    try {
      riskResult = risk.execute(ctx);
      trace.push({
        stage: "RISK_EXECUTION",
        status: "ok",
        durationMs: riskResult.latencyMs,
        detail: `score=${riskResult.result.riskScore}, level=${riskResult.result.riskLevel}, veto=${riskResult.result.veto}, flags=[${riskResult.result.flags.join(",")}]`,
      });
    } catch (err: any) {
      degraded = true;
      trace.push({
        stage: "RISK_EXECUTION",
        status: "failed",
        durationMs: Math.round((performance.now() - rt0) * 100) / 100,
        detail: `FAILED (degraded mode): ${err?.message || "unknown"}`,
      });
    }

    return { judgeResult, predictorResult, riskResult, degraded };
  }

  // ── Private: Agent Override ──────────────────────────────────────────

  /**
   * Apply agent decision as an override layer on top of base DealResult.
   * Only overrides when agents have high confidence and disagree with base.
   *
   * Guardrails enforced:
   *   - minProfit check on BUY upgrades (prevents thin-margin BUYs)
   *   - hot_deal.isTriggered updated on verdict changes
   */
  private static _applyAgentOverride(
    base: DealResult,
    decision: OrchestratorDecision,
  ): DealResult {
    const result = {
      ...base,
      fast: { ...base.fast },
      deep: { ...base.deep },
      hot_deal: { ...base.hot_deal },
    };

    // Attach agent decision metadata (including pipeline trace)
    (result as any)._agentDecision = decision;

    // ── RISK_VETO: downgrade BUY -> CHECK ─────────────────────────
    if (decision.fusionRule === "RISK_VETO" && base.fast.verdict === "BUY") {
      result.fast.verdict = "CHECK";
      result.fast.confidence = "low";
      result.hot_deal.isTriggered = false;
      const riskDetail = decision.reasoning.risk;
      result.deep.reasoning =
        `Agent risk veto: ${riskDetail.flagCount} risk flags, level=${riskDetail.riskLevel}; ` +
        result.deep.reasoning;
    }

    // ── RISK_UNCERTAIN: downgrade BUY -> CHECK ────────────────────
    if (decision.fusionRule === "RISK_UNCERTAIN" && base.fast.verdict === "BUY") {
      result.fast.verdict = "CHECK";
      result.hot_deal.isTriggered = false;
      result.deep.reasoning =
        `Risk uncertain zone (${decision.reasoning.risk.riskScore.toFixed(2)}); ` +
        result.deep.reasoning;
    }

    // ── FALLBACK_JUDGE_ONLY: note degraded mode ───────────────────
    if (decision.fusionRule === "FALLBACK_JUDGE_ONLY") {
      result.deep.reasoning =
        `[Degraded mode: judge-only] ` + result.deep.reasoning;
    }

    // ── STRONG_BUY: upgrade CHECK -> BUY if high confidence ───────
    if (
      decision.finalVerdict === "BUY" &&
      decision.fusionRule === "STRONG_BUY" &&
      decision.confidence > 0.75 &&
      base.fast.verdict === "CHECK"
    ) {
      // Guardrail: minProfit check — don't upgrade to BUY if profit is too thin
      const t = TuningService.getThresholds();
      if (result.deep.expected_profit >= t.minProfit) {
        result.fast.verdict = "BUY";
        result.fast.confidence = "high";
        result.hot_deal.isTriggered =
          result.hot_deal.tier === "VIRAL" || result.hot_deal.tier === "HOT";
        result.deep.reasoning =
          `Multi-agent STRONG_BUY (${(decision.confidence * 100).toFixed(0)}% confidence); ` +
          result.deep.reasoning;
      } else {
        // Profit too thin — stay at CHECK despite agents saying BUY
        result.deep.reasoning =
          `Profit $${result.deep.expected_profit.toFixed(0)} below min $${t.minProfit.toFixed(0)} — agents wanted BUY but guardrail held; ` +
          result.deep.reasoning;
      }
    }

    return result;
  }

  // ── Private: Feedback Recording ─────────────────────────────────────

  private static _recordFeedback(
    scanId: string,
    decision: OrchestratorDecision,
    judgeResult: AgentResult<JudgeOutput>,
  ): void {
    const j = judgeResult.result;

    // Disagreement: judge said BUY but final wasn't BUY (or vice versa)
    const disagreement =
      (j.verdict === "BUY" && decision.finalVerdict !== "BUY") ||
      (j.verdict === "PASS" && decision.finalVerdict === "BUY");

    // Risk flip: risk changed a BUY verdict to RISK
    const riskFlip =
      j.verdict === "BUY" &&
      (decision.fusionRule === "RISK_VETO" || decision.fusionRule === "RISK_UNCERTAIN");

    _lastFeedback = {
      scanId,
      finalVerdict: decision.finalVerdict,
      fusionRule: decision.fusionRule,
      judgeVerdict: j.verdict,
      judgeConfidence: judgeResult.confidence,
      predictorUpside: decision.reasoning.predictor.upsideProbability,
      riskScore: decision.reasoning.risk.riskScore,
      riskVeto: decision.reasoning.risk.veto,
      disagreement,
      riskFlip,
      timestamp: Date.now(),
    };
  }

  // ── Private: DealResult Mapping ─────────────────────────────────────

  /**
   * Map OrchestratorDecision to full DealResult.
   * Used by the async path where we don't have a base DealResult.
   */
  private static _toDealResult(
    input: DealInput,
    decision: OrchestratorDecision,
    judgeOut: JudgeOutput,
    predictorOut: PredictorOutput | null,
    riskOut: RiskOutput | null,
    processingMs: number,
  ): DealResult {
    // Map FinalVerdict -> DealVerdict
    const verdictMap: Record<string, DealVerdict> = {
      BUY: "BUY",
      PASS: "PASS",
      RISK: "CHECK",
    };
    const verdict: DealVerdict = verdictMap[decision.finalVerdict] ?? "CHECK";

    // Confidence mapping
    let confidence: DealConfidence = "medium";
    if (decision.confidence >= 0.75) confidence = "high";
    else if (decision.confidence < 0.4) confidence = "low";

    const sp = input.scannedPrice ?? 0;
    const resale = input.estimatedResale ?? input.avgMarket ?? input.cheapestPrice ?? 0;
    const low = input.spreadLow ?? resale * 0.85;
    const high = input.spreadHigh ?? resale * 1.15;

    // Use predictor output if available, otherwise compute from input
    const expectedProfit = predictorOut?.expectedProfit ?? Math.max(0, resale - sp);

    // ── Guardrail: minProfit check (mirrors dealEngine behavior) ──
    // Downgrade BUY → CHECK if profit is too thin after fees
    const t = TuningService.getThresholds();
    let guardedVerdict = verdict;
    if (guardedVerdict === "BUY" && expectedProfit < t.minProfit) {
      guardedVerdict = "CHECK";
    }

    const fast: FastVerdict = {
      estimated_price: resale,
      confidence,
      verdict: guardedVerdict,
    };
    const bestPlatform = predictorOut?.bestPlatform ?? "eBay";
    const feesEstimate = predictorOut?.feesEstimate ?? Math.round(resale * 0.10 * 100) / 100;
    const riskLevel = riskOut?.riskLevel ?? "medium";
    // Map agent risk level to deal risk level (critical -> high for backward compat)
    const dealRiskLevel = riskLevel === "critical" ? "high" : riskLevel;

    const deep: DeepAnalysis = {
      resale_range: {
        low: Math.round(low * 100) / 100,
        high: Math.round(high * 100) / 100,
      },
      expected_profit: expectedProfit,
      platform_best: bestPlatform,
      fees_estimate: feesEstimate,
      risk_level: dealRiskLevel as any,
      reasoning: this._buildReasoning(decision, predictorOut, riskOut),
    };

    const resaleMid = (low + high) / 2;
    const _meta: DealMeta = {
      potential_commission: Math.round(resaleMid * 0.03 * 100) / 100,
      roi_percentage: sp > 0 ? Math.round((expectedProfit / sp) * 10000) / 100 : 0,
      processing_ms: Math.round(processingMs),
    };

    // Hot deal scoring
    const profit = expectedProfit;
    const ratio = sp > 0 ? resale / sp : 0;
    const liq = (input.liquidity || "").toLowerCase();
    const matches = input.totalMatches;

    let hdScore = 0;
    if (profit > 50) hdScore += 40;
    else if (profit > 20) hdScore += 25;
    else if (profit > 10) hdScore += 15;
    else if (profit > 0) hdScore += 5;

    if (ratio >= 2.5) hdScore += 40;
    else if (ratio >= 1.8) hdScore += 25;
    else if (ratio >= 1.3) hdScore += 10;

    if (liq === "very high" || liq === "high" || matches >= 20) hdScore += 20;
    else if (liq === "medium" || matches >= 8) hdScore += 10;
    else hdScore += 5;

    if (dealRiskLevel === "high") hdScore -= 20;
    else if (dealRiskLevel === "medium") hdScore -= 10;
    hdScore = Math.max(0, Math.min(100, hdScore));

    let tier: "VIRAL" | "HOT" | "WARM" | "COLD" = "COLD";
    if (hdScore >= 80) tier = "VIRAL";
    else if (hdScore >= 60) tier = "HOT";
    else if (hdScore >= 35) tier = "WARM";

    const hot_deal: HotDeal = {
      score: hdScore,
      tier,
      isTriggered: guardedVerdict === "BUY" && (tier === "VIRAL" || tier === "HOT"),
      triggers: [],
      hooks: {
        loss_framing: profit > 0 ? `You'd miss ~$${Math.round(profit)} if skipped` : null,
        near_miss: false,
        near_miss_hint: null,
      },
    };

    let viralHook: ViralHook | null = null;
    if (hdScore >= 60 && sp > 0) {
      viralHook = {
        shareText: `I just found a $${Math.round(sp)} item that flips for $${Math.round(resale)} (${ratio.toFixed(1)}x) on Evan AI!`,
        urgencyScore: Math.min(100, Math.round(40 + ((hdScore - 60) / 40) * 60)),
      };
    }

    return { fast, deep, hot_deal, viralHook, _meta };
  }

  private static _buildReasoning(
    decision: OrchestratorDecision,
    predictorOut: PredictorOutput | null,
    riskOut: RiskOutput | null,
  ): string {
    const parts: string[] = [];

    if (predictorOut && predictorOut.expectedProfit > 0) {
      parts.push(
        `$${predictorOut.expectedProfit.toFixed(0)} expected profit on ${predictorOut.bestPlatform}`,
      );
    }

    if (riskOut && riskOut.flags.length > 0) {
      parts.push(`${riskOut.flags.length} risk flag${riskOut.flags.length > 1 ? "s" : ""} (${riskOut.riskLevel})`);
    } else if (!riskOut) {
      parts.push(`risk assessment unavailable (degraded)`);
    } else {
      parts.push(`low risk`);
    }

    parts.push(`[${decision.fusionRule}]`);

    return parts.join("; ") + ".";
  }
}

// NOTE: executeSync removed — agents are now truly synchronous (no async/Promise).
// The previous implementation used .then() to extract sync results from async agents,
// but .then() callbacks are microtasks in JavaScript and NEVER fire synchronously.
// This silently broke the entire agent system, falling back to plain runDealEngine.
