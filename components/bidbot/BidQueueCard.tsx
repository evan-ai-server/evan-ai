/**
 * BidQueueCard — Core bid opportunity card for the Command Center.
 *
 * Two modes:
 *   auto    → circular countdown ring around fire button; auto-fires on expiry
 *   confirm → static "SEND OFFER" button; user must tap
 *
 * Layout priority: math over image.
 *   - ROI % and Evan AI Score are the visual center of gravity
 *   - Price delta is always visible (Asking → Bid)
 *   - Projected profit in mint pill
 *   - STR + acceptance probability in data row
 */

import React, { useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Platform,
} from "react-native";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { Canvas, Path, Skia, usePathValue } from "@shopify/react-native-skia";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { C, SP, R, TY, SH, fmtMoney, IOS } from "../design/DS";
import { CC, MONO, type BidOpportunityCard } from "./CommandCenterTokens";

// ─── Countdown Ring (Skia) ────────────────────────────────────────────────────
const RING_SIZE = 80;
const RING_CENTER = RING_SIZE / 2;
const RING_R = 32;
const RING_STROKE = 3.5;
const CIRCUMFERENCE = 2 * Math.PI * RING_R;

interface CountdownRingProps {
  secs: number;
  total: number;
  onComplete: () => void;
}

function CountdownRing({ secs, total, onComplete }: CountdownRingProps) {
  const progress    = useSharedValue(1.0); // 1 = full ring, 0 = empty
  const pulsOpacity = useSharedValue(1.0);
  const [display, setDisplay] = React.useState(secs);

  useEffect(() => {
    // Linear countdown
    progress.value = withTiming(0, { duration: secs * 1000, easing: Easing.linear });

    // Subtle pulse accelerates near end
    pulsOpacity.value = withRepeat(
      withSequence(
        withTiming(0.55, { duration: 500 }),
        withTiming(1.00, { duration: 500 }),
      ),
      -1,
      false
    );

    // Integer display
    let remaining = secs;
    const interval = setInterval(() => {
      remaining = Math.max(0, remaining - 1);
      setDisplay(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);

    const timer = setTimeout(() => {
      runOnJS(onComplete)();
    }, secs * 1000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [secs]);

  // Animated Skia arc — redraws on each frame via usePathValue
  const trackPath = Skia.Path.Make();
  trackPath.addCircle(RING_CENTER, RING_CENTER, RING_R);

  // Build arc path from progress shared value
  const arcPath = usePathValue((path) => {
    "worklet";
    path.rewind();
    // Arc: startAngle -90° (top), sweep = progress * 360°
    const sweep = progress.value * 360;
    path.addArc(
      { x: RING_CENTER - RING_R, y: RING_CENTER - RING_R, width: RING_R * 2, height: RING_R * 2 },
      -90,
      sweep
    );
  });

  const ringStyle = useAnimatedStyle(() => ({ opacity: pulsOpacity.value }));
  const isUrgent  = display <= 3;

  return (
    <Reanimated.View style={[styles.ringWrap, ringStyle]}>
      <Canvas style={{ width: RING_SIZE, height: RING_SIZE }}>
        {/* Track (dim full circle) */}
        <Path
          path={trackPath}
          style="stroke"
          strokeWidth={RING_STROKE}
          color="rgba(0,255,65,0.10)"
        />
        {/* Progress arc */}
        <Path
          path={arcPath}
          style="stroke"
          strokeWidth={RING_STROKE}
          strokeCap="round"
          color={isUrgent ? CC.crimson : CC.mint}
        />
      </Canvas>
      {/* Countdown overlay */}
      <View style={[StyleSheet.absoluteFill, styles.ringCenter]}>
        <Text style={[styles.ringCountdown, isUrgent && { color: CC.crimson }]}>
          {display}
        </Text>
        <Text style={styles.ringLabel}>sec</Text>
      </View>
    </Reanimated.View>
  );
}

// ─── Platform badge ───────────────────────────────────────────────────────────
function PlatformBadge({ platform }: { platform: "ebay" | "poshmark" }) {
  return (
    <View style={[styles.badge, platform === "ebay" ? styles.badgeEbay : styles.badgePosh]}>
      <Text style={styles.badgeText}>{platform.toUpperCase()}</Text>
    </View>
  );
}

// ─── Score pill ───────────────────────────────────────────────────────────────
function ScorePill({ score }: { score: number }) {
  const color = score >= 7.5 ? CC.mint : score >= 5 ? CC.amber : CC.crimson;
  const bg    = score >= 7.5 ? CC.mintBg : score >= 5 ? CC.amberBg : CC.crimsonBg;
  return (
    <View style={[styles.scoreWrap, { backgroundColor: bg, borderColor: color + "44" }]}>
      <Text style={[styles.scoreNum, { color }]}>{score.toFixed(1)}</Text>
      <Text style={styles.scoreLabel}>/10</Text>
    </View>
  );
}

// ─── BidQueueCard ─────────────────────────────────────────────────────────────
export interface BidQueueCardProps {
  item: BidOpportunityCard;
  mode: "auto" | "confirm";
  countdownSecs?: number;
  onBid: () => void;
  onAbort: () => void;
  onDismiss: () => void;
  style?: object;
}

export function BidQueueCard({
  item,
  mode,
  countdownSecs = 8,
  onBid,
  onAbort,
  onDismiss,
  style,
}: BidQueueCardProps) {
  const entranceY = useSharedValue(24);
  const entranceOp = useSharedValue(0);

  useEffect(() => {
    entranceOp.value = withTiming(1, { duration: 280 });
    entranceY.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.quad) });
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: entranceOp.value,
    transform: [{ translateY: entranceY.value }],
  }));

  const handleBid = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onBid();
  }, [onBid]);

  const handleAbort = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAbort();
  }, [onAbort]);

  const roiPct = Math.round(item.projectedROI * 100);
  const roiColor = roiPct >= 20 ? CC.mint : roiPct >= 10 ? CC.amber : CC.crimson;

  // Priority bar width (capped at 100)
  const priorityPct = Math.min(item.priorityScore, 100);

  return (
    <Reanimated.View style={[styles.card, SH.cardActive, cardStyle, style]}>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <PlatformBadge platform={item.platform} />
        <View style={styles.priorityRow}>
          <Text style={styles.priorityLabel}>PRIORITY</Text>
          <View style={styles.priorityTrack}>
            <View style={[styles.priorityFill, { width: `${priorityPct}%` as any, backgroundColor: roiColor }]} />
          </View>
          <Text style={[styles.priorityNum, { color: roiColor }]}>{item.priorityScore}</Text>
        </View>
        <TouchableOpacity onPress={onDismiss} style={styles.dismissBtn} hitSlop={12}>
          <Ionicons name="close" size={16} color={C.text4} />
        </TouchableOpacity>
      </View>

      {/* ── Item identity ────────────────────────────────────────────────── */}
      <View style={styles.identity}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Ionicons name="cube-outline" size={18} color={C.text4} />
          </View>
        )}
        <View style={styles.identityText}>
          <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
          <Text style={styles.itemStore}>{item.store} · {item.daysListed}d listed</Text>
        </View>
      </View>

      {/* ── Core metrics ─────────────────────────────────────────────────── */}
      <View style={styles.metricsRow}>
        {/* ROI */}
        <View style={styles.metricBlock}>
          <Text style={styles.metricLabel}>REALIZED ROI</Text>
          <Text style={[styles.metricValue, { color: roiColor }]}>
            +{roiPct}%
          </Text>
        </View>

        <View style={styles.metricDivider} />

        {/* Evan Score */}
        <View style={styles.metricBlock}>
          <Text style={styles.metricLabel}>EVAN AI SCORE</Text>
          <ScorePill score={item.evanScore} />
        </View>
      </View>

      {/* ── Price delta ───────────────────────────────────────────────────── */}
      <View style={styles.priceSection}>
        <View style={styles.priceRow}>
          <View style={styles.priceBlock}>
            <Text style={styles.priceLabel}>ASKING</Text>
            <Text style={styles.priceVal}>{fmtMoney(item.askingPrice)}</Text>
          </View>
          <Ionicons name="arrow-forward" size={14} color={C.text4} style={styles.arrow} />
          <View style={styles.priceBlock}>
            <Text style={[styles.priceLabel, { color: CC.mint }]}>OUR BID</Text>
            <Text style={[styles.priceVal, { color: CC.mint }]}>{fmtMoney(item.bidPrice)}</Text>
          </View>
        </View>

        {/* Profit pill */}
        <View style={styles.profitPill}>
          <Ionicons name="trending-up" size={11} color={CC.mint} />
          <Text style={styles.profitText}>
            PROFIT  {fmtMoney(item.projectedProfit)}  after fees
          </Text>
        </View>
      </View>

      {/* ── Signal data row ──────────────────────────────────────────────── */}
      <View style={styles.signalRow}>
        <SignalChip label="STR 30d" value={`${Math.round(item.str30d * 100)}%`}
          color={item.str30d >= 0.45 ? CC.mint : item.str30d >= 0.25 ? CC.amber : CC.crimson} />
        <SignalChip label="P(accept)" value={`${item.acceptancePct}%`}
          color={item.acceptancePct >= 45 ? CC.mint : item.acceptancePct >= 22 ? CC.amber : CC.crimson} />
        <SignalChip label="MARGIN" value={fmtMoney(item.projectedProfit)}
          color={CC.mint} />
      </View>

      {/* ── Action zone ──────────────────────────────────────────────────── */}
      <View style={styles.actionZone}>
        {/* Abort always visible */}
        <TouchableOpacity style={styles.abortBtn} onPress={handleAbort} activeOpacity={0.7}>
          <Text style={styles.abortText}>ABORT</Text>
        </TouchableOpacity>

        {mode === "auto" ? (
          /* Auto mode: countdown ring + auto-fire */
          <View style={styles.autoFireWrap}>
            <CountdownRing
              secs={countdownSecs}
              total={countdownSecs}
              onComplete={handleBid}
            />
            <Text style={styles.autoLabel}>AUTO-FIRE</Text>
          </View>
        ) : (
          /* Confirm mode: explicit tap */
          <TouchableOpacity style={styles.fireBtn} onPress={handleBid} activeOpacity={0.75}>
            <Text style={styles.fireText}>SEND OFFER</Text>
            <Ionicons name="flash" size={13} color="#000" />
          </TouchableOpacity>
        )}
      </View>
    </Reanimated.View>
  );
}

