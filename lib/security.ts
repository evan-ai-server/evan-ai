/**
 * Security utilities for Evan AI
 * Centralizes input sanitization, validation, and safe logging.
 */

// ─── Input sanitization ───────────────────────────────────────────────────────

/** Strip control characters and limit length. Safe for user-supplied scan hints. */
export function sanitizeHint(value: string | null | undefined, maxLen = 100): string {
  if (!value) return "";
  return value
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // strip control chars
    .replace(/[<>"'`]/g, "")                        // strip HTML/template injection chars
    .trim()
    .slice(0, maxLen);
}

/** Sanitize a search query string (item name, keywords). */
export function sanitizeQuery(value: string | null | undefined, maxLen = 120): string {
  if (!value) return "";
  return value
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .replace(/[<>"'`\\]/g, "")
    .trim()
    .slice(0, maxLen);
}

/** Sanitize prop/context strings used in vision API calls. */
export function sanitizePropContext(value: string | null | undefined, maxLen = 200): string {
  if (!value) return "";
  return value
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .replace(/[<>"'`\\]/g, "")
    .trim()
    .slice(0, maxLen);
}

// ─── Safe logging ─────────────────────────────────────────────────────────────

/**
 * Log only in development. In production, logs are suppressed to avoid leaking
 * sensitive data (vision responses, user queries, API responses).
 */
export const devLog = __DEV__
  ? (...args: unknown[]) => console.log(...args)
  : () => {};

export const devWarn = __DEV__
  ? (...args: unknown[]) => console.warn(...args)
  : () => {};

// ─── Error messages ───────────────────────────────────────────────────────────

/**
 * Return a user-safe error message — never expose stack traces or internal details.
 */
export function safeErrorMessage(err: unknown, fallback = "Something went wrong."): string {
  if (!err) return fallback;
  if (typeof err === "string") return err.slice(0, 200);
  if (err instanceof Error) {
    const msg = err.message ?? "";
    // Block anything that looks like a stack trace or internal path
    if (msg.includes("at Object.") || msg.includes("/node_modules/") || msg.includes("TypeError:")) {
      return fallback;
    }
    return msg.slice(0, 200) || fallback;
  }
  return fallback;
}
