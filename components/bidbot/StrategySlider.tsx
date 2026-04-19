/**
 * StrategySlider — Three-mode Orchestrator control panel.
 *
 * SNIPER (conservative) → STANDARD (balanced) → AGGRESSOR (growth)
 *
 * Visual: a risk curve drawn in Skia that morphs as the user selects a mode.
 * Curve shifts from low-flat (Sniper) to tall-steep (Aggressor).
 * Background heat gradient shifts from mint → amber → crimson.
 */

import React, { useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  interpolateColor,
  Easing,
} from "react-native-reanimated";
import { Canvas, Path, Skia, LinearGradient, vec } from "@shopify/react-native-skia";
import * as Haptics from "expo-haptics";
import { C, SP, R, TY, MO } from "../design/DS";
import {
  CC, MONO,
  type StrategyMode, type StrategyConfig, STRATEGY_PRESETS,
} from "./CommandCenterTokens";

// ─── Risk Curve (Skia) ────────────────────────────────────────────────────────
const CURVE_W = 280;
const CURVE_H = 72;

/**
 * Generates a bezier risk curve path for each mode.
 * Sniper: flat, low peak. Standard: balanced bell. Aggressor: steep, wide.
 */
function buildCurvePath(mode: StrategyMode): ReturnType<typeof Skia.Path.Make> {
  const path = Skia.Path.Make();
  path.moveTo(0, CURVE_H);

  switch (mode) {
    case "sniper":
      // Low flat bell — selective, few peaks
      path.cubicTo(
        CURVE_W * 0.2, CURVE_H,
        CURVE_W * 0.3, CURVE_H * 0.35,
        CURVE_W * 0.45, CURVE_H * 0.35
      );
      path.cubicTo(
        CURVE_W * 0.60, CURVE_H * 0.35,
        CURVE_W * 0.70, CURVE_H,
        CURVE_W, CURVE_H
      );
      break;

    case "standard":
      // Medium bell — balanced exposure
      path.cubicTo(
        CURVE_W * 0.15, CURVE_H,
        CURVE_W * 0.25, CURVE_H * 0.18,
        CURVE_W * 0.45, CURVE_H * 0.18
      );
      path.cubicTo(
        CURVE_W * 0.65, CURVE_H * 0.18,
        CURVE_W * 0.78, CURVE_H,
        CURVE_W, CURVE_H
      );
      break;

    case "aggressor":
      // Steep, wide — maximum exposure
      path.cubicTo(
        CURVE_W * 0.08, CURVE_H,
        CURVE_W * 0.15, CURVE_H * 0.05,
        CURVE_W * 0.45, CURVE_H * 0.05
      );
      path.cubicTo(
        CURVE_W * 0.78, CURVE_H * 0.05,
        CURVE_W * 0.88, CURVE_H,
        CURVE_W, CURVE_H
      );
      break;
  }

  path.lineTo(CURVE_W, CURVE_H);
  path.close();
  return path;
}

const CURVE_PATHS: Record<StrategyMode, ReturnType<typeof Skia.Path.Make>> = {
  sniper:    buildCurvePath("sniper"),
  standard:  buildCurvePath("standard"),
  aggressor: buildCurvePath("aggressor"),
};

const CURVE_STROKE: Record<StrategyMode, string> = {
  sniper:    CC.mint,
  standard:  CC.amber,
  aggressor: CC.crimson,
};

// ─── Mode tab button ──────────────────────────────────────────────────────────
interface ModeTabProps {
  mode: StrategyMode;
  active: boolean;
  onPress: (m: StrategyMode) => void;
}

function ModeTab({ mode, active, onPress }: ModeTabProps) {
  const LABELS: Record<StrategyMode, string> = {
    sniper:    "SNIPER",
    standard:  "STANDARD",
    aggressor: "AGGRESSOR",
  };
  const COLORS: Record<StrategyMode, string> = {
    sniper:    CC.mint,
    standard:  CC.amber,
    aggressor: CC.crimson,
  };

  const color = COLORS[mode];
  const scale = useSharedValue(1);
  const tabStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = useCallback(() => {
    scale.value = withSpring(0.93, MO.spring.snappy, () => {
      scale.value = withSpring(1, MO.spring.bouncy);
    });
    Haptics.selectionAsync();
    onPress(mode);
  }, [mode, onPress]);

  return (
    <Reanimated.View style={tabStyle}>
      <TouchableOpacity
        style={[
          styles.modeTab,
          active && { backgroundColor: color + "18", borderColor: color + "44" },
        ]}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <Text style={[styles.modeTabText, { color: active ? color : C.text4 }]}>
          {LABELS[mode]}
        </Text>
      </TouchableOpacity>
    </Reanimated.View>
  );
}

// ─── Config stat row ──────────────────────────────────────────────────────────
function ConfigRow({ label, value, color = C.text2 }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.cfgRow}>
      <Text style={styles.cfgLabel}>{label}</Text>
      <Text style={[styles.cfgValue, { color }]}>{value}</Text>
    </View>
  );
}

// ─── StrategySlider ───────────────────────────────────────────────────────────
interface StrategySliderProps {
  value: StrategyMode;
  onChange: (mode: StrategyMode, config: StrategyConfig) => void;
  style?: object;
}

