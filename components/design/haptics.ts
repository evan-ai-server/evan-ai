/**
 * Centralized haptic helper. All haptic feedback in the app should route
 * through `triggerHaptic(type)` so we get:
 *   1. Consistent intensity per event class (no two callers firing the
 *      same intent at different impact levels)
 *   2. Built-in cooldown — a 110ms global debounce blocks accidental
 *      double-firings during animation rerenders or rapid taps
 *   3. One audit point — if the device shouldn't buzz for an action,
 *      check this file, not 60 individual call sites
 *
 * Philosophy: haptic feedback is a finite premium resource. Apple uses
 * it for confirmation of *meaningful* state change. Pulsing on every
 * button press, every modal, every tab switch, every carousel snap is
 * arcade noise — it teaches the user to tune the device out.
 *
 * KEEP haptics on:
 *   - capture          → scan photo taken
 *   - scan-complete    → results landed (subtle)
 *   - verdict-strong   → BUY / GREAT FLIP / LOWEST (satisfying)
 *   - verdict-weak     → PASS / HOLD (restrained; light tap only)
 *   - save             → watchlist toggle, bought confirmation
 *   - lowball-sent     → outbound action succeeded
 *   - paywall-success  → premium unlock
 *   - error            → invalid action / failure
 *
 * SKIP everything else: button taps, modal open/close, scroll, carousel
 * snap, chat send, tab switches, secondary actions.
 */
import * as Haptics from "expo-haptics";

export type HapticType =
  | "capture"
  | "scan-complete"
  | "verdict-strong"
  | "verdict-weak"
  | "save"
  | "lowball-sent"
  | "paywall-success"
  | "error";

// 110ms cooldown between fires. Two haptics within this window collapse
// to one. Picked at the upper edge of what reads as "intentional single
// pulse" — long enough to block accidental double-triggers during state
// transitions, short enough that legitimate back-to-back events still
// fire (scan-complete → verdict-strong on a fast result, for example).
const COOLDOWN_MS = 110;
let lastFiredAt = 0;

/**
 * Fire one haptic pulse for the given semantic event. Returns synchronously;
 * the haptic itself runs asynchronously inside expo-haptics. Cooldown is
 * shared across ALL types so a button-press and a verdict-reveal that fire
 * within 110ms of each other will only produce one buzz (the first).
 */
export function triggerHaptic(type: HapticType): void {
  const now = Date.now();
  if (now - lastFiredAt < COOLDOWN_MS) return;
  lastFiredAt = now;

  try {
    switch (type) {
      case "capture":
        // Camera shutter — medium impact, the tactile "snap" you expect
        // from a physical button on a real camera.
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        return;
      case "scan-complete":
        // Results landed. Light tap — confirms arrival without
        // celebrating the verdict yet (that's verdict-strong's job).
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      case "verdict-strong":
        // BUY / GREAT FLIP / LOWEST. Notification-success is the
        // strongest premium pulse iOS exposes and reads as "yes,
        // this is a real opportunity."
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      case "verdict-weak":
        // PASS / HOLD. Soft impact only — never celebrate a non-win.
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      case "save":
        // Watchlist toggle, bought confirmation — confirms persistence.
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        return;
      case "lowball-sent":
        // Outbound action succeeded. Same satisfaction tier as save.
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        return;
      case "paywall-success":
        // Premium unlock. Heavier than save — this is a money moment.
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      case "error":
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
    }
  } catch {
    // Haptics fails silently on unsupported devices (Android emulators,
    // certain low-tier hardware). Never let a missing taptic engine
    // crash a button handler.
  }
}
