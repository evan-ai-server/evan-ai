/**
 * ProfitDashboard — Closed-loop intelligence profit & behavioral metrics.
 * Connects to GET /metrics/user/:userId (Phase 1 closed-loop engine).
 *
 * Shows: totalSpent, totalRevenue, netProfit, winRate, avgROI,
 *        avgTimeToSaleDays, overrideRate, category + platform breakdowns.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, SP, R, TY, IOS, fmtMoney } from "../design/DS";
import { FinanceValueCard } from "../finance/FinanceValueCard";
import { useFinanceState } from "../../services/finance/useFinanceState";

interface ProfitDashboardProps {
  visible: boolean;
  userId: string | null;
  apiBase: string;
  onClose: () => void;
}

interface Metrics {
  totalScans: number;
  totalBuys: number;
  totalSold: number;
  totalSpent: number;
  totalRevenue: number;
  totalProfit: number;
  winRate: number | null;
  avgROI: number | null;
  avgTimeToSaleDays: number | null;
  overrideRate: number | null;
  categoryBreakdown: { category: string; scans: number; buys: number; sold: number; profit: number; spent: number }[];
  platformBreakdown: { platform: string; sold: number; revenue: number; profit: number }[];
}

// ─── Stat box ─────────────────────────────────────────────────────────────────

function StatBox({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, accent ? { color: accent } : {}]}>{value}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionLabel}>{title}</Text>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProfitDashboard({
  visible,
  userId,
  apiBase,
  onClose,
}: ProfitDashboardProps) {
  const insets = useSafeAreaInsets();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const { state: financeState } = useFinanceState();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/metrics/user/${encodeURIComponent(userId)}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setMetrics(data);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }, [userId, apiBase]);

  useEffect(() => {
    if (visible && userId) fetchMetrics();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, userId]);

  if (!visible) return null;

  const profitPositive = (metrics?.totalProfit ?? 0) >= 0;
  const hasActivity = (metrics?.totalBuys ?? 0) > 0;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {IOS ? <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} /> : null}
      <View style={styles.bg} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + SP.lg }]}>
        <Text style={styles.headerTitle}>Profit Intelligence</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>Done</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={C.text3} size="large" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Couldn&apos;t load</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity onPress={fetchMetrics} style={styles.retryBtn}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : !hasActivity ? (
        <View style={styles.centered}>
          <Text style={styles.emptyEmoji}>💰</Text>
          <Text style={styles.emptyTitle}>No purchases recorded yet</Text>
          <Text style={styles.emptyText}>
            After scanning an item, tap &quot;Bought it&quot; to start tracking your flips.
          </Text>
          {/* Still show value moments even if no server P&L data */}
          <View style={{ width: "100%", marginTop: SP.lg }}>
            <FinanceValueCard state={financeState} maxMoments={2} />
          </View>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Finance Value Summary (local, always available) */}
          <FinanceValueCard state={financeState} maxMoments={3} />

          {/* ── Primary P&L row */}
          <View style={styles.statsGrid}>
            <StatBox
              label="Spent"
              value={fmtMoney(metrics!.totalSpent)}
              accent={C.text2}
            />
            <View style={styles.statDivider} />
            <StatBox
              label="Revenue"
              value={fmtMoney(metrics!.totalRevenue)}
              accent={C.text2}
            />
            <View style={styles.statDivider} />
            <StatBox
              label="Net Profit"
              value={fmtMoney(metrics!.totalProfit)}
              accent={profitPositive ? C.good : C.danger}
            />
          </View>

          {/* ── Performance row */}
          <View style={[styles.statsGrid, { marginTop: SP.sm }]}>
            {metrics!.winRate != null ? (
              <>
                <StatBox
                  label="Win Rate"
                  value={`${metrics!.winRate}%`}
                  sub={`${metrics!.totalSold} sold`}
                  accent={metrics!.winRate >= 70 ? C.good : C.text}
                />
                <View style={styles.statDivider} />
              </>
            ) : null}
            {metrics!.avgROI != null ? (
              <>
                <StatBox
                  label="Avg ROI"
                  value={`${metrics!.avgROI}%`}
                  accent={metrics!.avgROI > 0 ? C.good : C.danger}
                />
                <View style={styles.statDivider} />
              </>
            ) : null}
            {metrics!.avgTimeToSaleDays != null ? (
              <StatBox
                label="Avg Days to Sell"
                value={`${metrics!.avgTimeToSaleDays}d`}
              />
            ) : (
              <StatBox
                label="Total Buys"
                value={String(metrics!.totalBuys)}
              />
            )}
          </View>

          {/* ── Override insight */}
          {metrics!.overrideRate != null && metrics!.overrideRate > 0 ? (
            <View style={styles.intelCard}>
              <Text style={styles.intelCardTitle}>Override Rate</Text>
              <Text style={styles.intelCardValue}>{metrics!.overrideRate}%</Text>
              <Text style={styles.intelCardSub}>
                of the time you went against Evan&apos;s signal
              </Text>
            </View>
          ) : null}

          {/* ── Category breakdown */}
          {metrics!.categoryBreakdown.length > 0 ? (
            <>
              <SectionHeader title="BY CATEGORY" />
              {metrics!.categoryBreakdown.slice(0, 8).map((cat) => (
                <View key={cat.category} style={styles.breakdownRow}>
                  <View style={styles.breakdownLeft}>
                    <Text style={styles.breakdownName} numberOfLines={1}>
                      {cat.category || "Unknown"}
                    </Text>
                    <Text style={styles.breakdownMeta}>
                      {cat.buys} bought · {cat.sold} sold
                    </Text>
                  </View>
                  <Text style={[
                    styles.breakdownProfit,
                    { color: cat.profit >= 0 ? C.good : C.danger },
                  ]}>
                    {cat.profit >= 0 ? "+" : ""}{fmtMoney(cat.profit)}
                  </Text>
                </View>
              ))}
            </>
          ) : null}

          {/* ── Platform breakdown */}
          {metrics!.platformBreakdown.length > 0 ? (
            <>
              <SectionHeader title="BY PLATFORM" />
              {metrics!.platformBreakdown.map((p) => (
                <View key={p.platform} style={styles.breakdownRow}>
                  <View style={styles.breakdownLeft}>
                    <Text style={styles.breakdownName} numberOfLines={1}>
                      {p.platform}
                    </Text>
                    <Text style={styles.breakdownMeta}>{p.sold} sold</Text>
                  </View>
                  <Text style={[
                    styles.breakdownProfit,
                    { color: p.profit >= 0 ? C.good : C.danger },
                  ]}>
                    {p.profit >= 0 ? "+" : ""}{fmtMoney(p.profit)}
                  </Text>
                </View>
              ))}
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    overflow: "hidden",
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(6,6,6,0.96)",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SP.xl,
    paddingBottom: SP.lg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: {
    ...TY.h2,
    color: C.text,
  },
  closeBtn: {
    paddingVertical: SP.xs,
    paddingHorizontal: SP.md,
    backgroundColor: C.s2,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.border,
  },
  closeBtnText: {
    ...TY.label,
    color: C.text2,
  },

  scrollContent: {
    padding: SP.lg,
    gap: SP.sm,
    paddingBottom: SP.xxxl,
  },

  // ── Stat grid ───────────────────────────────────────────────────────────────
  statsGrid: {
    flexDirection: "row",
    backgroundColor: C.s1,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  statBox: {
    flex: 1,
    alignItems: "center",
    paddingVertical: SP.xl,
    paddingHorizontal: SP.xs,
  },
  statValue: {
    ...TY.priceSm,
    color: C.text,
    marginBottom: 2,
  },
  statSub: {
    ...TY.cap,
    color: C.text4,
    marginBottom: 2,
  },
  statLabel: {
    ...TY.cap,
    color: C.text4,
    textAlign: "center",
  },
  statDivider: {
    width: 1,
    backgroundColor: C.border,
    marginVertical: SP.lg,
  },

  // ── Intel card (override rate) ───────────────────────────────────────────
  intelCard: {
    backgroundColor: C.s1,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: SP.lg,
    marginTop: SP.sm,
    alignItems: "center",
  },
  intelCardTitle: {
    ...TY.cap,
    color: C.text4,
    marginBottom: SP.xs,
  },
  intelCardValue: {
    ...TY.display,
    color: C.warn,
    marginBottom: SP.xs,
  },
  intelCardSub: {
    ...TY.label,
    color: C.text3,
    textAlign: "center",
  },

  // ── Section header ──────────────────────────────────────────────────────
  sectionLabel: {
    ...TY.cap,
    color: C.text4,
    marginTop: SP.xl,
    marginBottom: SP.sm,
  },

  // ── Breakdown rows ──────────────────────────────────────────────────────
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.s1,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: SP.md,
    paddingHorizontal: SP.md,
    gap: SP.md,
    marginBottom: SP.xs,
  },
  breakdownLeft: {
    flex: 1,
  },
  breakdownName: {
    ...TY.bodyBold,
    color: C.text,
    marginBottom: 2,
    textTransform: "capitalize",
  },
  breakdownMeta: {
    ...TY.label,
    color: C.text4,
  },
  breakdownProfit: {
    ...TY.priceSm,
    fontSize: 16,
  },

  // ── Empty / loading ──────────────────────────────────────────────────────
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SP.xxxl,
  },
  emptyEmoji: {
    fontSize: 44,
    marginBottom: SP.lg,
    textAlign: "center",
  },
  emptyTitle: {
    ...TY.h2,
    color: C.text2,
    marginBottom: SP.sm,
    textAlign: "center",
  },
  emptyText: {
    ...TY.body,
    color: C.text3,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: SP.lg,
  },
  retryBtn: {
    paddingVertical: SP.sm,
    paddingHorizontal: SP.xl,
    backgroundColor: C.s2,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.border,
  },
  retryText: {
    ...TY.label,
    color: C.text2,
  },
});
