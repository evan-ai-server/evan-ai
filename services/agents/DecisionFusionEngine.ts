/**
 * Evan AI — OPUS MAX DecisionFusionEngine
 *
 * Deterministic, rule-based decision synthesis.
 * Takes structured outputs from Judge, Predictor, Risk -> one verdict.
 *
 * OPUS MAX Decision Logic (STRICT — NO EXCEPTIONS):
 *
 *   STEP 1: Hard Safety Gate
 *     - RiskAgent.veto == true OR riskLevel == CRITICAL
 *       -> finalVerdict = RISK, fusionRule = RISK_VETO
 *       -> Skip all other logic
 *
 *   STEP 2: Decision Logic
 *     BUY requires ALL of:
 *       - JudgeAgent.verdict == "BUY"
 *       - PredictorAgent.upsideProbability >= 0.55
 *       - RiskAgent.riskScore <= 0.45
 *     PASS if:
 *       - JudgeAgent.verdict == "PASS"
 *       - OR BUY conditions not fully met
 *     RISK if:
 *       - RiskScore between 0.45 and 0.65 (uncertain zone)
 *
 *   STEP 3: Confidence Model
 *     confidence = weighted average:
 *       JudgeAgent:     0.35
 *       PredictorAgent: 0.40
 *       RiskAgent:      0.25
 *     Clamped [0, 1]
 *
 *   STEP 4: Fusion Rule Tagging
 *     Exactly one of:
 *       RISK_VETO | STRONG_BUY | WEAK_BUY | PASS_JUDGE |
 *       RISK_UNCERTAIN | FALLBACK_JUDGE_ONLY
 *
 * No randomness. No ML. Pure if/else. Auditable.
 */

import type {
  AgentResult,
  JudgeOutput,
  PredictorOutput,
  RiskOutput,
  OrchestratorDecision,
  FinalVerdict,
  FusionRule,
  PipelineTrace,
} from "./AgentTypes";

// ── Default Confidence Weights (OPUS MAX spec) ───────────────────────

const DEFAULT_W_JUDGE = 0.35;
const DEFAULT_W_PREDICTOR = 0.40;
const DEFAULT_W_RISK = 0.25;

// ── Default Decision Thresholds (OPUS MAX spec) ──────────────────────

const DEFAULT_BUY_UPSIDE_MIN = 0.55;
const DEFAULT_BUY_RISK_MAX = 0.45;
const DEFAULT_RISK_UNCERTAIN_LOW = 0.45;
const DEFAULT_RISK_UNCERTAIN_HIGH = 0.65;

// ── Adaptive Parameters (overridable by AgentLearningLoop) ───────────

export interface AdaptiveWeights {
  judge: number;
  predictor: number;
  risk: number;
}

export interface AdaptiveRiskThresholds {
  uncertainLow: number;
  uncertainHigh: number;
}

// ── Types ──────────────────────────────────────────────────────────────

export type FusionInputs = {
  judge: AgentResult<JudgeOutput>;
  predictor: AgentResult<PredictorOutput>;
  risk: AgentResult<RiskOutput>;
};

// ── Engine ─────────────────────────────────────────────────────────────

