/**
 * ConditionMismatchCard — Feature 12
 * Shows GPT-4 Vision's actual condition assessment vs stated condition.
 * "Listed as Like New but image shows Good — fair value $X not $Y."
 */
import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SP, R, TY } from "../design/DS";

export interface ConditionAssessment {
  statedCondition: string;
  visualCondition: string;
  conditionConfidence: number;
  wearSigns: string[];
  hasMismatch: boolean;
  mismatchSeverity: "none" | "minor" | "significant" | "major";
  reasoning: string;
  adjustedPrice: number | null;
  adjustmentPct: number | null;
  signal: string | null;
}

interface ConditionMismatchCardProps {
  assessment: ConditionAssessment | null;
  loading: boolean;
  scannedPrice?: number | null;
}

const CONDITION_LABEL: Record<string, string> = {
  new:       "New",
  like_new:  "Like New",
  good:      "Good",
  fair:      "Fair",
  poor:      "Poor",
};

const SEVERITY_CONFIG = {
  none:        { color: "#50ff96", bg: "rgba(80,255,150,0.07)",  icon: "checkmark-circle-outline" },
  minor:       { color: "#ffd060", bg: "rgba(255,200,0,0.08)",   icon: "information-circle-outline" },
  significant: { color: "#ffa040", bg: "rgba(255,160,64,0.10)",  icon: "warning-outline" },
  major:       { color: "#ff5050", bg: "rgba(255,80,80,0.10)",   icon: "alert-circle-outline" },
};

export function ConditionMismatchCard({
  assessment,
  loading,
  scannedPrice,
}: ConditionMismatchCardProps) {
  if (loading) {
    return (
      <View style={styles.card}>
        <View style={styles.loadRow}>
          <ActivityIndicator size="small" color="rgba(130,200,255,0.7)" />
          <Text style={styles.loadText}>Assessing item condition…</Text>
        </View>
      </View>
    );
  }

  if (!assessment) return null;

  const sev = assessment.mismatchSeverity ?? "none";
  const cfg = SEVERITY_CONFIG[sev] ?? SEVERITY_CONFIG.none;

  // Only show this card if there's something notable
  const shouldShow =
    assessment.hasMismatch ||
    (assessment.wearSigns?.length ?? 0) > 0 ||
    assessment.mismatchSeverity !== "none";

  if (!shouldShow) return null;

  const stated    = CONDITION_LABEL[assessment.statedCondition] ?? assessment.statedCondition;
  const visual    = CONDITION_LABEL[assessment.visualCondition]  ?? assessment.visualCondition;
  const mismatch  = assessment.hasMismatch && stated !== visual;
  const adjPrice  = assessment.adjustedPrice;
  const priceDiff = adjPrice && scannedPrice ? scannedPrice - adjPrice : null;

  return (
    <View style={[styles.card, { borderColor: cfg.color + "40" }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
          <Ionicons name={cfg.icon as any} size={13} color={cfg.color} />
          <Text style={[styles.badgeLabel, { color: cfg.color }]}>
            {mismatch ? "Condition Mismatch" : "Condition Note"}
          </Text>
        </View>
        <Text style={styles.confidence}>
          {assessment.conditionConfidence}% confident
        </Text>
      </View>

      {/* Condition comparison */}
      {mismatch && (
        <View style={styles.compareRow}>
          <View style={styles.condBox}>
            <Text style={styles.condMeta}>Listed as</Text>
            <Text style={[styles.condValue, { color: "rgba(255,255,255,0.5)" }]}>{stated}</Text>
          </View>
          <Ionicons name="arrow-forward" size={12} color="rgba(255,255,255,0.3)" />
          <View style={styles.condBox}>
            <Text style={styles.condMeta}>Looks like</Text>
            <Text style={[styles.condValue, { color: cfg.color }]}>{visual}</Text>
          </View>
          {adjPrice ? (
            <>
              <Ionicons name="arrow-forward" size={12} color="rgba(255,255,255,0.3)" />
              <View style={styles.condBox}>
                <Text style={styles.condMeta}>Fair value</Text>
                <Text style={[styles.condValue, { color: cfg.color }]}>${adjPrice}</Text>
              </View>
            </>
          ) : null}
        </View>
      )}

      {/* Overpaying warning */}
      {mismatch && priceDiff && priceDiff > 3 ? (
        <View style={styles.overWarn}>
          <Ionicons name="trending-up" size={12} color="#ffa040" />
          <Text style={styles.overWarnText}>
            You may be overpaying by ~${priceDiff.toFixed(0)} based on actual condition
          </Text>
        </View>
      ) : null}

      {/* Reasoning */}
      {assessment.reasoning ? (
        <Text style={styles.reasoning}>{assessment.reasoning}</Text>
      ) : null}

      {/* Wear signs */}
      {(assessment.wearSigns?.length ?? 0) > 0 && (
        <View style={styles.wearList}>
          {assessment.wearSigns.slice(0, 4).map((sign, i) => (
            <View key={i} style={styles.wearChip}>
              <Ionicons name="ellipse" size={5} color="rgba(255,255,255,0.3)" />
              <Text style={styles.wearText}>{sign}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: SP.lg,
    marginTop: SP.md,
    padding: SP.md,
    borderRadius: R.md,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    gap: SP.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: R.pill,
  },
  badgeLabel: {
    ...TY.label,
    fontWeight: "700",
    fontSize: 11,
  },
  confidence: {
    ...TY.cap,
    color: "rgba(255,255,255,0.3)",
    fontSize: 10,
    marginLeft: "auto",
  },
  compareRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
  },
  condBox: {
    gap: 2,
  },
  condMeta: {
    ...TY.cap,
    color: "rgba(255,255,255,0.35)",
    fontSize: 9,
    textTransform: "uppercase",
  },
  condValue: {
    ...TY.label,
    fontWeight: "700",
    fontSize: 13,
  },
  overWarn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,160,64,0.08)",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: R.sm,
  },
  overWarnText: {
    ...TY.label,
    color: "#ffa040",
    fontSize: 11,
    flex: 1,
  },
  reasoning: {
    ...TY.label,
    color: "rgba(255,255,255,0.65)",
    fontSize: 11,
    lineHeight: 16,
  },
  wearList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  wearChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: R.pill,
  },
  wearText: {
    ...TY.cap,
    color: "rgba(255,255,255,0.55)",
    fontSize: 9,
  },
  loadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
    paddingVertical: SP.xs,
  },
  loadText: {
    ...TY.cap,
    color: "rgba(130,200,255,0.7)",
    fontSize: 11,
  },
});
