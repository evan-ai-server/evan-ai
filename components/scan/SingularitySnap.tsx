/**
 * SingularitySnap — The core "Scan Event" spatial experience.
 *
 * Four-phase cinematic sequence rendered entirely on the GPU via Skia:
 *   Phase 1: Kinetic Implosion   — SDF gravity well + barrel distortion + Perlin noise
 *   Phase 2: Chromatic Supernova — Full-screen chromatic wave with aberration
 *   Phase 3: Neural Tracing      — Volumetric lattice filaments + data particles
 *   Phase 4: Reality Bloom        — Spatial Z-axis data reveal + slot-machine price
 *
 * All shader math runs in SkSL (Skia Shading Language) on the GPU.
 * Reanimated drives the phase timeline; Skia renders every pixel.
 */
import React, { useEffect, useMemo, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  Platform,
} from "react-native";
import {
  Canvas,
  Skia,
  Shader,
  Fill,
  Circle,
  Rect,
  BlurMask,
} from "@shopify/react-native-skia";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
  withSpring,
  withDelay,
  withRepeat,
  Easing,
  runOnJS,
  cancelAnimation,
} from "react-native-reanimated";
import { C, MO, EASE_PANTHERE, TY, SP, R, Feedback } from "../design/DS";
import { PriceSlotMachine } from "./PriceSlotMachine";

const IS_ANDROID = Platform.OS === "android";
const panthere = Easing.bezier(
  EASE_PANTHERE[0],
  EASE_PANTHERE[1],
  EASE_PANTHERE[2],
  EASE_PANTHERE[3]
);

// ─── TYPES ──────────────────────────────────────────────────────────────────
export type SnapPhase =
  | "idle"
  | "implosion"
  | "supernova"
  | "tracing"
  | "bloom"
  | "complete";

interface SingularitySnapProps {
  /** Current phase — driven by parent scan pipeline */
  phase: SnapPhase;
  /** Final price to reveal in Phase 4 */
  price?: number;
  /** Item name for the reveal */
  itemName?: string;
  /** Verdict text (GREAT FLIP, GOOD, etc.) */
  verdict?: string;
  /** Trend direction */
  trend?: string;
  /** Scarcity label */
  scarcity?: string;
  /** Called when all 4 phases complete */
  onComplete?: () => void;
  /** Touch-point coordinates for gravity well origin (normalized 0-1) */
  touchOrigin?: { x: number; y: number };
}

// ─── SkSL SHADERS ────────────────────────────────────────────────────────────
// These run on the GPU. SkSL is Skia's shading language (GLSL-like).

/**
 * Phase 1: Gravity Well + Barrel Distortion + Perlin Noise
 * Creates a spatial "implosion" toward the touch point with warping light.
 */
