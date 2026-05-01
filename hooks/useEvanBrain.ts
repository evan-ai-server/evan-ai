/**
 * Evan AI — useEvanBrain (The Nervous System)
 *
 * Centralized Zustand store — SINGLE SOURCE OF TRUTH for all scan state.
 *
 * Rules:
 *   1. No React local state may duplicate anything in this store
 *   2. UI subscribes via selectors — never writes business logic
 *   3. Only the Orchestrator calls action methods
 *   4. SITT is locked out during active scan phases (store-level guard)
 *   5. Every scan gets a unique scanId — stale writes are rejected
 *
 * Scan lifecycle (deterministic state machine):
 *   idle → scanning → fast_verdict → dopamine_phase → deep_analysis
 *        → aspiration_phase → paywall → complete
 *        (or any phase → error → idle on retry/reset)
 *
 * Hardening guarantees:
 *   - Error phase: any failure transitions here with full metadata
 *   - Render acknowledgment: dopamine phase waits for UI confirmation
 *   - Event log: every state change is traceable for session reconstruction
 */

import { create } from "zustand";
import type { DealResult, HotDeal, PaywallSignal } from "../services/dealEngine";
import type { ValueMirrorResult, SessionMomentum } from "../services/finance/ValueMirror";
import { emptySessionMomentum } from "../services/finance/ValueMirror";
import type { AspirationContext } from "../components/subscription/SubscriptionModal";
import type { DynamicThresholds } from "../services/TuningService";
import { ScanObserver } from "../services/ScanObserver";

// ── Scan Phase (deterministic state machine) ───────────────────────────────

export type ScanPhase =
  | "idle"              // camera active, no scan in flight
  | "scanning"          // vision pipeline running
  | "fast_verdict"      // Phase 1 complete, fast result available
  | "dopamine_phase"    // dopamine strike playing (UI animation window)
  | "deep_analysis"     // Phase 2 running / complete
  | "aspiration_phase"  // value mirror computed, paywall decision pending
  | "paywall"           // aspiration paywall visible
  | "complete"          // both phases done, results on screen
  | "error";            // recoverable error — preserves scanId, allows retry

// ── Error State ───────────────────────────────────────────────────────────

export interface ScanError {
  message: string;
  /** Phase the scan was in when the error occurred */
  phase: ScanPhase;
  /** scanId that was active when error occurred */
  scanId: string;
}

// ── Event Log ─────────────────────────────────────────────────────────────

export type BrainEventType =
  | "SCAN_STARTED"
  | "SCAN_CANCELLED"
  | "FAST_VERDICT_READY"
  | "DOPAMINE_ENTERED"
  | "DOPAMINE_RENDERED"
  | "DEEP_ANALYSIS_COMPLETE"
  | "ASPIRATION_ENTERED"
  | "PAYWALL_TRIGGERED"
  | "PAYWALL_DISMISSED"
  | "SCAN_COMPLETED"
  | "SCAN_ERROR"
  | "SCAN_RESET"
  | "SITT_DEFERRED"
  | "SITT_EXECUTED"
  | "ABORT_TRIGGERED"
  | "STALE_WRITE_REJECTED"
  | "MOMENTUM_UPDATED"
  // OPUS 4.7 — PhaseContract escalation events
  | "SCANNING_STALL"
  | "DOPAMINE_STALL_WARNING"
  | "DEEP_ANALYSIS_STALL"
  | "ASPIRATION_STALL";

export interface BrainEvent {
  type: BrainEventType;
  scanId: string | null;
  phase: ScanPhase;
  timestamp: number;
  payload: Record<string, any>;
}

const MAX_EVENT_LOG = 200;

// ── Store Shape ────────────────────────────────────────────────────────────

export interface EvanBrainState {
  // ── Scan lifecycle ─────────────────────────────────────────────────────
  phase: ScanPhase;
  scanId: string | null;
  cameraActive: boolean;

  // ── Error state ────────────────────────────────────────────────────────
  error: ScanError | null;

  // ── Render acknowledgment ──────────────────────────────────────────────
  /** True when DopamineLayer has confirmed it has rendered for the current scan */
  dopamineRendered: boolean;

  // ── Deal Engine results ────────────────────────────────────────────────
  dealResult: DealResult | null;
  hotSignal: HotDeal | null;

