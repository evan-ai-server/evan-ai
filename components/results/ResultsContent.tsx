/**
 * ResultsContent — the main results screen content area.
 *
 * Drop-in replacement for the loading panel + scroll view section
 * inside the results tab. The outer tab wrapper, SafeAreaView, and
 * top navigation bar remain in index.tsx unchanged.
 *
 * Handles two states internally:
 *   1. loadingResults=true  → LoadingScreen
 *   2. loadingResults=false → IdentityHeader + CardDeck + ResultsDock
 */
import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  Animated as RNAnimated,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  interpolate,
  Extrapolation,
  Easing,
} from "react-native-reanimated";
import { LoadingScreen, LoadingStage } from "../scan/LoadingScreen";
import { CardDeck } from "./CardDeck";
import { ResultsDock } from "./ResultsDock";
import { AskAIDrawer, ScanContext } from "./AskAIDrawer";
import { AutoListingDrawer } from "./AutoListingDrawer";
import { OfflineBanner } from "./OfflineBanner";
import { C, SP, R, TY, confidenceLabel, EASE_PANTHERE, SINGULARITY } from "../design/DS";
import { PressableScale } from "../primitives/PressableScale";

const IS_ANDROID = Platform.OS === "android";
const panthere = Easing.bezier(EASE_PANTHERE[0], EASE_PANTHERE[1], EASE_PANTHERE[2], EASE_PANTHERE[3]);

interface ResultsContentProps {
  // ── Data ──────────────────────────────────
  activeResult: any;
  results: any[];
  loadingResults: boolean;
  loadingPhotoUri?: string | null;
  uiError?: { title: string; msg: string } | null;
  priceChangeBanner?: string | null;

  // ── Loading state ──────────────────────────
  scanStage?: LoadingStage;
  scanStageMeta?: string;
  showRetryWhileLoading?: boolean;
  slowNetwork?: boolean;
  loadingDots?: string;
  retryReveal?: RNAnimated.Value;
  retryScale?: RNAnimated.Value;

  // ── Entrance animation from parent ──────────
  /** RNAnimated.Value 0→1 that fires when results arrive */
  resultEntry?: RNAnimated.Value;
  neuralPulse?: RNAnimated.Value;
  aiRevealActive?: boolean;

  // ── Intelligence stats (compact identity header) ────
  weaponStats?: any;
  intelLevel?: number;
  lastScan?: any;

  // ── User identity ──────────────────────────
  userId?: string | null;

  // ── Watchlist ──────────────────────────────
  watchlist?: any[];
  onToggleWatchlist?: (card: any) => void;

  // ── Callbacks ──────────────────────────────
  onCancel: () => void;
  onRetry: () => void;
  onNewScan: () => void;
  onOpenListing: (url: string, title: string) => void;
  onTrack: (result: any) => void;
  onCopy: () => void;
  onScanAgain?: () => void;
  onProfitCalc?: () => void;
  onDetails?: () => void;
  onDismissError?: () => void;
  onRetryAfterError?: () => void;
  onZoomImage?: (uri: string) => void;
  onShareCard?: (card: any) => void;
  onVaultSave?: (entry: any) => void;
  onOrbPress?: () => void;
  isNet?: boolean;
  /** Feature 1: timestamp (ms) of cached result — truthy = show offline banner */
  offlineCachedAt?: number | null;
  onRefreshFromCache?: () => void;
  /** Base URL for API calls (e.g. http://192.168.1.x:3001) */
  apiBase?: string;
}

// Dock approximate height + safe area buffer
const DOCK_SAFE_HEIGHT = 200;

