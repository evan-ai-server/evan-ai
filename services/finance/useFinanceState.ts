/**
 * Evan AI — useFinanceState
 *
 * React hook for reading and updating the persistent finance state.
 *
 * Loads from AsyncStorage on mount.
 * Exposes: state, recordScan, reset.
 *
 * Safe: never throws, uses emptyFinanceState as the fallback.
 * Non-blocking: all writes are fire-and-forget.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  type FinanceState,
  emptyFinanceState,
  parseFinanceState,
  recordScan,
  FINANCE_STATE_KEY,
} from "./RetentionFinance";

export interface UseFinanceStateResult {
  /** The current finance state. Never null after load. */
  state: FinanceState;
  /** True while loading from storage (first render only) */
  isLoading: boolean;
  /**
   * Record a completed scan into the finance state.
   * Persists asynchronously — never awaitable from the caller.
   */
  recordScan: (
    savedAmount: number,
    flipProfit: number | null,
    verdict: string | null,
    scannedPrice: number | null
  ) => void;
  /** Reset finance state (for testing / sign-out) */
  reset: () => void;
}

export function useFinanceState(): UseFinanceStateResult {
  const [state,     setState]     = useState<FinanceState>(emptyFinanceState());
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);

  // ── Load on mount ─────────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(FINANCE_STATE_KEY);
        if (mountedRef.current) {
          setState(parseFinanceState(raw));
        }
      } catch {
        /* fall through to emptyFinanceState */
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    })();
    return () => { mountedRef.current = false; };
  }, []);

  // ── Persist helper ────────────────────────────────────────────────────────────
  const persist = useCallback((next: FinanceState) => {
    AsyncStorage.setItem(FINANCE_STATE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  // ── Record scan ───────────────────────────────────────────────────────────────
  const record = useCallback(
    (
      savedAmount: number,
      flipProfit: number | null,
      verdict: string | null,
      scannedPrice: number | null
    ) => {
      setState((prev) => {
        const next = recordScan(prev, savedAmount, flipProfit, verdict, scannedPrice);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  // ── Reset ─────────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    const empty = emptyFinanceState();
    setState(empty);
    AsyncStorage.removeItem(FINANCE_STATE_KEY).catch(() => {});
  }, []);

  return { state, isLoading, recordScan: record, reset };
}
