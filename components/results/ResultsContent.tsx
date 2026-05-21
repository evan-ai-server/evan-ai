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
import { ConfettiBurst } from "./ConfettiBurst";
import { C, SP, R, TY, fmtMoney, EASE_PANTHERE, SINGULARITY } from "../design/DS";
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
  /** Lowball Generator — opens the index.tsx-owned lowball sheet. */
  onLowball?: () => void;
  /** Bought It — parent-side handler (record purchase, etc). */
  onBoughtIt?: () => void;
}

// Dock approximate height + safe area buffer.
// Bumped from 200 → 290 after restoring the 8-chip action grid (Bought it,
// Ask AI, List it, Track, Copy, Rescan, Lowball, Profit, Details). The grid
// wraps to ~3 rows on phones; the prior 200 left the bottom chip row
// overlapping the last line of the active card on long titles.
const DOCK_SAFE_HEIGHT = 290;

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
  onLowball,
  onBoughtIt,
}: ResultsContentProps) {
  // Track which card is active in the deck (for dock's "Open" button)
  const [deckIndex, setDeckIndex] = useState(0);

  // Ask AI drawer
  const [askAIOpen, setAskAIOpen] = useState(false);
  // Auto-Listing drawer
  const [autoListOpen, setAutoListOpen] = useState(false);
  // Confetti burst trigger (epoch ms; 0 = idle, set to Date.now() to fire once).
  const [confettiKey, setConfettiKey] = useState(0);

  // ── Single-focus rule ──────────────────────────────────────────────────────
  // Only one drawer/sheet may be open at a time. Opening a new one closes the
  // others. This prevents the "stacked panels" complaint (Ask AI on top of
  // Details on top of action drawer on top of the keyboard, per screenshots).
  // Closing is still explicit — via the drawer's own X / back-tap / scrim.
  const openAskAI = useCallback(() => {
    setAutoListOpen(false);
    setAskAIOpen(true);
  }, []);
  const openAutoList = useCallback(() => {
    setAskAIOpen(false);
    setAutoListOpen(true);
  }, []);
  const openLowballExclusive = useCallback(() => {
    setAskAIOpen(false);
    setAutoListOpen(false);
    if (onLowball) onLowball();
  }, [onLowball]);
  const handleBoughtIt = useCallback(() => {
    setAskAIOpen(false);
    setAutoListOpen(false);
    setConfettiKey(Date.now());
    if (onBoughtIt) onBoughtIt();
  }, [onBoughtIt]);
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

  // Sub-element entrance — runs after the results container settles.
  // Verdict hero owns its own internal choreography; this only stages
  // the surrounding chrome (identity breadcrumb, deck) into the scene.
  const chromeEntrance = useSharedValue(0);
  const deckEntrance   = useSharedValue(0);

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

      // 3. Stage the surrounding chrome — identity breadcrumb fades up first,
      //    deck waits for the verdict to land. No pulse, no flourish.
      chromeEntrance.value = 0;
      deckEntrance.value   = 0;
      chromeEntrance.value = withDelay(160, withSpring(1, { mass: 1.0, damping: 24, stiffness: 200 }));
      deckEntrance.value   = withDelay(620, withSpring(1, { mass: 1.0, damping: 24, stiffness: 180 }));
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

  const chromeAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(chromeEntrance.value, [0, 1], [0, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(
          chromeEntrance.value,
          [0, 1],
          [6, 0],
          Extrapolation.CLAMP,
        ),
      },
    ] as any,
  }));

  const deckAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(deckEntrance.value, [0, 1], [0, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(
          deckEntrance.value,
          [0, 1],
          [12, 0],
          Extrapolation.CLAMP,
        ),
      },
    ] as any,
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

              {/* Identity breadcrumb — quiet context above the verdict */}
              <Reanimated.View
                style={chromeAnimStyle as any}
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

              {/* The decision moment — verdict hero with self-sequenced reveal */}
              <VerdictHero activeResult={activeResult} results={results} />

              {/* Card deck — proof, slid in after the verdict lands */}
              <Reanimated.View
                style={deckAnimStyle as any}
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
              onAskAI={openAskAI}
              onAutoList={openAutoList}
              onLowball={onLowball ? openLowballExclusive : undefined}
              onBoughtIt={handleBoughtIt}
            />
          ) : null}

          {/* Premium confetti burst — fires on Bought It tap.
              Sits above the dock (zIndex via render order) but pointerEvents
              none so it never blocks subsequent taps mid-animation. */}
          <ConfettiBurst fireKey={confettiKey} />


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
// VERDICT HERO — the decision moment.
//
// Visual hierarchy (Apple-level): the WORD lands first, the dollar follows,
// the context is whispered. Generous breathing room. Restrained color.
// Sequenced reveal so the result feels intelligent, not loaded.
//
// Confidence silence: when the signal is weak (few comps / low vision conf),
// the verdict softens to neutral with "Need more comps" — trust through honesty.
// ─────────────────────────────────────────────────────────────────────────────

