/**
 * SpatialEngine — Persistent 3D void background for Evan AI.
 *
 * Architecture:
 *   Layer 0 (this):  R3F Canvas with PerspectiveCamera, lighting, and fog.
 *   Layer 1 (above): Existing RN UI with transparent backgrounds.
 *
 * The camera flies between 3D coordinates when tabs change.
 * frameloop="demand" ensures 0% GPU when the camera is static.
 * GSAP drives all camera transitions with the Panthere curve.
 */
import React, { useRef, useState, useCallback, useImperativeHandle, forwardRef, useMemo, Component } from "react";
import { StyleSheet, Platform, View } from "react-native";
import { Canvas, useThree } from "@react-three/fiber/native";
import * as THREE from "three";
import gsap from "gsap";

// ─── ZONE COORDINATES ────────────────────────────────────────────────────────
// Each "tab" lives at a specific position in the 3D void.
// The camera flies to these coordinates on tab change.
const ZONES = {
  camera:    { pos: [0, 0, 5],    look: [0, 0, 0]    },
  results:   { pos: [12, 0, 5],   look: [12, 0, 0]   },
  history:   { pos: [0, -10, 5],  look: [0, -10, 0]  },
  watchlist: { pos: [-12, 0, 5],  look: [-12, 0, 0]  },
  profile:   { pos: [0, 10, 5],   look: [0, 10, 0]   },
} as const;

type ZoneKey = keyof typeof ZONES;

// ─── PANTHERE EASING ─────────────────────────────────────────────────────────
// Matches DS.ts EASE_PANTHERE [0.33, 1, 0.68, 1]
// Heavy, cinematic, vacuum-sealed.
// GSAP doesn't support CSS cubic-bezier() — we use a cubic bezier sampler.
const TRANSITION_DURATION = 1.2; // seconds

function cubicBezier(p1x: number, p1y: number, p2x: number, p2y: number) {
  // Attempt Newton-Raphson to solve parametric cubic bezier (same math as CSS)
  // Given input progress `t` (the x-axis), find parameter `s`, then evaluate y.
  const sampleX = (s: number) =>
    3 * p1x * (1 - s) * (1 - s) * s + 3 * p2x * (1 - s) * s * s + s * s * s;
  const sampleY = (s: number) =>
    3 * p1y * (1 - s) * (1 - s) * s + 3 * p2y * (1 - s) * s * s + s * s * s;
  const sampleDx = (s: number) =>
    3 * p1x * (1 - s) * (1 - 3 * s) + 6 * p2x * s * (1 - s) + 3 * s * s * (1 - p2x);

  return (t: number): number => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    // Newton-Raphson: solve sampleX(s) = t for s
    let s = t;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(s) - t;
      if (Math.abs(err) < 1e-6) break;
      const d = sampleDx(s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    // Clamp to [0,1] for safety
    s = Math.max(0, Math.min(1, s));
    return sampleY(s);
  };
}

const panthereFn = cubicBezier(0.33, 1, 0.68, 1);
const PANTHERE_EASE = { ease: (t: number) => panthereFn(t) };

// ─── LIGHT CONFIG ────────────────────────────────────────────────────────────
const ZONE_LIGHTS: Record<ZoneKey, { intensity: number; penumbra: number; color: string; angle: number }> = {
  camera:    { intensity: 2.5, penumbra: 0.9,  color: "#ffffff", angle: Math.PI / 5 },
  results:   { intensity: 3.0, penumbra: 0.85, color: "#f0f0ff", angle: Math.PI / 4 },
  history:   { intensity: 1.5, penumbra: 0.95, color: "#e8e8f0", angle: Math.PI / 6 },
  watchlist: { intensity: 2.0, penumbra: 0.9,  color: "#fff0f0", angle: Math.PI / 5 },
  profile:   { intensity: 1.8, penumbra: 0.92, color: "#f0f0f0", angle: Math.PI / 5 },
};

// ─── CAMERA RIG ──────────────────────────────────────────────────────────────
// Manages the PerspectiveCamera and GSAP transitions.

