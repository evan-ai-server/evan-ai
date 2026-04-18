/**
 * SpatialContext — Bridges the existing tab state with the 3D spatial engine.
 *
 * The tab state in index.tsx drives `zone`, which the SpatialEngine reads
 * to animate the camera. This context avoids prop-drilling through the
 * 20K-line index.tsx monolith.
 *
 * Also provides spatial FX state:
 *   - verdict: "buy" | "pass" | null — drives verdict lighting + obsidian warp
 *   - warpActive: boolean — triggers hyper-warp worm effect
 *   - laserActive: boolean — triggers neon laser scan line
 */
import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import type { ZoneKey, ArchiveItem } from "./SpatialEngine";
export type { ZoneKey, ArchiveItem };

export type VerdictMode = "buy" | "pass" | null;

interface SpatialContextValue {
  /** Current spatial zone (maps 1:1 to tab names) */
  zone: ZoneKey;
  /** Set the spatial zone — typically called by goTab() */
  setZone: (zone: ZoneKey) => void;
  /** Whether the camera is currently animating between zones */
  transitioning: boolean;
  /** Called by SpatialEngine on transition start/end */
  setTransitioning: (v: boolean) => void;

  // ─── Spatial FX ──────────────────────────────────────────────────────────────
  /** Verdict mode — drives emerald/spotlight lighting + obsidian camera warp */
  verdict: VerdictMode;
  setVerdict: (v: VerdictMode) => void;
  /** Hyper-warp worm effect (survey completion) */
  warpActive: boolean;
  triggerWarp: () => void;
  endWarp: () => void;
  /** Neon laser scan line (active during scan pipeline) */
  laserActive: boolean;
  setLaserActive: (v: boolean) => void;

  // ─── Archive ────────────────────────────────────────────────────────────────
  /** History items projected as 3D Obsidian Shards */
  archiveItems: ArchiveItem[];
  setArchiveItems: (items: ArchiveItem[]) => void;
  /** Set by SpatialEngine when a shard inspection completes */
  inspectedArchiveId: string | null;
  setInspectedArchiveId: (id: string | null) => void;
}

const SpatialContext = createContext<SpatialContextValue>({
  zone: "camera",
  setZone: () => {},
  transitioning: false,
  setTransitioning: () => {},
  verdict: null,
  setVerdict: () => {},
  warpActive: false,
  triggerWarp: () => {},
  endWarp: () => {},
  laserActive: false,
  setLaserActive: () => {},
  archiveItems: [],
  setArchiveItems: () => {},
  inspectedArchiveId: null,
  setInspectedArchiveId: () => {},
});

export function SpatialProvider({ children }: { children: React.ReactNode }) {
  const [zone, setZone] = useState<ZoneKey>("camera");
  const [transitioning, setTransitioning] = useState(false);
  const [verdict, setVerdict] = useState<VerdictMode>(null);
  const [warpActive, setWarpActive] = useState(false);
  const [laserActive, setLaserActive] = useState(false);
  const [archiveItems, setArchiveItems] = useState<ArchiveItem[]>([]);
  const [inspectedArchiveId, setInspectedArchiveId] = useState<string | null>(null);

  // Prevent double-fire
  const warpLock = useRef(false);

  const handleSetZone = useCallback((z: ZoneKey) => {
    setZone(z);
  }, []);

  const handleSetTransitioning = useCallback((v: boolean) => {
    setTransitioning(v);
  }, []);

  const handleSetVerdict = useCallback((v: VerdictMode) => {
    setVerdict(v);
  }, []);

  const triggerWarp = useCallback(() => {
    if (warpLock.current) return;
    warpLock.current = true;
    setWarpActive(true);
  }, []);

  const endWarp = useCallback(() => {
    setWarpActive(false);
    warpLock.current = false;
  }, []);

  const handleSetLaserActive = useCallback((v: boolean) => {
    setLaserActive(v);
  }, []);

  const handleSetArchiveItems = useCallback((items: ArchiveItem[]) => {
    setArchiveItems(items);
  }, []);

  const handleSetInspectedArchiveId = useCallback((id: string | null) => {
    setInspectedArchiveId(id);
  }, []);

  return (
    <SpatialContext.Provider
      value={{
        zone,
        setZone: handleSetZone,
        transitioning,
        setTransitioning: handleSetTransitioning,
        verdict,
        setVerdict: handleSetVerdict,
        warpActive,
        triggerWarp,
        endWarp,
        laserActive,
        setLaserActive: handleSetLaserActive,
        archiveItems,
        setArchiveItems: handleSetArchiveItems,
        inspectedArchiveId,
        setInspectedArchiveId: handleSetInspectedArchiveId,
      }}
    >
      {children}
    </SpatialContext.Provider>
  );
}

export function useSpatialZone() {
  return useContext(SpatialContext);
}
