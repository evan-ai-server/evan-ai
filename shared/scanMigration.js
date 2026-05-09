// shared/scanMigration.js
// =====================================================================
// PHASE 4 — Schema v3 stored-scan migration.
//
// Converts legacy cached scans (AsyncStorage / deep-link / notification
// payload restoration) into the canonical Phase-3 shape. Pure function;
// no I/O. The caller wraps it in AsyncStorage read/write logic.
//
// Per spec:
//   { _schemaVersion: 3, _migratedFrom: "v1" | "v2", _backup: <raw> }
//
// Rules:
//   - Migration is version-gated: runs once per device per schema
//     version. A scan already at v3 is left untouched (idempotent).
//   - The original raw scan is preserved verbatim under _backup so we
//     can roll back or audit drift after the fact.
//   - Verdict normalization is best-effort: known legacy aliases are
//     mapped to canonical; unknown values are LEFT IN PLACE so the
//     upstream telemetry layer (Phase 6) can detect them. We do not
//     drop fields — too easy to mask a real bug.
//   - The migrated scan is *not* frozen — callers may need to merge it
//     with live runtime state before persisting.
// =====================================================================

import { normalizeVerdict } from "./verdict.js";

export const CURRENT_SCAN_SCHEMA_VERSION = 3;

/**
 * @typedef {object} MigrationResult
 * @property {object | null}                scan        The migrated scan
 *                                                       (or original if no migration applied).
 * @property {boolean}                      migrated    Whether the migration ran.
 * @property {number | string | null}       fromVersion Schema version before migration.
 * @property {Array<{ path: string, raw: unknown, normalized: import("./verdictContract.js").Verdict | null }>} verdictChanges
 *                                                       For Phase 6 telemetry: every verdict
 *                                                       field touched and how it normalized.
 */

/**
 * Normalize a raw stored scan into Phase-3 canonical shape.
 *
 * @param {unknown} rawScan
 * @returns {MigrationResult}
 */
export function normalizeStoredScan(rawScan) {
  if (rawScan == null || typeof rawScan !== "object" || Array.isArray(rawScan)) {
    return { scan: rawScan ?? null, migrated: false, fromVersion: null, verdictChanges: [] };
  }

  const scanObj = /** @type {Record<string, unknown>} */ (rawScan);
  const currentVersion = scanObj._schemaVersion;

  // Idempotent: already at the current version, no work.
  if (currentVersion === CURRENT_SCAN_SCHEMA_VERSION) {
    return {
      scan: scanObj,
      migrated: false,
      fromVersion: CURRENT_SCAN_SCHEMA_VERSION,
      verdictChanges: [],
    };
  }

  const fromVersion = inferFromVersion(currentVersion);

  // Capture the unmodified original. Important: this is the LITERAL
  // pre-migration object — including any nested junk — so a future
  // reader can audit exactly what landed on disk.
  const _backup = scanObj;

  // Walk the scan and normalize every known verdict-bearing field.
  const verdictChanges = /** @type {MigrationResult["verdictChanges"]} */ ([]);
  const next = { ...scanObj };

  // Top-level verdict (the canonical field; some legacy scans put the
  // raw decision string here).
  if ("verdict" in scanObj) {
    const raw = scanObj.verdict;
    const v = normalizeVerdict(raw);
    verdictChanges.push({ path: "verdict", raw, normalized: v });
    if (v !== null) next.verdict = v;
    // If null, leave the raw value in place. Telemetry catches it.
  }

  // Nested buyOrPass.verdict — the canonical authority's own slot.
  // Some v1/v2 scans cached this with the legacy STRONG_BUY string.
  const bop = scanObj.buyOrPass;
  if (bop && typeof bop === "object" && !Array.isArray(bop) && "verdict" in bop) {
    const raw = /** @type {{ verdict: unknown }} */ (bop).verdict;
    const v = normalizeVerdict(raw);
    verdictChanges.push({ path: "buyOrPass.verdict", raw, normalized: v });
    if (v !== null) {
      next.buyOrPass = { ...bop, verdict: v };
    }
  }

  // Notification payload variants (deep-link entry / notification tap).
  const notif = scanObj.notification;
  if (notif && typeof notif === "object" && !Array.isArray(notif) && "verdict" in notif) {
    const raw = /** @type {{ verdict: unknown }} */ (notif).verdict;
    const v = normalizeVerdict(raw);
    verdictChanges.push({ path: "notification.verdict", raw, normalized: v });
    if (v !== null) {
      next.notification = { ...notif, verdict: v };
    }
  }

  next._schemaVersion = CURRENT_SCAN_SCHEMA_VERSION;
  next._migratedFrom = fromVersion;
  next._backup = _backup;

  return { scan: next, migrated: true, fromVersion, verdictChanges };
}

/**
 * Convenience wrapper: if migration ran, return the new scan + true;
 * otherwise return the original scan + false. Useful at AsyncStorage
 * call sites that just want "did the data change?".
 *
 * @param {unknown} rawScan
 * @returns {{ scan: object | null, changed: boolean }}
 */
export function migrateScanIfNeeded(rawScan) {
  const { scan, migrated } = normalizeStoredScan(rawScan);
  return {
    scan: /** @type {object | null} */ (scan ?? null),
    changed: migrated,
  };
}

/** @param {unknown} v */
function inferFromVersion(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.length > 0)        return v;
  return "v1"; // no _schemaVersion marker → pre-versioned legacy
}
