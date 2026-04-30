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
 *        (or any phase → idle on resetScan)
 */

import { create } from "zustand";
import type { DealResult, HotDeal, PaywallSignal } from "../services/dealEngine";
import type { ValueMirrorResult, SessionMomentum } from "../services/finance/ValueMirror";
import { emptySessionMomentum } from "../services/finance/ValueMirror";
import type { AspirationContext } from "../components/subscription/SubscriptionModal";
import type { DynamicThresholds } from "../services/TuningService";

// ── Scan Phase (deterministic state machine) ───────────────────────────────

export type ScanPhase =
  | "idle"              // camera active, no scan in flight
  | "scanning"          // vision pipeline running
  | "fast_verdict"      // Phase 1 complete, fast result available
  | "dopamine_phase"    // dopamine strike playing (UI animation window)
  | "deep_analysis"     // Phase 2 running / complete
  | "aspiration_phase"  // value mirror computed, paywall decision pending
  | "paywall"           // aspiration paywall visible
  | "complete";         // both phases done, results on screen

// ── Store Shape ────────────────────────────────────────────────────────────

export interface EvanBrainState {
  // ── Scan lifecycle ─────────────────────────────────────────────────────
  phase: ScanPhase;
  scanId: string | null;
  cameraActive: boolean;

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

  /** Dismiss the paywall */
  hidePaywall: () => void;

  /** Update session momentum after a scan */
  updateMomentum: (scanId: string, momentum: SessionMomentum) => boolean;

  /** Mirror SITT thresholds (called after TuningService loads or tunes) */
  setTuningThresholds: (t: DynamicThresholds) => void;

  /** Show paywall for free-limit-reached (not tied to a scan) */
  showLimitPaywall: () => void;

  /** Full reset (e.g. when navigating away from scan or new scan starts) */
  resetScan: () => void;

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
  dealResult: null,
  hotSignal: null,
  paywallVisible: false,
  aspirationContext: null,
  paywallSignal: null,
  valueMirror: null,
  sessionMomentum: emptySessionMomentum(),
  tuningThresholds: null,

  // ── Actions ────────────────────────────────────────────────────────────

  setCameraActive: (active) => set({ cameraActive: active }),

  scanStarted: () => {
    const id = generateScanId();
    set({
      phase: "scanning",
      scanId: id,
      dealResult: null,
      hotSignal: null,
      paywallVisible: false,
      aspirationContext: null,
      paywallSignal: null,
      valueMirror: null,
    });
    return id;
  },

  fastVerdictReady: (scanId, result) => {
    if (!isCurrentScan(get(), scanId)) return false;
    set({
      phase: "fast_verdict",
      dealResult: result,
      hotSignal: result.hot_deal,
    });
    return true;
  },

  enterDopaminePhase: (scanId) => {
    if (!isCurrentScan(get(), scanId)) return false;
    set({ phase: "dopamine_phase" });
    return true;
  },

  deepAnalysisReady: (scanId, result) => {
    if (!isCurrentScan(get(), scanId)) return false;
    set({
      phase: "deep_analysis",
      dealResult: result,
      // Don't update hotSignal — keep the original fast-verdict tier
      // so dopamine animation doesn't re-trigger
    });
    return true;
  },

  enterAspirationPhase: (scanId) => {
    if (!isCurrentScan(get(), scanId)) return false;
    set({ phase: "aspiration_phase" });
    return true;
  },

  scanComplete: (scanId) => {
    if (!isCurrentScan(get(), scanId)) return false;
    set({ phase: "complete" });
    return true;
  },

  showPaywall: (scanId, aspiration, signal, mirror) => {
    if (!isCurrentScan(get(), scanId)) return false;
    set({
      phase: "paywall",
      paywallVisible: true,
      aspirationContext: aspiration,
      paywallSignal: signal,
      valueMirror: mirror,
    });
    return true;
  },

  hidePaywall: () =>
    set({
      paywallVisible: false,
      aspirationContext: null,
      phase: "complete",
    }),

  updateMomentum: (scanId, momentum) => {
    if (!isCurrentScan(get(), scanId)) return false;
    set({ sessionMomentum: momentum });
    return true;
  },

  setTuningThresholds: (t) => set({ tuningThresholds: t }),

  showLimitPaywall: () =>
    set({
      paywallVisible: true,
      aspirationContext: null,
      paywallSignal: null,
      valueMirror: null,
    }),

  resetScan: () =>
    set({
      phase: "idle",
      scanId: null,
      dealResult: null,
      hotSignal: null,
      paywallVisible: false,
      aspirationContext: null,
      paywallSignal: null,
      valueMirror: null,
    }),

  // ── Guards ─────────────────────────────────────────────────────────────

  isSITTAllowed: () => {
    const s = get();
    // SITT can only run when scan pipeline is fully idle or complete
    // AND camera is not actively feeding frames
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