  // ── Paywall / Aspiration ───────────────────────────────────────────────
  paywallVisible: boolean;
  aspirationContext: AspirationContext | null;
  paywallSignal: PaywallSignal | null;
  valueMirror: ValueMirrorResult | null;

  // ── Session momentum (cross-scan accumulator) ─────────────────────────
  sessionMomentum: SessionMomentum;

  // ── SITT thresholds (read-only mirror — TuningService is source of truth)
  tuningThresholds: DynamicThresholds | null;

  // ── Event log (in-memory buffer for session reconstruction) ────────────
  _eventLog: BrainEvent[];

  // ── Actions (ONLY called by Orchestrator — never from UI) ─────────────

  /** Camera went live / scan screen visible */
  setCameraActive: (active: boolean) => void;

  /**
   * Scan started — reset deal state, enter scanning phase.
   * Returns the generated scanId for the caller to track.
   */
  scanStarted: () => string;

  /**
   * Phase 1 complete — Fast Verdict + Hot Deal score available.
   * Validates scanId — stale scans are silently rejected.
   */
  fastVerdictReady: (scanId: string, result: DealResult) => boolean;

  /** Enter dopamine phase — animation window open */
  enterDopaminePhase: (scanId: string) => boolean;

  /**
   * UI acknowledges dopamine render is complete.
   * Orchestrator waits for this before advancing to deep_analysis.
   */
  markDopamineRendered: (scanId: string) => boolean;

  /**
   * Phase 2 complete — Deep Analysis refined the result.
   * Updates the deal result without re-triggering dopamine.
   */
  deepAnalysisReady: (scanId: string, result: DealResult) => boolean;

  /** Enter aspiration phase — value mirror computed */
  enterAspirationPhase: (scanId: string) => boolean;

  /** Full scan pipeline complete — results on screen */
  scanComplete: (scanId: string) => boolean;

  /** Fire the aspiration paywall */
  showPaywall: (
    scanId: string,
    aspiration: AspirationContext,
    signal: PaywallSignal,
    mirror: ValueMirrorResult,
  ) => boolean;

  /** Dismiss the paywall. Pass scanId to prevent cross-scan race. */
  hidePaywall: (dismissScanId?: string) => void;

  /** Update session momentum after a scan */
  updateMomentum: (scanId: string, momentum: SessionMomentum) => boolean;

  /** Mirror SITT thresholds (called after TuningService loads or tunes) */
  setTuningThresholds: (t: DynamicThresholds) => void;

  /** Show paywall for free-limit-reached (not tied to a scan) */
  showLimitPaywall: () => void;

  /**
   * Transition to error phase — preserves scanId for retry.
   * Resets unsafe intermediate state while keeping error metadata.
   */
  setError: (scanId: string, message: string) => void;

  /** Full reset (e.g. when navigating away from scan or new scan starts) */
  resetScan: () => void;

  /** Log an event to the in-memory buffer */
  logEvent: (type: BrainEventType, payload?: Record<string, any>) => void;

  // ── Guards (read-only queries) ────────────────────────────────────────

  /** Whether SITT is allowed to run right now (store-level enforcement) */
  isSITTAllowed: () => boolean;
}

// ── scanId generator ───────────────────────────────────────────────────────

let _scanCounter = 0;
function generateScanId(): string {
  _scanCounter += 1;
  return `scan_${Date.now()}_${_scanCounter}`;
}

// ── Stale-scan guard ───────────────────────────────────────────────────────
// Returns true if the scanId matches the current active scan.

function isCurrentScan(state: { scanId: string | null }, scanId: string): boolean {
  return state.scanId === scanId;
}

// ── Store ──────────────────────────────────────────────────────────────────

