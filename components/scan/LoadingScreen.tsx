/**
 * LoadingScreen — cinematic Apple-keynote-style AI intelligence loading experience.
 * Replaces the old ResultsLoadingPanel with a dramatically more polished visual.
 *
 * Drop-in compatible: accepts the same props as ResultsLoadingPanel.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated as RNAnimated,
  Easing,
  Image,
  Pressable,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { C, SP, R, TY, MO } from "../design/DS";
import { PressableScale } from "../primitives/PressableScale";

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
  /** kept for backwards compat with old ResultsLoadingPanel */
  headline?: string;
}

const STAGE_COPY: Record<LoadingStage, { primary: string; sub: string }> = {
  idle:      { primary: "Initializing",       sub: "Preparing analysis pipeline" },
  vision:    { primary: "Analyzing item",      sub: "Building visual identity" },
  market:    { primary: "Searching market",    sub: "Scanning listings in real time" },
  analysis:  { primary: "Ranking best deals",  sub: "Calculating resale intelligence" },
  collector: { primary: "Detecting value",     sub: "Searching for hidden gems" },
};

// 5 concentric pulse rings
const RINGS = [
  { size: 90,  delay: 0   },
  { size: 130, delay: 220 },
  { size: 174, delay: 440 },
  { size: 222, delay: 660 },
  { size: 274, delay: 880 },
];

const STAGE_ORDER: LoadingStage[] = ["idle", "vision", "market", "analysis", "collector"];
const PILL_STAGES: LoadingStage[] = ["vision", "market", "analysis"];

