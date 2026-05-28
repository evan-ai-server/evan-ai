/**
 * SubscriptionModal — Evan AI Singularity Paywall
 *
 * Physics-based bottom-sheet. Spring entrance with bounce. Rubber-band
 * resistance when dragging up past rest position. Fast weighted exit.
 *
 * Hunter ($7.77/mo) → Pro ($22.22/mo). Identity-first progression.
 * Feature matrix with staggered 20ms checkmark animation.
 * Breathing sparkle icon with purple glow.
 * Sliding toggle pill — magnetic feel via spring interpolation.
 *
 * Usage:
 *   <SubscriptionModal
 *     visible={showPaywall}
 *     onClose={() => setShowPaywall(false)}
 *     onPurchased={(isPro) => setIsPro(isPro)}
 *   />
 */

import React, { useEffect, useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  Dimensions,
  Platform,
} from "react-native";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  withRepeat,
  interpolate,
  Extrapolation,
  runOnJS,
  cancelAnimation,
  Easing,
} from "react-native-reanimated";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { C, SP, R, TY, MO, SH, IOS, fmtMoney } from "../design/DS";
import { purchaseMonthly, purchaseYearly } from "../../src/purchases";
import { EventTracker } from "../../services/revenue/EventTracker";

// ─── Screen + layout ──────────────────────────────────────────────────────────
const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get("window");
const SHEET_MAX_H = SCREEN_H * 0.88;  // never taller than 88vh
const SNAP_THRESHOLD = 80;            // px of downward drag to dismiss
const RUBBER_BAND_FACTOR = 0.12;      // overdrag resistance (lower = stiffer)

// ─── Plan definitions (2-tier: Hunter → Pro) ─────────────────────────────────
type Plan = "go" | "plus";

const PLANS = {
  go: {
    id: "go" as Plan,
    label: "Hunter",
    price: 7.77,
    priceLabel: "$7.77",
    per: "/mo",
    tagline: "For active thrifters and sourcing runs",
    badge: null,
  },
  plus: {
    id: "plus" as Plan,
    label: "Pro",
    price: 22.22,
    priceLabel: "$22.22",
    per: "/mo",
    tagline: "For serious resellers who need the edge",
    badge: "MOST POWERFUL",
  },
} as const;

// ─── Feature matrix (2-tier) ──────────────────────────────────────────────────
interface Feature {
  label: string;
  go: string | false;
  plus: string;
}

const FEATURES: Feature[] = [
  { label: "Sourcing Pace",        go: "Active thrifting",           plus: "\u2713  Unlimited sourcing"    },
  { label: "Market Intelligence",  go: "\u2713  Verified comps",     plus: "\u2713  Priority retrieval"    },
  { label: "HOT DEAL Alerts",      go: "\u2713  Instant",            plus: "\u2713  Pre-market drops"      },
  { label: "Comp Pool Depth",      go: "\u2713  Expanded",           plus: "\u2713  Maximum coverage"      },
  { label: "Price Trend Signals",  go: "\u2713  Rising / Falling",   plus: "\u2713  Real-time velocity"    },
  { label: "Rarity Detection",     go: false,                        plus: "\u2713  Advanced signals"      },
  { label: "Profit Tracking",      go: false,                        plus: "\u2713  Full resale history"   },
];

// ─── Color tokens ─────────────────────────────────────────────────────────────
const SUB = {
  sheet:       "#111111",
  sheetBorder: "rgba(255,255,255,0.08)",
  pill:        "rgba(255,255,255,0.10)",
  pillActive:  "rgba(255,255,255,0.16)",
  pillBorder:  "rgba(255,255,255,0.07)",
  goPurple:    "rgba(147,51,234,0.22)",    // purple glow for sparkle
  goPurpleMid: "rgba(147,51,234,0.12)",
  checkGo:     "rgba(255,255,255,0.88)",
  checkPlus:   "#A78BFA",                  // violet for Plus checks
  dash:        "rgba(255,255,255,0.20)",
  footer:      "#8e8e93",
  ctaBg:       "#FFFFFF",
  ctaText:     "#000000",
  separator:   "rgba(255,255,255,0.06)",
} as const;

