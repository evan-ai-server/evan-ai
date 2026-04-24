/**
 * LoadingScreen — GPU-rendered cinematic loading experience via Skia.
 * All rings, arcs, glow, and orbit dots are drawn on a Skia Canvas for
 * pixel-perfect anti-aliasing with no pixelation artifacts.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated as RNAnimated,
  Easing as RNEasing,
  Pressable,
  useWindowDimensions,
  Platform,
} from "react-native";
import {
  Canvas,
  Circle,
  Path,
  Skia,
  BlurMask,
  Group,
  vec,
} from "@shopify/react-native-skia";
import {
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  useDerivedValue,
  Easing,
  interpolate,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { C, SP, R, TY, EASE_PANTHERE } from "../design/DS";
import { PressableScale } from "../primitives/PressableScale";

const IS_ANDROID = Platform.OS === "android";
const panthereRN = RNEasing.bezier(EASE_PANTHERE[0], EASE_PANTHERE[1], EASE_PANTHERE[2], EASE_PANTHERE[3]);

// ── Types ────────────────────────────────────────────────────────────────────

export type LoadingStage = "idle" | "vision" | "market" | "analysis" | "collector";

interface LoadingScreenProps {
  photoUri?: string | null;
  stage?: LoadingStage;
  stageMeta?: string;
  onCancel?: () => void;
  onRetry?: () => void;
  showRetry?: boolean;
  retryReveal?: RNAnimated.Value;
  retryScale?: RNAnimated.Value;
  loadingDots?: string;
  headline?: string;
  /** True when scan has been running >10s with no result — shows Connection Weak state */
  slowNetwork?: boolean;
  /** Called on orb press-in — used by parent to trigger haptic burst */
  onOrbPress?: () => void;
}

const STAGE_COPY: Record<LoadingStage, { primary: string; sub: string }> = {
  idle:      { primary: "Initializing",      sub: "Preparing analysis pipeline" },
  vision:    { primary: "Analyzing item",    sub: "Building visual identity" },
  market:    { primary: "Searching market",  sub: "Scanning listings in real time" },
  analysis:  { primary: "Ranking best deals", sub: "Calculating resale intelligence" },
  collector: { primary: "Detecting value",   sub: "Searching for hidden gems" },
};

const STAGE_ORDER: LoadingStage[] = ["idle", "vision", "market", "analysis", "collector"];
const PILL_STAGES: LoadingStage[] = ["vision", "market", "analysis"];

// Pre-compute static orbit dot positions (angles only, radius applied at render)
const OUTER_DOT_ANGLES = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2);
const INNER_DOT_ANGLES = Array.from({ length: 5 }, (_, i) => (i / 5) * Math.PI * 2);

// ── Component ────────────────────────────────────────────────────────────────