const GRAVITY_WELL_SHADER = Skia.RuntimeEffect.Make(`
  uniform float2 iResolution;
  uniform float  iTime;
  uniform float  iIntensity;    // 0→1 implosion strength
  uniform float2 iOrigin;       // touch origin (pixel coords)

  // Simplex-like noise for liquid mesh gradient
  float hash(float2 p) {
    float h = dot(p, float2(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
  }

  float noise(float2 p) {
    float2 i = floor(p);
    float2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + float2(1.0, 0.0));
    float c = hash(i + float2(0.0, 1.0));
    float d = hash(i + float2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(float2 p) {
    float v = 0.0;
    float a = 0.5;
    float2 shift = float2(100.0, 100.0);
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = p * 2.0 + shift;
      a *= 0.5;
    }
    return v;
  }

  // SDF circle for the gravity well
  float sdCircle(float2 p, float r) {
    return length(p) - r;
  }

  half4 main(float2 fragCoord) {
    float2 uv = fragCoord / iResolution;
    float2 center = iOrigin / iResolution;
    float2 delta = uv - center;
    float dist = length(delta);

    // Barrel distortion — light bends toward the gravity well
    float pull = iIntensity * 0.15 * exp(-dist * 3.0);
    float2 distorted = uv - delta * pull;

    // SDF gravity ring
    float wellR = 0.08 + iIntensity * 0.12;
    float sdf = sdCircle(delta, wellR);
    float ring = smoothstep(0.008, 0.0, abs(sdf)) * iIntensity;

    // Inner glow
    float innerGlow = exp(-dist * 8.0) * iIntensity * 0.6;

    // Perlin noise liquid mesh swirling around touch point
    float angle = atan(delta.y, delta.x) + iTime * 1.8;
    float noiseVal = fbm(float2(angle * 2.0, dist * 6.0 - iTime * 0.5));
    float liquidMesh = noiseVal * iIntensity * smoothstep(0.4, 0.0, dist) * 0.5;

    // Edge contraction — screen edges darken and pull inward
    float edgeDark = smoothstep(0.5, 0.0, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
    float edgePull = edgeDark * iIntensity * 0.3;

    // Color: Electric Cyan core, Emerald Spark ring, Deep Space Violet edges
    half3 cyan    = half3(0.0, 0.941, 1.0);
    half3 emerald = half3(0.0, 1.0, 0.639);
    half3 violet  = half3(0.102, 0.0, 0.2);
    half3 magenta = half3(1.0, 0.0, 0.478);

    half3 col = half3(0.0);
    col += cyan * half(innerGlow);
    col += emerald * half(ring * 0.8);
    col += magenta * half(liquidMesh * 0.6);
    col += cyan * half(liquidMesh * 0.4);
    col = mix(col, violet * half3(0.3), half(edgePull));

    float alpha = clamp(innerGlow + ring + liquidMesh + edgePull, 0.0, 1.0);
    return half4(col, half(alpha));
  }
`)!;

/**
 * Phase 2: Chromatic Supernova — Ray-marched liquid fire ripple
 * Multi-spectral wave with aggressive chromatic aberration at the wavefront.
 */
const SUPERNOVA_SHADER = Skia.RuntimeEffect.Make(`
  uniform float2 iResolution;
  uniform float  iTime;
  uniform float  iWave;        // 0→1 wave expansion progress
  uniform float2 iOrigin;      // blast center (pixel coords)

  float hash(float2 p) {
    return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453);
  }

  float noise(float2 p) {
    float2 i = floor(p);
    float2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + float2(1, 0)), f.x),
      mix(hash(i + float2(0, 1)), hash(i + float2(1, 1)), f.x),
      f.y
    );
  }

  half4 main(float2 fragCoord) {
    float2 uv = fragCoord / iResolution;
    float2 center = iOrigin / iResolution;
    float dist = length(uv - center);

    // Wave front radius expands from center
    float waveR = iWave * 1.6;    // overshoots screen diagonal
    float waveDelta = dist - waveR;

    // Wavefront band
    float waveWidth = 0.06 + iWave * 0.04;
    float waveFront = smoothstep(waveWidth, 0.0, abs(waveDelta));

    // Trailing energy behind the wavefront
    float trail = smoothstep(0.0, waveR, waveR - dist) * (1.0 - iWave * 0.5);
    trail *= exp(-abs(waveDelta) * 4.0);

    // Chromatic aberration — split RGB channels at the wavefront
    float aberration = waveFront * 0.025;
    float rDist = length(uv - center + float2(aberration, 0.0));
    float gDist = dist;
    float bDist = length(uv - center - float2(aberration, 0.0));

    float rWave = smoothstep(waveWidth, 0.0, abs(rDist - waveR));
    float gWave = waveFront;
    float bWave = smoothstep(waveWidth, 0.0, abs(bDist - waveR));

    // Liquid fire noise along the wavefront
    float angle = atan(uv.y - center.y, uv.x - center.x);
    float fireNoise = noise(float2(angle * 8.0 + iTime * 3.0, dist * 12.0));
    float fire = fireNoise * waveFront * 0.7;

    // Secondary ripples (echo waves)
    float echo1 = smoothstep(0.02, 0.0, abs(dist - waveR * 0.7)) * (1.0 - iWave) * 0.4;
    float echo2 = smoothstep(0.015, 0.0, abs(dist - waveR * 0.4)) * (1.0 - iWave) * 0.2;

    // Nuclear Magenta (#FF007A) + Electric Cyan (#00F0FF) + Emerald (#00FFA3)
    half3 col = half3(0.0);
    col.r += half(rWave * 1.0 + fire * 0.8 + trail * 0.3);   // magenta channel
    col.g += half(gWave * 0.2 + fire * 0.4 + trail * 0.8);   // cyan green
    col.b += half(bWave * 0.9 + fire * 0.3 + trail * 1.0);   // cyan blue

    // Emerald spark flashes
    col.g += half((echo1 + echo2) * 1.0);
    col.b += half((echo1 + echo2) * 0.6);

    // Hot white core
    float coreFlash = exp(-dist * 12.0) * max(0.0, 1.0 - iWave * 3.0);
    col += half3(coreFlash);

    float alpha = clamp(
      waveFront + trail * 0.6 + fire + echo1 + echo2 + coreFlash,
      0.0, 1.0
    );

    return half4(col, half(alpha));
  }
`)!;

