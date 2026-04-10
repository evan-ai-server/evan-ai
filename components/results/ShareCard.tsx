/**
 * ShareCard — generates a beautiful shareable savings summary.
 *
 * Composes a styled modal with item + savings info and shares via
 * native Share sheet. No external screenshot library needed — uses
 * React Native's Share API with formatted text + deep link.
 */
import React, { useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Share,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { SP, R, C, TY } from "../design/DS";

export interface ShareCardData {
  itemName?: string | null;
  store?: string | null;
  price?: number | null;
  scannedPrice?: number | null;
  savedAmount?: number | null;
  cheaperPct?: number | null;
  // Tweak 3 — Evidence pack (identification basis)
  visionQuery?: string | null;
  evidenceSignals?: string[] | null;
}

interface ShareCardProps {
  visible: boolean;
  data: ShareCardData;
  onClose: () => void;
}

const hapticMed = () => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {} };

function fmtMoney(n: number | null | undefined): string {
  if (!Number.isFinite(n)) return "—";
  return `$${n!.toFixed(0)}`;
}

// ─── Evidence Carousel (Tweak 3) ─────────────────────────────────────────────
function EvidenceCarousel({
  signals,
  query,
}: {
  signals: string[];
  query?: string | null;
}) {
  const hasContent = query || signals.length > 0;
  if (!hasContent) return null;
  return (
    <View style={evidenceStyles.container}>
      <Text style={evidenceStyles.header}>IDENTIFICATION BASIS</Text>
      {query ? (
        <View style={evidenceStyles.row}>
          <Ionicons name="search-outline" size={11} color="rgba(100,180,255,0.75)" />
          <Text style={evidenceStyles.signal} numberOfLines={1}>{query}</Text>
        </View>
      ) : null}
      {signals.slice(0, 3).map((sig, i) => (
        <View key={i} style={evidenceStyles.row}>
          <Ionicons name="checkmark-circle-outline" size={11} color="rgba(120,255,180,0.75)" />
          <Text style={evidenceStyles.signal} numberOfLines={2}>{sig}</Text>
        </View>
      ))}
    </View>
  );
}

const evidenceStyles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: SP.md,
    marginBottom: SP.md,
  },
  header: {
    ...TY.cap,
    color: "rgba(255,255,255,0.28)",
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginBottom: 4,
  },
  signal: {
    flex: 1,
    color: "rgba(255,255,255,0.52)",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
});