export function LoadingScreen({
  stage = "idle",
  stageMeta,
  onCancel,
  onRetry,
  showRetry,
  retryReveal,
  retryScale,
  loadingDots = "",
  headline,
  slowNetwork,
  onOrbPress,
}: LoadingScreenProps) {
  const { width: screenW } = useWindowDimensions();

  // Orb center within the canvas
  const CANVAS_H = 300;
  const cx = screenW / 2;
  const cy = 148;

  // ── Reanimated shared values ─────────────────────────────────────────────
  const outerRot   = useSharedValue(0);   // 0 → 2π, clockwise
  const innerRot   = useSharedValue(0);   // 2π → 0, counter-clockwise
  const corePulse  = useSharedValue(0);   // 0 ↔ 1, breathing
  const ringPulse  = useSharedValue(0);   // 0 ↔ 1, slow pulse for outer ring

  // RN Animated values (for text cross-fade and pills — these use native driver)
  const textOpacity = useRef(new RNAnimated.Value(1)).current;
  const progressAnim = useRef(new RNAnimated.Value(0)).current;
  const pillAnims = useRef(PILL_STAGES.map(() => new RNAnimated.Value(0))).current;
  const pillGlow = useRef(new RNAnimated.Value(0)).current;

  const [renderStage, setRenderStage] = useState(stage);

  // ── Start animation loops ─────────────────────────────────────────────────
  useEffect(() => {
    // Outer ring rotates clockwise: 0 → 2π in 3.4s
    outerRot.value = withRepeat(
      withTiming(Math.PI * 2, { duration: 3400, easing: Easing.linear }),
      -1, false
    );
    // Inner arc rotates counter-clockwise (negative): 0 → -2π in 5.2s
    innerRot.value = withRepeat(
      withTiming(-Math.PI * 2, { duration: 5200, easing: Easing.linear }),
      -1, false
    );
    // Core glow breathes
    corePulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
      ),
      -1, false
    );
    // Outer ring slow pulse
    ringPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
      ),
      -1, false
    );

    // Scan progress bar (RN Animated, width can't use native driver) — Panthere ease
    RNAnimated.timing(progressAnim, {
      toValue: 1,
      duration: 28000,
      easing: panthereRN,
      useNativeDriver: false,
    }).start();

    // Stage pill entrances
    PILL_STAGES.forEach((_, idx) => {
      RNAnimated.sequence([
        RNAnimated.delay(idx * 140),
        RNAnimated.spring(pillAnims[idx], {
          toValue: 1, damping: 20, stiffness: 220, mass: 0.8, useNativeDriver: true,
        }),
      ]).start();
    });

    // Pill glow loop — keep sin for continuous breathing (Panthere is for start→rest moves)
    const pillGlowLoop = RNAnimated.loop(RNAnimated.sequence([
      RNAnimated.timing(pillGlow, { toValue: 1, duration: 900, easing: RNEasing.inOut(RNEasing.sin), useNativeDriver: true }),
      RNAnimated.timing(pillGlow, { toValue: 0, duration: 900, easing: RNEasing.inOut(RNEasing.sin), useNativeDriver: true }),
    ]));
    pillGlowLoop.start();

    return () => {
      pillGlowLoop.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stage cross-fade — Panthere curve (heavy start → silk finish)
  useEffect(() => {
    RNAnimated.timing(textOpacity, {
      toValue: 0, duration: 120, easing: panthereRN, useNativeDriver: true,
    }).start(() => {
      setRenderStage(stage);
      RNAnimated.timing(textOpacity, {
        toValue: 1, duration: 260, easing: panthereRN, useNativeDriver: true,
      }).start();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // ── Skia derived values — read directly in Canvas render ─────────────────

  // Outer arc transform (rotate around orb center)
  const outerTransform = useDerivedValue(() => [{ rotate: outerRot.value }]);
  // Inner arc transform (counter-rotate)
  const innerTransform = useDerivedValue(() => [{ rotate: innerRot.value }]);
  // Core glow opacity and radius
  const coreGlowOpacity = useDerivedValue(() =>
    interpolate(corePulse.value, [0, 1], [0.08, 0.22])
  );
  const coreGlowR = useDerivedValue(() =>
    interpolate(corePulse.value, [0, 1], [52, 62])
  );
  const coreInnerR = useDerivedValue(() =>
    interpolate(corePulse.value, [0, 1], [20, 23])
  );
  // Outer ring pulse
  const outerRingOpacity = useDerivedValue(() =>
    interpolate(ringPulse.value, [0, 1], [0.05, 0.11])
  );

  // ── Static Skia paths (memoized) ──────────────────────────────────────────

  // Outer rotating arc: 300° sweep starting at 0° (3 o'clock)
  const outerArcPath = useMemo(() => {
    const r = 108;
    const p = Skia.Path.Make();
    p.addArc({ x: cx - r, y: cy - r, width: r * 2, height: r * 2 }, 0, 300);
    return p;
  }, [cx, cy]);

  // Inner counter-rotating arc: 200° sweep
  const innerArcPath = useMemo(() => {
    const r = 70;
    const p = Skia.Path.Make();
    p.addArc({ x: cx - r, y: cy - r, width: r * 2, height: r * 2 }, 40, 200);
    return p;
  }, [cx, cy]);

  // Static ring paths
  const ring1Path = useMemo(() => {
    const r = 120;
    const p = Skia.Path.Make();
    p.addCircle(cx, cy, r);
    return p;
  }, [cx, cy]);

  const ring2Path = useMemo(() => {
    const r = 88;
    const p = Skia.Path.Make();
    p.addCircle(cx, cy, r);
    return p;
  }, [cx, cy]);

  const ring3Path = useMemo(() => {
    const r = 56;
    const p = Skia.Path.Make();
    p.addCircle(cx, cy, r);
    return p;
  }, [cx, cy]);

  // ── Render helpers ────────────────────────────────────────────────────────

  const stageCopy = STAGE_COPY[renderStage];
  const stageIdx  = STAGE_ORDER.indexOf(renderStage);

  return (
    <View style={styles.container}>

      {/* ── SKIA CANVAS — crisp GPU-rendered orb ── */}
      <Pressable onPressIn={onOrbPress} style={{ width: screenW, height: CANVAS_H }}>
      <Canvas style={{ width: screenW, height: CANVAS_H }}>

        {/* 1. Background ambient glow */}
        <Circle cx={cx} cy={cy} r={155} color="rgba(255,255,255,0.03)">
          <BlurMask blur={60} style="normal" />
        </Circle>

        {/* 2. Static concentric rings */}
        <Path path={ring1Path} color="rgba(255,255,255,0.055)" style="stroke" strokeWidth={1} opacity={outerRingOpacity} />
        <Path path={ring2Path} color="rgba(255,255,255,0.07)"  style="stroke" strokeWidth={1} />
        <Path path={ring3Path} color="rgba(255,255,255,0.05)"  style="stroke" strokeWidth={1} />

        {/* 3. Outer rotating arc + orbit dots */}
        <Group transform={outerTransform} origin={vec(cx, cy)}>
          <Path
            path={outerArcPath}
            color="rgba(255,255,255,0.70)"
            style="stroke"
            strokeWidth={1.5}
            strokeCap="round"
          />
          {/* 8 outer orbit dots */}
          {OUTER_DOT_ANGLES.map((angle, i) => (
            <Circle
              key={i}
              cx={cx + Math.cos(angle) * 108}
              cy={cy + Math.sin(angle) * 108}
              r={i % 2 === 0 ? 2.8 : 1.8}
              color={`rgba(255,255,255,${i % 2 === 0 ? 0.55 : 0.28})`}
            />
          ))}
        </Group>

        {/* 4. Inner counter-rotating arc + inner orbit dots */}
        <Group transform={innerTransform} origin={vec(cx, cy)}>
          <Path
            path={innerArcPath}
            color="rgba(255,255,255,0.38)"
            style="stroke"
            strokeWidth={1}
            strokeCap="round"
          />
          {/* 5 inner orbit dots */}
          {INNER_DOT_ANGLES.map((angle, i) => (
            <Circle
              key={i}
              cx={cx + Math.cos(angle) * 70}
              cy={cy + Math.sin(angle) * 70}
              r={1.8}
              color="rgba(255,255,255,0.35)"
            />
          ))}
        </Group>

        {/* 5. Core outer glow (blurred, breathing) */}
        <Circle cx={cx} cy={cy} r={coreGlowR} color="rgba(255,255,255,1)" opacity={coreGlowOpacity}>
          <BlurMask blur={24} style="normal" />
        </Circle>

        {/* 6. Core inner glow */}
        <Circle cx={cx} cy={cy} r={28} color="rgba(255,255,255,0.18)">
          <BlurMask blur={10} style="normal" />
        </Circle>

        {/* 7. Core ball — crisp, solid */}
        <Circle cx={cx} cy={cy} r={coreInnerR} color="rgba(255,255,255,0.96)" />

      </Canvas>
      </Pressable>

      {/* ── STAGE TEXT ── */}
      <RNAnimated.View
        style={[styles.textBlock, { opacity: textOpacity }]}
        renderToHardwareTextureAndroid={IS_ANDROID}
        shouldRasterizeIOS={!IS_ANDROID}
      >
        <Text style={styles.primaryText} allowFontScaling={false} numberOfLines={1}>
          {headline ?? (stageCopy.primary + loadingDots)}
        </Text>
        <Text style={styles.subText} allowFontScaling={false} numberOfLines={1}>
          {stageMeta ?? stageCopy.sub}
        </Text>
        {slowNetwork ? (
          <View style={styles.subwayModeBlock}>
            <View style={styles.subwayModeHeader}>
              <View style={styles.subwayModeDot} />
              <Text style={styles.subwayModeLabel} allowFontScaling={false} numberOfLines={1}>
                DEEP ANALYSIS MODE
              </Text>
            </View>
            <Text style={styles.subwayModeText} allowFontScaling={false}>
              Low signal detected — extending market search for best results
            </Text>
            {onRetry ? (
              <Pressable onPress={onRetry} style={styles.subwayRetryBtn}>
                <Ionicons name="refresh-outline" size={13} color="rgba(255,255,255,0.75)" />
                <Text style={styles.subwayRetryText} allowFontScaling={false} numberOfLines={1}>
                  Retry with fresh scan
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </RNAnimated.View>

      {/* ── STAGE PROGRESS PILLS ── */}
      <View style={styles.stagePills}>
        {PILL_STAGES.map((s, pillIdx) => {
          const isCompleted = stageIdx > STAGE_ORDER.indexOf(s);
          const isActive    = stageIdx === STAGE_ORDER.indexOf(s);
          const isReached   = stageIdx >= STAGE_ORDER.indexOf(s);
          return (
            <RNAnimated.View
              key={s}
              style={[
                styles.stagePill,
                isReached && styles.stagePillActive,
                {
                  opacity: pillAnims[pillIdx],
                  transform: [{
                    translateY: pillAnims[pillIdx].interpolate({
                      inputRange: [0, 1],
                      outputRange: [8, 0],
                    }),
                  }],
                },
              ]}
              renderToHardwareTextureAndroid={IS_ANDROID}
              shouldRasterizeIOS={!IS_ANDROID}
            >
              {isCompleted ? (
                <Ionicons name="checkmark" size={9} color="rgba(255,255,255,0.85)" />
              ) : isActive ? (
                <RNAnimated.View
                  style={[
                    styles.pillGlowDot,
                    {
                      opacity: pillGlow.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.0] }),
                      transform: [{ scale: pillGlow.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.2] }) }],
                    },
                  ]}
                  renderToHardwareTextureAndroid={IS_ANDROID}
                  shouldRasterizeIOS={!IS_ANDROID}
                />
              ) : null}
            </RNAnimated.View>
          );
        })}
      </View>

      {/* ── SCAN PROGRESS BAR ── */}
      <View style={styles.progressTrack}>
        <RNAnimated.View
          style={[
            styles.progressFill,
            { width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) as any },
          ]}
          renderToHardwareTextureAndroid={IS_ANDROID}
          shouldRasterizeIOS={!IS_ANDROID}
        />
      </View>

      {/* ── CANCEL / RETRY ── */}
      <View style={styles.cancelWrap}>
        <Pressable onPress={onCancel} hitSlop={16}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>

        {retryReveal && retryScale ? (
          <RNAnimated.View style={{ opacity: retryReveal, transform: [{ scale: retryScale }] }}>
            <PressableScale onPress={onRetry} style={styles.retryBtn} scale={0.97} haptic>
              <Ionicons name="refresh" size={17} color={C.text} />
              <Text style={styles.retryText}>Retry</Text>
            </PressableScale>
          </RNAnimated.View>
        ) : showRetry ? (
          <PressableScale onPress={onRetry} style={styles.retryBtn} scale={0.97} haptic>
            <Ionicons name="refresh" size={17} color={C.text} />
            <Text style={styles.retryText}>Retry</Text>
          </PressableScale>
        ) : null}
      </View>

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },

  textBlock: {
    alignItems: "center",
    paddingHorizontal: SP.lg,
    marginBottom: SP.lg,
    marginTop: 4,
  },
  primaryText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#ffffff",
    textAlign: "center",
    lineHeight: 26,
    marginBottom: SP.xs,
    letterSpacing: 0.2,
  },
  subText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.42)",
    textAlign: "center",
    lineHeight: 18,
  },

  stagePills: {
    flexDirection: "row",
    gap: SP.sm,
    marginBottom: SP.xl,
  },
  stagePill: {
    width: 36,
    height: 20,
    borderRadius: R.pill,
    backgroundColor: C.s3,
    alignItems: "center",
    justifyContent: "center",
  },
  stagePillActive: {
    backgroundColor: "rgba(255,255,255,0.70)",
  },
  pillGlowDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(0,0,0,0.55)",
  },

  progressTrack: {
    width: "72%",
    height: 1.5,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 1,
    marginBottom: SP.xl,
    overflow: "hidden",
  },
  progressFill: {
    height: 1.5,
    backgroundColor: "rgba(255,255,255,0.50)",
    borderRadius: 1,
  },

  cancelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.lg,
  },
  cancelText: {
    fontSize: 14,
    color: "rgba(255,255,255,0.38)",
    letterSpacing: 0.2,
  },
  retryBtn: {
    minHeight: 50,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.borderMid,
    backgroundColor: C.s2,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: SP.xs,
    paddingHorizontal: SP.lg,
  },
  retryText: {
    ...TY.label,
    color: C.text,
  },

  weakSignalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: SP.sm,
  },
  weakSignalText: {
    fontSize: 11,
    color: "rgba(255,165,50,0.70)",
    letterSpacing: 0.1,
  },

  // ── Subway-Mode (Deep Analysis) ──────────────────────────────────────────
  subwayModeBlock: {
    marginTop: SP.md,
    borderWidth: 1,
    borderColor: "rgba(255,200,60,0.20)",
    borderRadius: R.md,
    backgroundColor: "rgba(255,175,0,0.07)",
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm + 2,
    alignItems: "center",
    gap: 4,
  },
  subwayModeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  subwayModeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,200,60,0.85)",
  },
  subwayModeLabel: {
    ...TY.cap,
    color: "rgba(255,210,80,0.85)",
    letterSpacing: 1.2,
  },
  subwayModeText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.45)",
    textAlign: "center",
    lineHeight: 15,
  },
  subwayRetryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
    paddingHorizontal: SP.md,
    paddingVertical: 6,
    borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  subwayRetryText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.75)",
    fontWeight: "700",
  },
});
