// lib/marketQueryGuard.js
// Phase V3.10B.8 — pure guard for whether a query is specific enough to run a
// market search. The backend rejects placeholder/generic queries as
// VISION_QUERY_REJECTED_GENERIC / "scan_too_vague" (e.g. the "item for sale"
// price-anchored fallback). When that placeholder reached the server, the app
// showed "Market unavailable — check your connection", which is the wrong
// message for an identity failure. This guard lets the client refuse to fire a
// market search for those queries up front and route the user to a rescan
// instead.
//
// NOTE: app/index.tsx keeps an INLINE copy of this predicate + placeholder set
// (it has no local imports — single mega-file). marketQueryGuard.test.js
// drift-guards the inline copy against this canonical one.

// Exact, normalized (trim + lowercase) placeholder queries that carry no real
// item identity. Intentionally narrow — never list real Tier-1 hints or Tier-2
// mode seeds ("replacement part", "product", "prop item", ...) here; those are
// deliberately searchable.
export const MARKET_QUERY_PLACEHOLDERS = new Set([
  "item for sale",
  "item for",
  "item",
]);

/**
 * @param {unknown} query
 * @returns {boolean} true only when the query is non-empty and not a known
 *   placeholder. Never blocks a real query — the server remains the authority
 *   on borderline genericness; this only catches the obvious placeholders.
 */
export function isMarketSearchableQuery(query) {
  if (typeof query !== "string") return false;
  const q = query.trim().toLowerCase();
  if (!q) return false;
  if (MARKET_QUERY_PLACEHOLDERS.has(q)) return false;
  return true;
}
