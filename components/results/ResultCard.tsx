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
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  Share,
  TouchableOpacity,
  Pressable,
  Platform,
} from "react-native";

const IS_ANDROID = Platform.OS === "android";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withSpring,
  withTiming,
  withRepeat,
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
  fmtMoney, Feedback,
} from "../design/DS";
import { PriceHistoryChart, PriceChartPoint } from "./PriceHistoryChart";
import { CommunityCompsPanel } from "./CommunityCompsPanel";
import { PremiumIntelPanel } from "./PremiumIntelPanel";
import { routeListingClick } from "../../services/revenue/TransactionRouter";

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

  // Tweak 1 — computed from priceChartPoints; no new server field needed
  // (velocitySignal derived at render time via computeVelocitySignal)

  // Tweak 3 — identification evidence pack
  visionQuery?: string | null;
  scanWhy?: string[] | null;
  rankWhy?: string[] | null;
  // Visual DNA — from vision pipeline identity object
  visionIdentity?: any | null;
}

interface ResultCardProps {
  data: CardData;
  isHero: boolean;
  /** The hero's price — used by alt cards to compute delta */
  heroPrice?: number | null;
  /** Scanned / target price — drives Market Spectrum badge logic */
  scannedPrice?: number | null;
  /** True when this card has the lowest price across the deck */
  isLowest?: boolean;
  isWatchlisted?: boolean;
  onPress?: () => void;
  onZoomImage?: (uri: string) => void;
  onToggleWatchlist?: () => void;
  onShare?: () => void;
  /** Vault save callback — fires after captureRef with temp URI + item metadata */
  onVaultSave?: (entry: { id: string; tempUri: string; name: string; price: number | null; potentialProfit: number | null }) => void;
  /** Apply 15% platform fee deduction to all profit calculations */
  isNet?: boolean;
  /** API base URL — required to fetch community comps on hero card */
  apiBase?: string;
  /** User ID for community comp attribution (optional) */
  userId?: string | null;
  /** Scan session ID — used for click-through attribution */
  scanId?: string | null;
  /** Whether user has Pro access (gates PremiumIntelPanel) */
  isPro?: boolean;
  /** Called when paywall CTA tapped inside PremiumIntelPanel */
  onUnlockPro?: () => void;
  /** Called when user taps "Sell?" on hero card — opens SellSidePanel */
  onSell?: () => void;
}

