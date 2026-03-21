/**
 * FlipProfileCard — personalized flip identity based on scan history.
 * Shows personality archetype, top category, avg margin, badges.
 */
import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, SP, R, TY } from "../design/DS";

export interface FlipProfile {
  personality: string;
  personalityIcon: string;
  topCategory: string | null;
  avgMargin: number;
  totalSaved: number;
  totalFlips: number;
  badges: Array<{ icon: string; label: string }>;
  advice: string;
}

interface FlipProfileCardProps {
  profile: FlipProfile | null;
  loading?: boolean;
}

function fmtMoney(n: number): string {
  return `$${n.toFixed(0)}`;
}

export function FlipProfileCard({ profile, loading }: FlipProfileCardProps) {
  if (loading) {
    return (
      <View style={styles.card}>
        <View style={[styles.row, { opacity: 0.4 }]}>
          <View style={styles.iconWrap}><Text style={styles.iconText}>⏳</Text></View>
          <Text style={styles.personality}>Loading your profile…</Text>
        </View>
      </View>
    );
  }

  if (!profile) return null;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Text style={styles.iconText}>{profile.personalityIcon || "🔍"}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.personalityLabel}>YOUR FLIP IDENTITY</Text>
          <Text style={styles.personality}>{profile.personality}</Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statVal}>{profile.totalFlips}</Text>
          <Text style={styles.statLabel}>Scans</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statVal}>{fmtMoney(profile.avgMargin)}</Text>
          <Text style={styles.statLabel}>Avg Saved</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statVal}>{fmtMoney(profile.totalSaved)}</Text>
          <Text style={styles.statLabel}>Total Saved</Text>
        </View>
      </View>

      {/* Badges */}
      {profile.badges.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.badgeScroll} contentContainerStyle={styles.badgeRow}>
          {profile.badges.map((b, i) => (
            <View key={i} style={styles.badge}>
              <Text style={styles.badgeIcon}>{b.icon}</Text>
              <Text style={styles.badgeLabel}>{b.label}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}

      {/* Advice */}
      <View style={styles.adviceWrap}>
        <Ionicons name="bulb-outline" size={13} color="rgba(255,200,60,0.75)" />
        <Text style={styles.advice}>{profile.advice}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    padding: SP.lg,
    gap: SP.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.md,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: R.md,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: {
    fontSize: 22,
  },
  personalityLabel: {
    ...TY.cap,
    color: C.text3,
    letterSpacing: 1.5,
  },
  personality: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 2,
  },
  statsRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
  },
  stat: {
    flex: 1,
    alignItems: "center",
    paddingVertical: SP.md,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.09)",
    marginVertical: SP.sm,
  },
  statVal: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 18,
    fontWeight: "900",
  },
  statLabel: {
    ...TY.cap,
    color: C.text4,
    marginTop: 2,
  },
  badgeScroll: {
    marginHorizontal: -SP.lg,
  },
  badgeRow: {
    paddingHorizontal: SP.lg,
    gap: SP.sm,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  badgeIcon: {
    fontSize: 13,
  },
  badgeLabel: {
    color: "rgba(255,255,255,0.80)",
    fontSize: 12,
    fontWeight: "700",
  },
  adviceWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    backgroundColor: "rgba(255,200,60,0.06)",
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: "rgba(255,200,60,0.15)",
    padding: SP.md,
  },
  advice: {
    color: "rgba(255,220,100,0.85)",
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 19,
    flex: 1,
  },
});