type VerdictTone = {
  word: "BUY" | "PASS" | "HOLD";
  /** Tinted color for the verdict word — restrained, not neon */
  wordColor: string;
  /** Sign tint for the dollar number */
  signColor: string;
  /** Direction: "+" / "−" / "" */
  sign: string;
  /** Glow color under the verdict — barely visible */
  glow: string;
  /** Whether to render the dominant verdict layout vs. confidence-silence layout */
  silent: boolean;
};

function resolveVerdictTone(activeResult: any, results: any[] | undefined): VerdictTone {
  const rawVerdict = String(activeResult?.buyVerdict || "").toUpperCase();
  const saved = Number(activeResult?.savedAmount);
  const cheaperPct = Number(activeResult?.cheaperPct);
  const scanned = Number(activeResult?.scannedPrice);
  const avg = Number(activeResult?.avgMarket);
  const conf = Number(activeResult?.visionConfidence ?? 0);
  const totalMatches = Number(activeResult?.totalMatches ?? 0);
  const compCount = (results || []).filter(r => Number.isFinite(Number(r?.price))).length;

  // Confidence silence — earn trust by admitting uncertainty.
  // Trigger on thin signal OR when the upstream verdict already says HOLD.
  const tooFewComps = compCount < 2 && totalMatches < 3;
  const lowVision = conf > 0 && conf < 0.45;
  const upstreamHold = rawVerdict === "HOLD";
  const silent = upstreamHold || tooFewComps || lowVision;

  if (silent) {
    return {
      word: "HOLD",
      wordColor: "rgba(255,255,255,0.55)",
      signColor: C.text3,
      sign: "",
      glow: "rgba(255,255,255,0.04)",
      silent: true,
    };
  }

  // Prefer the upstream verdict when it lands cleanly. Fall back to the
  // price-vs-market heuristic only when the string is missing/legacy.
  const isBuy = rawVerdict === "BUY"
    || (rawVerdict === "" && (
         (Number.isFinite(saved) && saved > 0) ||
         (Number.isFinite(cheaperPct) && cheaperPct > 5) ||
         (Number.isFinite(avg) && Number.isFinite(scanned) && avg > scanned)
       ));

  if (isBuy) {
    return {
      word: "BUY",
      wordColor: "rgba(180,255,200,0.96)",
      signColor: "rgba(140,255,180,0.92)",
      sign: "+",
      glow: "rgba(80,255,160,0.10)",
      silent: false,
    };
  }

  return {
    word: "PASS",
    wordColor: "rgba(255,170,150,0.94)",
    signColor: "rgba(255,140,120,0.90)",
    sign: "−",
    glow: "rgba(255,120,100,0.08)",
    silent: false,
  };
}

