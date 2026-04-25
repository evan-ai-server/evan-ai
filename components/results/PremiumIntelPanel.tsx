/**
 * PremiumIntelPanel — Fees-aware premium analytics for result cards.
 *
 * Shows:
 *   - Fees-aware ROI breakdown (costBasis → netProfit after platform fee)
 *   - Deal quality score with tier badge and reasoning bullets
 *   - Market trend signal (rising / falling / stable)
 *   - Sell window estimate
 *   - Platform recommendation
 *   - Confidence explanation
 *
 * FREE TIER: Shows a teaser row ("Unlock full breakdown") + paywall prompt.
 * PRO TIER: Full panel unlocked.
 *
 * Props: pass the raw scan data + isPro + onUnlock callback.
 * This component does all the computation internally — callers pass raw fields.
 *
 * No layout reflow. No async calls. All computation is synchronous.
 */

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  LayoutAnimation,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, SP, R, TY, fmtMoney, fmtPct } from "../design/DS";
import type { ProfitBreakdown, DealQualitySignal, PremiumIntelPayload } from "../../services/revenue/RevenueTypes";
import { EventTracker } from "../../services/revenue/EventTracker";

// ─── Fee constants ────────────────────────────────────────────────────────────

const PLATFORM_FEES: Record<string, number> = {
  ebay:      0.1325, // 13.25% final value fee (most categories)
  amazon:    0.15,
  mercari:   0.10,
  poshmark:  0.20,
  stockx:    0.09,
  goat:      0.09,
  depop:     0.10,
  default:   0.15,
};

function getPlatformFee(source: string | null | undefined): number {
  const s = String(source || "").toLowerCase();
  for (const [key, fee] of Object.entries(PLATFORM_FEES)) {
    if (s.includes(key)) return fee;
  }
  return PLATFORM_FEES.default;
}

// ─── Computation ─────────────────────────────────────────────────────────────

function computeProfitBreakdown(
  costBasis: number | null,
  estimatedResale: number | null,
  source: string | null | undefined
): ProfitBreakdown | null {
  if (!Number.isFinite(costBasis) || !costBasis) return null;
  if (!Number.isFinite(estimatedResale) || !estimatedResale) return null;

  const fee       = getPlatformFee(source);
  const feeAmt    = estimatedResale! * fee;
  const netProc   = estimatedResale! - feeAmt;
  const grossProf = estimatedResale! - costBasis!;
  const netProf   = netProc - costBasis!;
  const roi       = (netProf / costBasis!) * 100;

  return {
    costBasis: costBasis!,
    estimatedResale: estimatedResale!,
    platformFee: fee,
    platformFeeAmount: feeAmt,
    netProceeds: netProc,
    grossProfit: grossProf,
    netProfit: netProf,
    roi,
    roiLabel: roi >= 0 ? `${Math.round(roi)}% ROI` : `${Math.round(roi)}% LOSS`,
    isProfit: netProf > 0,
  };
}

