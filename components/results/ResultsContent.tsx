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
import {
  C, SP, R, TY, fmtMoney,
  EASE_PANTHERE, SINGULARITY,
  VERDICT_TONE, verdictKind, SIGNAL,
} from "../design/DS";
import { PressableScale } from "../primitives/PressableScale";
import { getApiBase } from "../../utils/apiBase";
import {
  buildAllMarketCards,
  computeMarketStats,
  deriveVerdictCopy,
  deriveVerdictNumbers,
  deriveEvansRead,
  deriveEvidenceStripStats,
  deriveMatchPercent,
  evidenceLabel,
  evidenceLabelShort,
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
  // Pillar 2 — single source of truth for the active listing. The deck,
  // pager dots, Market Depth spotlight, rail selection, and dock primary
  // CTA all read from this same value, and every input path (swipe,
  // rail tap, depth row tap) routes through handleSnap so they can never
  // drift. The legacy `selectedIndex` alias below preserves the prop name
  // the CardDeck + rail still consume.
  const [activeIndex, setActiveIndex] = useState(0);

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
  const resolvedApiBase = apiBase ?? getApiBase();

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
  // Pillar 3C — "Market assembles" stagger. After the deck lands at
  // ~620ms, Market Depth (or the BestMarketMatchesRail when comps are
  // thick) drifts up next at 700ms, then Evan's Read at 770ms. Each is
  // a one-shot opacity + tiny translateY. Stays GPU-only, settles to
  // (1, 0) and never animates again. No perpetual loops.
  const depthEntrance      = useSharedValue(0);
  const evansReadEntrance  = useSharedValue(0);

  // Track whether we have ever shown results (so loading container
  // only does its entrance animation once)
  const hasShownLoading = useRef(false);

  // Reset active index when activeResult changes (new scan)
  useEffect(() => {
    setActiveIndex(0);
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

      // 4. Pillar 3C — section stagger. Market Depth lands 80ms after
      //    the deck starts entering, Evan's Read lands 150ms after.
      //    Tiny 6–8px upward drift + opacity-only. The translateY runs
      //    against the page's solid black background and the sections
      //    have no background of their own, so the entrance reads as
      //    the section "rising into place" without any flicker — same
      //    safety bet as the verdict's opacity-only entrance.
      depthEntrance.value     = 0;
      evansReadEntrance.value = 0;
      depthEntrance.value     = withDelay(700, withTiming(1, { duration: 260, easing: panthere }));
      evansReadEntrance.value = withDelay(770, withTiming(1, { duration: 280, easing: panthere }));
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

  // Pillar 3C — Market Depth / rail entrance. Opacity + 6px upward
  // drift. translateY uses `interpolate` with Extrapolation.CLAMP so a
  // stale value at the boundary can never push the section past 0
  // (the rest position). When the animation settles to value=1, the
  // style resolves to opacity=1, translateY=0 and stays there — no
  // perpetual recomputation since the SharedValue stops mutating.
  const depthAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(depthEntrance.value, [0, 1], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(depthEntrance.value, [0, 1], [6, 0], Extrapolation.CLAMP) },
    ],
  }));

  // Pillar 3C — Evan's Read entrance. 8px upward drift (slightly
  // deeper than depth to read as "settling in after" rather than
  // "appearing with"). Same safety pattern.
  const evansReadAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(evansReadEntrance.value, [0, 1], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(evansReadEntrance.value, [0, 1], [8, 0], Extrapolation.CLAMP) },
    ],
  }));

  // Pillar 2 — single sync path. Every active-listing change (swipe
  // landing, rail tap, Market Depth row tap, controlled-snap rebound)
  // funnels through here, so the deck + spotlight + dock primary card
  // can never drift. CardDeck fires this via onSnapToIndex from its
  // velocity-aware handleScrollEndDrag, which means the spotlight moves
  // the same frame the deck visually centers — no momentum delay.
  const handleSnap = useCallback((idx: number) => {
    if (!Number.isInteger(idx) || idx < 0) return;
    setActiveIndex(idx);
  }, []);

  const handleRailSelect = useCallback((idx: number) => {
    if (!Number.isInteger(idx) || idx < 0) return;
    setActiveIndex(idx);
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

  // Pillar 2 — `selectedIndex` is now just an alias for the single
  // `activeIndex` source of truth. The CardDeck consumes it as a
  // controlled prop; the Market Depth + rail use it for the spotlight.
  // Whichever surface fires onSnapToIndex / onSelect first, every other
  // surface re-renders against the same value in the same React tick.
  const selectedIndex = activeIndex;

  const currentCard = allMarketCards[activeIndex] ?? activeResult;
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
                  not a search results page.
                  Pillar 3C — both sections wrapped in entrance Reanimated
                  views so they stagger into place after the deck instead
                  of appearing all-at-once. Pure transform + opacity, no
                  layout mutation, no scale, no perpetual loop. */}
              <Reanimated.View
                style={depthAnimStyle as any}
                renderToHardwareTextureAndroid={IS_ANDROID}
                shouldRasterizeIOS={!IS_ANDROID}
              >
                <BestMarketMatchesRail
                  cards={allMarketCards}
                  selectedIndex={selectedIndex}
                  onSelect={handleRailSelect}
                  listingsChecked={listingsChecked}
                  marketStats={marketStats}
                />
              </Reanimated.View>

              <Reanimated.View
                style={evansReadAnimStyle as any}
                renderToHardwareTextureAndroid={IS_ANDROID}
                shouldRasterizeIOS={!IS_ANDROID}
              >
                <EvansReadBlock read={evansRead} />
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
  // Pillar 2.1 — HOLD copy refined to read cautious but decisive. Prior
  // wording ("resale signal isn't strong enough to firmly recommend
  // passing") whipsawed between BUY and PASS and left the user unsure
  // what to actually do. New wording names the risk clearly ("price risk
  // is elevated" / "tracks the market" / "below market") AND tells the
  // user the call is calm-caution, not indecision.
  if (upstreamHold) {
    if (scanned != null && avg != null) {
      const diffPct = ((scanned - avg) / avg) * 100;
      if (Math.abs(diffPct) < 7) {
        return "Price tracks the market — no clear edge in either direction. Treat this as caution, not conviction.";
      }
      if (diffPct > 0) {
        return "Price risk is elevated, and the evidence is too mixed for a confident call. Treat this as caution.";
      }
      // diffPct < 0 — below market but HOLD
      if (cheaperPct != null && cheaperPct >= 15) {
        return "Strong discount on paper, but the resale data isn't deep enough to lock in the call.";
      }
      return "Below market, but the comp spread is wide — the discount may not be as real as it looks.";
    }
    return "Market pricing is inconsistent across comps. Wait for cleaner signal before committing.";
  }
  return "Signal is thin — gather one more comp before committing.";
}

