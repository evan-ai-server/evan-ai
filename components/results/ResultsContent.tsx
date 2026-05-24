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

// Dock approximate height + safe area buffer + deck breathing room. The
// dock renders an intel strip (~30px) + a primary row (48 + 8 gap = 56px)
// + a 4-row 2-column action grid (4*44 + 3*8 = 200px) + ~26px of internal
// padding + ~34px of iPhone home-indicator safe area = ~346px.
//
// Second refinement pass tightened this back from 380 → 332 to KILL the
// dead-black "abyss" between the deck and the dock that the previous
// extra-safe spacing introduced. The dock now also renders a tall top
// gradient-fade band (32px of softly increasing opacity, see
// dockFadeTop1/2/3 in ResultsDock) so the lifted active card's bottom
// curve still lands inside the soft fade — the card looks like it's
// floating ABOVE a misty control surface instead of sitting above an
// empty void. The fade absorbs the clearance the spacer used to provide.
const DOCK_SAFE_HEIGHT = 332;

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
  // Confetti burst trigger is OWNED BY THE PARENT (index.tsx tab root).
  // ConfettiBurst was previously rendered here inside the ScrollView, which
  // forced it into a transparent Modal to escape scroll offset; the Modal
  // captured touches on iOS and froze the dock for the burst's ~3.8s life.
  // It now lives one level above the ScrollView so it can be a plain
  // absolute layer with pointerEvents="none" and no Modal at all.

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
    console.log("CONFETTI_FIRE", { item: activeResult?.itemName || null });
    // Parent owns the burst mount; we just signal intent. If the parent
    // didn't wire a confetti hook, fall back to legacy onBoughtIt only.
    if (onBoughtIt) onBoughtIt();
  }, [onBoughtIt, activeResult]);
  const resolvedApiBase = (apiBase
    ?? (typeof process !== "undefined" && process.env?.EXPO_PUBLIC_API_URL))
    || (Platform.OS === "ios" ? "http://192.168.1.227:3001" : "http://10.0.2.2:3001");

  // ── Transition shared values ──────────────────────────────────────────────
  // Opacity-only fade for both containers. Previously the loading→results
  // transition used scale (0.94→1, then 1→1.04) plus a 16px translateY
  // bloom. On the user's iPhones this rasterized the entire results tree at
  // sub-pixel scales and produced the "loading-screen-pixelates-before-
  // results-mount" jank. Plain opacity is GPU-cheap and never rasterizes.
  const loadingOpacity  = useSharedValue(loadingResults ? 0 : 0);
  const resultsOpacity  = useSharedValue(loadingResults ? 0 : 1);

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

  // Loading screen entrance: opacity-only Panthere fade.
  useEffect(() => {
    if (loadingResults) {
      hasShownLoading.current = true;
      loadingOpacity.value = 0;
      loadingOpacity.value = withTiming(1, { duration: SINGULARITY.duration, easing: panthere });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingResults]);

  // Transition: loading → results — pure cross-fade.
  useEffect(() => {
    if (!loadingResults && activeResult) {
      // 1. Loading container fades out.
      loadingOpacity.value = withTiming(0, { duration: 280, easing: panthere });

      // 2. Results container fades in after a short overlap window.
      resultsOpacity.value = 0;
      resultsOpacity.value = withDelay(
        120,
        withTiming(1, { duration: SINGULARITY.duration, easing: panthere }),
      );

      // 3. Stage the surrounding chrome — identity breadcrumb fades in first,
      //    deck waits for the verdict to land. Opacity-only, no springs on
      //    transform so the parent screen never visually shifts behind the
      //    fade.
      chromeEntrance.value = 0;
      deckEntrance.value   = 0;
      chromeEntrance.value = withDelay(160, withTiming(1, { duration: 320, easing: panthere }));
      deckEntrance.value   = withDelay(620, withTiming(1, { duration: 340, easing: panthere }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingResults, activeResult]);

  // ── Animated styles ───────────────────────────────────────────────────────
  const loadingContainerStyle = useAnimatedStyle(() => ({
    opacity: loadingOpacity.value,
  }));

  const resultsContainerStyle = useAnimatedStyle(() => ({
    opacity: resultsOpacity.value,
  }));

  // Opacity-only chrome + deck entrances. The prior translateY 6→0 / 12→0
  // bloom moved large parent containers a few pixels during entry — enough
  // to expose the dark spatial background "sliding up" behind them, which
  // read as flicker. Pure opacity reveals stay anchored.
  const chromeAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(chromeEntrance.value, [0, 1], [0, 1], Extrapolation.CLAMP),
  }));

  const deckAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(deckEntrance.value, [0, 1], [0, 1], Extrapolation.CLAMP),
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

              {/* Card deck — proof, slid in after the verdict lands.
                  Wrapped in CardDeckBoundary so a render-phase throw inside
                  any individual card (image NSException retry storms, a
                  malformed comp blowing up PremiumIntelPanel, etc.) collapses
                  to an empty space instead of unmounting the entire results
                  tree. The verdict + dock survive even if the deck explodes. */}
              <Reanimated.View
                style={deckAnimStyle as any}
                renderToHardwareTextureAndroid={IS_ANDROID}
                shouldRasterizeIOS={!IS_ANDROID}
              >
                <CardDeckBoundary>
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
                </CardDeckBoundary>
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
              isTracked={(() => {
                // Match a watchlist entry on whichever identifier is
                // available. Avoids the "Track always says Add" bug — the
                // watchlist sometimes stores `query` (from scan), sometimes
                // `title` (from manual add); the active result has
                // visionQuery, itemName, and title. Check all of them.
                const q  = String(activeResult?.visionQuery || activeResult?.itemName || activeResult?.title || "").trim().toLowerCase();
                if (!q) return false;
                return (watchlist || []).some((w: any) => {
                  const wq = String(w?.query || w?.title || w?.itemName || "").trim().toLowerCase();
                  return wq === q;
                });
              })()}
            />
          ) : null}

          {/* Confetti is mounted ONE LEVEL UP (index.tsx tab root) as a
              sibling of the ScrollView with pointerEvents="none" at every
              wrapper, so it never blocks dock/card interaction. See
              CONFETTI_POINTER_SAFE log for verification. */}


          {/* Ask AI centered drawer — scoped per-scan */}
          {activeResult ? (
            <AskAIDrawer
              visible={askAIOpen}
              apiBase={resolvedApiBase}
              onClose={() => setAskAIOpen(false)}
              scanId={activeResult?.scanId ?? activeResult?.id ?? null}
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
  /** When silent=true, the AI-derived reason shown under the HOLD word.
   *  Set only on the silent branch — undefined elsewhere. */
  silentReason?: string;
};

// ── Silent (HOLD) reason synthesis ──────────────────────────────────────────
// Used to replace the generic "Need more comps to lock the call" with a real
// AI-feeling explanation that names the actual missing signal. We branch on
// the dominant gap (vision uncertain vs sparse comps vs upstream-flagged
// HOLD) and, on the upstream branch, name the specific pricing context
// ("above market", "tracks market", "below market") so the user knows why
// the model wasn't willing to commit.
function deriveSilentReason(args: {
  lowVision: boolean;
  tooFewComps: boolean;
  upstreamHold: boolean;
  conf: number;
  compCount: number;
  scanned: number | null;
  avg: number | null;
  ebayComps: { count?: number } | null;
  cheaperPct: number | null;
}): string {
  const { lowVision, tooFewComps, upstreamHold, compCount, scanned, avg, ebayComps, cheaperPct } = args;
  const ebayCount = Number(ebayComps?.count ?? 0);

  // Vision uncertainty trumps everything — if we can't tell what the item
  // is, no amount of comps fix the call.
  if (lowVision) {
    return "Visual match is uncertain — rescan with a tighter, sharper frame for a confident call.";
  }
  // Sparse comp set. Differentiate "zero recent sales" vs "only a couple"
  // so the user knows whether to wait or to trust the price strip.
  if (tooFewComps) {
    if (ebayCount === 0 && compCount === 0) {
      return "No recent sold comps surfaced yet. Treat this price as informational, not benchmarked.";
    }
    return "Comp data is thin — too few recent sales to call a firm direction with confidence.";
  }
  // Upstream HOLD with enough comps to talk about — explain the pricing
  // context rather than just shrugging.
  if (upstreamHold) {
    if (scanned != null && avg != null) {
      const diffPct = ((scanned - avg) / avg) * 100;
      if (Math.abs(diffPct) < 7) {
        return "Price tracks the market average. There's no clear edge in either direction right now.";
      }
      if (diffPct > 0) {
        return "Above market, but resale signal isn't strong enough to firmly recommend passing.";
      }
      // diffPct < 0 — below market but HOLD
      if (cheaperPct != null && cheaperPct >= 15) {
        return "Strong discount on paper, but the resale data isn't deep enough to lock in the call.";
      }
      return "Below market, but comp variance is wide — the discount may not be as real as it looks.";
    }
    return "Market pricing is inconsistent across comps. Wait for cleaner signal before committing.";
  }
  return "Signal is thin — gather one more comp before committing.";
}

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
      silentReason: deriveSilentReason({
        lowVision, tooFewComps, upstreamHold, conf, compCount,
        scanned: Number.isFinite(scanned) ? scanned : null,
        avg:     Number.isFinite(avg)     ? avg     : null,
        ebayComps: activeResult?.ebaySoldComps ?? null,
        cheaperPct: Number.isFinite(cheaperPct) ? cheaperPct : null,
      }),
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
  // Sequenced reveal — opacity-only across the board. The previous version
  // scaled the verdict word (0.94→1.0) and lifted the dollar/strip with a
  // small translateY. Even small text-scale animations rasterized the
  // BUY/PASS glyph between renders and the user saw pixelation on the
  // word at the moment of reveal. Keeping the timing/staggers identical
  // preserves the choreography; only the transform pieces are gone.
  const wordOpacity   = useSharedValue(0);
  const dollarOpacity = useSharedValue(0);
  const subOpacity    = useSharedValue(0);
  const stripOpacity  = useSharedValue(0);
  const glowOpacity   = useSharedValue(0);

  useEffect(() => {
    wordOpacity.value   = 0;
    dollarOpacity.value = 0;
    subOpacity.value    = 0;
    stripOpacity.value  = 0;
    glowOpacity.value   = 0;

    wordOpacity.value   = withTiming(1, { duration: 360, easing: panthere });
    glowOpacity.value   = withDelay(80,  withTiming(1, { duration: 480, easing: panthere }));
    dollarOpacity.value = withDelay(200, withTiming(1, { duration: 320, easing: panthere }));
    subOpacity.value    = withDelay(380, withTiming(1, { duration: 300, easing: panthere }));
    stripOpacity.value  = withDelay(520, withTiming(1, { duration: 320, easing: panthere }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeResult]);

  const wordStyle = useAnimatedStyle(() => ({ opacity: wordOpacity.value }));
  const glowStyleHero = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));
  const dollarStyle = useAnimatedStyle(() => ({ opacity: dollarOpacity.value }));
  const subStyle = useAnimatedStyle(() => ({ opacity: subOpacity.value }));
  const stripStyle = useAnimatedStyle(() => ({ opacity: stripOpacity.value }));

  return (
    <View style={heroStyles.outer}>
      <View
        style={[
          heroStyles.card,
          tone.silent && heroStyles.cardSilent,
          // HOLD: inset the card horizontally so it reads as a quiet
          // annotation, not a full-width banner.
          tone.silent && { marginHorizontal: SP.md },
        ]}
      >
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

        {/* The decision word. Silent HOLD uses a smaller, calmer treatment
            (verdictSilent override) so the screen reads as a Bloomberg-calm
            "model declines to call it" rather than a giant AI-warning
            billboard. BUY / PASS keep their full 38pt presence. */}
        <Reanimated.View
          style={wordStyle as any}
          renderToHardwareTextureAndroid={IS_ANDROID}
          shouldRasterizeIOS={!IS_ANDROID}
        >
          <Text
            allowFontScaling={false}
            style={[
              heroStyles.verdict,
              tone.silent && heroStyles.verdictSilent,
              { color: tone.wordColor },
            ]}
          >
            {tone.word}
          </Text>
        </Reanimated.View>

        {/* Confidence-silence layout — admit uncertainty cleanly.
            Reason text comes from deriveSilentReason so the user sees the
            ACTUAL gap ("Visual match uncertain — rescan", "Comp data is
            thin", "Above market but resale signal isn't strong", etc.)
            instead of the legacy generic "Need more comps to lock the call".
            That makes HOLD read as a real AI opinion, not a stalled call. */}
        {tone.silent ? (
          <Reanimated.View style={subStyle as any}>
            <Text style={heroStyles.silentSub} allowFontScaling={false}>
              {tone.silentReason ?? "Signal is thin — gather one more comp before committing."}
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
    paddingTop: SP.sm,
    paddingBottom: SP.xs,
  },
  // BUY/PASS verdict capsule. Extra paddingTop (xxl + sm) gives the
  // verdict word (PASS / BUY) ~8px more headroom inside the capsule so
  // the word reads as anchored, not jammed against the top edge. Border
  // alpha softened so the capsule outline is "felt" rather than seen —
  // the inner glow does the depth work, not the stroke.
  card: {
    paddingHorizontal: SP.xl,
    paddingTop: SP.xxl + SP.sm,
    paddingBottom: SP.xl,
    borderRadius: R.xl,
    backgroundColor: "rgba(255,255,255,0.022)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.040)",
    alignItems: "center",
    overflow: "hidden",
  },
  // Silent / HOLD card variant — Bloomberg-calm. paddingTop bumped (lg
  // → lg+sm) so the HOLD word sits visually lower inside the capsule —
  // the prior layout had it pinned to the top edge and the center of
  // the card felt empty. paddingBottom matches so the silhouette stays
  // balanced; the reason text + price + COST/MARKET strip now occupy
  // the middle of the card instead of the upper third. Width narrowed
  // via self margins (set on outer in the component); background and
  // border kept ultra-soft so the bubble still reads as quiet annotation,
  // not an alert panel.
  cardSilent: {
    paddingTop: SP.lg + SP.sm,
    paddingBottom: SP.md + 2,
    paddingHorizontal: SP.lg,
    borderRadius: R.lg,
    backgroundColor: "rgba(255,255,255,0.012)",
    borderColor: "rgba(255,255,255,0.035)",
  },
  // Inner glow — wider + taller + softer than before so the verdict word
  // sits inside a diffuse halo instead of a tight oval. The larger
  // borderRadius keeps the falloff radial; centering math compensates for
  // the bigger size. Reads as "the capsule is illuminated from within"
  // rather than "there's a colored shape behind the word."
  glow: {
    position: "absolute",
    top: SP.lg,
    left: "50%",
    marginLeft: -170,
    width: 340,
    height: 120,
    borderRadius: 170,
  },
  verdict: {
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: 5.0,
    lineHeight: 42,
    textAlign: "center",
  },
  // Silent HOLD: even calmer. 22pt with reduced tracking lands
  // as institutional confidence — visually equivalent weight to a
  // section header, not a billboard.
  verdictSilent: {
    fontSize: 22,
    letterSpacing: 3.0,
    lineHeight: 28,
  },
  dollar: {
    marginTop: SP.md,
    fontSize: 40,
    fontWeight: "900",
    color: C.text,
    letterSpacing: -1.0,
    lineHeight: 44,
    textAlign: "center",
  },
  dollarSign: {
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: -1.0,
  },
  context: {
    marginTop: SP.xs,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2.0,
    color: C.text3,
    textAlign: "center",
  },
  // Confidence-silence variants. silentSub.marginTop bumped (sm → md)
  // so the reason line breathes below the HOLD word instead of crowding
  // it — the prior tight spacing made the verdict capsule's upper half
  // feel cramped while the lower half felt empty. silentPrice marginTop
  // up (2 → 6) for the same balance reason: the dollar reads as a quiet
  // annotation with real breathing room above it.
  silentSub: {
    marginTop: SP.md,
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255,255,255,0.44)",
    textAlign: "center",
    letterSpacing: 0.15,
    lineHeight: 16,
    paddingHorizontal: SP.xs,
  },
  silentPrice: {
    marginTop: 6,
    fontSize: 17,
    fontWeight: "700",
    color: "rgba(255,255,255,0.58)",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  strip: {
    flexDirection: "row",
    gap: SP.xxl,
    marginTop: SP.lg,
    paddingTop: SP.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.05)",
    alignSelf: "stretch",
    justifyContent: "center",
  },
  stripCell: {
    alignItems: "center",
  },
  // COST / MARKET labels — dimmed one tier so the numbers below carry
  // the eye instead of the all-caps labels. The text4 color (32%) read
  // as too bright against the verdict capsule's near-black fill; 22%
  // lands the labels at "felt context," letting the dollar values win.
  stripLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.6,
    color: "rgba(255,255,255,0.22)",
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
// CARD DECK ERROR BOUNDARY
//
// React doesn't catch render-phase throws inside functional children — an
// unguarded throw inside ResultCard or any of its sub-panels (community
// comps, premium intel, price history chart) unmounts the entire results
// tree, which read as a "swiping crashes the app" symptom in the field.
// This boundary contains the blast radius: any throw becomes a quiet
// fallback view and a CARD_DECK_BOUNDARY_CAUGHT log line, while the verdict
// hero + dock stay mounted so the user can still act on the scan.
// ─────────────────────────────────────────────────────────────────────────────
class CardDeckBoundary extends React.Component<
  { children: React.ReactNode },
  { hadError: boolean }
> {
  state = { hadError: false };
  static getDerivedStateFromError() { return { hadError: true }; }
  componentDidCatch(err: any, info: any) {
    try {
      console.log("CARD_DECK_BOUNDARY_CAUGHT", {
        error: err?.message || String(err),
        stack: String(info?.componentStack || "").slice(0, 400),
      });
    } catch {}
  }
  render() {
    if (this.state.hadError) {
      return <View style={{ height: 12 }} />;
    }
    return this.props.children as any;
  }
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
    paddingTop: SP.xs,
    paddingBottom: 2,
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
    fontSize: 12,
    fontWeight: "600",
    color: C.text4,
    lineHeight: 17,
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