function computeDealQuality(
  dealScore: number | null,
  verdict: string | null,
  conf: number | null,
  trendIntel: any,
  authenticityIntel: any,
  ebaySoldComps: any
): DealQualitySignal | null {
  const score = dealScore ?? 0;
  const v = String(verdict || "").toUpperCase();
  const c = conf ?? 0;

  const tier: DealQualitySignal["tier"] =
    score >= 0.80 || v.includes("GREAT") ? "excellent" :
    score >= 0.60 || v.includes("GOOD")  ? "good"      :
    score >= 0.40 || v.includes("MEH")   ? "fair"      :
    "weak";

  const reasoning: string[] = [];
  if (v.includes("GREAT") || v.includes("FLIP"))
    reasoning.push("Strong flip potential at current price");
  else if (v.includes("GOOD"))
    reasoning.push("Fair deal — moderate profit margin");
  else if (v.includes("MEH"))
    reasoning.push("Thin margin — minimal upside");

  if (ebaySoldComps?.velocityTier === "hot")
    reasoning.push("High demand — sells within 48h");
  else if (ebaySoldComps?.velocityTier === "active")
    reasoning.push("Active market — 1–2 week sell window");

  if (c >= 0.85)
    reasoning.push("High-confidence identification");
  else if (c < 0.50)
    reasoning.push("Low identification confidence");

  const riskFlags: string[] = [];
  if (authenticityIntel?.tier === "critical" || authenticityIntel?.tier === "high")
    riskFlags.push("Authenticity risk — verify before purchasing");
  if (trendIntel?.trend === "declining")
    riskFlags.push("Market price is falling — buy window closing");

  return { score, tier, reasoning: reasoning.slice(0, 3), riskFlags: riskFlags.slice(0, 2) };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TIER_STYLES: Record<DealQualitySignal["tier"], { color: string; bg: string; border: string; label: string }> = {
  excellent: { color: "rgba(100,255,180,0.95)", bg: "rgba(0,210,120,0.10)", border: "rgba(0,210,120,0.24)", label: "EXCELLENT" },
  good:      { color: "rgba(255,255,255,0.85)", bg: "rgba(255,255,255,0.07)", border: "rgba(255,255,255,0.14)", label: "GOOD DEAL" },
  fair:      { color: "rgba(255,210,80,0.88)",  bg: "rgba(255,170,0,0.08)",  border: "rgba(255,170,0,0.18)",  label: "FAIR"      },
  weak:      { color: "rgba(255,110,90,0.85)",  bg: "rgba(255,70,50,0.07)",  border: "rgba(255,70,50,0.16)",  label: "WEAK"      },
};

const TREND_CONFIG = {
  rising:  { icon: "trending-up"   as const, color: "rgba(255,170,80,0.88)",  label: "Market rising" },
  falling: { icon: "trending-down" as const, color: "rgba(255,110,90,0.85)",  label: "Market falling" },
  stable:  { icon: "remove-outline" as const, color: "rgba(160,210,255,0.75)", label: "Price stable" },
};

// ─── Teaser for free tier ─────────────────────────────────────────────────────

function ProTeaser({ onUnlock, featureName }: { onUnlock: () => void; featureName: string }) {
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => {
        EventTracker.trackPaywallView(featureName);
        onUnlock();
      }}
      style={teaserStyles.wrap}
    >
      <View style={teaserStyles.lockRow}>
        <Ionicons name="lock-closed" size={11} color="rgba(167,139,250,0.85)" />
        <Text style={teaserStyles.lockText}>EVAN AI PRO</Text>
      </View>
      <Text style={teaserStyles.headline}>Unlock full profit breakdown</Text>
      <Text style={teaserStyles.sub}>Fees-aware ROI · Deal score · Market trend · Sell window</Text>
      <View style={teaserStyles.cta}>
        <Text style={teaserStyles.ctaText}>Upgrade  →</Text>
      </View>
    </TouchableOpacity>
  );
}

const teaserStyles = StyleSheet.create({
  wrap: {
    marginTop: 6,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: "rgba(167,139,250,0.22)",
    backgroundColor: "rgba(124,58,237,0.06)",
    paddingHorizontal: SP.md,
    paddingVertical: SP.md,
    gap: 4,
  },
  lockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  lockText: {
    ...TY.cap,
    color: "rgba(167,139,250,0.75)",
    letterSpacing: 1.1,
  },
  headline: {
    ...TY.label,
    color: C.text2,
    marginTop: 2,
  },
  sub: {
    fontSize: 10,
    fontWeight: "600",
    color: C.text4,
    lineHeight: 14,
  },
  cta: {
    marginTop: SP.xs,
    alignSelf: "flex-end",
  },
  ctaText: {
    fontSize: 11,
    fontWeight: "800",
    color: "rgba(167,139,250,0.85)",
    letterSpacing: 0.4,
  },
});

