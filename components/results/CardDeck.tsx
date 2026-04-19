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

  // Lowest price across all cards — used to badge VALUE FLOOR
  const allPrices = cards.map((c) => Number(c.price ?? Infinity)).filter(Number.isFinite);
  const lowestPrice = allPrices.length ? Math.min(...allPrices) : null;

  const activeIndex  = useSharedValue(0);
  const startIndex   = useSharedValue(0);
  const deckEntrance = useSharedValue(0);
  const [_snappedIndex, setSnappedIndex] = useState(0);

  // Swipe hint fade-in: appears after 600ms
  const swipeHintOpacity = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    activeIndex.value  = 0;
    setSnappedIndex(0);
    deckEntrance.value = 0;
    // Softer spring → longer travel → stagger feels like a cascade waterfall
    deckEntrance.value = withSpring(1, { mass: 1.3, damping: 24, stiffness: 100 });

    // Swipe hint fades in after 600ms — Panthere curve (heavy → silk)
    swipeHintOpacity.setValue(0);
    const hint = RNAnimated.sequence([
      RNAnimated.delay(600),
      RNAnimated.timing(swipeHintOpacity, {
        toValue: 1,
        duration: 420,
        easing: panthereRN,
        useNativeDriver: true,
      }),
    ]);
    hint.start();
    return () => { try { hint.stop(); } catch {} };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const counterEntranceStyle = useAnimatedStyle(() => ({
    opacity: interpolate(deckEntrance.value, [0, 1], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(deckEntrance.value, [0, 1], [6, 0], Extrapolation.CLAMP) }] as any,
  }));

  return (
    <View style={styles.deckOuter}>
      {/* ── Alternatives counter header ─────────────────────── */}
      {altCount > 0 ? (
        <View style={styles.counterRow}>
          <View style={styles.counterBadge}>
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
