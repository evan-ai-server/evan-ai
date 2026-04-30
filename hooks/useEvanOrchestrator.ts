/**
 * Evan AI — useEvanOrchestrator (The Event Horizon)
 *
 * SINGLE ENTRY POINT for the entire scan-complete pipeline.
 * No UI code may call runDealEngine, fastVerdictReady, showPaywall,
 * or updateMomentum directly — everything flows through here.
 *
 * Architecture:
 *   - State-driven phase transitions (no setTimeout for business logic)
 *   - Every scan gets a unique scanId — stale scans are rejected
 *   - All state writes go through useEvanBrain (single source of truth)
 *   - UI subscribes to brain store via selectors — never writes
 *
 * Phase flow:
 *   1. handleScan(input) → scanId generated, brain enters "scanning"
 *   2. Deal Engine runs → fastVerdictReady (brain: "fast_verdict")
 *   3. Brain enters "dopamine_phase" → DopamineLayer reacts via selector
 *   4. Dopamine callback fires → brain enters "deep_analysis"
 *   5. Momentum + ValueMirror computed → brain enters "aspiration_phase"
 *   6. If shouldTrigger → brain enters "paywall" (showPaywall)
 *   7. Otherwise → brain enters "complete"
 *
 * InteractionManager is used ONLY for yielding to UI thread —
 * never as a timer or delay mechanism.
 */

import { useCallback, useRef } from "react";
import { InteractionManager } from "react-native";
import {
  runDealEngine,
  computePaywallSignal,
  type DealInput,
  type DealResult,
} from "../services/dealEngine";
import {
  computeValueMirror,
  updateSessionMomentum,
} from "../services/finance/ValueMirror";
import type { AspirationContext } from "../components/subscription/SubscriptionModal";
import { useEvanBrain } from "./useEvanBrain";

// ── Types ──────────────────────────────────────────────────────────────────

interface OrchestratorConfig {
  isPro: boolean;
  scansUsed: number;
  freeLimit: number;
}