// ─── Breakdown row ────────────────────────────────────────────────────────────

function BreakdownRow({
  label,
  value,
  color,
  isBold,
}: {
  label: string;
  value: string;
  color?: string;
  isBold?: boolean;
}) {
  return (
    <View style={brkStyles.row}>
      <Text style={brkStyles.label}>{label}</Text>
      <Text style={[brkStyles.value, color ? { color } : null, isBold ? brkStyles.bold : null]}>
        {value}
      </Text>
    </View>
  );
}

const brkStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 3,
  },
  label: {
    fontSize: 10,
    fontWeight: "600",
    color: C.text3,
    flex: 1,
  },
  value: {
    fontSize: 11,
    fontWeight: "700",
    color: C.text2,
    textAlign: "right",
  },
  bold: {
    fontSize: 13,
    fontWeight: "900",
  },
});

// ─── Main component ───────────────────────────────────────────────────────────

interface PremiumIntelPanelProps {
  /** Cost basis (what user paid / scanned price) */
  costBasis: number | null;
  /** Average market resale price */
  avgMarket: number | null;
  /** Marketplace source for fee lookup */
  source: string | null | undefined;
  /** Deal verdict string */
  verdict: string | null | undefined;
  /** Vision confidence 0–1 */
  confidence: number | null | undefined;
  /** Deal score 0–1 */
  dealScore?: number | null;
  /** Trend intel from server */
  trendIntel?: any;
  /** Authenticity intel from server */
  authenticityIntel?: any;
  /** eBay sold comps */
  ebaySoldComps?: any;
  /** Whether user has Pro access */
  isPro: boolean;
  /** Called when paywall CTA is tapped */
  onUnlock: () => void;
}