/**
 * Phase 3: Neural Tracing — Volumetric lattice filaments with data particles
 * Glowing neon filaments that "cling" to the object contour.
 */
const NEURAL_TRACE_SHADER = Skia.RuntimeEffect.Make(`
  uniform float2 iResolution;
  uniform float  iTime;
  uniform float  iTrace;       // 0→1 trace completion
  uniform float2 iCenter;      // center of the traced object (pixel coords)

  float hash(float2 p) {
    return fract(sin(dot(p, float2(41.1, 289.7))) * 45678.5453);
  }

  // Grid-based lattice pattern
  float lattice(float2 p, float scale) {
    float2 g = fract(p * scale) - 0.5;
    float2 id = floor(p * scale);
    float d = min(abs(g.x), abs(g.y));
    float h = hash(id);
    float active = step(h, iTrace);
    return smoothstep(0.02, 0.0, d) * active;
  }

  // Data particle stream along lattice lines
  float particles(float2 p, float scale) {
    float2 g = fract(p * scale);
    float2 id = floor(p * scale);
    float h = hash(id + 0.5);
    // Particle position travels along grid edge
    float t = fract(iTime * (1.5 + h * 2.0) + h * 6.28);
    float2 particlePos = float2(t, 0.5);
    if (h > 0.5) particlePos = float2(0.5, t);
    float d = length(g - particlePos);
    float active = step(h * 0.8, iTrace);
    return smoothstep(0.04, 0.0, d) * active;
  }

  half4 main(float2 fragCoord) {
    float2 uv = fragCoord / iResolution;
    float2 center = iCenter / iResolution;
    float2 delta = uv - center;
    float dist = length(delta);

    // Trace reveal mask — expands outward from center
    float revealR = iTrace * 0.7;
    float reveal = smoothstep(revealR + 0.05, revealR - 0.02, dist);

    // Volumetric lattice (two scales for depth)
    float latt1 = lattice(uv + float2(iTime * 0.02, 0.0), 18.0) * reveal;
    float latt2 = lattice(uv - float2(0.0, iTime * 0.015), 12.0) * reveal * 0.5;

    // Data particles streaming along filaments
    float parts = particles(uv, 18.0) * reveal;

    // Flicker effect — random high-velocity jitter
    float flicker = hash(floor(uv * 40.0) + floor(float2(iTime * 20.0, 0.0)));
    float flickerMask = step(0.92, flicker) * reveal * iTrace;

    // Object contour glow (approximated as ellipse)
    float contourDist = length(delta * float2(1.0, 1.4));
    float contourGlow = smoothstep(0.22, 0.18, contourDist) *
                        smoothstep(0.12, 0.18, contourDist) *
                        iTrace;

    // Edge scan line sweeping
    float scanY = fract(iTime * 0.4);
    float scanLine = smoothstep(0.003, 0.0, abs(uv.y - scanY)) * reveal * 0.6;

    // Colors: Electric Cyan filaments, Emerald particles, Magenta flicker
    half3 cyan    = half3(0.0, 0.941, 1.0);
    half3 emerald = half3(0.0, 1.0, 0.639);
    half3 magenta = half3(1.0, 0.0, 0.478);
    half3 white   = half3(1.0, 1.0, 1.0);

    half3 col = half3(0.0);
    col += cyan    * half(latt1 * 0.8);
    col += cyan    * half(latt2 * 0.4);
    col += emerald * half(parts * 1.2);
    col += magenta * half(flickerMask * 0.9);
    col += cyan    * half(contourGlow * 0.5);
    col += white   * half(scanLine);

    float alpha = clamp(
      latt1 * 0.8 + latt2 * 0.4 + parts + flickerMask + contourGlow * 0.5 + scanLine,
      0.0, 1.0
    );

    return half4(col, half(alpha));
  }
`)!;