function VerdictHero({
  activeResult,
  results,
}: {
  activeResult: any;
  results?: any[];
}) {
  const tone = resolveVerdictTone(activeResult, results);
  const saved = Number(activeResult?.savedAmount);
  const cheaperPct = Number(activeResult?.cheaperPct);
  const scanned = Number(activeResult?.scannedPrice);
  const avg = Number(activeResult?.avgMarket);

  // Headline number: dollar delta vs market (the truth in one number)
  let headlineAmount: number | null = null;
  let contextLine = "";
  if (Number.isFinite(saved) && saved > 0) {
    headlineAmount = saved;
    contextLine = Number.isFinite(cheaperPct) && cheaperPct > 0
      ? `${Math.round(cheaperPct)}% UNDER MARKET`
      : "UNDER MARKET";
  } else if (Number.isFinite(avg) && Number.isFinite(scanned)) {
    if (avg > scanned) {
      headlineAmount = avg - scanned;
      const pct = Math.round(((avg - scanned) / avg) * 100);
      contextLine = pct > 0 ? `${pct}% UNDER MARKET` : "UNDER MARKET";
    } else if (scanned > avg) {
      headlineAmount = scanned - avg;
      const pct = Math.round(((scanned - avg) / avg) * 100);
      contextLine = pct > 0 ? `${pct}% ABOVE MARKET` : "ABOVE MARKET";
    } else {
      headlineAmount = 0;
      contextLine = "MATCHES MARKET";
    }
  }

  // Sold range across comps for the strip
  const compPrices = (results || [])
    .map(r => Number(r?.price))
    .filter(n => Number.isFinite(n) && n > 0);
  const median = compPrices.length
    ? compPrices.slice().sort((a, b) => a - b)[Math.floor(compPrices.length / 2)]
    : null;
  const marketValue = median ?? (Number.isFinite(avg) ? avg : null);

  // ── Sequenced reveal ──────────────────────────────────────────────────────
  // Phase 1 (0–360ms):    verdict word fades+scales in (gentle spring)
  // Phase 2 (200–520ms):  dollar amount lifts in
  // Phase 3 (380–680ms):  context line whispers in
  // Phase 4 (520–840ms):  strip slides up
  // Glow:   80–560ms      barely-there spotlight under the word
  const wordOpacity   = useSharedValue(0);
  const wordScale     = useSharedValue(0.94);
  const dollarOpacity = useSharedValue(0);
  const dollarLift    = useSharedValue(8);
  const subOpacity    = useSharedValue(0);
  const stripOpacity  = useSharedValue(0);
  const stripLift     = useSharedValue(6);
  const glowOpacity   = useSharedValue(0);

  useEffect(() => {
    // Reset for each new scan — every decision gets its own moment
    wordOpacity.value   = 0;
    wordScale.value     = 0.94;
    dollarOpacity.value = 0;
    dollarLift.value    = 8;
    subOpacity.value    = 0;
    stripOpacity.value  = 0;
    stripLift.value     = 6;
    glowOpacity.value   = 0;

    wordOpacity.value = withTiming(1, { duration: 360, easing: panthere });
    wordScale.value   = withSpring(1, { damping: 18, stiffness: 200, mass: 1.0 });
    glowOpacity.value = withDelay(80, withTiming(1, { duration: 480, easing: panthere }));

    dollarOpacity.value = withDelay(200, withTiming(1, { duration: 320, easing: panthere }));
    dollarLift.value    = withDelay(200, withSpring(0, { damping: 22, stiffness: 200, mass: 1.0 }));

    subOpacity.value = withDelay(380, withTiming(1, { duration: 300, easing: panthere }));

    stripOpacity.value = withDelay(520, withTiming(1, { duration: 320, easing: panthere }));
    stripLift.value    = withDelay(520, withSpring(0, { damping: 24, stiffness: 200, mass: 1.0 }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeResult]);

  const wordStyle = useAnimatedStyle(() => ({
    opacity: wordOpacity.value,
    transform: [{ scale: wordScale.value }] as any,
  }));
  const glowStyleHero = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));
  const dollarStyle = useAnimatedStyle(() => ({
    opacity: dollarOpacity.value,
    transform: [{ translateY: dollarLift.value }] as any,
  }));
  const subStyle = useAnimatedStyle(() => ({
    opacity: subOpacity.value,
  }));
  const stripStyle = useAnimatedStyle(() => ({
    opacity: stripOpacity.value,
    transform: [{ translateY: stripLift.value }] as any,
  }));

  return (
    <View style={heroStyles.outer}>
      <View style={heroStyles.card}>
        {/* Soft spotlight glow under the verdict — depth, not noise */}
        <Reanimated.View
          pointerEvents="none"
          style={[
            heroStyles.glow,
            { backgroundColor: tone.glow },
            glowStyleHero as any,
          ]}
          renderToHardwareTextureAndroid={IS_ANDROID}
          shouldRasterizeIOS={!IS_ANDROID}
        />

        {/* The decision word — the eye lands here */}
        <Reanimated.View
          style={wordStyle as any}
          renderToHardwareTextureAndroid={IS_ANDROID}
          shouldRasterizeIOS={!IS_ANDROID}
        >
          <Text
            allowFontScaling={false}
            style={[heroStyles.verdict, { color: tone.wordColor }]}
          >
            {tone.word}
          </Text>
        </Reanimated.View>

        {/* Confidence-silence layout — admit uncertainty cleanly */}
        {tone.silent ? (
          <Reanimated.View style={subStyle as any}>
            <Text style={heroStyles.silentSub} allowFontScaling={false}>
              Need more comps to lock the call
            </Text>
            {Number.isFinite(scanned) ? (
              <Text style={heroStyles.silentPrice} allowFontScaling={false}>
                {fmtMoney(scanned)}
              </Text>
            ) : null}
          </Reanimated.View>
        ) : (
          <>
            {/* Dollar amount — the truth in one number */}
            {headlineAmount != null && headlineAmount > 0 ? (
              <Reanimated.View
                style={dollarStyle as any}
                renderToHardwareTextureAndroid={IS_ANDROID}
                shouldRasterizeIOS={!IS_ANDROID}
              >
                <Text style={heroStyles.dollar} allowFontScaling={false}>
                  <Text style={[heroStyles.dollarSign, { color: tone.signColor }]}>
                    {tone.sign}
                  </Text>
                  {fmtMoney(Math.abs(headlineAmount))}
                </Text>
              </Reanimated.View>
            ) : Number.isFinite(scanned) ? (
              <Reanimated.View
                style={dollarStyle as any}
                renderToHardwareTextureAndroid={IS_ANDROID}
                shouldRasterizeIOS={!IS_ANDROID}
              >
                <Text style={heroStyles.dollar} allowFontScaling={false}>
                  {fmtMoney(scanned)}
                </Text>
              </Reanimated.View>
            ) : null}

            {/* Context — whispered, not declared */}
            {contextLine ? (
              <Reanimated.View style={subStyle as any}>
                <Text style={heroStyles.context} allowFontScaling={false}>
                  {contextLine}
                </Text>
              </Reanimated.View>
            ) : null}
          </>
        )}

        {/* Price strip — proof, quiet */}
        {(Number.isFinite(scanned) || marketValue != null) ? (
          <Reanimated.View
            style={[heroStyles.strip, stripStyle as any]}
            renderToHardwareTextureAndroid={IS_ANDROID}
            shouldRasterizeIOS={!IS_ANDROID}
          >
            {Number.isFinite(scanned) ? (
              <View style={heroStyles.stripCell}>
                <Text style={heroStyles.stripLabel} allowFontScaling={false}>COST</Text>
                <Text style={heroStyles.stripValue} allowFontScaling={false}>
                  {fmtMoney(scanned)}
                </Text>
              </View>
            ) : null}
            {marketValue != null ? (
              <View style={heroStyles.stripCell}>
                <Text style={heroStyles.stripLabel} allowFontScaling={false}>MARKET</Text>
                <Text style={heroStyles.stripValue} allowFontScaling={false}>
                  {fmtMoney(marketValue)}
                </Text>
              </View>
            ) : null}
          </Reanimated.View>
        ) : null}
      </View>
    </View>
  );
}

