/**
 * ResultCard — premium individual result card.
 *
 * Layout: 60% full-bleed image top / 40% glass info panel bottom.
 * Top-right overlay: animated heart (watchlist) + share button.
 *
 * isHero=true  → Best deal: savings, confidence, verdict, score
 * isHero=false → Alternative listing: delta price vs hero
 *
 * No expo-linear-gradient. Gradient via layered semi-transparent Views.
 */
import React, { useCallback, useEffect } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  Share,
  TouchableOpacity,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withSpring,
  withTiming,
  interpolate,
  interpolateColor,
  Extrapolation,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import {
  C, SP, R, TY, SH,
  CARD, IOS,
  verdictStyle, confidenceLabel,
  fmtMoney, fmtPct,
} from "../design/DS";
import { PriceHistoryChart, PriceChartPoint } from "./PriceHistoryChart";
import { CommunityCompsPanel } from "./CommunityCompsPanel";

export interface CardData {
  // Core
  itemName?: string;
  title?: string;
  store?: string;
  source?: string;
  price?: number | null;
  totalPrice?: number | null;
  url?: string | null;
  buyLink?: string | null;
  image?: string | null;

  // Hero-only (from activeResult)
  photoUri?: string | null;
  scannedPrice?: number | null;
  savedAmount?: number | null;
  cheaperPct?: number | null;
  visionConfidence?: number | null;
  buyVerdict?: string | null;
  buyScore?: number | null;
  resaleVelocity?: string | null;
  historicalLow?: number | null;
  historicalHigh?: number | null;
  avgMarket?: number | null;
  // Feature 2: price history chart
  priceChartPoints?: PriceChartPoint[] | null;
  // Feature 4: condition
  conditionLabel?: string | null;
  // Feature 8: best time to buy
  trendIntel?: any | null;
  seasonalFlip?: any | null;
  // Feature 10: authenticity
  authenticityIntel?: any | null;
  // Feature 4: eBay sold comps (+ Feature 3: velocity)
  ebaySoldComps?: {
    low: number; median: number; high: number; count: number;
    soldCount30d?: number;
    avgDaysToSell?: number | null;
    velocityTier?: "hot" | "active" | "steady" | "slow" | "rare";
    velocityLabel?: string;
    hasDates?: boolean;
  } | null;
  // Feature 5: local / hyperlocal comps
  localComps?: { low: number; median: number; high: number; count: number; location: string } | null;
}

interface ResultCardProps {
  data: CardData;
  isHero: boolean;
  /** The hero's price — used by alt cards to compute delta */
  heroPrice?: number | null;
  isWatchlisted?: boolean;
  onPress?: () => void;
  onZoomImage?: (uri: string) => void;
  onToggleWatchlist?: () => void;
  onShare?: () => void;
  /** API base URL — required to fetch community comps on hero card */
  apiBase?: string;
  /** User ID for community comp attribution (optional) */
  userId?: string | null;
}

// ─── Image area height ────────────────────────────────────────────────────────
const IMAGE_H = Math.round(CARD.height * 0.60);
const PANEL_H  = CARD.height - IMAGE_H;