export function ShareCard({ visible, data, onClose }: ShareCardProps) {
  const translateY = useSharedValue(500);
  const opacity    = useSharedValue(0);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  React.useEffect(() => {
    if (visible) {
      opacity.value    = withTiming(1, { duration: 200 });
      translateY.value = withSpring(0, { mass: 0.7, damping: 22, stiffness: 260 });
    } else {
      opacity.value    = withTiming(0, { duration: 180 });
      translateY.value = withSpring(400, { mass: 0.7, damping: 22, stiffness: 280 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleShare = useCallback(async () => {
    hapticMed();

    const saved  = data.savedAmount;
    const pct    = data.cheaperPct;
    const item   = data.itemName || "item";
    const store  = data.store;
    const price  = data.price;
    const orig   = data.scannedPrice;

    const lines: string[] = [];
    lines.push(`🔍 Found ${item}${store ? ` on ${store}` : ""} for ${fmtMoney(price)}`);
    if (orig && orig > (price ?? 0)) {
      lines.push(`🏷️ It was listed for ${fmtMoney(orig)} — I saved ${fmtMoney(saved)}${pct ? ` (${Math.round(pct)}% cheaper)` : ""}`);
    }
    // Tweak 3: include identification basis (Carfax-style verification line)
    if (data.visionQuery) {
      lines.push(`🔬 Identified via: "${data.visionQuery}"`);
    }
    lines.push("");
    lines.push("Scanned with Evan AI — the smartest resale price checker 📱");
    lines.push("Try it: https://evanai.app");

    try {
      await Share.share({
        message: lines.join("\n"),
        title: `I saved ${fmtMoney(saved)} with Evan AI`,
      });
    } catch {}
  }, [data]);

  const handleCopyText = useCallback(async () => {
    hapticMed();
    // Compose text card
    const saved  = data.savedAmount;
    const item   = data.itemName || "item";
    const price  = data.price;
    const orig   = data.scannedPrice;
    const pct    = data.cheaperPct;

    const text = [
      `━━━━━━━━━━━━━━━━━━━━━`,
      `  EVAN AI DEAL FIND`,
      `━━━━━━━━━━━━━━━━━━━━━`,
      `  ${item}`,
      orig  ? `  Asking:  ${fmtMoney(orig)}` : null,
      price ? `  Found:   ${fmtMoney(price)}` : null,
      saved ? `  Saved:   ${fmtMoney(saved)}${pct ? ` · ${Math.round(pct)}% below market` : ""}` : null,
      `━━━━━━━━━━━━━━━━━━━━━`,
    ].filter(Boolean).join("\n");

    await Share.share({ message: text });
  }, [data]);

  if (!visible) return null;

  const hasSaved = Number.isFinite(data.savedAmount) && (data.savedAmount ?? 0) > 0;
  const savingsBig = hasSaved && (data.savedAmount ?? 0) >= 20;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      {/* Backdrop */}
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose}>
        <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.5)" }]} />
      </Pressable>

      {/* Card */}
      <Animated.View style={[styles.cardWrap, cardStyle]}>
        <View style={styles.card}>
          {/* Decorative accent top */}
          <View style={styles.accentBar} />

          {/* Header */}
          <View style={styles.row}>
            <View style={styles.brandBadge}>
              <Text style={styles.brandText}>EVAN AI</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={16} color="rgba(255,255,255,0.45)" />
            </Pressable>
          </View>

          {/* Item name */}
          <Text style={styles.itemName} numberOfLines={2}>
            {data.itemName || "Price Check"}
          </Text>

          {/* Tweak 3: Evidence Carousel — identification basis */}
          <EvidenceCarousel
            signals={data.evidenceSignals ?? []}
            query={data.visionQuery}
          />

          {/* Price comparison */}
          <View style={styles.priceRow}>
            {data.scannedPrice ? (
              <View style={styles.priceBlock}>
                <Text style={styles.priceLabel}>LISTED AT</Text>
                <Text style={[styles.priceValue, styles.strikePrice]}>{fmtMoney(data.scannedPrice)}</Text>
              </View>
            ) : null}
            {data.price ? (
              <View style={styles.priceBlock}>
                <Text style={styles.priceLabel}>FOUND FOR</Text>
                <Text style={[styles.priceValue, styles.dealPrice]}>{fmtMoney(data.price)}</Text>
              </View>
            ) : null}
            {hasSaved ? (
              <View style={[styles.priceBlock, styles.savingsBlock]}>
                <Text style={styles.priceLabel}>SAVED</Text>
                <Text style={[styles.priceValue, styles.savingsPrice]}>{fmtMoney(data.savedAmount)}</Text>
              </View>
            ) : null}
          </View>

          {/* Savings pill */}
          {data.cheaperPct && data.cheaperPct > 0 ? (
            <View style={styles.pill}>
              <Ionicons name="trending-down" size={12} color="rgba(0,220,120,0.9)" />
              <Text style={styles.pillText}>{Math.round(data.cheaperPct)}% below market price</Text>
            </View>
          ) : null}

          {savingsBig ? (
            <Text style={styles.heroMessage}>
              That&apos;s a real deal. 🎯
            </Text>
          ) : null}

          <Text style={styles.brandFooter}>Scanned with Evan AI</Text>

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable onPress={handleShare} style={styles.primaryBtn}>
              <Ionicons name="share-outline" size={16} color="black" />
              <Text style={styles.primaryBtnText}>Share this find</Text>
            </Pressable>
            <Pressable onPress={handleCopyText} style={styles.secondaryBtn}>
              <Ionicons name="copy-outline" size={14} color="rgba(255,255,255,0.7)" />
              <Text style={styles.secondaryBtnText}>Copy card</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SP.lg,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: "rgba(12,12,12,0.98)",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: SP.xl,
    shadowColor: "#000",
    shadowOpacity: 0.8,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: -8 },
    overflow: "hidden",
  },
  accentBar: {
    position: "absolute",
    top: 0,
    left: "20%",
    right: "20%",
    height: 1,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SP.md,
  },
  brandBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  brandText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  itemName: {
    color: "white",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
    lineHeight: 28,
    marginBottom: SP.lg,
  },
  priceRow: {
    flexDirection: "row",
    gap: SP.md,
    marginBottom: SP.md,
  },
  priceBlock: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: R.md,
    padding: SP.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  savingsBlock: {
    backgroundColor: "rgba(0,200,120,0.08)",
    borderColor: "rgba(0,200,120,0.20)",
  },
  priceLabel: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 20,
    fontWeight: "900",
  },
  strikePrice: {
    color: "rgba(255,255,255,0.35)",
    textDecorationLine: "line-through",
  },
  dealPrice: {
    color: "rgba(255,255,255,0.92)",
  },
  savingsPrice: {
    color: "rgba(0,220,120,0.95)",
  },
  pill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: R.pill,
    backgroundColor: "rgba(0,200,120,0.10)",
    borderWidth: 1,
    borderColor: "rgba(0,200,120,0.22)",
    marginBottom: SP.md,
  },
  pillText: {
    color: "rgba(0,220,120,0.9)",
    fontSize: 12,
    fontWeight: "700",
  },
  heroMessage: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: SP.md,
  },
  brandFooter: {
    color: "rgba(255,255,255,0.25)",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: SP.lg,
  },
  actions: {
    gap: SP.sm,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "white",
    borderRadius: R.md,
    paddingVertical: 14,
  },
  primaryBtnText: {
    color: "black",
    fontSize: 15,
    fontWeight: "900",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: R.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  secondaryBtnText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    fontWeight: "700",
  },
});