export const ResultsContent = React.memo(function ResultsContent({
  activeResult,
  results,
  loadingResults,
  loadingPhotoUri,
  uiError,
  priceChangeBanner,
  scanStage = "idle",
  scanStageMeta,
  showRetryWhileLoading,
  slowNetwork,
  loadingDots = "",
  retryReveal,
  retryScale,
  resultEntry: _resultEntry,
  neuralPulse: _neuralPulse,
  aiRevealActive: _aiRevealActive,
  weaponStats,
  intelLevel,
  lastScan,
  userId,
  onCancel,
  onRetry,
  onNewScan,
  onOpenListing,
  onTrack,
  onCopy,
  onScanAgain,
  onProfitCalc,
  onDetails,
  onDismissError,
  onRetryAfterError,
  onZoomImage,
  watchlist,
  onToggleWatchlist,
  onShareCard,
  onVaultSave,
  onOrbPress,
  isNet,
  offlineCachedAt,
  onRefreshFromCache,
  apiBase,
}: ResultsContentProps) {
  // Track which card is active in the deck (for dock's "Open" button)
  const [deckIndex, setDeckIndex] = useState(0);

  // Ask AI drawer
  const [askAIOpen, setAskAIOpen] = useState(false);
  // Auto-Listing drawer
  const [autoListOpen, setAutoListOpen] = useState(false);
  const resolvedApiBase = (apiBase
    ?? (typeof process !== "undefined" && process.env?.EXPO_PUBLIC_API_URL))
    || (Platform.OS === "ios" ? "http://192.168.1.227:3001" : "http://10.0.2.2:3001");

  // ── Transition shared values ──────────────────────────────────────────────
  // Loading container: enters with spring scale+opacity, exits scale up + fade
  const loadingOpacity  = useSharedValue(loadingResults ? 0 : 0);
  const loadingScale    = useSharedValue(loadingResults ? 0.94 : 1);

  // Results container: Singularity — opacity + translateY + scale bloom
  const resultsOpacity  = useSharedValue(loadingResults ? 0 : 1);
  const resultsTranslateY = useSharedValue(loadingResults ? SINGULARITY.fromTranslateY : 0);
  const resultsScale    = useSharedValue(loadingResults ? SINGULARITY.fromScale : 1);

  // Legacy entrance animations (used for header/content stagger within results)
  const headerEntrance = useSharedValue(0);
  const contentEntrance = useSharedValue(0);
  const glowPulse = useSharedValue(0);

  // Track whether we have ever shown results (so loading container
  // only does its entrance animation once)
  const hasShownLoading = useRef(false);

  // Reset deck index when activeResult changes (new scan)
  useEffect(() => {
    setDeckIndex(0);
  }, [activeResult]);

  // Loading screen entrance: Panthere fade (heavy start → silk finish) + spring scale
  useEffect(() => {
    if (loadingResults) {
      hasShownLoading.current = true;
      loadingOpacity.value = 0;
      loadingScale.value = 0.94;
      loadingOpacity.value = withTiming(1, { duration: SINGULARITY.duration, easing: panthere });
      loadingScale.value = withSpring(1, { damping: 22, stiffness: 200 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingResults]);

  // Transition: loading → results (Singularity curve for all fades)
  useEffect(() => {
    if (!loadingResults && activeResult) {
      // 1. Animate loading container out: scale 1→1.04 + opacity 1→0 (Panthere)
      loadingOpacity.value = withTiming(0, { duration: 280, easing: panthere });
      loadingScale.value = withTiming(1.04, { duration: 280, easing: panthere });

      // 2. After 120ms delay, animate results in — Singularity bloom
      resultsOpacity.value = 0;
      resultsTranslateY.value = SINGULARITY.fromTranslateY;
      resultsScale.value = SINGULARITY.fromScale;
      resultsOpacity.value = withDelay(
        120,
        withTiming(1, { duration: SINGULARITY.duration, easing: panthere }),
      );
      resultsTranslateY.value = withDelay(
        120,
        withTiming(0, { duration: SINGULARITY.duration, easing: panthere }),
      );
      resultsScale.value = withDelay(
        120,
        withTiming(1, { duration: SINGULARITY.duration, easing: panthere }),
      );

      // 3. Legacy glow + staggered header/content
      glowPulse.value = withSequence(
        withTiming(1, { duration: 400, easing: panthere }),
        withTiming(0, { duration: 600, easing: panthere }),
      );
      headerEntrance.value = 0;
      contentEntrance.value = 0;
      headerEntrance.value = withDelay(140, withSpring(1, { mass: 0.7, damping: 18, stiffness: 220 }));
      contentEntrance.value = withDelay(
        220,
        withSpring(1, { mass: 0.8, damping: 20, stiffness: 200 }),
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingResults, activeResult]);

  // ── Animated styles ───────────────────────────────────────────────────────
  const loadingContainerStyle = useAnimatedStyle(() => ({
    opacity: loadingOpacity.value,
    transform: [{ scale: loadingScale.value }] as any,
  }));

  const resultsContainerStyle = useAnimatedStyle(() => ({
    opacity: resultsOpacity.value,
    transform: [
      { scale: resultsScale.value },
      { translateY: resultsTranslateY.value },
    ] as any,
  }));

  const headerAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(headerEntrance.value, [0, 0.5, 1], [0, 0.8, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(
          headerEntrance.value,
          [0, 1],
          [14, 0],
          Extrapolation.CLAMP,
        ),
      },
    ] as any,
  }));

  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(contentEntrance.value, [0, 0.5, 1], [0, 0.7, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(
          contentEntrance.value,
          [0, 1],
          [22, 0],
          Extrapolation.CLAMP,
        ),
      },
    ] as any,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glowPulse.value, [0, 1], [0, 0.08], Extrapolation.CLAMP),
  }));

  const handleSnap = useCallback((idx: number) => {
    setDeckIndex(idx);
  }, []);

  // Build watchlist query set for heart state
  const watchlistQueries = React.useMemo(
    () => (watchlist || []).map((w: any) => String(w.query || w.itemName || "").trim().toLowerCase()),
    [watchlist],
  );

  // Resolve the "current" card for the dock's open action
  const allCards = React.useMemo(() => {
    if (!activeResult) return [];
    const alts = (results || []).slice(1, 5);
    return [activeResult, ...alts];
  }, [activeResult, results]);

  const currentCard = allCards[deckIndex] ?? activeResult;
  const currentUrl  = currentCard?.buyLink || currentCard?.url || null;
  const currentName = currentCard?.itemName || currentCard?.title || "Listing";

  const handleOpenListing = useCallback(() => {
    if (currentUrl) onOpenListing(currentUrl, currentName);
  }, [currentUrl, currentName, onOpenListing]);

  return (
    <View style={styles.rootWrap}>
      {/* ── LOADING CONTAINER ───────────────────────────────────────────────
          Always rendered while loadingResults is true (or during fade-out).
          Positioned absolutely so it overlaps the results container during transition.
      */}
      {loadingResults ? (
        <Reanimated.View
          style={[styles.transitionLayer, loadingContainerStyle as any]}
          renderToHardwareTextureAndroid={IS_ANDROID}
          shouldRasterizeIOS={!IS_ANDROID}
          needsOffscreenAlphaCompositing={IS_ANDROID}
        >
          <LoadingScreen
            photoUri={loadingPhotoUri}
            stage={scanStage}
            stageMeta={scanStageMeta}
            onCancel={onCancel}
            onRetry={onRetry}
            showRetry={showRetryWhileLoading}
            slowNetwork={slowNetwork}
            retryReveal={retryReveal}
            retryScale={retryScale}
            loadingDots={loadingDots}
            onOrbPress={onOrbPress}
          />
        </Reanimated.View>
      ) : null}

      {/* ── RESULTS CONTAINER ───────────────────────────────────────────────
          Hidden (opacity 0, translateY offset) until loading finishes,
          then floats up into place.
      */}
      {!loadingResults ? (
        <Reanimated.View
          style={[styles.resultsWrap, resultsContainerStyle as any]}
          renderToHardwareTextureAndroid={IS_ANDROID}
          shouldRasterizeIOS={!IS_ANDROID}
          needsOffscreenAlphaCompositing={IS_ANDROID}
        >
          {/* Animated depth glow sweep at top */}
          <Reanimated.View
            style={[styles.bgGlow, glowStyle as any]}
            pointerEvents="none"
            renderToHardwareTextureAndroid={IS_ANDROID}
            shouldRasterizeIOS={!IS_ANDROID}
          />

          {/* ── Error card (replaces results if present) */}
          {uiError ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>{uiError.title}</Text>
              <Text style={styles.errorMsg}>{uiError.msg}</Text>
              <View style={styles.errorActions}>
                <PressableScale onPress={onDismissError} style={styles.errorBtnGhost} scale={0.97} haptic>
                  <Ionicons name="close" size={15} color={C.text2} />
                  <Text style={styles.errorBtnText}>Dismiss</Text>
                </PressableScale>
                <PressableScale onPress={onRetryAfterError} style={styles.errorBtn} scale={0.97} haptic>
                  <Ionicons name="refresh" size={15} color={C.text} />
                  <Text style={styles.errorBtnText}>Retry</Text>
                </PressableScale>
              </View>
            </View>
          ) : null}

          {/* ── Price change banner */}
          {priceChangeBanner && !uiError ? (
            <View style={styles.priceBanner}>
              <Ionicons name="trending-down-outline" size={14} color={C.text2} style={{ marginRight: SP.xs }} />
              <Text style={styles.priceBannerText}>{priceChangeBanner}</Text>
            </View>
          ) : null}

          {/* ── Empty state */}
          {!activeResult && !uiError ? (
            <EmptyState onNewScan={onNewScan} />
          ) : null}

          {/* ── Main: compact identity header + card deck */}
          {activeResult && !uiError ? (
            <>
              {/* Feature 1: Offline / cached-prices banner */}
              {offlineCachedAt ? (
                <OfflineBanner
                  cachedAt={offlineCachedAt}
                  onRefresh={onRefreshFromCache}
                />
              ) : null}

              {/* Identity header: item name + intelligence signal */}
              <Reanimated.View
                style={headerAnimStyle as any}
                renderToHardwareTextureAndroid={IS_ANDROID}
                shouldRasterizeIOS={!IS_ANDROID}
              >
                <IdentityHeader
                  activeResult={activeResult}
                  lastScan={lastScan}
                  weaponStats={weaponStats}
                  intelLevel={intelLevel}
                />
              </Reanimated.View>

              {/* Horizontal card deck (has its own entrance animation) */}
              <Reanimated.View
                style={contentAnimStyle as any}
                renderToHardwareTextureAndroid={IS_ANDROID}
                shouldRasterizeIOS={!IS_ANDROID}
              >
                <CardDeck
                  activeResult={activeResult}
                  results={results}
                  watchlistQueries={watchlistQueries}
                  onPressCard={onOpenListing}
                  onZoomImage={onZoomImage}
                  onSnapToIndex={handleSnap}
                  onToggleWatchlist={onToggleWatchlist}
                  onShare={onShareCard}
                  onVaultSave={onVaultSave}
                  isNet={isNet}
                />
              </Reanimated.View>
            </>
          ) : null}

          {/* Oracle's Tip — typewriter AI micro-copy */}
          {activeResult && !uiError ? (
            <TypeWriter text={oracleTip(activeResult)} />
          ) : null}

          {/* ── Dock spacer (so scroll content isn't hidden under dock) */}
          {activeResult && !uiError ? <View style={{ height: DOCK_SAFE_HEIGHT }} /> : null}

          {/* ── Glass action dock (absolute) */}
          {activeResult && !uiError ? (
            <ResultsDock
              activeResult={activeResult}
              currentCard={currentCard}
              userId={userId ?? null}
              apiBase={resolvedApiBase}
              onOpenListing={handleOpenListing}
              onNewScan={onNewScan}
              onTrack={() => onTrack(activeResult)}
              onCopy={onCopy}
              onScanAgain={onScanAgain}
              onProfitCalc={onProfitCalc}
              onDetails={onDetails}
              onAskAI={() => setAskAIOpen(true)}
              onAutoList={() => setAutoListOpen(true)}
            />
          ) : null}

          {/* Ask AI slide-up drawer */}
          {activeResult ? (
            <AskAIDrawer
              visible={askAIOpen}
              apiBase={resolvedApiBase}
              onClose={() => setAskAIOpen(false)}
              scanContext={{
                itemName:          activeResult.itemName          ?? null,
                store:             currentCard?.store             ?? currentCard?.source ?? null,
                price:             currentCard?.price             ?? null,
                scannedPrice:      activeResult.scannedPrice      ?? null,
                savedAmount:       activeResult.savedAmount       ?? null,
                cheaperPct:        activeResult.cheaperPct        ?? null,
                buyVerdict:        activeResult.buyVerdict        ?? null,
                buyScore:          activeResult.buyScore          ?? null,
                visionConfidence:  activeResult.visionConfidence  ?? null,
                visionQuery:       activeResult.visionQuery       ?? null,
                category:          activeResult.category          ?? null,
                historicalLow:     activeResult.historicalLow     ?? null,
                historicalHigh:    activeResult.historicalHigh    ?? null,
                avgMarket:         activeResult.avgMarket         ?? null,
                totalMatches:      activeResult.totalMatches      ?? null,
                ebaySoldComps:     activeResult.ebaySoldComps     ?? null,
                localComps:        activeResult.localComps        ?? null,
                trendIntel:        activeResult.trendIntel        ?? null,
                seasonalFlip:      activeResult.seasonalFlip      ?? null,
                authenticityIntel: activeResult.authenticityIntel ?? null,
              } satisfies ScanContext}
            />
          ) : null}

          {/* Auto-Listing slide-up drawer */}
          {activeResult ? (
            <AutoListingDrawer
              visible={autoListOpen}
              apiBase={resolvedApiBase}
              onClose={() => setAutoListOpen(false)}
              scanContext={{
                itemName:          activeResult.itemName          ?? null,
                store:             currentCard?.store             ?? currentCard?.source ?? null,
                price:             currentCard?.price             ?? null,
                scannedPrice:      activeResult.scannedPrice      ?? null,
                savedAmount:       activeResult.savedAmount       ?? null,
                cheaperPct:        activeResult.cheaperPct        ?? null,
                buyVerdict:        activeResult.buyVerdict        ?? null,
                buyScore:          activeResult.buyScore          ?? null,
                visionConfidence:  activeResult.visionConfidence  ?? null,
                visionQuery:       activeResult.visionQuery       ?? null,
                category:          activeResult.category          ?? null,
                historicalLow:     activeResult.historicalLow     ?? null,
                historicalHigh:    activeResult.historicalHigh    ?? null,
                avgMarket:         activeResult.avgMarket         ?? null,
                totalMatches:      activeResult.totalMatches      ?? null,
                ebaySoldComps:     activeResult.ebaySoldComps     ?? null,
                localComps:        activeResult.localComps        ?? null,
                trendIntel:        activeResult.trendIntel        ?? null,
                seasonalFlip:      activeResult.seasonalFlip      ?? null,
                authenticityIntel: activeResult.authenticityIntel ?? null,
              } satisfies ScanContext}
            />
          ) : null}
        </Reanimated.View>
      ) : null}
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// IDENTITY HEADER — compact item context above the card deck
// ─────────────────────────────────────────────────────────────────────────────
function IdentityHeader({
  activeResult,
  lastScan,
  weaponStats: _weaponStats,
  intelLevel,
}: {
  activeResult: any;
  lastScan?: any;
  weaponStats?: any;
  intelLevel?: number;
}) {
  const confidence  = Number(activeResult?.visionConfidence ?? 0);
  const query       = activeResult?.visionQuery || lastScan?.query || null;
  const confLabel   = confidenceLabel(confidence);
  const totalMatches = activeResult?.totalMatches ?? 0;
  const photoUri    = activeResult?.photoUri || null;

  return (
    <View style={styles.identityHeader}>
      <View style={styles.identityRow}>
        {/* Scan thumbnail */}
        {photoUri ? (
          <View style={styles.thumbWrap}>
            <Image
              source={{ uri: photoUri }}
              style={styles.thumb}
              resizeMode="cover"
            />
          </View>
        ) : null}

        <View style={styles.identityText}>
          {/* Item name */}
          <Text numberOfLines={1} allowFontScaling={false} style={styles.identityName}>
            {activeResult.itemName || "Scan result"}
          </Text>

          {/* Intelligence badge */}
          {(intelLevel ?? 0) >= 5 ? (
            <View style={styles.intelBadge}>
              <Text style={styles.intelBadgeText} allowFontScaling={false} numberOfLines={1}>
                {(intelLevel ?? 0) >= 8 ? "FULL INTEL" : "INTEL"}
              </Text>
            </View>
          ) : null}

          {/* Meta row: confidence + query + match count */}
          <View style={styles.identityMeta}>
            {/* Confidence dot — 8px circle colored by confidence level */}
            <View style={[
              styles.confDot,
              {
                backgroundColor:
                  confidence >= 0.7 ? "rgba(120,255,180,0.85)" :
                  confidence >= 0.5 ? "rgba(255,210,80,0.85)" :
                  "rgba(255,100,80,0.80)",
              }
            ]} />

            <Text style={styles.identityMetaText} allowFontScaling={false} numberOfLines={1}>
              {confLabel}
            </Text>

            {query ? (
              <>
                <Text style={styles.metaSep} allowFontScaling={false}>·</Text>
                <Text
                  numberOfLines={1}
                  allowFontScaling={false}
                  style={[styles.identityMetaText, { flex: 1 }]}
                >
                  &quot;{query}&quot;
                </Text>
              </>
            ) : null}

            {totalMatches > 0 ? (
              <>
                <Text style={styles.metaSep} allowFontScaling={false}>·</Text>
                <Text style={styles.identityMetaText} allowFontScaling={false} numberOfLines={1}>
                  {totalMatches} listings
                </Text>
              </>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────────────────────────────────────
function EmptyState({ onNewScan }: { onNewScan: () => void }) {
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>Ready.</Text>
      <Text style={styles.emptyMsg}>
        Scan an item and enter the price you&apos;re paying — we&apos;ll find cheaper matches.
      </Text>
      <PressableScale onPress={onNewScan} style={styles.emptyCTA} scale={0.96} haptic>
        <Ionicons name="camera-outline" size={18} color="#000" />
        <Text style={styles.emptyCTAText}>New scan</Text>
      </PressableScale>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ORACLE'S TIP — AI micro-copy typewriter
// ─────────────────────────────────────────────────────────────────────────────
function oracleTip(data: any): string {
  const hour = new Date().getHours();
  if (hour >= 0 && hour < 5)
    return "Night owl mode active. The quietest hours find the loudest profits.";
  const verdict   = (data?.buyVerdict ?? "").toUpperCase();
  const tier      = data?.ebaySoldComps?.velocityTier ?? "";
  const conf      = Number(data?.visionConfidence ?? 0);
  const avgM      = Number(data?.avgMarket ?? 0);
  if (/GREAT|FLIP/i.test(verdict))
    return "High flip potential detected — list within 48h for peak ROI.";
  if (tier === "hot")
    return "Hot category right now — buyers are moving fast. Don't wait.";
  if (conf >= 0.90)
    return "Strong ID match. Low competition on this brand — try the Top Tier price.";
  if (tier === "slow" || tier === "rare")
    return "Slow mover — hold for seasonal peak or price it to move today.";
  if (avgM > 0 && avgM < 40)
    return "Micro-priced item: volume is your edge. Stack and batch-ship.";
  return "Market data locked in — list within 24h to capture current demand.";
}

function TypeWriter({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    setDisplayed("");
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(timer);
    }, 26);
    return () => clearInterval(timer);
  }, [text]);

  const cursor = displayed.length < text.length;
  return (
    <View style={oracleStyles.wrap}>
      <Ionicons name="sparkles" size={9} color="rgba(255,200,60,0.7)" />
      <Text style={oracleStyles.text}>
        {displayed}
        {cursor ? <Text style={oracleStyles.cursor}>|</Text> : null}
      </Text>
    </View>
  );
}

const oracleStyles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
    marginHorizontal: SP.xl,
    marginTop: SP.sm,
    marginBottom: 4,
    opacity: 0.88,
  },
  text: {
    flex: 1,
    fontSize: 11,
    fontWeight: "400",
    color: "rgba(255,200,60,0.80)",
    lineHeight: 16,
    letterSpacing: 0.1,
  },
  cursor: {
    opacity: 0.5,
    color: "rgba(255,200,60,0.60)",
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // ── Root wrapper (contains both loading and results layers)
  rootWrap: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // ── Transition layer (for loading screen, full-screen)
  transitionLayer: {
    flex: 1,
    width: "100%",
  },

  // ── Results
  resultsWrap: {
    flex: 1,
    position: "relative",
    backgroundColor: C.bg,
  },

  // Cinematic background depth glow
  bgGlow: {
    position: "absolute",
    top: -120,
    left: "50%",
    marginLeft: -220,
    width: 440,
    height: 320,
    borderRadius: 220,
    backgroundColor: "rgba(255,255,255,0.04)",
  },

  // Identity header
  identityHeader: {
    paddingHorizontal: SP.xl,
    paddingTop: 16,
    paddingBottom: SP.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.md,
  },
  thumbWrap: {
    width: 52,
    height: 52,
    borderRadius: R.lg,
    overflow: "hidden",
    flexShrink: 0,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.15)",
  },
  thumb: {
    width: 52,
    height: 52,
  },
  identityText: {
    flex: 1,
    minWidth: 0,
  },
  identityName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#ffffff",
    lineHeight: 25,
    marginBottom: SP.xs,
  },
  identityMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "nowrap",
    overflow: "hidden",
  },
  confDot: {
    width: 8,
    height: 8,
    borderRadius: R.pill,
    flexShrink: 0,
  },
  identityMetaText: {
    ...TY.label,
    color: C.text3,
    flexShrink: 1,
  },
  metaSep: {
    ...TY.label,
    color: C.text4,
    flexShrink: 0,
  },
  intelBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(80,255,150,0.12)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(80,255,150,0.28)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginTop: 4,
  },
  intelBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.4,
    color: "rgba(120,255,170,0.9)",
    textTransform: "uppercase",
  },

  // Error card
  errorCard: {
    marginHorizontal: SP.lg,
    marginTop: SP.md,
    padding: SP.lg,
    borderRadius: R.xl,
    backgroundColor: C.s1,
    borderWidth: 1,
    borderColor: C.border,
  },
  errorTitle: {
    ...TY.h2,
    color: C.text,
    marginBottom: SP.sm,
  },
  errorMsg: {
    ...TY.label,
    color: C.text3,
    lineHeight: 19,
    marginBottom: SP.lg,
  },
  errorActions: {
    flexDirection: "row",
    gap: SP.sm,
  },
  errorBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: R.md,
    backgroundColor: C.s2,
    borderWidth: 1,
    borderColor: C.borderMid,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SP.xs,
  },
  errorBtnGhost: {
    flex: 1,
    minHeight: 46,
    borderRadius: R.md,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SP.xs,
  },
  errorBtnText: {
    ...TY.label,
    color: C.text,
  },

  // Price change banner
  priceBanner: {
    marginHorizontal: SP.lg,
    marginTop: SP.sm,
    marginBottom: SP.xs,
    paddingVertical: SP.sm,
    paddingHorizontal: SP.md,
    borderRadius: R.md,
    backgroundColor: C.s1,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: "row",
    alignItems: "center",
  },
  priceBannerText: {
    ...TY.label,
    color: C.text2,
    flex: 1,
  },

  // Empty state
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SP.xxxl,
    paddingBottom: SP.xxxl,
  },
  emptyTitle: {
    ...TY.display,
    color: C.text,
    marginBottom: SP.sm,
    textAlign: "center",
  },
  emptyMsg: {
    ...TY.body,
    color: C.text3,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: SP.xl,
  },
  emptyCTA: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
    paddingVertical: SP.md,
    paddingHorizontal: SP.xl,
    borderRadius: R.pill,
    backgroundColor: C.text,
  },
  emptyCTAText: {
    ...TY.bodyBold,
    color: "#000",
    fontSize: 15,
  },
});