// ─── Heart shutter animation ──────────────────────────────────────────────────
function HeartButton({
  isWatchlisted,
  onToggle,
}: {
  isWatchlisted: boolean;
  onToggle: () => void;
}) {
  const scale = useSharedValue(1);
  const fill  = useSharedValue(isWatchlisted ? 1 : 0);

  // Sync fill when external state changes (e.g. removed from watchlist elsewhere)
  useEffect(() => {
    fill.value = withSpring(isWatchlisted ? 1 : 0, { damping: 16, stiffness: 260 });
  }, [isWatchlisted]);

  const fireHaptic = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
  };

  const tap = Gesture.Tap().onEnd(() => {
    // Shutter: squish → pop → settle
    scale.value = withSequence(
      withSpring(0.68, { damping: 10, stiffness: 400, mass: 0.5 }),
      withSpring(1.42, { damping: 8,  stiffness: 500, mass: 0.4 }),
      withSpring(1.0,  { damping: 16, stiffness: 300, mass: 0.8 }),
    );
    fill.value = withSpring(isWatchlisted ? 0 : 1, { damping: 14, stiffness: 320 });
    runOnJS(fireHaptic)();
    runOnJS(onToggle)();
  });

  const heartStyle = useAnimatedStyle(() => {
    const color = interpolateColor(
      fill.value,
      [0, 1],
      ["rgba(255,255,255,0.92)", C.heart],
    );
    return {
      transform: [{ scale: scale.value }],
      tintColor: color,
    } as any;
  });

  const bgStyle = useAnimatedStyle(() => {
    const bgAlpha = interpolate(fill.value, [0, 1], [0.22, 0.88], Extrapolation.CLAMP);
    const bgR     = interpolate(fill.value, [0, 1], [255, 255],   Extrapolation.CLAMP);
    const bgG     = interpolate(fill.value, [0, 1], [255, 59],    Extrapolation.CLAMP);
    const bgB     = interpolate(fill.value, [0, 1], [255, 85],    Extrapolation.CLAMP);
    return {
      backgroundColor: `rgba(${bgR},${bgG},${bgB},${bgAlpha})`,
    } as any;
  });

  return (
    <GestureDetector gesture={tap}>
      <Reanimated.View style={[styles.overlayBtn, bgStyle as any]}>
        <Reanimated.View style={heartStyle as any}>
          <Ionicons
            name={isWatchlisted ? "heart" : "heart-outline"}
            size={18}
            color="white"
          />
        </Reanimated.View>
      </Reanimated.View>
    </GestureDetector>
  );
}

// ─── Share button ─────────────────────────────────────────────────────────────
function ShareBtn({ onShare }: { onShare: () => void }) {
  const scale = useSharedValue(1);

  const tap = Gesture.Tap()
    .onBegin(() => { scale.value = withSpring(0.84, { damping: 12, stiffness: 400 }); })
    .onFinalize(() => {
      scale.value = withSpring(1, { damping: 14, stiffness: 300 });
      runOnJS(onShare)();
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={tap}>
      <Reanimated.View style={[styles.overlayBtn, styles.shareBtnBg, style as any]}>
        <Ionicons name="arrow-up-outline" size={17} color="white" />
      </Reanimated.View>
    </GestureDetector>
  );
}

// ─── Sold Velocity Badge ──────────────────────────────────────────────────────
type VelocityComps = NonNullable<CardData["ebaySoldComps"]>;

const VELOCITY_STYLES: Record<string, { bg: string; border: string; icon: string; color: string }> = {
  hot:    { bg: "rgba(255,80,50,0.16)",    border: "rgba(255,80,50,0.35)",    icon: "flame",          color: "rgba(255,140,100,0.95)" },
  active: { bg: "rgba(0,210,120,0.14)",   border: "rgba(0,210,120,0.30)",   icon: "trending-up",    color: "rgba(100,255,170,0.95)" },
  steady: { bg: "rgba(100,180,255,0.12)", border: "rgba(100,180,255,0.26)", icon: "pulse",           color: "rgba(140,210,255,0.92)" },
  slow:   { bg: "rgba(255,200,60,0.12)",  border: "rgba(255,200,60,0.26)",  icon: "time-outline",    color: "rgba(255,215,100,0.88)" },
  rare:   { bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.14)", icon: "hourglass-outline", color: "rgba(200,200,200,0.70)" },
};

function VelocityBadge({ comps }: { comps: VelocityComps }) {
  const tier    = comps.velocityTier ?? "steady";
  const vs      = VELOCITY_STYLES[tier] ?? VELOCITY_STYLES.steady;
  const count   = comps.soldCount30d ?? comps.count;
  const days    = comps.avgDaysToSell;
  const period  = comps.hasDates ? "30d" : "recent";
  const countTxt = `${count} sold${comps.hasDates ? " / " + period : ""}`;
  const daysTxt  = days != null ? ` · ~${days}d to sell` : "";

  return (
    <View style={[velocityStyles.badge, { backgroundColor: vs.bg, borderColor: vs.border }]}>
      <Ionicons name={vs.icon as any} size={11} color={vs.color} />
      <Text style={[velocityStyles.text, { color: vs.color }]}>
        {countTxt}{daysTxt}
      </Text>
    </View>
  );
}

const velocityStyles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: R.pill,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  text: {
    ...TY.cap,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});