export function LoadingScreen({
  photoUri,
  stage = "idle",
  stageMeta,
  onCancel,
  onRetry,
  showRetry,
  retryReveal,
  retryScale,
  loadingDots = "",
  headline,
}: LoadingScreenProps) {
  // ── entrance
  const panelOpacity = useRef(new RNAnimated.Value(0)).current;
  const panelY       = useRef(new RNAnimated.Value(20)).current;
  const progressAnim = useRef(new RNAnimated.Value(0)).current;

  // ── core orb glow
  const coreGlow = useRef(new RNAnimated.Value(0)).current;

  // ── outer orbit rotation
  const orbitRot  = useRef(new RNAnimated.Value(0)).current;
  // ── inner counter-orbit
  const orbit2Rot = useRef(new RNAnimated.Value(0)).current;

  // ── scanning ring rotation (for photo frame)
  const scanRingRot = useRef(new RNAnimated.Value(0)).current;

  // ── 5 staggered pulse rings
  const pulseAnims = useRef(RINGS.map(() => new RNAnimated.Value(0))).current;

  // ── stage text cross-fade
  const textOpacityIn  = useRef(new RNAnimated.Value(1)).current;
  const textOpacityOut = useRef(new RNAnimated.Value(1)).current;

  // ── stage pill entrances (staggered)
  const pillAnims = useRef(PILL_STAGES.map(() => new RNAnimated.Value(0))).current;
  // ── active pill glow pulse
  const pillGlow = useRef(new RNAnimated.Value(0)).current;

  // ── stage progress dots animate
  const [renderStage, setRenderStage] = useState(stage);

  // Entrance
  useEffect(() => {
    RNAnimated.parallel([
      RNAnimated.timing(panelOpacity, {
        toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
      RNAnimated.spring(panelY, {
        toValue: 0, damping: 22, stiffness: 200, mass: 0.9, useNativeDriver: true,
      }),
    ]).start();

    // Scan progress bar
    RNAnimated.timing(progressAnim, {
      toValue: 1,
      duration: 28000,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();

    // Staggered pill entrances
    PILL_STAGES.forEach((_, idx) => {
      RNAnimated.sequence([
        RNAnimated.delay(idx * 140),
        RNAnimated.spring(pillAnims[idx], {
          toValue: 1, damping: 20, stiffness: 220, mass: 0.8, useNativeDriver: true,
        }),
      ]).start();
    });
  }, []);

  // Continuous loops
  useEffect(() => {
    // core glow
    const glowLoop = RNAnimated.loop(RNAnimated.sequence([
      RNAnimated.timing(coreGlow, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      RNAnimated.timing(coreGlow, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    glowLoop.start();

    // outer orbit
    const orbitLoop = RNAnimated.loop(
      RNAnimated.timing(orbitRot, { toValue: 1, duration: 3400, easing: Easing.linear, useNativeDriver: true })
    );
    orbitLoop.start();

    // inner counter-orbit (slower, opposite)
    const orbit2Loop = RNAnimated.loop(
      RNAnimated.timing(orbit2Rot, { toValue: 1, duration: 5200, easing: Easing.linear, useNativeDriver: true })
    );
    orbit2Loop.start();

    // scanning ring (faster, for photo frame)
    const scanRingLoop = RNAnimated.loop(
      RNAnimated.timing(scanRingRot, { toValue: 1, duration: 2200, easing: Easing.linear, useNativeDriver: true })
    );
    scanRingLoop.start();

    // staggered pulse rings
    const pulseLoops = RINGS.map(({ delay }, idx) => {
      const loop = RNAnimated.loop(RNAnimated.sequence([
        RNAnimated.delay(delay),
        RNAnimated.timing(pulseAnims[idx], {
          toValue: 1, duration: 1700 + idx * 80, easing: Easing.out(Easing.quad), useNativeDriver: true,
        }),
        RNAnimated.timing(pulseAnims[idx], {
          toValue: 0, duration: 0, useNativeDriver: true,
        }),
      ]));
      loop.start();
      return loop;
    });

    // active pill glow pulse
    const pillGlowLoop = RNAnimated.loop(RNAnimated.sequence([
      RNAnimated.timing(pillGlow, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      RNAnimated.timing(pillGlow, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    pillGlowLoop.start();

    return () => {
      try { glowLoop.stop(); } catch {}
      try { orbitLoop.stop(); } catch {}
      try { orbit2Loop.stop(); } catch {}
      try { scanRingLoop.stop(); } catch {}
      try { pillGlowLoop.stop(); } catch {}
      pulseLoops.forEach((l) => { try { l.stop(); } catch {} });
    };
  }, []);

  // Stage cross-fade
  useEffect(() => {
    RNAnimated.timing(textOpacityIn, {
      toValue: 0, duration: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start(() => {
      setRenderStage(stage);
      RNAnimated.timing(textOpacityIn, {
        toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }).start();
    });
  }, [stage]);

  const orbitDeg   = orbitRot.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const orbit2Deg  = orbit2Rot.interpolate({ inputRange: [0, 1], outputRange: ["360deg", "0deg"] });
  const scanRingDeg = scanRingRot.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  const stageCopy = STAGE_COPY[renderStage];
  const stageIdx  = STAGE_ORDER.indexOf(renderStage);

  return (
    <RNAnimated.View
      style={[
        styles.container,
        { opacity: panelOpacity, transform: [{ translateY: panelY }] },
      ]}
    >
      {/* Subtle center glow */}
      <View style={styles.bgGlow} pointerEvents="none" />

      {/* Background: blurred photo */}
      {photoUri ? (
        <Image
          source={{ uri: photoUri }}
          style={StyleSheet.absoluteFillObject}
          blurRadius={24}
          resizeMode="cover"
        />
      ) : null}

      {/* Glass blur */}
      <BlurView intensity={44} tint="dark" style={StyleSheet.absoluteFillObject} />

      {/* Dark overlay */}
      <View style={styles.overlay} />

      {/* ── PHOTO PREVIEW or ORBS ─────────────────────────── */}
      {photoUri ? (
        <View style={styles.photoFrame}>
          {/* Rotating scanning ring */}
          <RNAnimated.View
            pointerEvents="none"
            style={[styles.scanRing, { transform: [{ rotate: scanRingDeg }] }]}
          />
          {/* Slower counter-rotating ring */}
          <RNAnimated.View
            pointerEvents="none"
            style={[styles.scanRingInner, { transform: [{ rotate: orbit2Deg }] }]}
          />
          {/* Circular photo */}
          <View style={styles.photoCircle}>
            <Image
              source={{ uri: photoUri }}
              style={styles.photoCircleImg}
              resizeMode="cover"
            />
          </View>
        </View>
      ) : (
        <View style={styles.orbContainer}>
          {/* Pulse rings */}
          {RINGS.map(({ size }, idx) => (
            <RNAnimated.View
              key={idx}
              pointerEvents="none"
              style={[
                styles.ring,
                {
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  opacity: pulseAnims[idx].interpolate({
                    inputRange: [0, 0.25, 1],
                    outputRange: [0.55, 0.18, 0],
                  }),
                  transform: [
                    {
                      scale: pulseAnims[idx].interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.80, 1.45],
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}

          {/* Outer orbit: 8 dots */}
          <RNAnimated.View
            pointerEvents="none"
            style={[styles.orbitRing, { transform: [{ rotate: orbitDeg }] }]}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.orbitDot,
                  {
                    transform: [
                      { rotate: `${i * 45}deg` },
                      { translateY: -52 },
                    ],
                    opacity: i % 2 === 0 ? 0.55 : 0.30,
                    width: i % 2 === 0 ? 5 : 3,
                    height: i % 2 === 0 ? 5 : 3,
                    borderRadius: 3,
                  },
                ]}
              />
            ))}
          </RNAnimated.View>

          {/* Inner counter-orbit: 5 dots */}
          <RNAnimated.View
            pointerEvents="none"
            style={[styles.orbitRing, { transform: [{ rotate: orbit2Deg }] }]}
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.orbitDot,
                  {
                    transform: [
                      { rotate: `${i * 72}deg` },
                      { translateY: -30 },
                    ],
                    opacity: 0.40,
                    width: 3,
                    height: 3,
                    borderRadius: 2,
                  },
                ]}
              />
            ))}
          </RNAnimated.View>

          {/* Core */}
          <RNAnimated.View
            style={[
              styles.core,
              {
                shadowOpacity: coreGlow.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.25, 0.85],
                }) as any,
              },
            ]}
          >
            <RNAnimated.View
              style={[
                styles.coreInner,
                {
                  opacity: coreGlow.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.75, 1],
                  }),
                  transform: [
                    {
                      scale: coreGlow.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.92, 1.06],
                      }),
                    },
                  ],
                },
              ]}
            />
          </RNAnimated.View>
        </View>
      )}

      {/* ── STAGE TEXT ────────────────────── */}
      <RNAnimated.View style={[styles.textBlock, { opacity: textOpacityIn }]}>
        <Text style={styles.primaryText}>
          {headline ?? (stageCopy.primary + loadingDots)}
        </Text>
        <Text style={styles.subText}>
          {stageMeta ?? stageCopy.sub}
        </Text>
      </RNAnimated.View>

      {/* ── STAGE PROGRESS PILLS ─────────── */}
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
            >
              {isCompleted ? (
                <Ionicons name="checkmark" size={9} color="rgba(255,255,255,0.85)" />
              ) : isActive ? (
                <RNAnimated.View style={[
                  styles.pillGlowDot,
                  {
                    opacity: pillGlow.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.4, 1.0],
                    }),
                    transform: [{
                      scale: pillGlow.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.8, 1.2],
                      }),
                    }],
                  },
                ]} />
              ) : null}
            </RNAnimated.View>
          );
        })}
      </View>

      {/* ── SCAN PROGRESS BAR ────────────── */}
      <View style={styles.progressTrack}>
        <RNAnimated.View style={[
          styles.progressFill,
          { width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) as any },
        ]} />
      </View>

      {/* ── CANCEL BUTTON (bottom, text-only) ── */}
      <View style={styles.cancelWrap}>
        <Pressable onPress={onCancel} hitSlop={16}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>

        {/* Retry: shown conditionally via animated values or showRetry */}
        {retryReveal && retryScale ? (
          <RNAnimated.View
            style={{ opacity: retryReveal, transform: [{ scale: retryScale }] }}
          >
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
    </RNAnimated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SP.xxxl,
    paddingHorizontal: SP.xl,
  },
  // Subtle center glow behind everything
  bgGlow: {
    position: "absolute",
    top: "20%",
    alignSelf: "center",
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(255,255,255,0.025)",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.28)",
  },

  // ── Photo preview frame ─────────────────────────────────────────────────────
  photoFrame: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SP.lg,
  },
  scanRing: {
    position: "absolute",
    width: 116,
    height: 116,
    borderRadius: 58,
    borderWidth: 2,
    borderColor: "transparent",
    borderTopColor: "rgba(255,255,255,0.70)",
    borderRightColor: "rgba(255,255,255,0.25)",
  },
  scanRingInner: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: "transparent",
    borderBottomColor: "rgba(255,255,255,0.40)",
    borderLeftColor: "rgba(255,255,255,0.15)",
  },
  photoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.20)",
  },
  photoCircleImg: {
    width: 88,
    height: 88,
  },

  // orb (used when no photo)
  orbContainer: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SP.lg,
  },
  ring: {
    position: "absolute",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
  },
  orbitRing: {
    position: "absolute",
    width: 104,
    height: 104,
    alignItems: "center",
    justifyContent: "center",
  },
  orbitDot: {
    position: "absolute",
    backgroundColor: "rgba(255,255,255,0.70)",
  },
  core: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#fff",
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
    elevation: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.30)",
  },
  coreInner: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.94)",
  },

  // ── Stage text ──────────────────────────────────────────────────────────────
  textBlock: {
    alignItems: "center",
    paddingHorizontal: SP.lg,
    marginBottom: SP.lg,
  },
  primaryText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
    textAlign: "center",
    marginBottom: SP.xs,
  },
  subText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.45)",
    textAlign: "center",
    lineHeight: 18,
  },

  // ── Stage pills ─────────────────────────────────────────────────────────────
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

  // ── Progress bar ────────────────────────────────────────────────────────────
  progressTrack: {
    width: "100%",
    height: 2,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: R.pill,
    marginBottom: SP.xl,
    overflow: "hidden",
  },
  progressFill: {
    height: 2,
    backgroundColor: "rgba(255,255,255,0.6)",
    borderRadius: R.pill,
  },

  // ── Cancel (bottom, text-only) ──────────────────────────────────────────────
  cancelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.lg,
    marginTop: SP.sm,
  },
  cancelText: {
    fontSize: 14,
    color: "rgba(255,255,255,0.4)",
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
});
