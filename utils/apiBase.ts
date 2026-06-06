import { Platform } from "react-native";

const _DEV_FALLBACK =
  Platform.OS === "ios" ? "http://localhost:3001" : "http://10.0.2.2:3001";

/**
 * Resolved API base URL for all frontend network calls.
 * Resolution order:
 *   1. EXPO_PUBLIC_API_URL — set in eas.json for preview / production builds
 *   2. EXPO_PUBLIC_DEV_API_URL — optional, for physical-device dev without LAN config
 *   3. localhost:3001 (iOS) / 10.0.2.2:3001 (Android) — simulator dev fallback
 *
 * In a production build with no EXPO_PUBLIC_API_URL, logs a loud error and
 * returns the dev fallback so the failure is immediately visible, not silent.
 */
export function getApiBase(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  if (process.env.EXPO_PUBLIC_DEV_API_URL) return process.env.EXPO_PUBLIC_DEV_API_URL;
  if (!__DEV__) {
    console.error(
      "[Evan AI] EXPO_PUBLIC_API_URL is not set in this build. " +
        "Add it to eas.json under the env block for preview/production."
    );
  }
  return _DEV_FALLBACK;
}
