/**
 * LocalRadar — Feature 3: Local Deal Radar
 * Shows watchlist items available near you with prices and sources.
 * Fetches from /api/radar/local using user's zip code.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SP, R, TY } from "../design/DS";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RadarItem {
  title: string;
  price: number;
  source: string;
  thumbnail: string | null;
  url?: string;
}

export interface RadarResult {
  query: string;
  low: number;
  median: number;
  count: number;
  items: RadarItem[];
}

export interface RadarData {
  zipCode: string;
  results: RadarResult[];
}

interface LocalRadarProps {
  data: RadarData | null;
  loading: boolean;
  zipCode: string;
  watchlistQueries: string[];
  watchlistTargets: Record<string, number>;  // query → target price
  apiBase: string;
  onRefresh: () => void;
  onPressItem?: (url: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) { return `$${n.toFixed(0)}`; }

function sourceIcon(source: string): string {
  const s = source.toLowerCase();
  if (s.includes("ebay")) return "🛒";
  if (s.includes("facebook") || s.includes("fb") || s.includes("marketplace")) return "📘";
  if (s.includes("offerup") || s.includes("offer up")) return "🔵";
  if (s.includes("craigslist")) return "📋";
  if (s.includes("amazon")) return "📦";
  return "🏪";
}

// ─── Deal Card ───────────────────────────────────────────────────────────────

function DealCard({ item, targetPrice, onPress }: {
  item: RadarItem;
  targetPrice?: number;
  onPress?: () => void;
}) {
  const isBelowTarget = targetPrice != null && item.price <= targetPrice;
  const dealColor = isBelowTarget ? "#50ff96" : "rgba(255,255,255,0.75)";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.dealCard,
        isBelowTarget && styles.dealCardHot,
        pressed && { opacity: 0.8 },
      ]}
    >
      {item.thumbnail ? (
        <Image source={{ uri: item.thumbnail }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback]}>
          <Text style={{ fontSize: 18 }}>{sourceIcon(item.source)}</Text>
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.dealTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.dealSource}>{sourceIcon(item.source)} {item.source}</Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 3 }}>
        <Text style={[styles.dealPrice, { color: dealColor }]}>{fmt(item.price)}</Text>
        {isBelowTarget && (
          <View style={styles.hotBadge}>
            <Text style={styles.hotBadgeText}>🔥 Under target</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ─── Query Section ───────────────────────────────────────────────────────────

function QuerySection({ result, targetPrice, onPressItem }: {
  result: RadarResult;
  targetPrice?: number;
  onPressItem?: (url: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hotDeals = result.items.filter((it) => targetPrice != null && it.price <= targetPrice);
  const displayItems = expanded ? result.items : result.items.slice(0, 2);

  return (
    <View style={styles.querySection}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={styles.queryHeader}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.queryName} numberOfLines={1}>{result.query}</Text>
          <Text style={styles.queryMeta}>
            {result.count} found · low {fmt(result.low)} · median {fmt(result.median)}
            {hotDeals.length > 0 ? ` · 🔥 ${hotDeals.length} under target` : ""}
          </Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={14}
          color="rgba(255,255,255,0.35)"
        />
      </Pressable>

      {displayItems.map((item, i) => (
        <DealCard
          key={i}
          item={item}
          targetPrice={targetPrice}
          onPress={() => {
            if (item.url) onPressItem?.(item.url);
          }}
        />
      ))}

      {!expanded && result.items.length > 2 && (
        <Pressable onPress={() => setExpanded(true)} style={styles.showMoreBtn}>
          <Text style={styles.showMoreText}>+{result.items.length - 2} more</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Main LocalRadar ──────────────────────────────────────────────────────────

export function LocalRadar({
  data,
  loading,
  zipCode,
  watchlistQueries,
  watchlistTargets,
  apiBase: _apiBase,
  onRefresh,
  onPressItem,
}: LocalRadarProps) {

  if (!zipCode) {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.badge}>
            <Ionicons name="radio-outline" size={13} color="#82c8ff" />
            <Text style={styles.badgeText}>Local Radar</Text>
          </View>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Set your zip code to activate</Text>
          <Text style={styles.emptySub}>Radar scans local deals matching your watchlist within your area.</Text>
        </View>
      </View>
    );
  }

  if (watchlistQueries.length === 0) {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.badge}>
            <Ionicons name="radio-outline" size={13} color="#82c8ff" />
            <Text style={styles.badgeText}>Local Radar</Text>
          </View>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Add items to your watchlist</Text>
          <Text style={styles.emptySub}>Radar will show local deals for everything you&apos;re tracking.</Text>
        </View>
      </View>
    );
  }

  const totalHot = data?.results.reduce((sum, r) => {
    const target = watchlistTargets[r.query];
    return sum + (target ? r.items.filter((it) => it.price <= target).length : 0);
  }, 0) ?? 0;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.badge}>
          <Ionicons name="radio-outline" size={13} color="#82c8ff" />
          <Text style={styles.badgeText}>Local Radar</Text>
        </View>
        {data && (
          <Text style={styles.zipLabel}>📍 {data.zipCode}</Text>
        )}
        {totalHot > 0 && (
          <View style={styles.hotCountBadge}>
            <Text style={styles.hotCountText}>🔥 {totalHot} hot deal{totalHot !== 1 ? "s" : ""}</Text>
          </View>
        )}
        <Pressable
          onPress={onRefresh}
          style={({ pressed }) => [styles.refreshBtn, pressed && { opacity: 0.7 }]}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator size="small" color="#82c8ff" />
            : <Ionicons name="refresh-outline" size={14} color="#82c8ff" />}
        </Pressable>
      </View>

      {/* Loading state */}
      {loading && !data && (
        <View style={styles.loadRow}>
          <ActivityIndicator size="small" color="rgba(130,200,255,0.7)" />
          <Text style={styles.loadText}>Scanning {watchlistQueries.length} items near {zipCode}…</Text>
        </View>
      )}

      {/* Results */}
      {data && data.results.length > 0 ? (
        <View style={{ gap: SP.sm }}>
          {data.results.map((result, i) => (
            <QuerySection
              key={i}
              result={result}
              targetPrice={watchlistTargets[result.query]}
              onPressItem={onPressItem}
            />
          ))}
        </View>
      ) : data && !loading ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No local deals found</Text>
          <Text style={styles.emptySub}>Try refreshing or widening your search. Markets change daily.</Text>
        </View>
      ) : null}

      {/* Last updated */}
      {data && (
        <Text style={styles.updatedText}>
          Tap refresh to re-scan · {data.results.length} watchlist item{data.results.length !== 1 ? "s" : ""} checked
        </Text>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    marginTop: SP.md,
    padding: SP.md,
    borderRadius: R.md,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(130,200,255,0.18)",
    gap: SP.sm,
  },
  headerRow: {
    flexDirection: "row", alignItems: "center", gap: SP.sm, flexWrap: "wrap",
  },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(130,200,255,0.08)",
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: R.pill,
  },
  badgeText: { ...TY.label, fontSize: 11, fontWeight: "700", color: "#82c8ff" },
  zipLabel: { ...TY.cap, color: "rgba(255,255,255,0.45)", fontSize: 10 },
  hotCountBadge: {
    backgroundColor: "rgba(255,100,50,0.12)", borderRadius: R.pill,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  hotCountText: { ...TY.cap, color: "#ffa040", fontSize: 10, fontWeight: "700" },
  refreshBtn: { marginLeft: "auto", padding: 6 },
  loadRow: {
    flexDirection: "row", alignItems: "center", gap: SP.sm, paddingVertical: SP.xs,
  },
  loadText: { ...TY.cap, color: "rgba(130,200,255,0.7)", fontSize: 11 },
  querySection: { gap: 6 },
  queryHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 4,
  },
  queryName: { ...TY.label, color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "700" },
  queryMeta: { ...TY.cap, color: "rgba(255,255,255,0.35)", fontSize: 9, marginTop: 1 },
  dealCard: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: R.sm, padding: 8,
    borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.06)",
  },
  dealCardHot: {
    backgroundColor: "rgba(80,255,150,0.05)",
    borderColor: "rgba(80,255,150,0.15)",
  },
  thumb: { width: 44, height: 44, borderRadius: R.sm, backgroundColor: "rgba(255,255,255,0.08)" },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  dealTitle: { ...TY.label, color: "rgba(255,255,255,0.75)", fontSize: 11, lineHeight: 15 },
  dealSource: { ...TY.cap, color: "rgba(255,255,255,0.35)", fontSize: 9, marginTop: 1 },
  dealPrice: { fontSize: 15, fontWeight: "900" },
  hotBadge: {
    backgroundColor: "rgba(80,255,150,0.12)", borderRadius: R.pill,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  hotBadgeText: { ...TY.cap, color: "#50ff96", fontSize: 8, fontWeight: "700" },
  showMoreBtn: { alignItems: "center", paddingVertical: 4 },
  showMoreText: { ...TY.cap, color: "rgba(130,200,255,0.5)", fontSize: 10 },
  emptyState: { alignItems: "center", paddingVertical: SP.md, gap: 4 },
  emptyTitle: { ...TY.label, color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "700" },
  emptySub: { ...TY.cap, color: "rgba(255,255,255,0.3)", fontSize: 11, textAlign: "center" },
  updatedText: { ...TY.cap, color: "rgba(255,255,255,0.2)", fontSize: 9, textAlign: "center" },
});
