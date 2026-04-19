import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_BASE = "http://192.168.1.227:3001";
const STORAGE_KEY = "evan_auth_token";

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
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJwtPayload(token: string): { userId?: string; sub?: string; email?: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    // Base64url → base64 → decode
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function extractFromToken(token: string): { userId: string | null; email: string | null } {
  const payload = parseJwtPayload(token);
  if (!payload) return { userId: null, email: null };
  const userId = payload.userId ?? payload.sub ?? null;
  const email = payload.email ?? null;
  return { userId, email };
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

  // Load persisted token on mount
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const { userId, email } = extractFromToken(stored);
          setState({ userId, email, token: stored, isLoading: false });
        } else {
          setState((s) => ({ ...s, isLoading: false }));
        }
      } catch {
        setState((s) => ({ ...s, isLoading: false }));
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? body.message ?? "Login failed");
    }
    const { token } = await res.json();
    await AsyncStorage.setItem(STORAGE_KEY, token);
    const { userId, email: parsedEmail } = extractFromToken(token);
    setState({ userId, email: parsedEmail ?? email, token, isLoading: false });
  }, []);

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName }),
      });
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
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