// Pillar 2 — Verdict Instrument. Replaces the prior thin slab with a
// premium signal capsule that owns its verdict's semantic tone. The card
// has three layered glows (outer halo, rim ring, accent line) per kind so
// BUY feels emerald + restrained, HOLD feels icy/silvery, PASS feels ember.
// Above-market deltas render in the cautionary tone regardless of verdict
// so the user never reads an above-market state as celebration.
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
  const kind = verdictKind(verdictCopy.word);
  const tone = VERDICT_TONE[kind];

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

  // Headline dollar delta. delta = scanned − market, so delta > 0 means the
  // item costs MORE than market (overpaying) — that must never render with a
  // "+" (which reads as profit). We use buyer-benefit polarity: below market is
  // a saving (+, amber→green underMkt tone), above market is a cost (−, warm
  // amber aboveMkt tone). Above-market is caution on every verdict because the
  // user is asking "should I buy" and overpaying is a risk regardless of math.
  let headline: { sign: string; amount: string; tone: string } | null = null;
  if (verdictNumbers.delta != null) {
    const dollarStr = fmtMoney(Math.abs(verdictNumbers.delta));
    if (verdictNumbers.delta < 0) {
      // Under market → you save → positive for the buyer.
      headline = { sign: "+", amount: dollarStr, tone: tone.underMkt };
    } else if (verdictNumbers.delta > 0) {
      // Above market → you overpay → a cost, never profit.
      headline = { sign: "−", amount: dollarStr, tone: tone.aboveMkt };
    } else {
      headline = { sign: "", amount: dollarStr, tone: C.text2 };
    }
  }

  let directionLine = "";
  let directionTone: string = SIGNAL.textLabel;
  if (verdictNumbers.deltaPct != null) {
    const pct = Math.round(Math.abs(verdictNumbers.deltaPct));
    if (verdictNumbers.deltaPct < -2) {
      directionLine = `${pct}% UNDER MARKET`;
      directionTone = tone.underMkt;
    } else if (verdictNumbers.deltaPct > 2) {
      directionLine = `${pct}% ABOVE MARKET`;
      directionTone = tone.aboveMkt;
    } else {
      directionLine = "MATCHES MARKET";
    }
    if (kind === "PASS" && directionLine.includes("UNDER MARKET")) {
      directionLine = "NOT ENOUGH EDGE";
      directionTone = tone.dim;
    }
  }

  // Sequenced opacity-only entrance — matches the rest of the screen's
  // text-glyph-safe reveal policy (no transforms on text).
  const cardOpacity = useSharedValue(0);
  const numbersOpacity = useSharedValue(0);
  const sentenceOpacity = useSharedValue(0);
  // Pillar 3C — one-shot luminous sweep across the verdict capsule.
  // sweepProgress goes 0 → 1 once per fresh activeResult; the sweep
  // renders an absolutely-positioned `pointerEvents: none` slab that
  // translateX-es across the card from off-left to off-right, opacity
  // peaking at 0.5 and feathering to 0 at the edges. Card has
  // `overflow: hidden` so the slab is clipped to the capsule. No
  // perpetual loop — when the timing finishes, the slab sits off-screen
  // and the worklet stops. Same one-shot pattern the existing
  // BadgeShimmer in ResultCard uses on label badges.
  const sweepProgress = useSharedValue(0);
  useEffect(() => {
    cardOpacity.value = 0;
    numbersOpacity.value = 0;
    sentenceOpacity.value = 0;
    sweepProgress.value = 0;
    cardOpacity.value = withTiming(1, { duration: 320, easing: panthere });
    numbersOpacity.value = withDelay(180, withTiming(1, { duration: 280, easing: panthere }));
    sentenceOpacity.value = withDelay(360, withTiming(1, { duration: 280, easing: panthere }));
    // Sweep waits until the card is fully visible, then runs once.
    sweepProgress.value = withDelay(440, withTiming(1, { duration: 600, easing: Easing.inOut(Easing.cubic) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeResult]);
  const cardStyle = useAnimatedStyle(() => ({ opacity: cardOpacity.value }));
  const numbersStyle = useAnimatedStyle(() => ({ opacity: numbersOpacity.value }));
  const sentenceStyle = useAnimatedStyle(() => ({ opacity: sentenceOpacity.value }));
  const sweepStyle = useAnimatedStyle(() => ({
    // translateX: -160 → screen width-ish. The card width on iPhone 14
    // is roughly 360pt; we sweep from off-left (-160) to off-right
    // (+440) so the band fully crosses regardless of card width.
    transform: [
      { translateX: interpolate(sweepProgress.value, [0, 1], [-160, 440], Extrapolation.CLAMP) },
      { rotate: "8deg" },
    ] as any,
    // Triangle opacity envelope: 0 → 0.5 → 0 across the sweep so the
    // band feathers in and out cleanly. Settles at 0.
    opacity: interpolate(
      sweepProgress.value,
      [0, 0.15, 0.5, 0.85, 1],
      [0, 0.32, 0.5, 0.18, 0],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <View style={compactVerdictStyles.outer}>
      <Reanimated.View
        style={[
          compactVerdictStyles.card,
          { borderColor: tone.border },
          cardStyle as any,
        ]}
        renderToHardwareTextureAndroid={IS_ANDROID}
        shouldRasterizeIOS={!IS_ANDROID}
      >
        {/* Layered semantic glow — outer halo + rim ring + accent line.
            All pointerEvents: none so they never block taps. */}
        <View
          pointerEvents="none"
          style={[compactVerdictStyles.haloOuter, { backgroundColor: tone.halo }]}
        />
        <View
          pointerEvents="none"
          style={[compactVerdictStyles.haloRim, { backgroundColor: tone.haloRim }]}
        />
        <View
          pointerEvents="none"
          style={[compactVerdictStyles.accentLine, { backgroundColor: tone.accent }]}
        />
        <View pointerEvents="none" style={compactVerdictStyles.topHighlight} />
        {/* Pillar 3C — one-shot luminous sweep. Absolute, clipped by
            the card's overflow:hidden, never blocks gestures. Runs once
            per fresh scan ~440ms after the card opacity-fade starts,
            takes ~600ms to cross, then sits off-screen with opacity 0. */}
        <Reanimated.View
          pointerEvents="none"
          style={[compactVerdictStyles.sweep, sweepStyle as any]}
        />

        {/* Verdict word + reason title — premium stamp with semantic tone. */}
        <View style={compactVerdictStyles.headerRow}>
          <View style={compactVerdictStyles.wordStack}>
            <Text
              allowFontScaling={false}
              style={[compactVerdictStyles.word, { color: tone.word }]}
            >
              {/* Display label only — tone/kind still derive from canonical word above. */}
              {verdictCopy.displayWord ?? verdictCopy.word}
            </Text>
            <View style={[compactVerdictStyles.wordUnderline, { backgroundColor: tone.accent }]} />
          </View>
          <Text
            allowFontScaling={false}
            numberOfLines={2}
            style={compactVerdictStyles.reasonTitle}
          >
            {verdictCopy.title}
          </Text>
        </View>

        {/* Main delta number + direction caption — the screen's primary
            number eye-stop. Caution coloring on above-market regardless
            of verdict prevents misreading "above" as profit. */}
        {headline ? (
          <Reanimated.View
            style={[compactVerdictStyles.dollarRow, numbersStyle as any]}
            renderToHardwareTextureAndroid={IS_ANDROID}
            shouldRasterizeIOS={!IS_ANDROID}
          >
            <Text allowFontScaling={false} style={[compactVerdictStyles.dollar, { color: headline.tone }]}>
              <Text style={[compactVerdictStyles.dollarSign, { color: headline.tone }]}>
                {headline.sign}
              </Text>
              {headline.amount}
            </Text>
            {directionLine ? (
              <View style={compactVerdictStyles.directionWrap}>
                <Text
                  allowFontScaling={false}
                  style={[compactVerdictStyles.direction, { color: directionTone }]}
                >
                  {directionLine}
                </Text>
              </View>
            ) : null}
          </Reanimated.View>
        ) : null}

        {/* Cost / Market split — premium label + value with hairline divider. */}
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
            {verdictNumbers.cost != null && verdictNumbers.market != null ? (
              <View style={compactVerdictStyles.stripDivider} />
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

        {/* One-sentence explanation — body copy at readable contrast. */}
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
  // Pillar 2 — verdict signal instrument. The card has real weight (premium
  // glass surface + semantic border + layered glow halo) so the verdict
  // reads as a designed instrument, not a thin status slab. Spacing is
  // generous but the overall footprint stays disciplined (~120-145pt) so
  // the verdict, card, and dock all fit on iPhone without overlap.
  outer: {
    paddingHorizontal: SP.lg,
    paddingTop: SP.sm,
    paddingBottom: 0,
  },
  card: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 13,
    borderRadius: R.xl,
    backgroundColor: "rgba(14,14,16,0.55)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)",
    overflow: "hidden",
  },
  // Outer halo — wide soft puddle behind the word, semantic-toned.
  haloOuter: {
    position: "absolute",
    top: -28,
    left: -40,
    right: -40,
    height: 120,
    borderRadius: 80,
    opacity: 1,
  },
  // Rim ring — tighter band tucked under the word for the "ring of light"
  // signature without making the card look neon.
  // Pillar 2.1 — top: 6 → 11 to optically center the verdict word inside
  // the visible rim capsule. At fontSize 22 / lineHeight 22 the letter's
  // cap-band visually sits between y=17 and y=33 in card coords; the rim
  // centered at top:11/height:30 now visually wraps the letter with equal
  // top/bottom breathing room (was ~13px gap above, ~3px below — the
  // "HOLD looks low in its capsule" feeling the user flagged).
  haloRim: {
    position: "absolute",
    top: 11,
    left: -10,
    width: 160,
    height: 30,
    borderRadius: 80,
    opacity: 0.9,
  },
  // Accent line — luminous hairline at the bottom edge of the card. Reads
  // as the verdict's "signature" stripe.
  accentLine: {
    position: "absolute",
    bottom: 0,
    left: 14,
    width: 36,
    height: 1.5,
    borderRadius: 1,
    opacity: 0.55,
  },
  topHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: SIGNAL.panelTopHighlight,
  },
  // Pillar 3C — diagonal luminous band for the one-shot reveal sweep.
  // Thin (60px wide) and slightly rotated so it reads as a moving
  // highlight across glass rather than a horizontal bar. Card's
  // overflow:hidden clips it; pointerEvents:none on the parent View
  // keeps it gesture-inert. White-on-translucent so it works against
  // all three verdict tone backgrounds (BUY emerald, HOLD silver,
  // PASS ember) without re-tinting.
  sweep: {
    position: "absolute",
    top: -40,
    bottom: -40,
    width: 60,
    left: 0,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SP.md,
  },
  // Pillar 2.2 — wordStack marginTop: 3 shifts the verdict word down so
  // it sits at the optical center of its rim capsule. The font's cap-band
  // (HOLD/BUY/PASS visual letter top→bottom) sat ~3px above the rim's
  // geometric center; this offset pulls the letter center onto the rim
  // center for equal top/bottom breathing room inside the gray capsule.
  wordStack: {
    alignItems: "flex-start",
    marginTop: 3,
  },
  word: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 2.4,
    // Pillar 2.1 — tighten the line box so the verdict word's cap-band
    // lines up cleanly with the optically-centered rim above. lineHeight
    // matching fontSize removes the ~4px extra-leading slop RN inherits
    // from the platform default and keeps the underline tucked close.
    lineHeight: 22,
  },
  wordUnderline: {
    width: 22,
    height: 2,
    borderRadius: 1,
    // Tightened lineHeight (22 was 26) eats 4px below the word baseline;
    // bumping the underline marginTop from 4 → 8 keeps the underline at
    // its original visible position relative to the rim/card content.
    marginTop: 8,
    opacity: 0.65,
  },
  reasonTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.66)",
    letterSpacing: 0.1,
    lineHeight: 16,
    // Pillar 2.1 — was 2; pushed to 6 so the subtitle's cap-band aligns
    // optically with the verdict word's center (subtitle paired-baseline
    // rather than clinging to the top of the row).
    marginTop: 6,
  },
  dollarRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: SP.sm,
  },
  dollar: {
    fontSize: 30,
    fontWeight: "900",
    color: C.text,
    letterSpacing: -0.8,
    lineHeight: 32,
  },
  dollarSign: {
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  directionWrap: {
    paddingBottom: 4,
  },
  direction: {
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1.6,
    color: SIGNAL.textLabel,
  },
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.md,
    marginTop: 10,
    paddingTop: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.07)",
  },
  stripCell: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 7,
  },
  stripDivider: {
    width: StyleSheet.hairlineWidth,
    height: 12,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  stripLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
    color: "rgba(255,255,255,0.34)",
  },
  stripValue: {
    fontSize: 13,
    fontWeight: "800",
    color: "rgba(255,255,255,0.85)",
    letterSpacing: -0.2,
  },
  sentence: {
    marginTop: 9,
    fontSize: 11.5,
    fontWeight: "500",
    color: "rgba(255,255,255,0.62)",
    lineHeight: 16,
    letterSpacing: 0.05,
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
// Pillar 2 — premium evidence ticker. Each stat is a glass chip with
// value above label (Bloomberg/Robinhood vocabulary). Value-only stats
// ("Signal only", "Wide spread") render as semantic-toned trust pills.
// Wrap-safe at every iPhone width: each chip is a discrete cell, so a
// long stat never pushes its neighbors off-screen.
function MarketEvidenceStrip({ stats }: { stats: EvidenceStripStat[] }) {
  if (!stats || stats.length === 0) return null;
  return (
    <View style={evidenceStripStyles.outer}>
      <View style={evidenceStripStyles.row}>
        {stats.map((s, i) => {
          const isLabelOnly = !s.value || s.value.length === 0;
          const toneChipStyle =
            s.tone === "warn"  ? evidenceStripStyles.chipWarn :
            s.tone === "good"  ? evidenceStripStyles.chipGood :
            s.tone === "muted" ? evidenceStripStyles.chipMuted :
            null;
          const toneValueStyle =
            s.tone === "warn"  ? evidenceStripStyles.valueWarn :
            s.tone === "good"  ? evidenceStripStyles.valueGood :
            s.tone === "muted" ? evidenceStripStyles.valueMuted :
            null;
          const toneLabelStyle =
            s.tone === "warn"  ? evidenceStripStyles.labelWarn :
            s.tone === "good"  ? evidenceStripStyles.labelGood :
            null;
          return (
            <View
              key={`${s.label}-${i}`}
              style={[evidenceStripStyles.chip, toneChipStyle]}
            >
              {isLabelOnly ? (
                <Text
                  allowFontScaling={false}
                  numberOfLines={1}
                  style={[evidenceStripStyles.labelOnly, toneLabelStyle]}
                >
                  {s.label}
                </Text>
              ) : (
                <View style={evidenceStripStyles.chipInner}>
                  <Text
                    allowFontScaling={false}
                    numberOfLines={1}
                    style={[evidenceStripStyles.value, toneValueStyle]}
                  >
                    {s.value}
                  </Text>
                  <Text
                    allowFontScaling={false}
                    numberOfLines={1}
                    style={[evidenceStripStyles.label, toneLabelStyle]}
                  >
                    {s.label}
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
// Pillar 2 — legacy single-sentence renderer removed; replaced by the
// chip-row ticker above which renders the same data set.
/* LEGACY_BODY_REMOVED_START
function _legacyBodyRemoved(stats: any[]) {
  return stats.map((s: any) => {
    const valueStyle = [];
    const labelStyle = [];
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
LEGACY_BODY_REMOVED_END */

const evidenceStripStyles = StyleSheet.create({
  // Pillar 2 — premium ticker readout. Tight breathing space between the
  // verdict and the card deck below; chips wrap cleanly to two rows on
  // dense scans without truncating labels. Each chip is a discrete glass
  // cell — value over label — so eye-flow lands on the numbers first.
  // Pillar 2.1 — paddingBottom 4 → 12 to add visible breathing space
  // between the ticker and the main card below (the user flagged the
  // card was sitting too close / too high relative to the ticker).
  // Pillar 2.3 — 24 → 32. Screenshots still showed the deck sitting
  // slightly attached to the chips at their bottom edge. +8px completes
  // the three-layer breathing rhythm: Verdict / Chips / Deck each own
  // their own visual zone.
  outer: {
    paddingHorizontal: SP.lg,
    paddingTop: 10,
    paddingBottom: 32,
  },
  // Pillar 2.1 — justifyContent: "center" so the chip cluster reads as an
  // optically centered ticker rather than a left-stacked dev strip. When
  // chips wrap, each row centers within its own width — looks balanced
  // at every iPhone width.
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    rowGap: 6,
    justifyContent: "center",
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: R.sm,
    backgroundColor: SIGNAL.chipBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SIGNAL.chipBorder,
  },
  chipInner: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 5,
  },
  chipGood: {
    backgroundColor: SIGNAL.chipBgGood,
    borderColor: SIGNAL.chipBorderGood,
  },
  chipWarn: {
    backgroundColor: SIGNAL.chipBgWarn,
    borderColor: SIGNAL.chipBorderWarn,
  },
  chipMuted: {
    backgroundColor: SIGNAL.chipBg,
    borderColor: "rgba(255,255,255,0.045)",
  },
  value: {
    fontSize: 12.5,
    fontWeight: "900",
    color: SIGNAL.textPrimary,
    letterSpacing: -0.1,
  },
  valueGood:  { color: SIGNAL.textGood },
  valueWarn:  { color: SIGNAL.textWarn },
  valueMuted: { color: "rgba(255,255,255,0.66)" },
  label: {
    fontSize: 10,
    fontWeight: "700",
    color: SIGNAL.textLabel,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  labelGood: { color: SIGNAL.textGood, opacity: 0.78 },
  labelWarn: { color: SIGNAL.textWarn, opacity: 0.86 },
  labelOnly: {
    fontSize: 10.5,
    fontWeight: "800",
    color: SIGNAL.textLabel,
    letterSpacing: 0.6,
    textTransform: "uppercase",
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
  // Pillar 1.8.6 — outer marginTop SP.md (12) → 22 so the "BEST MARKET
  // MATCHES" header has room to breathe under the pager. Previously the
  // header sat ~12px below the dots and read as visually attached to
  // the deck; the new 22px gap makes it land as a discrete section.
  outer: {
    marginTop: 22,
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
  // Pillar 2 — rail mini-card aligned with the SIGNAL token vocabulary.
  // Active state uses the same row-spotlight palette as Market Depth so
  // the two surfaces feel like one connected market view.
  mini: {
    width: 134,
    backgroundColor: SIGNAL.rowBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SIGNAL.rowBorder,
    borderRadius: R.md,
    padding: 10,
  },
  miniActive: {
    backgroundColor: SIGNAL.rowBgActive,
    borderColor: SIGNAL.rowBorderActive,
    borderWidth: 1,
  },
  miniThumbWrap: {
    width: "100%",
    height: 74,
    borderRadius: R.sm,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
    marginBottom: 6,
  },
  miniThumb: { width: "100%", height: "100%" },
  miniThumbPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  miniPrice: {
    fontSize: 15.5,
    fontWeight: "900",
    color: SIGNAL.textPrimary,
    letterSpacing: -0.25,
  },
  miniSource: {
    fontSize: 10,
    fontWeight: "700",
    color: SIGNAL.textLabel,
    marginTop: 1,
    letterSpacing: 0.15,
  },
  miniSubtitle: {
    fontSize: 9,
    fontWeight: "800",
    marginTop: 5,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  miniSubVerified: { color: SIGNAL.textGood },
  miniSubPricing:  { color: SIGNAL.textWarn },
  miniSubDefault:  { color: SIGNAL.textLabel },
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
  // Pillar 2.1 — when verifiedN === 0 we drop the harsh "0 verified" chip
  // entirely. The "Signal only" pill (warn tone) on the next line already
  // tells the same trust story honestly, without the screaming zero.
  // When verifiedN > 0, we surface it positively ("3 verified", good tone).
  const chips: { label: string; tone: "default" | "warn" | "good" | "muted" }[] = [];
  if (filtered > 0) {
    chips.push({
      label: `${filtered} filtered out`,
      tone: "muted",
    });
  }
  if (verifiedN > 0) {
    chips.push({
      label: `${verifiedN} verified`,
      tone: "good",
    });
  }
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

      {/* Pillar 2 — premium market tape. Each strong card renders as a
          glass row with thumbnail · price · source · badge. The active
          row gets a brighter fill + border + ambient glow so swiping the
          deck instantly spotlights the matching depth row. Tapping any
          row routes through onSelect (same handleSnap path) so the deck
          updates in the same React tick. */}
      {strongN > 1 ? (
        <View style={depthStyles.evidenceRow}>
          {cards.slice(0, Math.min(6, cards.length)).map((card, i) => {
            const idx = i;
            const isActive = idx === selectedIndex;
            // Pillar 2.1 — short form ("Verified" / "Signal" / "AI") so a
            // stack of three rows doesn't read as "MARKET SIGNAL · MARKET
            // SIGNAL · MARKET SIGNAL" (semantic fatigue). The badge tone
            // (good/warn/default) still carries the trust state.
            const labelText = evidenceLabelShort(card);
            const verified = isVerifiedListing(card);
            const signalOnly = isPricingSignal(card);
            const price = Number.isFinite(Number(card.price))
              ? Number(card.price)
              : null;
            const source =
              (typeof card.store === "string" && card.store) ||
              (typeof card.source === "string" && card.source) ||
              "Marketplace";
            return (
              <PressableScale
                key={`depth-mini-${idx}`}
                onPress={() => onSelect(idx)}
                style={[depthStyles.miniRow, isActive && depthStyles.miniRowActive]}
                scale={0.98}
                haptic
              >
                {isActive ? (
                  <View pointerEvents="none" style={depthStyles.miniRowGlow} />
                ) : null}
                {card.image ? (
                  <Image
                    source={{ uri: String(card.image) }}
                    style={depthStyles.miniRowThumb}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={depthStyles.miniRowThumbPlaceholder}>
                    <Ionicons name="image-outline" size={14} color="rgba(255,255,255,0.28)" />
                  </View>
                )}
                <View style={depthStyles.miniRowBody}>
                  <Text
                    style={[depthStyles.miniRowPrice, isActive && depthStyles.miniRowPriceActive]}
                    allowFontScaling={false}
                    numberOfLines={1}
                  >
                    {price != null ? fmtMoney(price) : "—"}
                  </Text>
                  <Text
                    style={depthStyles.miniRowSource}
                    allowFontScaling={false}
                    numberOfLines={1}
                  >
                    {source}
                  </Text>
                </View>
                <View
                  style={[
                    depthStyles.miniRowBadge,
                    verified && depthStyles.miniRowBadgeGood,
                    signalOnly && depthStyles.miniRowBadgeWarn,
                  ]}
                >
                  <Text
                    style={[
                      depthStyles.miniRowBadgeText,
                      verified && depthStyles.miniRowBadgeTextGood,
                      signalOnly && depthStyles.miniRowBadgeTextWarn,
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
  // Pillar 2 — Market Depth panel. Tighter margin alignment with verdict
  // + ticker so the screen reads as one designed system rather than a
  // stack of one-off sections.
  // Pillar 2.3 — 14 → 20. The ticker padding bump (+8) pushed the deck
  // down, so Market Depth had gained effective tightness from above.
  // Adding 6px here restores the intended "intentionally introduced"
  // rhythm so the section header feels like it breathes into view rather
  // than snapping directly against the pager dots.
  outer: {
    marginTop: 20,
    marginHorizontal: SP.lg,
    paddingTop: SP.sm,
    paddingBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 10,
  },
  header: {
    fontSize: 11,
    fontWeight: "900",
    color: "rgba(255,255,255,0.86)",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  sentence: {
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(255,255,255,0.92)",
    lineHeight: 20,
    letterSpacing: -0.1,
  },
  // Pillar 2.1 — keep depth chips left-anchored under the sentence header.
  // The header text "3 strong matches from 13 listings checked." is itself
  // left-aligned, so the chips reading like a follow-up beat under it
  // (left edge anchored) is the correct optical pair. Centering here would
  // make the chips feel detached from the sentence.
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    rowGap: 6,
    marginTop: 12,
  },
  chip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: SIGNAL.chipBg,
    borderRadius: R.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SIGNAL.chipBorder,
  },
  chipWarn: {
    backgroundColor: SIGNAL.chipBgWarn,
    borderColor: SIGNAL.chipBorderWarn,
  },
  chipGood: {
    backgroundColor: SIGNAL.chipBgGood,
    borderColor: SIGNAL.chipBorderGood,
  },
  chipText: {
    fontSize: 10.5,
    fontWeight: "800",
    color: SIGNAL.textLabel,
    letterSpacing: 0.4,
  },
  chipTextWarn: { color: SIGNAL.textWarn },
  chipTextGood: { color: SIGNAL.textGood },
  evidenceRow: {
    flexDirection: "column",
    gap: 8,
    marginTop: 14,
  },
  // Pillar 2 — premium market tape row. Each row is a glass pill with a
  // 36px thumbnail + price/source stack + tone-aware badge. Selected row
  // gets a wider border + brighter fill + soft inner glow plate so the
  // spotlight is unmistakable against the inactive rows. Inactive rows
  // are intentionally restrained — the eye locks on the active one.
  miniRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: SIGNAL.rowBg,
    borderRadius: R.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SIGNAL.rowBorder,
    overflow: "hidden",
  },
  miniRowActive: {
    backgroundColor: SIGNAL.rowBgActive,
    borderColor: SIGNAL.rowBorderActive,
    borderWidth: 1,
  },
  // Pillar 2 — active-row spotlight. Soft inner light that sits behind
  // the content so the row feels lit-from-within rather than outlined.
  // Sized to span the row without bleeding outside the rounded border.
  miniRowGlow: {
    position: "absolute",
    top: -8,
    left: -8,
    right: -8,
    bottom: -8,
    backgroundColor: SIGNAL.rowGlowActive,
    opacity: 0.55,
  },
  miniRowThumb: {
    width: 36,
    height: 36,
    borderRadius: R.sm,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  miniRowThumbPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: R.sm,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  miniRowBody: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "center",
    gap: 1,
  },
  miniRowPrice: {
    fontSize: 14.5,
    fontWeight: "900",
    color: SIGNAL.textPrimary,
    letterSpacing: -0.2,
  },
  miniRowPriceActive: {
    color: "#ffffff",
  },
  miniRowSource: {
    fontSize: 10.5,
    fontWeight: "700",
    color: SIGNAL.textLabel,
    letterSpacing: 0.15,
  },
  // Pillar 2 — badge replaces the inline uppercase label. Verified → soft
  // emerald pill; pricing signal → restrained amber; default → muted glass.
  miniRowBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: R.pill,
    backgroundColor: SIGNAL.chipBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SIGNAL.chipBorder,
  },
  miniRowBadgeGood: {
    backgroundColor: SIGNAL.chipBgGood,
    borderColor: SIGNAL.chipBorderGood,
  },
  miniRowBadgeWarn: {
    backgroundColor: SIGNAL.chipBgWarn,
    borderColor: SIGNAL.chipBorderWarn,
  },
  miniRowBadgeText: {
    fontSize: 9.5,
    fontWeight: "900",
    color: SIGNAL.textLabel,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  miniRowBadgeTextGood: { color: SIGNAL.textGood },
  miniRowBadgeTextWarn: { color: SIGNAL.textWarn },
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
// Pillar 2 — Evan's Read premium AI panel. Glass surface + sparkle icon
// header + readable explanation + semantic-toned chips. Chips that name
// trust signals ("Verified listings found") read as good; chips that
// name market weakness ("Pricing signal only", "Thin market", "Weak
// resale") read as warning. Chips that just describe state ("Mixed
// market", "Wide spread") stay muted. The language never overpromises —
// weak evidence still reads as weak.
const _EVANS_READ_GOOD_RE = /verified|hidden gem|strong/i;
// Pillar 2.1 — also match "signal-only" (hyphenated) and bare "pricing" /
// "signal" tokens so the new "Signal-only evidence" / "Pricing signal" /
// "Pricing-signal evidence" chip variants still resolve to warn tone.
const _EVANS_READ_WARN_RE =
  /pricing.?signal|signal.?only|pricing signal|thin|low confidence|low direct|weak|wide spread|risky/i;
function _evansChipTone(label: string): "good" | "warn" | "muted" {
  if (_EVANS_READ_GOOD_RE.test(label)) return "good";
  if (_EVANS_READ_WARN_RE.test(label)) return "warn";
  return "muted";
}

function EvansReadBlock({ read }: { read: EvansReadData }) {
  if (!read || !read.sentence) return null;
  return (
    <View style={evansReadStyles.outer}>
      <View style={evansReadStyles.panel}>
        <View pointerEvents="none" style={evansReadStyles.panelTopHighlight} />
        <View style={evansReadStyles.headerRow}>
          <View style={evansReadStyles.iconWrap}>
            <Ionicons name="sparkles" size={11} color="rgba(180,210,255,0.92)" />
          </View>
          <Text style={evansReadStyles.header} allowFontScaling={false}>
            Evan&apos;s Read
          </Text>
        </View>
        <Text
          style={evansReadStyles.sentence}
          allowFontScaling={false}
          numberOfLines={4}
          ellipsizeMode="tail"
        >
          {read.sentence}
        </Text>
        {read.chips.length > 0 ? (
          <View style={evansReadStyles.chipRow}>
            {read.chips.map((c, i) => {
              const tone = _evansChipTone(c);
              return (
                <View
                  key={`chip-${i}-${c}`}
                  style={[
                    evansReadStyles.chip,
                    tone === "good" && evansReadStyles.chipGood,
                    tone === "warn" && evansReadStyles.chipWarn,
                  ]}
                >
                  <Text
                    style={[
                      evansReadStyles.chipText,
                      tone === "good" && evansReadStyles.chipTextGood,
                      tone === "warn" && evansReadStyles.chipTextWarn,
                    ]}
                    allowFontScaling={false}
                    numberOfLines={1}
                  >
                    {c}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const evansReadStyles = StyleSheet.create({
  // Pillar 2 — Evan's Read is now a glass intelligence panel rather than
  // a free-floating text block under a hairline rule. Same content,
  // higher production value.
  outer: {
    marginTop: 18,
    marginHorizontal: SP.lg,
    paddingBottom: SP.xs,
  },
  panel: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: "rgba(14,14,18,0.62)",
    borderRadius: R.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SIGNAL.panelBorder,
    overflow: "hidden",
  },
  panelTopHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: SIGNAL.panelTopHighlight,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 7,
  },
  iconWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(140,180,220,0.10)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(180,210,240,0.20)",
  },
  header: {
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 1.6,
    color: "rgba(255,255,255,0.86)",
    textTransform: "uppercase",
  },
  sentence: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.84)",
    lineHeight: 18.5,
    letterSpacing: 0.05,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    rowGap: 6,
    marginTop: 11,
  },
  chip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: SIGNAL.chipBg,
    borderRadius: R.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SIGNAL.chipBorder,
  },
  chipGood: {
    backgroundColor: SIGNAL.chipBgGood,
    borderColor: SIGNAL.chipBorderGood,
  },
  chipWarn: {
    backgroundColor: SIGNAL.chipBgWarn,
    borderColor: SIGNAL.chipBorderWarn,
  },
  chipText: {
    fontSize: 10,
    fontWeight: "800",
    color: SIGNAL.textLabel,
    letterSpacing: 0.3,
  },
  chipTextGood: { color: SIGNAL.textGood },
  chipTextWarn: { color: SIGNAL.textWarn },
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
