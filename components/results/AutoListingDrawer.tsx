/**
 * AutoListingDrawer — one-tap listing generator.
 *
 * Slides up from the bottom (same spring pattern as AskAIDrawer).
 * Calls /api/listing/generate with full scan context, then shows
 * title, description, price, category, tags, and recommended platforms —
 * each with an individual copy button and a "Copy All" CTA.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Share,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { C, SP, R, TY, fmtMoney } from "../design/DS";
import type { ScanContext } from "./AskAIDrawer";
import { PlatformShareDrawer } from "./PlatformShareDrawer";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GeneratedListing {
  title: string;
  description: string;
  price: number | null;
  category: string;
  tags: string[];
  platforms: string[];
}

interface AutoListingDrawerProps {
  visible: boolean;
  scanContext: ScanContext;
  apiBase: string;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AutoListingDrawer({ visible, scanContext, apiBase, onClose }: AutoListingDrawerProps) {
  const insets = useSafeAreaInsets();
  const [listing, setListing] = useState<GeneratedListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [shareDrawerOpen, setShareDrawerOpen] = useState(false);

  // Opacity-only entrance — even the 4-px nudge subtly drove the keyboard
  // avoid-padding measurement and produced micro-jitter on iPhones.
  const drawerOpacity = useSharedValue(0);
  const backdropOp    = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      backdropOp.value    = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
      drawerOpacity.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) });
    } else {
      backdropOp.value    = withTiming(0, { duration: 180 });
      drawerOpacity.value = withTiming(0, { duration: 180 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Auto-generate when drawer opens (if no listing yet for this item)
  const prevItem = React.useRef<string | null>(null);
  useEffect(() => {
    const name = scanContext?.itemName ?? null;
    if (visible && name && name !== prevItem.current) {
      prevItem.current = name;
      setListing(null);
      setError(null);
      generate();
    } else if (visible && !listing && !loading) {
      generate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const drawerStyle = useAnimatedStyle(() => ({
    opacity: drawerOpacity.value,
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOp.value,
  }));

  // ── Generate ─────────────────────────────────────────────────────────────
  const generate = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${apiBase}/api/listing/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanContext }),
        signal: AbortSignal.timeout(25000),
      });
      const json = await resp.json();
      if (json?.ok && json.listing) {
        setListing(json.listing);
      } else {
        setError("Couldn't generate a listing — try again.");
      }
    } catch {
      setError("Network error — check your connection.");
    } finally {
      setLoading(false);
    }
  }, [loading, apiBase, scanContext]);

  // ── Copy helpers ─────────────────────────────────────────────────────────
  const copyField = useCallback(async (key: string, value: string) => {
    try { Haptics.selectionAsync(); } catch {}
    await Clipboard.setStringAsync(value);
    setCopiedField(key);
    setTimeout(() => setCopiedField((prev) => (prev === key ? null : prev)), 2000);
  }, []);

  const copyAll = useCallback(async () => {
    if (!listing) return;
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    const full = [
      `📦 ${listing.title}`,
      ``,
      listing.description,
      ``,
      listing.price != null ? `💰 Price: ${fmtMoney(listing.price)}` : null,
      `🏷️ Category: ${listing.category}`,
      listing.tags.length > 0 ? `🔖 Tags: ${listing.tags.join(", ")}` : null,
      listing.platforms.length > 0 ? `📱 Best on: ${listing.platforms.join(", ")}` : null,
    ].filter(Boolean).join("\n");
    await Clipboard.setStringAsync(full);
    setCopiedField("all");
    setTimeout(() => setCopiedField((prev) => (prev === "all" ? null : prev)), 2500);
  }, [listing]);

  const shareAll = useCallback(async () => {
    if (!listing) return;
    try { Haptics.selectionAsync(); } catch {}
    const full = [
      listing.title,
      ``,
      listing.description,
      ``,
      listing.price != null ? `Price: ${fmtMoney(listing.price)}` : null,
      listing.tags.length > 0 ? `Tags: ${listing.tags.join(", ")}` : null,
    ].filter(Boolean).join("\n");
    try {
      await Share.share({ message: full, title: listing.title });
    } catch {}
  }, [listing]);

  // ─────────────────────────────────────────────────────────────────────────

  // Unmount once the fade-out finishes so the drawer can't intercept taps invisibly.
  if (!visible && drawerOpacity.value < 0.02) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? "auto" : "none"}>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Drawer */}
      <KeyboardAvoidingView
        style={styles.kavWrap}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.drawer, drawerStyle, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {/* Glass backing */}
          {Platform.OS === "ios" ? (
            <BlurView intensity={78} tint="dark" style={StyleSheet.absoluteFillObject} />
          ) : null}
          <View style={styles.drawerOverlay} />

          {/* Handle bar */}
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.listBadge}>
                <Ionicons name="document-text" size={12} color="rgba(255,255,255,0.9)" />
              </View>
              <Text style={styles.headerTitle}>Auto-Listing</Text>
              {scanContext?.itemName ? (
                <Text style={styles.headerSub} numberOfLines={1}>
                  · {scanContext.itemName}
                </Text>
              ) : null}
            </View>
            <View style={styles.headerActions}>
              {listing ? (
                <Pressable onPress={shareAll} style={styles.headerIconBtn} hitSlop={10}>
                  <Ionicons name="share-outline" size={17} color={C.text3} />
                </Pressable>
              ) : null}
              <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={10}>
                <Ionicons name="close" size={18} color={C.text3} />
              </Pressable>
            </View>
          </View>

          {/* Content */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color="rgba(255,255,255,0.5)" />
                <Text style={styles.loadingText}>Generating your listing…</Text>
              </View>
            ) : error ? (
              <View style={styles.errorWrap}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable onPress={generate} style={styles.retryBtn}>
                  <Ionicons name="refresh" size={14} color={C.text2} />
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              </View>
            ) : listing ? (
              <>
                {/* Title */}
                <ListingField
                  label="TITLE"
                  value={listing.title}
                  fieldKey="title"
                  copiedField={copiedField}
                  onCopy={copyField}
                  mono={false}
                  large
                />

                {/* Price + Category row */}
                <View style={styles.twoCol}>
                  <View style={styles.twoColItem}>
                    <Text style={styles.fieldLabel}>PRICE</Text>
                    <Text style={styles.priceValue}>
                      {listing.price != null ? fmtMoney(listing.price) : "—"}
                    </Text>
                    <Pressable
                      onPress={() => listing.price != null && copyField("price", String(listing.price))}
                      style={styles.smallCopyBtn}
                      hitSlop={8}
                    >
                      <Ionicons
                        name={copiedField === "price" ? "checkmark" : "copy-outline"}
                        size={13}
                        color={copiedField === "price" ? "rgba(120,255,160,0.9)" : C.text4}
                      />
                    </Pressable>
                  </View>
                  <View style={[styles.twoColItem, styles.twoColRight]}>
                    <Text style={styles.fieldLabel}>CATEGORY</Text>
                    <Text style={styles.categoryValue} numberOfLines={2}>{listing.category}</Text>
                    <Pressable
                      onPress={() => copyField("category", listing.category)}
                      style={styles.smallCopyBtn}
                      hitSlop={8}
                    >
                      <Ionicons
                        name={copiedField === "category" ? "checkmark" : "copy-outline"}
                        size={13}
                        color={copiedField === "category" ? "rgba(120,255,160,0.9)" : C.text4}
                      />
                    </Pressable>
                  </View>
                </View>

                {/* Description */}
                <ListingField
                  label="DESCRIPTION"
                  value={listing.description}
                  fieldKey="description"
                  copiedField={copiedField}
                  onCopy={copyField}
                />

                {/* Tags */}
                {listing.tags.length > 0 ? (
                  <View style={styles.fieldBlock}>
                    <View style={styles.fieldLabelRow}>
                      <Text style={styles.fieldLabel}>TAGS</Text>
                      <Pressable
                        onPress={() => copyField("tags", listing.tags.join(", "))}
                        style={styles.copyIcon}
                        hitSlop={8}
                      >
                        <Ionicons
                          name={copiedField === "tags" ? "checkmark" : "copy-outline"}
                          size={14}
                          color={copiedField === "tags" ? "rgba(120,255,160,0.9)" : C.text4}
                        />
                      </Pressable>
                    </View>
                    <View style={styles.tagRow}>
                      {listing.tags.map((t) => (
                        <View key={t} style={styles.tag}>
                          <Text style={styles.tagText}>{t}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                {/* Platforms */}
                {listing.platforms.length > 0 ? (
                  <View style={styles.fieldBlock}>
                    <Text style={styles.fieldLabel}>BEST PLATFORMS</Text>
                    <View style={styles.platformRow}>
                      {listing.platforms.map((p) => (
                        <View key={p} style={styles.platformPill}>
                          <Ionicons name="storefront-outline" size={12} color={C.text3} />
                          <Text style={styles.platformText}>{p}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                {/* Spacer for CTA */}
                <View style={{ height: SP.xl }} />
              </>
            ) : null}
          </ScrollView>

          {/* Bottom CTA */}
          {listing && !loading ? (
            <>
              <View style={styles.cta}>
                <Pressable
                  onPress={copyAll}
                  style={({ pressed }) => [styles.copyAllBtn, pressed && styles.copyAllBtnPressed]}
                >
                  <Ionicons
                    name={copiedField === "all" ? "checkmark-circle" : "copy"}
                    size={17}
                    color={copiedField === "all" ? "rgba(120,255,160,0.95)" : "#000"}
                  />
                  <Text style={[styles.copyAllText, copiedField === "all" && styles.copyAllTextDone]}>
                    {copiedField === "all" ? "Copied!" : "Copy full listing"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={generate}
                  style={({ pressed }) => [styles.regenerateBtn, pressed && { opacity: 0.7 }]}
                  hitSlop={8}
                >
                  <Ionicons name="refresh" size={14} color={C.text3} />
                </Pressable>
              </View>
              <Pressable
                onPress={() => setShareDrawerOpen(true)}
                style={({ pressed }) => [styles.postToPlatformRow, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="share-social-outline" size={14} color={C.text3} />
                <Text style={styles.postToPlatformText}>Post to platform →</Text>
              </Pressable>
            </>
          ) : null}
        </Animated.View>
      </KeyboardAvoidingView>

      {/* Platform share drawer */}
      <PlatformShareDrawer
        visible={shareDrawerOpen}
        onClose={() => setShareDrawerOpen(false)}
        listing={
          listing
            ? {
                title: listing.title,
                description: listing.description,
                price: listing.price ?? 0,
                category: listing.category,
                tags: listing.tags,
              }
            : null
        }
      />
    </View>
  );
}

// ─── ListingField helper ──────────────────────────────────────────────────────

function ListingField({
  label,
  value,
  fieldKey,
  copiedField,
  onCopy,
  mono = false,
  large = false,
}: {
  label: string;
  value: string;
  fieldKey: string;
  copiedField: string | null;
  onCopy: (key: string, value: string) => void;
  mono?: boolean;
  large?: boolean;
}) {
  const copied = copiedField === fieldKey;
  return (
    <View style={styles.fieldBlock}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Pressable onPress={() => onCopy(fieldKey, value)} style={styles.copyIcon} hitSlop={8}>
          <Ionicons
            name={copied ? "checkmark" : "copy-outline"}
            size={14}
            color={copied ? "rgba(120,255,160,0.9)" : C.text4}
          />
        </Pressable>
      </View>
      <Text style={[styles.fieldValue, large && styles.fieldValueLarge, mono && styles.fieldValueMono]}>
        {value}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  kavWrap: {
    flex: 1,
    justifyContent: "flex-end",
  },
  drawer: {
    borderTopLeftRadius: R.xxl,
    borderTopRightRadius: R.xxl,
    overflow: "hidden",
    maxHeight: "90%",
    minHeight: 340,
    backgroundColor: "rgba(10,10,10,0.96)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(6,6,6,0.72)",
  },

  handleRow: {
    alignItems: "center",
    paddingTop: SP.md,
    paddingBottom: SP.sm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.18)",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SP.lg,
    paddingBottom: SP.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
    minWidth: 0,
  },
  listBadge: {
    width: 24,
    height: 24,
    borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.20)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...TY.h3,
    color: C.text,
  },
  headerSub: {
    ...TY.label,
    color: C.text4,
    flex: 1,
    fontSize: 11,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
  },
  headerIconBtn: {
    width: 32,
    height: 32,
    borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },

  scroll: { flex: 1 },
  scrollContent: {
    padding: SP.lg,
    paddingBottom: SP.sm,
  },

  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SP.xxxl,
    gap: SP.md,
  },
  loadingText: {
    ...TY.label,
    color: C.text4,
    fontSize: 13,
  },

  errorWrap: {
    alignItems: "center",
    paddingVertical: SP.xxl,
    gap: SP.md,
  },
  errorText: {
    ...TY.body,
    color: C.text3,
    textAlign: "center",
    fontSize: 14,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.xs,
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm,
    borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  retryText: {
    ...TY.label,
    color: C.text2,
    fontSize: 13,
  },

  fieldBlock: {
    marginBottom: SP.lg,
  },
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SP.xs + 2,
    gap: SP.xs,
  },
  fieldLabel: {
    ...TY.cap,
    color: C.text4,
    letterSpacing: 1.0,
    fontSize: 10,
    flex: 1,
  },
  copyIcon: {
    padding: 2,
  },
  fieldValue: {
    ...TY.body,
    color: C.text2,
    fontSize: 14,
    lineHeight: 21,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: R.md,
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm + 2,
  },
  fieldValueLarge: {
    ...TY.body,
    color: C.text,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
  },
  fieldValueMono: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 12,
  },

  twoCol: {
    flexDirection: "row",
    gap: SP.md,
    marginBottom: SP.lg,
  },
  twoColItem: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: R.md,
    padding: SP.md,
  },
  twoColRight: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: "rgba(255,255,255,0.06)",
  },
  priceValue: {
    ...TY.price,
    color: C.text,
    fontSize: 22,
    marginTop: 4,
    marginBottom: 4,
  },
  categoryValue: {
    ...TY.body,
    color: C.text2,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 4,
    flex: 1,
  },
  smallCopyBtn: {
    alignSelf: "flex-start",
    marginTop: 2,
  },

  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SP.sm,
  },
  tag: {
    paddingHorizontal: SP.md,
    paddingVertical: 5,
    borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  tagText: {
    ...TY.cap,
    color: C.text3,
    fontSize: 11,
    letterSpacing: 0.3,
  },

  platformRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SP.sm,
    marginTop: SP.xs,
  },
  platformPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: SP.md,
    paddingVertical: 6,
    borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.16)",
  },
  platformText: {
    ...TY.label,
    color: C.text2,
    fontSize: 12,
    fontWeight: "600",
  },

  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
    paddingHorizontal: SP.lg,
    paddingTop: SP.sm,
    paddingBottom: SP.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.07)",
  },
  copyAllBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SP.sm,
    minHeight: 50,
    borderRadius: R.lg,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.55)",
  },
  copyAllBtnPressed: {
    transform: [{ scale: 0.97 }],
  },
  copyAllText: {
    ...TY.bodyBold,
    color: "#000",
    fontSize: 15,
    fontWeight: "900",
  },
  copyAllTextDone: {
    color: "rgba(0,180,90,0.95)",
  },
  regenerateBtn: {
    width: 50,
    height: 50,
    borderRadius: R.lg,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  postToPlatformRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SP.xs,
    paddingVertical: SP.sm,
    paddingHorizontal: SP.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  postToPlatformText: {
    ...TY.label,
    color: C.text3,
    fontSize: 12,
  },
});
