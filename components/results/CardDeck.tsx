/**
 * CardDeck — horizontal snap-paged carousel of result cards.
 *
 * Previously this was a Reanimated Gesture.Pan deck with worklets,
 * runOnJS hops, and withSpring driving a dynamic activeIndex on the UI
 * thread. That setup repeatedly produced hard native crashes on real
 * iPhones whenever the deck rebuilt mid-gesture (new scan, results
 * cleared, etc.) — the worklet would resolve withSpring against a stale
 * upper bound and Math.round(NaN) would slip into a downstream array
 * read. The TestFlight-critical fix is to stop driving the snap from a
 * worklet entirely.
 *
 * This implementation:
 *  - Uses RNAnimated.ScrollView with snapToInterval=CARD.slotWidth and
 *    decelerationRate="fast" for native snap behavior (zero worklets).
 *  - onMomentumScrollEnd validates the resolved index as an integer in
 *    [0, cardsRef.current.length) before propagating; any miss logs
 *    CARD_SWIPE_SAFE_BLOCKED and short-circuits.
 *  - Subtle native-driver opacity dim on side cards (interpolate against
 *    scrollX) for premium depth without scale transforms (no raster blur).
 *  - Static peek via contentContainerStyle padding — adjacent cards
 *    always sit at ~24px from the screen edge so the carousel reads as
 *    a stack even when not scrolling.
 *  - Pagination dots track snappedIndex (plain JS state), no worklets.
 *
 * Removed: long-swipe-right-to-watchlist gesture. It was a niche path
 * and added another runOnJS callback that wasn't worth the surface area.
 * Heart button on the card itself still toggles watchlist.
 */
import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated as RNAnimated,
  Easing as RNEasing,
  Platform,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
// Haptics import removed — snap-on-swipe is silent now (carousel
// movement is passive, not a confirmation moment).
import { C, SP, R, CARD, SCREEN, EASE_PANTHERE } from "../design/DS";
import { ResultCard, CardData } from "./ResultCard";
import { MarketCard } from "./marketIntel";

const IS_ANDROID = Platform.OS === "android";
const panthereRN = RNEasing.bezier(EASE_PANTHERE[0], EASE_PANTHERE[1], EASE_PANTHERE[2], EASE_PANTHERE[3]);

// Snap interval = card width + gap, so each "page" snaps to the next card's
// left edge. CARD.slotWidth is already (width + gap) from DS.ts.
const SNAP = CARD.slotWidth;
// Native pixel gap between adjacent cards in the ScrollView row.
const GAP = Math.max(0, CARD.slotWidth - CARD.width);

interface CardDeckProps {
  activeResult: any;
  results: any[];
  /**
   * Pillar 1: pre-built card array. When provided, the deck uses it
   * directly and skips its internal dedup/junk-filter pass. ResultsContent
   * uses this to share the same canonical array with the Best Market
   * Matches rail. When omitted, the deck falls back to the legacy
   * activeResult + results derivation so older call sites still work.
   */
  cards?: MarketCard[];
  /**
   * Pillar 1: controlled snap target. When set and different from the
   * current snapped index, the deck programmatically scrolls to that
   * index without disturbing user swipe. Used by the rail to bring a
   * tapped mini-card to the front.
   */
  selectedIndex?: number;
  /** Watchlist query keys for heart state */
  watchlistQueries?: string[];
  onPressCard?: (itemOrUrl: any, title: string) => void;
  onZoomImage?: (uri: string) => void;
  onSnapToIndex?: (index: number) => void;
  onToggleWatchlist?: (card: CardData) => void;
  onShare?: (card: CardData) => void;
  onVaultSave?: (entry: any) => void;
  isNet?: boolean;
}

// Snap haptic removed — the deck used to buzz on every momentum-scroll
// end. Carousel swiping is passive browsing, not a confirmation event,
// so the buzz read as arcade noise. Silent now; the visual snap +
// scale animation already telegraphs "we landed on a new card."
const snapHaptic = () => {};

