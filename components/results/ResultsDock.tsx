/**
 * ResultsDock — glass-frosted fixed action bar anchored to the bottom of the results screen.
 * Contains all primary + secondary actions. Rises in with spring entrance.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated as RNAnimated,
  Easing,
  Platform,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, SP, R, TY, SH, fmtMoney, EASE_PANTHERE, SINGULARITY } from "../design/DS";
import { PressableScale } from "../primitives/PressableScale";
import { DecisionSheet } from "./DecisionSheet";

const IS_ANDROID = Platform.OS === "android";
const panthere = Easing.bezier(EASE_PANTHERE[0], EASE_PANTHERE[1], EASE_PANTHERE[2], EASE_PANTHERE[3]);

interface ResultsDockProps {
  activeResult: any;
  /** The currently selected card (may differ from activeResult when swiped) */
  currentCard?: any;
  userId?: string | null;
  apiBase?: string;
  onOpenListing: () => void;
  onNewScan: () => void;
  onTrack: () => void;
  onCopy: () => void;
  onDetails?: () => void;
  onProfitCalc?: () => void;
  onScanAgain?: () => void;
  onAskAI?: () => void;
  onAutoList?: () => void;
  /** Lowball Generator — opens index.tsx's lowball sheet (existing impl). */
  onLowball?: () => void;
  /**
   * Bought It — fires when the user confirms a purchase.
   * Parent should both open DecisionSheet and trigger ConfettiBurst.
   * If omitted, falls back to the local DecisionSheet without confetti.
   */
  onBoughtIt?: () => void;
  /**
   * Whether the active result is currently in the watchlist. Drives the
   * Track chip's visual state (warm gold tint when tracked, neutral grey
   * when untracked). Toggling visibility is owned by the parent via
   * onTrack — the dock just renders the state.
   */
  isTracked?: boolean;
}

