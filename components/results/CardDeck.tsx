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
import * as Haptics from "expo-haptics";
import { C, SP, R, TY, CARD, SCREEN, EASE_PANTHERE } from "../design/DS";
import { ResultCard, CardData } from "./ResultCard";

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
  /** Watchlist query keys for heart state */
  watchlistQueries?: string[];
  onPressCard?: (url: string | null, title: string) => void;
  onZoomImage?: (uri: string) => void;
  onSnapToIndex?: (index: number) => void;
  onToggleWatchlist?: (card: CardData) => void;
  onShare?: (card: CardData) => void;
  onVaultSave?: (entry: any) => void;
  isNet?: boolean;
}

const snapHaptic = () => { try { Haptics.selectionAsync(); } catch {} };

// ─── Main CardDeck ────────────────────────────────────────────────────────────
export function CardDeck({
  activeResult,
  results,
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
    const titleKey = (t: any): string => {
      const n = norm(t);
      if (!n) return "";
      // Collapse near-identical titles: "Retro Oval Cat Eye Sunglasses for
      // Women — Black" and "Retro Oval Cat Eye Sunglasses for Women, Black"
      // should hash to the same key. Use the first 6 significant words.
      return n.split(" ").filter(Boolean).slice(0, 6).join(" ");
    };

    const seenTitles = new Set<string>();
    const seenImages = new Set<string>();
    const heroTitleK = titleKey(heroCard.itemName);
    const heroImageK = imageKey(heroCard.image);
    if (heroTitleK) seenTitles.add(heroTitleK);
    if (heroImageK) seenImages.add(heroImageK);

    const anchorThreshold = _scannedPrice != null ? _scannedPrice * 2.5 : Infinity;

    // Over-pull from positions 1..12 so dedup can drop liberally and we
    // still land ≥4 alts when the corpus has them.
    const rawAlts: CardData[] = (results || [])
      .slice(1, 13)
      .map((r: any) => ({
        itemName: r?.itemName || r?.title,
        store:    r?.source   || r?.store,
        price:    r?.price    ?? r?.totalPrice,
        buyLink:  r?.buyLink  || r?.url,
        image:    r?.image    || r?.thumbnail,
      }));

    // Junk-title patterns. The server occasionally returns SERP filler
    // ("Sponsored", "Best Sellers in …", "See more results") plus listings
    // with hyper-aggressive marketing punctuation ("!!!!!!! HUGE DEAL"). One
    // junk card destroys trust in the whole deck, so we reject preemptively.
    const JUNK_TITLE = /^(sponsored|featured|advertisement|click here|see (price|more)|view ad|best sellers? in|results for|shop now)/i;
    const PUNCT_SPAM = /([!?$*])\1{4,}/; // 5+ in a row of same punctuation
    const JUNK_STORE = /sponsored|advertis|promoted|^ad\b/i;

    const dedupedAlts: CardData[] = [];
    for (const alt of rawAlts) {
      const tk = titleKey(alt.itemName);
      const ik = imageKey(alt.image);
      const titleStr = String(alt.itemName ?? "").trim();
      const storeStr = String(alt.store ?? "").trim();
      // Must have both image AND a finite price > 0 — otherwise the card
      // renders as a placeholder square with "$NaN" and reads as junk.
      const priceN = Number(alt.price);
      if (!alt.image) continue;
      if (!Number.isFinite(priceN) || priceN <= 0) continue;
      // Title sanity — real product titles are at least a few words long.
      // Anything under 8 chars is almost certainly a placeholder or a
      // truncated SERP row that won't read as a real listing.
      if (titleStr.length < 8) continue;
      if (JUNK_TITLE.test(titleStr)) continue;
      if (PUNCT_SPAM.test(titleStr)) continue;
      // Store sanity — obvious ad/sponsor source labels go.
      if (storeStr && JUNK_STORE.test(storeStr)) continue;
      // Skip if title OR image matches hero / any prior accepted alt.
      if (tk && seenTitles.has(tk)) continue;
      if (ik && seenImages.has(ik)) continue;
      if (tk) seenTitles.add(tk);
      if (ik) seenImages.add(ik);
      dedupedAlts.push(alt);
      // Soft cap — 8 alts is plenty even before the premium re-sort below
      // (display layer slices to whatever fits). Hard cap of 4 happens after
      // sort so the cheapest-and-most-relevant survive.
      if (dedupedAlts.length >= 8) break;
    }

    // Re-rank: premium-anchor listings (price > 2.5× scannedPrice) go to
    // the tail, then sort the remainder by ascending price so the deck
    // leads with the cheapest credible matches. Equal-price ties break by
    // image presence (alread guaranteed), then by title length (shorter
    // = cleaner SEO title, usually a real listing not a placeholder).
    const alts = dedupedAlts.sort((a, b) => {
      const pa = Number(a.price ?? Infinity);
      const pb = Number(b.price ?? Infinity);
      const aIsPrem = pa > anchorThreshold;
      const bIsPrem = pb > anchorThreshold;
      if (aIsPrem !== bIsPrem) return aIsPrem ? 1 : -1;
      if (pa !== pb) return pa - pb;
      const la = String(a.itemName ?? "").length;
      const lb = String(b.itemName ?? "").length;
      return la - lb;
    }).slice(0, 4);

    console.log("CARD_DECK_BUILD", {
      rawCount: (results || []).length,
      pickedAlts: alts.length,
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
      const url = (card as any).directUrl || card.buyLink || (card as any).url || null;
      const title = card.itemName || (card as any).title || "Listing";
      if (url) onPressCard?.(url, title);
    } catch (err: any) {
      console.log("CARD_SWIPE_SAFE_BLOCKED", { reason: "press_error", error: err?.message || String(err) });
    }
  }, [onPressCard]);

  const isWatchlisted = useCallback((card: CardData) => {
    const q = (card.itemName || (card as any).title || "").trim().toLowerCase();
    return watchlistQueries.some((wq) => wq.trim().toLowerCase() === q);
  }, [watchlistQueries]);

  // Entrance fade for the deck row + counter — opacity only, no transform.
  const entrance = useRef(new RNAnimated.Value(0)).current;
  const swipeHintOpacity = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    entrance.setValue(0);
    swipeHintOpacity.setValue(0);
    const fadeIn = RNAnimated.timing(entrance, {
      toValue: 1, duration: 320, easing: panthereRN, useNativeDriver: true,
    });
    const hint = RNAnimated.sequence([
      RNAnimated.delay(1100),
      RNAnimated.timing(swipeHintOpacity, {
        toValue: 0.55, duration: 480, easing: panthereRN, useNativeDriver: true,
      }),
    ]);
    fadeIn.start();
    hint.start();
    return () => {
      try { fadeIn.stop(); } catch {}
      try { hint.stop(); } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeResult]);

  return (
    <RNAnimated.View style={[styles.deckOuter, { opacity: entrance }]}>
      {/* ── Alternatives counter ──────────────────────────────────── */}
      {altCount > 0 ? (
        <View style={styles.counterRow}>
          <Text
            style={styles.counterText}
            allowFontScaling={false}
            numberOfLines={1}
          >
            {`${altCount + 1} LISTINGS`}
          </Text>
        </View>
      ) : null}

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
          const cardOpacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.58, 1.0, 0.58],
            extrapolate: "clamp",
          });
          const cardScale = scrollX.interpolate({
            inputRange,
            outputRange: [0.93, 1.0, 0.93],
            extrapolate: "clamp",
          });
          const cardLift = scrollX.interpolate({
            inputRange,
            outputRange: [0, -8, 0],
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

      {/* ── Pagination dots ──────────────────────────────────────── */}
      {cardCount > 1 ? (
        <View style={styles.dotsRow}>
          {Array.from({ length: cardCount }).map((_, i) => {
            const isActive = i === snappedIndex;
            return (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    width: isActive ? 22 : 6,
                    backgroundColor: isActive
                      ? "rgba(255,255,255,0.92)"
                      : "rgba(255,255,255,0.35)",
                  },
                ]}
              />
            );
          })}
        </View>
      ) : null}

      {cardCount > 1 ? (
        <RNAnimated.Text
          style={[styles.swipeHint, { opacity: swipeHintOpacity }]}
          allowFontScaling={false}
          numberOfLines={1}
        >
          swipe to compare
        </RNAnimated.Text>
      ) : null}
    </RNAnimated.View>
  );
}

const styles = StyleSheet.create({
  deckOuter: {
    alignItems: "center",
  },

  counterRow: {
    width: CARD.width,
    marginBottom: SP.sm,
    alignItems: "flex-start",
  },
  counterText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.6,
    color: C.text4,
    textTransform: "uppercase",
  },

  scrollView: {
    width: SCREEN.width,
    height: CARD.height,
  },

  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.xs,
    marginTop: SP.lg,
  },
  dot: {
    height: 3,
    borderRadius: R.pill,
  },

  swipeHint: {
    ...TY.cap,
    color: C.text4,
    marginTop: SP.sm,
    letterSpacing: 0.5,
  },
});