// ─── Main CardDeck ────────────────────────────────────────────────────────────
export function CardDeck({
  activeResult,
  results,
  cards: cardsOverride,
  selectedIndex,
  watchlistQueries = [],
  onPressCard,
  onZoomImage,
  onSnapToIndex,
  onToggleWatchlist,
  onShare,
  onVaultSave,
  isNet,
}: CardDeckProps) {

  const _scannedPrice = Number.isFinite(Number(activeResult?.scannedPrice))
    ? Number(activeResult.scannedPrice)
    : null;

  const cards: CardData[] = React.useMemo(() => {
    // Pillar 1 override: parent provides the canonical card array.
    // marketIntel.buildAllMarketCards has already deduped, junk-filtered,
    // and per-store-capped — trust it and skip the internal pass below
    // so deck + rail stay in sync. Cap at 8 to keep swipe + image budget
    // sane; the rail uses the same array and may show up to 7 minis.
    if (Array.isArray(cardsOverride) && cardsOverride.length > 0) {
      console.log("CARD_DECK_BUILD", {
        mode: "override",
        totalCards: Math.min(cardsOverride.length, 8),
      });
      return cardsOverride.slice(0, 8) as unknown as CardData[];
    }
    const heroCard: CardData = {
      itemName:         activeResult?.itemName,
      store:            activeResult?.store,
      price:            activeResult?.price,
      buyLink:          activeResult?.buyLink,
      image:            activeResult?.image,
      photoUri:         activeResult?.photoUri,
      scannedPrice:     activeResult?.scannedPrice,
      savedAmount:      activeResult?.savedAmount,
      cheaperPct:       activeResult?.cheaperPct,
      visionConfidence: activeResult?.visionConfidence,
      buyVerdict:       activeResult?.buyVerdict,
      buyScore:         activeResult?.buyScore,
      resaleVelocity:   activeResult?.resaleVelocity,
      historicalLow:    activeResult?.historicalLow,
      historicalHigh:   activeResult?.historicalHigh,
      avgMarket:        activeResult?.avgMarket,
      priceChartPoints: activeResult?.priceChartPoints ?? null,
      conditionLabel:   activeResult?.conditionLabel ?? activeResult?.visionIdentity?.condition ?? null,
      trendIntel:       activeResult?.trendIntel ?? null,
      seasonalFlip:     activeResult?.seasonalFlip ?? null,
      authenticityIntel: activeResult?.authenticityIntel ?? null,
      ebaySoldComps:    activeResult?.ebaySoldComps ?? null,
      localComps:       activeResult?.localComps ?? null,
      clickable:        activeResult?.clickable ?? null,
      evidenceQuality:  activeResult?.evidenceQuality ?? null,
      isVerifiedListing:     activeResult?.isVerifiedListing ?? null,
      isPricingEvidenceOnly: activeResult?.isPricingEvidenceOnly ?? null,
      directUrl:        activeResult?.directUrl ?? null,
    };

    // ── Aggressive client-side dedup + relevance filter ─────────────────────
    // Server occasionally returns near-duplicate listings (Amazon clones with
    // identical titles, same image hosted at multiple URLs, two SERP rows
    // pointing at the same product page). Each dupe wastes a card slot and
    // hurts perceived signal quality. The hero is the canonical entry; we
    // pull the rest of the corpus, normalize identity, drop matches against
    // the hero AND against previously-accepted alts, drop entries that
    // can't actually render (no image OR no price), then re-rank to favor
    // cheap-but-relevant listings ahead of premium anchors. We over-pull
    // up to 12 candidates so dedup attrition still leaves us ≥4 cards.
    const norm = (s: any): string => String(s ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    // Image-host identity. Amazon mirrors the same product photo at
    // m.media-amazon.com/images/I/<HASH>._SX...jpg and ..._SY...jpg etc.;
    // strip the size suffix so the dedup key matches across variants.
    const imageKey = (u: any): string => {
      const raw = String(u ?? "").trim().toLowerCase();
      if (!raw) return "";
      try {
        const m = raw.match(/([a-z0-9]{8,})\.(jpg|jpeg|png|webp)/i);
        return m ? m[1] : raw.split("?")[0];
      } catch { return raw; }
    };
    // Exact-title key. The prior 6-word prefix collapsed legitimately
    // different variants ("…Black Plastic Frame Orange Lens" vs
    // "…Tortoise Frame Orange Lens") into one card and starved the deck
    // of swipeable alternatives. Full normalized title dedups true
    // duplicates only — different products survive.
    const titleKey = (t: any): string => norm(t);

    const seenTitles = new Set<string>();
    const seenImages = new Set<string>();
    const heroTitleK = titleKey(heroCard.itemName);
    const heroImageK = imageKey(heroCard.image);
    if (heroTitleK) seenTitles.add(heroTitleK);
    if (heroImageK) seenImages.add(heroImageK);

    const anchorThreshold = _scannedPrice != null ? _scannedPrice * 2.5 : Infinity;

    // Pull from positions 1..16 — wider window since the looser dedup
    // accepts more candidates, so we want enough headroom to find 4 alts
    // even when the top-of-list has a couple of true duplicates.
    const rawAlts: CardData[] = (results || [])
      .slice(1, 17)
      .map((r: any) => ({
        itemName:   r?.itemName || r?.title,
        store:      r?.source   || r?.store,
        price:      r?.price    ?? r?.totalPrice,
        buyLink:    r?.buyLink  || r?.url,
        image:      r?.image    || r?.thumbnail,
        // Inherit the scan verdict so ResultCard can gate label badge intensity
        // (LOWEST/CHEAPER/HIDDEN GEM dim on HOLD/PASS, same as rarity chips).
        buyVerdict:           activeResult?.buyVerdict ?? null,
        clickable:            r?.clickable ?? null,
        evidenceQuality:      r?.evidenceQuality ?? null,
        isVerifiedListing:    r?.isVerifiedListing ?? null,
        isPricingEvidenceOnly: r?.isPricingEvidenceOnly ?? null,
        directUrl:            r?.directUrl ?? null,
      }));

    // Junk-title patterns. The server occasionally returns SERP filler
    // ("Sponsored", "Best Sellers in …", "See more results") plus listings
    // with hyper-aggressive marketing punctuation ("!!!!!!! HUGE DEAL"). One
    // junk card destroys trust in the whole deck, so we reject preemptively.
    const JUNK_TITLE = /^(sponsored|featured|advertisement|click here|see (price|more)|view ad|best sellers? in|results for|shop now)/i;
    const PUNCT_SPAM = /([!?$*])\1{4,}/; // 5+ in a row of same punctuation
    const JUNK_STORE = /sponsored|advertis|promoted|^ad\b/i;

    // Display-layer rejection counters — surfaced via CARD_DECK_BUILD so
    // we can confirm in logs whether we're starving the deck or the
    // server isn't returning enough valid alternatives.
    const rejectedReasons: Record<string, number> = {};
    const reject = (k: string) => { rejectedReasons[k] = (rejectedReasons[k] || 0) + 1; };

    const dedupedAlts: CardData[] = [];
    for (const alt of rawAlts) {
      const tk = titleKey(alt.itemName);
      const ik = imageKey(alt.image);
      const titleStr = String(alt.itemName ?? "").trim();
      const storeStr = String(alt.store ?? "").trim();
      const priceN = Number(alt.price);
      // Hard junk gates only — must render as a real product card.
      if (!alt.image)                              { reject("no_image");    continue; }
      if (!Number.isFinite(priceN) || priceN <= 0) { reject("bad_price");   continue; }
      // Title-length cutoff loosened from 8→5 so short legit titles like
      // "Ray-Ban RB3025" aren't filtered out. Anything truly empty fails
      // the norm() length check elsewhere.
      if (titleStr.length < 5)                     { reject("title_short"); continue; }
      if (JUNK_TITLE.test(titleStr))               { reject("title_junk");  continue; }
      if (PUNCT_SPAM.test(titleStr))               { reject("punct_spam");  continue; }
      if (storeStr && JUNK_STORE.test(storeStr))   { reject("store_junk");  continue; }
      // EXACT-match dedup. Either an exact title match or an exact image
      // identity match drops the row — true clones go, near-variants stay.
      if (tk && seenTitles.has(tk))                { reject("dup_title");   continue; }
      if (ik && seenImages.has(ik))                { reject("dup_image");   continue; }
      if (tk) seenTitles.add(tk);
      if (ik) seenImages.add(ik);
      dedupedAlts.push(alt);
      // Soft cap — keep 10 candidates for the re-rank step below.
      if (dedupedAlts.length >= 10) break;
    }

    // Re-rank: premium-anchor listings (price > 2.5× scannedPrice) go to
    // the tail, then sort the remainder by ascending price so the deck
    // leads with the cheapest credible matches. Equal-price ties break by
    // image presence (alread guaranteed), then by title length (shorter
    // = cleaner SEO title, usually a real listing not a placeholder).
    // Sort: premium anchors tail, then ascending price, then shorter title.
    const sorted = dedupedAlts.sort((a, b) => {
      const pa = Number(a.price ?? Infinity);
      const pb = Number(b.price ?? Infinity);
      const aIsPrem = pa > anchorThreshold;
      const bIsPrem = pb > anchorThreshold;
      if (aIsPrem !== bIsPrem) return aIsPrem ? 1 : -1;
      if (pa !== pb) return pa - pb;
      const la = String(a.itemName ?? "").length;
      const lb = String(b.itemName ?? "").length;
      return la - lb;
    });
    // Store diversity: cap same-source results at 2 so a single retailer
    // (e.g. 4 near-identical Amazon listings) can't flood the visible deck.
    // Anchors sorted to tail absorb any per-store cap hits first so the
    // cheapest distinct results lead the deck.
    const storeCount: Record<string, number> = {};
    const storeKey = (s: any): string =>
      norm(String(s || "other")).split(" ")[0] || "other";
    const alts = sorted.filter(a => {
      const sk = storeKey(a.store);
      if ((storeCount[sk] || 0) >= 2) return false;
      storeCount[sk] = (storeCount[sk] || 0) + 1;
      return true;
    }).slice(0, 4);

    console.log("CARD_DECK_BUILD", {
      rawCount: (results || []).length,
      validCount: dedupedAlts.length,
      pickedAlts: alts.length,
      totalCards: 1 + alts.length,
      rejectedReasons,
      hadHeroImage: !!heroCard.image,
    });

    return [heroCard, ...alts];
  }, [activeResult, results, _scannedPrice]);

  const cardCount  = cards.length;
  const altCount   = cardCount - 1;
  const heroPrice  = Number.isFinite(Number(cards[0]?.price)) ? Number(cards[0].price) : null;

  // Live ref so onMomentumScrollEnd can validate against the current cards
  // array even if the deck rebuilt between scroll start and end.
  const cardsRef = useRef(cards);
  useEffect(() => { cardsRef.current = cards; }, [cards]);

  const allPrices = cards.map((c) => Number(c.price ?? Infinity)).filter(Number.isFinite);
  const lowestPrice = allPrices.length ? Math.min(...allPrices) : null;

  // Mount guard for the snap-end callback — short-circuits if the deck
  // tore down while a momentum scroll was still in flight.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const [snappedIndex, setSnappedIndex] = useState(0);

  // Reset to first card when activeResult changes (new scan).
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    setSnappedIndex(0);
    // Defer to next tick so the ScrollView has its new children mounted.
    requestAnimationFrame(() => {
      try { scrollRef.current?.scrollTo({ x: 0, animated: false }); } catch {}
    });
  }, [activeResult]);

  // Pillar 1: controlled snap from the Best Market Matches rail.
  // When the parent updates selectedIndex (e.g. user tapped a mini card),
  // animate the deck to that index — but only when it differs from the
  // current snapped index so we never fight the user's own swipe.
  useEffect(() => {
    if (selectedIndex == null) return;
    if (!Number.isInteger(selectedIndex)) return;
    const live = cardsRef.current || [];
    if (selectedIndex < 0 || selectedIndex >= live.length) return;
    if (selectedIndex === snappedIndex) return;
    requestAnimationFrame(() => {
      try {
        scrollRef.current?.scrollTo({
          x: selectedIndex * SNAP,
          animated: true,
        });
        setSnappedIndex(selectedIndex);
        onSnapToIndex?.(selectedIndex);
      } catch (e: any) {
        console.log("CARD_SWIPE_SAFE_BLOCKED", {
          reason: "controlled_snap_error",
          error: e?.message || String(e),
        });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex]);

  // Native-driver scrollX for premium per-card opacity dim on the sides.
  // useNativeDriver: true means this never crosses the JS bridge during
  // scroll — zero crash risk.
  const scrollX = useRef(new RNAnimated.Value(0)).current;
  const onScroll = RNAnimated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: true },
  );

  const handleScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!mountedRef.current) {
      console.log("CARD_SWIPE_SAFE_BLOCKED", { reason: "unmounted_on_scroll_end" });
      return;
    }
    const live = cardsRef.current || [];
    if (live.length <= 0) {
      console.log("CARD_SWIPE_SAFE_BLOCKED", { reason: "empty_deck" });
      return;
    }
    const offsetX = e?.nativeEvent?.contentOffset?.x;
    if (!Number.isFinite(Number(offsetX))) {
      console.log("CARD_SWIPE_SAFE_BLOCKED", { reason: "non_finite_offset", offsetX });
      return;
    }
    const raw = Math.round(Number(offsetX) / SNAP);
    if (!Number.isInteger(raw) || raw < 0 || raw >= live.length) {
      console.log("CARD_SWIPE_SAFE_BLOCKED", { reason: "idx_out_of_bounds", raw, len: live.length });
      return;
    }
    try {
      console.log("CARD_SWIPE_END", { idx: raw, cardCount: live.length });
      setSnappedIndex(raw);
      onSnapToIndex?.(raw);
      snapHaptic();
    } catch (err: any) {
      console.log("CARD_SWIPE_SAFE_BLOCKED", { reason: "snap_callback_error", error: err?.message || String(err) });
    }
  }, [onSnapToIndex]);

  const handleCardPress = useCallback((idx: number) => {
    if (!mountedRef.current) {
      console.log("CARD_SWIPE_SAFE_BLOCKED", { reason: "unmounted_on_press", idx });
      return;
    }
    const live = cardsRef.current || [];
    if (!Number.isInteger(idx) || idx < 0 || idx >= live.length) {
      console.log("CARD_SWIPE_SAFE_BLOCKED", { reason: "press_out_of_bounds", idx, len: live.length });
      return;
    }
    const card = live[idx];
    if (!card) {
      console.log("CARD_SWIPE_SAFE_BLOCKED", { reason: "press_card_missing", idx });
      return;
    }
    try {
      // Pass the full card object so safeOpenListingUrl can enforce clickable guard.
      // Fall back to url string only if card lacks directUrl and is not explicitly non-clickable.
      const title = card.itemName || (card as any).title || "Listing";
      if ((card as any).clickable === false) {
        console.log("FRONTEND_LISTING_NOT_CLICKABLE", { title: String(title).slice(0, 80), reason: "card_clickable_false" });
        return;
      }
      onPressCard?.(card as any, title);
    } catch (err: any) {
      console.log("CARD_SWIPE_SAFE_BLOCKED", { reason: "press_error", error: err?.message || String(err) });
    }
  }, [onPressCard]);

  const isWatchlisted = useCallback((card: CardData) => {
    const q = (card.itemName || (card as any).title || "").trim().toLowerCase();
    return watchlistQueries.some((wq) => wq.trim().toLowerCase() === q);
  }, [watchlistQueries]);

  // Entrance fade for the deck row + counter — opacity only, no transform.
  // The previous "swipe to compare" hint copy was removed in the refinement
  // pass per the no-tutorial-text directive — the widened peek (CARD_SIDE_MARGIN
  // 44 → 54) plus the stronger side-card fade (opacity 0.58 → 0.50, scale
  // 0.93 → 0.90, lift -8 → -10) does the discoverability work on its own.
  const entrance = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    entrance.setValue(0);
    const fadeIn = RNAnimated.timing(entrance, {
      toValue: 1, duration: 320, easing: panthereRN, useNativeDriver: true,
    });
    fadeIn.start();
    return () => {
      try { fadeIn.stop(); } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeResult]);

  return (
    <RNAnimated.View style={[styles.deckOuter, { opacity: entrance }]}>
      {/* Pillar 1.6 — removed the "{N} LISTINGS" counter that floated
          awkwardly above the deck. The evidence strip + Market Depth
          module already communicate count, and the floating label
          visually competed with the verdict above and the card below.
          Counter styles are kept in the stylesheet (unused) so future
          variants can re-introduce it without re-laying-out the deck. */}

      {/* External deck halo removed — was a soft emerald ellipse behind
          the active card. It read as a "visible green blob" rather than
          ambient depth. The active card's own shadow + the scale/lift
          choreography carry the focal-point cue without any color wash. */}

      {/* ── Card row ──────────────────────────────────────────────── */}
      <RNAnimated.ScrollView
        ref={scrollRef as any}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={SNAP}
        decelerationRate="fast"
        snapToAlignment="start"
        disableIntervalMomentum
        bounces
        scrollEventThrottle={16}
        onScroll={onScroll}
        onMomentumScrollEnd={handleScrollEnd}
        contentContainerStyle={{
          paddingLeft: CARD.leftInset,
          paddingRight: CARD.leftInset,
        }}
        style={styles.scrollView}
        // When there's only one card, disable scrolling entirely so a
        // stray drag can't kick the snap callback at all.
        scrollEnabled={cardCount > 1}
      >
        {cards.map((card, idx) => {
          const cardPrice = Number.isFinite(Number(card.price)) ? Number(card.price) : null;
          const cardIsLowest = lowestPrice != null && cardPrice != null && cardPrice === lowestPrice;
          // Native-driver depth choreography for the active card. We
          // interpolate three independent values off scrollX so the deck
          // reads as a stack of collectible cards, not a scrollview:
          //   - opacity: side cards dim to 0.58 (clearer hierarchy than the
          //     prior 0.74; the eye now LOCKS on the centered card)
          //   - scale:   sides shrink to 0.93 (8% delta is the sweet spot —
          //     visible depth without over-zoom rasterization)
          //   - translateY: active card lifts 8px (gives a literal "this is
          //     the hero" silhouette, like a card pulled from a deck)
          // All three run on the UI thread (useNativeDriver via the parent
          // RNAnimated.event) — zero JS-bridge cost during scroll.
          const inputRange = [
            (idx - 1) * SNAP,
            idx * SNAP,
            (idx + 1) * SNAP,
          ];
          // Side-card visibility further dampened. opacity 0.34 (lower
          // edge of the 0.32-0.36 band) and scale 0.88 keep the peeked
          // alternates as peripheral hints — visible enough to advertise
          // "more here, swipe to compare," dim enough that the eye never
          // splits focus between active and side cards. Active stays at
          // exactly 1.0 / 1.0 for the cleanest natural-size focal point.
          const cardOpacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.29, 1.0, 0.29],
            extrapolate: "clamp",
          });
          const cardScale = scrollX.interpolate({
            inputRange,
            outputRange: [0.88, 1.0, 0.88],
            extrapolate: "clamp",
          });
          const cardLift = scrollX.interpolate({
            inputRange,
            outputRange: [0, -10, 0],
            extrapolate: "clamp",
          });
          return (
            <RNAnimated.View
              key={idx}
              style={{
                width: CARD.width,
                marginRight: idx === cards.length - 1 ? 0 : GAP,
                opacity: cardOpacity,
                transform: [
                  { scale: cardScale },
                  { translateY: cardLift },
                ],
              }}
              renderToHardwareTextureAndroid={IS_ANDROID}
              shouldRasterizeIOS={!IS_ANDROID}
            >
              <ResultCard
                data={card}
                isHero={idx === 0}
                heroPrice={idx === 0 ? null : heroPrice}
                scannedPrice={_scannedPrice}
                isLowest={cardIsLowest}
                isWatchlisted={isWatchlisted(card)}
                onPress={() => handleCardPress(idx)}
                onZoomImage={onZoomImage}
                onToggleWatchlist={onToggleWatchlist ? () => {
                  try { onToggleWatchlist(card); }
                  catch (e: any) { console.log("CARD_SWIPE_SAFE_BLOCKED", { reason: "watchlist_error", error: e?.message || String(e) }); }
                } : undefined}
                onShare={onShare ? () => {
                  try { onShare(card); }
                  catch (e: any) { console.log("CARD_SWIPE_SAFE_BLOCKED", { reason: "share_error", error: e?.message || String(e) }); }
                } : undefined}
                onVaultSave={onVaultSave}
                isNet={isNet}
              />
            </RNAnimated.View>
          );
        })}
      </RNAnimated.ScrollView>

      {/* ── Pagination dots ──────────────────────────────────────────
          Pillar 1.6 — pager track is now driven directly by scrollX
          (native driver, useNativeDriver: true) instead of the React
          state `snappedIndex`. The previous implementation animated dot
          width via state, which only updated after onMomentumScrollEnd
          settled — so swipe → settle → indicator caught up late, which
          felt cheap. Now each dot interpolates scaleX + opacity off the
          live scroll offset, so the pager moves WITH the card under the
          user's finger and lands in lockstep with the snap.
          - Layout footprint stays constant (each dot owns a 22pt slot)
          - scaleX 0.20 → 1.0 driven by scrollX → no layout thrash
          - opacity 0.20 → 0.85 in the same interpolation
          - Tap-snap (selectedIndex from Market Depth / rail) still works
            because the controlled-snap useEffect calls scrollTo, which
            moves scrollX through the same range. One source of truth. */}
      {cardCount > 1 ? (
        <View style={styles.dotsRow}>
          {Array.from({ length: cardCount }).map((_, i) => {
            const inputRange =
              cardCount === 1
                ? [0, 1]
                : [Math.max(0, (i - 1) * SNAP), i * SNAP, (i + 1) * SNAP];
            const dotScaleX = scrollX.interpolate({
              inputRange,
              outputRange: cardCount === 1 ? [1, 1] : [0.20, 1.0, 0.20],
              extrapolate: "clamp",
            });
            const dotOpacity = scrollX.interpolate({
              inputRange,
              outputRange: cardCount === 1 ? [0.85, 0.85] : [0.20, 0.85, 0.20],
              extrapolate: "clamp",
            });
            return (
              <View key={i} style={styles.dotSlot}>
                <RNAnimated.View
                  style={[
                    styles.dotBar,
                    {
                      opacity: dotOpacity,
                      transform: [{ scaleX: dotScaleX }],
                    },
                  ]}
                />
              </View>
            );
          })}
        </View>
      ) : null}
    </RNAnimated.View>
  );
}

