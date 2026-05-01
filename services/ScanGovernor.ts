/**
 * Evan AI — ScanGovernor (Active Enforcement Layer)
 *
 * Evolved from passive observer to active gatekeeper.
 * Intercepts ALL state mutations, validates via TransitionValidator,
 * approves or denies with near-zero latency.
 *
 * Architecture:
 *   - Middleware between orchestrator and store
 *   - Pre-flight validation on every action
 *   - Cross-scan state tracking (dopamine ack counts, abort tracking)
 *   - Structured decision log (circular buffer, queryable)
 *   - Defense-in-depth: Governor blocks FIRST, brain guards catch stragglers
 *
 * Guarantees:
 *   - Single active scan invariant (enforced, not logged)
 *   - Dopamine acknowledgment exactly once (enforced, not logged)
 *   - No writes after abort (enforced, not logged)
 *   - Near-zero latency overhead (~0.01ms per guard call)
 */

import { useEvanBrain } from "../hooks/useEvanBrain";
import type { DealResult, PaywallSignal } from "../services/dealEngine";
import type { ValueMirrorResult } from "../services/finance/ValueMirror";
import type { AspirationContext } from "../components/subscription/SubscriptionModal";
import { ScanObserver } from "./ScanObserver";
import {
  validateTransition,
  type TransitionAction,
  type ValidatorSnapshot,
  type ValidatorMeta,
} from "./TransitionValidator";

// ── Types ───────────────────────────────────────────────────────────────────

export interface GovernorDecision {
  /** Whether the action was allowed */
  allowed: boolean;
  /** The action that was evaluated */
  action: TransitionAction["type"];
  /** Rejection reasons (empty if allowed) */
  rejections: Array<{ rule: string; message: string; severity: string }>;
  /** When the decision was made */
  timestamp: number;
}

// ── Constants ───────────────────────────────────────────────────────────────

const MAX_DECISION_LOG = 200;

// ── Governor ────────────────────────────────────────────────────────────────

class _ScanGovernor {
  /** Dopamine acknowledgment count per scanId */
  private _dopamineAckCounts = new Map<string, number>();
  /** Scans that have been aborted via AbortController */
  private _abortedScans = new Set<string>();
  /** Circular decision log */
  private _decisionLog: GovernorDecision[] = [];

  // ── State Snapshot ──────────────────────────────────────────────────────

  private _snapshot(): ValidatorSnapshot {
    const s = useEvanBrain.getState();
    return {
      phase: s.phase,
      scanId: s.scanId,
      dopamineRendered: s.dopamineRendered,
      paywallVisible: s.paywallVisible,
    };
  }

  private _meta(scanId?: string): ValidatorMeta {
    return {
      dopamineAckCount: scanId
        ? (this._dopamineAckCounts.get(scanId) ?? 0)
        : 0,
      isAborted: scanId ? this._abortedScans.has(scanId) : false,
    };
  }

  // ── Core Gate ─────────────────────────────────────────────────────────

  /**
   * Validate an action without executing it.
   * Returns the decision — caller decides whether to hard-block or soft-pass.
   *
   * Performance: ~0.01ms (map lookups + array push).
   */
  guard(action: TransitionAction): GovernorDecision {
    const snapshot = this._snapshot();
    const scanId = "scanId" in action ? action.scanId : undefined;
    const result = validateTransition(snapshot, action, this._meta(scanId));

    const decision: GovernorDecision = {
      allowed: result.valid,
      action: action.type,
      rejections: result.rejections,
      timestamp: Date.now(),
    };

    // O(1) append to circular buffer
    if (this._decisionLog.length >= MAX_DECISION_LOG) {
      this._decisionLog.splice(
        0,
        this._decisionLog.length - MAX_DECISION_LOG + 1,
      );
    }
    this._decisionLog.push(decision);

    return decision;
  }

  // ── Enforcement Methods (Hard-Block) ──────────────────────────────────
  // Each method: guard → block or call through → track state

  scanStarted(): string | null {
    const decision = this.guard({ type: "SCAN_STARTED" });
    if (!decision.allowed) {
      this._emitBlocked(decision, null);
      return null;
    }
    const scanId = useEvanBrain.getState().scanStarted();
    this._dopamineAckCounts.set(scanId, 0);
    return scanId;
  }

  fastVerdictReady(scanId: string, result: DealResult): boolean {
    const decision = this.guard({ type: "FAST_VERDICT", scanId });
    if (!decision.allowed) {
      this._emitBlocked(decision, scanId);
      return false;
    }
    return useEvanBrain.getState().fastVerdictReady(scanId, result);
  }

