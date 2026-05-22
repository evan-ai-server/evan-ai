/**
 * CardDeck — horizontal swipeable card deck with spring physics.
 *
 * Features:
 *  - "Found X cheaper alternatives" header
 *  - Tinder-like snap with velocity bias
 *  - Neighboring cards peek from edges (overflow hidden)
 *  - Entrance spring animation per activeResult
 *  - Heart + share overlay actions on each card
 *  - Long-swipe right (>55% card width) → add to watchlist
 */
import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated as RNAnimated,
  Easing as RNEasing,
  Platform,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
  runOnJS,
  SharedValue,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { C, SP, R, TY, CARD, SCREEN, MO, EASE_PANTHERE } from "../design/DS";
import { ResultCard, CardData } from "./ResultCard";
import { openProductLink } from "../utils/openProductLink";

const IS_ANDROID = Platform.OS === "android";
const panthereRN = RNEasing.bezier(EASE_PANTHERE[0], EASE_PANTHERE[1], EASE_PANTHERE[2], EASE_PANTHERE[3]);

const clampVal = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

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

const snapHaptic  = () => { try { Haptics.selectionAsync(); } catch {} };
const heavyHaptic = () => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {} };

// ─── AnimCard ─────────────────────────────────────────────────────────────────
interface AnimCardProps {
  data: CardData;
  index: number;
  activeIndex: SharedValue<number>;
  deckEntrance: SharedValue<number>;
  heroPrice: number | null;
  scannedPrice: number | null;
  isLowest: boolean;
  isHero: boolean;
  isWatchlisted: boolean;
  onPress?: () => void;
  onZoomImage?: (uri: string) => void;
  onToggleWatchlist?: () => void;
  onShare?: () => void;
  onVaultSave?: (entry: any) => void;
  isNet?: boolean;
}

function AnimCard({
  data,
  index,
  activeIndex,
  deckEntrance,
  heroPrice,
  scannedPrice,
  isLowest,
  isHero,
  isWatchlisted,
  onPress,
  onZoomImage,
  onToggleWatchlist,
  onShare,
  onVaultSave,
  isNet,
}: AnimCardProps) {
  const animStyle = useAnimatedStyle(() => {
    const relPos = index - activeIndex.value;

    const translateX = relPos * CARD.slotWidth;

    // Side cards stay closer to full size so the neighbor's peek is an
    // obvious, intentional sliver instead of a faint hint. Old curve
    // (0.875 / 0.82) shrank the neighbor enough that on a 393px iPhone only
    // 4px of it landed on screen after centre-origin scaling — the deck
    // read as a single static card. New curve (0.94 / 0.90) preserves the
    // depth feel but lets ~16–20px of the neighbor breathe into view.
    const scaleVal = interpolate(
      Math.abs(relPos),
      [0, 0.5, 1, 2],
      [1.0, 0.97, 0.94, 0.90],
      Extrapolation.CLAMP,
    );

    // Higher peek opacity for the same reason — 0.52 read as "ghosted out",
    // 0.74 reads as "next card waiting". Card fully fades by relPos≈1.8 so
    // the third card never visually competes with the active card.
    const opacityVal = interpolate(
      Math.abs(relPos),
      [0, 0.4, 1.1, 1.8],
      [1.0, 0.94, 0.74, 0.0],
      Extrapolation.CLAMP,
    );

    const translateY = interpolate(
      Math.abs(relPos),
      [0, 1],
      [0, 6],
      Extrapolation.CLAMP,
    );

    // Entrance: 50ms stagger per card — cascade effect (hero → alt1 → alt2…)
    const staggerOffset = index * 0.20; // 0.20 per card → full cascade across 0.8 of the range
    const entranceStart = Math.min(staggerOffset, 0.85);
    const entranceEnd   = Math.min(entranceStart + 0.55, 1.0);
    const entranceY = interpolate(
      deckEntrance.value,
      [entranceStart, entranceEnd],
      [52 + index * 14, 0],
      Extrapolation.CLAMP,
    );
    const entranceOp = interpolate(
      deckEntrance.value,
      [entranceStart, Math.min(entranceStart + 0.45, 1.0)],
      [0, 1],
      Extrapolation.CLAMP,
    );

    const relFrac = activeIndex.value - index;
    const rotDeg  = interpolate(relFrac, [-0.6, 0, 0.6], [5, 0, -5], Extrapolation.CLAMP);

    return {
      transform: [
        { translateX },
        { scale: scaleVal },
        { translateY: translateY + entranceY },
        { rotate: `${rotDeg}deg` },
      ] as any,
      opacity: opacityVal * entranceOp,
    };
  });

  return (
    <Reanimated.View
      style={[styles.cardWrapper, animStyle as any]}
      renderToHardwareTextureAndroid={IS_ANDROID}
      shouldRasterizeIOS={!IS_ANDROID}
      needsOffscreenAlphaCompositing={IS_ANDROID}
    >
      <ResultCard
        data={data}
        isHero={isHero}
        heroPrice={isHero ? null : heroPrice}
        scannedPrice={scannedPrice}
        isLowest={isLowest}
        isWatchlisted={isWatchlisted}
        onPress={onPress}
        onZoomImage={onZoomImage}
        onToggleWatchlist={onToggleWatchlist}
        onShare={onShare}
        onVaultSave={onVaultSave}
        isNet={isNet}
      />
    </Reanimated.View>
  );
}

