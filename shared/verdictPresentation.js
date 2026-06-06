// shared/verdictPresentation.js
// =====================================================================
// PHASE 4 — Frontend presentation layer (RN-only).
//
// All emotional / sensory output for a Verdict lives here as a pure
// function of the canonical value. No regex, no substring matching,
// no scoring-based fallback. If you change a colour, you change it
// in this file — the only place it can be changed.
//
// Tokens emitted here are abstract: the call site translates to
// expo-haptics, expo-audio, RN palette, etc. This keeps the module
// portable, testable in plain Node, and free of expo dependencies.
//
// Hard rules (carried over from contract):
//   - Every function asserts canonical input via assertVerdict.
//     A legacy or malformed verdict throws — surfacing the bug at
//     the exact render path that emitted the contradiction.
//   - The PRESENTATION table is the single source of mapping.
//     Adding a sensory dimension means adding a column here, not
//     a switch statement in a UI component.
// =====================================================================

import { assertVerdict } from "./verdict.js";

/** @typedef {import("./verdictContract.js").Verdict} Verdict */

/** @typedef {"success" | "warning" | "error"} HapticToken */
/** @typedef {"buy_chime" | "hold_neutral" | "pass_buzz"} SoundToken */
/** @typedef {"bright_green" | "soft_amber" | "dim_red"} LightingToken */

/**
 * Single source of truth for every Verdict-derived sensory output.
 * Frozen at every level so a UI component cannot accidentally mutate
 * the table at render time.
 */
const PRESENTATION = Object.freeze({
  BUY: Object.freeze({
    label:    "BUY",
    color:    "green",        // abstract token — same as server
    colorHex: "#00C853",      // RN palette
    haptics:  "success",      // expo-haptics: NotificationFeedbackType.Success
    sound:    "buy_chime",    // asset key — caller resolves to file
    lighting: "bright_green", // ambient lighting cue
  }),
  HOLD: Object.freeze({
    // Canonical key stays HOLD; user-facing label reads as an action, not a
    // backend state. "HOLD" felt like a shrug in-store — "Verify First" tells
    // the user what to do on evidence-limited / pricing-signal-only scans.
    label:    "Verify First",
    color:    "neutral",
    colorHex: "#9E9E9E",
    haptics:  "warning",      // NotificationFeedbackType.Warning
    sound:    "hold_neutral",
    lighting: "soft_amber",
  }),
  PASS: Object.freeze({
    label:    "PASS",
    color:    "red",
    colorHex: "#D32F2F",
    haptics:  "error",        // NotificationFeedbackType.Error
    sound:    "pass_buzz",
    lighting: "dim_red",
  }),
});

/**
 * @param {Verdict} verdict
 * @returns {HapticToken}
 */
export function verdictHaptics(verdict) {
  return PRESENTATION[assertVerdict(verdict, "verdictHaptics")].haptics;
}

/**
 * @param {Verdict} verdict
 * @returns {SoundToken}
 */
export function verdictSound(verdict) {
  return PRESENTATION[assertVerdict(verdict, "verdictSound")].sound;
}

/**
 * @param {Verdict} verdict
 * @returns {LightingToken}
 */
export function verdictLighting(verdict) {
  return PRESENTATION[assertVerdict(verdict, "verdictLighting")].lighting;
}

/**
 * RN-palette hex colour. Distinct from server's `verdictColor` which
 * returns the abstract token ("green" | "neutral" | "red").
 *
 * @param {Verdict} verdict
 * @returns {string}
 */
export function verdictColorHex(verdict) {
  return PRESENTATION[assertVerdict(verdict, "verdictColorHex")].colorHex;
}

/**
 * Atomic render helper — returns the full presentation row for a
 * verdict in a single call. Useful when a component needs colour
 * AND haptics AND sound at once and you want to enforce the rule
 * that all three came from the same canonical source.
 *
 * @param {Verdict} verdict
 * @returns {Readonly<{
 *   label: string,
 *   color: string,
 *   colorHex: string,
 *   haptics: HapticToken,
 *   sound: SoundToken,
 *   lighting: LightingToken,
 * }>}
 */
export function verdictPresentation(verdict) {
  return PRESENTATION[assertVerdict(verdict, "verdictPresentation")];
}
