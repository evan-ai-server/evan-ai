// shared/scanMigration.test.js
// Phase 4 schema-v3 migration tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeStoredScan,
  migrateScanIfNeeded,
  CURRENT_SCAN_SCHEMA_VERSION,
} from "./scanMigration.js";

test("CURRENT_SCAN_SCHEMA_VERSION is 3 (matches Phase 0/3 spec)", () => {
  assert.equal(CURRENT_SCAN_SCHEMA_VERSION, 3);
});

// ── Idempotency ──────────────────────────────────────────────────────

test("normalizeStoredScan is idempotent on a v3 scan — returns same object, migrated=false", () => {
  const v3Scan = { _schemaVersion: 3, verdict: "BUY", _backup: {} };
  const out = normalizeStoredScan(v3Scan);
  assert.equal(out.migrated,    false);
  assert.equal(out.fromVersion, 3);
  assert.equal(out.scan,        v3Scan, "should be the same object reference");
  assert.deepEqual(out.verdictChanges, []);
});

test("normalizeStoredScan handles null and undefined input gracefully", () => {
  assert.deepEqual(normalizeStoredScan(null),       { scan: null, migrated: false, fromVersion: null, verdictChanges: [] });
  assert.deepEqual(normalizeStoredScan(undefined),  { scan: null, migrated: false, fromVersion: null, verdictChanges: [] });
  assert.deepEqual(normalizeStoredScan("not-obj"),  { scan: "not-obj", migrated: false, fromVersion: null, verdictChanges: [] });
  assert.deepEqual(normalizeStoredScan([]),         { scan: [], migrated: false, fromVersion: null, verdictChanges: [] });
});

// ── First-load v1 migration ──────────────────────────────────────────

test("normalizeStoredScan migrates a pre-versioned scan and stamps _schemaVersion: 3", () => {
  const v1 = { verdict: "STRONG_BUY", confidence: 80 };
  const { scan, migrated, fromVersion } = normalizeStoredScan(v1);
  assert.equal(migrated, true);
  assert.equal(fromVersion, "v1", "missing version → v1");
  assert.equal(scan._schemaVersion, 3);
  assert.equal(scan._migratedFrom, "v1");
  assert.equal(scan.verdict, "BUY", "STRONG_BUY normalized to BUY");
  assert.equal(scan.confidence, 80, "non-verdict fields preserved");
});

test("normalizeStoredScan captures the literal pre-migration object as _backup", () => {
  const v1 = { verdict: "GREAT_FLIP", junk: { weird: "stuff" } };
  const { scan } = normalizeStoredScan(v1);
  assert.equal(scan._backup, v1, "backup must be the original reference");
  assert.equal(scan._backup.verdict, "GREAT_FLIP", "backup unmutated");
  assert.equal(scan._backup.junk.weird, "stuff");
});

test("normalizeStoredScan migrates v2 (numeric schemaVersion) and records fromVersion", () => {
  const v2 = { _schemaVersion: 2, verdict: "OVERPRICED" };
  const { scan, migrated, fromVersion } = normalizeStoredScan(v2);
  assert.equal(migrated, true);
  assert.equal(fromVersion, 2);
  assert.equal(scan._migratedFrom, 2);
  assert.equal(scan.verdict, "PASS");
});

// ── Nested fields ────────────────────────────────────────────────────

test("normalizeStoredScan normalizes nested buyOrPass.verdict", () => {
  const v1 = {
    verdict: "STRONG_BUY",
    buyOrPass: { verdict: "GOOD_DEAL", confidence: 70 },
  };
  const { scan } = normalizeStoredScan(v1);
  assert.equal(scan.verdict, "BUY");
  assert.equal(scan.buyOrPass.verdict, "BUY");
  assert.equal(scan.buyOrPass.confidence, 70);
});

test("normalizeStoredScan normalizes nested notification.verdict (deep-link/notif tap)", () => {
  const v1 = {
    notification: { verdict: "STEAL_DEAL", title: "🔥 Steal" },
  };
  const { scan } = normalizeStoredScan(v1);
  assert.equal(scan.notification.verdict, "BUY");
  assert.equal(scan.notification.title, "🔥 Steal", "non-verdict notif fields preserved");
});

// ── Unknown values: keep original, telemetry-friendly ───────────────

test("normalizeStoredScan keeps an unparseable verdict in place — does NOT drop the field", () => {
  const v1 = { verdict: "ZOMBIE_FROM_2024" };
  const { scan, verdictChanges } = normalizeStoredScan(v1);
  assert.equal(scan.verdict, "ZOMBIE_FROM_2024", "should preserve unknown value");
  assert.equal(verdictChanges.length, 1);
  assert.equal(verdictChanges[0].path, "verdict");
  assert.equal(verdictChanges[0].normalized, null, "telemetry sees the miss");
});

test("normalizeStoredScan verdictChanges trace records every verdict-bearing field", () => {
  const v1 = {
    verdict: "STRONG_BUY",
    buyOrPass: { verdict: "OVERPRICED" },
    notification: { verdict: "GREAT_FLIP" },
  };
  const { verdictChanges } = normalizeStoredScan(v1);
  assert.equal(verdictChanges.length, 3);
  const byPath = Object.fromEntries(verdictChanges.map(c => [c.path, c]));
  assert.equal(byPath["verdict"].normalized,             "BUY");
  assert.equal(byPath["buyOrPass.verdict"].normalized,    "PASS");
  assert.equal(byPath["notification.verdict"].normalized, "BUY");
});

// ── Field preservation ───────────────────────────────────────────────

test("normalizeStoredScan does not mutate the input scan", () => {
  const v1 = { verdict: "STRONG_BUY", buyOrPass: { verdict: "GOOD_DEAL" } };
  normalizeStoredScan(v1);
  assert.equal(v1.verdict, "STRONG_BUY", "input unmutated");
  assert.equal(v1.buyOrPass.verdict, "GOOD_DEAL", "nested input unmutated");
  assert.equal(v1._schemaVersion, undefined);
});

test("normalizeStoredScan preserves arbitrary top-level fields", () => {
  const v1 = {
    verdict: "STRONG_BUY",
    items: [1, 2, 3],
    intelligence: { foo: "bar" },
    legacy: { previous: "value" },
  };
  const { scan } = normalizeStoredScan(v1);
  assert.deepEqual(scan.items, [1, 2, 3]);
  assert.equal(scan.intelligence.foo, "bar");
  assert.deepEqual(scan.legacy, { previous: "value" });
});

// ── migrateScanIfNeeded sugar ───────────────────────────────────────

test("migrateScanIfNeeded returns changed:true when migration ran", () => {
  const out = migrateScanIfNeeded({ verdict: "STRONG_BUY" });
  assert.equal(out.changed, true);
  assert.equal(out.scan?.verdict, "BUY");
});

test("migrateScanIfNeeded returns changed:false on a v3 scan", () => {
  const v3 = { _schemaVersion: 3, verdict: "BUY", _backup: {} };
  const out = migrateScanIfNeeded(v3);
  assert.equal(out.changed, false);
  assert.equal(out.scan, v3);
});

test("migrateScanIfNeeded does not double-migrate on repeated calls", () => {
  const v1 = { verdict: "STRONG_BUY" };
  const first = migrateScanIfNeeded(v1);
  assert.equal(first.changed, true);
  // Apply again to the migrated output — must be a no-op.
  const second = migrateScanIfNeeded(first.scan);
  assert.equal(second.changed, false);
  assert.equal(second.scan, first.scan, "second call returns same object");
});