interface CameraRigProps {
  zone: ZoneKey;
  onTransitionStart?: () => void;
  onTransitionEnd?: () => void;
}

function CameraRig({ zone, onTransitionStart, onTransitionEnd }: CameraRigProps) {
  const { camera, invalidate } = useThree();
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const lookTargetRef = useRef(new THREE.Vector3(...ZONES.camera.look));
  const isFirstRender = useRef(true);
  const currentZone = useRef<ZoneKey>("camera");

  // Animate camera to zone
  const flyTo = useCallback((targetZone: ZoneKey) => {
    if (targetZone === currentZone.current && !isFirstRender.current) return;
    currentZone.current = targetZone;

    const target = ZONES[targetZone];
    if (!target) return;

    // Kill any in-progress tween
    if (tweenRef.current) {
      tweenRef.current.kill();
    }

    if (isFirstRender.current) {
      // Snap on first render — no animation
      camera.position.set(...(target.pos as [number, number, number]));
      lookTargetRef.current.set(...(target.look as [number, number, number]));
      camera.lookAt(lookTargetRef.current);
      isFirstRender.current = false;
      invalidate();
      return;
    }

    onTransitionStart?.();

    // GSAP animation object — we animate a proxy and apply per-frame
    const proxy = {
      px: camera.position.x,
      py: camera.position.y,
      pz: camera.position.z,
      lx: lookTargetRef.current.x,
      ly: lookTargetRef.current.y,
      lz: lookTargetRef.current.z,
    };

    tweenRef.current = gsap.to(proxy, {
      px: target.pos[0],
      py: target.pos[1],
      pz: target.pos[2],
      lx: target.look[0],
      ly: target.look[1],
      lz: target.look[2],
      duration: TRANSITION_DURATION,
      ...PANTHERE_EASE,
      onUpdate: () => {
        camera.position.set(proxy.px, proxy.py, proxy.pz);
        lookTargetRef.current.set(proxy.lx, proxy.ly, proxy.lz);
        camera.lookAt(lookTargetRef.current);
        invalidate(); // Request a frame (works with frameloop="demand")
      },
      onComplete: () => {
        tweenRef.current = null;
        onTransitionEnd?.();
      },
    });
  }, [camera, invalidate, onTransitionStart, onTransitionEnd]);

  // React to zone changes
  React.useEffect(() => {
    flyTo(zone);
  }, [zone, flyTo]);

  return null;
}

// ─── APERTURE LIGHT ──────────────────────────────────────────────────────────
// A dramatic pool of light at each zone — the "scanning void" effect.

function ApertureLight({ zone }: { zone: ZoneKey }) {
  const spotRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef(new THREE.Object3D());
  const config = ZONE_LIGHTS[zone];

  React.useEffect(() => {
    if (!spotRef.current) return;
    const zonePos = ZONES[zone];
    // Light points down from above toward the zone center
    spotRef.current.position.set(zonePos.pos[0], zonePos.pos[1] + 8, zonePos.pos[2] + 2);
    targetRef.current.position.set(...(zonePos.look as [number, number, number]));
    spotRef.current.target = targetRef.current;
  }, [zone]);

  return (
    <>
      <spotLight
        ref={spotRef}
        intensity={config.intensity}
        penumbra={config.penumbra}
        color={config.color}
        angle={config.angle}
        distance={30}
        castShadow={false}
        decay={2}
      />
      <primitive object={targetRef.current} />
    </>
  );
}

// ─── ZONE GROUND PLANES ─────────────────────────────────────────────────────
// Subtle ground planes at each zone to catch light and create depth.

