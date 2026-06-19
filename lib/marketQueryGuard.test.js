import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isMarketSearchableQuery, MARKET_QUERY_PLACEHOLDERS } from "./marketQueryGuard.js";

// ── core predicate ───────────────────────────────────────────────────────────

test("placeholder 'item for sale' is NOT searchable (the live bug)", () => {
  assert.equal(isMarketSearchableQuery("item for sale"), false);
  assert.equal(isMarketSearchableQuery("Item For Sale"), false);
  assert.equal(isMarketSearchableQuery("  item for sale  "), false);
});

test("empty / null / non-string is NOT searchable", () => {
  assert.equal(isMarketSearchableQuery(""), false);
  assert.equal(isMarketSearchableQuery("   "), false);
  assert.equal(isMarketSearchableQuery(null), false);
  assert.equal(isMarketSearchableQuery(undefined), false);
  assert.equal(isMarketSearchableQuery(123), false);
});

test("a real vision identity IS searchable (good path preserved)", () => {
  assert.equal(isMarketSearchableQuery("hawaiian airlines boeing 787 diecast model airplane"), true);
  assert.equal(isMarketSearchableQuery("Nike ZoomX Vaporfly Next% 2"), true);
});

test("Tier-1 typed hint and Tier-2 mode seeds stay searchable (search-first kept)", () => {
  assert.equal(isMarketSearchableQuery("vintage omega seamaster"), true); // typed hint
  assert.equal(isMarketSearchableQuery("replacement part"), true);        // Tier-2 mode
  assert.equal(isMarketSearchableQuery("product label item"), true);      // Tier-2 mode
  assert.equal(isMarketSearchableQuery("prop item"), true);               // Tier-2 mode
});

// ── drift guard: the inline copy in app/index.tsx must match this module ──────

test("app/index.tsx inline placeholder set matches the canonical module", () => {
  const appPath = resolve(new URL(import.meta.url).pathname, "../../app/index.tsx");
  const src = readFileSync(appPath, "utf8");

  // The app must define an inline isMarketSearchableQuery (no cross-file import
  // — index.tsx is a single mega-file).
  assert.ok(
    src.includes("isMarketSearchableQuery"),
    "app/index.tsx must define/use an inline isMarketSearchableQuery guard"
  );

  // Every canonical placeholder must appear in the app source so the inline
  // denylist can't silently drift from this tested module.
  for (const ph of MARKET_QUERY_PLACEHOLDERS) {
    assert.ok(
      src.includes(`"${ph}"`),
      `app/index.tsx inline placeholder set is missing "${ph}" (drift from lib/marketQueryGuard.js)`
    );
  }
});

// ── regression: the Tier-3 fallback must no longer emit a market placeholder ──

test("buildDeterministicFallbackQuery Tier-3 no longer returns 'item for sale'", () => {
  const appPath = resolve(new URL(import.meta.url).pathname, "../../app/index.tsx");
  const src = readFileSync(appPath, "utf8");

  const fnStart = src.indexOf("const buildDeterministicFallbackQuery");
  assert.ok(fnStart !== -1, "buildDeterministicFallbackQuery must exist");
  const fnBlock = src.slice(fnStart, fnStart + 900);
  // Tier-3 must not hand a placeholder query to market; it returns null so the
  // caller hard-fails to the identity/rescan UI.
  assert.ok(
    !fnBlock.includes('return "item for sale"'),
    "Tier-3 must not return the 'item for sale' market placeholder anymore"
  );
});