export function StrategySlider({ value, onChange, style }: StrategySliderProps) {
  const curveProgress = useSharedValue(value === "sniper" ? 0 : value === "standard" ? 0.5 : 1);
  const glowOpacity   = useSharedValue(1);

  const config = STRATEGY_PRESETS[value];
  const strokeColor = CURVE_STROKE[value];
  const curvePath   = CURVE_PATHS[value];

  const MODES: StrategyMode[] = ["sniper", "standard", "aggressor"];

  const handleSelect = useCallback((mode: StrategyMode) => {
    // Glow pulse on switch
    glowOpacity.value = withTiming(0.3, { duration: 100 }, () => {
      glowOpacity.value = withTiming(1, { duration: 300 });
    });
    curveProgress.value = withTiming(
      mode === "sniper" ? 0 : mode === "standard" ? 0.5 : 1,
      { duration: 380, easing: Easing.out(Easing.cubic) }
    );
    onChange(mode, STRATEGY_PRESETS[mode]);
  }, [onChange]);

  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));

  // Mode descriptions
  const DESCRIPTIONS: Record<StrategyMode, string> = {
    sniper:    "High-confidence only. Deep discounts. Minimal capital exposure. Waits for the perfect shot.",
    standard:  "Balanced Singularity logic. Optimized for sustained profit across market conditions.",
    aggressor: "Maximum volume. Captures market share. Bids on thinner margins at full capital deployment.",
  };

  return (
    <View style={[styles.container, style]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>ORCHESTRATOR</Text>
        <Text style={styles.subtitle}>STRATEGY MODE</Text>
      </View>

      {/* Risk curve visualization */}
      <Reanimated.View style={[styles.curveContainer, glowStyle]}>
        <View style={styles.curveLabels}>
          <Text style={styles.curveAxisLabel}>EXPOSURE</Text>
        </View>
        <Canvas style={{ width: CURVE_W, height: CURVE_H }}>
          {/* Fill */}
          <Path path={curvePath} style="fill" color={strokeColor + "14"} />
          {/* Stroke */}
          <Path path={curvePath} style="stroke" strokeWidth={1.5} color={strokeColor + "90"} />
        </Canvas>
        <View style={styles.curveAxisX}>
          <Text style={styles.curveAxisLabel}>CONSERVATIVE</Text>
          <Text style={styles.curveAxisLabel}>AGGRESSIVE</Text>
        </View>
      </Reanimated.View>

      {/* Mode tabs */}
      <View style={styles.tabs}>
        {MODES.map((m) => (
          <ModeTab key={m} mode={m} active={value === m} onPress={handleSelect} />
        ))}
      </View>

      {/* Mode description */}
      <View style={[styles.descBox, { borderColor: strokeColor + "25" }]}>
        <Text style={[styles.descMode, { color: strokeColor }]}>{value.toUpperCase()}</Text>
        <Text style={styles.descText}>{DESCRIPTIONS[value]}</Text>
      </View>

      {/* Config stats */}
      <View style={styles.cfgGrid}>
        <ConfigRow label="MIN STR"        value={`${Math.round(config.minSTR * 100)}%`}
          color={strokeColor} />
        <ConfigRow label="MIN P(ACCEPT)"  value={`${Math.round(config.minAcceptanceProb * 100)}%`}
          color={strokeColor} />
        <ConfigRow label="ROI FLOOR"      value={`${Math.round(config.targetROIFloor * 100)}%`}
          color={strokeColor} />
        <ConfigRow label="MAX EXPOSURE"   value={`$${config.maxCapitalExposure}`}
          color={strokeColor} />
        <ConfigRow label="MAX DAILY BIDS" value={`${config.maxDailyBids}`}
          color={strokeColor} />
        <ConfigRow label="AGGRESSIVENESS" value={`${config.aggressiveness}/10`}
          color={strokeColor} />
      </View>
    </View>
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
    gap: 0,
  },

  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: SP.lg,
    paddingTop: SP.md,
    paddingBottom: SP.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  title: {
    ...MONO,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2.5,
    color: C.text2,
  },
  subtitle: {
    ...MONO,
    fontSize: 8,
    letterSpacing: 1.5,
    color: C.text4,
  },

  // Curve
  curveContainer: {
    paddingHorizontal: SP.xl,
    paddingVertical: SP.md,
    alignItems: "center",
  },
  curveLabels: {
    width: CURVE_W,
    flexDirection: "row",
    justifyContent: "flex-start",
    marginBottom: 4,
  },
  curveAxisX: {
    width: CURVE_W,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  curveAxisLabel: {
    ...MONO,
    fontSize: 7,
    letterSpacing: 0.8,
    color: C.text4,
  },

  // Tabs
  tabs: {
    flexDirection: "row",
    gap: SP.sm,
    paddingHorizontal: SP.lg,
    paddingBottom: SP.md,
  },
  modeTab: {
    flex: 1,
    paddingVertical: SP.sm,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
  },
  modeTabText: {
    ...MONO,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  // Description
  descBox: {
    marginHorizontal: SP.lg,
    marginBottom: SP.md,
    padding: SP.md,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: R.md,
    borderWidth: 1,
    gap: 4,
  },
  descMode: {
    ...MONO,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  descText: {
    fontSize: 12,
    color: C.text3,
    lineHeight: 17,
  },

  // Config grid
  cfgGrid: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  cfgRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SP.lg,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.03)",
  },
  cfgLabel: {
    ...MONO,
    fontSize: 9,
    letterSpacing: 0.8,
    color: C.text4,
  },
  cfgValue: {
    ...MONO,
    fontSize: 11,
    fontWeight: "900",
  },
});