export const useEvanBrain = create<EvanBrainState>((set, get) => ({
  // Initial state
  phase: "idle",
  scanId: null,
  cameraActive: false,
  error: null,
  dopamineRendered: false,
  dealResult: null,
  hotSignal: null,
  paywallVisible: false,
  aspirationContext: null,
  paywallSignal: null,
  valueMirror: null,
  sessionMomentum: emptySessionMomentum(),
  tuningThresholds: null,
  _eventLog: [],

  // ── Actions ────────────────────────────────────────────────────────────

  setCameraActive: (active) => set({ cameraActive: active }),

  scanStarted: () => {
    const id = generateScanId();
    set({
      phase: "scanning",
      scanId: id,
      error: null,
      dopamineRendered: false,
      dealResult: null,
      hotSignal: null,
      paywallVisible: false,
      aspirationContext: null,
      paywallSignal: null,
      valueMirror: null,
    });
    // Log after set so the event captures the new state
    get().logEvent("SCAN_STARTED", { newScanId: id });
    ScanObserver.scanStarted(id);
    ScanObserver.recordTransition("idle", "scanning", id);
    return id;
  },

  fastVerdictReady: (scanId, result) => {
    const s = get();
    if (!isCurrentScan(s, scanId)) {
      get().logEvent("STALE_WRITE_REJECTED", { rejectedScanId: scanId, action: "fastVerdictReady" });
      return false;
    }
    // Phase guard: only valid from "scanning"
    if (s.phase !== "scanning") {
      get().logEvent("STALE_WRITE_REJECTED", { rejectedScanId: scanId, action: "fastVerdictReady", reason: `invalid phase: ${s.phase}` });
      return false;
    }
    set({
      phase: "fast_verdict",
      dealResult: result,
      hotSignal: result.hot_deal,
    });
    get().logEvent("FAST_VERDICT_READY", {
      verdict: result.fast.verdict,
      confidence: result.fast.confidence,
      hotTier: result.hot_deal.tier,
      hotScore: result.hot_deal.score,
    });
    ScanObserver.recordTransition("scanning", "fast_verdict", scanId, {
      verdict: result.fast.verdict,
      hotTier: result.hot_deal.tier,
    });
    ScanObserver.markFastVerdict(scanId);
    return true;
  },

  enterDopaminePhase: (scanId) => {
    const s = get();
    if (!isCurrentScan(s, scanId)) {
      get().logEvent("STALE_WRITE_REJECTED", { rejectedScanId: scanId, action: "enterDopaminePhase" });
      return false;
    }
    // Phase guard: only valid from "fast_verdict"
    if (s.phase !== "fast_verdict") {
      get().logEvent("STALE_WRITE_REJECTED", { rejectedScanId: scanId, action: "enterDopaminePhase", reason: `invalid phase: ${s.phase}` });
      return false;
    }
    set({ phase: "dopamine_phase", dopamineRendered: false });
    get().logEvent("DOPAMINE_ENTERED");
    ScanObserver.recordTransition("fast_verdict", "dopamine_phase", scanId);
    ScanObserver.markDopamineEntered(scanId);
    return true;
  },

  markDopamineRendered: (scanId) => {
    const s = get();
    if (!isCurrentScan(s, scanId)) return false;
    if (s.phase !== "dopamine_phase") return false;
    set({ dopamineRendered: true });
    get().logEvent("DOPAMINE_RENDERED");
    ScanObserver.markDopamineRendered(scanId);
    return true;
  },

  deepAnalysisReady: (scanId, result) => {
    const s = get();
    if (!isCurrentScan(s, scanId)) {
      get().logEvent("STALE_WRITE_REJECTED", { rejectedScanId: scanId, action: "deepAnalysisReady" });
      return false;
    }
    // Phase guard: only valid from "dopamine_phase" (after dopamine ack)
    if (s.phase !== "dopamine_phase") {
      get().logEvent("STALE_WRITE_REJECTED", { rejectedScanId: scanId, action: "deepAnalysisReady", reason: `invalid phase: ${s.phase}` });
      return false;
    }
    set({
      phase: "deep_analysis",
      dealResult: result,
      // Don't update hotSignal — keep the original fast-verdict tier
      // so dopamine animation doesn't re-trigger
    });
    get().logEvent("DEEP_ANALYSIS_COMPLETE", {
      expectedProfit: result.deep.expected_profit,
      riskLevel: result.deep.risk_level,
    });
    ScanObserver.recordTransition("dopamine_phase", "deep_analysis", scanId, {
      expectedProfit: result.deep.expected_profit,
    });
    ScanObserver.markDeepAnalysis(scanId);
    return true;
  },

  enterAspirationPhase: (scanId) => {
    const s = get();
    if (!isCurrentScan(s, scanId)) {
      get().logEvent("STALE_WRITE_REJECTED", { rejectedScanId: scanId, action: "enterAspirationPhase" });
      return false;
    }
    // Phase guard: only valid from "deep_analysis"
    if (s.phase !== "deep_analysis") {
      get().logEvent("STALE_WRITE_REJECTED", { rejectedScanId: scanId, action: "enterAspirationPhase", reason: `invalid phase: ${s.phase}` });
      return false;
    }
    set({ phase: "aspiration_phase" });
    get().logEvent("ASPIRATION_ENTERED");
    ScanObserver.recordTransition("deep_analysis", "aspiration_phase", scanId);
    ScanObserver.markAspirationEntered(scanId);
    return true;
  },

  scanComplete: (scanId) => {
    const s = get();
    if (!isCurrentScan(s, scanId)) {
      get().logEvent("STALE_WRITE_REJECTED", { rejectedScanId: scanId, action: "scanComplete" });
      return false;
    }
    // Phase guard: only valid from deep_analysis, aspiration_phase, or paywall
    const validFrom: ScanPhase[] = ["deep_analysis", "aspiration_phase", "paywall"];
    if (!validFrom.includes(s.phase)) {
      get().logEvent("STALE_WRITE_REJECTED", { rejectedScanId: scanId, action: "scanComplete", reason: `invalid phase: ${s.phase}` });
      return false;
    }
    const prevPhase = s.phase;
    set({ phase: "complete" });
    get().logEvent("SCAN_COMPLETED");
    ScanObserver.recordTransition(prevPhase, "complete", scanId);
    ScanObserver.scanEnded(scanId, "complete");
    return true;
  },

  showPaywall: (scanId, aspiration, signal, mirror) => {
    const s = get();
    if (!isCurrentScan(s, scanId)) {
      get().logEvent("STALE_WRITE_REJECTED", { rejectedScanId: scanId, action: "showPaywall" });
      return false;
    }
    // Phase guard: only valid from "aspiration_phase"
    if (s.phase !== "aspiration_phase") {
      get().logEvent("STALE_WRITE_REJECTED", { rejectedScanId: scanId, action: "showPaywall", reason: `invalid phase: ${s.phase}` });
      return false;
    }
    set({
      phase: "paywall",
      paywallVisible: true,
      aspirationContext: aspiration,
      paywallSignal: signal,
      valueMirror: mirror,
    });
    get().logEvent("PAYWALL_TRIGGERED", {
      triggerType: mirror.trigger,
      profitUnlocked: mirror.profitUnlocked,
    });
    ScanObserver.recordTransition("aspiration_phase", "paywall", scanId, {
      trigger: mirror.trigger,
    });
    ScanObserver.markPaywallTriggered(scanId);
    return true;
  },

  hidePaywall: (dismissScanId?: string) => {
    const s = get();
    // Only transition to "complete" if we're actually in the paywall phase.
    // A late-firing dismiss (e.g. 240ms animation delay in SubscriptionModal)
    // must not overwrite a new scan's phase.
    if (s.phase !== "paywall") {
      set({ paywallVisible: false, aspirationContext: null });
      return;
    }
    // If a scanId was provided (from the dismiss callback), verify it matches
    // the current scan. A late-firing dismiss from scan N must not close
    // scan N+1's paywall if N+1 also reached the paywall phase.
    if (dismissScanId != null && s.scanId !== dismissScanId) {
      get().logEvent("STALE_WRITE_REJECTED", {
        rejectedScanId: dismissScanId,
        action: "hidePaywall",
        reason: "cross-scan paywall dismiss blocked",
      });
      return;
    }
    set({
      paywallVisible: false,
      aspirationContext: null,
      phase: "complete",
    });
    get().logEvent("PAYWALL_DISMISSED");
  },

  updateMomentum: (scanId, momentum) => {
    if (!isCurrentScan(get(), scanId)) return false;
    set({ sessionMomentum: momentum });
    get().logEvent("MOMENTUM_UPDATED", {
      hotDeals: momentum.hotDealsThisSession,
      profitSurfaced: momentum.sessionProfitSurfaced,
    });
    return true;
  },

  setTuningThresholds: (t) => set({ tuningThresholds: t }),

  showLimitPaywall: () => {
    const s = get();
    // Guard: only show limit paywall when idle or complete — never during an active scan
    if (s.phase !== "idle" && s.phase !== "complete") {
      get().logEvent("STALE_WRITE_REJECTED", { rejectedScanId: s.scanId, action: "showLimitPaywall", reason: `invalid phase: ${s.phase}` });
      return;
    }
    set({
      phase: "paywall",
      paywallVisible: true,
      aspirationContext: null,
      paywallSignal: null,
      valueMirror: null,
    });
    get().logEvent("PAYWALL_TRIGGERED", { triggerType: "LIMIT_REACHED" });
  },

  setError: (scanId, message) => {
    const s = get();
    // Guard: reject stale scan errors. Without this, a late-firing
    // error handler from scan N could overwrite scan N+1's phase to
    // "error", corrupting the active pipeline.
    if (!isCurrentScan(s, scanId)) {
      get().logEvent("STALE_WRITE_REJECTED", { rejectedScanId: scanId, action: "setError" });
      return;
    }
    const failedPhase = s.phase;
    set({
      phase: "error",
      error: {
        message,
        phase: failedPhase,
        scanId,
      },
      // Reset unsafe intermediate state
      paywallVisible: false,
      aspirationContext: null,
      paywallSignal: null,
      valueMirror: null,
      dopamineRendered: false,
      // Preserve: scanId, dealResult, hotSignal (for retry context)
    });
    get().logEvent("SCAN_ERROR", {
      errorMessage: message,
      failedPhase,
      failedScanId: scanId,
    });
    ScanObserver.recordTransition(failedPhase, "error", scanId, { message });
    ScanObserver.pipelineError(scanId, failedPhase, "setError", message);
    ScanObserver.scanEnded(scanId, "error");
  },

  resetScan: () => {
    const s = get();
    if (s.scanId) {
      // Log before we clear scanId
      get().logEvent("SCAN_RESET", { previousPhase: s.phase });
    }
    set({
      phase: "idle",
      scanId: null,
      error: null,
      dopamineRendered: false,
      dealResult: null,
      hotSignal: null,
      paywallVisible: false,
      aspirationContext: null,
      paywallSignal: null,
      valueMirror: null,
    });
  },

  logEvent: (type, payload = {}) => {
    const s = get();
    const event: BrainEvent = {
      type,
      scanId: s.scanId,
      phase: s.phase,
      timestamp: Date.now(),
      payload,
    };
    // O(1) append — reuse the same array reference, only splice when full.
    // The old [...spread, event] allocated a new 200-element array per log,
    // creating GC pressure under rapid scanning. This mutates in place for
    // the common case and only copies when React needs the new reference.
    set((prev) => {
      const log = prev._eventLog;
      if (log.length >= MAX_EVENT_LOG) {
        // Drop oldest, push new — single splice + push, no full copy
        log.splice(0, log.length - MAX_EVENT_LOG + 1);
      }
      log.push(event);
      // Return new array reference so Zustand detects the change
      return { _eventLog: log };
    });
  },

  // ── Guards ─────────────────────────────────────────────────────────────

  isSITTAllowed: () => {
    const s = get();
    // SITT can only run when scan pipeline is fully idle or complete
    // AND camera is not actively feeding frames
    // AND not in an error state (avoid contention during recovery)
    return (
      !s.cameraActive &&
      (s.phase === "idle" || s.phase === "complete")
    );
  },
}));

// ── Selectors (stable references for selective subscription) ──────────────
// Components use these to subscribe to only the slice they need.
// Example: const hotSignal = useEvanBrain(selectHotSignal);

export const selectPhase = (s: EvanBrainState) => s.phase;
export const selectScanId = (s: EvanBrainState) => s.scanId;
export const selectCameraActive = (s: EvanBrainState) => s.cameraActive;
export const selectDealResult = (s: EvanBrainState) => s.dealResult;
export const selectHotSignal = (s: EvanBrainState) => s.hotSignal;
export const selectPaywallVisible = (s: EvanBrainState) => s.paywallVisible;
export const selectAspirationContext = (s: EvanBrainState) => s.aspirationContext;
export const selectSessionMomentum = (s: EvanBrainState) => s.sessionMomentum;
export const selectTuningThresholds = (s: EvanBrainState) => s.tuningThresholds;
export const selectError = (s: EvanBrainState) => s.error;
export const selectDopamineRendered = (s: EvanBrainState) => s.dopamineRendered;
export const selectEventLog = (s: EvanBrainState) => s._eventLog;
