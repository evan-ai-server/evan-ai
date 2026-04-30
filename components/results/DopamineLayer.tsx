/**
 * Evan AI — Dopamine Layer (Hot Deal UI Triggers)
 *
 * Listens for hot_deal.isTriggered and fires tier-appropriate
 * animations + haptics. Does NOT block scan pipeline or cause layout shift.
 *
 * VIRAL → full-screen radial glow + heavy haptic + "VIRAL FLIP" badge
 * HOT   → gold badge pulse + medium haptic + "HIGH DEMAND" tag
 * WARM  → subtle highlight only (no interruption)
 * COLD  → nothing
 *
 * Render acknowledgment:
 *   After mounting and initiating animations, this component calls
 *   brain.markDopamineRendered(scanId) — the orchestrator waits for this
 *   signal before advancing to deep_analysis. This eliminates timing
 *   assumptions and makes phase transitions deterministic.
 */

import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  withDelay,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import type { HotDeal, HotDealTier } from "../../services/dealEngine";
import { useEvanBrain, selectScanId } from "../../hooks/useEvanBrain";

const { width: W, height: H } = Dimensions.get("window");

interface DopamineLayerProps {
  hotDeal: HotDeal | null;
  /** Suppress trigger when user is actively scrolling */
  isScrolling?: boolean;
}

// ── Haptic sequences ──────────────────────────────────────────────────────────

function hapticViral() {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setTimeout(() => {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    }, 150);
  } catch {}
}

function hapticHot() {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {}
}

// ── Render acknowledgment helper ──────────────────────────────────────────────

