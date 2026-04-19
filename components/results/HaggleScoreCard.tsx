/**
 * HaggleScoreCard — "Is this worth haggling?"
 * Displays haggle leverage score, suggested offer price, market context,
 * and an expandable negotiation script.
 */
import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SP, R, TY } from "../design/DS";

export interface HaggleScoreResult {
  score: number;
  scoreLabel: string;
  offerPrice: number;
  marketMedian: number;
  listingCount: number;
  priceVsMedianPct: number;
  reasoning: string;
  script: {
    openingLine: string;
    reasoningPoints: string[];
    closingLine: string;
    redFlags: string[];
  } | null;
}

interface HaggleScoreCardProps {
  result: HaggleScoreResult | null;
  loading: boolean;
  scannedPrice?: number | null;
}

function scoreColor(score: number): string {
  if (score <= 3) return "#aaaaaa";
  if (score <= 5) return "#82c8ff";
  if (score <= 7) return "#ffd060";
  if (score <= 9) return "#ffa040";
  return "#ff5050";
}

function scoreBg(score: number): string {
  if (score <= 3) return "rgba(170,170,170,0.08)";
  if (score <= 5) return "rgba(130,200,255,0.08)";
  if (score <= 7) return "rgba(255,208,96,0.08)";
  if (score <= 9) return "rgba(255,160,64,0.10)";
  return "rgba(255,80,80,0.10)";
}

