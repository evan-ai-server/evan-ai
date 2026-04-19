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
 *
 * Spatial FX (all rendered in this Canvas — zero overlay shimmer):
 *   - HyperWarp:    600 white "worm" lines flying past camera (survey completion)
 *   - VerdictLight: Emerald ambient (BUY) / spotlight (PASS)
 *   - NeonLaser:    Horizontal neon scan line sweeping vertically
 *   - ObsidianWarp: Dramatic z-punch in CameraRig on verdict reveal
 */
import React, { Suspense, useRef, useState, useCallback, useImperativeHandle, forwardRef, useMemo, useEffect, Component } from "react";
import { StyleSheet, Platform, View } from "react-native";
import { Canvas, useThree } from "@react-three/fiber/native";
import * as THREE from "three";
import gsap from "gsap";
import * as Haptics from "expo-haptics";
import { Text as DreiText } from "@react-three/drei";
import type { VerdictMode } from "./SpatialContext";

// ─── ZONE COORDINATES ────────────────────────────────────────────────────────
// Each "tab" lives at a specific position in the 3D void.
// The camera flies to these coordinates on tab change.
const ZONES = {
  camera:    { pos: [0, 0, 5],    look: [0, 0, 0]    },
  results:   { pos: [12, 0, 5],   look: [12, 0, 0]   },
  history:   { pos: [0, -10, 5],  look: [0, -10, 0]  },
  watchlist: { pos: [-12, 0, 5],  look: [-12, 0, 0]  },
  profile:   { pos: [0, 10, 5],   look: [0, 10, 0]   },
  archive:   { pos: [-40, 10, -50], look: [-38, 7, -54] },
  pulse:     { pos: [40, -5, -20],  look: [40, -8, -24] },
  forge:     { pos: [0, 20, -100],  look: [0, 17, -104] },
  well:      { pos: [-80, -10, -40], look: [-80, -13, -44] },
  shadow:   { pos: [80, 5, -60],    look: [80, 2, -64]   },
} as const;

type ZoneKey = keyof typeof ZONES;

// ─── PANTHERE EASING ─────────────────────────────────────────────────────────
// Matches DS.ts EASE_PANTHERE [0.33, 1, 0.68, 1]
// Heavy, cinematic, vacuum-sealed.
// GSAP doesn't support CSS cubic-bezier() — we use a cubic bezier sampler.
const TRANSITION_DURATION = 1.2; // seconds

function cubicBezier(p1x: number, p1y: number, p2x: number, p2y: number) {
  const sampleX = (s: number) =>
    3 * p1x * (1 - s) * (1 - s) * s + 3 * p2x * (1 - s) * s * s + s * s * s;
  const sampleY = (s: number) =>
    3 * p1y * (1 - s) * (1 - s) * s + 3 * p2y * (1 - s) * s * s + s * s * s;
  const sampleDx = (s: number) =>
    3 * p1x * (1 - s) * (1 - 3 * s) + 6 * p2x * s * (1 - s) + 3 * s * s * (1 - p2x);

  return (t: number): number => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let s = t;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(s) - t;
      if (Math.abs(err) < 1e-6) break;
      const d = sampleDx(s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    s = Math.max(0, Math.min(1, s));
    return sampleY(s);
  };
}

const panthereFn = cubicBezier(0.33, 1, 0.68, 1);
const PANTHERE_EASE = { ease: (t: number) => panthereFn(t) };

// Double-Panthere: even heavier ease-in-out for archive camera flights.
// cubic-bezier(0.22, 1, 0.78, 1) — longer plateau, more dramatic arrival.
const doublePanthereFn = cubicBezier(0.22, 1, 0.78, 1);
const DOUBLE_PANTHERE_EASE = { ease: (t: number) => doublePanthereFn(t) };

// Zone-specific transition overrides (duration + easing)
// Vault Ease: ultra-heavy symmetric in-out for the Shadow Market "vault door" feel.
const vaultFn = cubicBezier(0.76, 0, 0.24, 1);
const VAULT_EASE = { ease: (t: number) => vaultFn(t) };

const ZONE_TRANSITIONS: Partial<Record<ZoneKey, { duration: number; ease: typeof PANTHERE_EASE }>> = {
  archive: { duration: 2.0, ease: DOUBLE_PANTHERE_EASE },
  pulse:   { duration: 1.8, ease: DOUBLE_PANTHERE_EASE },
  forge:   { duration: 2.2, ease: DOUBLE_PANTHERE_EASE },
  well:    { duration: 2.4, ease: DOUBLE_PANTHERE_EASE },
  shadow:  { duration: 1.8, ease: VAULT_EASE },
};

// ─── LIGHT CONFIG ────────────────────────────────────────────────────────────
const ZONE_LIGHTS: Record<ZoneKey, { intensity: number; penumbra: number; color: string; angle: number }> = {
  camera:    { intensity: 2.5, penumbra: 0.9,  color: "#ffffff", angle: Math.PI / 5 },
  results:   { intensity: 3.0, penumbra: 0.85, color: "#f0f0ff", angle: Math.PI / 4 },
  history:   { intensity: 1.5, penumbra: 0.95, color: "#e8e8f0", angle: Math.PI / 6 },
  watchlist: { intensity: 2.0, penumbra: 0.9,  color: "#fff0f0", angle: Math.PI / 5 },
  profile:   { intensity: 1.8, penumbra: 0.92, color: "#f0f0f0", angle: Math.PI / 5 },
  archive:   { intensity: 1.2, penumbra: 0.95, color: "#d0d0e8", angle: Math.PI / 7 },
  pulse:     { intensity: 1.0, penumbra: 0.95, color: "#00ff88", angle: Math.PI / 6 },
  forge:     { intensity: 0, penumbra: 0, color: "#000000", angle: 0 },
  well:      { intensity: 0, penumbra: 0, color: "#000000", angle: 0 },
  shadow:    { intensity: 0, penumbra: 0, color: "#000000", angle: 0 },
};

// ─── CORKSCREW HELPERS (Well dive) ──────────────────────────────────────
const _corkDir = new THREE.Vector3();
const _corkUp = new THREE.Vector3();

// ─── CAMERA RIG ──────────────────────────────────────────────────────────────
// Manages the PerspectiveCamera, GSAP transitions, and Obsidian Warp.

interface CameraRigProps {
  zone: ZoneKey;
  verdict?: VerdictMode;
  onTransitionStart?: () => void;
  onTransitionEnd?: () => void;
}

function CameraRig({ zone, verdict, onTransitionStart, onTransitionEnd }: CameraRigProps) {
  const { camera, invalidate } = useThree();
  const tweenRef = useRef<gsap.core.Tween | gsap.core.Timeline | null>(null);
  const lookTargetRef = useRef(new THREE.Vector3(...ZONES.camera.look));
  const isFirstRender = useRef(true);
  const currentZone = useRef<ZoneKey>("camera");
  const lastVerdict = useRef<VerdictMode>(null);

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
    const isCorkscrew = targetZone === "well";
    const proxy = {
      px: camera.position.x,
      py: camera.position.y,
      pz: camera.position.z,
      lx: lookTargetRef.current.x,
      ly: lookTargetRef.current.y,
      lz: lookTargetRef.current.z,
      roll: 0,
    };

    const zoneTransition = ZONE_TRANSITIONS[targetZone];
    const duration = zoneTransition?.duration ?? TRANSITION_DURATION;
    const easeObj = zoneTransition?.ease ?? PANTHERE_EASE;

    tweenRef.current = gsap.to(proxy, {
      px: target.pos[0],
      py: target.pos[1],
      pz: target.pos[2],
      lx: target.look[0],
      ly: target.look[1],
      lz: target.look[2],
      roll: isCorkscrew ? Math.PI * 2 : 0,
      duration,
      ...easeObj,
      onUpdate: () => {
        camera.position.set(proxy.px, proxy.py, proxy.pz);
        lookTargetRef.current.set(proxy.lx, proxy.ly, proxy.lz);
        // Z-Axis Corkscrew: rotate the up vector around the view direction
        if (isCorkscrew && proxy.roll > 0.001) {
          _corkDir.subVectors(lookTargetRef.current, camera.position).normalize();
          _corkUp.set(0, 1, 0).applyAxisAngle(_corkDir, proxy.roll);
          camera.up.copy(_corkUp);
        } else {
          camera.up.set(0, 1, 0);
        }
        camera.lookAt(lookTargetRef.current);
        invalidate();
      },
      onComplete: () => {
        camera.up.set(0, 1, 0);
        camera.lookAt(lookTargetRef.current);
        tweenRef.current = null;
        onTransitionEnd?.();
      },
    });

    // Vault Door haptic — heavy thud at the midpoint of Shadow Market flights
    if (targetZone === "shadow") {
      gsap.delayedCall(duration / 2, () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      });
    }
  }, [camera, invalidate, onTransitionStart, onTransitionEnd]);

  // React to zone changes
  useEffect(() => {
    flyTo(zone);
  }, [zone, flyTo]);

  // ── OBSIDIAN WARP ─────────────────────────────────────────────────────────
  // When verdict changes from null → "buy"/"pass" at the results zone,
  // punch camera z: 5 → -55 → 5 for a dramatic depth warp.
  useEffect(() => {
    if (!verdict || verdict === lastVerdict.current) return;
    lastVerdict.current = verdict;

    // Only warp when camera is at rest at results zone
    if (currentZone.current !== "results") return;
    if (tweenRef.current) return; // camera still moving — skip

    const target = ZONES.results;
    const proxy = { pz: camera.position.z };

    tweenRef.current = gsap.timeline()
      .to(proxy, {
        pz: -55,
        duration: 0.5,
        ease: "power4.in",
        onUpdate: () => {
          camera.position.z = proxy.pz;
          camera.lookAt(lookTargetRef.current);
          invalidate();
        },
      })
      .to(proxy, {
        pz: target.pos[2],
        duration: 0.9,
        ...PANTHERE_EASE,
        onUpdate: () => {
          camera.position.z = proxy.pz;
          camera.lookAt(lookTargetRef.current);
          invalidate();
        },
        onComplete: () => {
          tweenRef.current = null;
        },
      });
  }, [verdict, camera, invalidate]);

  // Reset verdict tracking when zone leaves results
  useEffect(() => {
    if (zone !== "results") {
      lastVerdict.current = null;
    }
  }, [zone]);

  return null;
}

