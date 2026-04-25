/**
 * DealHunterDashboard — Explore tab deal feed.
 *
 * Architecture:
 *   - On mount, loads watchlist queries from AsyncStorage (key "EVANAI_WATCHLIST")
 *   - Instantiates AutonomousDealHunter from scanService with those queries
 *   - Enriches each DealAlert → EnrichedDealAlert (adds reason, action, ROI)
 *   - Renders a feed of DealFeedCards
 *   - Sweep state: idle / sweeping indicator
 *   - Empty state: shows watchlist CTA so user knows how to power the feed
 *   - Manual refresh button
 *
 * Safety:
 *   - Hunter is stopped on unmount
 *   - No duplicate sweep timers — AutonomousDealHunter deduplicates internally
 *   - Max 40 alerts in memory before oldest are removed
 *   - Dismissed alerts are hidden (stored in local Set, not persisted — resets per session)
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { C, SP, R, TY } from "../design/DS";
import { AutonomousDealHunter, type DealAlert } from "../../services/scanService";
import type { EnrichedDealAlert } from "../../services/revenue/RevenueTypes";
import { DealFeedCard } from "./DealFeedCard";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_ALERTS        = 40;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000; // 10 min
const MIN_DEAL_SCORE    = 0.60;

// Watchlist AsyncStorage key — must match the key used in app/index.tsx
const WATCHLIST_KEY = "EVANAI_WATCHLIST";

// ─── Alert enrichment ─────────────────────────────────────────────────────────

function enrichAlert(raw: DealAlert): EnrichedDealAlert {
  // Estimate resale at 1.4× best price as conservative placeholder
  const estimatedResale   = raw.bestPrice * 1.4;
  const platformFeeAmt    = estimatedResale * 0.15;
  const netProceeds       = estimatedResale - platformFeeAmt;
  const estimatedProfit   = netProceeds - raw.bestPrice;
  const estimatedRoi      = raw.bestPrice > 0
    ? Math.round((estimatedProfit / raw.bestPrice) * 100)
    : null;

  const v = raw.verdict.toUpperCase();

  // Human-readable "why it matters"
  const reason =
    v.includes("GREAT") || v.includes("FLIP")
      ? `Estimated ${estimatedProfit > 0 ? `$${estimatedProfit.toFixed(0)} profit` : "flip"} opportunity — rare find at this price.`
      : v.includes("STRONG") || v.includes("BUY")
      ? `Strong buy signal at $${raw.bestPrice.toFixed(2)} — below market average.`
      : `Price movement detected — worth checking before it's gone.`;

  // "What to do"
  const action =
    v.includes("GREAT") || v.includes("FLIP")
      ? "Buy fast — high-demand items like this rarely last 24h."
      : v.includes("STRONG")
      ? "Check listing before market corrects."
      : "Monitor — set a lower alert price if not a fit.";

  return {
    ...raw,
    source: null,  // DealAlert doesn't expose source yet — populated when server adds it
    estimatedProfit: estimatedProfit > 0 ? Math.round(estimatedProfit * 100) / 100 : null,
    estimatedRoi,
    reason,
    action,
    dismissed: false,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface DealHunterDashboardProps {
  apiBase: string;
  userId?: string | null;
}

export function DealHunterDashboard({ apiBase, userId }: DealHunterDashboardProps) {
  const insets                = useSafeAreaInsets();
  const [alerts, setAlerts]   = useState<EnrichedDealAlert[]>([]);
  const [sweepState, setSweepState] = useState<"idle" | "sweeping">("idle");
  const [queries, setQueries] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const hunterRef   = useRef<AutonomousDealHunter | null>(null);
  const dismissedRef = useRef<Set<string>>(new Set());

  // ── Load watchlist queries ───────────────────────────────────────────────────

  const loadQueries = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(WATCHLIST_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      // Handle both array-of-strings and array-of-objects
      const qs: string[] = Array.isArray(parsed)
        ? parsed.map((item: any) =>
            typeof item === "string" ? item : String(item?.query || item?.title || "")
          ).filter(Boolean)
        : [];
      setQueries(qs);
      return qs;
    } catch {
      return [];
    }
  }, []);

  // ── Alert handler ────────────────────────────────────────────────────────────

  const handleAlert = useCallback((raw: DealAlert) => {
    if (dismissedRef.current.has(raw.id)) return;
    setAlerts((prev) => {
      // Dedup by id
      if (prev.some((a) => a.id === raw.id)) return prev;
      const enriched = enrichAlert(raw);
      const next = [enriched, ...prev];
      // Cap at MAX_ALERTS
      return next.slice(0, MAX_ALERTS);
    });
  }, []);

  // ── Start hunter ─────────────────────────────────────────────────────────────

  const startHunter = useCallback(async (qs: string[]) => {
    if (!apiBase || !qs.length) return;

    if (hunterRef.current) {
      hunterRef.current.stop();
    }

    const hunter = new AutonomousDealHunter({
      apiBase,
      intervalMs: SWEEP_INTERVAL_MS,
      minDealScore: MIN_DEAL_SCORE,
      onAlert: handleAlert,
      onSweepStart: () => setSweepState("sweeping"),
      onSweepComplete: () => setSweepState("idle"),
    });
    hunter.setQueries(qs);
    hunter.start();
    hunterRef.current = hunter;
  }, [apiBase, handleAlert]);

  // ── Init ─────────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadQueries().then((qs) => {
      if (qs?.length) startHunter(qs);
    });

    return () => {
      hunterRef.current?.stop();
      hunterRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  // ── Manual refresh ────────────────────────────────────────────────────────────

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    const qs = await loadQueries();
    if (qs?.length) {
      hunterRef.current?.stop();
      await startHunter(qs);
    }
    setRefreshing(false);
  }, [loadQueries, startHunter]);

  // ── Dismiss ───────────────────────────────────────────────────────────────────

  const handleDismiss = useCallback((id: string) => {
    dismissedRef.current.add(id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────────

  const visibleAlerts = alerts.filter((a) => !a.dismissed);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="flash" size={18} color="rgba(100,255,180,0.85)" />
          <Text style={styles.title}>Deal Hunter</Text>
          {sweepState === "sweeping" ? (
            <ActivityIndicator size="small" color="rgba(100,255,180,0.70)" style={{ marginLeft: 6 }} />
          ) : null}
        </View>

        <View style={styles.headerRight}>
          {queries.length > 0 ? (
            <View style={styles.watchlistBadge}>
              <Ionicons name="heart" size={10} color="rgba(255,59,85,0.80)" />
              <Text style={styles.watchlistCount}>{queries.length}</Text>
            </View>
          ) : null}
          <TouchableOpacity
            onPress={handleRefresh}
            hitSlop={10}
            style={styles.refreshBtn}
            disabled={sweepState === "sweeping" || refreshing}
          >
            <Ionicons
              name="refresh-outline"
              size={18}
              color="rgba(255,255,255,0.55)"
            />
          </TouchableOpacity>
        </View>
      </View>

      {queries.length === 0 ? (
        // ── Empty state: no watchlist ──
        <View style={styles.emptyWrap}>
          <Ionicons name="heart-outline" size={48} color="rgba(255,255,255,0.14)" />
          <Text style={styles.emptyTitle}>No tracked items yet</Text>
          <Text style={styles.emptySub}>
            Save items to your watchlist during a scan — the deal hunter will alert you when prices drop.
          </Text>
          <View style={styles.emptyHint}>
            <Ionicons name="scan-outline" size={13} color="rgba(100,255,180,0.60)" />
            <Text style={styles.emptyHintText}>Tap ♡ on any result card to start tracking</Text>
          </View>
        </View>
      ) : visibleAlerts.length === 0 ? (
        // ── Watching, no alerts yet ──
        <ScrollView
          contentContainerStyle={styles.watchingWrap}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="rgba(100,255,180,0.60)"
            />
          }
        >
          <Ionicons name="eye-outline" size={40} color="rgba(255,255,255,0.14)" />
          <Text style={styles.watchingTitle}>Watching {queries.length} {queries.length === 1 ? "item" : "items"}</Text>
          <Text style={styles.watchingSub}>
            {sweepState === "sweeping"
              ? "Scanning markets now…"
              : "Scanning every 10 minutes. You'll see alerts here when strong deals appear."}
          </Text>
          <View style={styles.queriesList}>
            {queries.slice(0, 5).map((q, i) => (
              <View key={i} style={styles.queryChip}>
                <Ionicons name="pricetag-outline" size={10} color="rgba(255,255,255,0.40)" />
                <Text style={styles.queryChipText} numberOfLines={1}>{q}</Text>
              </View>
            ))}
            {queries.length > 5 ? (
              <View style={styles.queryChip}>
                <Text style={styles.queryChipText}>+{queries.length - 5} more</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      ) : (
        // ── Alert feed ──
        <ScrollView
          contentContainerStyle={[styles.feed, { paddingBottom: insets.bottom + SP.xxl }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="rgba(100,255,180,0.60)"
            />
          }
        >
          {sweepState === "sweeping" ? (
            <View style={styles.sweepBar}>
              <ActivityIndicator size="small" color="rgba(100,255,180,0.70)" />
              <Text style={styles.sweepText}>Hunting for deals…</Text>
            </View>
          ) : null}

          {visibleAlerts.map((alert, i) => (
            <DealFeedCard
              key={alert.id}
              alert={alert}
              index={i}
              userId={userId}
              onDismiss={handleDismiss}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SP.xl,
    paddingTop: SP.lg,
    paddingBottom: SP.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    ...TY.h1,
    color: C.text,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
  },
  watchlistBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: R.pill,
    backgroundColor: "rgba(255,59,85,0.10)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,59,85,0.22)",
  },
  watchlistCount: {
    fontSize: 10,
    fontWeight: "800",
    color: "rgba(255,59,85,0.80)",
  },
  refreshBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: R.sm,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.09)",
  },

  // ── Feed ─────────────────────────────────────────────────────────────────
  feed: {
    paddingHorizontal: SP.lg,
    paddingTop: SP.md,
  },
  sweepBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: SP.sm,
    marginBottom: SP.md,
    borderRadius: R.sm,
    backgroundColor: "rgba(100,255,180,0.05)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(100,255,180,0.14)",
  },
  sweepText: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(100,255,180,0.70)",
  },

  // ── Empty states ──────────────────────────────────────────────────────────
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SP.xxxl,
    gap: SP.md,
  },
  emptyTitle: {
    ...TY.h2,
    color: C.text3,
    textAlign: "center",
  },
  emptySub: {
    ...TY.body,
    color: C.text4,
    textAlign: "center",
    lineHeight: 21,
  },
  emptyHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: SP.sm,
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm,
    borderRadius: R.md,
    backgroundColor: "rgba(100,255,180,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(100,255,180,0.16)",
  },
  emptyHintText: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(100,255,180,0.60)",
  },

  watchingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SP.xxxl,
    paddingTop: SP.xxxl,
    gap: SP.md,
  },
  watchingTitle: {
    ...TY.h2,
    color: C.text2,
    textAlign: "center",
  },
  watchingSub: {
    fontSize: 13,
    fontWeight: "500",
    color: C.text4,
    textAlign: "center",
    lineHeight: 19,
  },
  queriesList: {
    marginTop: SP.md,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SP.sm,
    justifyContent: "center",
  },
  queryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: SP.md,
    paddingVertical: 6,
    borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)",
    maxWidth: 180,
  },
  queryChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: C.text3,
    flexShrink: 1,
  },
});