export class DecisionFusionEngine {
  /**
   * Fuse agent results into one deterministic decision.
   * Pure function. Same inputs -> same output. Always.
   *
   * Implements the OPUS MAX 6-step decision pipeline.
   * Accepts optional adaptive weights/thresholds from AgentLearningLoop.
   */
  static fuse(
    inputs: FusionInputs,
    totalLatencyMs: number,
    trace: PipelineTrace,
    adaptiveWeights?: AdaptiveWeights,
    adaptiveRiskThresholds?: AdaptiveRiskThresholds,
  ): OrchestratorDecision {
    const { judge, predictor, risk } = inputs;
    const j = judge.result;
    const p = predictor.result;
    const r = risk.result;

    // Use adaptive weights if provided, otherwise defaults
    const wJudge = adaptiveWeights?.judge ?? DEFAULT_W_JUDGE;
    const wPredictor = adaptiveWeights?.predictor ?? DEFAULT_W_PREDICTOR;
    const wRisk = adaptiveWeights?.risk ?? DEFAULT_W_RISK;
    const riskUncertainLow = adaptiveRiskThresholds?.uncertainLow ?? DEFAULT_RISK_UNCERTAIN_LOW;
    const riskUncertainHigh = adaptiveRiskThresholds?.uncertainHigh ?? DEFAULT_RISK_UNCERTAIN_HIGH;

    const fusionT0 = performance.now();

    const reasoning = {
      judge: { verdict: j.verdict, confidence: judge.confidence },
      predictor: { expectedProfit: p.expectedProfit, upsideProbability: p.upsideProbability },
      risk: { riskScore: r.riskScore, riskLevel: r.riskLevel, veto: r.veto, flagCount: r.flags.length },
    };

    // ══════════════════════════════════════════════════════════════════
    // STEP 1 — HARD SAFETY GATE (no exceptions)
    // ══════════════════════════════════════════════════════════════════

    if (r.veto || r.riskLevel === "critical") {
      trace.push({
        stage: "FUSION_ENGINE",
        status: "ok",
        durationMs: Math.round((performance.now() - fusionT0) * 100) / 100,
        detail: `RISK_VETO: veto=${r.veto}, riskLevel=${r.riskLevel}, score=${r.riskScore}`,
      });

      return this._emit("RISK", risk.confidence, reasoning, "RISK_VETO", totalLatencyMs, trace);
    }

    // ══════════════════════════════════════════════════════════════════
    // STEP 2 — DECISION LOGIC (OPUS MAX spec)
    // ══════════════════════════════════════════════════════════════════

    // ── STRONG BUY: all conditions met ────────────────────────────
    if (
      j.verdict === "BUY" &&
      p.upsideProbability >= DEFAULT_BUY_UPSIDE_MIN &&
      r.riskScore <= DEFAULT_BUY_RISK_MAX
    ) {
      const conf = this._computeConfidence(judge.confidence, predictor.confidence, 1 - r.riskScore, wJudge, wPredictor, wRisk);

      trace.push({
        stage: "FUSION_ENGINE",
        status: "ok",
        durationMs: Math.round((performance.now() - fusionT0) * 100) / 100,
        detail: `STRONG_BUY: upside=${p.upsideProbability}, risk=${r.riskScore}, conf=${conf}`,
      });

      return this._emit("BUY", conf, reasoning, "STRONG_BUY", totalLatencyMs, trace);
    }

    // ── PASS: Judge says PASS -> trust the judge ──────────────────
    if (j.verdict === "PASS") {
      const conf = this._computeConfidence(judge.confidence, predictor.confidence, 1 - r.riskScore, wJudge, wPredictor, wRisk);

      trace.push({
        stage: "FUSION_ENGINE",
        status: "ok",
        durationMs: Math.round((performance.now() - fusionT0) * 100) / 100,
        detail: `PASS_JUDGE: judge says PASS`,
      });

      return this._emit("PASS", conf, reasoning, "PASS_JUDGE", totalLatencyMs, trace);
    }

    // ── RISK UNCERTAIN: risk in ambiguous zone (adaptive bounds) ──
    if (r.riskScore > riskUncertainLow && r.riskScore < riskUncertainHigh) {
      const conf = this._computeConfidence(judge.confidence, predictor.confidence, 1 - r.riskScore, wJudge, wPredictor, wRisk);

      trace.push({
        stage: "FUSION_ENGINE",
        status: "ok",
        durationMs: Math.round((performance.now() - fusionT0) * 100) / 100,
        detail: `RISK_UNCERTAIN: riskScore=${r.riskScore} in [${riskUncertainLow.toFixed(2)}, ${riskUncertainHigh.toFixed(2)}]`,
      });

      return this._emit("RISK", conf, reasoning, "RISK_UNCERTAIN", totalLatencyMs, trace);
    }

    // ── WEAK BUY: Judge says BUY but conditions not fully met ─────
    if (j.verdict === "BUY") {
      const rawConf = this._computeConfidence(judge.confidence, predictor.confidence, 1 - r.riskScore, wJudge, wPredictor, wRisk);
      const conf = Math.min(rawConf, 0.65);

      trace.push({
        stage: "FUSION_ENGINE",
        status: "ok",
        durationMs: Math.round((performance.now() - fusionT0) * 100) / 100,
        detail: `WEAK_BUY: judge=BUY but upside=${p.upsideProbability} or risk=${r.riskScore} partial`,
      });

      return this._emit("BUY", conf, reasoning, "WEAK_BUY", totalLatencyMs, trace);
    }

    // ── Default: PASS (conservative fallback) ─────────────────────
    const conf = this._computeConfidence(judge.confidence, predictor.confidence, 1 - r.riskScore, wJudge, wPredictor, wRisk);

    trace.push({
      stage: "FUSION_ENGINE",
      status: "ok",
      durationMs: Math.round((performance.now() - fusionT0) * 100) / 100,
      detail: `PASS_JUDGE: default conservative fallback, judge=${j.verdict}`,
    });

    return this._emit("PASS", conf, reasoning, "PASS_JUDGE", totalLatencyMs, trace);
  }

