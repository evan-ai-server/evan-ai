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
 *   - AbortController per scan — all stale computation actively cancelled
 *   - Deterministic transitions — dopamine waits for render acknowledgment
 *   - Full try/catch coverage — any failure → error phase, never dead state
 *
 * Phase flow:
 *   1. handleScan(input) → scanId generated, brain enters "scanning"
 *   2. Deal Engine runs → fastVerdictReady (brain: "fast_verdict")
 *   3. Brain enters "dopamine_phase" → DopamineLayer renders + acknowledges
 *   4. Brain.dopamineRendered = true → orchestrator advances to "deep_analysis"
 *   5. Momentum + ValueMirror computed → brain enters "aspiration_phase"
 *   6. If shouldTrigger → brain enters "paywall" (showPaywall)
 *   7. Otherwise → brain enters "complete"
 *
 * Cancellation guarantee:
 *   When a new scan starts, ALL previous AbortControllers are aborted.
 *   Every async boundary checks signal.aborted before proceeding.
 */

import { useCallback, useRef, useEffect } from "react";
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
  // Active AbortController — one per scan, aborted when new scan starts
  const abortControllerRef = useRef<AbortController | null>(null);
  // Track the active scanId so we can detect stale sequences
  const activeScanIdRef = useRef<string | null>(null);
  // InteractionManager handle for cleanup
  const interactionHandleRef = useRef<ReturnType<
    typeof InteractionManager.runAfterInteractions
  > | null>(null);
  // Zustand unsubscribe handle for dopamine render watch
  const dopamineUnsubRef = useRef<(() => void) | null>(null);

  // ── Config ref — always holds the latest config values ──────────────
  // The dopamine subscription captures advancePastDopamine at setup time.
  // If config changes during the dopamine phase (e.g. RevenueCat confirms
  // a purchase), the closure would use stale isPro/scansUsed/freeLimit.
  // Reading from this ref inside advancePastDopamine guarantees we always
  // use the current config, not the config at subscription creation time.
  const configRef = useRef(config);
  configRef.current = config;

  // Clean up subscriptions on unmount
  useEffect(() => {
    return () => {
      dopamineUnsubRef.current?.();
      dopamineUnsubRef.current = null;
      interactionHandleRef.current?.cancel();
      interactionHandleRef.current = null;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

  /**
   * Cancel all pending work from a previous scan.
   * Aborts the controller, cancels InteractionManager handles,
   * and tears down any Zustand subscriptions.
   */
  const cancelSequence = useCallback(() => {
    const previousScanId = activeScanIdRef.current;
    activeScanIdRef.current = null;

    // Abort all in-flight async work
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      if (previousScanId) {
        useEvanBrain.getState().logEvent("ABORT_TRIGGERED", {
          abortedScanId: previousScanId,
        });
      }
    }

    // Cancel pending InteractionManager callbacks
    if (interactionHandleRef.current) {
      interactionHandleRef.current.cancel();
      interactionHandleRef.current = null;
    }

    // Tear down dopamine render subscription
    if (dopamineUnsubRef.current) {
      dopamineUnsubRef.current();
      dopamineUnsubRef.current = null;
    }
  }, []);

  /**
   * Advance past the dopamine phase into deep analysis + aspiration.
   * Triggered DETERMINISTICALLY when brain.dopamineRendered becomes true,
   * NOT by timers or InteractionManager assumptions.
   *
   * This is the ONLY way to exit the dopamine phase.
   */
  const advancePastDopamine = useCallback(
    (scanId: string, dealResult: DealResult, signal: AbortSignal) => {
      // ── Abort guard ────────────────────────────────────────────────
      if (signal.aborted) return;

      const brain = useEvanBrain.getState();

      // Stale scan guard
      if (brain.scanId !== scanId) return;

      // Read LATEST config from ref — not from stale closure.
      // The dopamine subscription captures this function at setup time.
      // If isPro/scansUsed/freeLimit change during the dopamine phase
      // (e.g. RevenueCat webhook, scan counter increment), we must use
      // the current values, not the values at subscription creation.
      const cfg = configRef.current;

      try {
        // ── Deep Analysis phase ──────────────────────────────────────
        // Deal engine runs both phases synchronously in current architecture.
        // We still transition through deep_analysis for state machine correctness.
        brain.deepAnalysisReady(scanId, dealResult);

        // ── Abort check after phase transition ───────────────────────
        if (signal.aborted) return;

        // ── Aspiration Engine (free users only) ──────────────────────
        if (!cfg.isPro) {
          brain.enterAspirationPhase(scanId);

          // Yield to UI thread before computing value math.
          // InteractionManager is used ONLY to yield — not as a timer.
          interactionHandleRef.current =
            InteractionManager.runAfterInteractions(() => {
              interactionHandleRef.current = null;

              // ── Abort check after yield ────────────────────────────
              if (signal.aborted) return;

              // Re-read brain state — may have been reset
              const currentBrain = useEvanBrain.getState();
              if (currentBrain.scanId !== scanId) return;

              // Re-read config after yield — may have changed
              const latestCfg = configRef.current;

              // If user became Pro during the yield, skip paywall entirely
              if (latestCfg.isPro) {
                useEvanBrain.getState().scanComplete(scanId);
                return;
              }

              try {
                // ── Paywall Signal ─────────────────────────────────
                const paywallSig = computePaywallSignal(
                  latestCfg.scansUsed,
                  latestCfg.freeLimit,
                  dealResult.deep.expected_profit,
                  dealResult.hot_deal.tier,
                );

                if (signal.aborted) return;

                // ── Session Momentum ───────────────────────────────
                const newMomentum = updateSessionMomentum(
                  currentBrain.sessionMomentum,
                  dealResult.hot_deal.tier,
                  dealResult.deep.expected_profit,
                  Math.max(0, latestCfg.freeLimit - latestCfg.scansUsed),
                );
                useEvanBrain.getState().updateMomentum(scanId, newMomentum);

                if (signal.aborted) return;

                // ── Value Mirror ───────────────────────────────────
                const mirror = computeValueMirror(
                  dealResult.hot_deal.tier,
                  dealResult.deep.expected_profit,
                  newMomentum,
                  false,
                  latestCfg.scansUsed,
                  latestCfg.freeLimit,
                );

                if (signal.aborted) return;

                // ── Fire aspiration paywall if warranted ───────────
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
              } catch (err: any) {
                // Aspiration computation failed — transition to error
                if (!signal.aborted) {
                  useEvanBrain.getState().setError(
                    scanId,
                    `Aspiration computation failed: ${err?.message || "unknown error"}`,
                  );
                }
              }
            });
        } else {
          // Pro user — no paywall logic, scan is complete
          useEvanBrain.getState().scanComplete(scanId);
        }
      } catch (err: any) {
        // Deep analysis / phase transition failed
        if (!signal.aborted) {
          useEvanBrain.getState().setError(
            scanId,
            `Post-dopamine pipeline failed: ${err?.message || "unknown error"}`,
          );
        }
      }
    },
    [], // No config deps — reads from configRef for always-fresh values
  );

  /**
   * handleScan — THE SINGLE ENTRY POINT for the scan pipeline.
   *
   * Call this from the UI the moment scan data is ready.
   * Returns the ScanOutcome synchronously (dealResult for card attachment),
   * then drives the full phase sequence asynchronously via brain store.
   *
   * Guarantees:
   *   - Previous scan is fully cancelled (AbortController + InteractionManager)
   *   - All async work checks signal.aborted at every boundary
   *   - Any throw transitions to error phase — no dead states
   *   - Dopamine → deep transition waits for render acknowledgment
   */
  const handleScan = useCallback(
    (input: DealInput): ScanOutcome | null => {
      // ── Cancel all previous work ────────────────────────────────────
      cancelSequence();

      // ── Create new AbortController for this scan ────────────────────
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const signal = controller.signal;

      // ── Generate scanId + enter scanning phase ──────────────────────
      const scanId = useEvanBrain.getState().scanStarted();
      activeScanIdRef.current = scanId;

      // ── Run Deal Engine (synchronous, <2ms) ─────────────────────────
      let dealResult: DealResult;
      try {
        dealResult = runDealEngine(input);
      } catch (err: any) {
        useEvanBrain.getState().setError(
          scanId,
          `Deal engine failed: ${err?.message || "unknown error"}`,
        );
        return null;
      }

      // ══════════════════════════════════════════════════════════════════
      // PHASE A: FAST VERDICT (T=0)
      // ══════════════════════════════════════════════════════════════════
      //
      // Write fast verdict + hot signal to brain store IMMEDIATELY.
      // DopamineLayer subscribes to hotSignal via Zustand selector —
      // it fires Reanimated animations + haptics on the native thread.

      try {
        const accepted = useEvanBrain.getState().fastVerdictReady(scanId, dealResult);
        if (!accepted) return null; // scan was superseded

        // Enter dopamine phase — animation window is now open.
        useEvanBrain.getState().enterDopaminePhase(scanId);
      } catch (err: any) {
        useEvanBrain.getState().setError(
          scanId,
          `Fast verdict transition failed: ${err?.message || "unknown error"}`,
        );
        return null;
      }

      // ══════════════════════════════════════════════════════════════════
      // PHASE B: DOPAMINE → DEEP → ASPIRATION
      // ══════════════════════════════════════════════════════════════════
      //
      // DETERMINISTIC: We subscribe to brain.dopamineRendered.
      // When DopamineLayer calls markDopamineRendered(scanId),
      // the subscription fires and we advance the pipeline.
      //
      // This replaces the old InteractionManager-as-timer approach
      // with a truth-based transition: UI confirms render → we proceed.

      dopamineUnsubRef.current?.();
      dopamineUnsubRef.current = useEvanBrain.subscribe(
        (state, prevState) => {
          // Only react when dopamineRendered transitions false → true
          if (!state.dopamineRendered || prevState.dopamineRendered) return;
          if (signal.aborted) return;
          if (state.scanId !== scanId) return;

          // Tear down this subscription — one-shot
          dopamineUnsubRef.current?.();
          dopamineUnsubRef.current = null;

          // Yield to UI thread, then advance
          interactionHandleRef.current =
            InteractionManager.runAfterInteractions(() => {
              interactionHandleRef.current = null;
              if (signal.aborted) return;
              advancePastDopamine(scanId, dealResult, signal);
            });
        },
      );

      // ── Synchronous return for backward compat ──────────────────────
      // Caller can attach dealResult to card object immediately.
      // Read from configRef for latest isPro value
      const willShowPaywall =
        !configRef.current.isPro &&
        dealResult.hot_deal.isTriggered;

      return {
        scanId,
        dealResult,
        shouldShowPaywall: willShowPaywall,
      };
    },
    [cancelSequence, advancePastDopamine],
  );

  /**
   * Dismiss the paywall and complete the scan.
   */
  const dismissPaywall = useCallback(() => {
    useEvanBrain.getState().hidePaywall();
  }, []);

  /**
   * Retry from error state — resets error and returns to idle.
   * The UI can then trigger a new scan.
   */
  const retryFromError = useCallback(() => {
    const brain = useEvanBrain.getState();
    if (brain.phase === "error") {
      brain.resetScan();
    }
  }, []);

  return {
    handleScan,
    cancelSequence,
    dismissPaywall,
    advancePastDopamine,
    retryFromError,
  };
}