/**
 * Phase 4: Reality Bloom — Spatial Z-axis data reveal
 * Energy radiates outward as market data "explodes" into view.
 */
const BLOOM_SHADER = Skia.RuntimeEffect.Make(`
  uniform float2 iResolution;
  uniform float  iTime;
  uniform float  iBloom;       // 0→1 bloom expansion
  uniform float2 iCenter;

  float hash(float2 p) {
    return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453);
  }

  half4 main(float2 fragCoord) {
    float2 uv = fragCoord / iResolution;
    float2 center = iCenter / iResolution;
    float2 delta = uv - center;
    float dist = length(delta);
    float angle = atan(delta.y, delta.x);

    // Radial light rays expanding from behind the object
    float rays = 0.0;
    for (int i = 0; i < 12; i++) {
      float rayAngle = float(i) * 3.14159 / 6.0;
      float rayDelta = abs(mod(angle - rayAngle + 3.14159, 6.28318) - 3.14159);
      float ray = smoothstep(0.15, 0.0, rayDelta) *
                  smoothstep(0.0, 0.3, dist) *
                  smoothstep(0.8, 0.3, dist) *
                  iBloom;
      rays += ray;
    }

    // Bloom ring expanding outward
    float bloomR = iBloom * 0.5;
    float bloomRing = smoothstep(0.03, 0.0, abs(dist - bloomR)) * iBloom;

    // Sparkle particles
    float sparkle = 0.0;
    for (int i = 0; i < 20; i++) {
      float fi = float(i);
      float a = fi * 0.618033 * 6.28318;
      float r = 0.05 + fi * 0.035 * iBloom;
      float2 sparkPos = center + float2(cos(a + iTime), sin(a + iTime * 0.8)) * r;
      float d = length(uv - sparkPos);
      float brightness = smoothstep(0.008, 0.0, d) * iBloom;
      float twinkle = 0.5 + 0.5 * sin(iTime * 8.0 + fi * 2.0);
      sparkle += brightness * twinkle;
    }

    // Central energy pulse
    float pulse = exp(-dist * 6.0) * (0.3 + 0.15 * sin(iTime * 4.0)) * iBloom;

    // Ambient glow
    float ambient = exp(-dist * 2.0) * iBloom * 0.15;

    // Colors: warm white rays, cyan ring, emerald sparkles
    half3 warmWhite = half3(1.0, 0.98, 0.94);
    half3 cyan      = half3(0.0, 0.941, 1.0);
    half3 emerald   = half3(0.0, 1.0, 0.639);

    half3 col = half3(0.0);
    col += warmWhite * half(rays * 0.4);
    col += cyan      * half(bloomRing * 0.8);
    col += emerald   * half(sparkle);
    col += warmWhite * half(pulse);
    col += cyan      * half(ambient);

    float alpha = clamp(
      rays * 0.4 + bloomRing + sparkle + pulse + ambient,
      0.0, 1.0
    );

    return half4(col, half(alpha));
  }
`)!;

