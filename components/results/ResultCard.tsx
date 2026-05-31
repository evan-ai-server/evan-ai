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
// Pillar 3B — expo-image replaces RN core <Image>. Gains: disk+memory
// cache (no re-decode on swipe back), built-in transition prop (180ms
// crossfade from placeholder to image, no manual opacity animation),
// no NSException on malformed URIs (returns onError instead of throwing
// from the native side), and a stable `recyclingKey` so swapping the
// hero on swipe doesn't reuse a stale bitmap. Card layout / sizing /
// scrim stack are all preserved exactly.
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withSpring,
  withTiming,
  withRepeat,
  withDelay,
  Easing,
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
import {
  evidenceLabel as _evidenceLabel,
  evidenceLabelShort as _evidenceLabelShort,
  cardActionLabel as _cardActionLabel,
  deriveCardBullets as _deriveCardBullets,
  deriveMatchPercent as _deriveMatchPercent,
  isVerifiedListing as _isVerifiedListing,
  isPricingSignal as _isPricingSignal,
  isOracleEstimate as _isOracleEstimate,
  type MarketCard,
} from "./marketIntel";

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
  /** Pillar 1.7 — surfaced for the deck-wide BEST MATCH computation. */
  matchScore?: number | null;
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
  // URL trust fields (from backend sanitizeOutboundListingForClient)
  clickable?: boolean | null;
  evidenceQuality?: "verified_listing" | "pricing_signal" | "oracle_estimate" | "legacy_unknown" | null;
  isVerifiedListing?: boolean | null;
  isPricingEvidenceOnly?: boolean | null;
  directUrl?: string | null;
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
  /**
   * Pillar 1.7 — true when this card has the highest visual match score
   * (matchScore or visionConfidence) across the deck. Drives the
   * "BEST MATCH" badge so the label only appears on the card that
   * actually earned it. Computed once in CardDeck so the predicate is
   * consistent across hero + alts.
   */
  isBestMatch?: boolean;
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
// Pillar 1.8.6 — image ratio dropped 0.52 → 0.46 in tandem with CARD.height
// shrinking 380 → 350 (see DS.ts). The product photo still anchors the
// card's upper half and is unmistakably the hero element, but it no
// longer crowds out the title/price/store/bullets stack. At cap 350 the
// image is 161px tall (was 197), panel is 189px tall (was 183) — image
// loses 36px, panel gains 6px, total card loses 30px so Market Depth
// and Evan's Read both rise the same amount on screen.
const IMAGE_H = Math.round(CARD.height * 0.46);
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
  // Parent-owned onToggle could throw (e.g. watchlist storage failure). The
  // worklet→JS hop won't survive an unhandled rejection on some configs, so
  // every callback fired from this gesture goes through a try/catch wrapper.
  const safeToggle = () => {
    try { onToggle(); }
    catch (e: any) { console.log("CARD_HEART_ERROR", { error: e?.message || String(e) }); }
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
    runOnJS(safeToggle)();
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
// The top-right arrow. Historically wrapped in a Gesture.Tap that ran
// `runOnJS(onShare)()` from a worklet; when onShare was an async function it
// would return a floating Promise into the worklet→JS hop and any captureRef
// / Sharing failure (image not loaded, ref null, NSException from view-shot)
// became an unhandled rejection that tore the app down. Plain Pressable +
// opacity feedback avoids the worklet hop entirely. Disabled state mirrors
// the share lifecycle so double-taps can't stack captureRef calls.
function ShareBtn({ onShare, disabled }: { onShare: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        try {
          onShare();
        } catch (e: any) {
          console.log("CARD_ARROW_PRESS_ERROR", { error: e?.message || String(e) });
        }
      }}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [
        styles.overlayBtn,
        styles.shareBtnBg,
        { opacity: disabled ? 0.55 : pressed ? 0.78 : 1 },
      ]}
    >
      <Ionicons name="arrow-up-outline" size={17} color="white" />
    </Pressable>
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
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 6.5,
    paddingVertical: 3,
    borderRadius: R.pill,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 3,
  },
  text: {
    ...TY.cap,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.25,
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

// ─── Premium polish primitives ───────────────────────────────────────────────
// These three components add the "luxury AI scanner" feel on top of the hero
// card. None require new server fields — they animate or derive from data
// the card already receives.

// AmbientGlow — soft pulsing colored aura behind the active (hero) card. The
// resale-terminal brand signature: a quiet green wash that the eye reads as
// "this card is alive." Color shifts subtly with verdict (BUY=fuller green,
// PASS=warm amber, HOLD=muted green-grey) but the green family persists
// across all states so the deck has a consistent emotional tone, not a
// traffic-light. Runs forever on the UI thread via Reanimated's worklet loop.
type GlowTone = "buy" | "hold" | "pass";
function AmbientGlow({ tone }: { tone: GlowTone }) {
  const pulse = useSharedValue(0.55);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.95, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.55, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const animStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const color =
    tone === "buy"  ? "rgba(80,255,160,0.26)"   :
    tone === "pass" ? "rgba(255,140,110,0.18)"  :
                      "rgba(120,220,170,0.12)";
  return (
    <Reanimated.View
      pointerEvents="none"
      style={[styles.ambientGlow, { backgroundColor: color }, animStyle as any]}
      renderToHardwareTextureAndroid={IS_ANDROID}
      shouldRasterizeIOS={!IS_ANDROID}
    />
  );
}

// BadgeShimmer — one-time diagonal highlight sweep across the badge on
// mount. Used on positive-status labels so the eye instantly catches
// "this is the winning card" the moment the deck lands. Runs once,
// then the View remains off-screen translateX so it can't catch taps
// or paint cost. Updated set after the Pillar 1.7 badge taxonomy cut.
const SHIMMER_LABELS = new Set([
  "LOWEST", "TOP FLIP", "BEST MATCH",
  "RARE LOW", "UNCOMMON",
]);
function BadgeShimmer() {
  const x = useSharedValue(-100);
  useEffect(() => {
    x.value = -100;
    x.value = withDelay(420, withTiming(180, { duration: 1100, easing: Easing.out(Easing.cubic) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Cast transform — TS narrows each tuple entry by discriminated union,
  // and mixing translateX + skewX in one array trips the type guard even
  // though it's a perfectly valid RN transform at runtime.
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { skewX: "-22deg" }] as any,
  }));
  return (
    <Reanimated.View
      pointerEvents="none"
      style={[styles.shimmer, animStyle as any]}
    />
  );
}

// ─── Hero insight derivation ─────────────────────────────────────────────────
// All four helpers below read the SAME data the card already gets — no new
// server fields. They turn quiet numbers into the emotional signals the
// user actually reads ("Strong market data · 12 comps", "Selling fast",
// "RARE LOW"). Returns null when the underlying signal is too thin to
// claim anything, so the UI stays quiet instead of guessing.

function deriveConfidence(data: CardData): string | null {
  const c = Number(data.ebaySoldComps?.count ?? 0);
  const conf = Number(data.visionConfidence ?? 0);
  if (c >= 12) return "Strong market data";
  if (c >= 6)  return `Active market · ${c} comps`;
  if (c >= 3)  return `Verified · ${c} comps`;
  if (c >= 1)  return `Limited history · ${c} comp${c === 1 ? "" : "s"}`;
  if (conf >= 0.85) return "Visual match verified";
  if (conf >= 0.55) return `Visual match ${Math.round(conf * 100)}%`;
  return null;
}

type PulseTone = "hot" | "active" | "rare" | "neutral";
function derivePulse(data: CardData): { text: string; tone: PulseTone } | null {
  const tier = data.ebaySoldComps?.velocityTier;
  const days = data.ebaySoldComps?.avgDaysToSell;
  if (tier === "hot")    return { text: days ? `Selling fast · ~${days}d to sell` : "Selling fast", tone: "hot" };
  if (tier === "active") return { text: "Active resale demand", tone: "active" };
  if (tier === "rare")   return { text: "Rare find · limited inventory", tone: "rare" };
  const advice = data.trendIntel?.buyAdvice;
  if (advice && typeof advice === "string") return { text: advice, tone: "neutral" };
  return null;
}

type RarityTone = "rare" | "uncommon" | "peak";
function deriveRarity(data: CardData): { text: string; tone: RarityTone } | null {
  const pct = Number(data.cheaperPct ?? 0);
  const price = Number(data.price ?? NaN);
  const histLow = Number(data.historicalLow ?? NaN);
  const histHigh = Number(data.historicalHigh ?? NaN);
  if (pct >= 40) return { text: "RARE LOW", tone: "rare" };
  if (Number.isFinite(price) && Number.isFinite(histLow) && price <= histLow * 1.05) {
    return { text: "NEAR LOW", tone: "rare" };
  }
  if (pct >= 22) return { text: "UNCOMMON", tone: "uncommon" };
  if (Number.isFinite(price) && Number.isFinite(histHigh) && price >= histHigh * 0.93) {
    return { text: "AT PEAK", tone: "peak" };
  }
  return null;
}

function _lowestPriceLabel(data: CardData): string {
  // Pillar 1: route through marketIntel so the trust language is
  // consistent across deck + rail + dock + card. NEVER claims "verified"
  // without verification.
  // Pillar 2.1 — "Lowest market signal" → "Lowest pricing signal" to
  // diversify the screen's signal vocabulary (depth row badge says
  // "SIGNAL", dock CTA says "Pricing signal", this bullet now reads
  // "Lowest pricing signal" — three angles on the same trust state).
  if (_isVerifiedListing(data as MarketCard)) return "Lowest verified price";
  if (_isPricingSignal(data as MarketCard))   return "Lowest pricing signal";
  if (_isOracleEstimate(data as MarketCard))  return "AI estimate · lowest";
  return "Lowest in current set";
}

function deriveWhy(data: CardData, isLowest: boolean): string[] {
  // Prefer server-derived reasons when present — they're already tailored
  // to the user's exact scan.
  if (Array.isArray(data.rankWhy) && data.rankWhy.length) {
    return data.rankWhy.filter((s) => typeof s === "string" && s.trim()).slice(0, 3);
  }
  if (Array.isArray(data.scanWhy) && data.scanWhy.length) {
    return data.scanWhy.filter((s) => typeof s === "string" && s.trim()).slice(0, 3);
  }
  // Pillar 1: synthesize 2 evidence-aware proof bullets via the canonical
  // marketIntel helper, then add one card-specific seller/comp signal.
  // This keeps the rail's mini-card subtitle and the deck card's bullet
  // pair perfectly aligned ("Pricing signal · 69%" stays "Lowest pricing
  // signal" / "Price evidence only" rather than drifting into "Market
  // price" or "Lowest verified price").
  const out: string[] = _deriveCardBullets(data as MarketCard, isLowest);
  if ((data.visionConfidence ?? 0) >= 0.7 && out.length < 2) {
    out.push("Matches the item we scanned");
  }
  const store = data.store || data.source;
  if (store && out.length < 3) {
    const TRUSTED = /amazon|ebay|target|walmart|best.?buy|costco|kohls|home.?depot/i;
    if (TRUSTED.test(String(store))) out.push(`Trusted seller · ${store}`);
    else out.push(`Listed on ${store}`);
  }
  const c = Number(data.ebaySoldComps?.count ?? 0);
  if (c >= 3 && out.length < 3) out.push(`${c} recent sold comps`);
  return out.slice(0, 3);
}

// ─── Card label helper ────────────────────────────────────────────────────────
// Pillar 1.7 — badge taxonomy unified to role-derived labels only. Every
// badge must reflect a real card stat (lowest price, top visual match,
// premium-tier anchor) — never a hype word. Removed: "PREMIUM" (read as
// a paid feature), "BEST DEAL" (vague), "MATCH" / "CHEAPER" / "HIDDEN GEM"
// (the price spectrum is now communicated through the delta pill and the
// "above low" caption; another badge layer on top was noisy and rarely
// useful). Kept / added:
//   - LOWEST       — only when isLowest from parent (real stat)
//   - BEST MATCH   — only when isBestMatch from parent (highest match in deck)
//   - TOP SIGNAL   — hero card when nothing more specific applies
//   - TOP FLIP     — preserved for clear flip verdicts
//   - ANCHOR       — alt card with price >2.5× user's scannedPrice (kept
//                    so the user can spot premium-tier comp anchoring)
// Everything else returns null so unbadged cards stay clean.
function cardLabel(
  isHero: boolean,
  price: number | null,
  _heroPrice: number | null,
  scannedPrice: number | null,
  isLowest: boolean,
  isBestMatch: boolean,
  verdict?: string,
): { text: string; bg: string; border: string; color: string; heavy?: boolean } | null {
  // Priority order: LOWEST > BEST MATCH > TOP FLIP > TOP SIGNAL > ANCHOR > null.
  // Real stats first, role labels second.
  if (isLowest) {
    return { text: "LOWEST", bg: "rgba(8,18,12,0.78)", border: "rgba(180,255,200,0.45)", color: "rgba(180,255,200,1)" };
  }
  if (isBestMatch) {
    return { text: "BEST MATCH", bg: "rgba(8,14,22,0.78)", border: "rgba(160,210,255,0.40)", color: "rgba(190,230,255,1)" };
  }
  if (isHero) {
    if (/GREAT|FLIP/i.test(verdict || ""))
      return { text: "TOP FLIP", bg: "rgba(8,18,12,0.78)", border: "rgba(180,255,200,0.45)", color: "rgba(180,255,200,1)" };
    return { text: "TOP SIGNAL", bg: "rgba(12,12,12,0.78)", border: "rgba(255,255,255,0.30)", color: "rgba(255,255,255,0.92)" };
  }

  if (price == null) return null;

  // Anchor — alt sits well above the user's scanned cost. Useful trust
  // signal ("this is a premium-tier comp, not a like-for-like") so we
  // keep it. Muted neutral tone — never celebratory.
  if (Number.isFinite(scannedPrice) && price > scannedPrice! * 2.5) {
    return { text: "ANCHOR", bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.55)" };
  }

  // No badge for everything else — the price + delta caption already
  // tells the story without an extra label layer.
  return null;
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
  isBestMatch = false,
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
  // Image URI sanity — reject malformed values before React Native's
  // <Image> handles them. RCTImageView on iOS throws NSException for
  // schemes it can't resolve (e.g. "//" / "blob:foo" / random whitespace),
  // and an NSException from the native side bypasses every JS try/catch
  // around captureRef and tears the deck down on swipe. Only http(s)/file/
  // data URIs survive this gate; everything else falls back to the photoUri
  // and ultimately the placeholder icon.
  const isValidImageUri = (u: any): boolean => {
    if (typeof u !== "string") return false;
    const t = u.trim();
    if (!t) return false;
    return /^(https?:|file:|data:image\/|asset:)/.test(t);
  };
  const rawImageUri = data.image || data.photoUri || null;
  const imageUri = isValidImageUri(rawImageUri) ? rawImageUri : null;
  const price    = Number.isFinite(Number(data.price)) ? Number(data.price) : null;
  const name     = data.itemName || data.title || "Listing";
  const store    = data.store || data.source || null;

  const cardRef = useRef<View>(null);
  const mountedRef = useRef(true);
  // capturingShareRef is the *synchronous* lock — useState updates lag a
  // microtask behind the next render, so a fast double-tap on the share
  // arrow could slip both invocations of handleShare past the React-state
  // guard and stack two captureRef calls (which on iOS reliably crashes
  // view-shot when both try to read the same BlurView). The ref lock
  // closes that window; setCapturingShare stays only for the disabled UI
  // state on the button.
  const capturingShareRef = useRef(false);
  const [capturingShare, setCapturingShare] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Reset image-loaded state when the URI changes so a half-loaded image from
  // a previous card can't satisfy the captureRef gate for the next one.
  useEffect(() => {
    setImageLoaded(false);
  }, [data.image, data.photoUri]);

  // Text-only share fallback. Used when captureRef cannot run (no ref, image
  // not loaded, native exception) and when the parent doesn't supply its own
  // onShare. Wrapped so a Share.share rejection never escapes back into the
  // Pressable handler.
  const textShareFallback = useCallback(async () => {
    try {
      await Share.share({
        message: `Found ${name} for ${fmtMoney(price)} on Evan AI — AI-powered price scanner.\nhttps://evanai.app`,
      });
      console.log("CARD_SHARE_OK", { mode: "text_fallback" });
    } catch (e: any) {
      console.log("CARD_SHARE_FAILED", { mode: "text_fallback", error: e?.message || String(e) });
    }
  }, [name, price]);

  // Bulletproof share handler. Every branch that could historically throw
  // (captureRef on a null ref / unloaded image, Sharing.shareAsync on an
  // invalid URI, onVaultSave from the parent, the text-share fallback itself)
  // is wrapped in its own try/catch so the outer Pressable handler can never
  // see an unhandled rejection. State always resets via the finally block.
  const handleShare = useCallback(async () => {
    if (capturingShareRef.current) {
      console.log("CARD_ARROW_BLOCKED", { reason: "already_capturing", item: name });
      return;
    }
    capturingShareRef.current = true;
    console.log("CARD_ARROW_PRESS", { item: name, hasRef: !!cardRef.current, imageLoaded });
    setCapturingShare(true);
    try { Feedback.save(); } catch {}

    let uri: string | null = null;
    // Only attempt captureRef when the view is mounted, the ref resolves to a
    // real native handle, and the image has reported onLoad. captureRef on an
    // unloaded image throws an NSException on iOS that crashes the app even
    // when wrapped in JS try/catch — this gate is the actual fix for the
    // top-right-arrow crash. Without it the next-card preview image (which
    // may not have finished decoding yet) could detonate the entire app on
    // share-tap.
    if (cardRef.current && imageLoaded) {
      try {
        uri = await captureRef(cardRef, { format: "png", quality: 0.9 });
      } catch (e: any) {
        console.log("CARD_SHARE_CAPTURE_FAILED", { error: e?.message || String(e) });
        uri = null;
      }
    } else {
      console.log("CARD_ARROW_BLOCKED", {
        reason: !cardRef.current ? "no_ref" : "image_not_loaded",
        item: name,
      });
    }

    if (uri && onVaultSave) {
      try {
        const costBasis = Number.isFinite(Number(data.scannedPrice ?? scannedPrice))
          ? Number(data.scannedPrice ?? scannedPrice) : null;
        const potentialProfit = isHero && data.avgMarket != null && costBasis != null
          ? Number(data.avgMarket) - costBasis : null;
        onVaultSave({ id: String(Date.now()), tempUri: uri, name, price, potentialProfit });
      } catch (e: any) {
        console.log("CARD_SHARE_VAULT_FAILED", { error: e?.message || String(e) });
      }
    }

    if (uri) {
      try {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, {
            dialogTitle: isHero ? "Check out this deal — Evan AI" : "Found a cheaper listing — Evan AI",
            mimeType: "image/png",
          });
          try { Feedback.sold(); } catch {}
          console.log("CARD_SHARE_OK", { mode: "image" });
          capturingShareRef.current = false;
          if (mountedRef.current) setCapturingShare(false);
          return;
        }
      } catch (e: any) {
        console.log("CARD_SHARE_FAILED", { mode: "image", error: e?.message || String(e) });
      }
    }

    // Capture or share failed — fall back to text share (parent-owned if
    // provided, else our own Share.share message).
    try {
      if (onShare) {
        onShare();
        console.log("CARD_SHARE_OK", { mode: "parent_text" });
      } else {
        await textShareFallback();
      }
    } catch (e: any) {
      console.log("CARD_SHARE_FAILED", { mode: "parent_text", error: e?.message || String(e) });
    } finally {
      capturingShareRef.current = false;
      if (mountedRef.current) setCapturingShare(false);
    }
  }, [
    capturingShare, imageLoaded, name, price, isHero, onShare, onVaultSave,
    data.avgMarket, data.scannedPrice, scannedPrice, textShareFallback,
  ]);

  const conf = Number(data.visionConfidence ?? 0);

  // Savings (hero only).
  // Verdict gate: the green "% less" / "save $X" pill is a WIN signal —
  // it must NEVER fire on HOLD / PASS even when the server surfaces a
  // positive savedAmount (the listing might be below market while the
  // verdict still says don't buy due to weak resale / low confidence).
  // Showing a green savings celebration under a HOLD verdict is the
  // contradiction the polish pass calls out. On non-win verdicts the
  // pill is suppressed entirely; the dollar price still shows, the
  // confRange shows, and the cardLabel above carries the cautionary tag.
  const saved     = Number.isFinite(Number(data.savedAmount)) ? Number(data.savedAmount) : null;
  const savedPct  = Number.isFinite(Number(data.cheaperPct))  ? Number(data.cheaperPct) : null;
  const verdictStr = String(data.buyVerdict || "").toUpperCase();
  const isWinVerdict = verdictStr === "BUY"
    || verdictStr.includes("GREAT")
    || verdictStr.includes("FLIP")
    || verdictStr.includes("GOOD");
  const hasSaving = isHero && isWinVerdict && saved != null && saved > 0;

  // Delta vs hero (alt cards)
  const delta = (!isHero && heroPrice != null && price != null) ? price - heroPrice : null;
  const _scannedPrice = Number.isFinite(Number(scannedPrice ?? data.scannedPrice))
    ? Number(scannedPrice ?? data.scannedPrice)
    : null;
  const label = cardLabel(
    isHero,
    price,
    heroPrice ?? null,
    _scannedPrice,
    isLowest,
    isBestMatch,
    data.buyVerdict ?? undefined,
  );
  // On HOLD/PASS, positive (green) badges stay visible but dimmed — they
  // shouldn't celebrate a deal the verdict doesn't endorse. Neutral
  // badges (BEST MATCH, TOP SIGNAL, ANCHOR) are already restrained and
  // stay as-is. Updated set after the Pillar 1.7 badge taxonomy cut.
  const POSITIVE_LABELS = new Set(["LOWEST", "TOP FLIP"]);
  const labelDimmed = !isWinVerdict && label != null && POSITIVE_LABELS.has(label.text);

  // Tweak 1: Signal Velocity — compute once at render
  const velocitySignal = (isHero && data.priceChartPoints?.length)
    ? computeVelocitySignal(data.priceChartPoints)
    : null;

  // Margin range (App Store compliant: no "Guaranteed" language)
  const confLow  = Number.isFinite(Number(data.historicalLow))  ? Number(data.historicalLow)  : null;
  const confHigh = Number.isFinite(Number(data.historicalHigh)) ? Number(data.historicalHigh) : null;
  const hasConfRange = isHero && confLow != null && confHigh != null && confHigh > confLow;

  // ── Hero polish derivations (premium insight strip) ────────────────────────
  // Computed once at render and only consulted on the hero card. Each value
  // gracefully returns null when its underlying signal is thin, so the UI
  // doesn't fake confidence it doesn't have.
  const glowTone: GlowTone = (() => {
    if (!isHero) return "hold";
    const v = String(data.buyVerdict || "").toUpperCase();
    if (v === "BUY" || hasSaving) return "buy";
    if (v === "PASS") return "pass";
    return "hold";
  })();
  const confidenceText = isHero ? deriveConfidence(data) : null;
  const pulse          = isHero ? derivePulse(data) : null;
  // Rarity chip (RARE LOW / NEAR LOW / UNCOMMON) is a celebration —
  // suppress on HOLD/PASS so the green-tinted "this is a steal" chip
  // doesn't sit under a HOLD verdict (psychological contradiction).
  // AT PEAK (the cautionary rarity tone) still surfaces on any verdict
  // since "you're paying at the historical ceiling" is useful regardless.
  const rawRarity      = isHero ? deriveRarity(data) : null;
  const rarity         = rawRarity && (isWinVerdict || rawRarity.tone === "peak")
    ? rawRarity
    : null;
  const whyChips       = isHero ? deriveWhy(data, isLowest) : [];

  return (
    <View ref={cardRef} collapsable={false} style={[styles.card, isHero ? SH.cardActive : SH.card]}>
      {/* Ambient glow removed — the prior pulsing emerald aura read as a
          "visible effect behind the card" rather than premium ambient.
          The card now relies on its own shadow + the cardActive lift for
          depth. No green wash. */}

      {/* ── IMAGE SECTION (60%) ───────────────────────────────── */}
      <View style={styles.imageSection}>
        {imageUri ? (
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {
              // Image-area tap. Hero card prefers the zoom modal; alt cards
              // fall through to the listing open path. Either callback could
              // synchronously throw (parent state setters, modal mount
              // crashes) so the dispatch is wrapped — a throw here used to
              // tear down the whole result tree.
              try {
                if (isHero && onZoomImage) {
                  onZoomImage(imageUri);
                } else if (onPress) {
                  onPress();
                }
              } catch (e: any) {
                console.log("CARD_IMAGE_PRESS_ERROR", { isHero, error: e?.message || String(e) });
              }
            }}
            style={StyleSheet.absoluteFillObject}
          >
            <ExpoImage
              source={{ uri: imageUri }}
              style={StyleSheet.absoluteFillObject}
              contentFit="cover"
              // Pillar 3B — short crossfade from the dark placeholder
              // background to the decoded image. Native-driven; replaces
              // the previous bare <Image> that hard-cut on decode and
              // produced the "image pop-in" the user flagged.
              transition={180}
              // memory + disk cache — repeat-scans of the same SKU never
              // re-decode the same bitmap; image is instant on swipe back.
              cachePolicy="memory-disk"
              // Stable identity so the deck doesn't reuse a stale decoded
              // bitmap when activeResult changes (rail tap, retake, new
              // scan). Without this, swipes between cards can briefly
              // flash the wrong photo before the new one materializes.
              recyclingKey={imageUri}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageLoaded(false)}
            />
          </TouchableOpacity>
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="image-outline" size={40} color="rgba(255,255,255,0.18)" />
          </View>
        )}

        {/* Pillar 2.4 — 10-band micro-gradient. No LinearGradient available,
            but 10 ultra-thin (~10–16px) bands with very small alpha steps
            are perceptually indistinguishable from a true gradient — the
            eye integrates them as one smooth fade. Top 70% of the image
            is completely clear (bands 7-10 are near-zero). Only the
            bottom 30% carries meaningful darkening, concentrated in the
            lowest 40px for text contrast. No discrete layer boundaries. */}
        <View style={styles.imageScrim1} pointerEvents="none" />
        <View style={styles.imageScrim2} pointerEvents="none" />
        <View style={styles.imageScrim3} pointerEvents="none" />
        <View style={styles.imageScrim4} pointerEvents="none" />
        <View style={styles.imageScrim5} pointerEvents="none" />
        <View style={styles.imageScrim6} pointerEvents="none" />
        <View style={styles.imageScrim7} pointerEvents="none" />
        <View style={styles.imageScrim8} pointerEvents="none" />
        <View style={styles.imageScrim9} pointerEvents="none" />
        <View style={styles.imageScrim10} pointerEvents="none" />
        <View style={styles.imageVignetteLeft} pointerEvents="none" />
        <View style={styles.imageVignetteRight} pointerEvents="none" />
        <View style={styles.imageTopHighlight} pointerEvents="none" />

        {/* Card label badge (top-left). Status labels (LOWEST, TOP FLIP,
            BEST MATCH, RARE LOW, UNCOMMON) get a one-time shimmer sweep
            on mount — the eye locks onto "this is the winning card" the
            moment the deck lands. Role labels (TOP SIGNAL, ANCHOR) stay
            quiet. The shimmer overlay is clipped by `overflow: hidden`
            on the badge so it never bleeds. Updated Pillar 1.7. */}
        {label ? (
          <View style={[
            styles.labelBadge,
            { backgroundColor: label.bg, borderColor: label.border },
            label.heavy ? styles.labelBadgeHeavy : null,
            labelDimmed ? { opacity: 0.52 } : null,
          ]}>
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              style={[styles.labelText, { color: label.color }]}
            >
              {label.text}
            </Text>
            {SHIMMER_LABELS.has(label.text) ? <BadgeShimmer /> : null}
          </View>
        ) : null}

        {/* Top-right overlay actions */}
        <View style={styles.overlayActions} pointerEvents="box-none">
          {onToggleWatchlist ? (
            <HeartButton isWatchlisted={isWatchlisted} onToggle={onToggleWatchlist} />
          ) : null}
          <ShareBtn onShare={handleShare} disabled={capturingShare || !imageUri} />
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
        {/* Premium edge: a 1px inner highlight just below where the image
            scrim meets the panel. Replaces what used to read as a hard
            gray border line — now it's an ambient light highlight, the
            kind you'd see on brushed-aluminum hardware. */}
        <View style={styles.panelTopHighlight} pointerEvents="none" />

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

            {/* Rarity chip — only fires when the deal is genuinely unusual
                (40%+ off, near historical low, or — inverted — at peak).
                Sits inline with savings so the "this is rare" signal lands
                in the same eye-stop as the price itself, not buried below. */}
            {rarity ? (
              <View style={[
                styles.rarityChip,
                rarity.tone === "rare"     && styles.rarityChipRare,
                rarity.tone === "uncommon" && styles.rarityChipUncommon,
                rarity.tone === "peak"     && styles.rarityChipPeak,
              ]}>
                <Ionicons
                  name={rarity.tone === "peak" ? "trending-up" : "star"}
                  size={10}
                  color={
                    rarity.tone === "peak"     ? "rgba(255,180,100,0.95)" :
                    rarity.tone === "uncommon" ? "rgba(180,255,200,0.85)" :
                                                 "rgba(180,255,200,1)"
                  }
                />
                <Text style={[
                  styles.rarityChipText,
                  rarity.tone === "rare"     && { color: "rgba(180,255,200,1)" },
                  rarity.tone === "uncommon" && { color: "rgba(180,255,200,0.85)" },
                  rarity.tone === "peak"     && { color: "rgba(255,180,100,0.95)" },
                ]} allowFontScaling={false} numberOfLines={1}>
                  {rarity.text}
                </Text>
              </View>
            ) : null}

            {/* Pillar 1.7 — delta pill is trust-gated. The previous
                implementation rendered a red "+$X" pill on every alt
                that priced above the cheapest market match. On HOLD/PASS
                scans that read as profit/loss arithmetic — exactly the
                wrong frame, since the verdict says the buy isn't safe.
                New rules:
                  - BUY verdict + clickable: keep the colored ±$X delta
                    pill (it's actionable arithmetic the user can trust).
                  - HOLD/PASS or market-signal-only: replace the +$X
                    pill with a neutral "above low" / "below low" caption
                    so the user can still see the price spread without
                    reading it as profit.
                  - delta === 0 / null: no pill.
                Verified-vs-signal is a stricter gate than verdict — a
                market-signal-only card never gets the colored pill even
                on BUY, because the math behind it doesn't survive the
                trust layer. */}
            {delta != null && !isHero ? (() => {
              const isAbove = delta > 0;
              const cardIsSignalOnly = _isPricingSignal(data as MarketCard);
              const showColoredDelta = isWinVerdict && !cardIsSignalOnly;

              if (showColoredDelta) {
                // Pillar 1.8 — "above low" on a BUY card now uses warn
                // (amber) tones instead of danger (red). The red pill
                // read as an alarm against the BUY verdict; amber lands
                // as a directional price-position note ("this alt is
                // pricier than the cheapest comp") without the threat
                // tone. Below-low keeps emerald — that direction IS
                // genuine good news.
                const tones = isAbove
                  ? { bg: C.warnBg, border: C.warnBorder, text: C.warn, icon: C.warn }
                  : { bg: C.goodBg, border: C.goodBorder, text: C.good, icon: C.good };
                return (
                  <View style={[
                    styles.deltaPill,
                    { backgroundColor: tones.bg, borderColor: tones.border },
                  ]}>
                    <Ionicons
                      name={isAbove ? "trending-up" : "trending-down"}
                      size={11}
                      color={tones.icon}
                    />
                    <Text
                      allowFontScaling={false}
                      numberOfLines={1}
                      style={[styles.deltaText, { color: tones.text }]}
                    >
                      {isAbove ? "+" : ""}{fmtMoney(Math.abs(delta))}
                    </Text>
                  </View>
                );
              }

              // Neutral caption — only shown for the "above" direction
              // since "below low" on a card with the same price as low
              // would be redundant with the LOWEST badge. We surface
              // direction without surfacing a profit-looking number.
              if (!isAbove) return null;
              return (
                <View style={styles.deltaNeutralPill}>
                  <Text
                    allowFontScaling={false}
                    numberOfLines={1}
                    style={styles.deltaNeutralText}
                  >
                    above low
                  </Text>
                </View>
              );
            })() : null}
          </View>

          {/* Store + condition + evidence chip — minimal context.
              Pillar 1: when the card is NOT a verified direct listing
              (i.e. it's a pricing signal, oracle estimate, or
              clickable:false marketplace row), show an inline evidence
              chip on the meta row so the user instantly knows the
              card represents price evidence, not a tappable storefront.
              The chip is suppressed on verified rows because "Verified
              listing" is the user's default expectation — surfacing it
              there would be noise. */}
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

            {!_isVerifiedListing(data as MarketCard) ? (
              <>
                {(store || (isHero && data.conditionLabel)) ? (
                  <View style={styles.metaDot} />
                ) : null}
                <View
                  style={[
                    styles.evidenceChip,
                    _isPricingSignal(data as MarketCard) && styles.evidenceChipPricing,
                    _isOracleEstimate(data as MarketCard) && styles.evidenceChipOracle,
                  ]}
                >
                  <Text
                    allowFontScaling={false}
                    numberOfLines={1}
                    style={[
                      styles.evidenceChipText,
                      _isPricingSignal(data as MarketCard) && styles.evidenceChipTextPricing,
                      _isOracleEstimate(data as MarketCard) && styles.evidenceChipTextOracle,
                    ]}
                  >
                    {/* Pillar 1.6 — short form ("Signal" / "AI") avoids
                        the "Market si…" truncation seen on iPhone widths.
                        Dock + rail still use the full evidenceLabel. */}
                    {_evidenceLabelShort(data as MarketCard)}
                  </Text>
                </View>
              </>
            ) : null}
          </View>

          {/* Premium insight strip — one tight line with confidence on the
              left and a tinted market-pulse line on the right. Replaces
              what used to be three separate hero-only intel blocks with a
              single high-signal sentence. Confidence reads "Strong market
              data" / "Active market · N comps"; pulse reads "Selling fast",
              "Active resale demand", etc. Either half drops out cleanly
              when its underlying signal isn't strong enough to claim. */}
          {isHero && (confidenceText || pulse) ? (
            <View style={styles.insightStrip}>
              {confidenceText ? (
                <View style={styles.insightCell}>
                  <View style={styles.insightDot} />
                  <Text
                    style={styles.insightText}
                    allowFontScaling={false}
                    numberOfLines={1}
                  >
                    {confidenceText}
                  </Text>
                </View>
              ) : null}
              {confidenceText && pulse ? <View style={styles.insightSep} /> : null}
              {pulse ? (
                <View style={styles.insightCell}>
                  <Ionicons
                    name={
                      pulse.tone === "hot"    ? "flame" :
                      pulse.tone === "active" ? "trending-up" :
                      pulse.tone === "rare"   ? "diamond-outline" :
                                                "pulse"
                    }
                    size={10}
                    color={
                      pulse.tone === "hot"    ? "rgba(255,140,100,0.95)" :
                      pulse.tone === "active" ? "rgba(120,255,170,0.92)" :
                      pulse.tone === "rare"   ? "rgba(200,200,255,0.90)" :
                                                "rgba(255,255,255,0.72)"
                    }
                  />
                  <Text
                    style={[
                      styles.insightText,
                      pulse.tone === "hot"    && { color: "rgba(255,160,120,0.95)" },
                      pulse.tone === "active" && { color: "rgba(140,255,180,0.92)" },
                      pulse.tone === "rare"   && { color: "rgba(210,210,255,0.92)" },
                    ]}
                    allowFontScaling={false}
                    numberOfLines={1}
                  >
                    {pulse.text}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Pillar 1 — up to two proof bullets so each card communicates
              evidence in two voices: WHY this is the lowest/match (first
              bullet, evidence-aware via _deriveCardBullets), and a
              card-specific signal (seller/comp count, second bullet).
              Hero card surfaces both; alt cards keep the single-line
              tagline to preserve the compact alt-card silhouette. */}
          {isHero && whyChips.length > 0 ? (
            <View style={styles.whyBullets}>
              {whyChips.slice(0, 2).map((b, i) => (
                <View key={`why-${i}`} style={styles.whyTaglineRow}>
                  <View style={styles.whyTaglineDot} />
                  <Text
                    style={styles.whyTagline}
                    allowFontScaling={false}
                    numberOfLines={1}
                  >
                    {b}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Margin range — quiet, single line. Kept because it's a SINGLE
              compact line and gives the user the "what's the typical
              spread" answer at a glance. Everything heavier (price-history
              sparkline, PriceLadder, PremiumIntelPanel, secondary intel
              rows) moved to the Details modal so the card stays focused
              on image · title · price · chips · source · one reason —
              the layout that fits without being clipped behind the dock. */}
          {hasConfRange ? (
            <View style={styles.confRangeRow}>
              <Text style={styles.confRangeText} allowFontScaling={false} numberOfLines={1}>
                {`${fmtMoney(confLow)} – ${fmtMoney(confHigh)}`}
              </Text>
            </View>
          ) : null}

          {/* Hero: tracked buy CTA — Pillar 1 trust gating.
              Only clickable when the backend says so AND a real directUrl
              exists. When the card is a pricing signal / oracle estimate
              / explicit clickable:false, the CTA renders as a dimmed
              "Market signal" pill with NO onPress handler, so the user
              can never tap into an open path the trust layer didn't
              vet. _cardActionLabel returns the canonical copy
              ("View listing" or "Market signal" — unified in Pillar 1.5). */}
          {(() => {
            if (!isHero) return null;
            const heroClickable =
              data.clickable !== false &&
              typeof data.directUrl === "string" &&
              data.directUrl.length > 0;
            // Pillar 1.6 — don't render a disabled in-card CTA for
            // non-clickable cards. The dock's primary CTA already
            // surfaces the trust state ("Market signal" pill), and a
            // duplicate disabled pill at the bottom of the card was
            // getting clipped on iPhone viewports and adding visual
            // noise without affording any action. Verified clickable
            // cards still keep the in-card "Buy Now / View listing"
            // CTA because it's a real action worth surfacing inside
            // the card itself.
            if (!heroClickable) return null;
            const ctaLabel = _cardActionLabel(data as MarketCard);
            const heroDisplayLabel = isWinVerdict
              ? "Buy Now  →"
              : `${ctaLabel}  →`;
            return (
              <TouchableOpacity
                activeOpacity={0.72}
                onPress={() => {
                  // routeListingClick is async and could reject if the URL fails
                  // to resolve. Catching here prevents the onPress promise from
                  // floating into an unhandled rejection.
                  try {
                    Promise.resolve(
                      routeListingClick(data.directUrl, {
                        scanId,
                        userId,
                        itemName: name,
                        listingPrice: price,
                        source: store,
                        cardRole: "hero",
                        intent: "buy",
                      }),
                    ).catch((e: any) => {
                      console.log("CARD_LINK_OPEN_ERROR", { role: "hero", error: e?.message || String(e) });
                    });
                  } catch (e: any) {
                    console.log("CARD_LINK_OPEN_ERROR", { role: "hero", error: e?.message || String(e) });
                  }
                }}
                style={[
                  styles.heroBuyBar,
                  !isWinVerdict && styles.heroBuyBarNeutral,
                ]}
              >
                <Ionicons
                  name="cart-outline"
                  size={13}
                  color={
                    isWinVerdict
                      ? "rgba(120,255,170,0.85)"
                      : "rgba(255,255,255,0.55)"
                  }
                />
                <Text
                  style={[
                    styles.heroBuyText,
                    !isWinVerdict && styles.heroBuyTextNeutral,
                  ]}
                >
                  {heroDisplayLabel}
                </Text>
              </TouchableOpacity>
            );
          })()}

          {/* Sell mode trigger + Community comps removed from inline hero
              card. Both live in the Details modal (dock's Details chip) so
              the hero card body fits cleanly above the dock without
              clipping. Re-add here only if a future card height bump
              gives room. */}

          {/* Alt: Tracked listing CTA — same trust gating + Pillar 1.6
              null-render rule as the hero CTA. Non-clickable alts now
              render no CTA at all; the dock surfaces the trust state. */}
          {!isHero ? (() => {
            const altClickable =
              data.clickable !== false &&
              typeof data.directUrl === "string" &&
              data.directUrl.length > 0;
            if (!altClickable) return null;
            const ctaLabel = _cardActionLabel(data as MarketCard);
            return (
              <TouchableOpacity
                activeOpacity={0.72}
                onPress={() => {
                  try {
                    Promise.resolve(
                      routeListingClick(data.directUrl, {
                        scanId,
                        userId,
                        itemName: name,
                        listingPrice: price,
                        source: store,
                        cardRole: "alt",
                        intent: "buy",
                      }),
                    ).catch((e: any) => {
                      console.log("CARD_LINK_OPEN_ERROR", { role: "alt", error: e?.message || String(e) });
                    });
                  } catch (e: any) {
                    console.log("CARD_LINK_OPEN_ERROR", { role: "alt", error: e?.message || String(e) });
                  }
                }}
                style={styles.viewListingBar}
              >
                <Text style={styles.viewListingText}>
                  {ctaLabel}{"  →"}
                </Text>
              </TouchableOpacity>
            );
          })() : null}
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
    // Hairline white border defines the card edge against the black canvas
    // when the drop shadow alone can't (black-on-black). Pairs with the
    // CardDeck halo so the active card reads as a bounded floating object,
    // not a black region of the screen.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
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
  // Pillar 2 — gradient ladder. The old 80px solid scrim at 62% black
  // created a visible horizontal band across every product photo. We
  // replace it with a 5-step gradient that ramps from ~0.55 at the very
  // bottom (where the badge anchors live, so readability survives) up to
  // 0.0 over 130px. Each band is shorter than the eye can distinguish so
  // the composite reads as a smooth fade instead of a stack of slabs.
  // Top tint is dropped — the previous 16% darkening at the top muddied
  // the product photo without adding any text-contrast value, since no
  // overlay text ever lives in that zone.
  // Pillar 2.4 — 10-band perceptual gradient. Bands are sized 10–16px
  // each; alphas follow an ease-out curve so the darkening accelerates
  // only near the bottom where text lives. Top 70%+ of the image carries
  // zero or near-zero alpha so no overlay is visible in the photo zone.
  // Total coverage: 130px from bottom. Curve: 0, 0, 0.01, 0.02, 0.04,
  // 0.07, 0.11, 0.17, 0.24, 0.32 — each step is ≤7% opacity, below the
  // threshold where the eye perceives a discrete layer boundary.
  imageScrim1: {          // bottom 0–14px, darkest (text zone)
    position: "absolute", bottom: 0,   left: 0, right: 0, height: 14,
    backgroundColor: "rgba(0,0,0,0.32)",
  },
  imageScrim2: {          // 14–28px
    position: "absolute", bottom: 14,  left: 0, right: 0, height: 14,
    backgroundColor: "rgba(0,0,0,0.24)",
  },
  imageScrim3: {          // 28–42px
    position: "absolute", bottom: 28,  left: 0, right: 0, height: 14,
    backgroundColor: "rgba(0,0,0,0.17)",
  },
  imageScrim4: {          // 42–56px
    position: "absolute", bottom: 42,  left: 0, right: 0, height: 14,
    backgroundColor: "rgba(0,0,0,0.11)",
  },
  imageScrim5: {          // 56–69px
    position: "absolute", bottom: 56,  left: 0, right: 0, height: 13,
    backgroundColor: "rgba(0,0,0,0.07)",
  },
  imageScrim6: {          // 69–82px
    position: "absolute", bottom: 69,  left: 0, right: 0, height: 13,
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  imageScrim7: {          // 82–95px
    position: "absolute", bottom: 82,  left: 0, right: 0, height: 13,
    backgroundColor: "rgba(0,0,0,0.02)",
  },
  imageScrim8: {          // 95–107px
    position: "absolute", bottom: 95,  left: 0, right: 0, height: 12,
    backgroundColor: "rgba(0,0,0,0.01)",
  },
  imageScrim9: {          // 107–119px
    position: "absolute", bottom: 107, left: 0, right: 0, height: 12,
    backgroundColor: "rgba(0,0,0,0.00)",
  },
  imageScrim10: {         // 119–130px — pure clear, just extends coverage
    position: "absolute", bottom: 119, left: 0, right: 0, height: 11,
    backgroundColor: "rgba(0,0,0,0.00)",
  },
  // Thin side bands at low alpha — soft "frame" that draws the eye to the
  // product photo. Slightly lighter (8%) so corners feel framed but never
  // muddy the actual product silhouette.
  imageVignetteLeft: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 22,
    backgroundColor: "rgba(0,0,0,0.07)",
  },
  imageVignetteRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 22,
    backgroundColor: "rgba(0,0,0,0.07)",
  },
  // 1px hairline of ambient light at the very top of the image — gives
  // the image a "lens edge" feel where it meets the card's top radius.
  imageTopHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.10)",
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
    backgroundColor: "rgba(0,0,0,0.42)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
  },
  shareBtnBg: {
    backgroundColor: "rgba(255,255,255,0.10)",
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
  // 1px ambient highlight at the very top of the info panel. Sits over
  // the BlurView so the panel reads as if it has a soft inner light along
  // the edge where it meets the image — premium hardware feel, no hard
  // border line.
  panelTopHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  panelContent: {
    flex: 1,
    paddingHorizontal: SP.lg,
    paddingTop: 10,
    paddingBottom: SP.sm,
    justifyContent: "space-between",
  },

  // ── Item name ─────────────────────────────────────────────────────────────
  // Pillar 1.8 — fontWeight dialed 900 → 800 so the title reads as
  // confident-bold rather than slab-black, marginBottom 2 → 5 so the
  // title-to-price gap reads as intentional whitespace. The card now
  // feels less stamp-heavy without giving up legibility.
  itemName: {
    ...TY.h2,
    fontWeight: "800",
    color: C.text,
    marginBottom: 5,
  },

  // ── Price row ─────────────────────────────────────────────────────────────
  // Wrap is ON: when price + savings + rarity overflow the card's inner
  // width (the field "★ RARE LOW" → "★ RARE LO" clip), the rarity pill
  // drops to the next line cleanly instead of being chopped at the right
  // edge. Vertical row-gap matches horizontal gap so wrapped pills land
  // on the same grid as the inline ones.
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    rowGap: 6,
    flexWrap: "wrap",
  },
  price: {
    ...TY.price,
    color: C.text,
    flexShrink: 0,
  },
  // Pills: tightened horizontal padding (7→6) + min height so the chip
  // silhouette stays consistent whether wrapped or inline. flexShrink lets
  // them give up a sliver before forcing a wrap, so very narrow cards
  // still keep two pills on one row before bumping the third down.
  savingsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: R.pill,
    backgroundColor: "rgba(0,210,120,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,210,120,0.16)",
    flexShrink: 1,
  },
  savingsText: {
    ...TY.label,
    color: C.good,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  deltaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: R.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 1,
  },
  // Pillar 1.7 — neutral "above low" caption used on HOLD/PASS or
  // market-signal-only alt cards. Same pill footprint as deltaPill so
  // the meta-row layout doesn't shift between BUY and non-BUY scans,
  // but warm-muted tint instead of red/green so the user never reads
  // it as profit arithmetic.
  deltaNeutralPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: R.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.03)",
    flexShrink: 1,
  },
  deltaNeutralText: {
    fontSize: 10,
    fontWeight: "800",
    color: "rgba(255,255,255,0.50)",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  deltaText: {
    ...TY.label,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.2,
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

  // Pillar 1 evidence chip — sits inline on the meta row when the card
  // is NOT a verified direct listing. Default is the "Market signal"
  // neutral tone; pricing signals shift to a warm tint; oracle estimates
  // to a cool tint. Visual weight is intentionally restrained — the
  // chip exists to signal trust state, not to bid for attention.
  evidenceChip: {
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)",
    flexShrink: 1,
  },
  evidenceChipPricing: {
    backgroundColor: "rgba(255,210,140,0.06)",
    borderColor: "rgba(255,210,140,0.18)",
  },
  evidenceChipOracle: {
    backgroundColor: "rgba(160,210,255,0.06)",
    borderColor: "rgba(160,210,255,0.18)",
  },
  evidenceChipText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.4,
    color: C.text3,
  },
  evidenceChipTextPricing: {
    color: "rgba(255,210,140,0.85)",
  },
  evidenceChipTextOracle: {
    color: "rgba(180,220,255,0.85)",
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
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: "rgba(255,255,255,0.07)",
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
    borderTopColor: "rgba(255,255,255,0.05)",
    alignItems: "flex-end",
  },
  viewListingText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.35)",
    fontWeight: "600",
    letterSpacing: 0.5,
  },

  // ── Hero buy CTA ──────────────────────────────────────────────────────────
  // Green wins-only. Neutral variants below kick in on HOLD/PASS so the
  // CTA reads as "view listing" rather than "this is a great deal — go
  // buy it." Verbiage and color both swap; layout/typography stay
  // identical so the row alignment with the rest of the card body is
  // preserved across verdict states.
  heroBuyBar: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 5,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,210,120,0.10)",
  },
  heroBuyBarNeutral: {
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  heroBuyText: {
    fontSize: 11,
    color: "rgba(120,255,170,0.80)",
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  heroBuyTextNeutral: {
    color: "rgba(255,255,255,0.55)",
  },

  // ── Sell mode trigger ────────────────────────────────────────────────────
  sellBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  sellBarText: {
    fontSize: 10,
    fontWeight: "700",
    color: C.text3,
    letterSpacing: 0.3,
  },

  // ── Card label badge ──────────────────────────────────────────────────────
  // overflow:hidden clips the BadgeShimmer overlay so the diagonal sweep
  // stays inside the badge rectangle instead of bleeding across the image.
  // Pillar 2 — premium badge. Padding bumped + radius rounded so badges
  // feel integrated as glass capsules rather than bolted-on stickers.
  // Subtle drop shadow so the badge lifts off the image without needing
  // a heavy border.
  labelBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.30,
    shadowRadius: 6,
    elevation: 4,
  },
  labelBadgeHeavy: {
    borderWidth: 1,
    shadowColor: "rgba(180,140,255,1)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 5,
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

  // ── Ambient glow (hero only) ──────────────────────────────────────────────
  // Soft tinted aura that pulses behind the image section. Sits at the very
  // top of the card so the glow reads as light "bleeding through" the image
  // from above. Z-stacked below everything (it's the first child of the
  // card View). Wide + tall so the radial-feeling edge is soft, not boxy.
  ambientGlow: {
    position: "absolute",
    top: -40,
    left: -20,
    right: -20,
    height: IMAGE_H + 80,
    borderRadius: 200,
  },

  // ── Badge shimmer (premium labels only) ──────────────────────────────────
  // Thin diagonal highlight that sweeps across LOWEST / TOP FLIP / HIDDEN
  // GEM / BEST DEAL / RARE LOW / UNCOMMON once on mount. Width is wider
  // than the badge so the leading + trailing edges fade in/out cleanly via
  // skewX rather than a hard cut.
  shimmer: {
    position: "absolute",
    top: -8,
    bottom: -8,
    width: 26,
    left: 0,
    backgroundColor: "rgba(255,255,255,0.42)",
  },

  // ── Rarity chip (in price row, hero only) ────────────────────────────────
  // Tiny chip rendered alongside the savings pill. Three tones — rare /
  // uncommon / peak — keep the price row legible while signalling deal
  // intelligence without another row of chrome.
  rarityChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: R.pill,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(8,18,12,0.62)",
    borderColor: "rgba(180,255,200,0.28)",
    flexShrink: 1,
  },
  rarityChipRare: {
    backgroundColor: "rgba(8,22,14,0.74)",
    borderColor: "rgba(180,255,200,0.40)",
  },
  rarityChipUncommon: {
    backgroundColor: "rgba(8,18,12,0.56)",
    borderColor: "rgba(180,255,200,0.22)",
  },
  rarityChipPeak: {
    backgroundColor: "rgba(28,18,8,0.64)",
    borderColor: "rgba(255,180,100,0.30)",
  },
  rarityChipText: {
    fontSize: 8.5,
    fontWeight: "900",
    letterSpacing: 1.0,
    color: "rgba(180,255,200,0.92)",
  },

  // ── Insight strip (confidence · pulse) ────────────────────────────────────
  // One-line summary directly under the meta row. Two cells, each optional,
  // separated by a vertical hairline. Dot+text on the left for confidence,
  // tinted icon+text on the right for market pulse. The horizontal layout
  // keeps vertical density low so the hero panel doesn't bloat.
  insightStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
    marginTop: 4,
    marginBottom: 2,
  },
  insightCell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 1,
  },
  insightDot: {
    width: 5,
    height: 5,
    borderRadius: R.pill,
    backgroundColor: "rgba(180,255,200,0.85)",
  },
  insightSep: {
    width: StyleSheet.hairlineWidth,
    height: 11,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  insightText: {
    ...TY.cap,
    fontSize: 11,
    color: C.text2,
    fontWeight: "600",
    letterSpacing: 0.2,
    flexShrink: 1,
  },

  // ── Why this listing (hero only) ──────────────────────────────────────────
  // Single-line inline signal. The full multi-bullet "PICKED BECAUSE" block
  // moved into the Details modal in app/index.tsx — on-card we keep ONE
  // terse sentence (e.g. "Lowest verified price in comps", "Strong resale
  // comps", "Trusted seller · Amazon") so the compact deck card stays
  // scannable. ~14px tall, no header, no paragraph.
  // Pillar 1: container for up to 2 inline proof bullets. Each row is
  // ~14px tall, the two rows together still fit comfortably above the
  // hero buy CTA. The marginTop on whyTaglineRow handles the inter-row
  // spacing so this wrapper just owns the outer offset.
  whyBullets: {
    marginTop: 0,
  },
  whyTaglineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
  },
  whyTaglineDot: {
    width: 3,
    height: 3,
    borderRadius: R.pill,
    backgroundColor: "rgba(180,255,200,0.7)",
    flexShrink: 0,
  },
  whyTagline: {
    fontSize: 11,
    fontWeight: "600",
    color: C.text3,
    letterSpacing: 0.1,
    flexShrink: 1,
  },
});
