/**
 * ConfettiBurst — premium celebration overlay for "Bought it" taps.
 *
 * Design notes:
 *  - Restrained palette: champagne / gold / soft white. No primary colors.
 *  - Particles are slim rectangles + small circles — not paper-confetti shapes.
 *  - Single burst (no loops, no continuous emission). Plays once per `fireKey`.
 *  - Uses Reanimated worklets only — no expo-confetti, no external deps.
 *  - pointerEvents="none" so it never blocks taps even mid-animation.
 *  - Auto-unmounts after the burst settles to avoid leaking timers.
 */
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View, Dimensions, Platform } from "react-native";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  Easing,
} from "react-native-reanimated";

const { width: W, height: H } = Dimensions.get("window");

const PARTICLE_COUNT = 28;
const BURST_DURATION_MS = 1600;
const FALL_DURATION_MS  = 2200;
const TOTAL_LIFE_MS     = BURST_DURATION_MS + FALL_DURATION_MS;

// Restrained palette: champagne, brushed gold, soft white. Apple-keynote feel.
const PALETTE = [
  "rgba(255, 232, 178, 0.95)", // warm champagne
  "rgba(240, 215, 160, 0.92)", // light gold
  "rgba(255, 245, 220, 0.95)", // cream
  "rgba(220, 200, 150, 0.88)", // muted brass
  "rgba(255, 255, 255, 0.95)", // soft white
];

interface ConfettiBurstProps {
  /** Change this value (e.g. Date.now()) to trigger a fresh burst. 0 = idle. */
  fireKey: number;
  /** X-origin of the burst (defaults to screen center). */
  originX?: number;
  /** Y-origin of the burst (defaults to upper-third). */
  originY?: number;
}

interface Particle {
  id: number;
  color: string;
  size: number;
  isStrip: boolean;
  // Launch trajectory
  dx: number;
  dy: number;
  rotateDeg: number;
  delayMs: number;
}

function buildParticles(seed: number): Particle[] {
  // Deterministic-per-burst pseudo-random so React's reconciliation is stable
  // for the burst's lifetime. Seeded LCG, not crypto.
  let s = (seed % 1_000_000) || 1;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  return Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
    const angle = (Math.PI * (rand() * 0.85 + 0.075)); // 0.075π – 0.93π (upward cone)
    const speed = 220 + rand() * 220;                  // initial outward speed (px)
    const dx = Math.cos(angle) * speed * (rand() < 0.5 ? -1 : 1);
    const dy = -Math.sin(angle) * speed * (0.85 + rand() * 0.4); // launch upward
    const isStrip = rand() > 0.45;
    return {
      id: i,
      color: PALETTE[i % PALETTE.length],
      size: isStrip ? 7 + rand() * 4 : 4 + rand() * 3,
      isStrip,
      dx,
      dy,
      rotateDeg: (rand() - 0.5) * 720,
      delayMs: Math.floor(rand() * 90),
    };
  });
}

function ConfettiParticle({
  particle,
  originX,
  originY,
}: {
  particle: Particle;
  originX: number;
  originY: number;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = 0;
    t.value = withDelay(
      particle.delayMs,
      withSequence(
        withTiming(1, { duration: BURST_DURATION_MS, easing: Easing.out(Easing.cubic) }),
        withTiming(1.6, { duration: FALL_DURATION_MS, easing: Easing.in(Easing.quad) }),
      ),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aStyle = useAnimatedStyle(() => {
    const phase = t.value;
    // Phase 0→1: outward burst, mild gravity. Phase 1→1.6: gravity-dominated fall + fade.
    const burstFrac = Math.min(phase, 1);
    const fallFrac  = Math.max(phase - 1, 0) / 0.6; // 0→1 over the fall

    const tx = particle.dx * burstFrac + (particle.dx * 0.18) * fallFrac;
    const ty =
      particle.dy * burstFrac +              // upward launch
      (90 * burstFrac * burstFrac) +         // gravity during burst
      (260 * fallFrac);                      // gravity during fall

    const rot = particle.rotateDeg * (burstFrac + fallFrac * 0.4);
    const opacity =
      burstFrac < 0.05
        ? burstFrac / 0.05
        : 1 - Math.pow(fallFrac, 1.6) * 0.95;

    return {
      opacity,
      transform: [
        { translateX: tx },
        { translateY: ty },
        { rotate: `${rot}deg` },
      ] as any,
    };
  });

  const baseStyle = particle.isStrip
    ? {
        width: particle.size * 0.55,
        height: particle.size * 2.4,
        borderRadius: 1.2,
      }
    : {
        width: particle.size,
        height: particle.size,
        borderRadius: particle.size / 2,
      };

  return (
    <Reanimated.View
      pointerEvents="none"
      style={[
        styles.particle,
        baseStyle,
        {
          left: originX - particle.size / 2,
          top: originY - particle.size / 2,
          backgroundColor: particle.color,
        },
        aStyle as any,
      ]}
    />
  );
}

export function ConfettiBurst({ fireKey, originX = W / 2, originY = H * 0.32 }: ConfettiBurstProps) {
  // Mount/unmount controller — keeps the tree clean when idle.
  const [activeKey, setActiveKey] = useState(0);

  useEffect(() => {
    if (!fireKey) return;
    setActiveKey(fireKey);
    const t = setTimeout(() => setActiveKey(0), TOTAL_LIFE_MS + 200);
    return () => clearTimeout(t);
  }, [fireKey]);

  const particles = useMemo(
    () => (activeKey ? buildParticles(activeKey) : []),
    [activeKey],
  );

  if (!activeKey) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      {particles.map((p) => (
        <ConfettiParticle
          key={`${activeKey}-${p.id}`}
          particle={p}
          originX={originX}
          originY={originY}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  particle: {
    position: "absolute",
    // Subtle soft glow — premium feel, not flat color
    shadowColor: "rgba(255, 230, 180, 0.8)",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: Platform.OS === "ios" ? 0.85 : 0,
    shadowRadius: 6,
  },
});