export function PremiumIntelPanel({
  costBasis,
  avgMarket,
  source,
  verdict,
  confidence,
  dealScore,
  trendIntel,
  authenticityIntel,
  ebaySoldComps,
  isPro,
  onUnlock,
}: PremiumIntelPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const profitBreakdown = useMemo(
    () => computeProfitBreakdown(costBasis, avgMarket, source),
    [costBasis, avgMarket, source]
  );

  const dealQuality = useMemo(
    () => computeDealQuality(dealScore ?? null, verdict ?? null, confidence ?? null, trendIntel, authenticityIntel, ebaySoldComps),
    [dealScore, verdict, confidence, trendIntel, authenticityIntel, ebaySoldComps]
  );

  // Trend derived from trendIntel or authenticityIntel context
  const marketTrend: "rising" | "falling" | "stable" | null = useMemo(() => {
    const t = String(trendIntel?.trend || trendIntel?.direction || "").toLowerCase();
    if (t.includes("ris") || t.includes("up"))   return "rising";
    if (t.includes("fall") || t.includes("down")) return "falling";
    if (t.includes("stable") || avgMarket)        return "stable";
    return null;
  }, [trendIntel, avgMarket]);

  // Don't render if there's no meaningful data
  if (!profitBreakdown && !dealQuality && !marketTrend) return null;

  if (!isPro) {
    return <ProTeaser onUnlock={onUnlock} featureName="premium_intel_panel" />;
  }

  const tierStyle = dealQuality ? TIER_STYLES[dealQuality.tier] : null;
  const trendConf = marketTrend ? TREND_CONFIG[marketTrend] : null;

  const handleToggle = () => {
    LayoutAnimation.configureNext({
      duration: 200,
      create: { type: "easeInEaseOut", property: "opacity" },
      update: { type: "easeInEaseOut" },
    });
    setExpanded((v) => !v);
  };

  return (
    <View style={styles.wrap}>
      {/* Header — always visible */}
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={handleToggle}
        style={styles.header}
      >
        <View style={styles.headerLeft}>
          <Ionicons name="analytics" size={11} color="rgba(167,139,250,0.75)" />
          <Text style={styles.headerTitle}>PREMIUM INTEL</Text>
          {dealQuality && tierStyle ? (
            <View style={[styles.tierBadge, { backgroundColor: tierStyle.bg, borderColor: tierStyle.border }]}>
              <Text style={[styles.tierText, { color: tierStyle.color }]}>{tierStyle.label}</Text>
            </View>
          ) : null}
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={11}
          color={C.text4}
        />
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.body}>

          {/* Profit Breakdown */}
          {profitBreakdown ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>PROFIT BREAKDOWN</Text>
              <BreakdownRow label="Cost Basis"        value={fmtMoney(profitBreakdown.costBasis)} />
              <BreakdownRow label="Estimated Resale"  value={fmtMoney(profitBreakdown.estimatedResale)} />
              <BreakdownRow
                label={`Platform Fee (${Math.round(profitBreakdown.platformFee * 100)}%)`}
                value={`−${fmtMoney(profitBreakdown.platformFeeAmount)}`}
                color={C.warn}
              />
              <View style={styles.divider} />
              <BreakdownRow label="Net Proceeds"      value={fmtMoney(profitBreakdown.netProceeds)} />
              <BreakdownRow
                label="Net Profit"
                value={profitBreakdown.isProfit ? `+${fmtMoney(profitBreakdown.netProfit)}` : fmtMoney(profitBreakdown.netProfit)}
                color={profitBreakdown.isProfit ? C.good : C.danger}
                isBold
              />
              <BreakdownRow
                label="ROI"
                value={profitBreakdown.roiLabel}
                color={profitBreakdown.isProfit ? C.good : C.danger}
                isBold
              />
            </View>
          ) : null}

          {/* Deal Quality */}
          {dealQuality && dealQuality.reasoning.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>DEAL QUALITY</Text>
              {dealQuality.reasoning.map((r, i) => (
                <View key={i} style={styles.bulletRow}>
                  <Ionicons name="checkmark-circle" size={10} color={tierStyle?.color ?? C.good} />
                  <Text style={styles.bulletText}>{r}</Text>
                </View>
              ))}
              {dealQuality.riskFlags.map((rf, i) => (
                <View key={`rf${i}`} style={styles.bulletRow}>
                  <Ionicons name="warning-outline" size={10} color={C.warn} />
                  <Text style={[styles.bulletText, { color: C.warn }]}>{rf}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Market Trend + Sell Window */}
          {trendConf ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>MARKET SIGNAL</Text>
              <View style={styles.trendRow}>
                <Ionicons name={trendConf.icon} size={12} color={trendConf.color} />
                <Text style={[styles.trendLabel, { color: trendConf.color }]}>{trendConf.label}</Text>
              </View>
              {trendIntel?.buyAdvice ? (
                <Text style={styles.trendAdvice}>{trendIntel.buyAdvice}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 6,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: "rgba(167,139,250,0.16)",
    backgroundColor: "rgba(124,58,237,0.04)",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SP.md,
    paddingVertical: 7,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  headerTitle: {
    ...TY.cap,
    color: "rgba(167,139,250,0.75)",
    letterSpacing: 1.0,
  },
  tierBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: R.xs,
    borderWidth: 1,
    marginLeft: 4,
  },
  tierText: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  body: {
    paddingHorizontal: SP.md,
    paddingBottom: SP.md,
    gap: 10,
  },
  section: {
    gap: 2,
  },
  sectionTitle: {
    ...TY.cap,
    color: C.text4,
    letterSpacing: 0.9,
    marginBottom: 3,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginVertical: 4,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
    paddingVertical: 2,
  },
  bulletText: {
    fontSize: 10,
    fontWeight: "600",
    color: C.text3,
    flex: 1,
    lineHeight: 14,
  },
  trendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  trendLabel: {
    fontSize: 11,
    fontWeight: "700",
  },
  trendAdvice: {
    fontSize: 9,
    color: C.text4,
    lineHeight: 13,
    marginTop: 3,
  },
});
