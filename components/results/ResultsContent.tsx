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
  ScrollView,
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
import {
  buildAllMarketCards,
  computeMarketStats,
  deriveVerdictCopy,
  deriveVerdictNumbers,
  deriveEvansRead,
  deriveEvidenceStripStats,
  deriveMatchPercent,
  evidenceLabel,
  isVerifiedListing,
  isPricingSignal,
  type MarketCard,
  type MarketStats,
  type VerdictCopy,
  type VerdictNumbers,
  type EvansRead as EvansReadData,
  type EvidenceStripStat,
} from "./marketIntel";

const IS_ANDROID = Platform.OS === "android";
const panthere = Easing.bezier(EASE_PANTHERE[0], EASE_PANTHERE[1], EASE_PANTHERE[2], EASE_PANTHERE[3]);

interface ResultsContentProps {
  // ── Data ──────────────────────────────────
  activeResult: any;
  results: any[];
  /**
   * Pillar 1: full marketplace pool (up to 60 deep) from the scan
   * response. Optional — when present we build the Best Market Matches
   * rail off this richer pool so the user sees true depth, not just the
   * top-3 ranked subset. When omitted we fall back to `results`.
   */
  marketPool?: any[];
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
  onOpenListing: (itemOrUrl: any, title?: string) => void;
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

// Dock spacer height — keeps the scroll content from sliding under the
// absolute-positioned dock. Recomputed for Pillar 1.5 after the dock
// itself was slimmed:
//   - paddingTop 22 + intelStrip ~22 + primary row 44 + sm 8
//     + secondary 2×40 + rowGap 8 + safe-area ~42 ≈ 230px actual dock
//   - Add ~50px buffer so the fade ladder absorbs the deck's bottom
//     shadow without the deck guillotining into the dock.
//   - Net: 280 (was 332) — the deck now has ~52px more vertical room
//     to render its bottom edge before the spacer reserves the dock zone.
const DOCK_SAFE_HEIGHT = 280;

export const ResultsContent = React.memo(function ResultsContent({
  activeResult,
  results,
  marketPool,
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
    // Keep the rail's selectedIndex in sync with user swipe so swiping
    // also highlights the active mini-card and the rail tap can't fight
    // the swipe via the controlled-snap effect inside CardDeck.
    setSelectedIndex(idx);
  }, []);

  const handleRailSelect = useCallback((idx: number) => {
    if (!Number.isInteger(idx) || idx < 0) return;
    setSelectedIndex(idx);
  }, []);

  // Build watchlist query set for heart state
  const watchlistQueries = React.useMemo(
    () => (watchlist || []).map((w: any) => String(w.query || w.itemName || "").trim().toLowerCase()),
    [watchlist],
  );

  // ── Pillar 1: market intelligence ────────────────────────────────────────
  // Build the canonical card array (hero + alts, deduped, junk-filtered,
  // per-store-capped). Used by:
  //   - the swipeable CardDeck (immersive view)
  //   - the Best Market Matches rail (at-a-glance market spread)
  //   - the ResultsDock primary CTA (currentCard for clickable guard)
  // Cards are shared so the rail's mini-card tap can snap the deck to
  // exactly the same listing the user clicked.
  const allMarketCards: MarketCard[] = React.useMemo(
    () => buildAllMarketCards(activeResult, results, marketPool),
    [activeResult, results, marketPool],
  );
  const marketStats: MarketStats = React.useMemo(
    () => computeMarketStats(allMarketCards, Number(activeResult?.scannedPrice) || null),
    [allMarketCards, activeResult],
  );
  const verdictCopy: VerdictCopy = React.useMemo(
    () => deriveVerdictCopy(activeResult, marketStats),
    [activeResult, marketStats],
  );
  const verdictNumbers: VerdictNumbers = React.useMemo(
    () => deriveVerdictNumbers(activeResult, marketStats),
    [activeResult, marketStats],
  );
  const evansRead: EvansReadData = React.useMemo(
    () => deriveEvansRead(activeResult, marketStats, verdictCopy),
    [activeResult, marketStats, verdictCopy],
  );
  // Pillar 1.5 — pass the raw pool depth (marketPool/results) so the strip
  // can render a "{N} CHECKED" cell whenever Evan filtered the input down
  // to the displayed canonical card array. This makes thin scans read as
  // intelligence ("6 checked · 1 match") rather than failure ("1 match").
  const listingsChecked: number = React.useMemo(() => {
    const m = Array.isArray(marketPool) ? marketPool.length : 0;
    const r = Array.isArray(results) ? results.length : 0;
    const upstreamTotal = Number(activeResult?.totalMatches);
    return Math.max(
      m,
      r,
      Number.isFinite(upstreamTotal) && upstreamTotal > 0 ? upstreamTotal : 0,
      allMarketCards.length,
    );
  }, [marketPool, results, activeResult, allMarketCards]);
  const evidenceStrip: EvidenceStripStat[] = React.useMemo(
    () => deriveEvidenceStripStats(marketStats, listingsChecked),
    [marketStats, listingsChecked],
  );

  // Rail → deck snap state. The rail and the deck share the same
  // selectedIndex so tapping a mini card brings that listing to the
  // front of the deck. Deck swipe still owns the source of truth via
  // handleSnap below — selectedIndex is just the controlled prop.
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset selected index when activeResult changes (matches deckIndex reset).
  useEffect(() => {
    setSelectedIndex(0);
  }, [activeResult]);

  const currentCard = allMarketCards[deckIndex] ?? activeResult;
  // Prefer directUrl (backend-vetted) over buyLink/url fallbacks.
  // Do not open when clickable:false — pass the full card so safeOpenListingUrl
  // can enforce the clickable guard and log correctly.
  const currentUrl  = currentCard?.directUrl || currentCard?.buyLink || currentCard?.url || null;
  const currentName = currentCard?.itemName || currentCard?.title || "Listing";

  const handleOpenListing = useCallback(() => {
    if (currentCard) {
      onOpenListing(currentCard, currentName);
    } else if (currentUrl) {
      onOpenListing(currentUrl, currentName);
    }
  }, [currentCard, currentUrl, currentName, onOpenListing]);

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

              {/* Pillar 1 — compact verdict module + market evidence strip.
                  Replaces the legacy "giant verdict box" with a smaller
                  structurally correct block that teaches the user the
                  decision in one glance, then immediately shows the proof
                  (matches · low · high · verified · signals) underneath
                  so the user can see Evan investigated, not guessed. */}
              <CompactVerdict
                activeResult={activeResult}
                results={results}
                verdictCopy={verdictCopy}
                verdictNumbers={verdictNumbers}
              />

              <MarketEvidenceStrip stats={evidenceStrip} />

              {/* Card deck — proof, slid in after the verdict lands.
                  Wrapped in CardDeckBoundary so a render-phase throw inside
                  any individual card (image NSException retry storms, a
                  malformed comp blowing up PremiumIntelPanel, etc.) collapses
                  to an empty space instead of unmounting the entire results
                  tree. The verdict + dock survive even if the deck explodes.

                  Pillar 1: we now hand the deck the pre-built canonical
                  card array (allMarketCards) so the Best Market Matches
                  rail below can snap the deck via selectedIndex and both
                  surfaces stay in perfect sync. */}
              <Reanimated.View
                style={deckAnimStyle as any}
                renderToHardwareTextureAndroid={IS_ANDROID}
                shouldRasterizeIOS={!IS_ANDROID}
              >
                <CardDeckBoundary>
                  <CardDeck
                    activeResult={activeResult}
                    results={results}
                    cards={allMarketCards}
                    selectedIndex={selectedIndex}
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

              {/* Pillar 1 — Best Market Matches rail + Evan's Read.
                  The rail surfaces 4–7 mini cards (when available) so the
                  user can scan the market spread at a glance and tap
                  through to bring a specific listing into the deck. The
                  read is Evan's interpretation — a short data-driven
                  sentence + 2–4 chips so the screen reads as analysis,
                  not a search results page. */}
              <BestMarketMatchesRail
                cards={allMarketCards}
                selectedIndex={selectedIndex}
                onSelect={handleRailSelect}
                listingsChecked={listingsChecked}
                marketStats={marketStats}
              />

              <EvansReadBlock read={evansRead} />
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
// PILLAR 1 — COMPACT VERDICT MODULE.
//
// Replaces the legacy full-screen VerdictHero capsule. Same information,
// half the height — BUY/HOLD/PASS word, reason title, main delta number,
// cost/market mini-strip, one-sentence explanation. The screen no longer
// feels like a single oversized billboard followed by a thin shopping
// result; the verdict teaches the decision quickly, then the evidence
// strip + deck + rail + read carry the proof.
//
// Confidence silence (HOLD) is preserved via deriveSilentReason so HOLD
// reads as a real AI opinion ("Visual match uncertain — rescan", "Comp
// data is thin", "Above market, but resale signal isn't strong"), not a
// generic stall. Tones, glow, and direction copy ("X% UNDER MARKET" /
// "NOT ENOUGH EDGE") match the legacy treatment so the emotional register
// of the screen doesn't suddenly change in this pillar.
// ─────────────────────────────────────────────────────────────────────────────

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

function CompactVerdict({
  activeResult,
  results,
  verdictCopy,
  verdictNumbers,
}: {
  activeResult: any;
  results?: any[];
  verdictCopy: VerdictCopy;
  verdictNumbers: VerdictNumbers;
}) {
  // Restrained word tones — match the legacy treatment so the screen's
  // emotional register stays consistent across this pillar's structural
  // change. Pillar 2 will revisit color systemically.
  const wordTone =
    verdictCopy.word === "BUY"
      ? { color: "rgba(180,255,200,0.96)", glow: "rgba(80,255,160,0.10)" }
      : verdictCopy.word === "PASS"
        ? { color: "rgba(255,170,150,0.94)", glow: "rgba(255,120,100,0.08)" }
        : { color: "rgba(255,255,255,0.62)", glow: "rgba(255,255,255,0.05)" };

  // Enhanced silent sentence — drop in deriveSilentReason output when
  // marketIntel flagged silent. Keeps the smart per-gap copy that the
  // legacy VerdictHero relied on, so HOLD never reads as boilerplate.
  let sentence = verdictCopy.sentence;
  if (verdictCopy.silent) {
    const conf = Number(activeResult?.visionConfidence ?? 0);
    const compCount = Array.isArray(results)
      ? results.filter((r) => Number.isFinite(Number(r?.price))).length
      : 0;
    const totalMatches = Number(activeResult?.totalMatches ?? 0);
    const tooFewComps = compCount < 2 && totalMatches < 3;
    const lowVision = conf > 0 && conf < 0.45;
    const scannedN = Number(activeResult?.scannedPrice);
    const avgN = Number(activeResult?.avgMarket);
    const cheaperPctN = Number(activeResult?.cheaperPct);
    sentence = deriveSilentReason({
      lowVision,
      tooFewComps,
      upstreamHold:
        String(activeResult?.buyVerdict || "").toUpperCase() === "HOLD",
      conf,
      compCount,
      scanned: Number.isFinite(scannedN) ? scannedN : null,
      avg: Number.isFinite(avgN) ? avgN : null,
      ebayComps: activeResult?.ebaySoldComps ?? null,
      cheaperPct: Number.isFinite(cheaperPctN) ? cheaperPctN : null,
    });
  }

  // Headline number tone — positive delta ($X above market) carries
  // PASS tint when relevant; negative delta ($X under market) carries
  // BUY tint when relevant. Matches the legacy hero's color logic so
  // the user's eye still tracks "what direction is this dollar number"
  // the same way it did before.
  let headline: { sign: string; amount: string; tone: string } | null = null;
  if (verdictNumbers.delta != null) {
    const dollarStr = fmtMoney(Math.abs(verdictNumbers.delta));
    if (verdictNumbers.delta < 0) {
      headline = {
        sign: "−",
        amount: dollarStr,
        tone: verdictCopy.word === "BUY" ? "rgba(140,255,180,0.92)" : C.text2,
      };
    } else if (verdictNumbers.delta > 0) {
      headline = {
        sign: "+",
        amount: dollarStr,
        tone: verdictCopy.word === "PASS" ? "rgba(255,140,120,0.90)" : C.text2,
      };
    } else {
      headline = { sign: "", amount: dollarStr, tone: C.text2 };
    }
  }

  let directionLine = "";
  if (verdictNumbers.deltaPct != null) {
    const pct = Math.round(Math.abs(verdictNumbers.deltaPct));
    if (verdictNumbers.deltaPct < -2) directionLine = `${pct}% UNDER MARKET`;
    else if (verdictNumbers.deltaPct > 2) directionLine = `${pct}% ABOVE MARKET`;
    else directionLine = "MATCHES MARKET";
    if (verdictCopy.word === "PASS" && directionLine.includes("UNDER MARKET")) {
      directionLine = "NOT ENOUGH EDGE";
    }
  }

  // Sequenced opacity-only entrance — matches the rest of the screen's
  // text-glyph-safe reveal policy (no transforms on text).
  const cardOpacity = useSharedValue(0);
  const numbersOpacity = useSharedValue(0);
  const sentenceOpacity = useSharedValue(0);
  useEffect(() => {
    cardOpacity.value = 0;
    numbersOpacity.value = 0;
    sentenceOpacity.value = 0;
    cardOpacity.value = withTiming(1, { duration: 320, easing: panthere });
    numbersOpacity.value = withDelay(180, withTiming(1, { duration: 280, easing: panthere }));
    sentenceOpacity.value = withDelay(360, withTiming(1, { duration: 280, easing: panthere }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeResult]);
  const cardStyle = useAnimatedStyle(() => ({ opacity: cardOpacity.value }));
  const numbersStyle = useAnimatedStyle(() => ({ opacity: numbersOpacity.value }));
  const sentenceStyle = useAnimatedStyle(() => ({ opacity: sentenceOpacity.value }));

  return (
    <View style={compactVerdictStyles.outer}>
      <Reanimated.View
        style={[
          compactVerdictStyles.card,
          verdictCopy.silent && compactVerdictStyles.cardSilent,
          cardStyle as any,
        ]}
        renderToHardwareTextureAndroid={IS_ANDROID}
        shouldRasterizeIOS={!IS_ANDROID}
      >
        <View
          pointerEvents="none"
          style={[compactVerdictStyles.glow, { backgroundColor: wordTone.glow }]}
        />

        {/* Verdict word + reason title — side by side, baseline-aligned. */}
        <View style={compactVerdictStyles.headerRow}>
          <Text
            allowFontScaling={false}
            style={[compactVerdictStyles.word, { color: wordTone.color }]}
          >
            {verdictCopy.word}
          </Text>
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            style={compactVerdictStyles.reasonTitle}
          >
            {verdictCopy.title}
          </Text>
        </View>

        {/* Main delta number + direction caption. */}
        {headline ? (
          <Reanimated.View
            style={[compactVerdictStyles.dollarRow, numbersStyle as any]}
            renderToHardwareTextureAndroid={IS_ANDROID}
            shouldRasterizeIOS={!IS_ANDROID}
          >
            <Text allowFontScaling={false} style={compactVerdictStyles.dollar}>
              <Text style={[compactVerdictStyles.dollarSign, { color: headline.tone }]}>
                {headline.sign}
              </Text>
              {headline.amount}
            </Text>
            {directionLine ? (
              <Text allowFontScaling={false} style={compactVerdictStyles.direction}>
                {directionLine}
              </Text>
            ) : null}
          </Reanimated.View>
        ) : null}

        {/* Cost / Market mini strip — same shape as the legacy hero
            but inline-baseline instead of stacked cells, since the
            compact layout has less vertical space to give. */}
        {verdictNumbers.cost != null || verdictNumbers.market != null ? (
          <Reanimated.View
            style={[compactVerdictStyles.strip, numbersStyle as any]}
            renderToHardwareTextureAndroid={IS_ANDROID}
            shouldRasterizeIOS={!IS_ANDROID}
          >
            {verdictNumbers.cost != null ? (
              <View style={compactVerdictStyles.stripCell}>
                <Text style={compactVerdictStyles.stripLabel} allowFontScaling={false}>
                  COST
                </Text>
                <Text style={compactVerdictStyles.stripValue} allowFontScaling={false}>
                  {fmtMoney(verdictNumbers.cost)}
                </Text>
              </View>
            ) : null}
            {verdictNumbers.market != null ? (
              <View style={compactVerdictStyles.stripCell}>
                <Text style={compactVerdictStyles.stripLabel} allowFontScaling={false}>
                  {verdictNumbers.marketLabel.toUpperCase()}
                </Text>
                <Text style={compactVerdictStyles.stripValue} allowFontScaling={false}>
                  {fmtMoney(verdictNumbers.market)}
                </Text>
              </View>
            ) : null}
          </Reanimated.View>
        ) : null}

        {/* One-sentence explanation. Compact body copy, restrained tone.
            Capped at 2 lines so the verdict never paragraph-blooms — Pillar
            1.5 explicitly trades exhaustive context for a cockpit feel. */}
        <Reanimated.View style={sentenceStyle as any}>
          <Text
            allowFontScaling={false}
            numberOfLines={2}
            ellipsizeMode="tail"
            style={compactVerdictStyles.sentence}
          >
            {sentence}
          </Text>
        </Reanimated.View>
      </Reanimated.View>
    </View>
  );
}

const compactVerdictStyles = StyleSheet.create({
  // Pillar 1.8.5 — final compression pass before Pillar 2 visual work.
  // Card paddings tightened SP.md → SP.sm, gaps between header / dollar
  // / strip / sentence shaved 2–4px each, lineHeights trimmed, sentence
  // dropped to 11pt @ 15 lh. The verdict still reads as authoritative
  // (BUY stamp + headline dollar untouched), but its overall footprint
  // shrinks ~24%, letting the card and market intel rise on screen.
  outer: {
    paddingHorizontal: SP.lg,
    paddingTop: 4,
    paddingBottom: 0,
  },
  card: {
    paddingHorizontal: 14,
    paddingTop: SP.sm,
    paddingBottom: SP.sm,
    borderRadius: R.lg,
    backgroundColor: "rgba(255,255,255,0.020)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.045)",
    overflow: "hidden",
  },
  cardSilent: {
    backgroundColor: "rgba(255,255,255,0.012)",
    borderColor: "rgba(255,255,255,0.035)",
  },
  glow: {
    position: "absolute",
    top: -4,
    left: "50%",
    marginLeft: -140,
    width: 280,
    height: 60,
    borderRadius: 140,
    opacity: 0.72,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: SP.sm,
  },
  word: {
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 1.9,
    lineHeight: 23,
  },
  reasonTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.65)",
    letterSpacing: 0.15,
    lineHeight: 16,
  },
  dollarRow: {
    marginTop: 3,
    flexDirection: "row",
    alignItems: "baseline",
    gap: SP.sm,
  },
  dollar: {
    fontSize: 26,
    fontWeight: "900",
    color: C.text,
    letterSpacing: -0.7,
    lineHeight: 29,
  },
  dollarSign: {
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  direction: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
    color: "rgba(255,255,255,0.42)",
  },
  strip: {
    flexDirection: "row",
    gap: SP.lg,
    marginTop: 7,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.055)",
  },
  stripCell: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  stripLabel: {
    fontSize: 8.5,
    fontWeight: "900",
    letterSpacing: 1.5,
    color: "rgba(255,255,255,0.24)",
  },
  stripValue: {
    fontSize: 12,
    fontWeight: "800",
    color: "rgba(255,255,255,0.74)",
    letterSpacing: -0.2,
  },
  sentence: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "500",
    color: "rgba(255,255,255,0.55)",
    lineHeight: 15,
    letterSpacing: 0.1,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// MARKET EVIDENCE STRIP — the proof bar.
//
// Sits directly below the verdict. Data-driven cells: matches, low, high,
// verified, signals. Fixes the trust gap the user flagged: even when Evan
// finds 9 listings the screen previously read as "Evan only found one."
// This strip makes the actual depth visible. Verified count carries a
// good/warn tone so the user can instantly tell whether the market has
// real direct links or only pricing signals.
// ─────────────────────────────────────────────────────────────────────────────
function MarketEvidenceStrip({ stats }: { stats: EvidenceStripStat[] }) {
  // Pillar 1.6 — flow the proof as a single wrapping sentence instead of
  // a cell-grid. The cell layout was killing the labels at iPhone width
  // (CHEC…, MATC…, VERIFI…, SIGN…); a single Text node wraps cleanly to
  // two lines without truncation and reads as proof rather than as a
  // spreadsheet. Tone styling is preserved per-segment via nested <Text>.
  if (!stats || stats.length === 0) return null;
  return (
    <View style={evidenceStripStyles.outer}>
      <View style={evidenceStripStyles.row}>
        <Text
          style={evidenceStripStyles.proofText}
          allowFontScaling={false}
          numberOfLines={3}
          ellipsizeMode="tail"
        >
          {stats.map((s, i) => {
            const isLabelOnly = !s.value || s.value.length === 0;
            const isLast = i === stats.length - 1;
            const valueStyle = [
              evidenceStripStyles.proofValue,
              s.tone === "warn" && evidenceStripStyles.proofValueWarn,
              s.tone === "good" && evidenceStripStyles.proofValueGood,
              s.tone === "muted" && evidenceStripStyles.proofValueMuted,
            ];
            const labelStyle = [
              evidenceStripStyles.proofLabel,
              s.tone === "warn" && evidenceStripStyles.proofLabelWarn,
              s.tone === "good" && evidenceStripStyles.proofLabelGood,
            ];
            // Non-breaking space between value and label so "13 checked"
            // never wraps with the value alone at the end of a line.
            const NB = " ";
            return (
              <React.Fragment key={`${s.label}-${i}`}>
                {isLabelOnly ? (
                  // Value-less trust pill ("Signal only"). Stays
                  // TitleCase so it reads as a label, not a fragment.
                  <Text style={labelStyle}>{s.label}</Text>
                ) : (
                  <>
                    <Text style={valueStyle}>{s.value}</Text>
                    <Text style={labelStyle}>
                      {NB}
                      {s.label.toLowerCase()}
                    </Text>
                  </>
                )}
                {!isLast ? (
                  <Text style={evidenceStripStyles.proofSep}>
                    {"  ·  "}
                  </Text>
                ) : null}
              </React.Fragment>
            );
          })}
        </Text>
      </View>
    </View>
  );
}

const evidenceStripStyles = StyleSheet.create({
  // Pillar 1.8.5 — strip weight reduced ~12% so evidence supports the
  // card instead of competing with it. proofValue 900 → 800, full white
  // → 0.82 white. proofText 12.5 → 11.5, lineHeight 18 → 16. Row paddingY
  // 9 → 7, bg fill 0.025 → 0.018. Green/amber accent values toned down a
  // half-step so the chip color still reads as trust state, not alarm.
  // The strip remains fully readable — it just no longer outranks the
  // card in the eye-flow chain.
  outer: {
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 6,
  },
  row: {
    backgroundColor: "rgba(255,255,255,0.018)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.04)",
    borderRadius: R.md,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  proofText: {
    fontSize: 11.5,
    lineHeight: 16,
    color: "rgba(255,255,255,0.66)",
    letterSpacing: 0.05,
  },
  proofValue: {
    fontWeight: "800",
    color: "rgba(255,255,255,0.82)",
    letterSpacing: -0.05,
  },
  proofValueGood: { color: "rgba(180,255,200,0.78)" },
  proofValueWarn: { color: "rgba(255,210,140,0.72)" },
  proofValueMuted: { color: "rgba(255,255,255,0.62)" },
  proofLabel: {
    fontWeight: "600",
    color: "rgba(255,255,255,0.44)",
    letterSpacing: 0.1,
  },
  proofLabelGood: { color: "rgba(180,255,200,0.66)" },
  proofLabelWarn: { color: "rgba(255,210,140,0.80)" },
  proofSep: {
    color: "rgba(255,255,255,0.18)",
    fontWeight: "700",
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// BEST MARKET MATCHES RAIL — at-a-glance market spread.
//
// 4–7 mini cards in a horizontal scroll. Each shows thumbnail, price,
// source, evidence label + match %. Tapping a mini brings that listing
// to the front of the main deck via the parent's selectedIndex.
//
// Trust:
//   - evidenceLabel() never claims "Verified listing" without verification
//   - pricing signals are labeled "Pricing signal · NN%" and never
//     promise a direct link
//   - tapping a mini just snaps the deck (selectedIndex); it does NOT
//     open a URL — opening is gated through the dock's primary CTA
//
// Honesty: when fewer than 4 strong alts exist, the rail shows a small
// "Only X strong matches found" note rather than padding the row with
// duplicates. We do not fake abundance.
// ─────────────────────────────────────────────────────────────────────────────
function BestMarketMatchesRail({
  cards,
  selectedIndex,
  onSelect,
  listingsChecked,
  marketStats,
}: {
  cards: MarketCard[];
  selectedIndex: number;
  onSelect: (idx: number) => void;
  listingsChecked?: number;
  marketStats?: MarketStats;
}) {
  // Pillar 1.5 — thin-market branch. When fewer than 4 strong matches
  // exist, the rail collapses to a dedicated "Market Depth" module
  // instead of showing 1–3 mini cards. The thin-market state should
  // feel like intelligence ("1 strong match from 6 listings checked"),
  // not like the rail failed to load.
  if (cards.length < 4) {
    return (
      <MarketDepthBlock
        cards={cards}
        listingsChecked={listingsChecked ?? 0}
        marketStats={marketStats ?? null}
        selectedIndex={selectedIndex}
        onSelect={onSelect}
      />
    );
  }

  const altCount = Math.max(0, cards.length - 1);
  const allAlts = cards.slice(1, 8);
  // When alts are thin (1–3), include the hero so the rail still has
  // something to surface — the user still sees a market, just an honest one.
  const includeHero = altCount > 0 && altCount < 4;
  const railCards = includeHero
    ? cards.slice(0, Math.min(7, cards.length))
    : allAlts;
  if (railCards.length === 0) return null;

  // Header / honesty note.
  let railHeader = "Best Market Matches";
  let railNote: string | null = null;
  if (altCount === 0) {
    railHeader = "Market evidence";
    railNote = "Evan surfaced only the active listing — no swipeable alternates.";
  } else if (altCount < 4) {
    railNote = `Only ${altCount} strong ${altCount === 1 ? "alternate" : "alternates"} found`;
  }

  // Index base — when includeHero, the rail and deck share the same
  // index space so tapping the hero mini stays on the hero card. When
  // not, the rail starts at index 1 of the canonical cards array.
  const indexBase = includeHero ? 0 : 1;

  return (
    <View style={railStyles.outer}>
      <View style={railStyles.headerRow}>
        <Text style={railStyles.header} allowFontScaling={false}>
          {railHeader}
        </Text>
        {railNote ? (
          <Text style={railStyles.note} allowFontScaling={false} numberOfLines={1}>
            {railNote}
          </Text>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={railStyles.scrollContent}
      >
        {railCards.map((card, i) => {
          const idx = indexBase + i;
          const isActive = idx === selectedIndex;
          const price = Number.isFinite(Number(card.price))
            ? Number(card.price)
            : null;
          const source =
            (typeof card.store === "string" && card.store) ||
            (typeof card.source === "string" && card.source) ||
            "Marketplace";
          const labelText = evidenceLabel(card);
          const matchPct = deriveMatchPercent(card);
          const subtitle =
            matchPct != null ? `${labelText} · ${matchPct}%` : labelText;
          const subtitleTone = isVerifiedListing(card)
            ? railStyles.miniSubVerified
            : isPricingSignal(card)
              ? railStyles.miniSubPricing
              : railStyles.miniSubDefault;
          return (
            <PressableScale
              key={`rail-${idx}-${i}`}
              onPress={() => onSelect(idx)}
              style={[railStyles.mini, isActive && railStyles.miniActive]}
              scale={0.96}
              haptic
            >
              <View style={railStyles.miniThumbWrap}>
                {card.image ? (
                  <Image
                    source={{ uri: String(card.image) }}
                    style={railStyles.miniThumb}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={railStyles.miniThumbPlaceholder}>
                    <Ionicons
                      name="image-outline"
                      size={16}
                      color="rgba(255,255,255,0.22)"
                    />
                  </View>
                )}
              </View>
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                style={railStyles.miniPrice}
              >
                {price != null ? fmtMoney(price) : "—"}
              </Text>
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                style={railStyles.miniSource}
              >
                {source}
              </Text>
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                style={[railStyles.miniSubtitle, subtitleTone]}
              >
                {subtitle}
              </Text>
            </PressableScale>
          );
        })}
      </ScrollView>
    </View>
  );
}

const railStyles = StyleSheet.create({
  outer: {
    marginTop: SP.md,
    paddingBottom: SP.xs,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: SP.sm,
    paddingHorizontal: SP.lg,
    marginBottom: SP.sm,
  },
  header: {
    fontSize: 11,
    fontWeight: "900",
    color: C.text2,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  note: {
    flex: 1,
    fontSize: 10,
    fontWeight: "700",
    color: C.text3,
    letterSpacing: 0.2,
  },
  scrollContent: {
    paddingLeft: SP.lg,
    paddingRight: SP.lg,
    gap: SP.sm,
  },
  mini: {
    width: 130,
    backgroundColor: "rgba(255,255,255,0.025)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: R.md,
    padding: SP.sm,
  },
  miniActive: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.18)",
  },
  miniThumbWrap: {
    width: "100%",
    height: 70,
    borderRadius: R.sm,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.04)",
    marginBottom: SP.xs,
  },
  miniThumb: { width: "100%", height: "100%" },
  miniThumbPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  miniPrice: {
    fontSize: 15,
    fontWeight: "900",
    color: C.text,
    letterSpacing: -0.2,
  },
  miniSource: {
    fontSize: 10,
    fontWeight: "700",
    color: C.text3,
    marginTop: 1,
    letterSpacing: 0.1,
  },
  miniSubtitle: {
    fontSize: 9,
    fontWeight: "700",
    marginTop: 4,
    letterSpacing: 0.2,
  },
  miniSubVerified: { color: "rgba(180,255,200,0.85)" },
  miniSubPricing: { color: "rgba(255,210,140,0.78)" },
  miniSubDefault: { color: C.text3 },
});

// ─────────────────────────────────────────────────────────────────────────────
// MARKET DEPTH BLOCK — thin-market state.
//
// Replaces the rail when fewer than 4 strong matches exist. Instead of
// showing a half-empty row of mini-cards (which reads as "Evan failed to
// find a market"), this block surfaces an honest sentence + chips that
// tell the user exactly how thin the market is and why.
//
// Format:
//   MARKET DEPTH
//   1 strong match from 6 listings checked
//   [5 filtered out] [0 verified] [signal only]
//
// Trust:
//   - never claims hidden alternates exist
//   - never duplicates the hero card to pad a row
//   - verified count carries warn tint when 0
//   - "signal only" pill appears only when verified === 0 AND we have
//     at least one strong match (so the user knows what the evidence is)
//
// The block still surfaces the strong match(es) inline as a tappable
// mini-row below the chips so the user can re-snap the deck — this
// keeps parity with the rail's "tap to bring to front" affordance.
// ─────────────────────────────────────────────────────────────────────────────
function MarketDepthBlock({
  cards,
  listingsChecked,
  marketStats,
  selectedIndex,
  onSelect,
}: {
  cards: MarketCard[];
  listingsChecked: number;
  marketStats: MarketStats | null;
  selectedIndex: number;
  onSelect: (idx: number) => void;
}) {
  if (cards.length === 0) return null;

  const strongN = cards.length;
  const checked = Math.max(strongN, Math.floor(Number(listingsChecked) || 0));
  const filtered = Math.max(0, checked - strongN);
  const verifiedN = marketStats?.verifiedCount ?? 0;
  const onlySignals =
    verifiedN === 0 && strongN > 0;

  // Sentence — singular/plural correct on both sides.
  const strongPhrase = `${strongN} strong ${strongN === 1 ? "match" : "matches"}`;
  const checkedPhrase = `${checked} ${checked === 1 ? "listing" : "listings"} checked`;
  const sentence = `${strongPhrase} from ${checkedPhrase}.`;

  // Chip set.
  const chips: { label: string; tone: "default" | "warn" | "good" | "muted" }[] = [];
  if (filtered > 0) {
    chips.push({
      label: `${filtered} filtered out`,
      tone: "muted",
    });
  }
  chips.push({
    label: `${verifiedN} verified`,
    tone: verifiedN > 0 ? "good" : "warn",
  });
  if (onlySignals) {
    chips.push({ label: "Signal only", tone: "warn" });
  }
  if (marketStats?.priceSpreadLabel === "wide") {
    chips.push({ label: "Wide spread", tone: "muted" });
  }

  return (
    <View style={depthStyles.outer}>
      <View style={depthStyles.headerRow}>
        <Ionicons name="stats-chart" size={11} color="rgba(255,255,255,0.55)" />
        <Text style={depthStyles.header} allowFontScaling={false}>
          Market Depth
        </Text>
      </View>
      <Text
        style={depthStyles.sentence}
        allowFontScaling={false}
        numberOfLines={2}
      >
        {sentence}
      </Text>
      {chips.length > 0 ? (
        <View style={depthStyles.chipRow}>
          {chips.map((c, i) => (
            <View
              key={`depth-chip-${i}-${c.label}`}
              style={[
                depthStyles.chip,
                c.tone === "warn" && depthStyles.chipWarn,
                c.tone === "good" && depthStyles.chipGood,
              ]}
            >
              <Text
                style={[
                  depthStyles.chipText,
                  c.tone === "warn" && depthStyles.chipTextWarn,
                  c.tone === "good" && depthStyles.chipTextGood,
                ]}
                allowFontScaling={false}
                numberOfLines={1}
              >
                {c.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Inline mini-rail of the strong cards. Stays inside the depth
          block so the user can still tap to re-snap the deck — but
          presented as a tight row of evidence rather than a fake rail. */}
      {strongN > 1 ? (
        <View style={depthStyles.evidenceRow}>
          {cards.slice(0, Math.min(3, cards.length)).map((card, i) => {
            const idx = i;
            const isActive = idx === selectedIndex;
            const labelText = evidenceLabel(card);
            const price = Number.isFinite(Number(card.price))
              ? Number(card.price)
              : null;
            return (
              <PressableScale
                key={`depth-mini-${idx}`}
                onPress={() => onSelect(idx)}
                style={[depthStyles.miniRow, isActive && depthStyles.miniRowActive]}
                scale={0.97}
                haptic
              >
                {card.image ? (
                  <Image
                    source={{ uri: String(card.image) }}
                    style={depthStyles.miniRowThumb}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={depthStyles.miniRowThumbPlaceholder}>
                    <Ionicons name="image-outline" size={12} color="rgba(255,255,255,0.22)" />
                  </View>
                )}
                <View style={depthStyles.miniRowText}>
                  <Text
                    style={depthStyles.miniRowPrice}
                    allowFontScaling={false}
                    numberOfLines={1}
                  >
                    {price != null ? fmtMoney(price) : "—"}
                  </Text>
                  <Text
                    style={[
                      depthStyles.miniRowLabel,
                      isVerifiedListing(card) && depthStyles.miniRowLabelGood,
                      isPricingSignal(card) && depthStyles.miniRowLabelWarn,
                    ]}
                    allowFontScaling={false}
                    numberOfLines={1}
                  >
                    {labelText}
                  </Text>
                </View>
              </PressableScale>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const depthStyles = StyleSheet.create({
  // Pillar 1.8 — depth section presents like an intelligence report,
  // not a data table. Header gets an analytics chevron + heavier label
  // type, the sentence reads as a confident paragraph (13.5pt @ 19 lh),
  // chips inflate slightly so they feel like trust stamps rather than
  // compact bullets. Outer margin opens 16 → 18 so the section anchors
  // to the page rhythm without crowding the deck above it.
  outer: {
    marginTop: SP.lg,
    marginHorizontal: 18,
    paddingTop: SP.sm,
    paddingBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  header: {
    fontSize: 11.5,
    fontWeight: "900",
    color: "rgba(255,255,255,0.78)",
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  sentence: {
    fontSize: 13.5,
    fontWeight: "600",
    color: "rgba(255,255,255,0.88)",
    lineHeight: 19,
    letterSpacing: 0,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    rowGap: 6,
    marginTop: 10,
  },
  chip: {
    paddingVertical: 4,
    paddingHorizontal: 9,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderRadius: R.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chipWarn: {
    backgroundColor: "rgba(255,210,140,0.07)",
    borderColor: "rgba(255,210,140,0.22)",
  },
  chipGood: {
    backgroundColor: "rgba(180,255,200,0.06)",
    borderColor: "rgba(180,255,200,0.22)",
  },
  chipText: {
    fontSize: 10,
    fontWeight: "800",
    color: "rgba(255,255,255,0.62)",
    letterSpacing: 0.3,
  },
  chipTextWarn: { color: "rgba(255,215,150,0.92)" },
  chipTextGood: { color: "rgba(195,255,210,0.92)" },
  evidenceRow: {
    flexDirection: "column",
    gap: 6,
    marginTop: 10,
  },
  miniRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: "rgba(255,255,255,0.025)",
    borderRadius: R.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.05)",
  },
  miniRowActive: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.16)",
  },
  miniRowThumb: {
    width: 28,
    height: 28,
    borderRadius: R.sm,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  miniRowThumbPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: R.sm,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  miniRowText: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SP.sm,
  },
  miniRowPrice: {
    fontSize: 12,
    fontWeight: "900",
    color: C.text,
    letterSpacing: -0.2,
  },
  miniRowLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: C.text3,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  miniRowLabelGood: { color: "rgba(180,255,200,0.82)" },
  miniRowLabelWarn: { color: "rgba(255,210,140,0.78)" },
});

// ─────────────────────────────────────────────────────────────────────────────
// EVAN'S READ — interpretation + chips.
//
// Short data-driven sentence (1 line) + 2–4 chips. Lives between the
// rail and the dock. Tells the user what Evan thinks the market means,
// not what it is. The sentence and chips come from marketIntel.deriveEvansRead
// which knows about verified vs pricing-signal evidence, spread label,
// and visual-match strength — so it never claims certainty it doesn't have.
// ─────────────────────────────────────────────────────────────────────────────
function EvansReadBlock({ read }: { read: EvansReadData }) {
  if (!read || !read.sentence) return null;
  return (
    <View style={evansReadStyles.outer}>
      <View style={evansReadStyles.headerRow}>
        <Ionicons name="sparkles" size={10} color={C.text3} />
        <Text style={evansReadStyles.header} allowFontScaling={false}>
          Evan&apos;s Read
        </Text>
      </View>
      {/* Pillar 1.5 — capped at 3 lines so the read stays a scout note,
          not a paragraph. The chip row carries the structured judgement. */}
      <Text
        style={evansReadStyles.sentence}
        allowFontScaling={false}
        numberOfLines={3}
        ellipsizeMode="tail"
      >
        {read.sentence}
      </Text>
      {read.chips.length > 0 ? (
        <View style={evansReadStyles.chipRow}>
          {read.chips.map((c, i) => (
            <View key={`chip-${i}-${c}`} style={evansReadStyles.chip}>
              <Text
                style={evansReadStyles.chipText}
                allowFontScaling={false}
                numberOfLines={1}
              >
                {c}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const evansReadStyles = StyleSheet.create({
  // Pillar 1.8 — marginTop SP.sm → SP.md so Evan's Read lands as a
  // discrete beat below Market Depth, not as a continuation of it.
  // marginX SP.lg → 18 aligns with the new section rhythm; paddingTop
  // bumps to SP.md for a more confident header strip.
  outer: {
    marginTop: SP.md,
    marginHorizontal: 18,
    paddingTop: SP.md,
    paddingBottom: SP.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  header: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
    color: C.text3,
    textTransform: "uppercase",
  },
  sentence: {
    fontSize: 12,
    fontWeight: "500",
    color: C.text2,
    lineHeight: 16.5,
    letterSpacing: 0.05,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    rowGap: 6,
    marginTop: 8,
  },
  chip: {
    paddingVertical: 3,
    paddingHorizontal: 7,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: R.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.07)",
  },
  chipText: {
    fontSize: 9,
    fontWeight: "700",
    color: C.text3,
    letterSpacing: 0.15,
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

  // Identity header — quiet breadcrumb above the verdict.
  // Pillar 1.8 — paddingX 24 → 18 so the breadcrumb shares the same
  // left/right rhythm as the verdict, evidence strip, market depth,
  // and Evan's Read sections below. Identity used to stick out
  // further right than every other section, breaking the eye-line.
  identityHeader: {
    paddingHorizontal: 18,
    paddingTop: SP.sm,
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