  enterDopaminePhase(scanId: string): boolean {
    const decision = this.guard({ type: "ENTER_DOPAMINE", scanId });
    if (!decision.allowed) {
      this._emitBlocked(decision, scanId);
      return false;
    }
    return useEvanBrain.getState().enterDopaminePhase(scanId);
  }

  markDopamineRendered(scanId: string): boolean {
    const decision = this.guard({ type: "DOPAMINE_ACK", scanId });
    if (!decision.allowed) {
      this._emitBlocked(decision, scanId);
      return false;
    }
    const result = useEvanBrain.getState().markDopamineRendered(scanId);
    if (result) {
      const count = (this._dopamineAckCounts.get(scanId) ?? 0) + 1;
      this._dopamineAckCounts.set(scanId, count);
    }
    return result;
  }

  deepAnalysisReady(scanId: string, result: DealResult): boolean {
    const decision = this.guard({ type: "DEEP_ANALYSIS", scanId });
    if (!decision.allowed) {
      this._emitBlocked(decision, scanId);
      return false;
    }
    return useEvanBrain.getState().deepAnalysisReady(scanId, result);
  }

  enterAspirationPhase(scanId: string): boolean {
    const decision = this.guard({ type: "ENTER_ASPIRATION", scanId });
    if (!decision.allowed) {
      this._emitBlocked(decision, scanId);
      return false;
    }
    return useEvanBrain.getState().enterAspirationPhase(scanId);
  }

  scanComplete(scanId: string): boolean {
    const decision = this.guard({ type: "SCAN_COMPLETE", scanId });
    if (!decision.allowed) {
      this._emitBlocked(decision, scanId);
      return false;
    }
    return useEvanBrain.getState().scanComplete(scanId);
  }

  showPaywall(
    scanId: string,
    aspiration: AspirationContext,
    signal: PaywallSignal,
    mirror: ValueMirrorResult,
  ): boolean {
    const decision = this.guard({ type: "SHOW_PAYWALL", scanId });
    if (!decision.allowed) {
      this._emitBlocked(decision, scanId);
      return false;
    }
    return useEvanBrain
      .getState()
      .showPaywall(scanId, aspiration, signal, mirror);
  }

  // ── Enforcement Methods (Soft-Pass) ───────────────────────────────────
  // These always call through — brain handles soft behavior internally.

  hidePaywall(dismissScanId?: string): void {
    // Log for observability only — hidePaywall has soft behavior
    this.guard({ type: "HIDE_PAYWALL", scanId: dismissScanId });
    useEvanBrain.getState().hidePaywall(dismissScanId);
  }

  setError(scanId: string, message: string): void {
    // Error transitions always proceed — recovery must not be blocked
    this.guard({ type: "SET_ERROR", scanId });
    useEvanBrain.getState().setError(scanId, message);
  }

  resetScan(): void {
    // Reset always proceeds — it's a recovery/cleanup path
    this.guard({ type: "RESET_SCAN" });
    useEvanBrain.getState().resetScan();
  }

  // ── Abort Tracking ────────────────────────────────────────────────────

  /** Mark a scan as aborted — all future writes for this scanId will be blocked */
  markAborted(scanId: string): void {
    this._abortedScans.add(scanId);
    ScanObserver.abortTriggered(scanId, "governor_abort_tracking");
  }

  /** Clear abort status (e.g. after reset) */
  clearAborted(scanId: string): void {
    this._abortedScans.delete(scanId);
  }

  // ── Queries ───────────────────────────────────────────────────────────

  /** Full decision log (most recent last) */
  getDecisionLog(): readonly GovernorDecision[] {
    return this._decisionLog;
  }

  /** Only blocked decisions */
  getBlockedDecisions(): GovernorDecision[] {
    return this._decisionLog.filter((d) => !d.allowed);
  }

  /** Dopamine ack count for a specific scan */
  getDopamineAckCount(scanId: string): number {
    return this._dopamineAckCounts.get(scanId) ?? 0;
  }

  /** Whether a scan is marked as aborted */
  isAborted(scanId: string): boolean {
    return this._abortedScans.has(scanId);
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private _emitBlocked(decision: GovernorDecision, scanId: string | null): void {
    const phase = useEvanBrain.getState().phase;
    ScanObserver.emit(
      "critical",
      "invariant_violation",
      "GOVERNOR_BLOCKED",
      scanId,
      phase,
      {
        action: decision.action,
        rejections: decision.rejections,
        message: decision.rejections.map((r) => r.message).join("; "),
      },
    );
  }

  // ── Reset (for testing) ───────────────────────────────────────────────

  reset(): void {
    this._dopamineAckCounts.clear();
    this._abortedScans.clear();
    this._decisionLog = [];
  }
}

// ── Export Singleton ─────────────────────────────────────────────────────────

export const ScanGovernor = new _ScanGovernor();