export interface ScanOutcome {
  scanId: string;
  dealResult: DealResult;
  shouldShowPaywall: boolean;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useEvanOrchestrator(config: OrchestratorConfig) {
  // Track the active scanId so we can cancel stale sequences
  const activeScanIdRef = useRef<string | null>(null);
  const interactionHandleRef = useRef<ReturnType<
    typeof InteractionManager.runAfterInteractions
  > | null>(null);

  /**
   * Cancel any pending sequence from a previous scan.
   */
  const cancelSequence = useCallback(() => {
    activeScanIdRef.current = null;
    if (interactionHandleRef.current) {
      interactionHandleRef.current.cancel();
      interactionHandleRef.current = null;
    }
  }, []);

  /**
   * Advance past the dopamine phase into deep analysis + aspiration.
   * Called by the UI when the dopamine animation completes,
   * OR by a fallback timer if the animation callback doesn't fire.
   *
   * This is the ONLY way to exit the dopamine phase.
   */
  const advancePastDopamine = useCallback(
    (scanId: string, dealResult: DealResult) => {
      const brain = useEvanBrain.getState();

      // Stale scan guard
      if (brain.scanId !== scanId) return;

      // ── Deep Analysis phase ────────────────────────────────────────
      // In the current architecture, deal engine runs both phases synchronously.
      // We still transition through deep_analysis for state machine correctness.
      brain.deepAnalysisReady(scanId, dealResult);

      // ── Aspiration Engine (free users only) ────────────────────────
      if (!config.isPro) {
        brain.enterAspirationPhase(scanId);

        // Yield to UI thread before computing value math
        interactionHandleRef.current =
          InteractionManager.runAfterInteractions(() => {
            interactionHandleRef.current = null;

            // Re-read brain state — may have been reset
            const currentBrain = useEvanBrain.getState();
            if (currentBrain.scanId !== scanId) return;

            // ── Paywall Signal ─────────────────────────────────────
            const paywallSig = computePaywallSignal(
              config.scansUsed,
              config.freeLimit,
              dealResult.deep.expected_profit,
              dealResult.hot_deal.tier,
            );

            // ── Session Momentum ───────────────────────────────────
            const newMomentum = updateSessionMomentum(
              currentBrain.sessionMomentum,
              dealResult.hot_deal.tier,
              dealResult.deep.expected_profit,
              Math.max(0, config.freeLimit - config.scansUsed),
            );
            useEvanBrain.getState().updateMomentum(scanId, newMomentum);

            // ── Value Mirror ───────────────────────────────────────
            const mirror = computeValueMirror(
              dealResult.hot_deal.tier,
              dealResult.deep.expected_profit,
              newMomentum,
              false,
              config.scansUsed,
              config.freeLimit,
            );

            // ── Fire aspiration paywall if warranted ───────────────
            if (mirror.shouldTrigger && paywallSig.isAspirationTrigger) {
              const aspirationData: AspirationContext = {
                winFrame: mirror.winFrameText,
                gapFrame: mirror.gapFrameText,
                lossFrame: mirror.lossFrameText,
                lastProfit: dealResult.deep.expected_profit,
                triggerType: mirror.trigger,
              };

              useEvanBrain.getState().showPaywall(
                scanId,
                aspirationData,
                paywallSig,
                mirror,
              );
            } else {
              // No paywall — scan is complete
              useEvanBrain.getState().scanComplete(scanId);
            }
          });
      } else {
        // Pro user — no paywall logic, scan is complete
        useEvanBrain.getState().scanComplete(scanId);
      }
    },
    [config.isPro, config.scansUsed, config.freeLimit],
  );

  /**
   * handleScan — THE SINGLE ENTRY POINT for the scan pipeline.
   *
   * Call this from the UI the moment scan data is ready.
   * Returns the ScanOutcome synchronously (dealResult for card attachment),
   * then drives the full phase sequence asynchronously via brain store.
   *
   * NO setTimeout. NO local state. Everything goes through the brain.
   */
  const handleScan = useCallback(
    (input: DealInput): ScanOutcome | null => {
      // Cancel any lingering sequence
      cancelSequence();

      // ── Generate scanId + enter scanning phase ─────────────────────
      const scanId = useEvanBrain.getState().scanStarted();
      activeScanIdRef.current = scanId;

      // ── Run Deal Engine (synchronous, <2ms) ────────────────────────
      let dealResult: DealResult;
      try {
        dealResult = runDealEngine(input);
      } catch {
        useEvanBrain.getState().resetScan();
        return null;
      }

      // ══════════════════════════════════════════════════════════════════
      // PHASE A: FAST VERDICT (T=0)
      // ══════════════════════════════════════════════════════════════════
      //
      // Write fast verdict + hot signal to brain store IMMEDIATELY.
      // DopamineLayer subscribes to hotSignal via Zustand selector —
      // it fires Reanimated animations + haptics on the native thread.

      const accepted = useEvanBrain.getState().fastVerdictReady(scanId, dealResult);
      if (!accepted) return null; // scan was superseded

      // Enter dopamine phase — animation window is now open.
      // The UI calls advancePastDopamine() when animation completes.
      useEvanBrain.getState().enterDopaminePhase(scanId);

      // ══════════════════════════════════════════════════════════════════
      // PHASE B: DOPAMINE → DEEP → ASPIRATION
      // ══════════════════════════════════════════════════════════════════
      //
      // The dopamine phase has a maximum duration. After the animation
      // window, we advance to deep analysis + aspiration automatically.
      //
      // InteractionManager yields to UI thread — when all in-flight
      // animations/interactions settle, we advance the pipeline.
      // This replaces the old setTimeout(1500) with an event-driven
      // approach: we wait for the UI thread to be free, not a fixed timer.

      interactionHandleRef.current =
        InteractionManager.runAfterInteractions(() => {
          interactionHandleRef.current = null;
          advancePastDopamine(scanId, dealResult);
        });

      // ── Synchronous return for backward compat ─────────────────────
      // Caller can attach dealResult to card object immediately.
      const willShowPaywall =
        !config.isPro &&
        dealResult.hot_deal.isTriggered;

      return {
        scanId,
        dealResult,
        shouldShowPaywall: willShowPaywall,
      };
    },
    [config.isPro, config.scansUsed, config.freeLimit, cancelSequence, advancePastDopamine],
  );

  /**
   * Dismiss the paywall and complete the scan.
   */
  const dismissPaywall = useCallback(() => {
    useEvanBrain.getState().hidePaywall();
  }, []);

  return {
    handleScan,
    cancelSequence,
    dismissPaywall,
    advancePastDopamine,
  };
}
