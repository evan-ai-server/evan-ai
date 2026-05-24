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

  // Fade-only entrance. The prior translateY 80→0 spring made the dock
  // appear to "rise" while the dark background underneath shifted with it —
  // the same bleeding-overlay artifact the user flagged on other sheets.
  // Opacity-only matches the AskAIDrawer + DecisionSheet pattern.
  const opacity    = useRef(new RNAnimated.Value(0)).current;
  const dotPulse   = useRef(new RNAnimated.Value(0.35)).current;
  // Local pulse loop ref so we can stop it on unmount and not leak a
  // ticking RN Animated loop into a closed scene.
  const dotPulseLoopRef = useRef<RNAnimated.CompositeAnimation | null>(null);

  useEffect(() => {
    const loop = RNAnimated.loop(RNAnimated.sequence([
      RNAnimated.timing(dotPulse, { toValue: 0.85, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      RNAnimated.timing(dotPulse, { toValue: 0.35, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    dotPulseLoopRef.current = loop;
    loop.start();
    return () => {
      try { loop.stop(); } catch {}
      dotPulseLoopRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    RNAnimated.timing(opacity, {
      toValue: 1,
      duration: SINGULARITY.duration,
      delay: 120,
      easing: panthere,
      useNativeDriver: true,
    }).start();
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
        { opacity },
        { paddingBottom: Math.max(insets.bottom, SP.md) + SP.sm },
      ]}
      renderToHardwareTextureAndroid={IS_ANDROID}
      shouldRasterizeIOS={!IS_ANDROID}
      needsOffscreenAlphaCompositing={IS_ANDROID}
    >
      <BlurView intensity={68} tint="dark" style={StyleSheet.absoluteFillObject} />
      {/* Top-fade ladder — 3 stacked low-alpha bands that ramp from nearly
          transparent to the dock's main opaque fill. The dock visually
          EMERGES from the surrounding darkness instead of slamming in as a
          rectangle, killing the "settings panel" silhouette the user
          flagged. Combined with the reduced DOCK_SAFE_HEIGHT this also
          makes the active card's bottom curve appear to dissolve into the
          dock rather than float above a black void. Three flat Views are
          cheaper than a LinearGradient and don't require expo-linear-
          gradient on Android. */}
      <View style={styles.dockFadeTop1} pointerEvents="none" />
      <View style={styles.dockFadeTop2} pointerEvents="none" />
      <View style={styles.dockFadeTop3} pointerEvents="none" />
      <View style={styles.dockOverlay} />
      {/* 1px inner highlight just below the fade ladder — sits where the
          opaque dock fill starts. Reads as a soft ambient light catching
          the "real" top edge of the controls instead of an outlined panel. */}
      <View style={styles.dockTopHighlight} pointerEvents="none" />
      {/* Bottom-edge dissolve — three stacked low-alpha bands at the very
          bottom that step the dock's opacity DOWN as it meets the safe
          area / home indicator. The atmospheric bloom rendered behind the
          dock shows through these bands at progressively higher alphas,
          so the dock no longer "ends" at a hard horizontal line — it
          melts into the emerald ambient below. */}
      <View style={styles.dockFadeBottom1} pointerEvents="none" />
      <View style={styles.dockFadeBottom2} pointerEvents="none" />
      <View style={styles.dockFadeBottom3} pointerEvents="none" />

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

      {/* Action grid — symmetric 2-column. Every chip is the same size, every
          row is the same height. Short labels per UX spec (Bought / Ask AI /
          Track / Copy / Rescan / Lowball / Profit / Details). `List it` is
          dropped from the visible grid — parent still wires onAutoList, but
          surfacing it here pushed the row count to an odd 9 and left the
          bottom row asymmetric. Re-enable by un-commenting the chip below
          when a more capacious dock layout lands. */}
      <View style={styles.secondaryRow}>
        <ActionChip
          icon="bag-check-outline"
          label="Bought"
          onPress={() => {
            // Confetti is parent-owned (it overlays the entire results screen
            // via a screen-anchored Modal); the dock just signals the intent.
            // The DecisionSheet stays as the attribution capture path below —
            // delayed by 900ms so the burst's peak ~800ms of outward
            // explosion is fully visible BEFORE the sheet's opaque backdrop
            // mounts over it. Earlier value of 320ms was inside the
            // explosion window: users only saw ~20% of the burst before it
            // was covered.
            if (onBoughtIt) onBoughtIt();
            setTimeout(() => setDecisionOpen(true), 900);
          }}
        />
        {onAskAI ? (
          <ActionChip icon="sparkles" label="Ask AI" onPress={onAskAI} highlight />
        ) : null}
        <ActionChip
          icon={isTracked ? "bookmark" : "bookmark-outline"}
          label="Track"
          onPress={onTrack}
          tracked={isTracked}
        />
        <ActionChip icon="copy-outline" label="Copy" onPress={onCopy} />
        {onScanAgain ? (
          <ActionChip icon="refresh-outline" label="Rescan" onPress={onScanAgain} />
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
  // Visual hierarchy: tracked (gold toggle) > highlight (secondary CTA, e.g.
  // Ask AI) > default (tertiary tools — Bought, Track, Copy, Rescan, etc.).
  // Tertiary icon/text both dim further than the prior pass so the eye lands
  // on the white primary CTA and the secondary highlight chip first; the
  // tertiary grid recedes into "options available" instead of competing for
  // attention. Dashboard energy → calm tool palette.
  const iconColor =
    tracked   ? "rgba(255,205,90,0.95)" :
    highlight ? "rgba(255,255,255,0.92)" :
    "rgba(255,255,255,0.42)";
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
  // Floating-controls dock. The dock now reads as "controls emerging from
  // darkness" via three composed pieces:
  //   1. SH.dock ambient shadow (carries the float)
  //   2. dockFadeTop1/2/3 gradient ladder — three stacked low-alpha bands
  //      so the top edge dissolves into the screen instead of slamming
  //      in as a rectangle
  //   3. R.xxl top-corner radius — the silhouette is rounded, not slab
  // No visible top border (the prior hairline read as outlined panel).
  // paddingTop bumped to absorb the 32px fade ladder so the intel strip
  // doesn't render inside the fade region.
  dockWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: SP.lg + SP.lg, // 32px → clears the fade ladder
    paddingHorizontal: SP.lg,
    borderTopLeftRadius: R.xxl,
    borderTopRightRadius: R.xxl,
    overflow: "hidden",
    ...SH.dock,
  },
  // Main opaque fill — starts BELOW the fade ladder so the top 32px stay
  // soft, and now also STOPS 30px above the bottom so the atmospheric
  // bloom rendered behind the dock can bleed up into the safe-area /
  // home-indicator zone. Without this gap the dock used to end at a
  // hard horizontal line right where the dock met the device edge.
  dockOverlay: {
    position: "absolute",
    top: 32,
    left: 0,
    right: 0,
    bottom: 30,
    backgroundColor: "rgba(4,4,4,0.50)",
  },
  // 3-step fade ladder. Each band is ~11px tall with stepped alpha so the
  // composition reads as a smooth gradient on iOS without LinearGradient.
  // Hardware-rasterized cost is essentially zero — three flat color Views.
  dockFadeTop1: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 11,
    backgroundColor: "rgba(4,4,4,0.12)",
  },
  dockFadeTop2: {
    position: "absolute",
    top: 11,
    left: 0,
    right: 0,
    height: 11,
    backgroundColor: "rgba(4,4,4,0.28)",
  },
  dockFadeTop3: {
    position: "absolute",
    top: 22,
    left: 0,
    right: 0,
    height: 10,
    backgroundColor: "rgba(4,4,4,0.42)",
  },
  dockTopHighlight: {
    position: "absolute",
    top: 32,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  // Bottom dissolve ladder — three soft dark bands stacked at the bottom
  // of the dock that re-rise toward the opaque fill (which now stops 30px
  // above the device edge). Each band is darker than the one below it so
  // the opacity gradient feels continuous: opaque action grid →
  // semi-transparent transition → atmospheric bloom showing through.
  // The bottom-most band stays nearly transparent so the bloom carries
  // the visual all the way to the device edge.
  dockFadeBottom1: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 10,
    backgroundColor: "rgba(4,4,4,0.0)",
  },
  dockFadeBottom2: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    height: 10,
    backgroundColor: "rgba(4,4,4,0.10)",
  },
  dockFadeBottom3: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    height: 10,
    backgroundColor: "rgba(4,4,4,0.28)",
  },

  // Intelligence strip — sits at the top of the dock's content grid.
  // marginTop adds breathing space between the soft top fade and the
  // first piece of text so the savings line doesn't feel pinned to the
  // dock's edge. paddingLeft 2 nudges the dot to optical-align with the
  // primary-row buttons' left edge (dot is a 6px circle, so a tiny
  // shoulder gives the text after it the right balanced offset).
  intelStrip: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: SP.xs,
    marginBottom: SP.md,
    gap: SP.xs,
    paddingLeft: 2,
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
    backgroundColor: "rgba(255,255,255,0.07)",
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
  // Chips: pure soft-fill pills with NO border. The prior hairline at 7%
  // still rendered as a visible rectangle outline against the dock's
  // glass — it read as a "settings panel of buttons" rather than premium
  // floating controls. Fill alone defines the chip silhouette now;
  // highlight/tracked states bump the fill alpha (and add an accent
  // tint for gold) instead of drawing a border.
  chip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 44,
    paddingHorizontal: SP.md,
    borderRadius: R.md,
    backgroundColor: "rgba(255,255,255,0.05)",
    flexBasis: "48%",
    flexGrow: 0,
  },
  chipText: {
    ...TY.label,
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontWeight: "600" as const,
  },
  chipHighlight: {
    backgroundColor: "rgba(255,255,255,0.11)",
  },
  chipTextHighlight: {
    color: "rgba(255,255,255,0.92)",
    fontWeight: "700" as const,
  },
  // Warm gold tracked state — premium toggle look, distinct from white CTA.
  // Border-free; the gold-tinted fill alone signals the tracked state.
  chipTracked: {
    backgroundColor: "rgba(255,205,90,0.14)",
  },
  chipTextTracked: {
    color: "rgba(255,225,150,0.95)",
    fontWeight: "800" as const,
  },
});
