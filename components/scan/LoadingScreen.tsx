/**
 * LoadingScreen — cinematic AI intelligence loading experience.
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

  // ── 5 staggered pulse rings
  const pulseAnims = useRef(RINGS.map(() => new RNAnimated.Value(0))).current;

  // ── stage text cross-fade
  const textOpacity = useRef(new RNAnimated.Value(1)).current;

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

    return () => {
      try { glowLoop.stop(); } catch {}
      try { orbitLoop.stop(); } catch {}
      try { orbit2Loop.stop(); } catch {}
      pulseLoops.forEach((l) => { try { l.stop(); } catch {} });
    };
  }, []);

  // Stage cross-fade
  useEffect(() => {
    RNAnimated.timing(textOpacity, {
      toValue: 0, duration: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start(() => {
      setRenderStage(stage);
      RNAnimated.timing(textOpacity, {
        toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }).start();
    });
  }, [stage]);

  const orbitDeg  = orbitRot.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const orbit2Deg = orbit2Rot.interpolate({ inputRange: [0, 1], outputRange: ["360deg", "0deg"] });

  const stageCopy = STAGE_COPY[renderStage];

  // Stage progress: vision=1, market=2, analysis=3
  const STAGE_ORDER: LoadingStage[] = ["idle", "vision", "market", "analysis", "collector"];
  const stageIdx = STAGE_ORDER.indexOf(renderStage);

  return (
    <RNAnimated.View
      style={[
        styles.container,
        { opacity: panelOpacity, transform: [{ translateY: panelY }] },
      ]}
    >
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

      {/* ── ORBS ─────────────────────────── */}
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

      {/* ── STAGE TEXT ────────────────────── */}
      <RNAnimated.View style={[styles.textBlock, { opacity: textOpacity }]}>
        <Text style={styles.primaryText}>
          {headline ?? (stageCopy.primary + loadingDots)}
        </Text>
        <Text style={styles.subText}>
          {stageMeta ?? stageCopy.sub}
        </Text>
      </RNAnimated.View>

      {/* ── STAGE PROGRESS PILLS ─────────── */}
      <View style={styles.stagePills}>
        {(["vision", "market", "analysis"] as LoadingStage[]).map((s) => {
          const active = stageIdx >= STAGE_ORDER.indexOf(s);
          return (
            <View
              key={s}
              style={[styles.stagePill, active && styles.stagePillActive]}
            />
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

      {/* ── ACTIONS ──────────────────────── */}
      <View style={styles.actions}>
        <PressableScale onPress={onCancel} style={styles.cancelBtn} scale={0.97} haptic>
          <Ionicons name="close" size={17} color={C.text3} />
          <Text style={styles.cancelText}>Cancel</Text>
        </PressableScale>

        {/* Retry: shown conditionally via animated values or showRetry */}
        {retryReveal && retryScale ? (
          <RNAnimated.View
            style={{ flex: 1, opacity: retryReveal, transform: [{ scale: retryScale }] }}
          >
            <PressableScale onPress={onRetry} style={styles.retryBtn} scale={0.97} haptic>
              <Ionicons name="refresh" size={17} color={C.text} />
              <Text style={styles.retryText}>Retry</Text>
            </PressableScale>
          </RNAnimated.View>
        ) : showRetry ? (
          <PressableScale onPress={onRetry} style={[styles.retryBtn, { flex: 1 }]} scale={0.97} haptic>
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
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SP.xxxl,
    paddingHorizontal: SP.xl,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.28)",
  },

  // orb
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

  // text
  textBlock: {
    alignItems: "center",
    paddingHorizontal: SP.lg,
    marginBottom: SP.lg,
  },
  primaryText: {
    ...TY.h1,
    color: C.text,
    textAlign: "center",
    marginBottom: SP.xs,
  },
  subText: {
    ...TY.label,
    color: C.text3,
    textAlign: "center",
    lineHeight: 18,
  },

  // stage pills
  stagePills: {
    flexDirection: "row",
    gap: SP.sm,
    marginBottom: SP.xl,
  },
  stagePill: {
    width: 28,
    height: 3,
    borderRadius: R.pill,
    backgroundColor: C.s3,
  },
  stagePillActive: {
    backgroundColor: "rgba(255,255,255,0.70)",
  },

  // progress bar
  progressTrack: {
    width: "100%",
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: R.pill,
    marginBottom: SP.xl,
    overflow: "hidden",
  },
  progressFill: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.55)",
    borderRadius: R.pill,
  },

  // actions
  actions: {
    flexDirection: "row",
    gap: SP.md,
    width: "100%",
  },
  cancelBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.s1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: SP.xs,
  },
  cancelText: {
    ...TY.label,
    color: C.text3,
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
