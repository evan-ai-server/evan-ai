/**
 * CommunityCompsPanel — shows aggregate community price data for a scanned item.
 *
 * On mount: submits the scanned price as a comp (POST /api/community/comp)
 * then fetches aggregate stats (GET /api/community/comps?query=...).
 * Shows avg paid, avg sold, distribution bar, and count badge.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated as RNAnimated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, SP, R, TY, fmtMoney } from "../design/DS";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CommunityCompsPanelProps {
  query: string;
  scannedPrice: number | null;
  apiBase: string;
  userId?: string | null;
}

interface CompsData {
  count: number;
  avgPaid: number | null;
  avgSold: number | null;
  low: number | null;
  median: number | null;
  high: number | null;
}

// ─── Shimmer skeleton ─────────────────────────────────────────────────────────

function Shimmer({ width, height, style }: { width: number | string; height: number; style?: object }) {
  const opacity = useRef(new RNAnimated.Value(0.3)).current;

  useEffect(() => {
    const loop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(opacity, { toValue: 0.7, duration: 700, useNativeDriver: true }),
        RNAnimated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <RNAnimated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius: R.sm,
          backgroundColor: "rgba(255,255,255,0.12)",
          opacity,
        },
        style,
      ]}
    />
  );
}

// ─── Distribution bar ─────────────────────────────────────────────────────────

function DistributionBar({
  low,
  median,
  high,
}: {
  low: number;
  median: number;
  high: number;
}) {
  const range = high - low;
  if (range <= 0) return null;

  const medianPct = ((median - low) / range) * 100;

  return (
    <View style={barStyles.wrap}>
      {/* Background track */}
      <View style={barStyles.track}>
        {/* Low zone */}
        <View style={[barStyles.segment, barStyles.lowSeg, { flex: Math.max(medianPct / 100, 0.05) }]} />
        {/* High zone */}
        <View style={[barStyles.segment, barStyles.highSeg, { flex: Math.max((100 - medianPct) / 100, 0.05) }]} />
      </View>
      {/* Median marker */}
      <View style={[barStyles.medianMarker, { left: `${Math.min(Math.max(medianPct, 2), 96)}%` as any }]} />
      {/* Labels */}
      <View style={barStyles.labelRow}>
        <Text style={barStyles.labelText}>{fmtMoney(low)}</Text>
        <Text style={[barStyles.labelText, barStyles.medianLabel]}>med {fmtMoney(median)}</Text>
        <Text style={barStyles.labelText}>{fmtMoney(high)}</Text>
      </View>
    </View>
  );
}

const barStyles = StyleSheet.create({
  wrap: {
    marginTop: SP.sm,
    position: "relative",
  },
  track: {
    height: 6,
    borderRadius: R.pill,
    overflow: "hidden",
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  segment: {
    height: "100%",
  },
  lowSeg: {
    backgroundColor: "rgba(100,200,255,0.45)",
  },
  highSeg: {
    backgroundColor: "rgba(40,199,111,0.45)",
  },
  medianMarker: {
    position: "absolute",
    top: -2,
    width: 2,
    height: 10,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.80)",
    transform: [{ translateX: -1 }],
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: SP.xs,
  },
  labelText: {
    ...TY.cap,
    color: C.text4,
    fontSize: 9,
  },
  medianLabel: {
    color: C.text3,
    fontSize: 9,
  },
});

// ─── Main component ───────────────────────────────────────────────────────────

