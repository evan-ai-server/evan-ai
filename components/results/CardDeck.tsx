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
  Easing,
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
import { C, SP, R, TY, CARD, SCREEN, MO } from "../design/DS";
import { ResultCard, CardData } from "./ResultCard";
import { openProductLink } from "../utils/openProductLink";

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
  isHero: boolean;
  isWatchlisted: boolean;
  onPress?: () => void;
  onZoomImage?: (uri: string) => void;
  onToggleWatchlist?: () => void;
  onShare?: () => void;
}

function AnimCard({
  data,
  index,
  activeIndex,
  deckEntrance,
  heroPrice,
  isHero,
  isWatchlisted,
  onPress,
  onZoomImage,
  onToggleWatchlist,
  onShare,
}: AnimCardProps) {
  const animStyle = useAnimatedStyle(() => {
    const relPos = index - activeIndex.value;

    const translateX = relPos * CARD.slotWidth;

    const scaleVal = interpolate(
      Math.abs(relPos),
      [0, 0.5, 1, 2],
      [1.0, 0.95, 0.875, 0.82],
      Extrapolation.CLAMP,
    );

    const opacityVal = interpolate(
      Math.abs(relPos),
      [0, 0.4, 1.1, 1.8],
      [1.0, 0.90, 0.52, 0.0],
      Extrapolation.CLAMP,
    );

    const translateY = interpolate(
      Math.abs(relPos),
      [0, 1],
      [0, 10],
      Extrapolation.CLAMP,
    );

    // Entrance: staggered spring per card (each card 80ms after previous)
    // We bake the stagger into the entrance value by shifting the input range
    const staggerOffset = index * 0.15; // fraction of the shared value range
    const entranceStart = Math.min(staggerOffset, 0.9);
    const entranceEnd   = Math.min(entranceStart + 0.6, 1.0);
    const entranceY = interpolate(
      deckEntrance.value,
      [entranceStart, entranceEnd],
      [40 + index * 10, 0],
      Extrapolation.CLAMP,
    );
    const entranceOp = interpolate(
      deckEntrance.value,
      [entranceStart, Math.min(entranceStart + 0.5, 1.0)],
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
    <Reanimated.View style={[styles.cardWrapper, animStyle as any]}>
      <ResultCard
        data={data}
        isHero={isHero}
        heroPrice={isHero ? null : heroPrice}
        isWatchlisted={isWatchlisted}
        onPress={onPress}
        onZoomImage={onZoomImage}
        onToggleWatchlist={onToggleWatchlist}
        onShare={onShare}
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
  return <Reanimated.View style={[styles.dot, s as any]} />;
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
}: CardDeckProps) {

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

    const alts: CardData[] = (results || [])
      .slice(1, 5)   // up to 4 alternatives → total 5 cards
      .map((r: any) => ({
        itemName: r?.itemName || r?.title,
        store:    r?.source   || r?.store,
        price:    r?.price    ?? r?.totalPrice,
        buyLink:  r?.buyLink  || r?.url,
        image:    r?.image    || r?.thumbnail,
      }));

    return [heroCard, ...alts];
  }, [activeResult, results]);

  const cardCount  = cards.length;
  const altCount   = cardCount - 1;
  const heroPrice  = Number.isFinite(Number(cards[0]?.price)) ? Number(cards[0].price) : null;

  const activeIndex  = useSharedValue(0);
  const startIndex   = useSharedValue(0);
  const deckEntrance = useSharedValue(0);
  const [snappedIndex, setSnappedIndex] = useState(0);

  // Swipe hint fade-in: appears after 600ms
  const swipeHintOpacity = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    activeIndex.value  = 0;
    setSnappedIndex(0);
    deckEntrance.value = 0;
    // Use a longer, softer spring so per-card stagger plays out naturally
    deckEntrance.value = withSpring(1, { mass: 1.0, damping: 22, stiffness: 120 });

    // Swipe hint fades in after 600ms
    swipeHintOpacity.setValue(0);
    const hint = RNAnimated.sequence([
      RNAnimated.delay(600),
      RNAnimated.spring(swipeHintOpacity, {
        toValue: 1,
        damping: 22,
        stiffness: 160,
        mass: 0.9,
        useNativeDriver: true,
      }),
    ]);
    hint.start();
    return () => { try { hint.stop(); } catch {} };
  }, [activeResult]);

  const handleSnap = useCallback((idx: number) => {
    setSnappedIndex(idx);
    onSnapToIndex?.(idx);
    snapHaptic();
  }, [onSnapToIndex]);

  const handleWatchlistSwipe = useCallback(() => {
    const card = cards[0]; // always the hero when swiping from index 0
    if (card) { onToggleWatchlist?.(card); heavyHaptic(); }
  }, [cards, onToggleWatchlist]);

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-12, 12])
    .onBegin(() => {
      startIndex.value = activeIndex.value;
    })
    .onUpdate((e) => {
      const delta = -e.translationX / CARD.slotWidth;
      activeIndex.value = clampVal(startIndex.value + delta, 0, cardCount - 1);
    })
    .onEnd((e) => {
      // Long-swipe RIGHT on first card → add to watchlist
      if (
        startIndex.value < 0.1 &&
        e.translationX > CARD.width * 0.55
      ) {
        activeIndex.value = withSpring(0, MO.spring.card);
        runOnJS(handleWatchlistSwipe)();
        return;
      }

      const velocityBias = -e.velocityX / CARD.slotWidth * 0.18;
      const raw    = activeIndex.value + velocityBias;
      const target = Math.round(clampVal(raw, 0, cardCount - 1));
      activeIndex.value = withSpring(target, MO.spring.card);
      runOnJS(handleSnap)(target);
    });

  const handleCardPress = useCallback((idx: number) => {
    const card = cards[idx];
    if (!card) return;
    const url   = card.buyLink || (card as any).url || null;
    const title = card.itemName || (card as any).title || "Listing";
    // Feature 5: try deep link → in-app browser → fallback
    if (url) {
      openProductLink(url);
      onPressCard?.(url, title); // notify parent (e.g. for analytics)
    }
  }, [cards, onPressCard]);

  const isWatchlisted = useCallback((card: CardData) => {
    const q = (card.itemName || (card as any).title || "").trim().toLowerCase();
    return watchlistQueries.some((wq) => wq.trim().toLowerCase() === q);
  }, [watchlistQueries]);

  return (
    <View style={styles.deckOuter}>
      {/* ── Alternatives counter header ─────────────────────── */}
      {altCount > 0 ? (
        <View style={styles.counterRow}>
          <View style={styles.counterBadge}>
            <Reanimated.View style={useAnimatedStyle(() => ({
              opacity: interpolate(deckEntrance.value, [0, 1], [0, 1], Extrapolation.CLAMP),
              transform: [{ translateY: interpolate(deckEntrance.value, [0, 1], [6, 0], Extrapolation.CLAMP) }] as any,
            }))}>
              <Text style={styles.counterText}>
                {altCount === 1
                  ? "Found 1 cheaper alternative"
                  : `Found ${altCount} cheaper alternatives`}
              </Text>
            </Reanimated.View>
          </View>
          <View style={styles.counterDivider} />
        </View>
      ) : null}

      {/* ── Card stack ──────────────────────────────────────── */}
      <GestureDetector gesture={pan}>
        <View style={styles.deckContainer}>
          {cards.map((card, idx) => (
            <AnimCard
              key={idx}
              data={card}
              index={idx}
              activeIndex={activeIndex}
              deckEntrance={deckEntrance}
              heroPrice={heroPrice}
              isHero={idx === 0}
              isWatchlisted={isWatchlisted(card)}
              onPress={() => handleCardPress(idx)}
              onZoomImage={onZoomImage}
              onToggleWatchlist={() => onToggleWatchlist?.(card)}
              onShare={() => onShare?.(card)}
            />
          ))}
        </View>
      </GestureDetector>

      {/* ── Dot indicator ───────────────────────────────────── */}
      <DotIndicator count={cardCount} activeIndex={activeIndex} />

      {cardCount > 1 ? (
        <RNAnimated.Text style={[styles.swipeHint, { opacity: swipeHintOpacity }]}>
          swipe to compare · swipe right to save
        </RNAnimated.Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  deckOuter: {
    alignItems: "center",
  },

  // ── Counter header ────────────────────────────────────────────────────────
  counterRow: {
    width: CARD.width,
    marginBottom: SP.md,
  },
  counterBadge: {
    alignSelf: "flex-start",
    marginBottom: SP.sm,
  },
  counterText: {
    ...TY.cap,
    color: C.text3,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  counterDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
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