  /**
   * Fallback fusion: only JudgeAgent result available.
   * Used when Predictor or Risk agents fail.
   * Confidence penalized by 0.20.
   */
  static fuseFallback(
    judge: AgentResult<JudgeOutput>,
    totalLatencyMs: number,
    trace: PipelineTrace,
  ): OrchestratorDecision {
    const j = judge.result;

    const fusionT0 = performance.now();

    // Map judge verdict to final verdict
    let finalVerdict: FinalVerdict;
    if (j.verdict === "BUY") finalVerdict = "BUY";
    else if (j.verdict === "PASS") finalVerdict = "PASS";
    else finalVerdict = "PASS"; // CHECK -> PASS (conservative)

    // Penalty: reduce confidence by 0.20 for degraded mode
    const confidence = Math.max(0, Math.min(1, judge.confidence - 0.20));

    const reasoning = {
      judge: { verdict: j.verdict, confidence: judge.confidence },
      predictor: { expectedProfit: 0, upsideProbability: 0 },
      risk: { riskScore: 0, riskLevel: "medium" as const, veto: false, flagCount: 0 },
    };

    trace.push({
      stage: "FUSION_ENGINE",
      status: "ok",
      durationMs: Math.round((performance.now() - fusionT0) * 100) / 100,
      detail: `FALLBACK_JUDGE_ONLY: predictor/risk failed, confidence penalized -0.20`,
    });

    return {
      finalVerdict,
      confidence,
      reasoning,
      fusionRule: "FALLBACK_JUDGE_ONLY",
      totalLatencyMs,
      pipelineTrace: trace,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────

  /**
   * OPUS MAX Confidence Model:
   *   confidence = wJudge * judgeConf + wPredictor * predictorConf + wRisk * riskConf
   *   Clamped [0, 1]
   *
   * Weights are adaptive — sourced from AgentLearningLoop.
   * Note: riskConf here is (1 - riskScore), representing safety confidence.
   */
  private static _computeConfidence(
    judgeConf: number,
    predictorConf: number,
    safetyConf: number,
    wJudge: number = DEFAULT_W_JUDGE,
    wPredictor: number = DEFAULT_W_PREDICTOR,
    wRisk: number = DEFAULT_W_RISK,
  ): number {
    const raw = wJudge * judgeConf + wPredictor * predictorConf + wRisk * safetyConf;
    return Math.round(Math.min(1, Math.max(0, raw)) * 100) / 100;
  }

  private static _emit(
    finalVerdict: FinalVerdict,
    confidence: number,
    reasoning: OrchestratorDecision["reasoning"],
    fusionRule: FusionRule,
    totalLatencyMs: number,
    trace: PipelineTrace,
  ): OrchestratorDecision {
    // STEP 5: Final decision
    trace.push({
      stage: "FINAL_DECISION",
      status: "ok",
      durationMs: 0,
      detail: `verdict=${finalVerdict}, rule=${fusionRule}`,
    });

    // STEP 6: Validation — bounds check all fields
    const validConf = Math.min(1, Math.max(0, confidence));
    trace.push({
      stage: "VALIDATION",
      status: "ok",
      durationMs: 0,
      detail: `conf=${validConf}, risk=${reasoning.risk.riskScore}, upside=${reasoning.predictor.upsideProbability}`,
    });

    // STEP 7: Output emission
    trace.push({
      stage: "OUTPUT_EMISSION",
      status: "ok",
      durationMs: 0,
      detail: "Structured response emitted",
    });

    return {
      finalVerdict,
      confidence: validConf,
      reasoning,
      fusionRule,
      totalLatencyMs,
      pipelineTrace: trace,
    };
  }
}
