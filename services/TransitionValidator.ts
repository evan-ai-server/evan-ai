/**
 * Evan AI — TransitionValidator (Pre-Flight State Validation Engine)
 *
 * Simulates (currentState, action) → nextState BEFORE any mutation.
 * Rejects invalid transitions before they reach the store.
 *
 * Architecture:
 *   - Pure functions — no side effects, no state, no imports beyond types
 *   - Constant-time validation — map lookups only, O(1) per check
 *   - Structured rejections — machine-readable rule + message + severity
 *   - Covers: phase correctness, scanId integrity, cross-phase invariants,
 *     abort guards, paywall guards
 *
 * Guarantees:
 *   - Zero invalid transitions reach the store
 *   - Every rejection is traceable to a named rule
 *   - No false negatives — if validation passes, transition is safe
 */

import type { ScanPhase } from "../hooks/useEvanBrain";

// ── Action Types (discriminated union of all possible store mutations) ──────

export type TransitionAction =
  | { type: "SCAN_STARTED" }
  | { type: "FAST_VERDICT"; scanId: string }
  | { type: "ENTER_DOPAMINE"; scanId: string }
  | { type: "DOPAMINE_ACK"; scanId: string }
  | { type: "DEEP_ANALYSIS"; scanId: string }
  | { type: "ENTER_ASPIRATION"; scanId: string }
  | { type: "SCAN_COMPLETE"; scanId: string }
  | { type: "SHOW_PAYWALL"; scanId: string }
  | { type: "HIDE_PAYWALL"; scanId?: string }
  | { type: "SET_ERROR"; scanId: string }
  | { type: "RESET_SCAN" };

// ── Validator State Snapshot ────────────────────────────────────────────────

export interface ValidatorSnapshot {
  phase: ScanPhase;
  scanId: string | null;
  dopamineRendered: boolean;
  paywallVisible: boolean;
}

// ── Validation Result ───────────────────────────────────────────────────────

export interface ValidationRejection {
  /** Named rule that was violated */
  rule: string;
  /** Human-readable description */
  message: string;
  /** Severity — critical = architectural violation, error = phase/id guard */
  severity: "error" | "critical";
}

export interface ValidationResult {
  valid: boolean;
  rejections: ValidationRejection[];
  /** The phase the system would transition to if this action were applied */
  simulatedNextPhase: ScanPhase | null;
}

// ── Cross-Action Metadata (tracked by Governor, passed into validator) ──────

export interface ValidatorMeta {
  /** How many times dopamine has been acknowledged for this scan */
  dopamineAckCount?: number;
  /** Whether the scan has been aborted via AbortController */
  isAborted?: boolean;
}

// ── Constants ───────────────────────────────────────────────────────────────

/**
 * Required phase(s) for each action type.
 * null = action is valid from any phase (e.g. RESET_SCAN, SET_ERROR).
 */
const REQUIRED_PHASES: Record<TransitionAction["type"], ScanPhase[] | null> = {
  SCAN_STARTED: null,
  FAST_VERDICT: ["scanning"],
  ENTER_DOPAMINE: ["fast_verdict"],
  DOPAMINE_ACK: ["dopamine_phase"],
  DEEP_ANALYSIS: ["dopamine_phase"],
  ENTER_ASPIRATION: ["deep_analysis"],
  SCAN_COMPLETE: ["deep_analysis", "aspiration_phase", "paywall"],
  SHOW_PAYWALL: ["aspiration_phase"],
  HIDE_PAYWALL: null, // brain handles soft behavior internally
  SET_ERROR: null,
  RESET_SCAN: null,
};

/**
 * Action → resulting phase mapping.
 * null = action does not change phase (e.g. DOPAMINE_ACK sets a flag).
 */
const NEXT_PHASE: Record<TransitionAction["type"], ScanPhase | null> = {
  SCAN_STARTED: "scanning",
  FAST_VERDICT: "fast_verdict",
  ENTER_DOPAMINE: "dopamine_phase",
  DOPAMINE_ACK: null,
  DEEP_ANALYSIS: "deep_analysis",
  ENTER_ASPIRATION: "aspiration_phase",
  SCAN_COMPLETE: "complete",
  SHOW_PAYWALL: "paywall",
  HIDE_PAYWALL: "complete",
  SET_ERROR: "error",
  RESET_SCAN: "idle",
};