// ─── Card label helper ────────────────────────────────────────────────────────
function cardLabel(
  isHero: boolean,
  price: number | null,
  heroPrice: number | null,
  verdict?: string,
): { text: string; bg: string; border: string; color: string } | null {
  if (isHero) {
    const isFlip = /GREAT|FLIP/i.test(verdict || "");
    return isFlip
      ? { text: "BEST FLIP",   bg: "rgba(0,210,120,0.18)",   border: "rgba(0,210,120,0.35)",   color: "rgba(150,255,190,0.95)" }
      : { text: "BEST DEAL",   bg: "rgba(255,255,255,0.12)", border: "rgba(255,255,255,0.28)", color: "rgba(255,255,255,0.96)" };
  }
  if (price == null || heroPrice == null)
    return { text: "CHEAPER ALT", bg: "rgba(0,210,120,0.12)", border: "rgba(0,210,120,0.28)", color: "rgba(120,255,160,0.92)" };
  const pctDiff = ((heroPrice - price) / heroPrice) * 100;
  if (pctDiff >= 18)
    return { text: "HIDDEN GEM",   bg: "rgba(255,200,60,0.14)",  border: "rgba(255,200,60,0.30)",  color: "rgba(255,215,100,0.95)" };
  if (pctDiff > 0)
    return { text: "CHEAPER ALT", bg: "rgba(0,210,120,0.12)", border: "rgba(0,210,120,0.28)", color: "rgba(120,255,160,0.92)" };
  return { text: "PREMIUM PICK", bg: "rgba(255,255,255,0.07)", border: "rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.65)" };
}