export function ResultsDock({
  activeResult,
  currentCard,
  userId,
  apiBase = "http://192.168.1.227:3001",
  onOpenListing,
  onNewScan,
  onTrack,
  onCopy,
  onDetails,
  onProfitCalc,
  onScanAgain,
  onAskAI,
  onAutoList,
  onLowball,
  onBoughtIt,
  isTracked,
}: ResultsDockProps) {
  const insets = useSafeAreaInsets();
  const [decisionOpen, setDecisionOpen] = useState(false);

  // Entrance animation: dock rises from bottom
  const translateY = useRef(new RNAnimated.Value(80)).current;
  const opacity    = useRef(new RNAnimated.Value(0)).current;
  const dotPulse   = useRef(new RNAnimated.Value(0.35)).current;

  useEffect(() => {
    RNAnimated.loop(RNAnimated.sequence([
      RNAnimated.timing(dotPulse, { toValue: 0.85, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      RNAnimated.timing(dotPulse, { toValue: 0.35, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    RNAnimated.parallel([
      RNAnimated.timing(opacity, {
        toValue: 1,
        duration: SINGULARITY.duration,
        delay: 120,
        easing: panthere,
        useNativeDriver: true,
      }),
      RNAnimated.timing(translateY, {
        toValue: 0,
        duration: SINGULARITY.duration,
        delay: 120,
        easing: panthere,
        useNativeDriver: true,
      }),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Price intelligence line
  const card        = currentCard || activeResult;
  const price       = Number.isFinite(Number(card?.price)) ? Number(card.price) : null;
  const _paid        = Number.isFinite(Number(activeResult?.scannedPrice)) ? Number(activeResult.scannedPrice) : null;
  const saved       = Number.isFinite(Number(activeResult?.savedAmount)) ? Number(activeResult.savedAmount) : null;
  const hasSaved    = saved != null && saved > 0;
  const cheaperPct  = Number.isFinite(Number(activeResult?.cheaperPct)) ? Number(activeResult.cheaperPct) : null;
  const totalMatches = activeResult?.totalMatches ?? 0;
  const store       = card?.store || card?.source || null;

  return (
    <RNAnimated.View
      style={[
        styles.dockWrap,
        { opacity, transform: [{ translateY }] },
        { paddingBottom: Math.max(insets.bottom, SP.md) + SP.sm },
      ]}
      renderToHardwareTextureAndroid={IS_ANDROID}
      shouldRasterizeIOS={!IS_ANDROID}
      needsOffscreenAlphaCompositing={IS_ANDROID}
    >
      <BlurView intensity={72} tint="dark" style={StyleSheet.absoluteFillObject} />
      <View style={styles.dockOverlay} />

      {/* Intelligence strip */}
      {(hasSaved || price != null) ? (
        <View style={styles.intelStrip}>
          {hasSaved ? (
            <>
              <RNAnimated.View
                style={[styles.intelDot, { opacity: dotPulse }]}
                renderToHardwareTextureAndroid={IS_ANDROID}
                shouldRasterizeIOS={!IS_ANDROID}
              />
              <Text style={styles.intelText} allowFontScaling={false} numberOfLines={1}>
                Save {fmtMoney(saved)}{cheaperPct != null ? ` · ${Math.round(cheaperPct)}% below market` : " vs what you paid"}
              </Text>
            </>
          ) : price != null ? (
            <>
              <RNAnimated.View
                style={[styles.intelDot, { opacity: dotPulse }]}
                renderToHardwareTextureAndroid={IS_ANDROID}
                shouldRasterizeIOS={!IS_ANDROID}
              />
              <Text style={styles.intelText} allowFontScaling={false} numberOfLines={1}>
                Best price found: {fmtMoney(price)}{totalMatches > 0 ? ` · ${totalMatches} listings checked` : ""}
              </Text>
            </>
          ) : null}
        </View>
      ) : null}

      {/* Primary row: Open + New Scan.
          Open button is intentionally compact (flex 2:2). When the merchant
          name is long (eBay – frankshop21s, etc.) we drop the store name and
          show the generic "View listing" so the chip never billboard-dominates
          the dock. The full merchant attribution lives in the card's store
          line, not this CTA. */}
      <View style={styles.primaryRow}>
        <PressableScale onPress={onOpenListing} style={styles.openBtn} scale={0.96} haptic>
          <Ionicons name="open-outline" size={16} color="#000" />
          <Text style={styles.openText} allowFontScaling={false} numberOfLines={1}>
            {store && String(store).length <= 9 ? `View on ${store}` : "View listing"}
          </Text>
        </PressableScale>

        <PressableScale onPress={onNewScan} style={styles.newScanBtn} scale={0.96} haptic>
          <Ionicons name="camera-outline" size={16} color={C.text} />
          <Text style={styles.newScanText} allowFontScaling={false} numberOfLines={1}>New scan</Text>
        </PressableScale>
      </View>

      {/* Action grid — restored. Layout: 3 columns, wraps to 3 rows on phones.
          `Bought it` and `Ask AI` are highlighted (premium chips); everything
          else is the quiet secondary treatment. Each chip is rendered only
          when its callback is wired, so a parent that doesn't pass `onAskAI`
          (e.g. legacy host) gets a graceful tighter grid instead of dead taps. */}
      <View style={styles.secondaryRow}>
        <ActionChip
          icon="bag-check-outline"
          label="Bought it"
          highlight
          onPress={() => {
            // Confetti is parent-owned (it overlays the entire results screen);
            // the dock just signals the intent. The DecisionSheet stays as the
            // attribution capture path below.
            if (onBoughtIt) onBoughtIt();
            setDecisionOpen(true);
          }}
        />
        {onAskAI ? (
          <ActionChip icon="sparkles" label="Ask AI" onPress={onAskAI} highlight />
        ) : null}
        {onAutoList ? (
          <ActionChip icon="document-text-outline" label="List it" onPress={onAutoList} highlight />
        ) : null}
        <ActionChip
          icon={isTracked ? "bookmark" : "bookmark-outline"}
          label={isTracked ? "Tracking" : "Track"}
          onPress={onTrack}
          tracked={isTracked}
        />
        <ActionChip icon="copy-outline"     label="Copy"    onPress={onCopy} />
        {onScanAgain ? (
          <ActionChip icon="refresh-outline"  label="Rescan"  onPress={onScanAgain} />
        ) : null}
        {onLowball ? (
          <ActionChip icon="chatbubbles-outline" label="Lowball" onPress={onLowball} />
        ) : null}
        {onProfitCalc ? (
          <ActionChip icon="calculator-outline" label="Profit" onPress={onProfitCalc} />
        ) : null}
        {onDetails ? (
          <ActionChip icon="information-circle-outline" label="Details" onPress={onDetails} />
        ) : null}
      </View>

      {/* Decision + source capture sheet */}
      <DecisionSheet
        visible={decisionOpen}
        scanId={activeResult?.scanId ?? null}
        userId={userId ?? null}
        itemName={activeResult?.itemName ?? null}
        apiBase={apiBase}
        onClose={() => setDecisionOpen(false)}
      />
    </RNAnimated.View>
  );
}

function ActionChip({
  icon,
  label,
  onPress,
  highlight,
  tracked,
}: {
  icon: string;
  label: string;
  onPress?: () => void;
  highlight?: boolean;
  /** Warm gold tracked state — distinct from highlight so the Track chip
   *  reads as a toggle, not a CTA. Tracked > highlight visually. */
  tracked?: boolean;
}) {
  // tracked takes precedence over highlight to avoid the Track chip ever
  // showing the white-tinted "premium CTA" look while it's already on.
  const iconColor =
    tracked   ? "rgba(255,205,90,0.95)" :
    highlight ? "rgba(255,255,255,0.9)" :
    C.text2;
  return (
    <PressableScale
      onPress={onPress}
      style={[
        styles.chip,
        highlight && !tracked && styles.chipHighlight,
        tracked && styles.chipTracked,
      ]}
      scale={0.94}
      haptic
    >
      <Ionicons name={icon as any} size={15} color={iconColor} />
      <Text
        style={[
          styles.chipText,
          highlight && !tracked && styles.chipTextHighlight,
          tracked && styles.chipTextTracked,
        ]}
        allowFontScaling={false}
        numberOfLines={1}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  dockWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: SP.md,
    paddingHorizontal: SP.lg,
    marginTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.borderMid,
    overflow: "hidden",
    ...SH.dock,
  },
  dockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4,4,4,0.60)",
  },

  // Intelligence strip
  intelStrip: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SP.md,
    gap: SP.xs,
  },
  intelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  intelText: {
    ...TY.cap,
    color: C.text3,
    letterSpacing: 0.4,
  },

  // Primary
  primaryRow: {
    flexDirection: "row",
    gap: SP.sm,
    marginBottom: SP.sm,
  },
  // Open + New scan share the row 50/50 so the white CTA never billboards.
  openBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: R.lg,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: SP.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.45)",
  },
  openText: {
    ...TY.bodyBold,
    color: "#000",
    fontSize: 14,
    fontWeight: "800",
  },
  newScanBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: R.lg,
    backgroundColor: C.s2,
    borderWidth: 1,
    borderColor: C.borderMid,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: SP.sm,
  },
  newScanText: {
    ...TY.bodyBold,
    color: C.text,
    fontSize: 13,
  },

  // Premium 2-column grid — every chip is exactly half-width minus the gap,
  // every chip is the same height, every chip aligns to a clean grid line.
  // The prior flex-basis-28% / flexGrow-1 layout produced a cramped 3-up
  // row that resized chips based on label length (Bought it wider than
  // Copy, etc.) — looked chaotic. With flexBasis "48%" the two columns are
  // identical and the rows stack cleanly.
  secondaryRow: {
    flexDirection: "row",
    gap: SP.sm,
    flexWrap: "wrap",
    rowGap: SP.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 44,
    paddingHorizontal: SP.md,
    borderRadius: R.md,
    backgroundColor: C.s1,
    borderWidth: 1,
    borderColor: C.border,
    flexBasis: "48%",
    flexGrow: 0,
  },
  chipText: {
    ...TY.label,
    color: C.text2,
    fontSize: 12,
    fontWeight: "600" as const,
  },
  chipHighlight: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderColor: "rgba(255,255,255,0.22)",
  },
  chipTextHighlight: {
    color: "rgba(255,255,255,0.92)",
    fontWeight: "700" as const,
  },
  // Warm gold tracked state — premium toggle look, distinct from white CTA.
  chipTracked: {
    backgroundColor: "rgba(255,205,90,0.12)",
    borderColor: "rgba(255,205,90,0.45)",
  },
  chipTextTracked: {
    color: "rgba(255,225,150,0.95)",
    fontWeight: "800" as const,
  },
});
