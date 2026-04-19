/**
 * PriceHistoryChart — pure-View sparkline, no external chart dependencies.
 *
 * Renders a thin price-band area chart using absolute-positioned Views.
 * Shows low/median/high range over time with a labelled x-axis.
 */
import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { C, SP, TY } from "../design/DS";

const SERVER = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";

export interface PriceChartPoint {
  ts: number;
  date: string;
  low: number | null;
  median: number | null;
  high: number | null;
}

interface ChartSummary {
  rollingLow: number | null;
  rollingMedian: number | null;
  rollingHigh: number | null;
  points: number;
  firstSeenAt: number | null;
  lastSeenAt: number | null;
}

interface PriceHistoryChartProps {
  query: string;
  /** Inline chart points (passed directly from scan response if available) */
  chartPoints?: PriceChartPoint[];
  summary?: ChartSummary | null;
  /** Height of chart area (default 64) */
  height?: number;
  /** Width of chart area */
  width: number;
}

const CHART_PAD_V = 6;

function normalize(val: number, min: number, max: number, height: number): number {
  if (max === min) return height / 2;
  return height - CHART_PAD_V - ((val - min) / (max - min)) * (height - CHART_PAD_V * 2);
}

export function PriceHistoryChart({
  query,
  chartPoints: inlinePts,
  summary: inlineSummary,
  height = 64,
  width,
}: PriceHistoryChartProps) {
  const [pts, setPts]         = useState<PriceChartPoint[]>(inlinePts || []);
  const [summary, setSummary] = useState<ChartSummary | null>(inlineSummary || null);
  const [loading, setLoading] = useState(!inlinePts?.length);

  const fetchHistory = useCallback(async () => {
    if (!query) return;
    try {
      setLoading(true);
      const r = await fetch(`${SERVER}/api/price-history?q=${encodeURIComponent(query)}`, {
        signal: AbortSignal.timeout(8000),
      });
      const json = await r.json();
      if (json.ok && Array.isArray(json.chartPoints) && json.chartPoints.length) {
        setPts(json.chartPoints);
        if (json.summary) setSummary(json.summary);
      }
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (!inlinePts?.length) {
      fetchHistory();
    } else {
      setPts(inlinePts);
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, inlinePts]);

  if (loading) {
    return (
      <View style={[styles.container, { height, width }]}>
        <ActivityIndicator size="small" color={C.text4} />
      </View>
    );
  }

  // Need at least 2 points to draw a chart
  const validPts = pts.filter(
    (p) => p.median != null || p.low != null
  );
  if (validPts.length < 2) {
    return (
      <View style={[styles.container, { height, width }]}>
        <Text style={styles.noDataText}>Not enough history yet</Text>
      </View>
    );
  }

  const allVals = validPts.flatMap((p) => [p.low, p.median, p.high].filter((v): v is number => v != null));
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);

  const slotCount = validPts.length;
  const slotW = width / slotCount;

  return (
    <View style={[styles.container, { height, width }]}>
      {validPts.map((p, i) => {
        const medianY = normalize(p.median ?? p.low ?? minVal, minVal, maxVal, height);
        const lowY    = normalize(p.low  ?? p.median ?? minVal, minVal, maxVal, height);
        const highY   = normalize(p.high ?? p.median ?? maxVal, minVal, maxVal, height);
        const barH    = Math.max(lowY - highY, 2);
        const cx      = i * slotW + slotW * 0.5 - 1;

        return (
          <React.Fragment key={`pt-${i}`}>
            {/* Low–high range bar */}
            <View
              style={{
                position: "absolute",
                left: cx,
                top: highY,
                width: 2,
                height: barH,
                borderRadius: 1,
                backgroundColor: "rgba(255,255,255,0.12)",
              }}
            />
            {/* Median dot */}
            <View
              style={{
                position: "absolute",
                left: cx - 1,
                top: medianY - 2,
                width: 4,
                height: 4,
                borderRadius: 2,
                backgroundColor: "rgba(120,255,180,0.85)",
              }}
            />
          </React.Fragment>
        );
      })}

      {/* Price range labels */}
      {summary && (
        <View style={styles.labels}>
          {summary.rollingLow != null && (
            <Text style={styles.labelText}>${summary.rollingLow.toFixed(0)}</Text>
          )}
          {summary.rollingMedian != null && (
            <Text style={[styles.labelText, styles.labelCenter]}>
              avg ${summary.rollingMedian.toFixed(0)}
            </Text>
          )}
          {summary.rollingHigh != null && (
            <Text style={[styles.labelText, styles.labelRight]}>
              ${summary.rollingHigh.toFixed(0)}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  noDataText: {
    ...TY.cap,
    color: C.text4,
    fontSize: 10,
  },
  labels: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    paddingHorizontal: SP.xs,
  },
  labelText: {
    ...TY.cap,
    color: C.text4,
    fontSize: 9,
  },
  labelCenter: {
    flex: 1,
    textAlign: "center",
  },
  labelRight: {
    marginLeft: "auto",
  },
});
