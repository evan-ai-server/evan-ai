/**
 * Evan AI — FinanceValueCard
 *
 * Compact "Your Value Summary" surface.
 * Renders top value moments from the persistent FinanceState.
 *
 * Used in: ProfitDashboard header, Profile tab, post-scan celebrations.
 *
 * Rules:
 * - Never shows if financeState has no meaningful data (totalSaved < $5).
 * - Never blocks or slows the scan pipeline.
 * - No external fetches — reads from local FinanceState only.
 * - No layout reflow: fixed height with conditional content.
 */

import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { C, SP, R, TY } from "../design/DS";
import type { FinanceState } from "../../services/finance/RetentionFinance";
import { computeValueMoments } from "../../services/finance/RetentionFinance";
import { MIN_SAVED_MOMENT } from "../../services/finance/FinanceConfig";

interface FinanceValueCardProps {
  state: FinanceState;
  /** Max number of value moments to display (default: 3) */
  maxMoments?: number;
  /** Show compact single-line mode (for embedding in smaller spaces) */
  compact?: boolean;
}

export function FinanceValueCard({
  state,
  maxMoments = 3,
  compact = false,
}: FinanceValueCardProps) {
  const moments = useMemo(() => computeValueMoments(state), [state]);

  // Don't render if there's nothing to show
  if (state.totalSaved < MIN_SAVED_MOMENT && state.badBuysAvoided < 1 && state.flipOpportunityCount < 1) {
    return null;
  }

  if (compact) {
    return <CompactSummary state={state} />;
  }

  const visible = moments.slice(0, maxMoments);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Your Value Summary</Text>

      {visible.map((m, i) => (
        <View key={m.type + i} style={[styles.row, i === visible.length - 1 && styles.rowLast]}>
          <View style={styles.dot} />
          <View style={styles.rowContent}>
            <Text style={styles.headline}>{m.headline}</Text>
            {m.subline ? (
              <Text style={styles.subline}>{m.subline}</Text>
            ) : null}
          </View>
          {m.amount != null && m.amount > 0 ? (
            <Text style={[styles.amount, m.isPrimary && styles.amountPrimary]}>
              ${Math.round(m.amount)}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

// ─── Compact single-line summary ──────────────────────────────────────────────

function CompactSummary({ state }: { state: FinanceState }) {
  if (state.totalSaved < MIN_SAVED_MOMENT) return null;

  const parts: string[] = [];
  if (state.totalSaved >= MIN_SAVED_MOMENT) {
    parts.push(`$${Math.round(state.totalSaved)} saved`);
  }
  if (state.badBuysAvoided >= 1) {
    parts.push(`${state.badBuysAvoided} bad ${state.badBuysAvoided === 1 ? "buy" : "buys"} avoided`);
  }
  if (state.savingsStreak >= 2) {
    parts.push(`${state.savingsStreak}-day streak`);
  }

  return (
    <View style={styles.compact}>
      <Text style={styles.compactText} numberOfLines={1}>
        {parts.join(" · ")}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.s1,
    borderRadius: R.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    paddingVertical: SP.md,
    paddingHorizontal: SP.lg,
    marginBottom: SP.md,
  },
  title: {
    fontSize: 11,
    fontWeight: "700",
    color: C.text4,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: SP.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    gap: SP.sm,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: C.text4,
  },
  rowContent: {
    flex: 1,
  },
  headline: {
    fontSize: 14,
    fontWeight: "600",
    color: C.text2,
    lineHeight: 18,
  },
  subline: {
    fontSize: 12,
    color: C.text4,
    marginTop: 1,
  },
  amount: {
    fontSize: 15,
    fontWeight: "700",
    color: C.text3,
    letterSpacing: -0.3,
  },
  amountPrimary: {
    color: C.text,
  },

  // Compact
  compact: {
    paddingVertical: SP.xs ?? 4,
  },
  compactText: {
    fontSize: 12,
    fontWeight: "600",
    color: C.text3,
  },
});
