/**
 * usePremiumAccess — React hook for premium feature gating.
 *
 * Wraps src/purchases.ts checkProStatus() with a stable React interface.
 * Returns { isPro, isLoading, refresh } — components use isPro to gate.
 *
 * Safe defaults: isPro = false until verified.
 * Non-blocking: never throws, defaults to free tier on errors.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { checkProStatus } from "../../src/purchases";

interface PremiumAccessState {
  /** True when user has an active Pro entitlement */
  isPro: boolean;
  /** True while the first status check is in flight */
  isLoading: boolean;
  /** Call to re-check (e.g., after a purchase or restore) */
  refresh: () => Promise<void>;
}

export function usePremiumAccess(): PremiumAccessState {
  const [isPro, setIsPro]         = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef                = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const check = useCallback(async () => {
    try {
      const pro = await checkProStatus();
      if (mountedRef.current) setIsPro(pro);
    } catch {
      // Fail open to false — never block the UI
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    check();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    await check();
  }, [check]);

  return { isPro, isLoading, refresh };
}