export function CommunityCompsPanel({
  query,
  scannedPrice,
  apiBase,
  userId,
}: CommunityCompsPanelProps) {
  const [comps, setComps] = useState<CompsData | null>(null);
  const [loading, setLoading] = useState(true);
  const prevQuery = useRef<string | null>(null);

  useEffect(() => {
    if (!query || query === prevQuery.current) return;
    prevQuery.current = query;

    let cancelled = false;

    async function load() {
      setLoading(true);

      // Submit comp if we have a valid price
      if (scannedPrice != null && scannedPrice > 0) {
        try {
          await fetch(`${apiBase}/api/community/comp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, type: "paid", price: scannedPrice, userId }),
            signal: AbortSignal.timeout(6000),
          });
        } catch {
          // silently ignore
        }
      }

      // Fetch aggregate stats
      try {
        const resp = await fetch(
          `${apiBase}/api/community/comps?query=${encodeURIComponent(query)}`,
          { signal: AbortSignal.timeout(8000) },
        );
        const json = await resp.json();
        if (!cancelled && json?.ok) {
          setComps({
            count: json.count ?? 0,
            avgPaid: json.avgPaid ?? null,
            avgSold: json.avgSold ?? null,
            low: json.low ?? null,
            median: json.median ?? null,
            high: json.high ?? null,
          });
        }
      } catch {
        // silently ignore — panel just won't show data
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const hasData = comps != null && (comps.avgPaid != null || comps.avgSold != null);
  const isEarly = comps != null && comps.count <= 2;

  // Skeleton
  if (loading) {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Shimmer width={100} height={10} />
          <Shimmer width={48} height={18} style={{ borderRadius: R.pill }} />
        </View>
        <View style={styles.statRow}>
          <Shimmer width="45%" height={36} />
          <Shimmer width="45%" height={36} />
        </View>
      </View>
    );
  }

  if (!hasData) return null;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Ionicons name="people-outline" size={11} color="rgba(120,255,170,0.7)" />
          <Text style={styles.headerTitle}>Community data</Text>
        </View>
        {comps!.count > 0 ? (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{comps!.count} reports</Text>
          </View>
        ) : null}
      </View>

      {/* Early encouragement */}
      {isEarly ? (
        <Text style={styles.earlyText}>Be one of the first to report!</Text>
      ) : null}

      {/* Stat columns */}
      <View style={styles.statRow}>
        {comps!.avgPaid != null ? (
          <View style={styles.statCol}>
            <Text style={styles.statLabel}>AVG PAID</Text>
            <Text style={styles.statValue}>{fmtMoney(comps!.avgPaid)}</Text>
            <Text style={styles.statSub}>what people paid</Text>
          </View>
        ) : null}
        {comps!.avgSold != null ? (
          <View style={[styles.statCol, styles.statColSold]}>
            <Text style={[styles.statLabel, styles.soldLabel]}>AVG SOLD</Text>
            <Text style={[styles.statValue, styles.soldValue]}>{fmtMoney(comps!.avgSold)}</Text>
            <Text style={styles.statSub}>resale price</Text>
          </View>
        ) : null}
      </View>

      {/* Distribution bar */}
      {comps!.low != null && comps!.median != null && comps!.high != null ? (
        <DistributionBar
          low={comps!.low}
          median={comps!.median}
          high={comps!.high}
        />
      ) : null}

      {/* Footer */}
      <Text style={styles.footer}>
        Based on {comps!.count} community {comps!.count === 1 ? "scan" : "scans"}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    marginTop: SP.sm,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: R.md,
    padding: SP.md,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SP.sm,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.xs,
  },
  headerTitle: {
    ...TY.cap,
    color: C.text3,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  countBadge: {
    paddingHorizontal: SP.sm,
    paddingVertical: 3,
    borderRadius: R.pill,
    backgroundColor: "rgba(40,199,111,0.12)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(40,199,111,0.28)",
  },
  countText: {
    ...TY.cap,
    color: "rgba(100,255,170,0.85)",
    fontSize: 9,
    fontWeight: "800",
  },

  earlyText: {
    ...TY.cap,
    color: C.text4,
    fontSize: 10,
    marginBottom: SP.xs,
    fontStyle: "italic",
  },

  statRow: {
    flexDirection: "row",
    gap: SP.sm,
  },
  statCol: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: R.sm,
    padding: SP.sm,
  },
  statColSold: {
    backgroundColor: "rgba(40,199,111,0.06)",
    borderColor: "rgba(40,199,111,0.16)",
  },
  statLabel: {
    ...TY.cap,
    color: C.text4,
    fontSize: 9,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  soldLabel: {
    color: "rgba(100,255,170,0.55)",
  },
  statValue: {
    ...TY.priceSm,
    color: C.text,
    fontSize: 16,
    letterSpacing: -0.2,
  },
  soldValue: {
    color: "rgba(120,255,180,0.92)",
  },
  statSub: {
    ...TY.cap,
    color: C.text4,
    fontSize: 9,
    marginTop: 1,
  },

  footer: {
    ...TY.cap,
    color: C.text4,
    fontSize: 9,
    marginTop: SP.sm,
    textAlign: "center",
  },
});