function acknowledgeDopamineRender() {
  const brain = useEvanBrain.getState();
  if (brain.scanId && brain.phase === "dopamine_phase") {
    brain.markDopamineRendered(brain.scanId);
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DopamineLayer({ hotDeal, isScrolling }: DopamineLayerProps) {
  const glowOpacity = useSharedValue(0);
  const badgeScale = useSharedValue(0);
  const badgeOpacity = useSharedValue(0);
  const hintOpacity = useSharedValue(0);

  // Subscribe to scanId — guaranteed unique per scan. This breaks the
  // React 18 batching deadlock: when handleScan calls scanStarted() and
  // fastVerdictReady() in the same synchronous block, React batches the
  // intermediate null hotSignal away. If consecutive scans produce the
  // same score/tier/isTriggered, the old deps wouldn't change and the
  // effect would never fire. scanId always changes, so the effect always
  // re-fires for new scans.
  const scanId = useEvanBrain(selectScanId);

  // Track which scanId we last acknowledged to prevent duplicate
  // acknowledgments within the same scan (e.g. if isScrolling toggles).
  const lastAcknowledgedScanRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hotDeal || !scanId) return;

    // Already acknowledged this scan — skip duplicate effect runs
    if (lastAcknowledgedScanRef.current === scanId) return;

    // Collect all setTimeout handles for cleanup on unmount / re-run.
    // Without this, unmounting during the timeout window writes to
    // freed Reanimated shared values — undefined behavior on native thread.
    const timers: ReturnType<typeof setTimeout>[] = [];

    // ── Near-miss hint (always shows if applicable, no interruption) ─────
    if (hotDeal.hooks.near_miss && hotDeal.hooks.near_miss_hint) {
      hintOpacity.value = withDelay(800, withTiming(1, { duration: 400 }));
      // Auto-dismiss after 4s
      timers.push(setTimeout(() => {
        hintOpacity.value = withTiming(0, { duration: 300 });
      }, 5200));
    } else {
      hintOpacity.value = 0;
    }

    // ── Interruption guard: skip if scrolling or not triggered ───────────
    if (!hotDeal.isTriggered || isScrolling) {
      glowOpacity.value = 0;
      badgeScale.value = 0;
      badgeOpacity.value = 0;
      if (!isScrolling) {
        // Not scrolling, just not triggered (COLD/WARM) — acknowledge so
        // orchestrator can advance. If scrolling, defer acknowledgment
        // until scroll ends and effect re-fires.
        lastAcknowledgedScanRef.current = scanId;
        acknowledgeDopamineRender();
      }
      return () => timers.forEach(clearTimeout);
    }

    if (hotDeal.tier === "VIRAL") {
      // Full-screen radial glow + high-frequency haptic
      glowOpacity.value = withSequence(
        withTiming(0.65, { duration: 200, easing: Easing.out(Easing.exp) }),
        withTiming(0.35, { duration: 300 }),
        withTiming(0.5, { duration: 200 }),
        withDelay(1200, withTiming(0, { duration: 600 }))
      );

      // Badge: scale spring 0 → 1.08 → 1.0
      badgeOpacity.value = withTiming(1, { duration: 150 });
      badgeScale.value = withSequence(
        withSpring(1.08, { damping: 12, stiffness: 400, mass: 0.8 }),
        withSpring(1.0, { damping: 20, stiffness: 200, mass: 1.0 })
      );

      // Haptic burst
      runOnJS(hapticViral)();

      // Auto-dismiss badge after 3.5s
      timers.push(setTimeout(() => {
        badgeOpacity.value = withTiming(0, { duration: 400 });
        badgeScale.value = withTiming(0.9, { duration: 400 });
      }, 3500));
    } else if (hotDeal.tier === "HOT") {
      // Gold badge pulse (no full-screen glow)
      badgeOpacity.value = withTiming(1, { duration: 200 });
      badgeScale.value = withSequence(
        withSpring(1.04, { damping: 16, stiffness: 300, mass: 0.9 }),
        withSpring(1.0, { damping: 22, stiffness: 220, mass: 1.0 })
      );

      runOnJS(hapticHot)();

      // Auto-dismiss after 3s
      timers.push(setTimeout(() => {
        badgeOpacity.value = withTiming(0, { duration: 350 });
        badgeScale.value = withTiming(0.9, { duration: 350 });
      }, 3000));
    }

    // ── Render acknowledgment ─────────────────────────────────────────────
    // Signal to the orchestrator that dopamine UI has rendered and
    // animations have been initiated. This is the truth-based trigger
    // for advancing to deep_analysis — no timing assumptions.
    lastAcknowledgedScanRef.current = scanId;
    acknowledgeDopamineRender();

    return () => timers.forEach(clearTimeout);
  }, [scanId, hotDeal?.score, hotDeal?.tier, hotDeal?.isTriggered, isScrolling]);

  // ── Animated styles ───────────────────────────────────────────────────────

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const badgeStyle = useAnimatedStyle(() => ({
    opacity: badgeOpacity.value,
    transform: [{ scale: badgeScale.value }],
  }));

  const hintStyle = useAnimatedStyle(() => ({
    opacity: hintOpacity.value,
  }));

  if (!hotDeal) return null;

  const isViral = hotDeal.tier === "VIRAL";
  const isHot = hotDeal.tier === "HOT";

  return (
    <>
      {/* ── VIRAL: Full-screen radial glow overlay ─────────────────────── */}
      {isViral && (
        <Reanimated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, S.glowOverlay, glowStyle]}
        />
      )}

      {/* ── VIRAL / HOT: Floating badge ────────────────────────────────── */}
      {(isViral || isHot) && (
        <Reanimated.View
          pointerEvents="none"
          style={[S.badgeWrap, badgeStyle]}
        >
          <View style={[S.badge, isViral ? S.badgeViral : S.badgeHot]}>
            <Text style={[S.badgeText, isViral ? S.badgeTextViral : S.badgeTextHot]}>
              {isViral ? "\uD83D\uDD25 VIRAL FLIP" : "HIGH DEMAND"}
            </Text>
            {hotDeal.hooks.loss_framing && (
              <Text style={S.lossFraming}>{hotDeal.hooks.loss_framing}</Text>
            )}
          </View>
        </Reanimated.View>
      )}

      {/* ── Near-miss hint (any tier) ──────────────────────────────────── */}
      {hotDeal.hooks.near_miss && hotDeal.hooks.near_miss_hint && (
        <Reanimated.View pointerEvents="none" style={[S.hintWrap, hintStyle]}>
          <View style={S.hintBadge}>
            <Text style={S.hintText}>{hotDeal.hooks.near_miss_hint}</Text>
          </View>
        </Reanimated.View>
      )}
    </>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  // Full-screen radial glow (VIRAL only)
  glowOverlay: {
    backgroundColor: "transparent",
    // Radial gradient approximation via border + shadow
    borderWidth: 0,
    shadowColor: "#FF6B00",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 120,
    // Fallback solid for Android
    ...(require("react-native").Platform.OS === "android"
      ? { backgroundColor: "rgba(255,107,0,0.12)" }
      : {}),
  },

  // Badge container — positioned at top-center, below safe area
  badgeWrap: {
    position: "absolute",
    top: 100,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 9999,
  },

  badge: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: "center",
    maxWidth: W - 48,
  },

  badgeViral: {
    backgroundColor: "rgba(255,80,0,0.18)",
    borderColor: "rgba(255,120,0,0.50)",
    shadowColor: "#FF6B00",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
  },

  badgeHot: {
    backgroundColor: "rgba(255,185,0,0.14)",
    borderColor: "rgba(255,200,0,0.40)",
    shadowColor: "#FFB900",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
  },

  badgeText: {
    fontWeight: "900",
    fontSize: 16,
    letterSpacing: 0.5,
  },

  badgeTextViral: {
    color: "rgba(255,180,100,1)",
  },

  badgeTextHot: {
    color: "rgba(255,210,80,1)",
  },

  lossFraming: {
    marginTop: 6,
    color: "rgba(255,255,255,0.78)",
    fontWeight: "700",
    fontSize: 13,
  },

  // Near-miss hint — bottom-positioned, subtle
  hintWrap: {
    position: "absolute",
    bottom: 140,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 9998,
  },

  hintBadge: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },

  hintText: {
    color: "rgba(255,255,255,0.72)",
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 0.2,
  },
});
