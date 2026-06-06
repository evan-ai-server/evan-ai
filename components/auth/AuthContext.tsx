import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBase } from "../../utils/apiBase";

const API_BASE = getApiBase();

const STORAGE_KEY = "evan_auth_token";
const LOCKOUT_KEY = "evan_auth_lockout";
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthState {
  userId: string | null;
  email: string | null;
  token: string | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  lockoutRemainingMs: () => Promise<number>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJwtPayload(
  token: string
): { userId?: string; sub?: string; email?: string; exp?: number } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const payload = parseJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") return false; // no exp = non-expiring
  return Date.now() / 1000 > payload.exp;
}

function extractFromToken(token: string): { userId: string | null; email: string | null } {
  const payload = parseJwtPayload(token);
  if (!payload) return { userId: null, email: null };
  const userId = payload.userId ?? payload.sub ?? null;
  const email = payload.email ?? null;
  return { userId, email };
}

// ─── Lockout helpers ──────────────────────────────────────────────────────────

interface LockoutRecord {
  attempts: number;
  lockedUntil: number; // epoch ms, 0 = not locked
}

async function getLockout(): Promise<LockoutRecord> {
  try {
    const raw = await AsyncStorage.getItem(LOCKOUT_KEY);
    if (!raw) return { attempts: 0, lockedUntil: 0 };
    return JSON.parse(raw) as LockoutRecord;
  } catch {
    return { attempts: 0, lockedUntil: 0 };
  }
}

async function saveLockout(record: LockoutRecord): Promise<void> {
  try {
    await AsyncStorage.setItem(LOCKOUT_KEY, JSON.stringify(record));
  } catch { /* non-critical */ }
}

async function recordFailedAttempt(): Promise<LockoutRecord> {
  const rec = await getLockout();
  const now = Date.now();
  // Reset attempt count if previous lockout has expired
  const attempts = rec.lockedUntil > 0 && now > rec.lockedUntil ? 1 : rec.attempts + 1;
  const lockedUntil = attempts >= MAX_ATTEMPTS ? now + LOCKOUT_MS : 0;
  const updated = { attempts, lockedUntil };
  await saveLockout(updated);
  return updated;
}

async function clearLockout(): Promise<void> {
  await saveLockout({ attempts: 0, lockedUntil: 0 });
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  userId: null,
  email: null,
  token: null,
  isLoading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  lockoutRemainingMs: async () => 0,
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    userId: null,
    email: null,
    token: null,
    isLoading: true,
  });

  // Load persisted token on mount; discard if expired
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored && !isTokenExpired(stored)) {
          const { userId, email } = extractFromToken(stored);
          setState({ userId, email, token: stored, isLoading: false });
        } else {
          if (stored) await AsyncStorage.removeItem(STORAGE_KEY); // clear expired
          setState((s) => ({ ...s, isLoading: false }));
        }
      } catch {
        setState((s) => ({ ...s, isLoading: false }));
      }
    })();
  }, []);

  const lockoutRemainingMs = useCallback(async (): Promise<number> => {
    const rec = await getLockout();
    if (rec.lockedUntil <= 0) return 0;
    return Math.max(0, rec.lockedUntil - Date.now());
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    // Check lockout before making any request
    const rec = await getLockout();
    if (rec.lockedUntil > 0 && Date.now() < rec.lockedUntil) {
      const mins = Math.ceil((rec.lockedUntil - Date.now()) / 60000);
      throw new Error(`Too many failed attempts. Try again in ${mins} minute${mins !== 1 ? "s" : ""}.`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      await recordFailedAttempt();
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? body.message ?? "Login failed");
    }

    const { token } = await res.json();
    await clearLockout();
    await AsyncStorage.setItem(STORAGE_KEY, token);
    const { userId, email: parsedEmail } = extractFromToken(token);
    setState({ userId, email: parsedEmail ?? email, token, isLoading: false });
  }, []);

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      let res: Response;
      try {
        res = await fetch(`${API_BASE}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, displayName }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? body.message ?? "Registration failed");
      }
      const { token } = await res.json();
      await AsyncStorage.setItem(STORAGE_KEY, token);
      const { userId, email: parsedEmail } = extractFromToken(token);
      setState({ userId, email: parsedEmail ?? email, token, isLoading: false });
    },
    []
  );

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setState({ userId: null, email: null, token: null, isLoading: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, lockoutRemainingMs }}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