// ─── COMPONENT ──────────────────────────────────────────────────────────────

export const SingularitySnap = React.memo(function SingularitySnap({
  phase,
  price,
  itemName,
  verdict,
  trend,
  scarcity,
  onComplete,
  touchOrigin,
}: SingularitySnapProps) {
  const { width: W, height: H } = useWindowDimensions();
  const originX = (touchOrigin?.x ?? 0.5) * W;
  const originY = (touchOrigin?.y ?? 0.5) * H;

  // ── Phase timeline shared values ─────────────────────────────────────────
  const masterTime = useSharedValue(0);
  const implosionT = useSharedValue(0);
  const supernovaT = useSharedValue(0);
  const traceT = useSharedValue(0);
  const bloomT = useSharedValue(0);
  const overlayOpacity = useSharedValue(0);
  const dataCardsY = useSharedValue(60);
  const dataCardsOpacity = useSharedValue(0);
  const dataCardsScale = useSharedValue(0.85);
  const priceRevealed = useSharedValue(false);

  // Neural hum haptic interval
  const neuralHumRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completeFired = useRef(false);

  // ── Master clock for shader iTime ────────────────────────────────────────
  useEffect(() => {
    masterTime.value = 0;
    masterTime.value = withRepeat(
      withTiming(1000, { duration: 1000000, easing: Easing.linear }),
      -1,
      false
    );
    return () => cancelAnimation(masterTime);
  }, []);

  // ── Fire complete callback ───────────────────────────────────────────────
  const fireComplete = useCallback(() => {
    if (!completeFired.current) {
      completeFired.current = true;
      onComplete?.();
    }
  }, [onComplete]);

  // ── Phase sequencer ──────────────────────────────────────────────────────
  useEffect(() => {
    // Clean up neural hum on unmount or phase change
    if (neuralHumRef.current) {
      clearInterval(neuralHumRef.current);
      neuralHumRef.current = null;
    }
    completeFired.current = false;

    if (phase === "idle") {
      overlayOpacity.value = withTiming(0, { duration: 200 });
      implosionT.value = 0;
      supernovaT.value = 0;
      traceT.value = 0;
      bloomT.value = 0;
      dataCardsOpacity.value = 0;
      dataCardsY.value = 60;
      dataCardsScale.value = 0.85;
      return;
    }

    if (phase === "implosion") {
      // Phase 1: Kinetic Implosion
      overlayOpacity.value = withTiming(1, { duration: 120 });
      Feedback.singularityTouch();
      implosionT.value = 0;
      implosionT.value = withSpring(1, MO.spring.implosion);
    }

    if (phase === "supernova") {
      // Phase 2: Chromatic Supernova
      Feedback.singularitySnap();
      implosionT.value = withTiming(0, { duration: 200 });
      supernovaT.value = 0;
      supernovaT.value = withTiming(1, {
        duration: MO.dur.supernova,
        easing: panthere,
      });
    }

    if (phase === "tracing") {
      // Phase 3: Neural Tracing
      supernovaT.value = withTiming(0, { duration: 300 });
      traceT.value = 0;
      traceT.value = withTiming(1, {
        duration: MO.dur.neuralTrace,
        easing: Easing.inOut(Easing.cubic),
      });
      // Neural hum haptic — repeating soft ticks every 220ms
      neuralHumRef.current = setInterval(() => {
        Feedback.neuralHum();
      }, 220);
    }

    if (phase === "bloom") {
      // Phase 4: Reality Bloom
      if (neuralHumRef.current) {
        clearInterval(neuralHumRef.current);
        neuralHumRef.current = null;
      }
      Feedback.realityBloom();
      traceT.value = withTiming(0, { duration: 400 });
      bloomT.value = 0;
      bloomT.value = withSpring(1, MO.spring.bloom);

      // Data cards fly in with parallax
      dataCardsY.value = withDelay(
        300,
        withSpring(0, { damping: 22, stiffness: 180, mass: 1.0 })
      );
      dataCardsOpacity.value = withDelay(
        250,
        withTiming(1, { duration: 400, easing: panthere })
      );
      dataCardsScale.value = withDelay(
        300,
        withSpring(1, { damping: 20, stiffness: 200, mass: 0.9 })
      );

      // Trigger price slot machine
      priceRevealed.value = true;
    }

    if (phase === "complete") {
      // Fade everything out
      bloomT.value = withTiming(0, { duration: 600 });
      dataCardsOpacity.value = withDelay(200, withTiming(0, { duration: 400 }));
      overlayOpacity.value = withDelay(400, withTiming(0, { duration: 300 }));
      setTimeout(() => runOnJS(fireComplete)(), 900);
    }

    return () => {
      if (neuralHumRef.current) {
        clearInterval(neuralHumRef.current);
        neuralHumRef.current = null;
      }
    };
  }, [phase]);

  // ── Shader uniform derivations ───────────────────────────────────────────
  const gravityUniforms = useDerivedValue(() => ({
    iResolution: [W, H] as [number, number],
    iTime: masterTime.value,
    iIntensity: implosionT.value,
    iOrigin: [originX, originY] as [number, number],
  }));

  const supernovaUniforms = useDerivedValue(() => ({
    iResolution: [W, H] as [number, number],
    iTime: masterTime.value,
    iWave: supernovaT.value,
    iOrigin: [originX, originY] as [number, number],
  }));

  const traceUniforms = useDerivedValue(() => ({
    iResolution: [W, H] as [number, number],
    iTime: masterTime.value,
    iTrace: traceT.value,
    iCenter: [W / 2, H * 0.4] as [number, number],
  }));

  const bloomUniforms = useDerivedValue(() => ({
    iResolution: [W, H] as [number, number],
    iTime: masterTime.value,
    iBloom: bloomT.value,
    iCenter: [W / 2, H * 0.38] as [number, number],
  }));

  // ── Animated styles ──────────────────────────────────────────────────────
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const dataCardsStyle = useAnimatedStyle(() => ({
    opacity: dataCardsOpacity.value,
    transform: [
      { translateY: dataCardsY.value },
      { scale: dataCardsScale.value },
    ] as any,
  }));

  // ── Verdict color helper ─────────────────────────────────────────────────
  const verdictColor = useMemo(() => {
    const v = (verdict || "").toUpperCase();
    if (v.includes("GREAT") || v.includes("FLIP")) return C.emeraldSpark;
    if (v.includes("GOOD")) return C.singularityWhite;
    if (v.includes("MEH")) return C.warn;
    if (v.includes("RISKY")) return C.danger;
    return C.electricCyan;
  }, [verdict]);

  if (phase === "idle") return null;

  return (
    <Reanimated.View
      style={[styles.overlay, overlayStyle]}
      pointerEvents={phase === "complete" ? "none" : "box-none"}
    >
      {/* ── GPU SHADER CANVAS ──────────────────────────────────────────── */}
      <Canvas style={StyleSheet.absoluteFillObject}>
        {/* Deep Space Violet base */}
        <Rect x={0} y={0} width={W} height={H} color={C.deepSpaceViolet} opacity={0.85} />

        {/* Phase 1: Gravity Well */}
        {GRAVITY_WELL_SHADER ? (
          <Fill>
            <Shader source={GRAVITY_WELL_SHADER} uniforms={gravityUniforms} />
          </Fill>
        ) : null}

        {/* Phase 2: Chromatic Supernova */}
        {SUPERNOVA_SHADER ? (
          <Fill>
            <Shader source={SUPERNOVA_SHADER} uniforms={supernovaUniforms} />
          </Fill>
        ) : null}

        {/* Phase 3: Neural Trace */}
        {NEURAL_TRACE_SHADER ? (
          <Fill>
            <Shader source={NEURAL_TRACE_SHADER} uniforms={traceUniforms} />
          </Fill>
        ) : null}

        {/* Phase 4: Reality Bloom */}
        {BLOOM_SHADER ? (
          <Fill>
            <Shader source={BLOOM_SHADER} uniforms={bloomUniforms} />
          </Fill>
        ) : null}

        {/* Ambient vignette */}
        <Circle cx={W / 2} cy={H / 2} r={W * 0.9} color="rgba(0,0,0,0.4)">
          <BlurMask blur={100} style="normal" />
        </Circle>
      </Canvas>

      {/* ── PHASE 3: Trace status label ──────────────────────────────── */}
      {phase === "tracing" ? (
        <Reanimated.View style={[styles.traceLabel]}>
          <View style={styles.traceDot} />
          <Text style={styles.traceLabelText} allowFontScaling={false}>
            NEURAL TRACE ACTIVE
          </Text>
        </Reanimated.View>
      ) : null}

      {/* ── PHASE 4: Data Cards (Reality Bloom) ──────────────────────── */}
      {phase === "bloom" || phase === "complete" ? (
        <Reanimated.View style={[styles.dataCardsContainer, dataCardsStyle]}>
          {/* Item name */}
          {itemName ? (
            <Text style={styles.itemNameText} allowFontScaling={false} numberOfLines={2}>
              {itemName}
            </Text>
          ) : null}

          {/* Price — Slot Machine */}
          {price != null ? (
            <View style={styles.priceRow}>
              <PriceSlotMachine
                targetPrice={price}
                revealed={phase === "bloom" || phase === "complete"}
              />
            </View>
          ) : null}

          {/* Verdict / Trend / Scarcity pills */}
          <View style={styles.pillRow}>
            {verdict ? (
              <View
                style={[
                  styles.dataPill,
                  { borderColor: verdictColor },
                ]}
              >
                <Text
                  style={[styles.dataPillText, { color: verdictColor }]}
                  allowFontScaling={false}
                >
                  {verdict}
                </Text>
              </View>
            ) : null}
            {trend ? (
              <View style={[styles.dataPill, { borderColor: C.electricCyan }]}>
                <Text
                  style={[styles.dataPillText, { color: C.electricCyan }]}
                  allowFontScaling={false}
                >
                  {trend}
                </Text>
              </View>
            ) : null}
            {scarcity ? (
              <View style={[styles.dataPill, { borderColor: C.nuclearMagenta }]}>
                <Text
                  style={[styles.dataPillText, { color: C.nuclearMagenta }]}
                  allowFontScaling={false}
                >
                  {scarcity}
                </Text>
              </View>
            ) : null}
          </View>
        </Reanimated.View>
      ) : null}
    </Reanimated.View>
  );
});

// ─── STYLES ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },

  // Phase 3: trace label
  traceLabel: {
    position: "absolute",
    top: 80,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,240,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(0,240,255,0.25)",
    borderRadius: R.pill,
    paddingHorizontal: SP.md,
    paddingVertical: SP.xs + 2,
  },
  traceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.electricCyan,
  },
  traceLabelText: {
    ...TY.cap,
    color: C.electricCyan,
    letterSpacing: 1.6,
  },

  // Phase 4: data cards
  dataCardsContainer: {
    position: "absolute",
    bottom: 120,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: SP.xl,
  },
  itemNameText: {
    ...TY.h1,
    color: C.text,
    textAlign: "center",
    marginBottom: SP.sm,
    textShadowColor: "rgba(0,240,255,0.3)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  priceRow: {
    marginBottom: SP.lg,
    alignItems: "center",
  },
  pillRow: {
    flexDirection: "row",
    gap: SP.sm,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  dataPill: {
    borderWidth: 1,
    borderRadius: R.pill,
    paddingHorizontal: SP.md,
    paddingVertical: SP.xs,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  dataPillText: {
    ...TY.cap,
    letterSpacing: 1.2,
  },
});