// ─── APERTURE LIGHT ──────────────────────────────────────────────────────────
// A dramatic pool of light at each zone — the "scanning void" effect.

function ApertureLight({ zone }: { zone: ZoneKey }) {
  const spotRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef(new THREE.Object3D());
  const config = ZONE_LIGHTS[zone];

  useEffect(() => {
    if (!spotRef.current) return;
    const zonePos = ZONES[zone];
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

// ─── VERDICT LIGHT ──────────────────────────────────────────────────────────
// Dynamic lighting that responds to Buy/Pass verdict at the results zone.
//   BUY:  Deep emerald ambient (#06402B) floods the void.
//   PASS: Kill ambient, single high-intensity white spotlight on data.

function VerdictLight({ verdict, zone }: { verdict: VerdictMode; zone: ZoneKey }) {
  const { invalidate } = useThree();
  const emeraldRef = useRef<THREE.AmbientLight>(null);
  const spotRef = useRef<THREE.SpotLight>(null);
  const targetObj = useRef(new THREE.Object3D());
  const tweenRef = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    if (zone !== "results") {
      // Reset when leaving results
      if (emeraldRef.current) emeraldRef.current.intensity = 0;
      if (spotRef.current) spotRef.current.intensity = 0;
      if (tweenRef.current) tweenRef.current.kill();
      tweenRef.current = null;
      invalidate();
      return;
    }

    if (!verdict) {
      // No verdict yet — keep dark
      if (tweenRef.current) tweenRef.current.kill();
      const proxy = {
        emerald: emeraldRef.current?.intensity ?? 0,
        spot: spotRef.current?.intensity ?? 0,
      };
      tweenRef.current = gsap.timeline().to(proxy, {
        emerald: 0,
        spot: 0,
        duration: 0.4,
        ...PANTHERE_EASE,
        onUpdate: () => {
          if (emeraldRef.current) emeraldRef.current.intensity = proxy.emerald;
          if (spotRef.current) spotRef.current.intensity = proxy.spot;
          invalidate();
        },
        onComplete: () => { tweenRef.current = null; },
      });
      return;
    }

    if (tweenRef.current) tweenRef.current.kill();

    const isBuy = verdict === "buy";
    const proxy = {
      emerald: emeraldRef.current?.intensity ?? 0,
      spot: spotRef.current?.intensity ?? 0,
    };

    tweenRef.current = gsap.timeline().to(proxy, {
      emerald: isBuy ? 0.5 : 0,
      spot: isBuy ? 0 : 80,
      duration: 0.8,
      ...PANTHERE_EASE,
      onUpdate: () => {
        if (emeraldRef.current) emeraldRef.current.intensity = proxy.emerald;
        if (spotRef.current) spotRef.current.intensity = proxy.spot;
        invalidate();
      },
      onComplete: () => { tweenRef.current = null; },
    });
  }, [verdict, zone, invalidate]);

  // Position the PASS spotlight above the results zone
  useEffect(() => {
    const rz = ZONES.results;
    targetObj.current.position.set(rz.look[0], rz.look[1], rz.look[2]);
  }, []);

  return (
    <>
      {/* Emerald ambient — BUY floods the void with luxury green */}
      <ambientLight ref={emeraldRef} intensity={0} color="#06402B" />

      {/* PASS spotlight — kills everything except a single harsh beam on data */}
      <spotLight
        ref={spotRef}
        position={[ZONES.results.pos[0], ZONES.results.pos[1] + 10, ZONES.results.pos[2] + 3]}
        intensity={0}
        color="#ffffff"
        angle={Math.PI / 8}
        penumbra={0.3}
        distance={40}
        decay={1.5}
        castShadow={false}
      />
      <primitive object={targetObj.current} />
    </>
  );
}

// ─── HYPER WARP (WHITE WORMS) ───────────────────────────────────────────────
// 600 elongated white line segments fly past the camera on the Z-axis.
// Triggered on survey completion — reveals through the fading onboarding layer.

function HyperWarp({ active, onComplete }: { active: boolean; onComplete?: () => void }) {
  const { invalidate } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const matRef = useRef<THREE.LineBasicMaterial>(null);

  const geometry = useMemo(() => {
    const count = 600;
    const positions = new Float32Array(count * 6); // 2 vertices per line, 3 floats each

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.15 + Math.random() * 5.5;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const z = -(5 + Math.random() * 90); // distributed ahead of camera (negative Z)
      const tailLen = 0.8 + Math.random() * 3.5; // elongated worm length

      const idx = i * 6;
      positions[idx]     = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;       // head
      positions[idx + 3] = x;
      positions[idx + 4] = y;
      positions[idx + 5] = z - tailLen; // tail (further back)
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, []);

  useEffect(() => {
    if (!active || !groupRef.current) return;

    // Reset group position and material
    groupRef.current.position.z = 0;
    if (matRef.current) matRef.current.opacity = 0.75;

    const proxy = { z: 0, opacity: 0.75 };

    tweenRef.current = gsap.to(proxy, {
      z: 130, // fly all worms through and past camera
      opacity: 0,
      duration: 1.8,
      ease: "power4.in", // slow start → violent acceleration
      onUpdate: () => {
        if (groupRef.current) groupRef.current.position.z = proxy.z;
        if (matRef.current) matRef.current.opacity = proxy.opacity;
        invalidate();
      },
      onComplete: () => {
        tweenRef.current = null;
        onComplete?.();
      },
    });

    return () => {
      if (tweenRef.current) {
        tweenRef.current.kill();
        tweenRef.current = null;
      }
    };
  }, [active, invalidate, onComplete]);

  if (!active) return null;

  return (
    <group ref={groupRef}>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial ref={matRef} color="#ffffff" transparent opacity={0.75} />
      </lineSegments>
    </group>
  );
}

// ─── NEON LASER SCAN LINE ───────────────────────────────────────────────────
// Horizontal neon plane rendered in the same R3F context as the void.
// Sweeps vertically during the scan pipeline — zero overlay pixel shimmer.

function NeonLaser({ active, zone }: { active: boolean; zone: ZoneKey }) {
  const { invalidate } = useThree();
  const coreRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);

  // Position at the camera zone's look target
  const zonePos = ZONES[zone];

  useEffect(() => {
    if (!active || !coreRef.current) {
      if (tweenRef.current) {
        tweenRef.current.kill();
        tweenRef.current = null;
      }
      return;
    }

    const proxy = { y: 2.5 };
    coreRef.current.position.y = 2.5;
    if (glowRef.current) glowRef.current.position.y = 2.5;

    tweenRef.current = gsap.to(proxy, {
      y: -2.5,
      duration: 2.4,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
      onUpdate: () => {
        if (coreRef.current) coreRef.current.position.y = proxy.y;
        if (glowRef.current) glowRef.current.position.y = proxy.y;
        invalidate();
      },
    });

    return () => {
      if (tweenRef.current) {
        tweenRef.current.kill();
        tweenRef.current = null;
      }
    };
  }, [active, invalidate]);

  if (!active) return null;

  return (
    <group position={[zonePos.look[0], 0, zonePos.look[2] + 2]}>
      {/* Core — thin bright neon line */}
      <mesh ref={coreRef} position={[0, 0, 0]}>
        <planeGeometry args={[12, 0.015]} />
        <meshBasicMaterial color="#00ff88" transparent opacity={0.85} />
      </mesh>
      {/* Glow — wider soft halo behind the core */}
      <mesh ref={glowRef} position={[0, 0, -0.01]}>
        <planeGeometry args={[14, 0.12]} />
        <meshBasicMaterial color="#00ff88" transparent opacity={0.15} />
      </mesh>
    </group>
  );
}

// ─── ARCHIVE SHARDS ─────────────────────────────────────────────────────────
// "Floating Obsidian Shards" — scan history as a spiral staircase in the void.
// Glass material (meshPhysicalMaterial, transmission) with Drei/Text labels.
// Staggered Sine Ease reveal, Cold Shine spotlight, Inspection pipeline.

const MAX_ARCHIVE_SHARDS = 24;

export interface ArchiveItem {
  id: string;
  title: string;
}

export interface ForgeDataPoint {
  label: string;
  value: string;
  isHighValue?: boolean;
}

export interface ShadowDataItem {
  id: string;
  title: string;
  publicPrice: string;
  shadowPrice: string;
}

function ArchiveShards({
  items,
  revealed,
  onInspect,
}: {
  items: ArchiveItem[];
  revealed: boolean;
  onInspect?: (id: string) => void;
}) {
  const { invalidate } = useThree();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const inspectingRef = useRef(false);
  const shardGroupRefs = useRef<(THREE.Group | null)[]>([]);
  const shardMatRefs = useRef<(THREE.MeshPhysicalMaterial | null)[]>([]);
  const revealTweens = useRef<gsap.core.Tween[]>([]);
  const coldShineRef = useRef<THREE.SpotLight>(null);
  const coldShineTargetRef = useRef(new THREE.Object3D());
  const coldShineTween = useRef<gsap.core.Tween | null>(null);
  const inspectTl = useRef<gsap.core.Timeline | null>(null);
  const prevRevealed = useRef(false);

  const displayItems = useMemo(
    () => items.slice(0, MAX_ARCHIVE_SHARDS),
    [items],
  );

  // Spiral staircase positions — helix descending from center
  const shardData = useMemo(() => {
    const center = ZONES.archive.look as readonly [number, number, number];
    const radius = 3.5;
    const stepsPerRev = 8;
    const heightStep = 0.9;
    const totalHeight = displayItems.length * heightStep;

    return displayItems.map((item, i) => {
      const angle = i * ((2 * Math.PI) / stepsPerRev);
      return {
        ...item,
        position: [
          center[0] + radius * Math.cos(angle),
          center[1] + totalHeight / 2 - i * heightStep,
          center[2] + radius * Math.sin(angle),
        ] as [number, number, number],
        rotation: [0, -angle + Math.PI / 2, 0] as [number, number, number],
      };
    });
  }, [displayItems]);

  // Connector line geometry (BufferGeometry — zero allocations at runtime)
  const lineGeo = useMemo(() => {
    if (shardData.length < 2) return null;
    const arr = new Float32Array((shardData.length - 1) * 6);
    for (let i = 0; i < shardData.length - 1; i++) {
      const idx = i * 6;
      const a = shardData[i].position;
      const b = shardData[i + 1].position;
      arr[idx] = a[0]; arr[idx + 1] = a[1]; arr[idx + 2] = a[2];
      arr[idx + 3] = b[0]; arr[idx + 4] = b[1]; arr[idx + 5] = b[2];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
    return geo;
  }, [shardData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      revealTweens.current.forEach((t) => t.kill());
      if (coldShineTween.current) coldShineTween.current.kill();
      if (inspectTl.current) inspectTl.current.kill();
    };
  }, []);

  // ── Staggered Sine Ease Reveal ────────────────────────────────────────────
  useEffect(() => {
    if (revealed && !prevRevealed.current) {
      // Reset positions from any prior inspection animation
      shardGroupRefs.current.forEach((group, i) => {
        if (!group || !shardData[i]) return;
        group.position.set(...shardData[i].position);
      });

      // Staggered de-blur: opacity 0 → 0.92, sine ease, 0.05s stagger
      revealTweens.current.forEach((t) => t.kill());
      revealTweens.current = [];
      shardMatRefs.current.forEach((mat, i) => {
        if (!mat) return;
        mat.opacity = 0;
        const proxy = { opacity: 0 };
        const tw = gsap.to(proxy, {
          opacity: 0.92,
          duration: 1.2,
          delay: i * 0.05,
          ease: "sine.inOut",
          onUpdate: () => {
            if (mat) mat.opacity = proxy.opacity;
            invalidate();
          },
        });
        revealTweens.current.push(tw);
      });

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else if (!revealed && prevRevealed.current) {
      // Leaving archive — kill everything, reset state
      revealTweens.current.forEach((t) => t.kill());
      revealTweens.current = [];
      shardMatRefs.current.forEach((mat) => { if (mat) mat.opacity = 0; });
      setSelectedId(null);
      inspectingRef.current = false;
      if (inspectTl.current) { inspectTl.current.kill(); inspectTl.current = null; }
      if (coldShineTween.current) { coldShineTween.current.kill(); coldShineTween.current = null; }
      if (coldShineRef.current) coldShineRef.current.intensity = 0;
      invalidate();
    }
    prevRevealed.current = revealed;
  }, [revealed, shardData, invalidate]);

  // ── Cold Shine Spotlight ──────────────────────────────────────────────────
  // Ramps a 100-intensity white spotlight onto the selected shard.
  // All other shards dim. Deselect fades the light back to zero.
  useEffect(() => {
    if (!coldShineRef.current) return;
    if (coldShineTween.current) { coldShineTween.current.kill(); coldShineTween.current = null; }

    if (!selectedId) {
      // Fade spotlight out, restore all opacities
      const proxy = { intensity: coldShineRef.current.intensity };
      coldShineTween.current = gsap.to(proxy, {
        intensity: 0,
        duration: 0.4,
        ease: "sine.out",
        onUpdate: () => {
          if (coldShineRef.current) coldShineRef.current.intensity = proxy.intensity;
          shardMatRefs.current.forEach((mat) => {
            if (mat && mat.opacity > 0) mat.opacity = 0.92;
          });
          invalidate();
        },
        onComplete: () => { coldShineTween.current = null; },
      });
      return;
    }

    const idx = shardData.findIndex((s) => s.id === selectedId);
    if (idx < 0) return;

    // Aim spotlight at selected shard
    const pos = shardData[idx].position;
    coldShineTargetRef.current.position.set(pos[0], pos[1], pos[2]);
    if (coldShineRef.current) coldShineRef.current.target = coldShineTargetRef.current;

    const proxy = { t: 0 };
    coldShineTween.current = gsap.to(proxy, {
      t: 1,
      duration: 0.6,
      ease: "sine.inOut",
      onUpdate: () => {
        if (coldShineRef.current) coldShineRef.current.intensity = proxy.t * 100;
        // Dim unselected, brighten selected
        shardMatRefs.current.forEach((mat, i) => {
          if (!mat || mat.opacity <= 0) return;
          mat.opacity = i === idx ? 0.95 : 0.92 - proxy.t * 0.55;
        });
        invalidate();
      },
      onComplete: () => { coldShineTween.current = null; },
    });

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [selectedId, shardData, invalidate]);

  // ── Shard Click → Select or Inspect ───────────────────────────────────────
  const handleShardClick = useCallback(
    (id: string, index: number) => {
      if (inspectingRef.current || !revealed) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (selectedId === id) {
        // ── INSPECTION PIPELINE ─────────────────────────────────────────
        // 1. Selected shard flies toward camera (15 units)
        // 2. All other shards spiral away (opacity → 0)
        // 3. GSAP timeline — zero frame-skipping
        inspectingRef.current = true;
        if (inspectTl.current) inspectTl.current.kill();

        const tl = gsap.timeline({
          onComplete: () => {
            inspectingRef.current = false;
            onInspect?.(id);
          },
        });

        // Selected flies toward camera
        const selectedGroup = shardGroupRefs.current[index];
        if (selectedGroup) {
          const camPos = new THREE.Vector3(...(ZONES.archive.pos as [number, number, number]));
          const shardPos = new THREE.Vector3(...shardData[index].position);
          const dir = camPos.clone().sub(shardPos).normalize().multiplyScalar(15);

          tl.to(selectedGroup.position, {
            x: shardPos.x + dir.x,
            y: shardPos.y + dir.y,
            z: shardPos.z + dir.z,
            duration: 0.8,
            ...PANTHERE_EASE,
            onUpdate: () => { invalidate(); },
          }, 0);
        }

        // Others spiral away
        shardGroupRefs.current.forEach((group, i) => {
          if (i === index || !group) return;
          const mat = shardMatRefs.current[i];
          const spiralAngle = i * 0.8;

          tl.to(group.position, {
            y: group.position.y + Math.sin(spiralAngle) * 5,
            x: group.position.x + Math.cos(spiralAngle) * 4,
            duration: 0.7,
            ease: "power2.in",
            onUpdate: () => { invalidate(); },
          }, 0.05);

          if (mat) {
            tl.to(mat, {
              opacity: 0,
              duration: 0.5,
              ease: "sine.in",
              onUpdate: () => { invalidate(); },
            }, 0.05);
          }
        });

        // Cold Shine intensifies during inspection
        if (coldShineRef.current) {
          tl.to(coldShineRef.current, {
            intensity: 200,
            duration: 0.6,
            ease: "power2.in",
            onUpdate: () => { invalidate(); },
          }, 0);
        }

        inspectTl.current = tl;
      } else {
        // First tap → select (triggers Cold Shine)
        setSelectedId(id);
      }
    },
    [selectedId, shardData, revealed, invalidate, onInspect],
  );

  if (!displayItems.length) return null;

  return (
    <group>
      {/* Cold Shine Spotlight — tracks selected shard */}
      <spotLight
        ref={coldShineRef}
        position={[ZONES.archive.pos[0], ZONES.archive.pos[1] + 5, ZONES.archive.pos[2] + 3]}
        intensity={0}
        color="#ffffff"
        angle={Math.PI / 10}
        penumbra={0.4}
        distance={25}
        decay={1.5}
        castShadow={false}
      />
      <primitive object={coldShineTargetRef.current} />

      {/* Connector lines between shards */}
      {lineGeo && (
        <lineSegments geometry={lineGeo}>
          <lineBasicMaterial color="#ffffff" transparent opacity={0.06} />
        </lineSegments>
      )}

      {/* Obsidian Shards */}
      {shardData.map((shard, i) => (
        <group
          key={shard.id}
          ref={(el) => { shardGroupRefs.current[i] = el; }}
          position={shard.position}
          rotation={shard.rotation}
        >
          <mesh onClick={() => handleShardClick(shard.id, i)}>
            <boxGeometry args={[2.2, 1.3, 0.06]} />
            <meshPhysicalMaterial
              ref={(el) => { shardMatRefs.current[i] = el; }}
              color="#0a0a1a"
              transparent
              opacity={0}
              transmission={0.98}
              roughness={0.05}
              thickness={1}
              metalness={0.1}
            />
          </mesh>
          <Suspense fallback={null}>
            <DreiText
              position={[0, 0, 0.04]}
              fontSize={0.16}
              color="#ffffff"
              anchorX="center"
              anchorY="middle"
              maxWidth={1.9}
            >
              {shard.title || "Scan"}
            </DreiText>
          </Suspense>
        </group>
      ))}
    </group>
  );
}

// ─── MARKET PULSE ZONE ─────────────────────────────────────────────────────
// "Bloomberg Terminal" of the spatial era — reactive 3D bar charts,
// rotating category tickers, neon grid floor, market heartbeat breathing.
// Shared geometry, lean footprint, zero frame-skip.

const PULSE_CATEGORIES = [
  { name: "Vintage Tech", heat: 0.95 },
  { name: "Streetwear", heat: 0.82 },
  { name: "Rare Media", heat: 0.71 },
  { name: "Sneakers", heat: 0.65 },
  { name: "Collectibles", heat: 0.48 },
];

const PULSE_TICKERS = [
  "Vintage Tech", "Streetwear", "Rare Media", "Sneakers", "Collectibles",
  "Vinyl Records", "Luxury Watches", "Trading Cards",
];

function PulseZone({ revealed, marketHeat }: { revealed: boolean; marketHeat: number }) {
  const { invalidate } = useThree();
  const barRefs = useRef<(THREE.Mesh | null)[]>([]);
  const tickerGroupRef = useRef<THREE.Group>(null);
  const gridMatRef = useRef<THREE.LineBasicMaterial>(null);
  const topLightRef = useRef<THREE.PointLight>(null);
  const revealTweens = useRef<gsap.core.Tween[]>([]);
  const breathTween = useRef<gsap.core.Tween | null>(null);
  const tickerTween = useRef<gsap.core.Tween | null>(null);
  const popTween = useRef<gsap.core.Tween | null>(null);
  const prevRevealed = useRef(false);
  const marketHeatRef = useRef(marketHeat);

  useEffect(() => { marketHeatRef.current = marketHeat; }, [marketHeat]);

  const center = ZONES.pulse.look as readonly [number, number, number];
  const floorY = center[1] - 3;

  // Neon grid geometry — obsidian floor with neon-green lines
  const gridGeo = useMemo(() => {
    const lines: number[] = [];
    const gridCount = 20;
    const gridSize = 20;
    const step = gridSize / gridCount;
    const half = gridSize / 2;
    for (let i = 0; i <= gridCount; i++) {
      const offset = -half + i * step;
      lines.push(center[0] - half, floorY, center[2] + offset,
                  center[0] + half, floorY, center[2] + offset);
      lines.push(center[0] + offset, floorY, center[2] - half,
                  center[0] + offset, floorY, center[2] + half);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(lines), 3));
    return geo;
  }, [center, floorY]);

  // Bar layout — spread horizontally across center
  const barData = useMemo(() => {
    const w = 0.7;
    const gap = 0.25;
    const total = PULSE_CATEGORIES.length * w + (PULSE_CATEGORIES.length - 1) * gap;
    const startX = center[0] - total / 2 + w / 2;
    return PULSE_CATEGORIES.map((cat, i) => ({
      ...cat,
      targetHeight: cat.heat * 4,
      x: startX + i * (w + gap),
      z: center[2],
      width: w,
    }));
  }, [center]);

  // Ticker ring positions — 3D cylinder of names orbiting center
  const tickerData = useMemo(() => {
    const radius = 5;
    return PULSE_TICKERS.map((name, i) => {
      const angle = (i / PULSE_TICKERS.length) * Math.PI * 2;
      return {
        name,
        position: [radius * Math.cos(angle), 2, radius * Math.sin(angle)] as [number, number, number],
        rotation: [0, -angle + Math.PI / 2, 0] as [number, number, number],
      };
    });
  }, []);

  useEffect(() => {
    return () => {
      revealTweens.current.forEach((t) => t.kill());
      if (breathTween.current) breathTween.current.kill();
      if (tickerTween.current) tickerTween.current.kill();
      if (popTween.current) popTween.current.kill();
    };
  }, []);

  // ── Reveal / Hide ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (revealed && !prevRevealed.current) {
      revealTweens.current.forEach((t) => t.kill());
      revealTweens.current = [];

      // Bars grow from floor — staggered Panthere
      barRefs.current.forEach((mesh, i) => {
        if (!mesh) return;
        mesh.scale.y = 0.001;
        mesh.position.y = floorY;
        const h = barData[i].targetHeight;
        const proxy = { s: 0.001 };
        revealTweens.current.push(gsap.to(proxy, {
          s: 1, duration: 0.9, delay: i * 0.1, ...PANTHERE_EASE, overwrite: "auto",
          onUpdate: () => {
            if (!mesh) return;
            mesh.scale.y = proxy.s;
            mesh.position.y = floorY + (h * proxy.s) / 2;
            invalidate();
          },
        }));
      });

      // Grid fades in
      if (gridMatRef.current) {
        gridMatRef.current.opacity = 0;
        const p = { o: 0 };
        revealTweens.current.push(gsap.to(p, {
          o: 0.1, duration: 1.2, ...PANTHERE_EASE, overwrite: "auto",
          onUpdate: () => { if (gridMatRef.current) gridMatRef.current.opacity = p.o; invalidate(); },
        }));
      }

      // Top light ramps up
      if (topLightRef.current) {
        topLightRef.current.intensity = 0;
        const p = { i: 0 };
        revealTweens.current.push(gsap.to(p, {
          i: 2.5, duration: 1.0, delay: 0.4, ...PANTHERE_EASE, overwrite: "auto",
          onUpdate: () => { if (topLightRef.current) topLightRef.current.intensity = p.i; invalidate(); },
        }));
      }

      // Market heartbeat — continuous sine pulse on grid + top light
      if (breathTween.current) breathTween.current.kill();
      const bp = { t: 0 };
      breathTween.current = gsap.to(bp, {
        t: Math.PI * 2, duration: 3, repeat: -1, ease: "none", overwrite: "auto",
        onUpdate: () => {
          const wave = 0.5 + 0.5 * Math.sin(bp.t);
          const heat = marketHeatRef.current;
          if (gridMatRef.current) gridMatRef.current.opacity = 0.06 + wave * 0.08 * heat;
          if (topLightRef.current) topLightRef.current.intensity = 1.5 + wave * 2.0 * heat;
          invalidate();
        },
      });

      // Ticker ring slow rotation
      if (tickerTween.current) tickerTween.current.kill();
      if (tickerGroupRef.current) {
        const tp = { r: 0 };
        tickerTween.current = gsap.to(tp, {
          r: Math.PI * 2, duration: 30, repeat: -1, ease: "none", overwrite: "auto",
          onUpdate: () => {
            if (tickerGroupRef.current) tickerGroupRef.current.rotation.y = tp.r;
            invalidate();
          },
        });
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else if (!revealed && prevRevealed.current) {
      // Leaving pulse — kill all animations, reset geometry
      revealTweens.current.forEach((t) => t.kill());
      revealTweens.current = [];
      if (breathTween.current) { breathTween.current.kill(); breathTween.current = null; }
      if (tickerTween.current) { tickerTween.current.kill(); tickerTween.current = null; }
      if (popTween.current) { popTween.current.kill(); popTween.current = null; }
      barRefs.current.forEach((m) => { if (m) m.scale.y = 0.001; });
      if (gridMatRef.current) gridMatRef.current.opacity = 0;
      if (topLightRef.current) topLightRef.current.intensity = 0;
      invalidate();
    }
    prevRevealed.current = revealed;
  }, [revealed, barData, floorY, invalidate]);

  // ── Data Snap — bar tap + haptics ─────────────────────────────────────────
  const handleBarTap = useCallback((index: number) => {
    if (!revealed) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const mesh = barRefs.current[index];
    if (!mesh) return;
    if (popTween.current) popTween.current.kill();
    const baseY = floorY + barData[index].targetHeight / 2;
    const proxy = { y: mesh.position.y };
    popTween.current = gsap.to(proxy, {
      y: baseY + 0.5, duration: 0.25, ...PANTHERE_EASE, overwrite: "auto",
      yoyo: true, repeat: 1,
      onUpdate: () => { if (mesh) mesh.position.y = proxy.y; invalidate(); },
      onComplete: () => { popTween.current = null; },
    });
  }, [revealed, barData, floorY, invalidate]);

  return (
    <group>
      {/* Obsidian floor */}
      <mesh position={[center[0], floorY, center[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[24, 24]} />
        <meshStandardMaterial color="#050508" transparent opacity={0.85} roughness={0.98} metalness={0.02} />
      </mesh>

      {/* Neon grid lines */}
      <lineSegments geometry={gridGeo}>
        <lineBasicMaterial ref={gridMatRef} color="#00ff88" transparent opacity={0} />
      </lineSegments>

      {/* Reactive 3D bar charts */}
      {barData.map((bar, i) => (
        <group key={bar.name}>
          <mesh
            ref={(el) => { barRefs.current[i] = el; }}
            position={[bar.x, floorY, bar.z]}
            scale={[1, 0.001, 1]}
            onClick={() => handleBarTap(i)}
          >
            <boxGeometry args={[bar.width, bar.targetHeight, bar.width]} />
            <meshStandardMaterial
              color="#00884a"
              transparent
              opacity={0.85}
              roughness={0.3}
              metalness={0.6}
              emissive="#00ff88"
              emissiveIntensity={0.1 + 0.25 * bar.heat}
            />
          </mesh>
          <Suspense fallback={null}>
            <DreiText
              position={[bar.x, floorY + bar.targetHeight + 0.3, bar.z]}
              fontSize={0.15}
              color="#ffffff"
              anchorX="center"
              anchorY="bottom"
              maxWidth={1.2}
            >
              {bar.name}
            </DreiText>
          </Suspense>
        </group>
      ))}

      {/* Thermal glow — PointLight on the hottest bar */}
      <pointLight
        ref={topLightRef}
        position={[barData[0].x, floorY + barData[0].targetHeight + 1, barData[0].z]}
        color="#00ff88"
        intensity={0}
        distance={15}
        decay={2}
      />

      {/* 3D Cylinder Ticker — rotating ring of category names */}
      <group ref={tickerGroupRef} position={[center[0], center[1], center[2]]}>
        {tickerData.map((ticker) => (
          <Suspense key={ticker.name} fallback={null}>
            <DreiText
              position={ticker.position}
              rotation={ticker.rotation}
              fontSize={0.2}
              color="#00cc66"
              anchorX="center"
              anchorY="middle"
            >
              {ticker.name}
            </DreiText>
          </Suspense>
        ))}
      </group>
    </group>
  );
}

// ─── NEURAL FORGE ──────────────────────────────────────────────────────────
// Clinical precision analysis zone — deep item deconstruction.
// White wireframe grid, blue-tinted spotlight, orbiting holographic labels,
// slow-rotating wireframe scan box. Zero fluff — absolute precision.

function ForgeZone({
  revealed,
  dataPoints,
}: {
  revealed: boolean;
  dataPoints: ForgeDataPoint[];
}) {
  const { invalidate } = useThree();
  const center = ZONES.forge.look as readonly [number, number, number];
  const floorY = center[1] - 2;

  // Refs
  const spotRef = useRef<THREE.SpotLight>(null);
  const spotTargetRef = useRef(new THREE.Object3D());
  const boxRef = useRef<THREE.Mesh>(null);
  const gridMeshRef = useRef<THREE.Mesh>(null);
  const gridMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const labelGroupRef = useRef<THREE.Group>(null);
  const labelRefs = useRef<(THREE.Group | null)[]>([]);

  // Animation refs
  const revealTweens = useRef<gsap.core.Tween[]>([]);
  const boxRotTween = useRef<gsap.core.Tween | null>(null);
  const orbitTween = useRef<gsap.core.Tween | null>(null);
  const bloomTween = useRef<gsap.core.Tween | null>(null);
  const coldStartTl = useRef<gsap.core.Timeline | null>(null);
  const prevRevealed = useRef(false);

  // Clinical white wireframe grid — useMemo for zero pixel-shimmer
  const gridGeo = useMemo(() => new THREE.PlaneGeometry(24, 24, 30, 30), []);

  // Label orbital positions — distributed around the wireframe box
  const labelData = useMemo(() => {
    const display = dataPoints.slice(0, 6);
    const radius = 2.8;
    return display.map((dp, i) => {
      const angle = (i / Math.max(display.length, 1)) * Math.PI * 2;
      return {
        ...dp,
        position: [
          radius * Math.cos(angle),
          0.6 * Math.sin(angle * 2 + i * 0.7),
          radius * Math.sin(angle),
        ] as [number, number, number],
      };
    });
  }, [dataPoints]);

  // Cleanup
  useEffect(() => {
    return () => {
      revealTweens.current.forEach((t) => t.kill());
      if (boxRotTween.current) boxRotTween.current.kill();
      if (orbitTween.current) orbitTween.current.kill();
      if (bloomTween.current) bloomTween.current.kill();
      if (coldStartTl.current) coldStartTl.current.kill();
    };
  }, []);

  // Spotlight target
  useEffect(() => {
    spotTargetRef.current.position.set(center[0], floorY, center[2]);
    if (spotRef.current) spotRef.current.target = spotTargetRef.current;
  }, [center, floorY]);

  // ── Reveal / Hide ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (revealed && !prevRevealed.current) {
      revealTweens.current.forEach((t) => t.kill());
      revealTweens.current = [];

      // ── COLD START: Laser → Grid ──────────────────────────────────────
      if (gridMeshRef.current) gridMeshRef.current.scale.set(1, 0.001, 1);
      if (gridMatRef.current) gridMatRef.current.opacity = 0;

      if (coldStartTl.current) coldStartTl.current.kill();
      const gp = { scaleY: 0.001, opacity: 0 };
      coldStartTl.current = gsap.timeline();

      // Phase 1: thin laser line materializes
      coldStartTl.current.to(gp, {
        opacity: 0.5, duration: 0.25, ease: "power2.out",
        onUpdate: () => {
          if (gridMatRef.current) gridMatRef.current.opacity = gp.opacity;
          invalidate();
        },
      });

      // Phase 2: laser expands into full grid floor
      coldStartTl.current.to(gp, {
        scaleY: 1, opacity: 0.2, duration: 0.9, ...PANTHERE_EASE,
        onUpdate: () => {
          if (gridMeshRef.current) gridMeshRef.current.scale.y = gp.scaleY;
          if (gridMatRef.current) gridMatRef.current.opacity = gp.opacity;
          invalidate();
        },
      });

      // Spotlight ramp — clinical blue overhead
      if (spotRef.current) {
        spotRef.current.intensity = 0;
        const sp = { i: 0 };
        revealTweens.current.push(gsap.to(sp, {
          i: 10, duration: 1.2, delay: 0.2, ...PANTHERE_EASE,
          onUpdate: () => { if (spotRef.current) spotRef.current.intensity = sp.i; invalidate(); },
        }));
      }

      // Wireframe box scales in
      if (boxRef.current) {
        boxRef.current.scale.set(0.01, 0.01, 0.01);
        const bp = { s: 0.01 };
        revealTweens.current.push(gsap.to(bp, {
          s: 1, duration: 1.0, delay: 0.3, ...DOUBLE_PANTHERE_EASE,
          onUpdate: () => {
            if (boxRef.current) boxRef.current.scale.set(bp.s, bp.s, bp.s);
            invalidate();
          },
        }));
      }

      // Continuous box rotation
      if (boxRotTween.current) boxRotTween.current.kill();
      const rotP = { ry: 0, rx: 0 };
      boxRotTween.current = gsap.to(rotP, {
        ry: Math.PI * 2, rx: Math.PI * 2, duration: 20, repeat: -1, ease: "none",
        onUpdate: () => {
          if (boxRef.current) {
            boxRef.current.rotation.y = rotP.ry;
            boxRef.current.rotation.x = rotP.rx * 0.3;
          }
          invalidate();
        },
      });

      // Label orbit — continuous rotation + zero-gravity float
      if (orbitTween.current) orbitTween.current.kill();
      const op = { t: 0 };
      orbitTween.current = gsap.to(op, {
        t: Math.PI * 2, duration: 15, repeat: -1, ease: "none",
        onUpdate: () => {
          if (!labelGroupRef.current) return;
          labelGroupRef.current.rotation.y = op.t;
          labelRefs.current.forEach((group, i) => {
            if (!group || !labelData[i]) return;
            group.position.y = labelData[i].position[1] + Math.sin(op.t * 2 + i * 1.5) * 0.3;
          });
          invalidate();
        },
      });

      // Staggered label reveal + insight haptics
      labelRefs.current.forEach((group, i) => {
        if (!group) return;
        group.scale.set(0, 0, 0);
        const lp = { s: 0 };
        revealTweens.current.push(gsap.to(lp, {
          s: 1, duration: 0.6, delay: 0.6 + i * 0.15, ease: "sine.inOut",
          onUpdate: () => {
            if (group) group.scale.set(lp.s, lp.s, lp.s);
            invalidate();
          },
          onComplete: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          },
        }));
      });

      // Data Bloom — flash of insight for high-value points
      if (labelData.some((d) => d.isHighValue) && spotRef.current) {
        if (bloomTween.current) bloomTween.current.kill();
        const bp = { i: 10 };
        bloomTween.current = gsap.to(bp, {
          i: 100, duration: 0.12, delay: 1.5, yoyo: true, repeat: 1, ease: "power4.out",
          onUpdate: () => {
            if (spotRef.current) spotRef.current.intensity = bp.i;
            invalidate();
          },
          onComplete: () => {
            if (spotRef.current) spotRef.current.intensity = 10;
            bloomTween.current = null;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          },
        });
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else if (!revealed && prevRevealed.current) {
      // Leaving forge — kill all, reset
      revealTweens.current.forEach((t) => t.kill());
      revealTweens.current = [];
      if (boxRotTween.current) { boxRotTween.current.kill(); boxRotTween.current = null; }
      if (orbitTween.current) { orbitTween.current.kill(); orbitTween.current = null; }
      if (bloomTween.current) { bloomTween.current.kill(); bloomTween.current = null; }
      if (coldStartTl.current) { coldStartTl.current.kill(); coldStartTl.current = null; }
      if (spotRef.current) spotRef.current.intensity = 0;
      if (gridMatRef.current) gridMatRef.current.opacity = 0;
      if (gridMeshRef.current) gridMeshRef.current.scale.set(1, 0.001, 1);
      if (boxRef.current) boxRef.current.scale.set(0.01, 0.01, 0.01);
      labelRefs.current.forEach((g) => { if (g) g.scale.set(0, 0, 0); });
      invalidate();
    }
    prevRevealed.current = revealed;
  }, [revealed, labelData, invalidate]);

  return (
    <group>
      {/* Clinical white wireframe grid floor */}
      <mesh
        ref={gridMeshRef}
        position={[center[0], floorY, center[2]]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[1, 0.001, 1]}
      >
        <primitive object={gridGeo} attach="geometry" />
        <meshBasicMaterial
          ref={gridMatRef}
          color="#ffffff"
          wireframe
          transparent
          opacity={0}
        />
      </mesh>

      {/* Sharp blue-tinted overhead SpotLight — circle of truth */}
      <spotLight
        ref={spotRef}
        position={[center[0], center[1] + 8, center[2]]}
        intensity={0}
        color="#4488ff"
        angle={Math.PI / 5}
        penumbra={0.3}
        distance={25}
        decay={1.5}
        castShadow={false}
      />
      <primitive object={spotTargetRef.current} />

      {/* Floating wireframe scan box — the analysis container */}
      <mesh ref={boxRef} position={[center[0], center[1], center[2]]} scale={[0.01, 0.01, 0.01]}>
        <boxGeometry args={[2.5, 2.5, 2.5]} />
        <meshBasicMaterial color="#4488ff" wireframe transparent opacity={0.35} />
      </mesh>

      {/* Orbiting holographic data labels */}
      <group ref={labelGroupRef} position={[center[0], center[1], center[2]]}>
        {labelData.map((dp, i) => (
          <group
            key={`${dp.label}-${i}`}
            ref={(el) => { labelRefs.current[i] = el; }}
            position={dp.position}
            scale={[0, 0, 0]}
          >
            <Suspense fallback={null}>
              <DreiText
                fontSize={0.18}
                color={dp.isHighValue ? "#66bbff" : "#ffffff"}
                anchorX="center"
                anchorY="middle"
                maxWidth={2.5}
              >
                {`${dp.label}: ${dp.value}`}
              </DreiText>
            </Suspense>
          </group>
        ))}
      </group>
    </group>
  );
}

// ─── LIQUIDITY WELL ───────────────────────────────────────────────────────────
// "Financial Depth" — deep-blue immersive zone simulating cash flow velocity.
// Obsidian floor with concentric ripple rings, pulsing Electric Cyan core beam,
// 100 flow lines converging inward. Speed governed by liquidityScore (0–100).

const FLOW_LINE_COUNT = 100;

function WellZone({
  revealed,
  liquidityScore,
}: {
  revealed: boolean;
  liquidityScore: number;
}) {
  const { scene, invalidate } = useThree();
  const center = ZONES.well.look as readonly [number, number, number];
  const floorY = center[1] - 2;

  // Refs
  const coreRef = useRef<THREE.Mesh>(null);
  const coreMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const coreLightRef = useRef<THREE.PointLight>(null);
  const navyAmbientRef = useRef<THREE.AmbientLight>(null);
  const floorMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const rippleMatRef = useRef<THREE.LineBasicMaterial>(null);
  const flowMatRef = useRef<THREE.LineBasicMaterial>(null);

  // Animation refs
  const revealTweens = useRef<gsap.core.Tween[]>([]);
  const pulseTween = useRef<gsap.core.Tween | null>(null);
  const flowTween = useRef<gsap.core.Tween | null>(null);
  const fogTween = useRef<gsap.core.Tween | null>(null);
  const prevRevealed = useRef(false);
  const liquidityRef = useRef(liquidityScore);

  useEffect(() => { liquidityRef.current = liquidityScore; }, [liquidityScore]);

  // Ripple ring geometry — concentric circles on the obsidian floor
  const rippleGeo = useMemo(() => {
    const lines: number[] = [];
    const ringCount = 10;
    const segsPerRing = 48;
    const maxRadius = 8;

    for (let r = 1; r <= ringCount; r++) {
      const radius = (r / ringCount) * maxRadius;
      for (let s = 0; s < segsPerRing; s++) {
        const a1 = (s / segsPerRing) * Math.PI * 2;
        const a2 = ((s + 1) / segsPerRing) * Math.PI * 2;
        lines.push(
          center[0] + radius * Math.cos(a1), floorY + 0.01, center[2] + radius * Math.sin(a1),
          center[0] + radius * Math.cos(a2), floorY + 0.01, center[2] + radius * Math.sin(a2),
        );
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(lines), 3));
    return geo;
  }, [center, floorY]);

  // Flow line seed data — each line has a fixed angle, random phase/speed
  const flowSeeds = useMemo(() => {
    const seeds: { angle: number; maxR: number; phase: number; speed: number; y: number; len: number }[] = [];
    for (let i = 0; i < FLOW_LINE_COUNT; i++) {
      seeds.push({
        angle: Math.random() * Math.PI * 2,
        maxR: 3 + Math.random() * 6,
        phase: Math.random(),
        speed: 0.6 + Math.random() * 0.8,
        y: floorY + 0.3 + Math.random() * 4,
        len: 0.2 + Math.random() * 0.4,
      });
    }
    return seeds;
  }, [floorY]);

  // Flow geometry — mutable positions buffer
  const flowGeo = useMemo(() => {
    const positions = new Float32Array(FLOW_LINE_COUNT * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      revealTweens.current.forEach((t) => t.kill());
      if (pulseTween.current) pulseTween.current.kill();
      if (flowTween.current) flowTween.current.kill();
      if (fogTween.current) fogTween.current.kill();
    };
  }, []);

  const beamHeight = 8;
  const beamY = floorY + beamHeight / 2;

  // ── Reveal / Hide ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (revealed && !prevRevealed.current) {
      revealTweens.current.forEach((t) => t.kill());
      revealTweens.current = [];

      // ── Navy fog transition ──────────────────────────────────────────────
      if (fogTween.current) fogTween.current.kill();
      if (scene.fog instanceof THREE.Fog) {
        const fp = { r: scene.fog.color.r, g: scene.fog.color.g, b: scene.fog.color.b };
        fogTween.current = gsap.to(fp, {
          r: 0.01, g: 0.01, b: 0.06,
          duration: 1.5, ...PANTHERE_EASE,
          onUpdate: () => {
            if (scene.fog instanceof THREE.Fog) scene.fog.color.setRGB(fp.r, fp.g, fp.b);
            invalidate();
          },
        });
      }

      // Floor fades in
      if (floorMatRef.current) {
        floorMatRef.current.opacity = 0;
        const op = { o: 0 };
        revealTweens.current.push(gsap.to(op, {
          o: 0.9, duration: 1.0, ...PANTHERE_EASE,
          onUpdate: () => { if (floorMatRef.current) floorMatRef.current.opacity = op.o; invalidate(); },
        }));
      }

      // Ripple rings fade in
      if (rippleMatRef.current) {
        rippleMatRef.current.opacity = 0;
        const rp = { o: 0 };
        revealTweens.current.push(gsap.to(rp, {
          o: 0.15, duration: 1.2, delay: 0.3, ...PANTHERE_EASE,
          onUpdate: () => { if (rippleMatRef.current) rippleMatRef.current.opacity = rp.o; invalidate(); },
        }));
      }

      // Core beam scales in (radial, not height)
      if (coreRef.current) {
        coreRef.current.scale.set(0.01, 1, 0.01);
        const cp = { s: 0.01 };
        revealTweens.current.push(gsap.to(cp, {
          s: 1, duration: 1.0, delay: 0.2, ...DOUBLE_PANTHERE_EASE,
          onUpdate: () => {
            if (coreRef.current) coreRef.current.scale.set(cp.s, 1, cp.s);
            invalidate();
          },
        }));
      }

      // Core PointLight ramps to 150
      if (coreLightRef.current) {
        coreLightRef.current.intensity = 0;
        const lp = { i: 0 };
        revealTweens.current.push(gsap.to(lp, {
          i: 150, duration: 1.5, delay: 0.3, ...PANTHERE_EASE,
          onUpdate: () => { if (coreLightRef.current) coreLightRef.current.intensity = lp.i; invalidate(); },
        }));
      }

      // Navy ambient ramps in
      if (navyAmbientRef.current) {
        navyAmbientRef.current.intensity = 0;
        const ap = { i: 0 };
        revealTweens.current.push(gsap.to(ap, {
          i: 0.3, duration: 1.2, delay: 0.2, ...PANTHERE_EASE,
          onUpdate: () => { if (navyAmbientRef.current) navyAmbientRef.current.intensity = ap.i; invalidate(); },
        }));
      }

      // Flow lines fade in
      if (flowMatRef.current) {
        flowMatRef.current.opacity = 0;
        const flp = { o: 0 };
        revealTweens.current.push(gsap.to(flp, {
          o: 0.5, duration: 0.8, delay: 0.5, ...PANTHERE_EASE,
          onUpdate: () => { if (flowMatRef.current) flowMatRef.current.opacity = flp.o; invalidate(); },
        }));
      }

      // ── Core Pulse — continuous pulsing cyan + synchronized haptics ──────
      if (pulseTween.current) pulseTween.current.kill();
      const pp = { t: 0 };
      let lastHapticHalf = 0;
      pulseTween.current = gsap.to(pp, {
        t: Math.PI * 2, duration: 4, repeat: -1, ease: "none",
        onUpdate: () => {
          const wave = 0.5 + 0.5 * Math.sin(pp.t);
          if (coreLightRef.current) coreLightRef.current.intensity = 100 + wave * 100;
          if (coreMatRef.current) coreMatRef.current.opacity = 0.5 + wave * 0.4;
          // Haptic every 2s — fire at sine half-cycle boundaries
          const half = Math.floor(pp.t / Math.PI);
          if (half !== lastHapticHalf) {
            lastHapticHalf = half;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          invalidate();
        },
      });

      // ── Flow Line Animation — 100 lines converging toward the core ──────
      if (flowTween.current) flowTween.current.kill();
      const flowP = { t: 0 };
      flowTween.current = gsap.to(flowP, {
        t: 600, duration: 600, ease: "none",
        onUpdate: () => {
          const attr = flowGeo.attributes.position;
          const positions = attr.array as Float32Array;
          const liqFactor = 0.5 + (liquidityRef.current / 100) * 1.5;

          for (let i = 0; i < FLOW_LINE_COUNT; i++) {
            const seed = flowSeeds[i];
            const progress = ((flowP.t * seed.speed * liqFactor * 0.25) + seed.phase) % 1.0;
            const r = seed.maxR * (1 - progress) + 0.3;
            const rTail = r + seed.len;

            const idx = i * 6;
            positions[idx]     = center[0] + r * Math.cos(seed.angle);
            positions[idx + 1] = seed.y;
            positions[idx + 2] = center[2] + r * Math.sin(seed.angle);
            positions[idx + 3] = center[0] + rTail * Math.cos(seed.angle);
            positions[idx + 4] = seed.y;
            positions[idx + 5] = center[2] + rTail * Math.sin(seed.angle);
          }

          (attr as THREE.BufferAttribute).needsUpdate = true;
          invalidate();
        },
      });

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else if (!revealed && prevRevealed.current) {
      // Leaving well — kill all animations, reset
      revealTweens.current.forEach((t) => t.kill());
      revealTweens.current = [];
      if (pulseTween.current) { pulseTween.current.kill(); pulseTween.current = null; }
      if (flowTween.current) { flowTween.current.kill(); flowTween.current = null; }

      // Fog back to black
      if (fogTween.current) fogTween.current.kill();
      if (scene.fog instanceof THREE.Fog) {
        const fp = { r: scene.fog.color.r, g: scene.fog.color.g, b: scene.fog.color.b };
        fogTween.current = gsap.to(fp, {
          r: 0, g: 0, b: 0, duration: 0.5,
          onUpdate: () => {
            if (scene.fog instanceof THREE.Fog) scene.fog.color.setRGB(fp.r, fp.g, fp.b);
            invalidate();
          },
          onComplete: () => { fogTween.current = null; },
        });
      }

      if (floorMatRef.current) floorMatRef.current.opacity = 0;
      if (rippleMatRef.current) rippleMatRef.current.opacity = 0;
      if (coreRef.current) coreRef.current.scale.set(0.01, 1, 0.01);
      if (coreLightRef.current) coreLightRef.current.intensity = 0;
      if (navyAmbientRef.current) navyAmbientRef.current.intensity = 0;
      if (coreMatRef.current) coreMatRef.current.opacity = 0;
      if (flowMatRef.current) flowMatRef.current.opacity = 0;
      invalidate();
    }
    prevRevealed.current = revealed;
  }, [revealed, flowSeeds, flowGeo, center, scene, invalidate]);

  return (
    <group>
      {/* Deep navy ambient — replaces white ambient in this zone */}
      <ambientLight ref={navyAmbientRef} intensity={0} color="#0a0a30" />

      {/* Obsidian floor — high metalness, low roughness to catch cyan light */}
      <mesh position={[center[0], floorY, center[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial
          ref={floorMatRef}
          color="#0a0a12"
          transparent
          opacity={0}
          roughness={0.15}
          metalness={0.9}
        />
      </mesh>

      {/* Circular Ripple Rings */}
      <lineSegments geometry={rippleGeo}>
        <lineBasicMaterial ref={rippleMatRef} color="#00f2ff" transparent opacity={0} />
      </lineSegments>

      {/* Well Core — pulsing Electric Cyan vertical beam */}
      <mesh ref={coreRef} position={[center[0], beamY, center[2]]} scale={[0.01, 1, 0.01]}>
        <cylinderGeometry args={[0.15, 0.15, beamHeight, 12]} />
        <meshBasicMaterial ref={coreMatRef} color="#00f2ff" transparent opacity={0} />
      </mesh>

      {/* Core PointLight — high-intensity cyan inside the beam */}
      <pointLight
        ref={coreLightRef}
        position={[center[0], center[1], center[2]]}
        color="#00f2ff"
        intensity={0}
        distance={20}
        decay={2}
      />

      {/* Flow Lines — 100 converging line segments */}
      <lineSegments geometry={flowGeo}>
        <lineBasicMaterial ref={flowMatRef} color="#00f2ff" transparent opacity={0} />
      </lineSegments>
    </group>
  );
}

// ─── SHADOW MARKET (THE VAULT) ─────────────────────────────────────────────
// Moody amber-lit private vault — historical arbitrage & insider alpha.
// Polished obsidian floor, narrow amber spotlight, ghost wireframe duplicates
// with glitch effect. Flickering lamp reveal on camera arrival.

const MAX_SHADOW_ITEMS = 6;

function ShadowZone({
  revealed,
  shadowData,
}: {
  revealed: boolean;
  shadowData: ShadowDataItem[];
}) {
  const { scene, invalidate } = useThree();
  const center = ZONES.shadow.look as readonly [number, number, number];
  const floorY = center[1] - 2;

  // Refs
  const spotRef = useRef<THREE.SpotLight>(null);
  const spotTargetRef = useRef(new THREE.Object3D());
  const floorMatRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const amberAmbientRef = useRef<THREE.AmbientLight>(null);
  const itemGroupRefs = useRef<(THREE.Group | null)[]>([]);
  const ghostRefs = useRef<(THREE.Group | null)[]>([]);

  // Animation refs
  const revealTweens = useRef<gsap.core.Tween[]>([]);
  const flickerTl = useRef<gsap.core.Timeline | null>(null);
  const glitchTweens = useRef<gsap.core.Tween[]>([]);
  const fogTween = useRef<gsap.core.Tween | null>(null);
  const prevRevealed = useRef(false);

  const displayItems = useMemo(
    () => shadowData.slice(0, MAX_SHADOW_ITEMS),
    [shadowData],
  );

  // Item layout — spread horizontally, centered on zone look target
  const itemLayout = useMemo(() => {
    if (!displayItems.length) return [];
    const spacing = 3.5;
    const total = (displayItems.length - 1) * spacing;
    const startX = center[0] - total / 2;
    return displayItems.map((item, i) => ({
      ...item,
      position: [startX + i * spacing, center[1], center[2]] as [number, number, number],
    }));
  }, [displayItems, center]);

  // Spotlight target
  useEffect(() => {
    spotTargetRef.current.position.set(center[0], center[1], center[2]);
    if (spotRef.current) spotRef.current.target = spotTargetRef.current;
  }, [center]);

  // Cleanup
  useEffect(() => {
    return () => {
      revealTweens.current.forEach((t) => t.kill());
      if (flickerTl.current) flickerTl.current.kill();
      glitchTweens.current.forEach((t) => t.kill());
      if (fogTween.current) fogTween.current.kill();
    };
  }, []);

  // ── Reveal / Hide ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (revealed && !prevRevealed.current) {
      revealTweens.current.forEach((t) => t.kill());
      revealTweens.current = [];
      glitchTweens.current.forEach((t) => t.kill());
      glitchTweens.current = [];

      // ── Amber fog transition ──────────────────────────────────────────
      if (fogTween.current) fogTween.current.kill();
      if (scene.fog instanceof THREE.Fog) {
        const fp = { r: scene.fog.color.r, g: scene.fog.color.g, b: scene.fog.color.b };
        fogTween.current = gsap.to(fp, {
          r: 0.06, g: 0.03, b: 0,
          duration: 1.5, ...PANTHERE_EASE,
          onUpdate: () => {
            if (scene.fog instanceof THREE.Fog) scene.fog.color.setRGB(fp.r, fp.g, fp.b);
            invalidate();
          },
        });
      }

      // Floor fades in
      if (floorMatRef.current) {
        floorMatRef.current.opacity = 0;
        const ofp = { o: 0 };
        revealTweens.current.push(gsap.to(ofp, {
          o: 0.9, duration: 1.0, ...PANTHERE_EASE,
          onUpdate: () => { if (floorMatRef.current) floorMatRef.current.opacity = ofp.o; invalidate(); },
        }));
      }

      // ── Amber Light Flicker — old lamps powering up ──────────────────
      if (flickerTl.current) flickerTl.current.kill();
      flickerTl.current = gsap.timeline();
      const spotProxy = { i: 0 };
      const ambProxy = { i: 0 };

      // Rapid flicker sequence (3 flickers before settling)
      for (let f = 0; f < 3; f++) {
        flickerTl.current.to(spotProxy, {
          i: 8 + f * 4, duration: 0.08,
          onUpdate: () => { if (spotRef.current) spotRef.current.intensity = spotProxy.i; invalidate(); },
        });
        flickerTl.current.to(spotProxy, {
          i: 0, duration: 0.06,
          onUpdate: () => { if (spotRef.current) spotRef.current.intensity = spotProxy.i; invalidate(); },
        });
      }
      // Final ramp to full intensity
      flickerTl.current.to(spotProxy, {
        i: 20, duration: 0.6, ...PANTHERE_EASE,
        onUpdate: () => { if (spotRef.current) spotRef.current.intensity = spotProxy.i; invalidate(); },
      });
      // Amber ambient ramp (overlapping)
      flickerTl.current.to(ambProxy, {
        i: 0.15, duration: 0.8, ...PANTHERE_EASE,
        onUpdate: () => { if (amberAmbientRef.current) amberAmbientRef.current.intensity = ambProxy.i; invalidate(); },
      }, 0.3);

      // ── Ghost Glitch — yoyo on ghost position (0.01 variance) ────────
      ghostRefs.current.forEach((ghost, i) => {
        if (!ghost) return;
        const baseX = ghost.position.x;
        const gp = { px: baseX, sy: 1 };
        const tw = gsap.to(gp, {
          px: baseX + 0.01,
          sy: 1.01,
          duration: 0.15 + Math.random() * 0.1,
          yoyo: true,
          repeat: -1,
          ease: "none",
          delay: i * 0.08,
          onUpdate: () => {
            if (!ghost) return;
            ghost.position.x = gp.px;
            ghost.scale.y = gp.sy;
            invalidate();
          },
        });
        glitchTweens.current.push(tw);
      });

      // ── Item Groups scale in (staggered) ─────────────────────────────
      itemGroupRefs.current.forEach((group, i) => {
        if (!group) return;
        group.scale.set(0, 0, 0);
        const ip = { s: 0 };
        revealTweens.current.push(gsap.to(ip, {
          s: 1, duration: 0.7, delay: 0.5 + i * 0.12, ease: "sine.inOut",
          onUpdate: () => {
            if (group) group.scale.set(ip.s, ip.s, ip.s);
            invalidate();
          },
        }));
      });

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else if (!revealed && prevRevealed.current) {
      // Leaving shadow — kill all animations, reset
      revealTweens.current.forEach((t) => t.kill());
      revealTweens.current = [];
      glitchTweens.current.forEach((t) => t.kill());
      glitchTweens.current = [];
      if (flickerTl.current) { flickerTl.current.kill(); flickerTl.current = null; }

      // Fog back to black
      if (fogTween.current) fogTween.current.kill();
      if (scene.fog instanceof THREE.Fog) {
        const fp = { r: scene.fog.color.r, g: scene.fog.color.g, b: scene.fog.color.b };
        fogTween.current = gsap.to(fp, {
          r: 0, g: 0, b: 0, duration: 0.5,
          onUpdate: () => {
            if (scene.fog instanceof THREE.Fog) scene.fog.color.setRGB(fp.r, fp.g, fp.b);
            invalidate();
          },
          onComplete: () => { fogTween.current = null; },
        });
      }

      if (floorMatRef.current) floorMatRef.current.opacity = 0;
      if (spotRef.current) spotRef.current.intensity = 0;
      if (amberAmbientRef.current) amberAmbientRef.current.intensity = 0;
      itemGroupRefs.current.forEach((g) => { if (g) g.scale.set(0, 0, 0); });
      invalidate();
    }
    prevRevealed.current = revealed;
  }, [revealed, itemLayout, scene, invalidate]);

  return (
    <group>
      {/* Dark amber ambient — the vault's undertone */}
      <ambientLight ref={amberAmbientRef} intensity={0} color="#3d2800" />

      {/* Polished obsidian tile floor — high reflectivity */}
      <mesh position={[center[0], floorY, center[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[24, 24]} />
        <meshPhysicalMaterial
          ref={floorMatRef}
          color="#0a0a0a"
          transparent
          opacity={0}
          roughness={0.05}
          metalness={1}
          reflectivity={1}
        />
      </mesh>

      {/* Warm Amber Spotlight — narrow interrogation-room beam */}
      <spotLight
        ref={spotRef}
        position={[center[0], center[1] + 10, center[2] + 2]}
        intensity={0}
        color="#FFB300"
        angle={Math.PI / 8}
        penumbra={0.4}
        distance={30}
        decay={1.5}
        castShadow={false}
      />
      <primitive object={spotTargetRef.current} />

      {/* Shadow Data Items — real + ghost duplicate paired in THREE.Group */}
      {itemLayout.map((item, i) => (
        <group
          key={item.id}
          ref={(el) => { itemGroupRefs.current[i] = el; }}
          scale={[0, 0, 0]}
        >
          <group position={item.position}>
            {/* Real item slab */}
            <mesh>
              <boxGeometry args={[2.2, 1.4, 0.08]} />
              <meshPhysicalMaterial
                color="#1a1a1a"
                transparent
                opacity={0.85}
                roughness={0.2}
                metalness={0.8}
              />
            </mesh>
            <Suspense fallback={null}>
              <DreiText
                position={[0, 0.35, 0.05]}
                fontSize={0.15}
                color="#FFB300"
                anchorX="center"
                anchorY="middle"
                maxWidth={2}
              >
                {item.title}
              </DreiText>
              <DreiText
                position={[-0.5, -0.1, 0.05]}
                fontSize={0.1}
                color="#888888"
                anchorX="center"
                anchorY="middle"
                maxWidth={1}
              >
                {`Floor: ${item.publicPrice}`}
              </DreiText>
              <DreiText
                position={[0.5, -0.1, 0.05]}
                fontSize={0.1}
                color="#FFB300"
                anchorX="center"
                anchorY="middle"
                maxWidth={1}
              >
                {`Shadow: ${item.shadowPrice}`}
              </DreiText>
            </Suspense>

            {/* Ghost Duplicate — offset wireframe with glitch */}
            <group
              ref={(el) => { ghostRefs.current[i] = el; }}
              position={[0.15, 0.1, -0.15]}
            >
              <mesh>
                <boxGeometry args={[2.2, 1.4, 0.08]} />
                <meshBasicMaterial
                  color="#FFB300"
                  wireframe
                  transparent
                  opacity={0.2}
                />
              </mesh>
            </group>
          </group>
        </group>
      ))}
    </group>
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
  /** Verdict mode — BUY (emerald) / PASS (spotlight) / null */
  verdict?: VerdictMode;
  /** Hyper-warp worm effect active */
  warpActive?: boolean;
  /** Called when warp animation finishes */
  onWarpComplete?: () => void;
  /** Neon laser scan line active */
  laserActive?: boolean;
  /** Archive shard items (scan history for 3D display) */
  archiveItems?: ArchiveItem[];
  /** Fired when a shard's inspection animation completes */
  onArchiveInspect?: (id: string) => void;
  /** Market heat (0.0–1.0) — drives pulse zone intensity */
  marketHeat?: number;
  /** Forge data points — holographic labels orbiting the scan box */
  forgeDataPoints?: ForgeDataPoint[];
  /** Liquidity score (0–100) — drives Well zone flow line speed */
  liquidityScore?: number;
  /** Shadow Market data — insider alpha (private auction results) */
  shadowData?: ShadowDataItem[];
}

const SpatialEngineCore = forwardRef<SpatialEngineHandle, SpatialEngineProps>(
  function SpatialEngineCore({
    zone: zoneProp,
    onTransitionStart,
    onTransitionEnd,
    verdict,
    warpActive,
    onWarpComplete,
    laserActive,
    archiveItems,
    onArchiveInspect,
    marketHeat,
    forgeDataPoints,
    liquidityScore,
    shadowData,
  }, ref) {
    const [overrideZone, setOverrideZone] = useState<ZoneKey | null>(null);
    const zone = overrideZone ?? zoneProp;

    // Track whether the camera has arrived at the archive zone
    const [archiveRevealed, setArchiveRevealed] = useState(false);
    const [pulseRevealed, setPulseRevealed] = useState(false);
    const [forgeRevealed, setForgeRevealed] = useState(false);
    const [wellRevealed, setWellRevealed] = useState(false);
    const [shadowRevealed, setShadowRevealed] = useState(false);

    // Clear override when the prop catches up
    const zoneRef = useRef(zone);
    zoneRef.current = zone;
    useEffect(() => { setOverrideZone(null); }, [zoneProp]);

    // Archive reveal: set true when camera arrives at archive, false when leaving
    const handleTransitionEnd = useCallback(() => {
      onTransitionEnd?.();
      if (zoneRef.current === "archive") setArchiveRevealed(true);
      if (zoneRef.current === "pulse") setPulseRevealed(true);
      if (zoneRef.current === "forge") setForgeRevealed(true);
      if (zoneRef.current === "well") setWellRevealed(true);
      if (zoneRef.current === "shadow") setShadowRevealed(true);
    }, [onTransitionEnd]);
    useEffect(() => {
      if (zone !== "archive") setArchiveRevealed(false);
      if (zone !== "pulse") setPulseRevealed(false);
      if (zone !== "forge") setForgeRevealed(false);
      if (zone !== "well") setWellRevealed(false);
      if (zone !== "shadow") setShadowRevealed(false);
    }, [zone]);

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

        {/* Camera rig — GSAP-driven + Obsidian Warp */}
        <CameraRig
          zone={zone}
          verdict={verdict}
          onTransitionStart={onTransitionStart}
          onTransitionEnd={handleTransitionEnd}
        />

        {/* Dramatic aperture light per zone */}
        <ApertureLight zone={zone} />

        {/* Verdict lighting — emerald (BUY) / spotlight (PASS) */}
        <VerdictLight verdict={verdict ?? null} zone={zone} />

        {/* Subtle ground planes for light to catch */}
        <ZoneGroundPlanes />

        {/* Minimal depth motes — not particles, just static points */}
        <DepthMotes />

        {/* ── SPATIAL FX ─────────────────────────────────────────────────── */}

        {/* Hyper-Warp: white worms fly past camera on survey completion */}
        <HyperWarp active={warpActive ?? false} onComplete={onWarpComplete} />

        {/* Neon Laser: horizontal scan line during pipeline */}
        <NeonLaser active={laserActive ?? false} zone={zone} />

        {/* Archive: Obsidian Shards spiral — scan history as 3D memory */}
        <ArchiveShards
          items={archiveItems ?? []}
          revealed={archiveRevealed}
          onInspect={onArchiveInspect}
        />

        {/* Market Pulse: reactive bar charts + rotating tickers */}
        <PulseZone
          revealed={pulseRevealed}
          marketHeat={marketHeat ?? 0.5}
        />

        {/* Neural Forge: clinical precision analysis zone */}
        <ForgeZone
          revealed={forgeRevealed}
          dataPoints={forgeDataPoints ?? []}
        />

        {/* Liquidity Well: deep-blue financial flow zone */}
        <WellZone
          revealed={wellRevealed}
          liquidityScore={liquidityScore ?? 50}
        />

        {/* Shadow Market: amber-lit private vault for insider alpha */}
        <ShadowZone
          revealed={shadowRevealed}
          shadowData={shadowData ?? []}
        />
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