// ─── Image area height ────────────────────────────────────────────────────────
const IMAGE_H = Math.round(CARD.height * 0.60);
const _PANEL_H  = CARD.height - IMAGE_H;

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <Reanimated.View
        style={[styles.overlayBtn, bgStyle as any]}
        renderToHardwareTextureAndroid={IS_ANDROID}
        shouldRasterizeIOS={!IS_ANDROID}
      >
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
      <Reanimated.View
        style={[styles.overlayBtn, styles.shareBtnBg, style as any]}
        renderToHardwareTextureAndroid={IS_ANDROID}
        shouldRasterizeIOS={!IS_ANDROID}
      >
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
  steady: { bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.14)", icon: "pulse",           color: "rgba(255,255,255,0.72)" },
  slow:   { bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.12)", icon: "time-outline",    color: "rgba(255,255,255,0.58)" },
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

  // Flame pulse for hot tier
  const flamePulse = useSharedValue(1);
  useEffect(() => {
    if (tier !== "hot") return;
    flamePulse.value = withRepeat(
      withSequence(
        withTiming(0.45, { duration: 750 }),
        withTiming(1.0,  { duration: 750 }),
      ),
      -1, false,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier]);
  const flameStyle = useAnimatedStyle(() => ({ opacity: flamePulse.value }));

  const badge = (
    <View style={[velocityStyles.badge, { backgroundColor: vs.bg, borderColor: vs.border }]}>
      {tier === "hot" ? (
        <Reanimated.View
          style={flameStyle as any}
          renderToHardwareTextureAndroid={IS_ANDROID}
          shouldRasterizeIOS={!IS_ANDROID}
        >
          <Ionicons name="flame" size={11} color={vs.color} />
        </Reanimated.View>
      ) : (
        <Ionicons name={vs.icon as any} size={11} color={vs.color} />
      )}
      <Text
        style={[velocityStyles.text, { color: vs.color }]}
        allowFontScaling={false}
        numberOfLines={1}
      >
        {countTxt}{daysTxt}
      </Text>
    </View>
  );

  return badge;
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

// ─── Signal Velocity — 14-day price change (Tweak 1) ─────────────────────────
export interface VelocitySignal {
  delta14d: number;       // % change over last 14 days
  isVolatile: boolean;    // true when |delta| > 15%
  direction: "up" | "down" | "flat";
}

export function computeVelocitySignal(points: PriceChartPoint[]): VelocitySignal | null {
  if (!points || points.length < 2) return null;
  const cutoff14d = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const sorted = [...points].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  const latest = sorted[sorted.length - 1];
  const priceNow = latest.median ?? latest.low ?? null;
  // Best point at or before the 14-day boundary; fall back to oldest
  const old = sorted.filter(p => (p.ts ?? 0) <= cutoff14d).pop() ?? sorted[0];
  const price14dAgo = old.median ?? old.low ?? null;
  if (priceNow == null || price14dAgo == null || price14dAgo === 0) return null;
  const delta14d = ((priceNow - price14dAgo) / price14dAgo) * 100;
  return {
    delta14d,
    isVolatile: Math.abs(delta14d) > 15,
    direction: delta14d > 1 ? "up" : delta14d < -1 ? "down" : "flat",
  };
}

function VolatileAssetBadge({ signal }: { signal: VelocitySignal }) {
  const rising = signal.direction === "up";
  const color  = rising ? C.warn    : C.good;
  const bg     = rising ? C.warnBg  : C.goodBg;
  const border = rising ? C.warnBorder : C.goodBorder;
  const icon   = (rising ? "trending-up" : "trending-down") as any;
  const arrow  = rising ? "↑" : "↓";
  return (
    <View style={[velocityStyles.badge, { backgroundColor: bg, borderColor: border, marginTop: 2 }]}>
      <Ionicons name={icon} size={11} color={color} />
      <Text style={[velocityStyles.text, { color }]}>
        {`VOLATILE  ${arrow}${Math.abs(Math.round(signal.delta14d))}% / 14d`}
      </Text>
    </View>
  );
}

// ─── Card label helper ────────────────────────────────────────────────────────
// Market Spectrum labels use scannedPrice as the anchor (what user is evaluating).
// Hero labels additionally respond to isLowest (VALUE FLOOR) and flip verdict.
// Alt labels: PREMIUM ANCHOR >2.5x, MARKET ALIGN ±20%, HIDDEN GEM, CHEAPER ALT.
function cardLabel(
  isHero: boolean,
  price: number | null,
  heroPrice: number | null,
  scannedPrice: number | null,
  isLowest: boolean,
  verdict?: string,
): { text: string; bg: string; border: string; color: string; heavy?: boolean } | null {
  // Restrained palette: dark backings with tinted text so badges remain
  // crisp against bright product photos (the prior 10%-opacity green-on-green
  // washed out completely over the white sunglasses image in screenshot 2).
  if (isHero) {
    if (isLowest)
      return { text: "LOWEST", bg: "rgba(8,18,12,0.78)", border: "rgba(180,255,200,0.45)", color: "rgba(180,255,200,1)" };
    if (/GREAT|FLIP/i.test(verdict || ""))
      return { text: "TOP FLIP", bg: "rgba(8,18,12,0.78)", border: "rgba(180,255,200,0.45)", color: "rgba(180,255,200,1)" };
    return { text: "BEST DEAL", bg: "rgba(12,12,12,0.78)", border: "rgba(255,255,255,0.35)", color: "rgba(255,255,255,1)" };
  }

  if (price == null) return null;

  if (Number.isFinite(scannedPrice) && price > scannedPrice! * 2.5)
    return { text: "ANCHOR", bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.55)" };

  if (Number.isFinite(scannedPrice) && price >= scannedPrice! * 0.80 && price <= scannedPrice! * 1.20)
    return { text: "MATCH", bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.16)", color: "rgba(255,255,255,0.75)" };

  if (heroPrice == null)
    return { text: "CHEAPER", bg: "rgba(8,18,12,0.72)", border: "rgba(180,255,200,0.38)", color: "rgba(180,255,200,0.98)" };
  const pctDiff = ((heroPrice - price) / heroPrice) * 100;
  if (pctDiff >= 18)
    return { text: "HIDDEN GEM", bg: "rgba(8,18,12,0.78)", border: "rgba(180,255,200,0.45)", color: "rgba(180,255,200,1)" };
  if (pctDiff > 0)
    return { text: "CHEAPER", bg: "rgba(8,18,12,0.72)", border: "rgba(180,255,200,0.38)", color: "rgba(180,255,200,0.98)" };
  return { text: "PREMIUM", bg: "rgba(12,12,12,0.68)", border: "rgba(255,255,255,0.25)", color: "rgba(255,255,255,0.78)" };
}

// ─── Price Ladder ─────────────────────────────────────────────────────────────
const LADDER_TIERS = [
  { label: "QUICK FLIP",    sub: "Liquidate <48h",      mult: 0.90, color: "rgba(100,200,255,0.9)" },
  { label: "MARKET VALUE",  sub: "Std sell · 1–2 wks",  mult: 1.00, color: "rgba(80,255,150,0.9)"  },
  { label: "TOP TIER",      sub: "Collector / Premium",  mult: 1.10, color: "rgba(255,200,60,0.9)"  },
];
const FEE = 0.85; // 15% platform fee for NET mode

function PriceLadder({ avgMarket, cost, isNet }: { avgMarket: number; cost: number; isNet: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={ladderStyles.wrap}>
      <Pressable onPress={() => setOpen(v => !v)} style={ladderStyles.header}>
        <Text style={ladderStyles.headerIcon}>▲</Text>
        <Text style={ladderStyles.headerText}>PROFIT SCENARIOS{isNet ? " · NET" : ""}</Text>
        <Text style={ladderStyles.chevron}>{open ? "▲" : "▼"}</Text>
      </Pressable>
      {open ? (
        <View style={ladderStyles.tiers}>
          {LADDER_TIERS.map((t, i) => {
            const sellPrice = avgMarket * t.mult * (isNet ? FEE : 1.0);
            const profit = sellPrice - cost;
            return (
              <View key={t.label} style={[ladderStyles.tier, i < 2 && ladderStyles.tierBorder]}>
                <View style={ladderStyles.tierLeft}>
                  <View style={[ladderStyles.tierBar, { height: 5 + i * 3, backgroundColor: t.color }]} />
                  <View>
                    <Text style={ladderStyles.tierLabel}>{t.label}</Text>
                    <Text style={ladderStyles.tierSub}>{t.sub}{isNet ? " · after fees" : ""}</Text>
                  </View>
                </View>
                <Text style={[ladderStyles.tierProfit, { color: profit > 0 ? (isNet ? "#00d4a0" : t.color) : C.danger }]}>
                  {profit > 0 ? "+" : ""}{fmtMoney(profit)}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const ladderStyles = StyleSheet.create({
  wrap:       { marginTop: 4 },
  header:     { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 3 },
  headerIcon: { fontSize: 7, color: "rgba(255,200,60,0.5)" },
  headerText: { ...TY.cap, color: "rgba(255,200,60,0.72)", flex: 1 },
  chevron:    { fontSize: 7, color: C.text4 },
  tiers:      { gap: 3, marginTop: 2 },
  tier:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 3 },
  tierBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.06)", paddingBottom: 4 },
  tierLeft:   { flexDirection: "row", alignItems: "center", gap: 5 },
  tierBar:    { width: 2.5, borderRadius: 1.5 },
  tierLabel:  { ...TY.cap, color: C.text3, fontSize: 9 },
  tierSub:    { ...TY.cap, color: C.text4, fontSize: 8, marginTop: 1 },
  tierProfit: { ...TY.label, fontSize: 11, fontWeight: "900" as const },
});

// ─── Main card ────────────────────────────────────────────────────────────────
export function ResultCard({
  data,
  isHero,
  heroPrice,
  scannedPrice,
  isLowest = false,
  isWatchlisted = false,
  onPress,
  onZoomImage,
  onToggleWatchlist,
  onShare,
  onVaultSave,
  isNet = false,
  apiBase,
  userId,
  scanId,
  isPro = false,
  onUnlockPro,
  onSell,
}: ResultCardProps) {
  const imageUri = data.image || data.photoUri || null;
  const price    = Number.isFinite(Number(data.price)) ? Number(data.price) : null;
  const name     = data.itemName || data.title || "Listing";
  const store    = data.store || data.source || null;

  const cardRef = useRef<View>(null);
  const [capturingShare, setCapturingShare] = useState(false);

  const handleShare = useCallback(async () => {
    if (capturingShare) return;
    setCapturingShare(true);
    Feedback.save();
    try {
      const uri = await captureRef(cardRef, { format: "png", quality: 0.95 });
      // Save to vault (caller copies to permanent storage)
      if (onVaultSave) {
        const costBasis = Number.isFinite(Number(data.scannedPrice ?? scannedPrice))
          ? Number(data.scannedPrice ?? scannedPrice) : null;
        const potentialProfit = isHero && data.avgMarket != null && costBasis != null
          ? Number(data.avgMarket) - costBasis : null;
        onVaultSave({ id: String(Date.now()), tempUri: uri, name, price, potentialProfit });
      }
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          dialogTitle: isHero ? "Check out this deal — Evan AI" : "Found a cheaper listing — Evan AI",
          mimeType: "image/png",
        });
        Feedback.sold();
        setCapturingShare(false);
        return;
      }
    } catch {}
    setCapturingShare(false);
    // Fallback to text share
    if (onShare) { onShare(); return; }
    try {
      await Share.share({
        message: `Found ${name} for ${fmtMoney(price)} on Evan AI — AI-powered price scanner.\nhttps://evanai.app`,
      });
    } catch {}
  }, [capturingShare, name, price, isHero, onShare, onVaultSave, data.avgMarket, data.scannedPrice, scannedPrice]);

  const conf = Number(data.visionConfidence ?? 0);

  // Savings (hero only)
  const saved     = Number.isFinite(Number(data.savedAmount)) ? Number(data.savedAmount) : null;
  const savedPct  = Number.isFinite(Number(data.cheaperPct))  ? Number(data.cheaperPct) : null;
  const hasSaving = isHero && saved != null && saved > 0;

  // Delta vs hero (alt cards)
  const delta = (!isHero && heroPrice != null && price != null) ? price - heroPrice : null;
  const _scannedPrice = Number.isFinite(Number(scannedPrice ?? data.scannedPrice))
    ? Number(scannedPrice ?? data.scannedPrice)
    : null;
  const label = cardLabel(isHero, price, heroPrice ?? null, _scannedPrice, isLowest, data.buyVerdict ?? undefined);

  // Tweak 1: Signal Velocity — compute once at render
  const velocitySignal = (isHero && data.priceChartPoints?.length)
    ? computeVelocitySignal(data.priceChartPoints)
    : null;

  // Margin range (App Store compliant: no "Guaranteed" language)
  const confLow  = Number.isFinite(Number(data.historicalLow))  ? Number(data.historicalLow)  : null;
  const confHigh = Number.isFinite(Number(data.historicalHigh)) ? Number(data.historicalHigh) : null;
  const hasConfRange = isHero && confLow != null && confHigh != null && confHigh > confLow;

  return (
    <View ref={cardRef} collapsable={false} style={[styles.card, isHero ? SH.cardActive : SH.card]}>
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
          <View style={[
            styles.labelBadge,
            { backgroundColor: label.bg, borderColor: label.border },
            label.heavy ? styles.labelBadgeHeavy : null,
          ]}>
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              style={[styles.labelText, { color: label.color }]}
            >
              {label.text}
            </Text>
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
          {/* Item name — 2-line clamp so long titles ("Retro Oval Cat Eye
              Sunglasses for Women — Black Plastic Frame…") wrap instead of
              being chopped with an ellipsis after one word. Three+ lines
              would push the price/store rows off the panel, so 2 is the
              ceiling. */}
          <Text numberOfLines={2} allowFontScaling={false} style={styles.itemName}>{name}</Text>

          {/* Price row — sub-pixel pinned: flex baseline + fixed line-height via TY.price/displayLg */}
          <View style={styles.priceRow}>
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              style={[styles.price, isHero && styles.priceHero]}
            >
              {fmtMoney(price)}
            </Text>

            {hasSaving ? (
              <View style={styles.savingsPill}>
                <Ionicons name="arrow-down" size={11} color={C.good} />
                <Text style={styles.savingsText} allowFontScaling={false} numberOfLines={1}>
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
                <Text
                  allowFontScaling={false}
                  numberOfLines={1}
                  style={[
                    styles.deltaText,
                    { color: delta > 0 ? C.danger : C.good }
                  ]}
                >
                  {delta > 0 ? "+" : ""}{fmtMoney(Math.abs(delta))}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Store + condition — minimal context, no scoring labels */}
          <View style={styles.metaRow}>
            {store ? (
              <Text numberOfLines={1} allowFontScaling={false} style={styles.store}>{store}</Text>
            ) : null}

            {isHero && data.conditionLabel ? (
              <>
                {store ? <View style={styles.metaDot} /> : null}
                <Text style={styles.conditionLine} allowFontScaling={false} numberOfLines={1}>
                  {data.conditionLabel}
                </Text>
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

          {/* Margin range — quiet, single line */}
          {hasConfRange ? (
            <View style={styles.confRangeRow}>
              <Text style={styles.confRangeText} allowFontScaling={false} numberOfLines={1}>
                {`${fmtMoney(confLow)} – ${fmtMoney(confHigh)}`}
              </Text>
            </View>
          ) : null}

          {/* Feature 8: Best time to buy signal */}
          {isHero && (data.seasonalFlip?.topSignal || data.trendIntel?.buyAdvice) ? (
            <View style={styles.intelRow}>
              <Ionicons name="calendar-outline" size={11} color="rgba(255,255,255,0.50)" />
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

          {/* Tweak 1: Volatile Asset Badge — fires when 14d price delta > 15% */}
          {velocitySignal?.isVolatile ? (
            <VolatileAssetBadge signal={velocitySignal} />
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

          {/* Price Ladder — profit scenario breakdown (hero + avgMarket + scannedPrice) */}
          {isHero && data.avgMarket != null && _scannedPrice != null ? (
            <PriceLadder avgMarket={Number(data.avgMarket)} cost={_scannedPrice} isNet={isNet} />
          ) : null}

          {/* Hero: Premium Intel Panel (pro gated) */}
          {isHero ? (
            <PremiumIntelPanel
              costBasis={_scannedPrice}
              avgMarket={Number.isFinite(Number(data.avgMarket)) ? Number(data.avgMarket) : null}
              source={store}
              verdict={data.buyVerdict}
              confidence={conf}
              dealScore={data.buyScore ?? null}
              trendIntel={data.trendIntel}
              authenticityIntel={data.authenticityIntel}
              ebaySoldComps={data.ebaySoldComps}
              isPro={isPro}
              onUnlock={onUnlockPro ?? (() => {})}
            />
          ) : null}

          {/* Hero: tracked buy CTA */}
          {isHero && (data.url ?? data.buyLink) ? (
            <TouchableOpacity
              activeOpacity={0.72}
              onPress={() =>
                routeListingClick(data.url ?? data.buyLink, {
                  scanId,
                  userId,
                  itemName: name,
                  listingPrice: price,
                  source: store,
                  cardRole: "hero",
                  intent: "buy",
                })
              }
              style={styles.heroBuyBar}
            >
              <Ionicons name="cart-outline" size={13} color="rgba(120,255,170,0.85)" />
              <Text style={styles.heroBuyText}>Buy Now  →</Text>
            </TouchableOpacity>
          ) : null}

          {/* Hero: sell mode trigger */}
          {isHero && onSell ? (
            <TouchableOpacity
              activeOpacity={0.72}
              onPress={onSell}
              style={styles.sellBar}
            >
              <Ionicons name="storefront-outline" size={12} color={C.text3} />
              <Text style={styles.sellBarText}>Want to sell this?  →</Text>
            </TouchableOpacity>
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

          {/* Alt: Tracked listing CTA */}
          {!isHero ? (
            <TouchableOpacity
              activeOpacity={0.72}
              onPress={() =>
                routeListingClick(data.url ?? data.buyLink, {
                  scanId,
                  userId,
                  itemName: name,
                  listingPrice: price,
                  source: store,
                  cardRole: "alt",
                  intent: "buy",
                })
              }
              style={styles.viewListingBar}
            >
              <Text style={styles.viewListingText}>View listing  →</Text>
            </TouchableOpacity>
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
  conditionLine: {
    ...TY.label,
    color: C.text3,
    flexShrink: 1,
  },

  // ── Margin range — single quiet line, no "Est. margin" label ─────────────
  confRangeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  confRangeText: {
    fontSize: 11,
    fontWeight: "700",
    color: C.text3,
    letterSpacing: 0.2,
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

  // ── Hero buy CTA ──────────────────────────────────────────────────────────
  heroBuyBar: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 5,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,210,120,0.14)",
  },
  heroBuyText: {
    fontSize: 11,
    color: "rgba(120,255,170,0.80)",
    fontWeight: "700",
    letterSpacing: 0.5,
  },

  // ── Sell mode trigger ────────────────────────────────────────────────────
  sellBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  sellBarText: {
    fontSize: 10,
    fontWeight: "700",
    color: C.text3,
    letterSpacing: 0.3,
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
  labelBadgeHeavy: {
    borderWidth: 1.5,
    shadowColor: "rgba(180,140,255,1)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
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
