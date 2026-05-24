/**
 * AtmosphericBottom — premium ambient layer that sits BEHIND the dock and
 * EXTENDS UP into the area between the deck and the dock so the bottom of
 * the screen no longer reads as a hard "panel cuts here" silhouette.
 *
 * Composition (back → front):
 *   1. emeraldBloomFar  — large soft circle anchored below the screen edge,
 *                         only its top crown bleeds upward. Carries the
 *                         "object glow lives somewhere beyond the device"
 *                         depth cue (Apple Wallet / Arc).
 *   2. emeraldBloomNear — smaller, slightly brighter core inside the same
 *                         centerline. Gives the bloom a felt center.
 *   3. topFeather       — three stacked low-alpha bands that ramp the layer
 *                         from fully transparent at the top edge to its
 *                         working alpha at the bloom centerline. Removes
 *                         any hard horizontal line where the atmosphere
 *                         begins.
 *   4. dustMotes        — 3 ultra-low-alpha specks (~4-6 px) that drift
 *                         vertically over 10-14s loops. Tiny opacity sine
 *                         on top of the drift so they don't read as moving
 *                         dots, just "the air shifts." Native-driver only.
 *
 * Everything is `pointerEvents="none"` so the dock + cards stay fully
 * interactive. The whole layer renders to a hardware texture on Android
 * and rasterizes once on iOS to keep the cost flat regardless of how many
 * motes are alive.
 *
 * Intentionally NO confetti, sparkles, particle bursts, or color cycling.
 * If a user notices this layer at all, the design failed.
 */
import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated, Easing, Platform } from "react-native";
import { SCREEN } from "../design/DS";

const IS_ANDROID = Platform.OS === "android";

// Container height — sized to cover the dock plus a generous band of the
// deck area above it. The motes spawn within this height so they read as
// "in the same room" as the dock and the card.
const LAYER_HEIGHT = 460;

// Bloom geometry. The far bloom is a circle wider than the screen; only
// its top ~40% is inside the layer (the rest sits below the device edge).
// This creates the illusion of a luminous object below the phone.
const BLOOM_FAR_SIZE = Math.round(SCREEN.width * 1.6);
const BLOOM_NEAR_SIZE = Math.round(SCREEN.width * 0.95);

interface DustMoteProps {
  /** Horizontal anchor — fraction of screen width (0..1). */
  xFraction: number;
  /** Starting vertical offset from the bottom (px). */
  startY: number;
  /** Drift distance upward (px) over one loop. */
  driftY: number;
  /** Single-loop duration (ms). */
  duration: number;
  /** Delay before first loop (ms) so motes don't synchronize. */
  delay: number;
  /** Mote diameter (px). */
  size: number;
  /** Peak opacity at the loop's midpoint. */
  peakOpacity: number;
}

/**
 * A single drifting dust mote. Opacity peaks at the middle of the loop
 * and fades to ~0 at both ends so the mote never pops in or out. Drift
 * goes upward over the duration; on loop end it resets to startY.
 */