// ─── Dot indicator ────────────────────────────────────────────────────────────
function DotIndicator({ count, activeIndex }: { count: number; activeIndex: SharedValue<number> }) {
  if (count <= 1) return null;
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: count }).map((_, i) => (
        <AnimDot key={i} index={i} activeIndex={activeIndex} />
      ))}
    </View>
  );
}

function AnimDot({ index, activeIndex }: { index: number; activeIndex: SharedValue<number> }) {
  const s = useAnimatedStyle(() => {
    const dist = Math.abs(index - activeIndex.value);
    const opacity = interpolate(dist, [0, 0.6, 1.2], [1.0, 0.55, 0.25], Extrapolation.CLAMP);
    const width   = interpolate(dist, [0, 0.5, 1],   [22, 8, 6],         Extrapolation.CLAMP);
    const alpha   = interpolate(dist, [0, 1],         [0.92, 0.35],       Extrapolation.CLAMP);
    return { opacity, width, backgroundColor: `rgba(255,255,255,${alpha})` } as any;
  });
  return (
    <Reanimated.View
      style={[styles.dot, s as any]}
      renderToHardwareTextureAndroid={IS_ANDROID}
      shouldRasterizeIOS={!IS_ANDROID}
    />
  );
}

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
      // Feature 2: price history chart points (if server provides them inline)
      priceChartPoints: activeResult?.priceChartPoints ?? null,
      // Feature 4: condition label from vision identity
      conditionLabel:   activeResult?.conditionLabel ?? activeResult?.visionIdentity?.condition ?? null,
      // Feature 8: best time to buy
      trendIntel:       activeResult?.trendIntel ?? null,
      seasonalFlip:     activeResult?.seasonalFlip ?? null,
      // Feature 10: authenticity
      authenticityIntel: activeResult?.authenticityIntel ?? null,
      // Feature 4: eBay sold comps
      ebaySoldComps: activeResult?.ebaySoldComps ?? null,
      // Feature 5: local / hyperlocal comps
      localComps: activeResult?.localComps ?? null,
    };

    const anchorThreshold = _scannedPrice != null ? _scannedPrice * 2.5 : Infinity;
    const rawAlts: CardData[] = (results || [])
      .slice(1, 5)   // up to 4 alternatives → total 5 cards
      .map((r: any) => ({
        itemName: r?.itemName || r?.title,
        store:    r?.source   || r?.store,
        price:    r?.price    ?? r?.totalPrice,
        buyLink:  r?.buyLink  || r?.url,
        image:    r?.image    || r?.thumbnail,
      }));

    // Sort: non-premium anchors first, premium anchors (>2.5x scanned) last
    const alts = [...rawAlts].sort((a, b) => {
      const pa = Number(a.price ?? Infinity);
      const pb = Number(b.price ?? Infinity);
      const aIsPrem = pa > anchorThreshold;
      const bIsPrem = pb > anchorThreshold;
      if (aIsPrem !== bIsPrem) return aIsPrem ? 1 : -1;
      return 0;
    });

    return [heroCard, ...alts];
  }, [activeResult, results, _scannedPrice]);

  const cardCount  = cards.length;
  const altCount   = cardCount - 1;
  const heroPrice  = Number.isFinite(Number(cards[0]?.price)) ? Number(cards[0].price) : null;

  // Live ref to the current cards array. Closures inside the Pan gesture
  // worklet capture cards/maxIndex at definition time — if a new scan or
  // results-array refresh shrinks the deck mid-gesture, the worklet still
  // holds the old maxIndex. The native module then drives withSpring with a
  // stale upper bound, which historically produced the swipe-then-crash. The
  // ref gives the JS-side runOnJS callbacks a way to re-clamp against the
  // ACTUAL current count without recompiling the gesture.
  const cardsRef = useRef(cards);
  useEffect(() => { cardsRef.current = cards; }, [cards]);

  // Lowest price across all cards — used to badge VALUE FLOOR
  const allPrices = cards.map((c) => Number(c.price ?? Infinity)).filter(Number.isFinite);
  const lowestPrice = allPrices.length ? Math.min(...allPrices) : null;

  const activeIndex  = useSharedValue(0);
  const startIndex   = useSharedValue(0);
  const deckEntrance = useSharedValue(0);
  const [_snappedIndex, setSnappedIndex] = useState(0);

  // Mounted gate for runOnJS callbacks. A swipe can complete its worklet AFTER
  // the deck has been torn down (new scan started, results cleared, modal
  // closed). Without this, the runOnJS callback would still fire JS state
  // updates against a dead tree — historically the second crash vector we
  // saw on swipe (the first was Math.round(NaN) on the spring target).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Swipe hint fade-in: appears after 600ms
  const swipeHintOpacity = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    activeIndex.value  = 0;
    setSnappedIndex(0);
    deckEntrance.value = 0;
    // Calm spring — deliberate, not bouncy. Cards arrive after the verdict lands.
    deckEntrance.value = withSpring(1, { mass: 1.2, damping: 26, stiffness: 110 });

    // Swipe hint fades in after the deck has settled
    swipeHintOpacity.setValue(0);
    const hint = RNAnimated.sequence([
      RNAnimated.delay(1100),
      RNAnimated.timing(swipeHintOpacity, {
        toValue: 0.55,
        duration: 480,
        easing: panthereRN,
        useNativeDriver: true,
      }),
    ]);
    hint.start();
    return () => { try { hint.stop(); } catch {} };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeResult]);

  const handleSnap = useCallback((idx: number) => {
    if (!mountedRef.current) {
      console.log("CARD_SWIPE_CRASH_GUARD", { reason: "unmounted_on_snap", idx });
      return;
    }
    // Read the LIVE cards length from the ref — `cards.length` in this
    // closure may be stale if the deck rebuilt between gesture start and
    // gesture end.
    const liveLen = (cardsRef.current || []).length;
    if (liveLen <= 0) {
      console.log("CARD_SWIPE_CRASH_GUARD", { reason: "empty_deck_on_snap" });
      return;
    }
    const safe = Number.isFinite(idx)
      ? Math.max(0, Math.min(Math.round(Number(idx)), Math.max(0, liveLen - 1)))
      : 0;
    try {
      console.log("CARD_SWIPE_SNAP", { idx, safe, cardCount: liveLen });
      setSnappedIndex(safe);
      onSnapToIndex?.(safe);
      snapHaptic();
    } catch (e: any) {
      console.log("CARD_SWIPE_ERROR", { stage: "snap", error: e?.message || String(e) });
    }
  }, [onSnapToIndex]);

  const handleWatchlistSwipe = useCallback(() => {
    if (!mountedRef.current) {
      console.log("CARD_SWIPE_CRASH_GUARD", { reason: "unmounted_watchlist" });
      return;
    }
    try {
      // Always read the LIVE hero from the ref — a stale closure on cards[0]
      // after a new scan could read undefined and toss a TypeError from the
      // runOnJS hop.
      const card = (cardsRef.current || [])[0];
      if (card) {
        console.log("CARD_SWIPE_END", { action: "watchlist_add", title: card?.itemName || (card as any)?.title || null });
        onToggleWatchlist?.(card);
        heavyHaptic();
      } else {
        console.log("CARD_SWIPE_CRASH_GUARD", { reason: "no_hero_card" });
      }
    } catch (e: any) {
      console.log("CARD_SWIPE_ERROR", { stage: "watchlist", error: e?.message || String(e) });
    }
  }, [onToggleWatchlist]);

  // Single-card / empty-deck short-circuit: don't construct a pan gesture that
  // can drive activeIndex outside [0, 0]. Reanimated's withSpring on a NaN /
  // negative upper bound has been the source of native crashes on swipe in
  // prod (cardCount=0 right after a scan reset → upper bound -1 → spring
  // target Math.round(NaN) → undefined-behavior). Returning an empty gesture
  // also avoids holding a stale closure over cards[] if the deck rebuilds.
  const maxIndex = Math.max(0, cardCount - 1);

  // Shared upper-bound mirror so the worklet always reads the live value.
  // Without this the worklet's `maxIndex` is whatever it was the moment the
  // gesture was compiled. If a parallel scan tears the deck down to one card
  // mid-swipe, the spring target would still resolve against the stale upper
  // bound and crash. The worklet reads `maxIndexShared.value` instead.
  const maxIndexShared = useSharedValue(maxIndex);
  useEffect(() => {
    maxIndexShared.value = maxIndex;
  }, [maxIndex, maxIndexShared]);

  // JS-side helpers driven by runOnJS — each wraps its work in try/catch so a
  // single exception inside the worklet→JS hop can never bubble back into
  // the gesture handler and tear the app down. Logs route through here so we
  // see the gesture lifecycle in production diagnostics.
  const onSwipeBegin = useCallback((startIdx: number) => {
    if (!mountedRef.current) return;
    try { console.log("CARD_SWIPE_BEGIN", { startIdx, cardCount, maxIndex }); } catch {}
  }, [cardCount, maxIndex]);

  const onSwipeUpdateInvalid = useCallback((reason: string) => {
    if (!mountedRef.current) return;
    try { console.log("CARD_SWIPE_UPDATE_INVALID", { reason, cardCount }); } catch {}
  }, [cardCount]);

  const onSwipeEnd = useCallback((target: number, velocityX: number, translationX: number) => {
    if (!mountedRef.current) return;
    try {
      console.log("CARD_SWIPE_END", {
        target,
        velocityX: Math.round(velocityX),
        translationX: Math.round(translationX),
        cardCount,
      });
    } catch {}
  }, [cardCount]);

  const pan = Gesture.Pan()
    .enabled(cardCount > 1)
    .activeOffsetX([-10, 10])
    .failOffsetY([-12, 12])
    .onBegin(() => {
      'worklet';
      const liveMax = Number(maxIndexShared.value);
      if (!Number.isFinite(liveMax) || liveMax <= 0) {
        runOnJS(onSwipeUpdateInvalid)("begin_max_invalid");
        return;
      }
      startIndex.value = Number.isFinite(activeIndex.value) ? activeIndex.value : 0;
      runOnJS(onSwipeBegin)(startIndex.value);
    })
    .onUpdate((e) => {
      'worklet';
      const liveMax = Number(maxIndexShared.value);
      if (!Number.isFinite(liveMax) || liveMax <= 0) {
        runOnJS(onSwipeUpdateInvalid)("update_max_invalid");
        return;
      }
      const slot = CARD.slotWidth || 1;
      const delta = -e.translationX / slot;
      const next = startIndex.value + delta;
      // Guard against NaN/Infinity propagating into the spring target below.
      if (!Number.isFinite(next)) {
        runOnJS(onSwipeUpdateInvalid)("non_finite_next");
        return;
      }
      activeIndex.value = clampVal(next, 0, liveMax);
    })
    .onEnd((e) => {
      'worklet';
      const liveMax = Number(maxIndexShared.value);
      // If the deck shrank to ≤1 card mid-gesture (active result cleared
      // by a parallel new-scan), don't fire withSpring — snap activeIndex
      // back to 0 directly so we can't drive the spring with a stale upper
      // bound. JS-side handleSnap also re-clamps for double safety.
      if (!Number.isFinite(liveMax) || liveMax <= 0) {
        activeIndex.value = 0;
        runOnJS(handleSnap)(0);
        return;
      }
      // Long-swipe RIGHT on first card → add to watchlist
      if (
        Number.isFinite(startIndex.value) &&
        startIndex.value < 0.1 &&
        Number.isFinite(e.translationX) &&
        e.translationX > CARD.width * 0.55
      ) {
        activeIndex.value = withSpring(0, MO.spring.card);
        runOnJS(handleWatchlistSwipe)();
        runOnJS(onSwipeEnd)(0, e.velocityX, e.translationX);
        return;
      }

      const slot = CARD.slotWidth || 1;
      const velocityX = Number.isFinite(e.velocityX) ? e.velocityX : 0;
      const velocityBias = -velocityX / slot * 0.18;
      const raw    = Number(activeIndex.value) + velocityBias;
      // Belt-and-suspenders: clamp BEFORE rounding so Math.round can't see NaN.
      const clamped = clampVal(Number.isFinite(raw) ? raw : 0, 0, liveMax);
      const target  = Math.round(clamped);
      // Final integer-bounds check — Math.round on Infinity yields Infinity
      // which then sneaks into the array reads downstream. With clamped
      // first and finite test second, we get a real array index every time.
      const safeTarget = Number.isFinite(target) && target >= 0 && target <= liveMax
        ? target
        : 0;
      activeIndex.value = withSpring(safeTarget, MO.spring.card);
      runOnJS(handleSnap)(safeTarget);
      runOnJS(onSwipeEnd)(safeTarget, velocityX, e.translationX);
    });

  const handleCardPress = useCallback((idx: number) => {
    if (!mountedRef.current) {
      console.log("CARD_SWIPE_CRASH_GUARD", { reason: "unmounted_on_press", idx });
      return;
    }
    const live = cardsRef.current || [];
    if (!Number.isFinite(idx) || idx < 0 || idx >= live.length) {
      console.log("CARD_SWIPE_IGNORED", { reason: "press_out_of_bounds", idx, len: live.length });
      return;
    }
    const card = live[idx];
    if (!card) {
      console.log("CARD_SWIPE_IGNORED", { reason: "press_card_missing", idx });
      return;
    }
    try {
      const url =
        (card as any).directUrl ||
        card.buyLink ||
        (card as any).url ||
        null;
      const title = card.itemName || (card as any).title || "Listing";
      // openProductLink is async and rejects silently inside; explicit
      // catch-bind makes sure any future change to that function (or to
      // expo-web-browser) can't escape as an unhandled rejection.
      try {
        Promise.resolve(openProductLink(url, { titleHint: title })).catch((e: any) => {
          console.log("CARD_SWIPE_ERROR", { stage: "open_link", error: e?.message || String(e) });
        });
      } catch (e: any) {
        console.log("CARD_SWIPE_ERROR", { stage: "open_link_sync", error: e?.message || String(e) });
      }
      if (url) {
        try { onPressCard?.(url, title); }
        catch (e: any) { console.log("CARD_SWIPE_ERROR", { stage: "press_callback", error: e?.message || String(e) }); }
      }
    } catch (e: any) {
      console.log("CARD_SWIPE_ERROR", { stage: "press", error: e?.message || String(e) });
    }
  }, [onPressCard]);

  const isWatchlisted = useCallback((card: CardData) => {
    const q = (card.itemName || (card as any).title || "").trim().toLowerCase();
    return watchlistQueries.some((wq) => wq.trim().toLowerCase() === q);
  }, [watchlistQueries]);

  const counterEntranceStyle = useAnimatedStyle(() => ({
    opacity: interpolate(deckEntrance.value, [0, 1], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(deckEntrance.value, [0, 1], [6, 0], Extrapolation.CLAMP) }] as any,
  }));

  return (
    <View style={styles.deckOuter}>
      {/* ── Alternatives counter — quiet, single word ───────── */}
      {altCount > 0 ? (
        <View style={styles.counterRow}>
          <Reanimated.View
            style={counterEntranceStyle}
            renderToHardwareTextureAndroid={IS_ANDROID}
            shouldRasterizeIOS={!IS_ANDROID}
          >
            <Text
              style={styles.counterText}
              allowFontScaling={false}
              numberOfLines={1}
            >
              {`${altCount + 1} LISTINGS`}
            </Text>
          </Reanimated.View>
        </View>
      ) : null}

      {/* ── Card stack ──────────────────────────────────────── */}
      <GestureDetector gesture={pan}>
        <View style={styles.deckContainer}>
          {cards.map((card, idx) => {
            const cardPrice = Number.isFinite(Number(card.price)) ? Number(card.price) : null;
            const cardIsLowest = lowestPrice != null && cardPrice != null && cardPrice === lowestPrice;
            return (
              <AnimCard
                key={idx}
                data={card}
                index={idx}
                activeIndex={activeIndex}
                deckEntrance={deckEntrance}
                heroPrice={heroPrice}
                scannedPrice={_scannedPrice}
                isLowest={cardIsLowest}
                isHero={idx === 0}
                isWatchlisted={isWatchlisted(card)}
                onPress={() => handleCardPress(idx)}
                onZoomImage={onZoomImage}
                onToggleWatchlist={() => onToggleWatchlist?.(card)}
                onShare={() => onShare?.(card)}
                onVaultSave={onVaultSave}
                isNet={isNet}
              />
            );
          })}
        </View>
      </GestureDetector>

      {/* ── Dot indicator ───────────────────────────────────── */}
      <DotIndicator count={cardCount} activeIndex={activeIndex} />

      {cardCount > 1 ? (
        <RNAnimated.Text
          style={[styles.swipeHint, { opacity: swipeHintOpacity }]}
          allowFontScaling={false}
          numberOfLines={1}
        >
          swipe to compare
        </RNAnimated.Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  deckOuter: {
    alignItems: "center",
  },

  // ── Counter header — minimal eyebrow ──────────────────────────────────────
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

  // ── Cards ─────────────────────────────────────────────────────────────────
  deckContainer: {
    width: SCREEN.width,
    height: CARD.height,
    overflow: "hidden",
  },
  cardWrapper: {
    position: "absolute",
    top: 0,
    left: CARD.leftInset,
    width: CARD.width,
    height: CARD.height,
  },

  // ── Dots ──────────────────────────────────────────────────────────────────
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