export function HaggleScoreCard({ result, loading, scannedPrice: _scannedPrice }: HaggleScoreCardProps) {
  const [scriptExpanded, setScriptExpanded] = useState(false);

  if (loading) {
    return (
      <View style={styles.card}>
        <View style={styles.loadRow}>
          <ActivityIndicator size="small" color="rgba(130,200,255,0.7)" />
          <Text style={styles.loadText}>Calculating haggle leverage…</Text>
        </View>
      </View>
    );
  }

  if (!result) return null;

  const color = scoreColor(result.score);
  const bg = scoreBg(result.score);
  const barWidth = `${(result.score / 10) * 100}%` as any;
  const showOffer = result.score >= 4;
  const hasScript = result.script !== null;
  const aboveMarket = result.priceVsMedianPct > 0;

  return (
    <View style={[styles.card, { borderColor: color + "40" }]}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={[styles.titleBadge, { backgroundColor: bg }]}>
          <Ionicons name="chatbubble-ellipses-outline" size={13} color={color} />
          <Text style={[styles.titleLabel, { color }]}>Haggle Score</Text>
        </View>
        <View style={styles.scoreWrap}>
          <Text style={[styles.scoreNum, { color }]}>{result.score}</Text>
          <Text style={styles.scoreDenom}>/10</Text>
        </View>
      </View>

      {/* Score label badge + progress bar */}
      <View style={styles.labelBarWrap}>
        <View style={[styles.scoreLabelBadge, { backgroundColor: bg }]}>
          <Text style={[styles.scoreLabelText, { color }]}>{result.scoreLabel}</Text>
        </View>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: barWidth, backgroundColor: color }]} />
      </View>

      {/* Reasoning */}
      {!!result.reasoning && (
        <Text style={styles.reasoning}>{result.reasoning}</Text>
      )}

      {/* Offer section */}
      {showOffer && (
        <View style={[styles.offerSection, { backgroundColor: bg }]}>
          <View style={styles.offerRow}>
            <Text style={styles.offerLabel}>Suggested offer</Text>
            <Text style={[styles.offerPrice, { color }]}>
              ${result.offerPrice.toFixed(0)}
            </Text>
          </View>
          {aboveMarket && (
            <Text style={styles.marketNote}>
              Listed {result.priceVsMedianPct.toFixed(0)}% above market median of ${result.marketMedian.toFixed(0)}
            </Text>
          )}
          {result.listingCount > 0 && (
            <Text style={styles.listingNote}>
              {result.listingCount} competing listing{result.listingCount !== 1 ? "s" : ""} found
            </Text>
          )}
        </View>
      )}

      {/* Script toggle */}
      {hasScript && (
        <>
          <Pressable
            onPress={() => setScriptExpanded(!scriptExpanded)}
            style={styles.scriptToggle}
            hitSlop={8}
          >
            <Ionicons name="mic-outline" size={13} color="rgba(255,255,255,0.55)" />
            <Text style={styles.scriptToggleLabel}>Negotiation script</Text>
            <Ionicons
              name={scriptExpanded ? "chevron-up" : "chevron-down"}
              size={13}
              color="rgba(255,255,255,0.4)"
              style={styles.chevron}
            />
          </Pressable>

          {scriptExpanded && result.script && (
            <View style={styles.scriptBody}>
              <View style={styles.divider} />

              {/* Opening line speech bubble */}
              <View style={styles.speechBubble}>
                <Text style={styles.speechText}>{result.script.openingLine}</Text>
              </View>

              {/* Reasoning points */}
              {result.script.reasoningPoints.length > 0 && (
                <View style={styles.pointsList}>
                  {result.script.reasoningPoints.map((pt, i) => (
                    <View key={i} style={styles.pointRow}>
                      <Text style={styles.bullet}>•</Text>
                      <Text style={styles.pointText}>{pt}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Closing line */}
              <Text style={styles.closingLine}>{result.script.closingLine}</Text>

              {/* Red flags */}
              {result.script.redFlags.length > 0 && (
                <View style={styles.redFlagRow}>
                  {result.script.redFlags.map((flag, i) => (
                    <View key={i} style={styles.redFlagChip}>
                      <Ionicons name="warning-outline" size={9} color="#ff5050" />
                      <Text style={styles.redFlagText} numberOfLines={1}>{flag}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </>
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
  },
  titleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: R.pill,
  },
  titleLabel: {
    ...TY.label,
    fontWeight: "700",
    fontSize: 11,
  },
  scoreWrap: {
    flexDirection: "row",
    alignItems: "baseline",
    marginLeft: "auto",
  },
  scoreNum: {
    fontWeight: "900",
    fontSize: 22,
    letterSpacing: -0.5,
  },
  scoreDenom: {
    ...TY.cap,
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
    marginLeft: 1,
  },
  labelBarWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  scoreLabelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: R.pill,
  },
  scoreLabelText: {
    ...TY.cap,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  barTrack: {
    height: 4,
    borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
  },
  barFill: {
    height: 4,
    borderRadius: R.pill,
  },
  reasoning: {
    ...TY.label,
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    lineHeight: 16,
  },
  offerSection: {
    borderRadius: R.sm,
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm,
    gap: 4,
  },
  offerRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: SP.sm,
  },
  offerLabel: {
    ...TY.cap,
    color: "rgba(255,255,255,0.45)",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  offerPrice: {
    fontWeight: "900",
    fontSize: 20,
    letterSpacing: -0.4,
    marginLeft: "auto",
  },
  marketNote: {
    ...TY.cap,
    color: "rgba(255,255,255,0.5)",
    fontSize: 10,
    lineHeight: 15,
  },
  listingNote: {
    ...TY.cap,
    color: "rgba(255,255,255,0.35)",
    fontSize: 10,
  },
  scriptToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: SP.xs,
  },
  scriptToggleLabel: {
    ...TY.label,
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
  },
  chevron: {
    marginLeft: "auto",
  },
  scriptBody: {
    gap: SP.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginBottom: SP.xs,
  },
  speechBubble: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: R.sm,
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm,
  },
  speechText: {
    ...TY.label,
    color: "rgba(255,255,255,0.82)",
    fontSize: 12,
    lineHeight: 18,
  },
  pointsList: {
    gap: 4,
    paddingLeft: SP.xs,
  },
  pointRow: {
    flexDirection: "row",
    gap: 6,
  },
  bullet: {
    ...TY.label,
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
    lineHeight: 18,
  },
  pointText: {
    ...TY.label,
    color: "rgba(255,255,255,0.68)",
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
  closingLine: {
    ...TY.label,
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    lineHeight: 16,
    fontStyle: "italic",
  },
  redFlagRow: {
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
    maxWidth: 200,
  },
  redFlagText: {
    ...TY.cap,
    color: "#ff5050",
    fontSize: 9,
    flexShrink: 1,
  },
});