function ZoneGroundPlanes() {
  const planes = useMemo(() => {
    return (Object.keys(ZONES) as ZoneKey[]).map((key) => {
      const z = ZONES[key];
      return (
        <mesh
          key={key}
          position={[z.look[0], z.look[1] - 3, z.look[2]]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow={false}
        >
          <planeGeometry args={[20, 20]} />
          <meshStandardMaterial
            color="#080808"
            transparent
            opacity={0.3}
            roughness={0.95}
            metalness={0.05}
          />
        </mesh>
      );
    });
  }, []);

  return <>{planes}</>;
}

// ─── AMBIENT PARTICLES (minimal) ────────────────────────────────────────────
// Extremely sparse, slow-drifting dust motes for depth perception.
// NOT a particle system — just a few static points.

function DepthMotes() {
  const geo = useMemo(() => {
    const count = 40;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 50;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 40;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 20;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
    return g;
  }, []);

  return (
    <points geometry={geo}>
      <pointsMaterial
        size={0.04}
        color="#ffffff"
        transparent
        opacity={0.15}
        sizeAttenuation
      />
    </points>
  );
}

// ─── PUBLIC API ──────────────────────────────────────────────────────────────

export interface SpatialEngineHandle {
  flyToZone: (zone: ZoneKey) => void;
}

export interface SpatialEngineProps {
  /** Current tab — drives camera position */
  zone: ZoneKey;
  /** Called when camera starts moving */
  onTransitionStart?: () => void;
  /** Called when camera arrives at destination */
  onTransitionEnd?: () => void;
}

const SpatialEngineCore = forwardRef<SpatialEngineHandle, SpatialEngineProps>(
  function SpatialEngineCore({ zone: zoneProp, onTransitionStart, onTransitionEnd }, ref) {
    const [overrideZone, setOverrideZone] = useState<ZoneKey | null>(null);
    const zone = overrideZone ?? zoneProp;

    // Clear override when the prop catches up
    const zoneRef = useRef(zone);
    zoneRef.current = zone;
    React.useEffect(() => { setOverrideZone(null); }, [zoneProp]);

    useImperativeHandle(ref, () => ({
      flyToZone: (z: ZoneKey) => {
        setOverrideZone(z);
      },
    }), []);

    return (
      <Canvas
        frameloop="demand"
        style={styles.canvas}
        gl={{
          antialias: false, // save GPU on mobile
          alpha: true,      // transparent so void shows as pure black
          powerPreference: "low-power",
          preserveDrawingBuffer: false,
        }}
        camera={{
          fov: 50,
          near: 0.1,
          far: 100,
          position: [...ZONES.camera.pos] as [number, number, number],
        }}
      >
        {/* Void: pure black fog */}
        <fog attach="fog" args={["#000000", 8, 35]} />
        <color attach="background" args={["#000000"]} />

        {/* Ambient base — extremely low, just enough to hint at depth */}
        <ambientLight intensity={0.08} color="#ffffff" />

        {/* Camera rig — GSAP-driven */}
        <CameraRig
          zone={zone}
          onTransitionStart={onTransitionStart}
          onTransitionEnd={onTransitionEnd}
        />

        {/* Dramatic aperture light per zone */}
        <ApertureLight zone={zone} />

        {/* Subtle ground planes for light to catch */}
        <ZoneGroundPlanes />

        {/* Minimal depth motes — not particles, just static points */}
        <DepthMotes />
      </Canvas>
    );
  }
);

// ─── ERROR BOUNDARY ──────────────────────────────────────────────────────────
// If expo-gl or three fails to init, silently degrade to plain black background.

class SpatialErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    if (__DEV__) console.warn("[SpatialEngine] GL init failed, falling back:", error.message);
  }
  render() {
    if (this.state.hasError) {
      return <View style={[styles.canvas, { backgroundColor: "#000" }]} />;
    }
    return this.props.children;
  }
}

// Wrap the exported component with error boundary
export const SpatialEngine = forwardRef<SpatialEngineHandle, SpatialEngineProps>(
  function SpatialEngine(props, ref) {
    return (
      <SpatialErrorBoundary>
        <SpatialEngineCore {...props} ref={ref} />
      </SpatialErrorBoundary>
    );
  }
);

const styles = StyleSheet.create({
  canvas: {
    ...StyleSheet.absoluteFillObject,
  },
});

export { ZONES, type ZoneKey };