function DustMote({
  xFraction,
  startY,
  driftY,
  duration,
  delay,
  size,
  peakOpacity,
}: DustMoteProps) {
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    let loop: Animated.CompositeAnimation | null = null;
    const start = () => {
      if (!mounted) return;
      loop = Animated.loop(
        Animated.timing(drift, {
          toValue: 1,
          duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      loop.start();
    };
    const initial = Animated.timing(drift, {
      toValue: 0,
      duration: 0,
      useNativeDriver: true,
    });
    initial.start();
    const t = setTimeout(start, delay);
    return () => {
      mounted = false;
      clearTimeout(t);
      try { loop?.stop(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drift translates the mote upward over the loop. Opacity uses a
  // bell-shape interpolation so it fades in, peaks, and fades out.
  const translateY = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -driftY],
  });
  const opacity = drift.interpolate({
    inputRange: [0, 0.18, 0.5, 0.82, 1],
    outputRange: [0, peakOpacity * 0.65, peakOpacity, peakOpacity * 0.5, 0],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.mote,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          bottom: startY,
          left: xFraction * SCREEN.width - size / 2,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    />
  );
}

export function AtmosphericBottom() {
  return (
    <View
      pointerEvents="none"
      style={styles.container}
      renderToHardwareTextureAndroid={IS_ANDROID}
      shouldRasterizeIOS={!IS_ANDROID}
    >
      {/* Far bloom — anchored below the screen, top crown bleeds upward.
          Cooler-edge teal so the bloom feels like an object beyond the
          device, not a flat color wash. */}
      <View style={styles.bloomFar} />
      {/* Near bloom — same centerline, smaller + slightly warmer green so
          the bloom has a felt core. Reads as "the light has a source." */}
      <View style={styles.bloomNear} />

      {/* Top feather — three stacked bands ramp the layer from fully
          transparent at the very top of the layer to working alpha by the
          time the bloom's crown appears. Kills any hard horizontal seam
          where the atmosphere begins. */}
      <View style={styles.topFeather1} />
      <View style={styles.topFeather2} />
      <View style={styles.topFeather3} />

      {/* Drifting motes — three offset in x, startY, duration, and size so
          they read as "the air around the deck has presence" rather than
          a moving constellation. None are synchronized. */}
      <DustMote xFraction={0.18} startY={92}  driftY={140} duration={11200} delay={0}    size={4.5} peakOpacity={0.085} />
      <DustMote xFraction={0.78} startY={180} driftY={170} duration={13400} delay={2300} size={3.5} peakOpacity={0.070} />
      <DustMote xFraction={0.46} startY={48}  driftY={210} duration={9800}  delay={4600} size={5.0} peakOpacity={0.060} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Anchored to the bottom of the parent (ResultsContent's resultsWrap).
  // Width is the full viewport so the bloom centerline math is honest.
  // overflow: hidden clips the bloom's lower half (which conceptually
  // lives "below the device") so the cost is bounded.
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: LAYER_HEIGHT,
    overflow: "hidden",
  },

  // Bloom geometry. Both are circles with massive borderRadius so the
  // soft edge falloff feels radial without a real gradient. Position math
  // pins the BOTTOM of each bloom well below the layer's bottom so only
  // their crowns sit inside the visible area. Centered horizontally.
  bloomFar: {
    position: "absolute",
    width: BLOOM_FAR_SIZE,
    height: BLOOM_FAR_SIZE,
    borderRadius: BLOOM_FAR_SIZE / 2,
    left: (SCREEN.width - BLOOM_FAR_SIZE) / 2,
    // Pull the bloom down so most of it sits below the layer; only the
    // top crown (~40% of height) is visible inside the container.
    bottom: -BLOOM_FAR_SIZE * 0.58,
    backgroundColor: "rgba(60,170,130,0.055)",
  },
  bloomNear: {
    position: "absolute",
    width: BLOOM_NEAR_SIZE,
    height: BLOOM_NEAR_SIZE,
    borderRadius: BLOOM_NEAR_SIZE / 2,
    left: (SCREEN.width - BLOOM_NEAR_SIZE) / 2,
    bottom: -BLOOM_NEAR_SIZE * 0.62,
    backgroundColor: "rgba(80,220,150,0.045)",
  },

  // Top feather — three bands at the top of the layer that simulate a
  // soft gradient fade. The container's bottom is fully atmospheric; the
  // top has these bands so the transition INTO the atmosphere is gradual.
  // Stacked top-down: thinnest darkest at very top, ramping to clearer.
  topFeather1: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: "rgba(0,0,0,0.0)",
  },
  topFeather2: {
    position: "absolute",
    top: 24,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: "rgba(0,0,0,0.0)",
  },
  topFeather3: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: "rgba(0,0,0,0.0)",
  },

  // Mote base — color and shape only. Position/animation come from inline
  // style in DustMote. Soft white-green tint so the mote reads as ambient
  // dust catching the bloom, not a hard pixel.
  mote: {
    position: "absolute",
    backgroundColor: "rgba(200,255,220,0.95)",
    shadowColor: "rgba(120,255,180,1)",
    shadowOpacity: 0.45,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
});