// ─── Sparkle icon with breathing purple glow ──────────────────────────────────
function SparkleIcon() {
  const glowScale   = useSharedValue(1);
  const glowOpacity = useSharedValue(0.55);
  const iconScale   = useSharedValue(1);

  useEffect(() => {
    // Slow breathing: 3.2s cycle
    glowScale.value = withRepeat(
      withSequence(
        withTiming(1.25, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.00, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false
    );
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.85, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.40, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false
    );
    // Subtle icon pulse
    iconScale.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.00, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false
    );
  }, []);

  const glowStyle  = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
    opacity: glowOpacity.value,
  }));
  const iconStyle  = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  return (
    <View style={styles.sparkleWrap}>
      {/* Outer glow halo */}
      <Reanimated.View style={[styles.sparkleGlowOuter, glowStyle]} />
      {/* Mid glow */}
      <Reanimated.View style={[styles.sparkleGlowMid, glowStyle]} />
      {/* Icon */}
      <Reanimated.View style={[styles.sparkleIconWrap, iconStyle]}>
        <Ionicons name="sparkles" size={24} color="#A78BFA" />
      </Reanimated.View>
    </View>
  );
}

// ─── Sliding plan toggle (2-tier) ─────────────────────────────────────────────
const TOGGLE_W    = 260;
const TOGGLE_H    = 36;
const TOGGLE_PAD  = 3;
const PILL_W      = (TOGGLE_W - TOGGLE_PAD * 2) / 2;

const PLAN_ORDER: Plan[] = ["go", "plus"];

interface PlanToggleProps {
  selected: Plan;
  onSelect: (p: Plan) => void;
}

function PlanToggle({ selected, onSelect }: PlanToggleProps) {
  const idx = PLAN_ORDER.indexOf(selected);
  const pillX = useSharedValue(idx * PILL_W);

  const handlePress = useCallback((plan: Plan) => {
    const target = PLAN_ORDER.indexOf(plan) * PILL_W;
    pillX.value = withSpring(target, {
      damping: 18,
      stiffness: 320,
      mass: 0.7,
      overshootClamping: false,
    });
    Haptics.selectionAsync();
    onSelect(plan);
  }, [onSelect]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
  }));

  return (
    <View style={styles.toggleTrack}>
      <Reanimated.View style={[styles.togglePill, pillStyle]} />

      {/* Hunter */}
      <Pressable
        style={styles.toggleOption}
        onPress={() => handlePress("go")}
        hitSlop={6}
      >
        <Text style={[styles.toggleLabel, selected === "go" && styles.toggleLabelActive]}>
          Hunter
        </Text>
        <Text style={[styles.togglePrice, selected === "go" && styles.togglePriceActive]}>
          $7.77
        </Text>
      </Pressable>

      {/* Pro */}
      <Pressable
        style={styles.toggleOption}
        onPress={() => handlePress("plus")}
        hitSlop={6}
      >
        <Text style={[styles.toggleLabel, selected === "plus" && styles.toggleLabelActive]}>
          Pro
        </Text>
        <Text style={[styles.togglePrice, selected === "plus" && styles.togglePriceActive]}>
          $22.22
        </Text>
      </Pressable>
    </View>
  );
}

// ─── Feature row with staggered checkmark animation ───────────────────────────
interface FeatureRowProps {
  feature: Feature;
  plan: Plan;
  index: number;
  animTrigger: number;  // increment to re-trigger animation
}

