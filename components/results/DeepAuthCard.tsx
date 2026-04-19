/**
 * DeepAuthCard — Feature 11
 * Shows GPT-4 Vision-powered fake detection results with specific visual tells.
 * Rendered lazily after scan completes when item is in an authenticable category.
 */
import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SP, R, TY } from "../design/DS";

export interface DeepAuthResult {
  verdict: "authentic" | "likely_fake" | "suspicious" | "inconclusive";
  confidenceScore: number; // 0-100
  redFlags: string[];
  passPoints: string[];
  tellResults: { tell: string; result: "pass" | "fail" | "unclear"; note: string }[];
  recommendation: string;
  brand?: string;
  category?: string;
}

interface DeepAuthCardProps {
  result: DeepAuthResult | null;
  loading: boolean;
  onRescan?: () => void;
}

const VERDICT_CONFIG = {
  authentic:    { color: "#50ff96", bg: "rgba(80,255,150,0.08)", icon: "checkmark-circle",    label: "Looks Authentic" },
  likely_fake:  { color: "#ff5050", bg: "rgba(255,80,80,0.10)",  icon: "close-circle",        label: "Likely Fake" },
  suspicious:   { color: "#ffc800", bg: "rgba(255,200,0,0.10)",  icon: "warning",              label: "Suspicious" },
  inconclusive: { color: "#aaa",    bg: "rgba(150,150,150,0.08)",icon: "help-circle-outline",  label: "Inconclusive" },
};

const TELL_ICON: Record<string, string> = {
  pass:    "checkmark-circle",
  fail:    "close-circle",
  unclear: "remove-circle-outline",
};
const TELL_COLOR: Record<string, string> = {
  pass:    "#50ff96",
  fail:    "#ff5050",
  unclear: "rgba(255,255,255,0.35)",
};

