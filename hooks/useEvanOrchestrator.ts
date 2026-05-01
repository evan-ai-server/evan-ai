/**
 * Evan AI — useEvanOrchestrator (The Event Horizon) [OPUS 4.7 MAX]
 *
 * SINGLE ENTRY POINT for the entire scan-complete pipeline.
 * No UI code may call runDealEngine, fastVerdictReady, showPaywall,
 * or updateMomentum directly — everything flows through here.
 *
 * OPUS 4.7 Upgrades:
 *   - All state mutations routed through ScanGovernor (pre-flight validation)
 *   - 8s dopamine watchdog replaced by PhaseContract (liveness guarantees)
 *   - ScanScheduler notified on scan completion (backpressure control)
 *   - Every phase has a contract with tiered escalation
 *   - Abort tracking enforced by Governor (no writes after abort)
 *
 * Architecture:
 *   UI → ScanScheduler → handleScan → ScanGovernor → useEvanBrain
 *                                   → PhaseContractManager (liveness)
 *                                   → ScanObserver (observability)
 *
 * Phase flow:
 *   1. handleScan(input) → Governor validates + brain enters "scanning"
 *   2. Deal Engine runs → Governor.fastVerdictReady (brain: "fast_verdict")
 *   3. Governor.enterDopaminePhase → PhaseContract monitors dopamine ack
 *   4. DopamineLayer acks → contract fulfilled → advancePastDopamine
 *   5. Contract timeout (8s) → force-advance (last resort, not primary)
 *   6. Momentum + ValueMirror → aspiration → paywall or complete
 *
 * Cancellation guarantee:
 *   When a new scan starts, ALL previous AbortControllers are aborted,
 *   Governor marks the old scan as aborted (blocking future writes),
 *   and all active PhaseContracts are cancelled.
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
import { ScanGovernor } from "../services/ScanGovernor";
import { PhaseContractManager } from "../services/PhaseContract";
import { ScanScheduler } from "../services/ScanScheduler";

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

  // NOTE: dopamineTimeoutRef REMOVED — replaced by PhaseContract system.
  // The 8s watchdog is now a contract timeout with tiered escalation.

  // ── Config ref — always holds the latest config values ──────────────
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
      // Cancel any active phase contract to prevent timer leaks
      PhaseContractManager.exit();
    };
  }, []);

  /**
   * Cancel all pending work from a previous scan.
   * Aborts the controller, cancels PhaseContract, marks abort in Governor,
   * and tears down Zustand subscriptions.
   */
  const cancelSequence = useCallback(() => {
    const previousScanId = activeScanIdRef.current;
    activeScanIdRef.current = null;

    // ── Governor: mark scan as aborted (blocks future writes) ─────────
    if (previousScanId) {
      ScanGovernor.markAborted(previousScanId);
    }

    // ── PhaseContract: cancel active contract ─────────────────────────
    PhaseContractManager.exit();

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
   * All mutations go through ScanGovernor for pre-flight validation.
   */
  const advancePastDopamine = useCallback(
    (scanId: string, dealResult: DealResult, signal: AbortSignal) => {
      // ── Abort guard ────────────────────────────────────────────────
      if (signal.aborted) return;

      const brain = useEvanBrain.getState();

      // Stale scan guard
      if (brain.scanId !== scanId) return;

      // Read LATEST config from ref — not from stale closure.
      const cfg = configRef.current;

      try {
        // ── Deep Analysis phase (via Governor) ──────────────────────
        ScanGovernor.deepAnalysisReady(scanId, dealResult);

        // ── PhaseContract: deep_analysis ────────────────────────────
        PhaseContractManager.exit();
        PhaseContractManager.enter("deep_analysis", scanId, {
          onEscalation: (_p, _s, signals) => {
            useEvanBrain.getState().logEvent("DEEP_ANALYSIS_STALL", {
              source: "contract_escalation",
              signals,
            });
          },
          onTimeout: (_p, sid) => {
            if (!signal.aborted && useEvanBrain.getState().scanId === sid) {
              ScanGovernor.setError(sid, "Deep analysis phase contract timeout");
              PhaseContractManager.exit();
              ScanScheduler.scanFinished();
            }
          },
        });

        // ── Abort check after phase transition ───────────────────────
        if (signal.aborted) return;

        // ── Aspiration Engine (free users only) ──────────────────────
        if (!cfg.isPro) {
          ScanGovernor.enterAspirationPhase(scanId);

          // ── PhaseContract: aspiration_phase ────────────────────────
          PhaseContractManager.exit();
          PhaseContractManager.enter("aspiration_phase", scanId, {
            onEscalation: (_p, _s, signals) => {
              useEvanBrain.getState().logEvent("ASPIRATION_STALL", {
                source: "contract_escalation",
                signals,
              });
            },
            onTimeout: (_p, sid) => {
              if (!signal.aborted && useEvanBrain.getState().scanId === sid) {
                ScanGovernor.setError(sid, "Aspiration phase contract timeout");
                PhaseContractManager.exit();
                ScanScheduler.scanFinished();
              }
            },
          });

          // Yield to UI thread before computing value math.
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
                ScanGovernor.scanComplete(scanId);
                PhaseContractManager.exit();
                ScanScheduler.scanFinished();
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

                  ScanGovernor.showPaywall(
                    scanId,
                    aspirationData,
                    paywallSig,
                    mirror,
                  );
                  PhaseContractManager.exit();
                  // Don't call scanFinished — paywall is still active
                } else {
                  // No paywall — scan is complete
                  ScanGovernor.scanComplete(scanId);
                  PhaseContractManager.exit();
                  ScanScheduler.scanFinished();
                }
              } catch (err: any) {
                // Aspiration computation failed — transition to error
                if (!signal.aborted) {
                  ScanGovernor.setError(
                    scanId,
                    `Aspiration computation failed: ${err?.message || "unknown error"}`,
                  );
                  PhaseContractManager.exit();
                  ScanScheduler.scanFinished();
                }
              }
            });
        } else {
          // Pro user — no paywall logic, scan is complete
          ScanGovernor.scanComplete(scanId);
          PhaseContractManager.exit();
          ScanScheduler.scanFinished();
        }
      } catch (err: any) {
        // Deep analysis / phase transition failed
        if (!signal.aborted) {
          ScanGovernor.setError(
            scanId,
            `Post-dopamine pipeline failed: ${err?.message || "unknown error"}`,
          );
          PhaseContractManager.exit();
          ScanScheduler.scanFinished();
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
   * OPUS 4.7 Guarantees:
   *   - Previous scan fully cancelled (AbortController + Governor + PhaseContract)
   *   - All state mutations pre-validated by Governor (TransitionValidator)
   *   - Every phase has a liveness contract (no infinite stalls)
   *   - Scheduler notified on completion (backpressure control)
   *   - Any throw transitions to error phase — no dead states
   */
  const handleScan = useCallback(
    (input: DealInput): ScanOutcome | null => {
      // ── Cancel all previous work ────────────────────────────────────
      cancelSequence();

      // ── Create new AbortController for this scan ────────────────────
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const signal = controller.signal;

      // ── Governor: validate + execute scan start ─────────────────────
      const scanId = ScanGovernor.scanStarted();
      if (!scanId) return null;
      activeScanIdRef.current = scanId;

      // ── PhaseContract: scanning ─────────────────────────────────────
      PhaseContractManager.enter("scanning", scanId, {
        onEscalation: (_p, _s, signals) => {
          useEvanBrain.getState().logEvent("SCANNING_STALL", {
            source: "contract_escalation",
            signals,
          });
        },
        onTimeout: (_p, sid) => {
          if (!signal.aborted && useEvanBrain.getState().scanId === sid) {
            ScanGovernor.setError(sid, "Scanning phase contract timeout");
            PhaseContractManager.exit();
            ScanScheduler.scanFinished();
          }
        },
      });

      // ── Run Deal Engine (synchronous, <2ms) ─────────────────────────
      let dealResult: DealResult;
      try {
        dealResult = runDealEngine(input);
      } catch (err: any) {
        ScanGovernor.setError(
          scanId,
          `Deal engine failed: ${err?.message || "unknown error"}`,
        );
        PhaseContractManager.exit();
        ScanScheduler.scanFinished();
        return null;
      }

      // ══════════════════════════════════════════════════════════════════
      // PHASE A: FAST VERDICT (T=0)
      // ══════════════════════════════════════════════════════════════════

      try {
        const accepted = ScanGovernor.fastVerdictReady(scanId, dealResult);
        PhaseContractManager.exit(); // Exit scanning contract
        if (!accepted) return null; // scan was superseded

        // Enter dopamine phase — animation window is now open.
        ScanGovernor.enterDopaminePhase(scanId);
      } catch (err: any) {
        ScanGovernor.setError(
          scanId,
          `Fast verdict transition failed: ${err?.message || "unknown error"}`,
        );
        PhaseContractManager.exit();
        ScanScheduler.scanFinished();
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
      // LIVENESS: PhaseContract replaces the raw 8s setTimeout.
      // - Escalation at 4s: warning logged with diagnostic signals
      // - Timeout at 8s: force-advance (last resort, not primary)
      // - Progress signals tracked: component_mounted, ack_received

      dopamineUnsubRef.current?.();

      // ── PhaseContract: dopamine_phase (replaces 8s watchdog) ───────
      PhaseContractManager.enter("dopamine_phase", scanId, {
        onEscalation: (_p, sid, signals) => {
          // ── 4s warning: dopamine stalling ─────────────────────────
          useEvanBrain.getState().logEvent("DOPAMINE_STALL_WARNING", {
            source: "contract_escalation",
            signals,
            message: "Dopamine ack not received within escalation window",
          });
        },
        onTimeout: (_p, sid, signals) => {
          // ── 8s last resort: force-advance ─────────────────────────
          // Same behavior as old watchdog, but with diagnostic context.
          if (signal.aborted) return;

          const brain = useEvanBrain.getState();
          if (brain.scanId !== sid) return;
          if (brain.dopamineRendered) return; // ack arrived via another path

          // Force-acknowledge and advance
          brain.logEvent("DOPAMINE_RENDERED", {
            source: "contract_timeout",
            signals,
            timeoutMs: 8000,
          });
          ScanGovernor.markDopamineRendered(sid);

          // Tear down subscription if still active
          dopamineUnsubRef.current?.();
          dopamineUnsubRef.current = null;

          interactionHandleRef.current =
            InteractionManager.runAfterInteractions(() => {
              interactionHandleRef.current = null;
              if (signal.aborted) return;
              advancePastDopamine(sid, dealResult, signal);
            });
        },
      });

      dopamineUnsubRef.current = useEvanBrain.subscribe(
        (state, prevState) => {
          // Only react when dopamineRendered transitions false → true
          if (!state.dopamineRendered || prevState.dopamineRendered) return;
          if (signal.aborted) return;
          if (state.scanId !== scanId) return;

          // Tear down this subscription — one-shot
          dopamineUnsubRef.current?.();
          dopamineUnsubRef.current = null;

          // ── Signal contract: ack received ──────────────────────────
          PhaseContractManager.signal("ack_received");

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
    ScanGovernor.hidePaywall();
    PhaseContractManager.exit();
    ScanScheduler.scanFinished();
  }, []);

  /**
   * Retry from error state — resets error and returns to idle.
   * The UI can then trigger a new scan.
   */
  const retryFromError = useCallback(() => {
    const brain = useEvanBrain.getState();
    if (brain.phase === "error") {
      ScanGovernor.resetScan();
      PhaseContractManager.exit();
      ScanScheduler.scanFinished();
    }
  }, []);

  return {
    handleScan,
    cancelSequence,
    dismissPaywall,
    retryFromError,
  };
}