const styles = StyleSheet.create({
  deckOuter: {
    alignItems: "center",
    // Positive top margin gives the active card real breathing room
    // below the verdict — the prior -SP.sm lift crashed the card image
    // into the COST/MARKET strip on HOLD/PASS scans (field screenshots),
    // and zero margin still read as "jammed" against the verdict's
    // bottom edge. SP.md lands the card with visible whitespace above
    // it without pushing the bottom under the dock.
    marginTop: SP.xs,
  },

  counterRow: {
    width: CARD.width,
    marginBottom: SP.xs,
    alignItems: "flex-start",
  },
  counterText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.6,
    color: C.text4,
    textTransform: "uppercase",
  },

  // Pillar 1.5 — buffer trimmed from +44 to +28 so the ScrollView no
  // longer reserves a huge spacer below the card. Still exposes:
  //   * the -10px active-card lift (transform translateY)
  //   * ~16px of ambient shadow before the pagination dots
  // Anything deeper than that was dead space contributing to the deck
  // feeling jammed between sections in the iPhone screenshots.
  scrollView: {
    width: SCREEN.width,
    height: CARD.height + 28,
    overflow: "visible",
  },

  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: SP.sm,
    marginBottom: SP.xs,
  },
  // Pillar 1.6 — each dot owns a fixed 22pt slot so the row layout never
  // thrashes during scroll. The bar inside the slot scales horizontally
  // via Animated.scaleX so its visual width grows/shrinks live with
  // scrollX without triggering a relayout pass.
  dotSlot: {
    width: 22,
    height: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  dotBar: {
    width: 22,
    height: 3,
    borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.85)",
  },
  // Legacy dot style — preserved for backward compat. The new slot/bar
  // pair above replaces it for the live pager.
  dot: {
    height: 2.5,
    borderRadius: R.pill,
  },
});
