/**
 * components/offline/useNetworkStatus.ts
 *
 * Two-layer network detection:
 * 1. AppState (immediate foreground/background transitions)
 * 2. Active heartbeat to the real server /health endpoint
 *    — polls every 15s when offline to detect recovery
 *    — single ping when coming to foreground
 *
 * Does NOT trust navigator.onLine or NetInfo alone — verifies actual
 * server reachability since LAN can be up while server is down.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

const HEARTBEAT_INTERVAL_MS = 15_000;  // poll when offline
const HEALTH_TIMEOUT_MS     = 4_000;

// Module-level debounce — even if the hook mounts/remounts rapidly
// (Expo Fast Refresh, hot-reload, StrictMode double-invoke) the actual
// fetch fires at most once per DEBOUNCE_MS. Without this guard, every
// remount fires a check immediately, which produces a burst of ~10+
// /health requests when the dev server restarts.
const DEBOUNCE_MS = 10_000;
let _lastFetchAt  = 0;
let _lastResult   = true; // optimistic: assume online until first check

export interface NetworkStatus {
  isOnline: boolean;
  wasOffline: boolean;        // true during the session when we've been offline
  lastCheckedAt: number | null;
  /** Call to force an immediate reachability check */
  checkNow: () => Promise<boolean>;
}

export function useNetworkStatus(apiBase: string): NetworkStatus {
  const [isOnline, setIsOnline]       = useState(true);
  const [wasOffline, setWasOffline]   = useState(false);
  const [lastChecked, setLastChecked] = useState<number | null>(null);

  const isOnlineRef  = useRef(isOnline);
  const apiBaseRef   = useRef(apiBase);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { apiBaseRef.current = apiBase; }, [apiBase]);
  useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);

  const checkServer = useCallback(async (): Promise<boolean> => {
    const base = apiBaseRef.current;
    if (!base) return false;

    // Debounce: skip the network round-trip if we checked recently and
    // already know we're online. This prevents Expo Fast Refresh / rapid
    // remounts from flooding /health with burst requests.
    const now = Date.now();
    if (_lastResult && now - _lastFetchAt < DEBOUNCE_MS) {
      return _lastResult;
    }

    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
      const r    = await fetch(`${base}/health`, { method: 'GET', signal: ctrl.signal });
      clearTimeout(tid);
      const ok = r.ok;
      _lastFetchAt = Date.now();
      _lastResult  = ok;
      setLastChecked(_lastFetchAt);
      setIsOnline(prev => {
        if (prev && !ok) setWasOffline(true);
        return ok;
      });
      if (!ok) setWasOffline(true);
      return ok;
    } catch {
      const ts = Date.now();
      _lastFetchAt = ts;
      _lastResult  = false;
      setLastChecked(ts);
      setIsOnline(prev => {
        if (prev) setWasOffline(true);
        return false;
      });
      return false;
    }
  }, []);

  // Start/stop the offline heartbeat timer
  const startHeartbeat = useCallback(() => {
    if (heartbeatRef.current) return;
    heartbeatRef.current = setInterval(async () => {
      if (!isOnlineRef.current) {
        await checkServer();
      } else {
        // Online — stop polling
        stopHeartbeat();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }, [checkServer]);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  // AppState: ping immediately when app foregrounds
  useEffect(() => {
    const handler = async (next: AppStateStatus) => {
      if (next === 'active') {
        const ok = await checkServer();
        if (!ok) startHeartbeat();
        else stopHeartbeat();
      }
    };
    const sub = AppState.addEventListener('change', handler);
    return () => sub.remove();
  }, [checkServer, startHeartbeat, stopHeartbeat]);

  // Initial check on mount
  useEffect(() => {
    checkServer().then(ok => {
      if (!ok) startHeartbeat();
    });
    return () => stopHeartbeat();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When we come back online, stop heartbeat
  useEffect(() => {
    if (isOnline) {
      stopHeartbeat();
    } else {
      startHeartbeat();
    }
  }, [isOnline, startHeartbeat, stopHeartbeat]);

  return {
    isOnline,
    wasOffline,
    lastCheckedAt: lastChecked,
    checkNow: checkServer,
  };
}