function FeatureRow({ feature, plan, index, animTrigger }: FeatureRowProps) {
  const checkScale = useSharedValue(0);
  const checkOp    = useSharedValue(0);
  const rowOp      = useSharedValue(0);

  useEffect(() => {
    rowOp.value = 0;
    checkScale.value = 0;
    checkOp.value = 0;

    // Row fades in staggered
    rowOp.value = withDelay(
      index * 28,
      withTiming(1, { duration: 200 })
    );

    // Check animates in with spring, 20ms stagger between items
    checkScale.value = withDelay(
      index * 20,
      withSpring(1, { damping: 14, stiffness: 300, mass: 0.7 })
    );
    checkOp.value = withDelay(
      index * 20,
      withTiming(1, { duration: 120 })
    );
  }, [animTrigger]);

  const rowStyle   = useAnimatedStyle(() => ({ opacity: rowOp.value }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: checkOp.value,
    transform: [{ scale: checkScale.value }],
  }));

  const planValue  = plan === "go" ? feature.go : feature.plus;
  const hasFeature = planValue !== false;
  const checkColor = plan === "plus" ? SUB.checkPlus : SUB.checkGo;

  return (
    <Reanimated.View style={[styles.featureRow, rowStyle]}>
      <Text style={styles.featureLabel}>{feature.label}</Text>
      <Reanimated.View style={[styles.featureCheck, checkStyle]}>
        {hasFeature ? (
          <Text style={[styles.featureValue, { color: checkColor }]}>
            {typeof planValue === "string" ? planValue : "✓"}
          </Text>
        ) : (
          <Text style={styles.featureDash}>—</Text>
        )}
      </Reanimated.View>
    </Reanimated.View>
  );
}

// ─── CTA Button with press-scale ─────────────────────────────────────────────
interface CTAButtonProps {
  plan: Plan;
  loading: boolean;
  onPress: () => void;
}

function CTAButton({ plan, loading, onPress }: CTAButtonProps) {
  const btnScale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    btnScale.value = withSpring(1.018, { damping: 16, stiffness: 400, mass: 0.6 });
  }, []);

  const handlePressOut = useCallback(() => {
    btnScale.value = withSpring(1.0, { damping: 20, stiffness: 350 });
  }, []);

  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
    // Hardware acceleration hint
    ...(Platform.OS === "ios" ? {} : {}),
  }));

  const label = plan === "go"
    ? "Start Hunting \u2014 $7.77/month"
    : "Get the Edge \u2014 $22.22/month";

  return (
    <Reanimated.View style={[styles.ctaWrap, btnStyle]}>
      <Pressable
        style={styles.ctaBtn}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={loading}
        android_ripple={{ color: "rgba(0,0,0,0.08)" }}
      >
        {loading ? (
          <Text style={styles.ctaText}>Processing…</Text>
        ) : (
          <Text style={styles.ctaText}>{label}</Text>
        )}
      </Pressable>
    </Reanimated.View>
  );
}

// ─── Aspiration context ──────────────────────────────────────────────────────
export interface AspirationContext {
  /** "You just found a $42 flip in under 2s." */
  winFrame: string | null;
  /** "Today's hidden opportunities: ~$87–$214" */
  gapFrame: string | null;
  /** "Free users missed an estimated $64 in profit today." */
  lossFrame: string | null;
  /** Profit from the scan that triggered this */
  lastProfit: number;
  /** HOT / VIRAL / HIGH_PROFIT / NONE */
  triggerType: string;
}

// ─── SubscriptionModal ────────────────────────────────────────────────────────
export interface SubscriptionModalProps {
  visible: boolean;
  onClose: () => void;
  onPurchased?: (isPro: boolean) => void;
  initialPlan?: Plan;
  /** Aspiration context from the scan that triggered the paywall */
  aspiration?: AspirationContext | null;
}