// ─── Signal chip ──────────────────────────────────────────────────────────────
function SignalChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={[styles.chipValue, { color }]}>{value}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    backgroundColor: CC.hudBg,
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: CC.hudBorder,
    overflow: "hidden",
    gap: 0,
  },

  // Top bar
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SP.lg,
    paddingTop: SP.md,
    paddingBottom: SP.sm,
    gap: SP.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: R.xs,
    borderWidth: 1,
  },
  badgeEbay: {
    backgroundColor: "rgba(86,104,255,0.12)",
    borderColor: "rgba(86,104,255,0.25)",
  },
  badgePosh: {
    backgroundColor: "rgba(255,59,85,0.10)",
    borderColor: "rgba(255,59,85,0.22)",
  },
  badgeText: {
    ...MONO,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.2,
    color: C.text3,
  },
  priorityRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  priorityLabel: {
    ...MONO,
    fontSize: 8,
    letterSpacing: 1,
    color: C.text4,
  },
  priorityTrack: {
    flex: 1,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 1,
    overflow: "hidden",
  },
  priorityFill: {
    height: 2,
    borderRadius: 1,
  },
  priorityNum: {
    ...MONO,
    fontSize: 9,
    fontWeight: "900",
    minWidth: 22,
    textAlign: "right",
  },
  dismissBtn: {
    padding: 4,
  },

  // Identity
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.md,
    padding: SP.lg,
    paddingBottom: SP.sm,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: R.sm,
    backgroundColor: C.s1,
  },
  thumbPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  identityText: { flex: 1 },
  itemName: {
    ...TY.h3,
    color: C.text,
    lineHeight: 19,
  },
  itemStore: {
    ...MONO,
    fontSize: 9,
    color: C.text4,
    marginTop: 3,
    letterSpacing: 0.3,
  },

  // Metrics
  metricsRow: {
    flexDirection: "row",
    marginHorizontal: SP.lg,
    marginVertical: SP.sm,
    backgroundColor: "rgba(0,255,65,0.04)",
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: CC.mintBorder,
    overflow: "hidden",
  },
  metricBlock: {
    flex: 1,
    alignItems: "center",
    paddingVertical: SP.md,
    gap: 6,
  },
  metricLabel: {
    ...MONO,
    fontSize: 8,
    letterSpacing: 1.5,
    color: C.text4,
  },
  metricValue: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  metricDivider: {
    width: 1,
    backgroundColor: CC.mintBorder,
    marginVertical: SP.sm,
  },
  scoreWrap: {
    flexDirection: "row",
    alignItems: "baseline",
    paddingHorizontal: SP.md,
    paddingVertical: 6,
    borderRadius: R.sm,
    borderWidth: 1,
    gap: 2,
  },
  scoreNum: {
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  scoreLabel: {
    ...MONO,
    fontSize: 10,
    color: C.text4,
  },

  // Price
  priceSection: {
    paddingHorizontal: SP.lg,
    paddingBottom: SP.sm,
    gap: 8,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  priceBlock: { flex: 1 },
  priceLabel: {
    ...MONO,
    fontSize: 8,
    letterSpacing: 1.2,
    color: C.text4,
    marginBottom: 3,
  },
  priceVal: {
    fontSize: 22,
    fontWeight: "900",
    color: C.text2,
    letterSpacing: -0.3,
  },
  arrow: {
    marginHorizontal: SP.sm,
  },
  profitPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: CC.mintBg,
    borderWidth: 1,
    borderColor: CC.mintBorder,
    borderRadius: R.pill,
    paddingHorizontal: SP.md,
    paddingVertical: 5,
  },
  profitText: {
    ...MONO,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
    color: CC.mint,
  },

  // Signal chips
  signalRow: {
    flexDirection: "row",
    gap: SP.sm,
    paddingHorizontal: SP.lg,
    paddingBottom: SP.md,
  },
  chip: {
    flex: 1,
    backgroundColor: C.s1,
    borderRadius: R.sm,
    padding: SP.sm,
    alignItems: "center",
    gap: 3,
  },
  chipLabel: {
    ...MONO,
    fontSize: 7,
    letterSpacing: 0.8,
    color: C.text4,
  },
  chipValue: {
    ...MONO,
    fontSize: 11,
    fontWeight: "900",
  },

  // Action zone
  actionZone: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.md,
    padding: SP.lg,
    paddingTop: SP.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  abortBtn: {
    paddingHorizontal: SP.xl,
    paddingVertical: SP.md,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: CC.crimsonBorder,
    backgroundColor: CC.crimsonBg,
  },
  abortText: {
    ...MONO,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
    color: CC.crimson,
  },

  // Auto-fire ring
  autoFireWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  ringWrap: {
    position: "relative",
    width: RING_SIZE,
    height: RING_SIZE,
  },
  ringCenter: {
    alignItems: "center",
    justifyContent: "center",
  },
  ringCountdown: {
    fontSize: 24,
    fontWeight: "900",
    color: CC.mint,
    letterSpacing: -0.5,
  },
  ringLabel: {
    ...MONO,
    fontSize: 7,
    color: CC.mintDim,
    letterSpacing: 1,
  },
  autoLabel: {
    ...MONO,
    fontSize: 7,
    letterSpacing: 2,
    color: C.text4,
    marginTop: 4,
  },

  // Confirm button
  fireBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: CC.mint,
    borderRadius: R.md,
    paddingVertical: SP.md,
    // Top highlight glow
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.55)",
  },
  fireText: {
    ...MONO,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
    color: "#000000",
  },
});
