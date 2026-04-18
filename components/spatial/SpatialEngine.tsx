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
const ZONE_TRANSITIONS: Partial<Record<ZoneKey, { duration: number; ease: typeof PANTHERE_EASE }>> = {
  archive: { duration: 2.0, ease: DOUBLE_PANTHERE_EASE },
};

// ─── LIGHT CONFIG ────────────────────────────────────────────────────────────
const ZONE_LIGHTS: Record<ZoneKey, { intensity: number; penumbra: number; color: string; angle: number }> = {
  camera:    { intensity: 2.5, penumbra: 0.9,  color: "#ffffff", angle: Math.PI / 5 },
  results:   { intensity: 3.0, penumbra: 0.85, color: "#f0f0ff", angle: Math.PI / 4 },
  history:   { intensity: 1.5, penumbra: 0.95, color: "#e8e8f0", angle: Math.PI / 6 },
  watchlist: { intensity: 2.0, penumbra: 0.9,  color: "#fff0f0", angle: Math.PI / 5 },
  profile:   { intensity: 1.8, penumbra: 0.92, color: "#f0f0f0", angle: Math.PI / 5 },
  archive:   { intensity: 1.2, penumbra: 0.95, color: "#d0d0e8", angle: Math.PI / 7 },
};

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
    const proxy = {
      px: camera.position.x,
      py: camera.position.y,
      pz: camera.position.z,
      lx: lookTargetRef.current.x,
      ly: lookTargetRef.current.y,
      lz: lookTargetRef.current.z,
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
      duration,
      ...easeObj,
      onUpdate: () => {
        camera.position.set(proxy.px, proxy.py, proxy.pz);
        lookTargetRef.current.set(proxy.lx, proxy.ly, proxy.lz);
        camera.lookAt(lookTargetRef.current);
        invalidate();
      },
      onComplete: () => {
        tweenRef.current = null;
        onTransitionEnd?.();
      },
    });
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
  }, ref) {
    const [overrideZone, setOverrideZone] = useState<ZoneKey | null>(null);
    const zone = overrideZone ?? zoneProp;

    // Track whether the camera has arrived at the archive zone
    const [archiveRevealed, setArchiveRevealed] = useState(false);

    // Clear override when the prop catches up
    const zoneRef = useRef(zone);
    zoneRef.current = zone;
    useEffect(() => { setOverrideZone(null); }, [zoneProp]);

    // Archive reveal: set true when camera arrives at archive, false when leaving
    const handleTransitionEnd = useCallback(() => {
      onTransitionEnd?.();
      if (zoneRef.current === "archive") setArchiveRevealed(true);
    }, [onTransitionEnd]);
    useEffect(() => {
      if (zone !== "archive") setArchiveRevealed(false);
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