export function SubscriptionModal({
  visible,
  onClose,
  onPurchased,
  initialPlan = "plus",
  aspiration,
}: SubscriptionModalProps) {
  const insets     = useSafeAreaInsets();
  const [plan, setPlan]       = useState<Plan>(initialPlan);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [animKey, setAnimKey] = useState(0); // triggers checkmark re-animation
  const [ctaRevealed, setCtaRevealed] = useState(false);

  // ── Aspiration state ────────────────────────────────────────────────────
  const isAspiration = !!aspiration && aspiration.triggerType !== "NONE";
  const profitCounterValue = useSharedValue(0);
  const ctaRevealOpacity = useSharedValue(0);

  // Delayed CTA reveal: 800ms delay while profit number rolls up
  useEffect(() => {
    if (visible && isAspiration) {
      setCtaRevealed(false);
      ctaRevealOpacity.value = 0;
      // Roll up the profit counter
      profitCounterValue.value = 0;
      profitCounterValue.value = withTiming(aspiration.lastProfit, {
        duration: 700,
        easing: Easing.out(Easing.cubic),
      });
      // Reveal CTA after 800ms
      const timer = setTimeout(() => {
        ctaRevealOpacity.value = withTiming(1, { duration: 300 });
        setCtaRevealed(true);
      }, 800);
      return () => clearTimeout(timer);
    } else if (visible) {
      setCtaRevealed(true);
      ctaRevealOpacity.value = 1;
    }
  }, [visible, isAspiration]);

  const ctaAnimStyle = useAnimatedStyle(() => ({
    opacity: ctaRevealOpacity.value,
  }));

  // ── Sheet physics ────────────────────────────────────────────────────────
  const translateY = useSharedValue(SHEET_MAX_H);
  const backdropOp = useSharedValue(0);

  // Mount: spring up
  useEffect(() => {
    if (visible) {
      // Revenue: track paywall view
      try { EventTracker.trackPaywallView("subscription_modal"); } catch {}
      translateY.value = SHEET_MAX_H;
      backdropOp.value = 0;
      // Spring entrance with bounce
      translateY.value = withSpring(0, {
        damping: 24,
        stiffness: 180,
        mass: 1.1,
        overshootClamping: false,
      });
      backdropOp.value = withTiming(1, { duration: 320 });
    }
  }, [visible]);

  const dismiss = useCallback(() => {
    // Fast, weighted slide down
    translateY.value = withSpring(SHEET_MAX_H + 40, {
      damping: 28,
      stiffness: 220,
      mass: 0.85,
      velocity: 12,
    });
    backdropOp.value = withTiming(0, { duration: 220 });
    setTimeout(() => runOnJS(onClose)(), 240);
  }, [onClose]);

  // ── Pan gesture (drag to dismiss + rubber-band) ──────────────────────────
  const startY = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .minDistance(8)  // ignore micro-movements so taps on close/CTA aren't swallowed
    .onStart(() => {
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      const raw = startY.value + e.translationY;
      if (raw < 0) {
        // Rubber-band: drag up past rest position — resist
        translateY.value = raw * RUBBER_BAND_FACTOR;
      } else {
        translateY.value = raw;
      }
      backdropOp.value = interpolate(
        raw,
        [0, SHEET_MAX_H * 0.6],
        [1, 0],
        Extrapolation.CLAMP
      );
    })
    .onEnd((e) => {
      if (e.translationY > SNAP_THRESHOLD || e.velocityY > 800) {
        translateY.value = withSpring(SHEET_MAX_H + 40, {
          damping: 28,
          stiffness: 220,
          velocity: e.velocityY * 0.5,
        });
        backdropOp.value = withTiming(0, { duration: 200 });
        runOnJS(onClose)();
      } else {
        translateY.value = withSpring(0, {
          damping: 26,
          stiffness: 200,
          mass: 1.0,
          velocity: e.velocityY,
        });
        backdropOp.value = withTiming(1, { duration: 200 });
      }
    });

  const sheetStyle    = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOp.value,
  }));

  // ── Gold shimmer on Hunter tier (momentum signal) ────────────────────────
  const goldGlow = useSharedValue(0);
  useEffect(() => {
    if (plan === "go") {
      goldGlow.value = withRepeat(
        withSequence(
          withTiming(0.65, { duration: 1500 }),
          withTiming(0.28, { duration: 1500 }),
        ), -1, false,
      );
    } else {
      cancelAnimation(goldGlow);
      goldGlow.value = withTiming(0, { duration: 300 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);
  const goldGlowStyle = useAnimatedStyle(() => ({
    shadowColor: "#FFD700",
    shadowOpacity: goldGlow.value,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  }));

  // ── Plan switch ──────────────────────────────────────────────────────────
  const handlePlanSelect = useCallback((p: Plan) => {
    setPlan(p);
    setError(null);
    // Re-trigger staggered checkmark animation
    setAnimKey((k) => k + 1);
  }, []);

  // ── Purchase ─────────────────────────────────────────────────────────────
  // ── Aspiration haptic: heavy burst when aspiration paywall opens ──────
  useEffect(() => {
    if (visible && isAspiration) {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
      // Second heavier burst after a beat
      const t = setTimeout(() => {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
      }, 300);
      return () => clearTimeout(t);
    }
  }, [visible, isAspiration]);

  const handlePurchase = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setLoading(true);
    setError(null);
    try {
      // Pro (plus) maps to yearly; Hunter (go) maps to monthly
      const result = plan === "plus"
        ? await purchaseYearly()
        : await purchaseMonthly();

      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        try { EventTracker.trackPurchaseComplete(plan); } catch {}
        onPurchased?.(result.isPro);
        dismiss();
      } else if (result.error !== "cancelled") {
        setError("Something went wrong. Try again.");
      }
    } catch {
      setError("Purchase failed. Try again.");
    } finally {
      setLoading(false);
    }
  }, [plan, dismiss, onPurchased]);

  if (!visible) return null;

  const planData = PLANS[plan];
  const bottomPad = Math.max(insets.bottom, 16);

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>

        {/* ── Backdrop: blur + true-black tint ── */}
        <Reanimated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <BlurView
            intensity={IOS ? 28 : 18}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
          <View style={[StyleSheet.absoluteFill, styles.backdropTint]} />
        </Reanimated.View>

        {/* ── Tap outside to dismiss ── */}
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />

        {/* ── Bottom sheet ── */}
        <GestureDetector gesture={panGesture}>
          <Reanimated.View
            style={[
              styles.sheet,
              { maxHeight: SHEET_MAX_H, paddingBottom: bottomPad },
              sheetStyle,
            ]}
          >
            {/* Drag handle */}
            <View style={styles.handle} />

            {/* Close button */}
            <Pressable
              style={styles.closeBtn}
              onPress={dismiss}
              hitSlop={14}
            >
              <View style={styles.closeIconWrap}>
                <Ionicons name="close" size={15} color="rgba(255,255,255,0.70)" />
              </View>
            </Pressable>

            {/* ── Aspiration emotional hook (when triggered by HOT/VIRAL) ── */}
            {isAspiration && aspiration ? (
              <View style={styles.aspirationHook}>
                {aspiration.triggerType === "VIRAL" ? (
                  <Text style={styles.aspirationBadge}>VIRAL FLIP DETECTED</Text>
                ) : aspiration.triggerType === "HOT_DEAL" ? (
                  <Text style={styles.aspirationBadgeHot}>HOT DEAL FOUND</Text>
                ) : (
                  <Text style={styles.aspirationBadgeProfit}>HIGH PROFIT ALERT</Text>
                )}
                <Text style={styles.aspirationWin}>{aspiration.winFrame}</Text>
                {aspiration.gapFrame ? (
                  <Text style={styles.aspirationGap}>{aspiration.gapFrame}</Text>
                ) : null}
                {aspiration.lossFrame ? (
                  <Text style={styles.aspirationLoss}>{aspiration.lossFrame}</Text>
                ) : null}
              </View>
            ) : (
              <>
                {/* Sparkle icon */}
                <SparkleIcon />

                {/* Headlines */}
                <Text style={styles.headline}>Evan AI Singularity</Text>
                <Text style={styles.subHeadline}>
                  The Invisible Army. Working 24 hours.{"\n"}For you.
                </Text>
              </>
            )}

            {/* Plan toggle */}
            <PlanToggle selected={plan} onSelect={handlePlanSelect} />

            {/* Price display — gold glow when Hunter is selected.
                Hardware-rasterized + allowFontScaling={false} to pin to sub-pixel grid during glow. */}
            <Reanimated.View
              style={[styles.priceRow, goldGlowStyle as any]}
              renderToHardwareTextureAndroid={Platform.OS === "android"}
              shouldRasterizeIOS={Platform.OS !== "android"}
              needsOffscreenAlphaCompositing={Platform.OS === "android"}
            >
              <Text style={styles.priceLarge} allowFontScaling={false} numberOfLines={1}>
                {planData.priceLabel}
              </Text>
              <Text style={styles.pricePer} allowFontScaling={false} numberOfLines={1}>
                {planData.per}
              </Text>
            </Reanimated.View>

            {/* Separator */}
            <View style={styles.separator} />

            {/* Feature matrix */}
            <View style={styles.featureMatrix}>
              {FEATURES.map((f, i) => (
                <FeatureRow
                  key={f.label}
                  feature={f}
                  plan={plan}
                  index={i}
                  animTrigger={animKey}
                />
              ))}
            </View>

            {/* Separator */}
            <View style={styles.separator} />

            {/* Error */}
            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : null}

            {/* CTA — delayed 800ms on aspiration trigger while profit rolls up */}
            <Reanimated.View style={ctaAnimStyle}>
              <CTAButton
                plan={plan}
                loading={loading}
                onPress={handlePurchase}
              />
            </Reanimated.View>

            {/* Footer */}
            <Text style={styles.footer}>
              Auto-renews monthly. Cancel anytime.
            </Text>

            {/* Overscroll guard — extends #111111 below the screen so spring
                physics never reveals the backdrop underneath the sheet */}
            <View style={styles.overscrollGuard} pointerEvents="none" />

          </Reanimated.View>
        </GestureDetector>

      </GestureHandlerRootView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({

  // Backdrop
  backdropTint: {
    backgroundColor: "rgba(0,0,0,0.55)",
  },

  // Sheet
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#111111",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 0.5,
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    paddingTop: SP.sm,
    paddingHorizontal: SP.xl,
    // Hardware acceleration
    ...(Platform.OS === "ios" ? {} : { elevation: 24 }),
    ...SH.cardActive,
  },

  // Handle
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignSelf: "center",
    marginBottom: SP.lg,
  },

  // Close — zIndex 20 keeps it above animated sheet content and the overscroll guard
  closeBtn: {
    position: "absolute",
    top: 20,
    right: SP.lg,
    zIndex: 20,
  },
  closeIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Sparkle
  sparkleWrap: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SP.lg,
    position: "relative",
  },
  sparkleGlowOuter: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: SUB.goPurple,
    // Shadow glow
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: IOS ? 0.5 : 0,
    shadowRadius: 20,
  },
  sparkleGlowMid: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: SUB.goPurpleMid,
  },
  sparkleIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(124,58,237,0.18)",
    borderWidth: 0.5,
    borderColor: "rgba(167,139,250,0.30)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Headlines
  headline: {
    fontSize: 24,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.4,
    textAlign: "center",
    marginBottom: 6,
  },
  subHeadline: {
    fontSize: 14,
    color: "rgba(255,255,255,0.52)",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: SP.xl,
    fontWeight: "500",
  },

  // Toggle
  toggleTrack: {
    width: TOGGLE_W,
    height: TOGGLE_H,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: R.xl,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.10)",
    flexDirection: "row",
    alignItems: "center",
    padding: TOGGLE_PAD,
    marginBottom: SP.lg,
    position: "relative",
  },
  togglePill: {
    position: "absolute",
    left: TOGGLE_PAD,
    width: PILL_W,
    height: TOGGLE_H - TOGGLE_PAD * 2,
    borderRadius: R.xl - TOGGLE_PAD,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.22)",
    // Inner top highlight
    shadowColor: "#fff",
    shadowOffset: { width: 0, height: 0.5 },
    shadowOpacity: IOS ? 0.18 : 0,
    shadowRadius: 1,
  },
  toggleOption: {
    width: PILL_W,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
    gap: 1,
  },
  toggleLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255,255,255,0.45)",
    letterSpacing: 0.2,
  },
  toggleLabelActive: {
    color: "rgba(255,255,255,0.92)",
  },
  togglePrice: {
    fontSize: 9,
    fontWeight: "600",
    color: "rgba(255,255,255,0.28)",
    letterSpacing: 0.1,
  },
  togglePriceActive: {
    color: "rgba(255,255,255,0.55)",
  },

  // Price display
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
    marginBottom: SP.lg,
  },
  priceLarge: {
    fontSize: 40,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -1,
    lineHeight: 44,
  },
  pricePer: {
    fontSize: 16,
    fontWeight: "600",
    color: "rgba(255,255,255,0.45)",
    letterSpacing: 0.1,
    lineHeight: 20,
  },

  // Separator
  separator: {
    width: "100%",
    height: 0.5,
    backgroundColor: SUB.separator,
    marginVertical: SP.md,
  },

  // Feature matrix
  featureMatrix: {
    width: "100%",
    gap: 0,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  featureLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255,255,255,0.72)",
    flex: 1,
  },
  featureCheck: {
    flex: 1.4,
    alignItems: "flex-end",
  },
  featureValue: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  featureDash: {
    fontSize: 14,
    color: "rgba(255,255,255,0.22)",
    fontWeight: "400",
  },

  // Error
  errorText: {
    fontSize: 12,
    color: "rgba(255,100,80,0.90)",
    textAlign: "center",
    marginBottom: SP.sm,
  },

  // CTA
  ctaWrap: {
    width: "100%",
    marginTop: SP.sm,
    marginBottom: SP.sm,
  },
  ctaBtn: {
    backgroundColor: SUB.ctaBg,
    borderRadius: R.xl,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    // Inner top highlight — depth illusion
    borderTopWidth: 0,
    // Hardware acceleration
    shadowColor: "#fff",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: IOS ? 0.10 : 0,
    shadowRadius: 2,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: "800",
    color: SUB.ctaText,
    letterSpacing: -0.1,
  },

  // Footer
  footer: {
    fontSize: 12,
    color: SUB.footer,
    textAlign: "center",
    lineHeight: 17,
    marginBottom: SP.sm,
  },

  // Overscroll guard: solid #111111 slab that hangs 300px below the sheet bottom.
  // When spring physics briefly overshoots (sheet moves up), this covers any gap
  // that would otherwise reveal the backdrop beneath the sheet.
  overscrollGuard: {
    position: "absolute",
    bottom: -300,
    left: -2,   // cover the 0.5px border on each side
    right: -2,
    height: 302,
    backgroundColor: "#111111",
  },

  // ── Aspiration emotional hook ──────────────────────────────────────────
  aspirationHook: {
    alignItems: "center",
    paddingHorizontal: SP.lg,
    marginBottom: SP.lg,
    gap: 8,
  },
  aspirationBadge: {
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.2,
    color: "rgba(255,120,0,1)",
    backgroundColor: "rgba(255,80,0,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,120,0,0.35)",
    borderRadius: R.pill,
    paddingVertical: 6,
    paddingHorizontal: 16,
    overflow: "hidden",
    textAlign: "center",
  },
  aspirationBadgeHot: {
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.2,
    color: "rgba(255,210,80,1)",
    backgroundColor: "rgba(255,185,0,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,200,0,0.30)",
    borderRadius: R.pill,
    paddingVertical: 6,
    paddingHorizontal: 16,
    overflow: "hidden",
    textAlign: "center",
  },
  aspirationBadgeProfit: {
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.2,
    color: "rgba(180,255,200,0.92)",
    backgroundColor: "rgba(0,210,120,0.10)",
    borderWidth: 1,
    borderColor: "rgba(0,210,120,0.22)",
    borderRadius: R.pill,
    paddingVertical: 6,
    paddingHorizontal: 16,
    overflow: "hidden",
    textAlign: "center",
  },
  aspirationWin: {
    fontSize: 20,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.3,
    textAlign: "center",
    lineHeight: 26,
  },
  aspirationGap: {
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(255,210,80,0.88)",
    textAlign: "center",
    lineHeight: 20,
  },
  aspirationLoss: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.52)",
    textAlign: "center",
    lineHeight: 19,
  },
});
