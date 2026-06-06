// shared/verdictPresentation.test.js
// Phase 4 frontend-presentation tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  verdictHaptics,
  verdictSound,
  verdictLighting,
  verdictColorHex,
  verdictPresentation,
} from "./verdictPresentation.js";
import { VerdictLeakError } from "./verdictContract.js";

test("verdictHaptics maps each canonical Verdict to a haptic token", () => {
  assert.equal(verdictHaptics("BUY"),  "success");
  assert.equal(verdictHaptics("HOLD"), "warning");
  assert.equal(verdictHaptics("PASS"), "error");
});

test("verdictSound maps each canonical Verdict to a sound asset key", () => {
  assert.equal(verdictSound("BUY"),  "buy_chime");
  assert.equal(verdictSound("HOLD"), "hold_neutral");
  assert.equal(verdictSound("PASS"), "pass_buzz");
});

test("verdictLighting maps each canonical Verdict to a lighting cue", () => {
  assert.equal(verdictLighting("BUY"),  "bright_green");
  assert.equal(verdictLighting("HOLD"), "soft_amber");
  assert.equal(verdictLighting("PASS"), "dim_red");
});

test("verdictColorHex returns hex strings for RN palette", () => {
  assert.equal(verdictColorHex("BUY"),  "#00C853");
  assert.equal(verdictColorHex("HOLD"), "#9E9E9E");
  assert.equal(verdictColorHex("PASS"), "#D32F2F");
});

test("verdictPresentation returns a frozen row with every dimension", () => {
  const row = verdictPresentation("BUY");
  assert.equal(row.label,    "BUY");
  assert.equal(row.color,    "green");
  assert.equal(row.colorHex, "#00C853");
  assert.equal(row.haptics,  "success");
  assert.equal(row.sound,    "buy_chime");
  assert.equal(row.lighting, "bright_green");
  assert.equal(Object.isFrozen(row), true);
});

test("display labels: HOLD reads as 'Verify First'; BUY/PASS unchanged", () => {
  // Canonical keys stay BUY/HOLD/PASS; only the user-facing label differs.
  assert.equal(verdictPresentation("HOLD").label, "Verify First");
  assert.equal(verdictPresentation("BUY").label,  "BUY");
  assert.equal(verdictPresentation("PASS").label, "PASS");
  // Relabel must not touch the sensory/colour dimensions of HOLD.
  assert.equal(verdictPresentation("HOLD").color,    "neutral");
  assert.equal(verdictPresentation("HOLD").colorHex, "#9E9E9E");
  assert.equal(verdictPresentation("HOLD").haptics,  "warning");
  assert.equal(verdictPresentation("HOLD").sound,    "hold_neutral");
  assert.equal(verdictPresentation("HOLD").lighting, "soft_amber");
});

test("every presentation function refuses legacy verdicts", () => {
  for (const fn of [verdictHaptics, verdictSound, verdictLighting, verdictColorHex, verdictPresentation]) {
    assert.throws(() => fn("STRONG_BUY"),  VerdictLeakError, `${fn.name} on STRONG_BUY`);
    assert.throws(() => fn("buy"),         VerdictLeakError, `${fn.name} on buy`);
    assert.throws(() => fn(undefined),     VerdictLeakError, `${fn.name} on undefined`);
    assert.throws(() => fn(null),          VerdictLeakError, `${fn.name} on null`);
    assert.throws(() => fn("BUY "),        VerdictLeakError, `${fn.name} on trailing space`);
  }
});

test("PRESENTATION rows are unique per verdict — no two share a haptic/sound/lighting", () => {
  const rows = ["BUY", "HOLD", "PASS"].map(verdictPresentation);
  const uniqueHaptics  = new Set(rows.map(r => r.haptics));
  const uniqueSounds   = new Set(rows.map(r => r.sound));
  const uniqueLighting = new Set(rows.map(r => r.lighting));
  assert.equal(uniqueHaptics.size,  3, "haptics must be distinct per verdict");
  assert.equal(uniqueSounds.size,   3, "sounds must be distinct per verdict");
  assert.equal(uniqueLighting.size, 3, "lighting must be distinct per verdict");
});
