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

      {/* Primary row: Open + New Scan */}
      <View style={styles.primaryRow}>
        <PressableScale onPress={onOpenListing} style={styles.openBtn} scale={0.96} haptic>
          <Ionicons name="open-outline" size={17} color="#000" />
          <Text style={styles.openText} allowFontScaling={false} numberOfLines={1}>
            {store ? `View on ${store}` : "View listing"}
          </Text>
        </PressableScale>

        <PressableScale onPress={onNewScan} style={styles.newScanBtn} scale={0.96} haptic>
          <Ionicons name="camera-outline" size={17} color={C.text} />
          <Text style={styles.newScanText} allowFontScaling={false} numberOfLines={1}>New scan</Text>
        </PressableScale>
      </View>

      {/* Secondary row: Bought · Ask AI · Track · Copy · Profit · Details */}
      <View style={styles.secondaryRow}>
        <ActionChip
          icon="bag-check-outline"
          label="Bought it"
          onPress={() => setDecisionOpen(true)}
          highlight
        />
        {onAskAI ? (
          <ActionChip icon="sparkles" label="Ask AI" onPress={onAskAI} highlight />
        ) : null}
        {onAutoList ? (
          <ActionChip icon="document-text-outline" label="List it" onPress={onAutoList} highlight />
        ) : null}
        <ActionChip icon="bookmark-outline" label="Track"   onPress={onTrack} />
        <ActionChip icon="copy-outline"     label="Copy"    onPress={onCopy} />
        {onScanAgain ? (
          <ActionChip icon="refresh-outline"  label="Rescan"  onPress={onScanAgain} />
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
}: {
  icon: string;
  label: string;
  onPress?: () => void;
  highlight?: boolean;
}) {
  return (
    <PressableScale
      onPress={onPress}
      style={[styles.chip, highlight && styles.chipHighlight]}
      scale={0.94}
      haptic
    >
      <Ionicons name={icon as any} size={15} color={highlight ? "rgba(255,255,255,0.9)" : C.text2} />
      <Text
        style={[styles.chipText, highlight && styles.chipTextHighlight]}
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
  openBtn: {
    flex: 3,
    minHeight: 52,
    borderRadius: R.lg,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SP.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.45)",
  },
  openText: {
    ...TY.bodyBold,
    color: "#000",
    fontSize: 15,
    fontWeight: "900",
  },
  newScanBtn: {
    flex: 2,
    minHeight: 52,
    borderRadius: R.lg,
    backgroundColor: C.s2,
    borderWidth: 1,
    borderColor: C.borderMid,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SP.sm,
  },
  newScanText: {
    ...TY.bodyBold,
    color: C.text,
    fontSize: 14,
  },

  // Secondary chips
  secondaryRow: {
    flexDirection: "row",
    gap: SP.sm,
    flexWrap: "wrap",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: SP.md,
    paddingVertical: 9,
    borderRadius: R.md,
    backgroundColor: C.s1,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipText: {
    ...TY.label,
    color: C.text2,
    fontSize: 12,
  },
  chipHighlight: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderColor: "rgba(255,255,255,0.22)",
  },
  chipTextHighlight: {
    color: "rgba(255,255,255,0.90)",
    fontWeight: "600" as const,
  },
});
