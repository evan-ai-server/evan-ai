/**
 * DealFeedCard — Single actionable alert card in the Deal Hunter feed.
 *
 * Shows:
 *   - Item name / query
 *   - What: verdict badge (GREAT FLIP / STRONG BUY / WATCH)
 *   - Why: estimated profit + ROI
 *   - How good: deal score bar
 *   - What to do: "View Deal" tracked CTA
 *   - Dismiss (×) button — marks dismissed, fades out
 *
 * No async calls, no timers.
 * Fades in with staggered delay based on index.
 */

import React, { useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  withSpring,
  Easing,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { C, SP, R, TY, fmtMoney, IOS } from "../design/DS";
import type { EnrichedDealAlert } from "../../services/revenue/RevenueTypes";
import { routeListingClick } from "../../services/revenue/TransactionRouter";
import { EventTracker } from "../../services/revenue/EventTracker";

// ─── Signal configs ───────────────────────────────────────────────────────────

const SIGNAL_STYLES: Record<string, { color: string; bg: string; border: string; icon: string }> = {
  STRONG:    { color: "rgba(100,255,180,0.95)", bg: "rgba(0,210,120,0.12)", border: "rgba(0,210,120,0.28)", icon: "flash" },
  WATCH:     { color: "rgba(255,210,80,0.92)",  bg: "rgba(255,170,0,0.09)", border: "rgba(255,170,0,0.22)",  icon: "eye-outline" },
  WEAK:      { color: "rgba(255,255,255,0.45)", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.10)", icon: "remove-outline" },
  "GREAT FLIP": { color: "rgba(100,255,180,0.95)", bg: "rgba(0,210,120,0.12)", border: "rgba(0,210,120,0.28)", icon: "trending-up" },
  "GOOD DEAL":  { color: "rgba(255,255,255,0.85)", bg: "rgba(255,255,255,0.08)", border: "rgba(255,255,255,0.16)", icon: "checkmark-circle-outline" },
};

function getSignalStyle(verdict: string) {
  return SIGNAL_STYLES[verdict.toUpperCase()] ?? SIGNAL_STYLES.WEAK;
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(1, score));
  const pct     = Math.round(clamped * 100);
  const color   =
    clamped >= 0.75 ? "rgba(100,255,180,0.85)" :
    clamped >= 0.50 ? "rgba(255,210,80,0.80)"  :
    "rgba(255,255,255,0.28)";

  return (
    <View style={scoreStyles.wrap}>
      <View style={scoreStyles.track}>
        <View style={[scoreStyles.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[scoreStyles.pct, { color }]}>{pct}</Text>
    </View>
  );
}

const scoreStyles = StyleSheet.create({
  wrap:  { flexDirection: "row", alignItems: "center", gap: 7 },
  track: { flex: 1, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  fill:  { height: "100%", borderRadius: 2 },
  pct:   { fontSize: 10, fontWeight: "800", width: 22, textAlign: "right" },
});

// ─── DealFeedCard ─────────────────────────────────────────────────────────────

interface DealFeedCardProps {
  alert: EnrichedDealAlert;
  index: number;
  userId?: string | null;
  onDismiss: (id: string) => void;
}

export function DealFeedCard({ alert, index, userId, onDismiss }: DealFeedCardProps) {
  const opacity    = useSharedValue(0);
  const translateY = useSharedValue(12);

  useEffect(() => {
    const delay = index * 80;
    opacity.value    = withDelay(delay, withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) }));
    translateY.value = withDelay(delay, withSpring(0, { damping: 22, stiffness: 200 }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const handleViewDeal = useCallback(() => {
    EventTracker.trackDealAlertClick(alert.id, alert.query, alert.bestPrice);
    routeListingClick(alert.url, {
      userId,
      itemName: alert.query,
      listingPrice: alert.bestPrice,
      source: alert.source,
      cardRole: "hero",
      intent: "buy",
    });
  }, [alert, userId]);

  const handleDismiss = useCallback(() => {
    opacity.value = withTiming(0, { duration: 200 });
    setTimeout(() => onDismiss(alert.id), 220);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert.id, onDismiss]);

  useEffect(() => {
    EventTracker.trackDealAlertView(alert.id, alert.query, alert.dealScore);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert.id]);

  const sig = getSignalStyle(alert.verdict);
  const hasProfit = alert.estimatedProfit != null && alert.estimatedProfit > 0;

  return (
    <Animated.View style={[styles.cardWrap, cardStyle]}>
      {IOS ? (
        <BlurView intensity={16} tint="dark" style={StyleSheet.absoluteFill} />
      ) : null}
      <View style={styles.card}>

        {/* ── Header row ── */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            {/* Verdict badge */}
            <View style={[styles.verdictBadge, { backgroundColor: sig.bg, borderColor: sig.border }]}>
              <Ionicons name={sig.icon as any} size={10} color={sig.color} />
              <Text style={[styles.verdictText, { color: sig.color }]}>
                {alert.verdict.toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Dismiss */}
          <TouchableOpacity
            onPress={handleDismiss}
            hitSlop={10}
            style={styles.dismissBtn}
          >
            <Ionicons name="close" size={14} color="rgba(255,255,255,0.30)" />
          </TouchableOpacity>
        </View>

        {/* ── Item name ── */}
        <Text style={styles.queryText} numberOfLines={2}>{alert.query}</Text>

        {/* ── Why it matters ── */}
        <Text style={styles.reasonText} numberOfLines={2}>{alert.reason}</Text>

        {/* ── Price + profit ── */}
        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>BEST PRICE</Text>
            <Text style={styles.metricValue}>{fmtMoney(alert.bestPrice)}</Text>
          </View>
          {hasProfit ? (
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>EST. PROFIT</Text>
              <Text style={[styles.metricValue, styles.profitValue]}>
                +{fmtMoney(alert.estimatedProfit)}
              </Text>
            </View>
          ) : null}
          {alert.estimatedRoi != null && alert.estimatedRoi > 0 ? (
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>ROI</Text>
              <Text style={[styles.metricValue, styles.profitValue]}>
                {Math.round(alert.estimatedRoi)}%
              </Text>
            </View>
          ) : null}
        </View>

        {/* ── Deal score bar ── */}
        <View style={styles.scoreRow}>
          <Text style={styles.scoreLabel}>DEAL SCORE</Text>
          <ScoreBar score={alert.dealScore} />
        </View>

        {/* ── Action row ── */}
        <View style={styles.actionRow}>
          <Text style={styles.actionHint}>{alert.action}</Text>
          <TouchableOpacity
            activeOpacity={0.78}
            onPress={handleViewDeal}
            style={styles.viewBtn}
          >
            <Text style={styles.viewBtnText}>View Deal</Text>
            <Ionicons name="arrow-forward" size={12} color="#000" />
          </TouchableOpacity>
        </View>

      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cardWrap: {
    marginBottom: 12,
    borderRadius: R.lg,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: Platform.OS === "ios" ? 0.35 : 0,
    shadowRadius: 16,
    elevation: 7,
  },
  card: {
    padding: SP.md,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderRadius: R.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.11)",
    gap: SP.sm,
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
  },
  verdictBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: R.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  verdictText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  dismissBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Content ─────────────────────────────────────────────────────────────────
  queryText: {
    ...TY.h3,
    color: C.text,
  },
  reasonText: {
    fontSize: 11,
    fontWeight: "500",
    color: C.text3,
    lineHeight: 15,
  },

  // ── Metrics ──────────────────────────────────────────────────────────────────
  metricsRow: {
    flexDirection: "row",
    gap: SP.lg,
  },
  metricItem: {
    gap: 2,
  },
  metricLabel: {
    ...TY.cap,
    color: C.text4,
    letterSpacing: 0.7,
    fontSize: 8,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: "900",
    color: C.text,
    letterSpacing: -0.3,
  },
  profitValue: {
    color: "rgba(100,255,180,0.90)",
  },

  // ── Score row ────────────────────────────────────────────────────────────────
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  scoreLabel: {
    ...TY.cap,
    color: C.text4,
    fontSize: 8,
    width: 66,
  },

  // ── Action row ────────────────────────────────────────────────────────────────
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  actionHint: {
    fontSize: 10,
    fontWeight: "600",
    color: C.text4,
    flex: 1,
    marginRight: 8,
  },
  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: R.pill,
  },
  viewBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#000",
    letterSpacing: -0.1,
  },
});