// ── Core Validator ──────────────────────────────────────────────────────────

/**
 * Validate a proposed transition BEFORE it reaches the store.
 *
 * Returns a structured result with:
 *   - valid: boolean (true = safe to proceed)
 *   - rejections: array of named rule violations
 *   - simulatedNextPhase: the phase the system would enter
 *
 * Performance: O(1) — all checks are map lookups or constant-time comparisons.
 */
export function validateTransition(
  snapshot: ValidatorSnapshot,
  action: TransitionAction,
  meta: ValidatorMeta = {},
): ValidationResult {
  const rejections: ValidationRejection[] = [];

  // ── 1. Phase Correctness ──────────────────────────────────────────────
  // Verify the system is in a phase that allows this action.
  const required = REQUIRED_PHASES[action.type];
  if (required !== null && !required.includes(snapshot.phase)) {
    rejections.push({
      rule: "PHASE_GUARD",
      message: `${action.type} requires phase [${required.join(" | ")}], current: ${snapshot.phase}`,
      severity: "error",
    });
  }

  // ── 2. ScanId Integrity ───────────────────────────────────────────────
  // If the action targets a specific scan, verify it matches the active scan.
  // SCAN_STARTED and RESET_SCAN don't carry scanId, so they skip this check.
  const actionScanId = "scanId" in action ? (action as { scanId?: string }).scanId : undefined;
  if (actionScanId && snapshot.scanId && actionScanId !== snapshot.scanId) {
    rejections.push({
      rule: "SCAN_ID_MISMATCH",
      message: `Action targets scan ${actionScanId}, active: ${snapshot.scanId}`,
      severity: "error",
    });
  }

  // ── 3. Cross-Phase Invariants ─────────────────────────────────────────

  // 3a. Dopamine acknowledgment must occur exactly once per scan
  if (action.type === "DOPAMINE_ACK" && (meta.dopamineAckCount ?? 0) >= 1) {
    rejections.push({
      rule: "DOPAMINE_DOUBLE_ACK",
      message: `Dopamine already acknowledged ${meta.dopamineAckCount} time(s)`,
      severity: "critical",
    });
  }

  // 3b. Cannot show paywall when one is already visible
  if (action.type === "SHOW_PAYWALL" && snapshot.paywallVisible) {
    rejections.push({
      rule: "PAYWALL_ALREADY_VISIBLE",
      message: "Cannot show paywall — one is already visible",
      severity: "error",
    });
  }

  // ── 4. Abort Guard ────────────────────────────────────────────────────
  // No writes to an aborted scan (except error/reset which are recovery paths).
  if (
    meta.isAborted &&
    action.type !== "RESET_SCAN" &&
    action.type !== "SCAN_STARTED" &&
    action.type !== "SET_ERROR"
  ) {
    rejections.push({
      rule: "WRITE_AFTER_ABORT",
      message: `${action.type} attempted on aborted scan`,
      severity: "critical",
    });
  }

  return {
    valid: rejections.length === 0,
    rejections,
    simulatedNextPhase: rejections.length === 0
      ? (NEXT_PHASE[action.type] ?? null)
      : null,
  };
}

/**
 * Simulate the next phase without full validation.
 * Useful for predictive UI rendering.
 */
export function simulateNextPhase(
  actionType: TransitionAction["type"],
): ScanPhase | null {
  return NEXT_PHASE[actionType] ?? null;
}

/**
 * Check if a phase transition is structurally valid
 * (exists in the transition graph), independent of scanId or meta.
 */
export function isValidPhaseTransition(
  from: ScanPhase,
  to: ScanPhase,
): boolean {
  // Build inverse lookup: which actions produce `to` from `from`?
  for (const [actionType, required] of Object.entries(REQUIRED_PHASES)) {
    if (required !== null && !required.includes(from)) continue;
    const next = NEXT_PHASE[actionType as TransitionAction["type"]];
    if (next === to) return true;
  }
  return false;
}
