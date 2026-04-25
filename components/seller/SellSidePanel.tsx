/**
 * SellSidePanel — Seller-mode intelligence sheet.
 *
 * Shows:
 *   - Estimated sell price (quick / market / premium tiers)
 *   - Platform recommendation with reasoning
 *   - Listing title suggestions (optimized for search)
 *   - Expected sell window in days
 *   - Price optimization hint
 *
 * Fetches data from /sell/estimate endpoint on open (lazy — only if shown).
 * Renders as a bottom sheet modal. Independent of buyer mode — no collisions.
 *
 * Usage:
 *   <SellSidePanel
 *     visible={showSellPanel}
 *     query="Nike Air Jordan 1 Mid Bred"
 *     scannedPrice={45}
 *     apiBase="https://..."
 *     userId="user_123"
 *     onClose={() => setShowSellPanel(false)}
 *   />
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { C, SP, R, TY, fmtMoney, IOS } from "../design/DS";
import type { SellEstimate, SellerIntel } from "../../services/revenue/RevenueTypes";
import { EventTracker } from "../../services/revenue/EventTracker";

// ─── Title suggestion builder ─────────────────────────────────────────────────

function buildTitleSuggestions(
  query: string,
  bestMarketplace: string | null
): string[] {
  const base  = query.trim();
  const mp    = bestMarketplace ? String(bestMarketplace).toLowerCase() : "";
  const isEbay = mp.includes("ebay");
  const sugg: string[] = [];

  // Exact + condition
  sugg.push(`${base} — Excellent Condition`);

  // Platform-tailored
  if (isEbay) {
    sugg.push(`${base} | Verified Authentic | Fast Ship`);
  } else {
    sugg.push(`${base} | Like New | Smoke Free`);
  }

  // Abbreviated for character-limited platforms (Poshmark, Depop)
  const words = base.split(" ").slice(0, 5).join(" ");
  sugg.push(`${words} VGC Low Price`);

  return sugg;
}

function buildPlatformRanking(
  bestMarketplace: string | null,
  query: string
): { name: string; reason: string }[] {
  const q = query.toLowerCase();
  const isShoe    = /shoe|sneaker|jordan|yeezy|nike|adidas|new balance/i.test(q);
  const isClothing = /shirt|hoodie|jacket|pants|dress|coat|supreme/i.test(q);
  const isElec    = /iphone|macbook|laptop|camera|lens|console|nintendo|sony|ps5/i.test(q);

  if (isShoe) {
    return [
      { name: "StockX",    reason: "Highest prices for authentication-verified sneakers" },
      { name: "GOAT",      reason: "Large buyer base, competitive fees" },
      { name: "eBay",      reason: "Fastest volume, lower overhead for non-hype drops" },
    ];
  }
  if (isClothing) {
    return [
      { name: "Grailed",   reason: "Best for menswear — strong streetwear demand" },
      { name: "Depop",     reason: "Gen-Z buyer base — great for vintage / branded" },
      { name: "Poshmark",  reason: "Established women's + unisex market" },
    ];
  }
  if (isElec) {
    return [
      { name: "eBay",      reason: "Deepest electronics buyer pool, fast comps" },
      { name: "Swappa",    reason: "Phone/tablet specialist — higher trust, less friction" },
      { name: "Facebook Marketplace", reason: "Zero fees — best for bulky or local items" },
    ];
  }

  // Default
  const platforms = [
    { name: bestMarketplace || "eBay", reason: "Most active market for this item type" },
    { name: "Mercari",                 reason: "Low fees, growing buyer base" },
    { name: "Facebook Marketplace",    reason: "Zero fees — good for local pickup" },
  ];
  return platforms.filter((p, i, a) => a.findIndex((x) => x.name === p.name) === i);
}

// ─── Sheet animation height ───────────────────────────────────────────────────
const SHEET_H = 520;

// ─── Component ────────────────────────────────────────────────────────────────

interface SellSidePanelProps {
  visible: boolean;
  query: string;
  scannedPrice?: number | null;
  apiBase: string;
  userId?: string | null;
  onClose: () => void;
}

export function SellSidePanel({
  visible,
  query,
  scannedPrice,
  apiBase,
  userId,
  onClose,
}: SellSidePanelProps) {
  const insets = useSafeAreaInsets();
  const [intel, setIntel]     = useState<SellerIntel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const translateY = useSharedValue(SHEET_H);
  const backdropOp = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 26, stiffness: 200, mass: 1.0 });
      backdropOp.value = withTiming(1, { duration: 280 });
      fetchEstimate();
      EventTracker.track("seller_panel_open", {
        itemName: query,
        price: scannedPrice ?? null,
        userId,
      } as any);
    } else {
      translateY.value = withSpring(SHEET_H + 40, { damping: 28, stiffness: 240 });
      backdropOp.value = withTiming(0, { duration: 200 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const sheetStyle    = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOp.value }));

  const fetchEstimate = useCallback(async () => {
    if (!query || !apiBase) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/sell/estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, scannedPrice: scannedPrice ?? undefined }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error ?? "estimate_failed");

      const estimate: SellEstimate = json.payload ?? {};
      const titles  = buildTitleSuggestions(query, estimate.bestMarketplace);
      const platforms = buildPlatformRanking(estimate.bestMarketplace, query);

      const profit = (estimate.estimatedSellPrice ?? 0) - (scannedPrice ?? 0);
      const pricingTier: SellerIntel["pricingTier"] =
        profit > 50 ? "premium" :
        profit > 20 ? "market"  :
        "quick";

      const pricingAdvice =
        pricingTier === "premium"
          ? `List at ${fmtMoney(estimate.suggestedListPrice)} to maximize return. Market has room.`
          : pricingTier === "market"
          ? `${fmtMoney(estimate.estimatedSellPrice)} is fair — expect ${estimate.expectedSellWindowDays ?? 7}d sell window.`
          : `List at ${fmtMoney(estimate.quickSalePrice)} for fast cash — prioritize volume over margin.`;

      setIntel({ estimate, titleSuggestions: titles, pricingTier, pricingAdvice, platformRanking: platforms });
    } catch (err: any) {
      setError("Couldn't fetch sell estimate — try again");
    } finally {
      setLoading(false);
    }
  }, [query, scannedPrice, apiBase]);

  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType="none"
      visible={visible}
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
    >
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle, styles.backdrop]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: Math.max(insets.bottom, SP.xl) },
          sheetStyle,
        ]}
      >
        {IOS ? <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} /> : null}
        <View style={styles.sheetBg} />

        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.sheetHeader}>
          <View style={styles.sheetTitleRow}>
            <Ionicons name="storefront-outline" size={15} color="rgba(255,210,80,0.80)" />
            <Text style={styles.sheetTitle}>SELL THIS ITEM</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={18} color={C.text4} />
          </TouchableOpacity>
        </View>

        {/* Item name */}
        <Text style={styles.queryLabel} numberOfLines={2}>{query}</Text>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color="rgba(255,210,80,0.70)" />
            <Text style={styles.loadingText}>Analyzing sell potential…</Text>
          </View>
        ) : error ? (
          <View style={styles.errorWrap}>
            <Ionicons name="warning-outline" size={22} color={C.warn} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={fetchEstimate} style={styles.retryBtn}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : intel ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            {/* ── Price tiers ── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>SELL PRICE TARGETS</Text>
              <View style={styles.priceTiersRow}>
                {[
                  { label: "QUICK SALE", value: intel.estimate.quickSalePrice, accent: "rgba(100,200,255,0.80)" },
                  { label: "MARKET",     value: intel.estimate.estimatedSellPrice, accent: "rgba(255,255,255,0.90)" },
                  { label: "PREMIUM",    value: intel.estimate.suggestedListPrice, accent: "rgba(255,210,80,0.90)" },
                ].map((t) => (
                  <View key={t.label} style={styles.priceTier}>
                    <Text style={[styles.priceTierAmount, { color: t.accent }]}>
                      {fmtMoney(t.value)}
                    </Text>
                    <Text style={styles.priceTierLabel}>{t.label}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.pricingAdvice}>{intel.pricingAdvice}</Text>
              {intel.estimate.expectedSellWindowDays ? (
                <View style={styles.sellWindowRow}>
                  <Ionicons name="time-outline" size={11} color={C.text4} />
                  <Text style={styles.sellWindowText}>
                    Estimated sell window: {intel.estimate.expectedSellWindowDays} days
                  </Text>
                </View>
              ) : null}
            </View>

            {/* ── Platform ranking ── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>WHERE TO LIST</Text>
              {intel.platformRanking.map((p, i) => (
                <View key={p.name} style={[styles.platformRow, i < intel.platformRanking.length - 1 && styles.platformRowBorder]}>
                  <View style={styles.platformLeft}>
                    <View style={[styles.platformRankBadge, i === 0 && styles.platformRankBadge1]}>
                      <Text style={[styles.platformRank, i === 0 && styles.platformRank1]}>{i + 1}</Text>
                    </View>
                    <Text style={styles.platformName}>{p.name}</Text>
                  </View>
                  <Text style={styles.platformReason} numberOfLines={2}>{p.reason}</Text>
                </View>
              ))}
            </View>

            {/* ── Title suggestions ── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>OPTIMIZED LISTING TITLES</Text>
              {intel.titleSuggestions.map((t, i) => (
                <View key={i} style={styles.titleRow}>
                  <View style={styles.titleNumberBadge}>
                    <Text style={styles.titleNumber}>{i + 1}</Text>
                  </View>
                  <Text style={styles.titleText}>{t}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: SHEET_H,
    borderTopLeftRadius: R.xxl,
    borderTopRightRadius: R.xxl,
    overflow: "hidden",
    backgroundColor: IOS ? "transparent" : "rgba(10,10,10,0.97)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.09)",
  },
  sheetBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10,10,10,0.90)",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignSelf: "center",
    marginTop: SP.md,
    marginBottom: SP.sm,
  },

  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SP.xl,
    marginBottom: SP.xs,
  },
  sheetTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sheetTitle: {
    ...TY.cap,
    color: "rgba(255,210,80,0.80)",
    letterSpacing: 1.2,
  },

  queryLabel: {
    ...TY.h2,
    color: C.text,
    paddingHorizontal: SP.xl,
    marginBottom: SP.md,
  },

  // ── Loading / Error ────────────────────────────────────────────────────────
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: SP.md,
    paddingBottom: SP.xxxl,
  },
  loadingText: {
    ...TY.label,
    color: C.text4,
  },
  errorWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: SP.sm,
    paddingHorizontal: SP.xxxl,
  },
  errorText: {
    ...TY.label,
    color: C.text3,
    textAlign: "center",
  },
  retryBtn: {
    paddingHorizontal: SP.lg,
    paddingVertical: SP.sm,
    borderRadius: R.md,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginTop: SP.xs,
  },
  retryText: {
    ...TY.label,
    color: C.text2,
  },

  // ── Content ─────────────────────────────────────────────────────────────────
  content: {
    paddingHorizontal: SP.xl,
    gap: SP.lg,
    paddingBottom: SP.lg,
  },
  section: {
    gap: SP.sm,
  },
  sectionTitle: {
    ...TY.cap,
    color: C.text4,
    letterSpacing: 1.0,
    marginBottom: 2,
  },

  // ── Price tiers ────────────────────────────────────────────────────────────
  priceTiersRow: {
    flexDirection: "row",
    gap: SP.sm,
  },
  priceTier: {
    flex: 1,
    alignItems: "center",
    paddingVertical: SP.sm,
    borderRadius: R.sm,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.09)",
    gap: 3,
  },
  priceTierAmount: {
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  priceTierLabel: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: C.text4,
    textTransform: "uppercase",
  },
  pricingAdvice: {
    fontSize: 11,
    fontWeight: "600",
    color: C.text3,
    lineHeight: 16,
  },
  sellWindowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  sellWindowText: {
    fontSize: 10,
    fontWeight: "600",
    color: C.text4,
  },

  // ── Platform ranking ──────────────────────────────────────────────────────
  platformRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SP.md,
    paddingVertical: SP.sm,
  },
  platformRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  platformLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minWidth: 100,
  },
  platformRankBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  platformRankBadge1: {
    backgroundColor: "rgba(255,210,80,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,210,80,0.28)",
  },
  platformRank: {
    fontSize: 10,
    fontWeight: "800",
    color: C.text4,
  },
  platformRank1: {
    color: "rgba(255,210,80,0.88)",
  },
  platformName: {
    fontSize: 13,
    fontWeight: "800",
    color: C.text,
  },
  platformReason: {
    flex: 1,
    fontSize: 10,
    fontWeight: "500",
    color: C.text3,
    lineHeight: 14,
  },

  // ── Title suggestions ──────────────────────────────────────────────────────
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SP.sm,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  titleNumberBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    flexShrink: 0,
  },
  titleNumber: {
    fontSize: 9,
    fontWeight: "800",
    color: C.text4,
  },
  titleText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: C.text2,
    lineHeight: 17,
  },
});
