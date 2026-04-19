/**
 * PlatformShareDrawer — slide-up drawer for cross-platform listing sharing.
 *
 * Shows platform-specific action buttons in a 2-column grid.
 * Each button copies relevant listing text to clipboard, then opens
 * the platform's deep link (or falls back to the web URL).
 * "Share Listing" opens the native iOS/Android share sheet.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Linking,
  Share,
  Dimensions,
  Platform,
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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlatformShareDrawerListing {
  title: string;
  description: string;
  price: number;
  category: string;
  tags: string[];
}

interface PlatformShareDrawerProps {
  visible: boolean;
  onClose: () => void;
  listing: PlatformShareDrawerListing | null;
  imageUrl?: string;
}

// ─── Platform config ──────────────────────────────────────────────────────────

interface PlatformConfig {
  id: string;
  name: string;
  subtitle: string;
  deepLink: string;
  webUrl: string;
  iconColor: string;
  bgColor: string;
  borderColor: string;
  letter: string;
}

const PLATFORMS: PlatformConfig[] = [
  {
    id: "ebay",
    name: "eBay",
    subtitle: "Opens app or browser",
    deepLink: "ebay://sell",
    webUrl: "https://www.ebay.com/sell",
    iconColor: "#3665F3",
    bgColor: "rgba(54,101,243,0.14)",
    borderColor: "rgba(54,101,243,0.30)",
    letter: "e",
  },
  {
    id: "mercari",
    name: "Mercari",
    subtitle: "Title copied first",
    deepLink: "mercari://us/sell",
    webUrl: "https://mercari.com/sell",
    iconColor: "#FF4F00",
    bgColor: "rgba(255,79,0,0.13)",
    borderColor: "rgba(255,79,0,0.28)",
    letter: "m",
  },
  {
    id: "poshmark",
    name: "Poshmark",
    subtitle: "Title copied first",
    deepLink: "poshmark://sell",
    webUrl: "https://poshmark.com/sell",
    iconColor: "#E8205C",
    bgColor: "rgba(232,32,92,0.12)",
    borderColor: "rgba(232,32,92,0.28)",
    letter: "p",
  },
  {
    id: "facebook",
    name: "Marketplace",
    subtitle: "Facebook · Opens app",
    deepLink: "fb://marketplace/sell",
    webUrl: "https://facebook.com/marketplace/create/item",
    iconColor: "#1877F2",
    bgColor: "rgba(24,119,242,0.12)",
    borderColor: "rgba(24,119,242,0.28)",
    letter: "f",
  },
  {
    id: "offerup",
    name: "OfferUp",
    subtitle: "Opens app or browser",
    deepLink: "offerup://sell",
    webUrl: "https://offerup.com/post",
    iconColor: "#28C76F",
    bgColor: "rgba(40,199,111,0.12)",
    borderColor: "rgba(40,199,111,0.28)",
    letter: "o",
  },
];

const { height: SCREEN_H } = Dimensions.get("window");

// ─── Component ────────────────────────────────────────────────────────────────

export function PlatformShareDrawer({
  visible,
  onClose,
  listing,
  imageUrl: _imageUrl,
}: PlatformShareDrawerProps) {
  const insets = useSafeAreaInsets();
  const [_toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Animations ────────────────────────────────────────────────────────────
  const translateY = useSharedValue(SCREEN_H);
  const backdropOp = useSharedValue(0);
  const toastOp = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      backdropOp.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
      translateY.value = withSpring(0, { damping: 28, stiffness: 260, mass: 1 });
    } else {
      backdropOp.value = withTiming(0, { duration: 200 });
      translateY.value = withSpring(SCREEN_H, { damping: 28, stiffness: 260, mass: 1 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOp.value,
  }));
  const toastStyle = useAnimatedStyle(() => ({
    opacity: toastOp.value,
  }));

  // ── Toast helper ──────────────────────────────────────────────────────────
  const showToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastOp.value = withTiming(1, { duration: 180 });
    setToastVisible(true);
    toastTimer.current = setTimeout(() => {
      toastOp.value = withTiming(0, { duration: 300 });
      setToastVisible(false);
    }, 1600);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Clipboard helpers ─────────────────────────────────────────────────────
  const _copyListingText = useCallback(async () => {
    if (!listing) return;
    const text = `${listing.title}\n\nPrice: ${fmtMoney(listing.price)}\n\n${listing.description}\n\nTags: ${listing.tags.join(", ")}`;
    await Clipboard.setStringAsync(text);
  }, [listing]);

  const copyTitleAndPrice = useCallback(async () => {
    if (!listing) return;
    const text = `${listing.title} — ${fmtMoney(listing.price)}`;
    await Clipboard.setStringAsync(text);
  }, [listing]);

  // ── Platform press ────────────────────────────────────────────────────────
  const handlePlatformPress = useCallback(
    async (platform: PlatformConfig) => {
      if (!listing) return;
      try { Haptics.selectionAsync(); } catch {}

      // For Mercari and Poshmark, copy title first for easy paste
      if (platform.id === "mercari" || platform.id === "poshmark") {
        await copyTitleAndPrice();
        showToast();
      } else {
        await copyTitleAndPrice();
      }

      // Build deep link with optional title param for eBay
      let url = platform.deepLink;
      if (platform.id === "ebay") {
        url = `${platform.deepLink}?title=${encodeURIComponent(listing.title)}`;
      }

      try {
        const canOpen = await Linking.canOpenURL(url);
        if (canOpen) {
          await Linking.openURL(url);
        } else {
          await Linking.openURL(platform.webUrl);
        }
      } catch {
        try {
          await Linking.openURL(platform.webUrl);
        } catch {}
      }
    },
    [listing, copyTitleAndPrice, showToast],
  );

  // ── Share listing ─────────────────────────────────────────────────────────
  const handleShareListing = useCallback(async () => {
    if (!listing) return;
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}

    const formattedText = `${listing.title}\n\nPrice: ${fmtMoney(listing.price)}\n\n${listing.description}\n\nTags: ${listing.tags.join(", ")}`;

    await Clipboard.setStringAsync(formattedText);
    showToast();

    try {
      await Share.share({ message: formattedText });
    } catch {}
  }, [listing, showToast]);

  // ─────────────────────────────────────────────────────────────────────────

  if (!visible && translateY.value >= SCREEN_H - 1) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? "auto" : "none"}>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Drawer */}
      <Animated.View
        style={[
          styles.drawer,
          drawerStyle,
          { paddingBottom: Math.max(insets.bottom, 16) },
        ]}
        pointerEvents="box-none"
      >
        {/* Glass backing */}
        {Platform.OS === "ios" ? (
          <BlurView intensity={78} tint="dark" style={StyleSheet.absoluteFillObject} />
        ) : null}
        <View style={styles.drawerOverlay} />

        {/* Drag handle */}
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerBadge}>
              <Ionicons name="share-social" size={12} color="rgba(255,255,255,0.9)" />
            </View>
            <Text style={styles.headerTitle}>Post to Platform</Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={10}>
            <Ionicons name="close" size={18} color={C.text3} />
          </Pressable>
        </View>

        {/* Listing title preview */}
        {listing ? (
          <View style={styles.listingPreview}>
            <Text numberOfLines={1} style={styles.previewTitle}>{listing.title}</Text>
            <Text style={styles.previewPrice}>{fmtMoney(listing.price)}</Text>
          </View>
        ) : null}

        {/* Platform grid */}
        <View style={styles.grid}>
          {PLATFORMS.map((platform) => (
            <Pressable
              key={platform.id}
              onPress={() => handlePlatformPress(platform)}
              style={({ pressed }) => [
                styles.platformCard,
                { backgroundColor: platform.bgColor, borderColor: platform.borderColor },
                pressed && styles.platformCardPressed,
              ]}
            >
              {/* Letter avatar */}
              <View style={[styles.letterAvatar, { backgroundColor: platform.iconColor + "26" }]}>
                <Text style={[styles.letterText, { color: platform.iconColor }]}>
                  {platform.letter.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.platformName}>{platform.name}</Text>
              <Text style={styles.platformSubtitle}>{platform.subtitle}</Text>
            </Pressable>
          ))}

          {/* Share Listing button — full row */}
          <Pressable
            onPress={handleShareListing}
            style={({ pressed }) => [
              styles.shareListingCard,
              pressed && styles.platformCardPressed,
            ]}
          >
            <View style={styles.shareListingInner}>
              <View style={styles.shareIconWrap}>
                <Ionicons name="share-outline" size={18} color="#ffffff" />
              </View>
              <View style={styles.shareListingText}>
                <Text style={styles.shareListingTitle}>Share Listing</Text>
                <Text style={styles.shareListingSubtitle}>Copy text + open share sheet</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={C.text4} />
            </View>
          </Pressable>
        </View>

        {/* Toast */}
        <Animated.View style={[styles.toast, toastStyle]} pointerEvents="none">
          <Ionicons name="checkmark-circle" size={14} color="rgba(120,255,170,0.95)" />
          <Text style={styles.toastText}>Copied!</Text>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  drawer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: R.xxl,
    borderTopRightRadius: R.xxl,
    overflow: "hidden",
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
  },
  headerBadge: {
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
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },

  listingPreview: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SP.lg,
    paddingVertical: SP.sm,
    gap: SP.sm,
  },
  previewTitle: {
    ...TY.label,
    color: C.text3,
    flex: 1,
    fontSize: 12,
  },
  previewPrice: {
    ...TY.label,
    color: C.text2,
    fontSize: 13,
    fontWeight: "800",
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: SP.md,
    paddingTop: SP.sm,
    paddingBottom: SP.md,
    gap: SP.sm,
  },

  platformCard: {
    width: "47%",
    // 2 columns with gap accounted for
    padding: SP.md,
    borderRadius: R.md,
    borderWidth: 1,
    alignItems: "flex-start",
    gap: SP.xs,
  },
  platformCardPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.97 }],
  },
  letterAvatar: {
    width: 32,
    height: 32,
    borderRadius: R.sm,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SP.xs,
  },
  letterText: {
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  platformName: {
    ...TY.h3,
    color: C.text,
    fontSize: 13,
  },
  platformSubtitle: {
    ...TY.cap,
    color: C.text4,
    fontSize: 10,
    letterSpacing: 0.2,
  },

  shareListingCard: {
    width: "100%",
    borderRadius: R.md,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    padding: SP.md,
  },
  shareListingInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.md,
  },
  shareIconWrap: {
    width: 36,
    height: 36,
    borderRadius: R.sm,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  shareListingText: {
    flex: 1,
    gap: 2,
  },
  shareListingTitle: {
    ...TY.h3,
    color: C.text,
    fontSize: 14,
  },
  shareListingSubtitle: {
    ...TY.cap,
    color: C.text4,
    fontSize: 10,
    letterSpacing: 0.2,
  },

  toast: {
    position: "absolute",
    bottom: 90,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: SP.xs,
    paddingHorizontal: SP.lg,
    paddingVertical: SP.sm,
    borderRadius: R.pill,
    backgroundColor: "rgba(20,20,20,0.94)",
    borderWidth: 1,
    borderColor: "rgba(120,255,170,0.28)",
  },
  toastText: {
    ...TY.label,
    color: "rgba(120,255,170,0.95)",
    fontSize: 13,
  },
});