// ─── Main card ────────────────────────────────────────────────────────────────
export function ResultCard({
  data,
  isHero,
  heroPrice,
  isWatchlisted = false,
  onPress,
  onZoomImage,
  onToggleWatchlist,
  onShare,
  apiBase,
  userId,
}: ResultCardProps) {
  const imageUri = data.image || data.photoUri || null;
  const price    = Number.isFinite(Number(data.price)) ? Number(data.price) : null;
  const name     = data.itemName || data.title || "Listing";
  const store    = data.store || data.source || null;

  const handleShare = useCallback(async () => {
    if (onShare) { onShare(); return; }
    try {
      await Share.share({
        message: `Found ${name} for ${fmtMoney(price)} on Evan AI — AI-powered price scanner.\nhttps://evanai.app`,
      });
    } catch {}
  }, [name, price, onShare]);

  // Confidence dot color
  const conf = Number(data.visionConfidence ?? 0);
  const confDotColor =
    conf >= 0.7 ? "rgba(120,255,180,0.85)" :
    conf >= 0.5 ? "rgba(255,210,80,0.85)" :
    "rgba(255,100,80,0.80)";

  // Verdict style for hero card
  const verdict = data.buyVerdict ? verdictStyle(data.buyVerdict) : null;

  // Savings (hero only)
  const saved     = Number.isFinite(Number(data.savedAmount)) ? Number(data.savedAmount) : null;
  const savedPct  = Number.isFinite(Number(data.cheaperPct))  ? Number(data.cheaperPct) : null;
  const hasSaving = isHero && saved != null && saved > 0;

  // Delta vs hero (alt cards)
  const delta = (!isHero && heroPrice != null && price != null) ? price - heroPrice : null;
  const label = cardLabel(isHero, price, heroPrice ?? null, data.buyVerdict ?? undefined);

  return (
    <View style={[styles.card, isHero ? SH.cardActive : SH.card]}>
      {/* ── IMAGE SECTION (60%) ───────────────────────────────── */}
      <View style={styles.imageSection}>
        {imageUri ? (
          <TouchableOpacity
            activeOpacity={1}
            onPress={isHero && onZoomImage ? () => onZoomImage(imageUri) : onPress}
            style={StyleSheet.absoluteFillObject}
          >
            <Image
              source={{ uri: imageUri }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
            />
          </TouchableOpacity>
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="image-outline" size={40} color="rgba(255,255,255,0.18)" />
          </View>
        )}

        {/* 3-layer image scrim for cinematic depth */}
        <View style={styles.imageScrim1} pointerEvents="none" />
        <View style={styles.imageScrim2} pointerEvents="none" />
        <View style={styles.imageScrim3} pointerEvents="none" />

        {/* Card label badge (top-left) */}
        {label ? (
          <View style={[styles.labelBadge, { backgroundColor: label.bg, borderColor: label.border }]}>
            <Text style={[styles.labelText, { color: label.color }]}>{label.text}</Text>
          </View>
        ) : null}

        {/* Top-right overlay actions */}
        <View style={styles.overlayActions} pointerEvents="box-none">
          {onToggleWatchlist ? (
            <HeartButton isWatchlisted={isWatchlisted} onToggle={onToggleWatchlist} />
          ) : null}
          <ShareBtn onShare={handleShare} />
        </View>
      </View>

      {/* ── INFO PANEL (40%) ─────────────────────────────────── */}
      <View style={styles.panelOuter}>
        {/* Android backing color */}
        <View style={[StyleSheet.absoluteFillObject, styles.panelAndroidBg]} />
        {IOS ? (
          <BlurView intensity={62} tint="dark" style={StyleSheet.absoluteFillObject} />
        ) : null}
        <View style={[StyleSheet.absoluteFillObject, styles.panelOverlay]} />

        <View style={styles.panelContent}>
          {/* Item name */}
          <Text numberOfLines={1} style={styles.itemName}>{name}</Text>

          {/* Price row */}
          <View style={styles.priceRow}>
            <Text style={[styles.price, isHero && styles.priceHero]}>{fmtMoney(price)}</Text>

            {hasSaving ? (
              <View style={styles.savingsPill}>
                <Ionicons name="arrow-down" size={11} color={C.good} />
                <Text style={styles.savingsText}>
                  {savedPct != null ? `${Math.round(savedPct)}% less` : `save ${fmtMoney(saved)}`}
                </Text>
              </View>
            ) : null}

            {delta != null && !isHero ? (
              <View style={[
                styles.deltaPill,
                { backgroundColor: delta > 0 ? C.dangerBg : C.goodBg,
                  borderColor: delta > 0 ? C.dangerBorder : C.goodBorder }
              ]}>
                <Ionicons
                  name={delta > 0 ? "trending-up" : "trending-down"}
                  size={11}
                  color={delta > 0 ? C.danger : C.good}
                />
                <Text style={[
                  styles.deltaText,
                  { color: delta > 0 ? C.danger : C.good }
                ]}>
                  {delta > 0 ? "+" : ""}{fmtMoney(Math.abs(delta))}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Store + verdict + condition + confidence row */}
          <View style={styles.metaRow}>
            {store ? (
              <Text numberOfLines={1} style={styles.store}>{store}</Text>
            ) : null}

            {isHero && verdict ? (
              <>
                {store ? <View style={styles.metaDot} /> : null}
                <View style={[styles.verdictBadge, { backgroundColor: verdict.bg, borderColor: verdict.border }]}>
                  <Text style={[styles.verdictText, { color: verdict.text }]}>{data.buyVerdict}</Text>
                </View>
              </>
            ) : null}

            {isHero && data.conditionLabel ? (
              <>
                <View style={styles.metaDot} />
                <View style={styles.conditionBadge}>
                  <Text style={styles.conditionText}>{data.conditionLabel}</Text>
                </View>
              </>
            ) : null}

            {isHero && conf > 0 ? (
              <>
                <View style={styles.metaDot} />
                {conf < 0.5 ? (
                  <View style={styles.lowConfRow}>
                    <Ionicons name="warning-outline" size={11} color={C.warn} />
                    <Text style={[styles.confLabel, { color: C.warn }]}>Low confidence</Text>
                  </View>
                ) : (
                  <>
                    <View style={[styles.confDot, { backgroundColor: confDotColor }]} />
                    <Text style={styles.confLabel}>{confidenceLabel(conf)}</Text>
                  </>
                )}
              </>
            ) : null}
          </View>

          {/* Hero-only: price history sparkline (Feature 2) */}
          {isHero ? (
            <PriceHistoryChart
              query={name}
              chartPoints={data.priceChartPoints ?? undefined}
              height={42}
              width={CARD.width - SP.lg * 2}
            />
          ) : null}

          {/* Feature 8: Best time to buy signal */}
          {isHero && (data.seasonalFlip?.topSignal || data.trendIntel?.buyAdvice) ? (
            <View style={styles.intelRow}>
              <Ionicons name="calendar-outline" size={11} color="rgba(130,200,255,0.7)" />
              <Text numberOfLines={2} style={styles.intelText}>
                {data.seasonalFlip?.topSignal || data.trendIntel?.buyAdvice}
              </Text>
            </View>
          ) : null}

          {/* Feature 10: Authenticity signal */}
          {isHero && data.authenticityIntel?.topSignal ? (
            <View style={styles.intelRow}>
              <Ionicons
                name={
                  data.authenticityIntel.tier === "critical" || data.authenticityIntel.tier === "high"
                    ? "shield-outline"
                    : "checkmark-circle-outline"
                }
                size={11}
                color={
                  data.authenticityIntel.tier === "critical" || data.authenticityIntel.tier === "high"
                    ? "rgba(255,160,80,0.85)"
                    : "rgba(120,255,180,0.7)"
                }
              />
              <Text numberOfLines={2} style={[
                styles.intelText,
                (data.authenticityIntel.tier === "critical" || data.authenticityIntel.tier === "high")
                  ? { color: "rgba(255,160,80,0.85)" }
                  : null,
              ]}>
                {data.authenticityIntel.topSignal}
              </Text>
            </View>
          ) : null}

          {/* Feature 3: Sold Velocity Badge */}
          {isHero && data.ebaySoldComps?.count ? (
            <VelocityBadge comps={data.ebaySoldComps} />
          ) : null}

          {/* Feature 5: Local / hyperlocal comps */}
          {isHero && data.localComps?.count ? (
            <View style={styles.intelRow}>
              <Ionicons name="location-outline" size={11} color="rgba(160,255,160,0.75)" />
              <Text numberOfLines={1} style={styles.intelText}>
                {`Near ${data.localComps.location}: $${data.localComps.low}–$${data.localComps.high} · median $${data.localComps.median}`}
              </Text>
            </View>
          ) : null}

          {/* Community comps (hero only) */}
          {isHero && apiBase ? (
            <CommunityCompsPanel
              query={data.itemName || data.title || ""}
              scannedPrice={
                Number.isFinite(Number(data.scannedPrice)) ? Number(data.scannedPrice) : null
              }
              apiBase={apiBase}
              userId={userId}
            />
          ) : null}

          {/* Alt: CTA bar */}
          {!isHero ? (
            <View style={styles.viewListingBar}>
              <Text style={styles.viewListingText}>View listing  →</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    width: CARD.width,
    height: CARD.height,
    borderRadius: CARD.radius,
    overflow: "hidden",
    backgroundColor: "#0a0a0a",
  },

  // ── Image section ──────────────────────────────────────────────────────────
  imageSection: {
    width: "100%",
    height: IMAGE_H,
    backgroundColor: "#111",
    overflow: "hidden",
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0e0e0e",
  },
  imageScrim1: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  imageScrim2: {
    position: "absolute",
    bottom: 80,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  imageScrim3: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: "rgba(0,0,0,0.12)",
  },

  // ── Overlay actions (heart + share) ───────────────────────────────────────
  overlayActions: {
    position: "absolute",
    top: SP.md,
    right: SP.md,
    flexDirection: "row",
    gap: SP.xs,
  },
  overlayBtn: {
    width: 38,
    height: 38,
    borderRadius: R.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.38)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  shareBtnBg: {
    backgroundColor: "rgba(255,255,255,0.14)",
  },

  // ── Info panel ────────────────────────────────────────────────────────────
  panelOuter: {
    flex: 1,
    overflow: "hidden",
  },
  panelAndroidBg: {
    backgroundColor: "rgba(6,6,6,0.94)",
  },
  panelOverlay: {
    backgroundColor: "rgba(8,8,8,0.28)",
  },
  panelContent: {
    flex: 1,
    paddingHorizontal: SP.lg,
    paddingTop: SP.md,
    paddingBottom: SP.sm,
    justifyContent: "space-between",
  },

  // ── Item name ─────────────────────────────────────────────────────────────
  itemName: {
    ...TY.h2,
    color: C.text,
    marginBottom: 2,
  },

  // ── Price row ─────────────────────────────────────────────────────────────
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
    flexWrap: "nowrap",
  },
  price: {
    ...TY.price,
    color: C.text,
    flexShrink: 0,
  },
  savingsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: SP.sm,
    paddingVertical: 5,
    borderRadius: R.pill,
    backgroundColor: C.goodBg,
    borderWidth: 1,
    borderColor: C.goodBorder,
  },
  savingsText: {
    ...TY.label,
    color: C.good,
    fontSize: 11,
    fontWeight: "900",
  },
  deltaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: SP.sm,
    paddingVertical: 3,
    borderRadius: R.pill,
    borderWidth: 1,
  },
  deltaText: {
    ...TY.label,
    fontSize: 11,
  },

  // ── Meta row ──────────────────────────────────────────────────────────────
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: SP.xs,
    overflow: "hidden",
  },
  store: {
    ...TY.label,
    color: C.text3,
    flexShrink: 1,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: C.text4,
    flexShrink: 0,
  },
  confDot: {
    width: 7,
    height: 7,
    borderRadius: R.pill,
    flexShrink: 0,
  },
  confLabel: {
    ...TY.label,
    color: C.text3,
    flexShrink: 0,
  },
  verdictBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: R.xs,
    borderWidth: 1,
    flexShrink: 0,
  },
  verdictText: {
    ...TY.cap,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },

  // ── Condition badge (Feature 4) ───────────────────────────────────────────
  conditionBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: R.xs,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    flexShrink: 0,
  },
  conditionText: {
    ...TY.cap,
    color: C.text3,
    fontSize: 9,
  },

  // ── Low confidence warning (Feature 3) ────────────────────────────────────
  lowConfRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },

  // ── Intelligence rows (Features 8 & 10) ──────────────────────────────────
  intelRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    marginTop: 3,
    borderLeftWidth: 1.5,
    borderLeftColor: "rgba(255,255,255,0.12)",
    paddingLeft: 6,
  },
  intelText: {
    ...TY.cap,
    color: "rgba(255,255,255,0.45)",
    fontSize: 9,
    flex: 1,
    lineHeight: 14,
  },

  // ── Alt view listing CTA ──────────────────────────────────────────────────
  viewListingBar: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
    alignItems: "flex-end",
  },
  viewListingText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.35)",
    fontWeight: "600",
    letterSpacing: 0.5,
  },

  // ── Card label badge ──────────────────────────────────────────────────────
  labelBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  labelText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },

  // ── Hero price override ───────────────────────────────────────────────────
  priceHero: {
    ...TY.displayLg,
  },
});