export function DeepAuthCard({ result, loading, onRescan: _onRescan }: DeepAuthCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <View style={styles.card}>
        <View style={styles.loadRow}>
          <ActivityIndicator size="small" color="rgba(255,200,0,0.7)" />
          <Text style={styles.loadText}>Deep-scanning for fakes…</Text>
        </View>
      </View>
    );
  }

  if (!result) return null;

  const cfg        = VERDICT_CONFIG[result.verdict] ?? VERDICT_CONFIG.inconclusive;
  const failCount  = result.tellResults?.filter((t) => t.result === "fail").length ?? 0;
  const passCount  = result.tellResults?.filter((t) => t.result === "pass").length ?? 0;
  const hasTells   = (result.tellResults?.length ?? 0) > 0;

  return (
    <View style={[styles.card, { borderColor: cfg.color + "50" }]}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={[styles.verdictBadge, { backgroundColor: cfg.bg }]}>
          <Ionicons name={cfg.icon as any} size={14} color={cfg.color} />
          <Text style={[styles.verdictLabel, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
        <View style={styles.scoreWrap}>
          <Text style={[styles.scoreNum, { color: cfg.color }]}>{result.confidenceScore}</Text>
          <Text style={styles.scoreLabel}> /100</Text>
        </View>
        {hasTells && (
          <Pressable onPress={() => setExpanded(!expanded)} style={styles.expandBtn} hitSlop={8}>
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={14}
              color="rgba(255,255,255,0.5)"
            />
          </Pressable>
        )}
      </View>

      {/* Recommendation */}
      <Text style={styles.recommendation} numberOfLines={3}>
        {result.recommendation}
      </Text>

      {/* Quick summary chips: red flags + pass points */}
      {(result.redFlags?.length > 0 || result.passPoints?.length > 0) && (
        <View style={styles.summaryRow}>
          {result.redFlags?.slice(0, 2).map((flag, i) => (
            <View key={`rf${i}`} style={styles.redFlagChip}>
              <Ionicons name="close" size={9} color="#ff5050" />
              <Text style={styles.redFlagText} numberOfLines={1}>{flag}</Text>
            </View>
          ))}
          {result.passPoints?.slice(0, 1).map((pt, i) => (
            <View key={`pp${i}`} style={styles.passChip}>
              <Ionicons name="checkmark" size={9} color="#50ff96" />
              <Text style={styles.passText} numberOfLines={1}>{pt}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Expanded tell-by-tell breakdown */}
      {expanded && hasTells && (
        <View style={styles.tellList}>
          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>Tell-by-Tell Analysis</Text>
          {result.tellResults.map((t, i) => (
            <View key={i} style={styles.tellRow}>
              <Ionicons
                name={TELL_ICON[t.result] as any}
                size={13}
                color={TELL_COLOR[t.result]}
                style={{ marginTop: 1 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.tellName}>{t.tell}</Text>
                {t.note ? (
                  <Text style={[styles.tellNote, { color: TELL_COLOR[t.result] + "bb" }]}>
                    {t.note}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
          {(failCount > 0 || passCount > 0) && (
            <View style={styles.tally}>
              <Text style={styles.tallyFail}>{failCount} fail{failCount !== 1 ? "s" : ""}</Text>
              <Text style={styles.tallySep}>·</Text>
              <Text style={styles.tallyPass}>{passCount} pass{passCount !== 1 ? "es" : ""}</Text>
              <Text style={styles.tallySep}>·</Text>
              <Text style={styles.tallyUnclear}>
                {result.tellResults.filter((t) => t.result === "unclear").length} unclear
              </Text>
            </View>
          )}
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
    borderColor: "rgba(255,200,0,0.25)",
    gap: SP.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
  },
  verdictBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: R.pill,
  },
  verdictLabel: {
    ...TY.label,
    fontWeight: "700",
    fontSize: 12,
  },
  scoreWrap: {
    flexDirection: "row",
    alignItems: "baseline",
    marginLeft: "auto",
  },
  scoreNum: {
    fontWeight: "800",
    fontSize: 16,
  },
  scoreLabel: {
    ...TY.cap,
    color: "rgba(255,255,255,0.35)",
    fontSize: 10,
  },
  expandBtn: {
    paddingHorizontal: 4,
  },
  recommendation: {
    ...TY.label,
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    lineHeight: 17,
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  redFlagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255,80,80,0.10)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: R.pill,
    maxWidth: 180,
  },
  redFlagText: {
    ...TY.cap,
    color: "#ff5050",
    fontSize: 9,
    flexShrink: 1,
  },
  passChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(80,255,150,0.08)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: R.pill,
    maxWidth: 180,
  },
  passText: {
    ...TY.cap,
    color: "#50ff96",
    fontSize: 9,
    flexShrink: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginVertical: SP.xs,
  },
  sectionLabel: {
    ...TY.cap,
    color: "rgba(255,255,255,0.35)",
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  tellList: {
    gap: 4,
  },
  tellRow: {
    flexDirection: "row",
    gap: 7,
    paddingVertical: 3,
  },
  tellName: {
    ...TY.label,
    color: "rgba(255,255,255,0.75)",
    fontSize: 11,
    lineHeight: 15,
  },
  tellNote: {
    ...TY.cap,
    fontSize: 10,
    marginTop: 1,
  },
  tally: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  tallyFail:    { ...TY.cap, color: "#ff5050", fontSize: 10, fontWeight: "700" },
  tallyPass:    { ...TY.cap, color: "#50ff96", fontSize: 10, fontWeight: "700" },
  tallySep:     { ...TY.cap, color: "rgba(255,255,255,0.25)", fontSize: 10 },
  tallyUnclear: { ...TY.cap, color: "rgba(255,255,255,0.4)", fontSize: 10 },
  loadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
    paddingVertical: SP.xs,
  },
  loadText: {
    ...TY.cap,
    color: "rgba(255,200,0,0.7)",
    fontSize: 11,
  },
});
