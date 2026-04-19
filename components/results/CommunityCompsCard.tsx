/**
 * CommunityCompsCard — Feature 13
 * Crowdsourced "I paid X / sold for Y" data for this exact item.
 * Shows: avg paid, avg sold, recent samples, and quick-submit buttons.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SP, R, TY } from "../design/DS";

interface CompStats {
  avg: number;
  median: number;
  count: number;
}

interface CompSample {
  type: "paid" | "sold";
  price: number;
  daysAgo: number;
}

export interface CommunityCompsData {
  query: string;
  paidStats: CompStats | null;
  soldStats: CompStats | null;
  totalEntries: number;
  samples: CompSample[];
}

interface CommunityCompsCardProps {
  data: CommunityCompsData | null;
  loading: boolean;
  query: string | null;
  apiBase: string;
  userId?: string;
}

export function CommunityCompsCard({
  data,
  loading,
  query,
  apiBase,
  userId,
}: CommunityCompsCardProps) {
  const [submitMode, setSubmitMode] = useState<"paid" | "sold" | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (loading) {
    return (
      <View style={styles.card}>
        <View style={styles.loadRow}>
          <ActivityIndicator size="small" color="rgba(130,200,255,0.7)" />
          <Text style={styles.loadText}>Loading community data…</Text>
        </View>
      </View>
    );
  }

  const hasData = data && (data.paidStats || data.soldStats || data.samples?.length > 0);

  const handleSubmit = async () => {
    const price = parseFloat(priceInput);
    if (!Number.isFinite(price) || price <= 0) {
      Alert.alert("Invalid price", "Enter a valid dollar amount.");
      return;
    }
    if (!query || !submitMode) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/api/community/comp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, type: submitMode, price, userId: userId || "anon" }),
        signal: AbortSignal.timeout(8000),
      });
      const json = await res.json();
      if (json?.ok) {
        setSubmitted(true);
        setSubmitMode(null);
        setPriceInput("");
      }
    } catch { /* non-fatal */ } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.badge}>
          <Ionicons name="people-outline" size={13} color="#82c8ff" />
          <Text style={styles.badgeLabel}>Community Comps</Text>
        </View>
        {data?.totalEntries ? (
          <Text style={styles.countLabel}>{data.totalEntries} data points</Text>
        ) : null}
      </View>

      {/* Stats row */}
      {hasData ? (
        <View style={styles.statsRow}>
          {data!.paidStats ? (
            <View style={styles.statBox}>
              <Text style={styles.statMeta}>People paid avg</Text>
              <Text style={[styles.statVal, { color: "#ffa040" }]}>
                ${data!.paidStats.avg.toFixed(0)}
              </Text>
              <Text style={styles.statSub}>
                median ${data!.paidStats.median.toFixed(0)} · {data!.paidStats.count} ppl
              </Text>
            </View>
          ) : null}

          {data!.paidStats && data!.soldStats ? (
            <View style={styles.divider} />
          ) : null}

          {data!.soldStats ? (
            <View style={styles.statBox}>
              <Text style={styles.statMeta}>Sold for avg</Text>
              <Text style={[styles.statVal, { color: "#50ff96" }]}>
                ${data!.soldStats.avg.toFixed(0)}
              </Text>
              <Text style={styles.statSub}>
                median ${data!.soldStats.median.toFixed(0)} · {data!.soldStats.count} ppl
              </Text>
            </View>
          ) : null}

          {data!.paidStats && data!.soldStats && data!.soldStats.avg > data!.paidStats.avg ? (
            <View style={styles.flipSignalBadge}>
              <Ionicons name="trending-up" size={11} color="#50ff96" />
              <Text style={styles.flipSignalText}>
                +${(data!.soldStats.avg - data!.paidStats.avg).toFixed(0)} flip margin
              </Text>
            </View>
          ) : null}
        </View>
      ) : !loading ? (
        <Text style={styles.emptyText}>
          No community data yet — be the first to contribute!
        </Text>
      ) : null}

      {/* Recent samples */}
      {(data?.samples?.length ?? 0) > 0 && (
        <View style={styles.sampleList}>
          {data!.samples.slice(0, 4).map((s, i) => (
            <View key={i} style={styles.sampleRow}>
              <View
                style={[
                  styles.sampleTypeDot,
                  { backgroundColor: s.type === "paid" ? "rgba(255,160,64,0.15)" : "rgba(80,255,150,0.15)" },
                ]}
              >
                <Text style={[styles.sampleTypeText, { color: s.type === "paid" ? "#ffa040" : "#50ff96" }]}>
                  {s.type === "paid" ? "paid" : "sold"}
                </Text>
              </View>
              <Text style={styles.samplePrice}>${s.price.toFixed(0)}</Text>
              <Text style={styles.sampleAge}>
                {s.daysAgo === 0 ? "today" : `${s.daysAgo}d ago`}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Submit CTA */}
      {!submitted && !submitMode ? (
        <View style={styles.ctaRow}>
          <Text style={styles.ctaLabel}>Add yours:</Text>
          <Pressable
            onPress={() => setSubmitMode("paid")}
            style={({ pressed }) => [styles.ctaBtn, styles.paidBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.ctaBtnText}>I paid $X</Text>
          </Pressable>
          <Pressable
            onPress={() => setSubmitMode("sold")}
            style={({ pressed }) => [styles.ctaBtn, styles.soldBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.ctaBtnText}>I sold for $X</Text>
          </Pressable>
        </View>
      ) : submitted ? (
        <View style={styles.thanksRow}>
          <Ionicons name="checkmark-circle" size={14} color="#50ff96" />
          <Text style={styles.thanksText}>Thanks! Your data helps the community.</Text>
        </View>
      ) : null}

      {/* Price input */}
      {submitMode ? (
        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>
            {submitMode === "paid" ? "What did you pay?" : "What did you sell for?"}
          </Text>
          <View style={styles.inputWrap}>
            <Text style={styles.inputPrefix}>$</Text>
            <TextInput
              value={priceInput}
              onChangeText={setPriceInput}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="rgba(255,255,255,0.3)"
              style={styles.input}
              autoFocus
            />
          </View>
          <View style={styles.inputActions}>
            <Pressable
              onPress={() => { setSubmitMode(null); setPriceInput(""); }}
              style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.7 }]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={styles.submitBtnText}>Submit</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}
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
    borderColor: "rgba(130,200,255,0.20)",
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
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: R.pill,
    backgroundColor: "rgba(130,200,255,0.08)",
  },
  badgeLabel: {
    ...TY.label,
    fontWeight: "700",
    fontSize: 11,
    color: "#82c8ff",
  },
  countLabel: {
    ...TY.cap,
    color: "rgba(255,255,255,0.3)",
    fontSize: 10,
    marginLeft: "auto",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: SP.md,
  },
  statBox: {
    flex: 1,
    minWidth: 90,
    gap: 2,
  },
  statMeta: {
    ...TY.cap,
    color: "rgba(255,255,255,0.35)",
    fontSize: 9,
    textTransform: "uppercase",
  },
  statVal: {
    fontWeight: "800",
    fontSize: 20,
  },
  statSub: {
    ...TY.cap,
    color: "rgba(255,255,255,0.4)",
    fontSize: 9,
  },
  divider: {
    width: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignSelf: "stretch",
  },
  flipSignalBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(80,255,150,0.08)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: R.pill,
    alignSelf: "flex-end",
  },
  flipSignalText: {
    ...TY.cap,
    color: "#50ff96",
    fontSize: 10,
    fontWeight: "700",
  },
  emptyText: {
    ...TY.cap,
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    fontStyle: "italic",
  },
  sampleList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  sampleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: R.pill,
  },
  sampleTypeDot: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: R.pill,
  },
  sampleTypeText: {
    fontSize: 9,
    fontWeight: "700",
  },
  samplePrice: {
    ...TY.label,
    color: "rgba(255,255,255,0.8)",
    fontSize: 11,
    fontWeight: "700",
  },
  sampleAge: {
    ...TY.cap,
    color: "rgba(255,255,255,0.3)",
    fontSize: 9,
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  ctaLabel: {
    ...TY.cap,
    color: "rgba(255,255,255,0.4)",
    fontSize: 10,
  },
  ctaBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: R.pill,
  },
  paidBtn: {
    backgroundColor: "rgba(255,160,64,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,160,64,0.25)",
  },
  soldBtn: {
    backgroundColor: "rgba(80,255,150,0.10)",
    borderWidth: 1,
    borderColor: "rgba(80,255,150,0.22)",
  },
  ctaBtnText: {
    ...TY.label,
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.8)",
  },
  thanksRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  thanksText: {
    ...TY.cap,
    color: "#50ff96",
    fontSize: 11,
  },
  inputRow: {
    gap: 8,
  },
  inputLabel: {
    ...TY.cap,
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: R.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  inputPrefix: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 14,
    fontWeight: "700",
    marginRight: 4,
  },
  input: {
    flex: 1,
    color: "white",
    fontSize: 18,
    fontWeight: "700",
  },
  inputActions: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  cancelBtnText: {
    ...TY.label,
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
  },
  submitBtn: {
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: R.pill,
    backgroundColor: "rgba(130,200,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(130,200,255,0.30)",
    minWidth: 70,
    alignItems: "center",
  },
  submitBtnText: {
    ...TY.label,
    color: "#82c8ff",
    fontSize: 12,
    fontWeight: "700",
  },
});
