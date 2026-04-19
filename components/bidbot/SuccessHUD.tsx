/**
 * SuccessHUD — Portfolio heads-up display.
 *
 * Shows: Total exposure, open positions, capital reserved, winning streak.
 * Lives at the top of the Command Center screen, always visible.
 *
 * Winning streak: last 5 bids shown as colored chips (green=accepted, red=rejected).
 */

import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  Easing,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { C, SP, R, TY, fmtMoney } from "../design/DS";
import { CC, MONO } from "./CommandCenterTokens";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface HUDData {
  totalExposure: number;     // USD currently in open bids
  openPositions: number;     // number of active pending offers
  capitalReserved: number;   // USD in accepted but unsold inventory
  dailyProfit: number;       // net realized profit today
  streak: Array<"win" | "loss" | "pending">;  // last 5 outcomes
  totalBidsToday: number;
  acceptedToday: number;
}

// ─── Streak dot ───────────────────────────────────────────────────────────────
function StreakDot({ outcome }: { outcome: "win" | "loss" | "pending" }) {
  const pulseOp = useSharedValue(1);

  useEffect(() => {
    if (outcome === "pending") {
      pulseOp.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 500 }),
          withTiming(1.0, { duration: 500 }),
        ),
        -1,
        false
      );
    }
  }, [outcome]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: pulseOp.value }));

  const bg =
    outcome === "win"     ? CC.mint :
    outcome === "loss"    ? CC.crimson :
    CC.amber;

  return (
    <Reanimated.View style={[styles.streakDot, { backgroundColor: bg }, dotStyle]} />
  );
}

// ─── Metric block ─────────────────────────────────────────────────────────────
function MetricBlock({
  label,
  value,
  sub,
  color = C.text,
  glow = false,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  glow?: boolean;
}) {
  return (
    <View style={styles.metricBlock}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      {sub ? <Text style={styles.metricSub}>{sub}</Text> : null}
    </View>
  );
}

// ─── SuccessHUD ───────────────────────────────────────────────────────────────
interface SuccessHUDProps {
  data: HUDData;
}

export function SuccessHUD({ data }: SuccessHUDProps) {
  const {
    totalExposure,
    openPositions,
    capitalReserved,
    dailyProfit,
    streak,
    totalBidsToday,
    acceptedToday,
  } = data;

  const acceptRate = totalBidsToday > 0
    ? Math.round((acceptedToday / totalBidsToday) * 100)
    : 0;

  const profitColor = dailyProfit >= 0 ? CC.mint : CC.crimson;
  const profitPrefix = dailyProfit >= 0 ? "+" : "";

  // Entrance animation
  const entranceOp = useSharedValue(0);
  const entranceY  = useSharedValue(-8);
  useEffect(() => {
    entranceOp.value = withTiming(1, { duration: 320 });
    entranceY.value  = withTiming(0, { duration: 360, easing: Easing.out(Easing.quad) });
  }, []);
  const hudStyle = useAnimatedStyle(() => ({
    opacity: entranceOp.value,
    transform: [{ translateY: entranceY.value }],
  }));

  return (
    <Reanimated.View style={[styles.container, hudStyle]}>
      {/* Top row: primary metrics */}
      <View style={styles.primaryRow}>
        <MetricBlock
          label="TOTAL EXPOSURE"
          value={fmtMoney(totalExposure)}
          sub={`${openPositions} open bids`}
          color={totalExposure > 800 ? CC.amber : C.text}
        />

        <View style={styles.divider} />

        <MetricBlock
          label="IN THE VAULT"
          value={String(openPositions)}
          sub="active positions"
          color={CC.mint}
        />

        <View style={styles.divider} />

        <MetricBlock
          label="TODAY P/L"
          value={`${profitPrefix}${fmtMoney(dailyProfit)}`}
          sub={`${acceptRate}% accept rate`}
          color={profitColor}
        />
      </View>

      {/* Divider */}
      <View style={styles.rowDivider} />

      {/* Bottom row: streak + capital */}
      <View style={styles.secondaryRow}>

        {/* Winning streak */}
        <View style={styles.streakSection}>
          <Text style={styles.streakLabel}>LAST {streak.length} BIDS</Text>
          <View style={styles.streakDots}>
            {streak.map((outcome, i) => (
              <StreakDot key={i} outcome={outcome} />
            ))}
            {/* Empty slots if streak < 5 */}
            {Array.from({ length: Math.max(0, 5 - streak.length) }).map((_, i) => (
              <View key={`empty-${i}`} style={[styles.streakDot, styles.streakEmpty]} />
            ))}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Capital reserved (bought, not sold) */}
        <View style={styles.capitalSection}>
          <Text style={styles.streakLabel}>CAPITAL RESERVED</Text>
          <Text style={[styles.capitalValue, capitalReserved > 500 ? { color: CC.amber } : {}]}>
            {fmtMoney(capitalReserved)}
          </Text>
        </View>

        <View style={styles.divider} />

        {/* Bids today */}
        <View style={styles.bidsSection}>
          <Text style={styles.streakLabel}>BIDS TODAY</Text>
          <Text style={styles.bidsValue}>
            <Text style={{ color: CC.mint }}>{acceptedToday}</Text>
            <Text style={{ color: C.text4 }}> / {totalBidsToday}</Text>
          </Text>
        </View>
      </View>
    </Reanimated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    backgroundColor: CC.hudBg,
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: CC.hudBorder,
    overflow: "hidden",
  },

  // Rows
  primaryRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  secondaryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SP.sm,
  },
  rowDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
  },

  // Metric block
  metricBlock: {
    flex: 1,
    alignItems: "center",
    paddingVertical: SP.md,
    gap: 3,
  },
  metricLabel: {
    ...MONO,
    fontSize: 7,
    letterSpacing: 1.2,
    color: C.text4,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.3,
    color: C.text,
  },
  metricSub: {
    ...MONO,
    fontSize: 8,
    color: C.text4,
    letterSpacing: 0.3,
  },

  // Dividers
  divider: {
    width: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    marginVertical: SP.xs,
  },

  // Streak
  streakSection: {
    flex: 1,
    alignItems: "center",
    paddingVertical: SP.sm,
    gap: 6,
  },
  streakLabel: {
    ...MONO,
    fontSize: 7,
    letterSpacing: 1,
    color: C.text4,
  },
  streakDots: {
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
  },
  streakDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  streakEmpty: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },

  // Capital
  capitalSection: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  capitalValue: {
    fontSize: 16,
    fontWeight: "900",
    color: C.text2,
    letterSpacing: -0.2,
  },

  // Bids today
  bidsSection: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  bidsValue: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
});