const heroStyles = StyleSheet.create({
  outer: {
    paddingHorizontal: SP.lg,
    paddingTop: SP.lg,
    paddingBottom: SP.md,
  },
  card: {
    paddingHorizontal: SP.xl,
    paddingTop: SP.xxxl,
    paddingBottom: SP.xxl,
    borderRadius: R.xl,
    backgroundColor: "rgba(255,255,255,0.025)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    overflow: "hidden",
  },
  glow: {
    position: "absolute",
    top: SP.xl,
    left: "50%",
    marginLeft: -160,
    width: 320,
    height: 120,
    borderRadius: 160,
  },
  verdict: {
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: 5.5,
    lineHeight: 44,
    textAlign: "center",
  },
  dollar: {
    marginTop: SP.lg,
    fontSize: 42,
    fontWeight: "900",
    color: C.text,
    letterSpacing: -1.0,
    lineHeight: 46,
    textAlign: "center",
  },
  dollarSign: {
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: -1.0,
  },
  context: {
    marginTop: SP.sm,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2.0,
    color: C.text3,
    textAlign: "center",
  },
  // Confidence-silence variants — quieter, smaller, honest
  silentSub: {
    marginTop: SP.lg,
    fontSize: 13,
    fontWeight: "600",
    color: C.text3,
    textAlign: "center",
    letterSpacing: 0.2,
  },
  silentPrice: {
    marginTop: SP.sm,
    fontSize: 22,
    fontWeight: "800",
    color: C.text2,
    textAlign: "center",
    letterSpacing: -0.4,
  },
  strip: {
    flexDirection: "row",
    gap: SP.xxxl,
    marginTop: SP.xxl,
    paddingTop: SP.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.06)",
    alignSelf: "stretch",
    justifyContent: "center",
  },
  stripCell: {
    alignItems: "center",
  },
  stripLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.6,
    color: C.text4,
    marginBottom: 4,
  },
  stripValue: {
    fontSize: 15,
    fontWeight: "800",
    color: C.text2,
    letterSpacing: -0.2,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// IDENTITY HEADER — quiet breadcrumb. Tells you what we identified without
// competing with the verdict for attention. No INTEL badges, no scoring labels.
// ─────────────────────────────────────────────────────────────────────────────
function IdentityHeader({
  activeResult,
  lastScan,
}: {
  activeResult: any;
  lastScan?: any;
  weaponStats?: any;
  intelLevel?: number;
}) {
  const query    = activeResult?.visionQuery || lastScan?.query || null;
  const photoUri = activeResult?.photoUri || null;
  const name     = activeResult?.itemName || query || "Scan result";

  return (
    <View style={styles.identityHeader}>
      <View style={styles.identityRow}>
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
          <Text numberOfLines={1} allowFontScaling={false} style={styles.identityName}>
            {name}
          </Text>
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

  // Identity header — quiet breadcrumb above the verdict
  identityHeader: {
    paddingHorizontal: SP.xl,
    paddingTop: SP.md,
    paddingBottom: SP.xs,
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
  },
  thumbWrap: {
    width: 32,
    height: 32,
    borderRadius: R.sm,
    overflow: "hidden",
    flexShrink: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)",
  },
  thumb: {
    width: 32,
    height: 32,
  },
  identityText: {
    flex: 1,
    minWidth: 0,
  },
  identityName: {
    fontSize: 13,
    fontWeight: "700",
    color: C.text3,
    lineHeight: 18,
    letterSpacing: 0.1,
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
