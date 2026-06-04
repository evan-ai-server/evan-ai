/**
 * Evan AI — OPUS MAX Agent Type System
 *
 * Core interfaces for the Multi-Agent Coordination Layer.
 * Implements the OPUS MAX deterministic decision contract.
 *
 * Agents: JudgeAgent, PredictorAgent, RiskAgent
 * Orchestrator: AgentOrchestrator -> DecisionFusionEngine -> DealResult
 *
 * Constraints:
 *   - Agents are stateless (no global state mutation)
 *   - Each agent has ONE responsibility
 *   - All outputs are structured and deterministic
 *   - Every field is traceable, no hidden reasoning
 */

import type { DealInput, DealVerdict } from "../dealEngine";

// ── Core Agent Framework ───────────────────────────────────────────────

export type AgentResult<T> = {
  result: T;
  confidence: number;
  latencyMs: number;
};

export type AgentContext = {
  scanId: string;
  input: DealInput;
  budget: { timeMs: number };
};

export interface Agent<T> {
  name: string;
  execute(ctx: AgentContext): AgentResult<T>;
}

// ── Agent Risk Level (extended from DealEngine's RiskLevel) ───────────

/** Agent-level risk includes CRITICAL tier for hard veto */
export type AgentRiskLevel = "low" | "medium" | "high" | "critical";

// ── Agent Outputs ──────────────────────────────────────────────────────

export type JudgeOutput = {
  verdict: DealVerdict;
  ratio: number;
  profit: number;
};

export type PredictorOutput = {
  expectedProfit: number;
  upsideProbability: number;
  bestPlatform: string;
  feesEstimate: number;
};

export type RiskOutput = {
  riskScore: number;
  riskLevel: AgentRiskLevel;
  flags: string[];
  veto: boolean;
  vetoReason: string | null;
};

// ── Fusion Rules (OPUS MAX spec — exactly one per decision) ───────────

export type FusionRule =
  | "RISK_VETO"
  | "STRONG_BUY"
  | "WEAK_BUY"
  | "PASS_JUDGE"
  | "RISK_UNCERTAIN"
  | "FALLBACK_JUDGE_ONLY";

// ── Pipeline Trace (mandatory on every decision) ──────────────────────

export type PipelineStage =
  | "INPUT"
  | "PREPROCESSING"
  | "JUDGE_EXECUTION"
  | "PREDICTOR_EXECUTION"
  | "RISK_EXECUTION"
  | "FUSION_ENGINE"
  | "FINAL_DECISION"
  | "VALIDATION"
  | "OUTPUT_EMISSION";

export type PipelineTraceEntry = {
  stage: PipelineStage;
  status: "ok" | "skipped" | "failed";
  durationMs: number;
  detail: string;
};

export type PipelineTrace = PipelineTraceEntry[];

// ── Orchestrator Decision ──────────────────────────────────────────────

export type FinalVerdict = "BUY" | "PASS" | "RISK";

export type OrchestratorDecision = {
  finalVerdict: FinalVerdict;
  confidence: number;
  reasoning: {
    judge: { verdict: DealVerdict; confidence: number };
    predictor: { expectedProfit: number; upsideProbability: number };
    risk: { riskScore: number; riskLevel: AgentRiskLevel; veto: boolean; flagCount: number };
  };
  fusionRule: FusionRule;
  totalLatencyMs: number;
  pipelineTrace: PipelineTrace;
};

// ── Agent Learning Feedback ───────────────────────────────────────────

export type AgentFeedback = {
  scanId: string;
  finalVerdict: FinalVerdict;
  fusionRule: FusionRule;
  judgeVerdict: DealVerdict;
  judgeConfidence: number;
  predictorUpside: number;
  riskScore: number;
  riskVeto: boolean;
  /** Whether agents disagreed (judge said BUY but fusion said RISK/PASS, etc.) */
  disagreement: boolean;
  /** Whether risk overrode a BUY verdict */
  riskFlip: boolean;
  timestamp: number;
};
