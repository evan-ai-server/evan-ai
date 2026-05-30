import React, { useCallback, useMemo, useEffect, useRef, useState } from "react";
import { sanitizeHint, sanitizePropContext, devLog, devWarn } from "../lib/security";
import { SubscriptionModal } from "../components/subscription/SubscriptionModal";
import { ResultsContent } from "../components/results/ResultsContent";
import { ConfettiBurst } from "../components/results/ConfettiBurst";
import {
  useNetworkStatus,
  useOfflineQueue,
  type RunScanFn,
} from "../components/offline";
import { ReceiptResultPanel } from "../components/results/ReceiptResultPanel";
import { FlipCalculatorPanel } from "../components/results/FlipCalculatorPanel";
import { DeepAuthCard, type DeepAuthResult } from "../components/results/DeepAuthCard";
import { ConditionMismatchCard, type ConditionAssessment } from "../components/results/ConditionMismatchCard";
import { CommunityCompsCard, type CommunityCompsData } from "../components/results/CommunityCompsCard";
import { HaggleScoreCard, type HaggleScoreResult } from "../components/results/HaggleScoreCard";
import { PLTracker, type PLFlip } from "../components/results/PLTracker";
import { LocalRadar, type RadarData } from "../components/results/LocalRadar";
import { NegotiationCoach } from "../components/results/NegotiationCoach";
import { ShareCard } from "../components/results/ShareCard";
import { FlipProfileCard, type FlipProfile } from "../components/results/FlipProfileCard";
import { WatchlistCard } from "../components/watchlist/WatchlistCard";
import { BatchScanScreen } from "../components/batch/BatchScanScreen";
import ItemHintInput from "../components/scan/ItemHintInput";
import { updateWidgetData } from "../components/widget/updateWidgetData";
import { OnboardingFlow, type SurveyAnswers } from "../components/onboarding/OnboardingFlow";
import { SingularityPipelineModal } from "../components/onboarding/SingularityPipeline";
import { useSpatialZone, type ZoneKey } from "../components/spatial/SpatialContext";
import { AutonomousDealHunter, type DealAlert } from "../services/scanService";
// Deal engine types flow through brain store + orchestrator — no direct import needed
import { DopamineLayer } from "../components/results/DopamineLayer";
import { EventTracker } from "../services/revenue/EventTracker";
import { FinanceAnalytics } from "../services/finance/FinanceAnalytics";
import { useFinanceState } from "../services/finance/useFinanceState";
import { useUpgradeIntelligence } from "../services/finance/useUpgradeIntelligence";
import { MarketTruthService } from "../services/MarketTruthService";
import { TuningService } from "../services/TuningService";
import { useEvanBrain, selectHotSignal, selectPaywallVisible, selectAspirationContext } from "../hooks/useEvanBrain";
import { useEvanOrchestrator } from "../hooks/useEvanOrchestrator";

import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  TextStyle,
  Image,
  Platform,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  LayoutAnimation,
  Linking,
  Keyboard,
  Alert,
  Share,
  ActionSheetIOS,
  AppState,
  BackHandler,
  ActivityIndicator,
  AccessibilityInfo,
  Animated as RNAnimated,
  useWindowDimensions,
  PanResponder,
  Dimensions,
  PixelRatio,
} from "react-native";

import {
  GestureHandlerRootView,
  GestureDetector,
  Gesture,
} from "react-native-gesture-handler";

import AsyncStorage from "@react-native-async-storage/async-storage";
// Phase 4/5 — canonical verdict authority + presentation + migration.
// Anything in this file that resolves a verdict-shaped value MUST go
// through these helpers; anything that needs colour/haptics/sound MUST
// derive it from the canonical Verdict via verdictPresentation. No
// substring/regex interpretation, no score-based fallback styling.
import {
  normalizeVerdict,
  isCanonicalVerdict,
  assertVerdict,
  VerdictLeakError,
} from "../shared/verdict.js";
import {
  verdictColorHex,
  verdictHaptics,
  verdictSound,
  verdictLighting,
  verdictPresentation,
} from "../shared/verdictPresentation.js";
import { migrateScanIfNeeded, normalizeStoredScan } from "../shared/scanMigration.js";
import {
  hydrateStoredScan,
  isStoredScanFresh,
  normalizeStoredScan as normalizeStoredScanV3,
  STORED_SCAN_SCHEMA_VERSION,
} from "../shared/storedScan.js";
import {
  buildNotification,
  buildNotificationFromVerdict,
  REASON_CODES,
} from "../shared/notification.js";
import {
  buildVerdictAnalyticsEvent,
  reportCacheDrift,
  reportServerClientMismatch,
  setVerdictTelemetrySink,
} from "../shared/verdictTelemetry.js";

// Phase 6 + Phase 11: client-side telemetry sink. Mirrors every
// verdict_disagreement_event into the dev console AND ships it to the
// server's /telemetry/verdict-disagreement endpoint so server + client
// drift land in the same dashboard. Sink is fire-and-forget — a
// network failure must not break a user request.
setVerdictTelemetrySink((event) => {
  try {
    // eslint-disable-next-line no-console
    console.warn("[verdict_disagreement_event]", JSON.stringify(event));
  } catch { /* console may be missing in some test harnesses */ }
  try {
    const baseUrl = (typeof SAFE_API_BASE === "string" && SAFE_API_BASE.length > 0)
      ? SAFE_API_BASE
      : null;
    if (!baseUrl) return;
    fetch(`${baseUrl}/telemetry/verdict-disagreement`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source:        event?.source        ?? "client",
        trigger:       event?.trigger       ?? "server-vs-client",
        serverVerdict: event?.expectedRaw   ?? event?.expected ?? null,
        clientVerdict: event?.receivedRaw   ?? event?.received ?? null,
        scanId:        event?.meta?.scanId  ?? null,
        userId:        event?.meta?.userId  ?? null,
        platform:      "rn",
      }),
    }).catch(() => { /* telemetry is best-effort */ });
  } catch { /* never propagate */ }
});
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { Ionicons, FontAwesome } from "@expo/vector-icons";

import Reanimated, {
  Easing,
  configureReanimatedLogger,
  ReanimatedLogLevel,
  useAnimatedProps,
  useDerivedValue,
  clamp,
  withTiming,
  withSpring,
  withRepeat,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  interpolate,
  Extrapolation,
  FadeIn,
  FadeInDown,
} from "react-native-reanimated";

import { Accelerometer } from "expo-sensors";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";
import { triggerHaptic } from "../components/design/haptics";
import * as Notifications from "expo-notifications";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import * as Clipboard from "expo-clipboard";

import { configurePurchases, identifyUser, purchaseMonthly, purchaseYearly, restorePurchases } from "../src/purchases";

import { BlurView } from "expo-blur";
import { SoundEffect } from "../components/design/DS";
import {
  Canvas,
  Group,
  Path,
  Rect,
  RoundedRect,
  Skia,
  BlurMask,
  LinearGradient,
  vec,
} from "@shopify/react-native-skia";
const IOS = Platform.OS === "ios";

configureReanimatedLogger({
  level: ReanimatedLogLevel.error,
  strict: false,
});

// -------------------------
// TOKENS (theme)
// -------------------------
const TOK = {
C: {
  bg: "#000000",
  card: "#121212",
  border: "#1f1f1f",
  text: "#ffffff",
  text2: "rgba(255,255,255,0.75)",
  subtext: "rgba(255,255,255,0.7)",
  accent: "#22c55e",
  danger: "#ef4444",
  s1: "rgba(255,255,255,0.05)",
  s2: "rgba(255,255,255,0.08)",
  s3: "rgba(255,255,255,0.14)",
  b1: "rgba(255,255,255,0.10)",
  b2: "rgba(255,255,255,0.16)",
  b3: "rgba(255,255,255,0.12)",
  backStrong: "rgba(0,0,0,0.6)",
},
R: {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  pill: 999,
},
  B: {
    hair: StyleSheet.hairlineWidth,
    sm: 1,
    md: 2,
  },
S: {
  tab: {
    shadowColor: "#000",
    shadowOpacity: IOS ? 0.25 : 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  soft: {
    shadowColor: "#000",
    shadowOpacity: IOS ? 0.20 : 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
},
};
function StarRating({ value = 0, size = 14 }) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  const full = Math.floor(v);
  const half = v - full >= 0.5;
  return (
    <View style={{ flexDirection: "row" }}>
      {Array.from({ length: 5 }).map((_, i) => {
        const idx = i + 1;
        const name =
          idx <= full
            ? "star"
            : half && idx === full + 1
            ? "star-half-full"
            : "star-o";
        return (
          <FontAwesome
            key={i}
            name={name}
            size={size}
            color="#F5C542"
          />
        );
      })}
    </View>
  );
}
// -------------------------
// CONFIG
// -------------------------
const safeNum = (n: any) =>
  Number.isFinite(Number(n)) ? Number(n) : 0;
// saveIntel stub removed — real implementation exists later
const STORAGE_KEY = "EVANAI_APP_STATE_V2";
// Env-driven API base — set EXPO_PUBLIC_API_URL in .env / app.config.js for prod.
// Set EXPO_PUBLIC_DEV_API_URL for local dev (defaults to localhost:3001).
const PROD_API_BASE =
  process.env.EXPO_PUBLIC_API_URL || "https://YOUR_PROD_DOMAIN_HERE";
if (!__DEV__) {
  if (!PROD_API_BASE || PROD_API_BASE.includes("YOUR_PROD_DOMAIN_HERE")) {
    throw new Error(
      "PROD_API_BASE is not set. Add EXPO_PUBLIC_API_URL to your environment."
    );
  }
}
const _STAGING_API_BASE =
  process.env.EXPO_PUBLIC_STAGING_API_URL || "https://YOUR_STAGING_DOMAIN_HERE";
// Dev: prefer env var, fallback localhost so the app works without LAN config.
const DEV_API_BASE =
  process.env.EXPO_PUBLIC_DEV_API_URL || "http://localhost:3001";
const API_BASE = __DEV__ ? DEV_API_BASE : PROD_API_BASE;
// Safe fallback used before state initializes
const SAFE_API_BASE = API_BASE;
// In production, never guess bases. Only use PROD_API_BASE.

const API_BASE_CANDIDATES = __DEV__
  ? [
      DEV_API_BASE,
    ]
  : [PROD_API_BASE];

const smoothConfidence = (c) => {
  if (c >= 0.92) return Math.min(0.98, c);
  if (c >= 0.85) return c - 0.03;
  if (c >= 0.7) return c - 0.06;
  return c;
};
const CONFIDENCE_THRESHOLD = 0.30;
const MAX_VISION_RETRIES = 1;

// ✅ Free cycle reset window (24 hours — server-side quota resets at midnight UTC)
const FREE_CYCLE_MS = 24 * 60 * 60 * 1000;
// -------------------------
// LOADING UX CAPS
// -------------------------
const SOFT_SCAN_UI_MS = 16000;       // show retry, but DO NOT abort yet — oracle can take 10-15s
const HARD_SCAN_ABORT_MS = 38000;    // real kill switch — oracle GPT can take 10-15s
const MARKET_REQUEST_ABORT_MS = 28000; // oracle fallback needs ~15s; give 28s total
const RETRY_REVEAL_MS = 2500;

// money
const PRO_MONTHLY_PRICE = 7.77;
const PRO_YEARLY_PRICE = 22.22;

// -------------------------
// ✅ HAPTICS (route through centralized helper)
// -------------------------
// Legacy in-file helpers retained for callsite compatibility but now
// route through the central `triggerHaptic` which carries the 110ms
// cooldown — no more stacked selection buzzes during rapid state
// transitions. Most are NO-OPS now because their original use was
// "buzz on every selection / tick / soft snap," which the polish pass
// flags as arcade noise:
//   - hapticSelect  → SILENT. Selection changes are passive; visual
//                     feedback (highlight, scroll snap, color swap)
//                     already telegraphs the change.
//   - hapticSoftSnap → SILENT. Same reasoning.
//   - hapticTick    → SILENT. Tick events are passive feedback.
//   - _hapticShutter → "capture" via central helper (camera capture is
//                     a real confirmation moment).
// Use `triggerHaptic("...")` directly at call sites that actually need a
// buzz — verdict-strong, save, error, etc.
const hapticSelect    = () => {};
const _hapticShutter  = () => triggerHaptic("capture");
const hapticSoftSnap  = () => {};
const hapticTick      = () => {};
// -------------------------
// ✅ LOGOS (remote PNG so no missing asset crashes)
// -------------------------
const _LOGO_URIS = {
  ebay: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/EBay_logo.svg/320px-EBay_logo.svg.png",
  google:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Google_%22G%22_Logo.svg/256px-Google_%22G%22_Logo.svg.png",
  nike: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/Logo_NIKE.svg/320px-Logo_NIKE.svg.png",
};
// -------------------------
// ✅ FIX #1 (FLASHING CAMERA):
// DO NOT create Animated Camera component inside App().
// If you do, it can remount on every render and look like "reloading/flashing".
// -------------------------

// Keep CameraView props when wrapping with Reanimated
const AnimatedCameraView =
  (RNAnimated.createAnimatedComponent(CameraView as any) as any);

const CAMERA_KEY = "main_camera";
// -------------------------
// ✅ GLOBAL HELPERS (used outside App())
// -------------------------
function useAppActive() {
  const [active, setActive] = useState(true);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      setActive(state === "active");
    });
    return () => sub.remove();
  }, []);
  return active;
}
const toNumber = (v) => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const money = (n) =>
  Number.isFinite(n) ? `$${Number(n).toFixed(2)}` : "—";
const percent = (n) =>
  Number.isFinite(n) ? `${Math.round(Number(n))}%` : "—";

const safeMoney = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const _priceLadderData = (r: any) => {
  const paying = safeMoney(r?.scannedPrice);
  const cheapest = safeMoney(r?.price);
  const avg = safeMoney(r?.avgMarket || r?.estimatedResale || 0);

  const max = Math.max(1, paying, cheapest, avg);
  const pct = (x: number) => Math.max(0.06, Math.min(1, x / max)); // never invisible

  const estResale = safeMoney(r?.estimatedResale || 0);
  const flip =
    paying > 0 && estResale > 0 ? Math.round((estResale - paying) * 100) / 100 : null;

  return {
    paying,
    cheapest,
    avg,
    estResale,
    flip,
    pctPaying: pct(paying),
    pctCheapest: pct(cheapest),
    pctAvg: pct(avg),
  };
};

// -------------------------
// ✅ RETENTION + INTELLIGENCE HELPERS
// -------------------------
const DAY_MS = 24 * 60 * 60 * 1000;
// replace later with your real website / App Store URL
const APP_SHARE_URL = "https://evanai.app";
const clamp100 = (n) => Math.max(0, Math.min(100, Number(n) || 0));
const inferCategory = (q = "") => {
  const s = String(q || "").toLowerCase();
  if (/(nike|adidas|jordans|sneaker|shoe|cleat|spike)/i.test(s)) return "Sneakers";
  if (/(iphone|ipad|macbook|airpods|ps5|xbox|nintendo|camera|sony|canon|nikon)/i.test(s)) return "Electronics";
  if (/(vintage|antique|collectible|trading card|pokemon|lego|comic|rare)/i.test(s)) return "Collectibles";
  if (/(bag|handbag|louis vuitton|gucci|prada|coach|wallet)/i.test(s)) return "Luxury";
  if (/(guitar|piano|violin|amp|microphone|audio interface)/i.test(s)) return "Music";
  return "General";
};
const computeInsights = ({
  scannedPrice,
  cheapestPrice,
  avgMarket,
  low,
  high,
  confidence,
  totalMatches,
  url,
  historyPoints = [], // [number]
}) => {
  const sp = Number.isFinite(scannedPrice) && scannedPrice > 0 ? scannedPrice : null;
  const cp = Number.isFinite(cheapestPrice) && cheapestPrice > 0 ? cheapestPrice : null;
  const avg = Number.isFinite(avgMarket) && avgMarket > 0 ? avgMarket : (cp ?? null);
  // savings % (if user entered price)
  const savingsPct = sp && cp ? clamp100(((sp - cp) / sp) * 100) : 0;
  // spread % (how wide the market is)
  const spreadPct =
    Number.isFinite(low) && Number.isFinite(high) && avg
      ? clamp100(((high - low) / avg) * 100)
      : null;
  // spread score: tighter market = higher score
  const spreadScore = spreadPct == null ? 55 : clamp100(100 - spreadPct);
  // liquidity: more matches = better
  const liquidityScore = totalMatches ? clamp100((totalMatches / 60) * 100) : 35;
  // volatility: from history (best-price over time). higher = worse
  let volatilityScore = 55;
  if (Array.isArray(historyPoints) && historyPoints.length >= 3) {
    const pts = historyPoints.slice(-10);
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const base = pts[pts.length - 1] || avg || 1;
    const vPct = base ? ((max - min) / base) * 100 : 40;
    volatilityScore = clamp100(vPct);
  } else if (spreadPct != null) {
    volatilityScore = clamp100(spreadPct * 0.8);
  }
  // stability: inverse of volatility
  const stabilityScore = clamp100(100 - volatilityScore);
  // confidence score
  const confidenceScore = clamp100((Number(confidence) || 0) * 100);
  // authenticity heuristic (NOT perfect, just a signal)
  const authBase = isTrustedUrl(url) ? 78 : 52;
  const authenticityScore = clamp100(authBase + (liquidityScore - 50) * 0.15 - (volatilityScore - 50) * 0.10);
  // resale velocity estimate
  const resaleVelocity =
    liquidityScore >= 70 && stabilityScore >= 60 ? "Fast" :
    liquidityScore >= 45 ? "Medium" : "Slow";
  // Buy Score (0–100)
  // (weights tuned for “feel right”)
  const buyScore = clamp100(
    savingsPct * 0.35 +
      confidenceScore * 0.20 +
      stabilityScore * 0.20 +
      liquidityScore * 0.15 +
      spreadScore * 0.10
  );
  // Three-state verdict — BUY / HOLD / PASS. No qualifiers.
  // BUY  ≥ 62  : signals support the purchase.
  // HOLD ≥ 40  : not enough signal to lock the call.
  // PASS < 40  : signals do not support the purchase.
  //
  // Phase 5 NOTE — LEGACY LOCAL VERDICT.
  // This is a frontend-only score→verdict computation, used as an
  // offline / no-server fallback. The canonical truth is the server's
  // buyOrPass.verdict; whenever a card has it, callers MUST prefer it
  // over this local computation. The output type is canonical, so the
  // contract gate downstream is satisfied — but having two sources of
  // verdict is exactly what Phase 0 set out to prevent. Track this on
  // the Phase 6 telemetry hook (verdict_disagreement_event).
  let buyVerdict: "BUY" | "HOLD" | "PASS" = "PASS";
  if (buyScore >= 62) buyVerdict = "BUY";
  else if (buyScore >= 40) buyVerdict = "HOLD";
  else buyVerdict = "PASS";
  return {
    buyScore,
    buyVerdict,
    savingsPct,
    spreadScore,
    spreadPct,
    volatilityScore,
    liquidityScore,
    stabilityScore,
    resaleVelocity,
    authenticityScore,
  };
};
const _buildShareCardText = (card) => {
  if (!card) return "";
  const lines = [];
  lines.push("EVAN AI");
  lines.push("—");
  lines.push(card.itemName || "Scan");
  if (Number.isFinite(card.buyScore)) lines.push(`Buy Score: ${Math.round(card.buyScore)}/100 · ${card.buyVerdict || ""}`.trim());
  if (Number.isFinite(card.price)) lines.push(`Cheapest: ${money(card.price)} · ${card.store || "Marketplace"}`);
  if (Number.isFinite(card.scannedPrice) && Number.isFinite(card.savedAmount)) {
    lines.push(`You paid: ${money(card.scannedPrice)} · Saved: ${money(card.savedAmount)} (${percent(card.cheaperPct)})`);
  }
  if (card.resaleVelocity) lines.push(`Resale velocity: ${card.resaleVelocity}`);
  if (Number.isFinite(card.authenticityScore)) lines.push(`Authenticity signal: ${Math.round(card.authenticityScore)}/100`);
  lines.push("—");
  if (card.buyLink) lines.push(`Listing: ${card.buyLink}`);
  lines.push(`Get Evan AI: ${APP_SHARE_URL}`);
  return lines.join("\n");
};
// -------------------------
// RESULTS: SMALL RESULT CARD
// -------------------------
const _renderSmallResultCard = (item, idx) => {
  if (!item) return null;
const title = item.title || item.itemName || "Listing";
const img = item.image || item.thumbnail || null;
const price =
  typeof item.price === "number"
    ? item.price
    : parseFloat(String(item.price ?? "").replace(/[^0-9.]/g, "")) || null;
const rating =
  typeof item.rating === "number" && Number.isFinite(item.rating)
    ? item.rating
    : null;
// Only show as openable when item is clickable and has a non-blocked directUrl
const _itemClickable = item.clickable !== false && !!item.directUrl && !_isListingBlockedUrl(item.directUrl);

const onPress = () => {
  safeOpenListingUrl(item, title);
};

 return (
  <Pressable
    key={item.id ?? `${idx}`}
    onPress={onPress}
    style={({ pressed }) => [
      styles.miniCard,
      pressed && { opacity: 0.92, transform: [{ scale: 0.995 }] },
    ]}
  >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center", flex: 1 }}>
{img ? (
  <Image source={{ uri: img }} style={styles.miniImg} />
) : (
  <View style={styles.miniImgFallback}>
<Ionicons
  name="open-outline"
  size={18}
  color={_itemClickable ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.24)"}
/>
  </View>
)}
<View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={styles.miniTitle}>
              {title}
            </Text>
            {price != null && (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={styles.miniPrice}>{money(price)}</Text>
                {rating != null && (
                  <Ionicons
                    name="star"
                    size={13}
                    color="rgba(255,255,255,0.85)"
                    style={{ marginLeft: 8 }}
                  />
                )}
              </View>
            )}
          </View>
        </View>
        <Ionicons
          name={_itemClickable ? "open-outline" : "bar-chart-outline"}
          size={18}
          color={_itemClickable ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.3)"}
        />
      </View>
    </Pressable>
  );
};
// -------------------------
// SECURITY: Trusted domains
// -------------------------
const TRUSTED_DOMAINS = [
  "app.apple.com",
  "amazon.com",
  "walmart.com",
  "target.com",
  "bestbuy.com",
  "costco.com",
  "ebay.com",
  "etsy.com",
  "facebook.com",
  "marketplace.facebook.com",
  "offerup.com",
  "poshmark.com",
  "depop.com",
  "grailed.com",
  "vestiairecollective.com",
  "therealreal.com",
  "thredup.com",
  "vinted.com",
  "stockx.com",
  "goat.com",
  "newegg.com",
  "bhphotovideo.com",
  "adorama.com",
  "ifixit.com",
  "chairish.com",
  "1stdibs.com",
  "shopgoodwill.com",
  "goodwillfinds.com",
  "craigslist.org",
];
function isTrustedUrl(url) {
  try {
    const m = String(url).match(/^https?:\/\/([^/]+)/i);
    const hostname = (m?.[1] || "").toLowerCase();
    if (!hostname) return false;
    return TRUSTED_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}
const getDomain = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
let __unverifiedLinkPrompt = null;
const requestUnverifiedLinkPrompt = (payload) => {
  try {
    if (typeof __unverifiedLinkPrompt === "function") {
      __unverifiedLinkPrompt(payload);
      return true;
    }
  } catch (_e) {}
  return false;
};
async function safeOpenUrl(url, label) {
const open = async () => {
  try {
    // iOS/Android: open in an in-app browser (Safari View / Custom Tabs)
    if (Platform.OS !== "web") {
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        dismissButtonStyle: "close",
        enableBarCollapsing: true,
        showTitle: true,
      });
      return;
    }
    // Web fallback
    const can = await Linking.canOpenURL(url);
    if (!can) {
      Alert.alert(
        "Can't open link",
        label ? `Couldn't open: ${label}` : "Couldn't open this link."
      );
      return;
    }
    await Linking.openURL(url);
  } catch (e) {
    console.warn("Failed to open URL:", url, e);
    Alert.alert("Failed to open link", "Please try again.");
  }
};
// "Open verified link?" prompt removed — opens cleanly without confirmation,
// per the user's no-friction request. The link-safety validation
// (isTrustedUrl + getDomain) still runs upstream and downstream consumers
// continue to reject obvious redirect wrappers; we just no longer punish the
// user with an extra tap. If the URL fails outright we still surface a
// silent toast via setSavedToast (parent owns it) — no system alerts.
  await open();
}

// Hard guard for listing-specific opens. Never opens Google/SerpAPI/ad/search URLs.
// Takes either a full item object (preferred) or a raw url string.
const _LISTING_BLOCKED_HOSTS = [
  "google.com", "googleadservices.com", "googlesyndication.com",
  "doubleclick.net", "serpapi.com", "googleleadservices.com",
];
const _LISTING_BLOCKED_PATHS = ["/search", "/shopping", "/product/url", "/aclk", "/sch"];
function _isListingBlockedUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  try {
    const u = new URL(String(url));
    const host = u.hostname.toLowerCase();
    if (_LISTING_BLOCKED_HOSTS.some(h => host === h || host.endsWith(`.${h}`))) return true;
    if (_LISTING_BLOCKED_PATHS.some(p => u.pathname.startsWith(p))) return true;
    return false;
  } catch { return true; }
}

async function safeOpenListingUrl(itemOrUrl: any, title?: string): Promise<void> {
  // Accept either an item object or a raw URL string
  const isItemObj = itemOrUrl && typeof itemOrUrl === "object";
  const item   = isItemObj ? itemOrUrl : null;
  const rawUrl = isItemObj
    ? (item.directUrl || null)
    : (typeof itemOrUrl === "string" ? itemOrUrl : null);
  const label  = title || (isItemObj ? (item.title || item.itemName || "Listing") : "Listing");
  const clickable = isItemObj ? item.clickable : undefined;

  // Block if item explicitly not clickable
  if (clickable === false) {
    try { console.log("FRONTEND_LISTING_NOT_CLICKABLE", { title: String(label).slice(0, 80), source: item?.source || null, urlQuality: item?.urlQuality || null, directUrl: rawUrl, reason: "clickable_false" }); } catch {}
    return;
  }

  if (!rawUrl) {
    try { console.log("FRONTEND_LISTING_NOT_CLICKABLE", { title: String(label).slice(0, 80), source: item?.source || null, reason: "no_direct_url" }); } catch {}
    return;
  }

  // Block Google/SerpAPI/search wrapper URLs
  if (_isListingBlockedUrl(rawUrl)) {
    try { console.log("FRONTEND_BLOCKED_LISTING_URL", { title: String(label).slice(0, 80), source: item?.source || null, attemptedUrl: rawUrl, directUrl: item?.directUrl || null, urlQuality: item?.urlQuality || null, clickable, reason: "blocked_host_or_path" }); } catch {}
    return;
  }

  try { console.log("FRONTEND_OPEN_LISTING_URL", { title: String(label).slice(0, 80), source: item?.source || null, chosenUrl: rawUrl, directUrl: item?.directUrl || null, urlQuality: item?.urlQuality || null }); } catch {}
  await safeOpenUrl(rawUrl, label);
}

function normalizeMarketResponse(payload: any) {
  const rawItems = Array.isArray(payload?.market)
    ? payload.market
    : Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload?.results)
    ? payload.results
    : [];

  const items = rawItems
    .filter(Boolean)
    .map((it: any, index: number) => {
      // Respect clickable:false from the backend — don't fall back to buyLink/url
      // when the server has explicitly said this item has no direct merchant URL.
      // This prevents Google Shopping URLs that survive in buyLink from being
      // promoted to directUrl via the rawUrl fallback chain.
      const _serverClickable = it?.clickable !== false;
      const rawUrl = _serverClickable
        ? (it?.directUrl ||
           it?.url ||
           it?.buyLink ||
           it?.link ||
           it?.itemWebUrl ||
           it?.merchant_link ||
           it?.offer_page_url ||
           it?.product_url ||
           null)
        : null;

      // For clickable items only trust URLs from known-good domains
      const trustedRawUrl = rawUrl && isTrustedUrl(rawUrl) ? rawUrl : null;
      const resolvedUrl   = trustedRawUrl || (rawUrl && _serverClickable ? rawUrl : null);

      const totalCandidate =
        Number.isFinite(Number(it?.totalPrice))
          ? Number(it.totalPrice)
          : Number.isFinite(Number(it?.total))
          ? Number(it.total)
          : Number.isFinite(Number(it?.allInPrice))
          ? Number(it.allInPrice)
          : null;

      const priceCandidate =
        Number.isFinite(Number(it?.price))
          ? Number(it.price)
          : Number.isFinite(Number(it?.numericPrice))
          ? Number(it.numericPrice)
          : totalCandidate;

      return {
        ...it,
        id: it?.id || `${index}_${resolvedUrl || it?.title || "item"}`,
        title: it?.title || it?.itemName || "Listing",
        itemName: it?.title || it?.itemName || "Listing",
        price: priceCandidate,
        totalPrice: totalCandidate ?? priceCandidate,
        store: it?.source || it?.store || "Marketplace",
        source: it?.source || it?.store || "Marketplace",
        url:      resolvedUrl,
        buyLink:  resolvedUrl,
        directUrl: resolvedUrl,
        clickable: _serverClickable && !!resolvedUrl,
        urlQuality: it?.urlQuality || it?.urlSource || null,
        image: it?.image || it?.thumbnail || it?.thumbnail_url || null,
        trusted: !!(resolvedUrl && isTrustedUrl(resolvedUrl)),
      };
    })
    .filter(
      (it: any) =>
        it?.title &&
        (Number.isFinite(it?.totalPrice) || Number.isFinite(it?.price))
    )
    .sort((a: any, b: any) => {
      const ap = Number.isFinite(a?.totalPrice) ? a.totalPrice : a?.price;
      const bp = Number.isFinite(b?.totalPrice) ? b.totalPrice : b?.price;
      return Number(ap || Infinity) - Number(bp || Infinity);
    });

  const best = items[0] || null;

  return {
    items,
    best,
    bestPrice:
      Number.isFinite(best?.totalPrice) ? best.totalPrice : best?.price ?? null,
    totalMatches: Number(payload?.totalMatches) || items.length || 0,
    finalQuery: payload?.finalQuery || payload?.query || null,
    searchedQueries: Array.isArray(payload?.searchedQueries)
      ? payload.searchedQueries
      : [],
    consensus: payload?.consensus || null,
    prediction: payload?.prediction || null,
    coach: payload?.coach || null,
    pulse: payload?.pulse || null,
  };
}

class AppErrorBoundary extends React.Component<

  { children: React.ReactNode },
  { hasError: boolean; err: any }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, err: null };
  }
  static getDerivedStateFromError(err: any) {
    return { hasError: true, err };
  }
  componentDidCatch(err: any) {
    console.log("🔥 App crashed:", err);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: TOK.C.bg, justifyContent: "center", alignItems: "center", padding: 24 }}>
          <Text style={{ color: "white", fontSize: 20, fontWeight: "900", marginBottom: 10 }}>
            Evan AI hit an error
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.75)", textAlign: "center" }}>
            Restart the app. If it keeps happening, it’s likely a server response issue.
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}
const _track = async (event, props = {}) => {
  try {
    // local debug
    console.log("📈", event, props);
    // optional backend tracking endpoint
    // await apiFetch(`${resolvedApiBase || SAFE_API_BASE}/analytics`, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({ event, props, ts: Date.now() }),
    // });
  } catch {}
};
class _ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message?: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(err: any) {
    return { hasError: true, message: String(err?.message || err) };
  }
  componentDidCatch(err: any, info: any) {
    console.warn("ErrorBoundary crash:", err, info);
  }
  render() {
    if (this.state.hasError) {
      return (
<View style={{ flex: 1, backgroundColor: "transparent", justifyContent: "center", alignItems: "center", padding: 24 }}>
          <Text style={{ color: "white", fontSize: 18, fontWeight: "800" }}>Evan AI hit a snag</Text>
          <Text style={{ color: "rgba(255,255,255,0.75)", marginTop: 10, textAlign: "center" }}>
            Close and reopen the app. If this keeps happening, it’s a bug — not you.
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.45)", marginTop: 14, fontSize: 12, textAlign: "center" }}>
            {this.state.message}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

// ── Live Activity Ticker — module-level constants ────────────────────────────
const TICKER_MSGS = [
  "🔥 Sarah in Chicago saved $84 using Evan AI!",
  "💰 Mike flipped a PS5 for $120 profit",
  "✅ James found AirPods Pro 2 for $87 less",
  "💰 Taylor sold vintage Levi's for $210 — bought for $35",
  "🎯 Emma saved $62 on a Coach bag today",
  "⚡ Ryan spotted a $200 flip on Jordan 4s",
  "🛍️ Priya saved $110 on a MacBook Air deal",
  "✅ Alex verified authentic Supreme hoodie — avoided $90 fake",
  "🔔 Jordan saved $47 using Evan AI price alert",
  "📈 Kayla flipped vintage Nike Dunks for $180 profit",
  "🎉 Devon in Brooklyn saved $93 this week",
  "🔔 Price alert — AirPods Max dropped to $389",
  "✨ Sophia saved $55 on Ray-Ban sunglasses",
  "🚀 Marcus flipped 3 items for $340 total profit",
  "💡 Aiden caught a $150 underpriced vintage leather jacket",
  "🛍️ Isabella saved $38 on Bose headphones",
  "🔥 Noah in LA flipped a vintage Rolex for $800 profit",
  "📸 Olivia avoided overpaying $65 — condition mismatch caught",
  "💎 Liam saved $200 on a camera lens using Evan AI",
  "⚡ Ava found same PS4 for $49 less nearby",
  "🎯 Ethan saved $74 on a gaming chair today",
  "🌟 Mia flipped thrifted Prada bag for $340 profit",
  "💰 Owen spotted AJ1 Retro for $95 below market",
  "📱 Zoe saved $130 on an iPhone 14 Pro Max",
  "🔥 Lucas in Miami saved $58 on Yeezy 350s",
  "🔥 Tyler flipped AirPods Pro for $88 profit",
  "💰 Mason saved $67 on a Nike hoodie",
  "🎯 Ethan found a $320 camera for $140",
  "📈 Logan flipped Jordans for $135 profit",
  "🛍️ Ava saved $58 on Lululemon shorts",
  "⚡ Noah spotted a $210 underpriced iPad",
  "💎 Emma flipped a Gucci belt for $175",
  "🎉 Ryan saved $42 on Beats Studio",
  "🚀 Lucas flipped a PS5 for $105 profit",
  "💵 Olivia saved $79 on a North Face jacket",
  "🔥 Dylan flipped Yeezys for $155 profit",
  "💰 Sophia saved $63 on Ray-Bans",
  "🎯 Carter found a $450 laptop for $190",
  "📈 Aiden flipped Dunks for $128 profit",
  "🛍️ Chloe saved $71 on Nike Tech",
  "⚡ Benjamin spotted a $280 flip",
  "💎 Lily flipped a Prada bag for $240",
  "🎉 Owen saved $36 on Vans",
  "🚀 Elijah flipped a MacBook for $290",
  "💵 Harper saved $102 on a Dyson",
  "🔥 Jack flipped a gaming chair for $85",
  "💰 Grace saved $77 on sneakers",
  "🎯 Wyatt found a $380 deal on headphones",
  "📈 Luke flipped Jordans for $142",
  "🛍️ Victoria saved $64 on Alo leggings",
  "⚡ David spotted a $310 flip",
  "💎 Sofia flipped a Rolex for $900",
  "🎉 Joseph saved $47 on Adidas",
  "🚀 Matthew flipped a drone for $165",
  "💵 Aria saved $88 on a handbag",
  "🔥 Samuel flipped a bike for $120",
  "💰 Zoe saved $69 on Crocs",
  "🎯 Andrew found a $500 camera for $230",
  "📈 Joshua flipped Yeezys for $175",
  "🛍️ Natalie saved $54 on Gymshark",
  "⚡ Christian spotted a $240 flip",
  "💎 Layla flipped a Louis Vuitton wallet",
  "🎉 Aaron saved $39 on Converse",
  "🚀 Thomas flipped a TV for $180",
  "💵 Brooklyn saved $95 on a coat",
  "🔥 Isaac flipped headphones for $110",
  "💰 Hannah saved $83 on leggings",
  "🎯 Gabriel found a $420 deal",
  "📈 Julian flipped Jordans for $138",
  "🛍️ Violet saved $62 on Nike",
  "⚡ Levi spotted a $260 flip",
  "💎 Nora flipped a Cartier bracelet",
  "🎉 Adam saved $44 on slides",
  "🚀 Eli flipped a console for $98",
  "💵 Hazel saved $72 on a bag",
  "🔥 Connor flipped a monitor for $95",
  "💰 Aurora saved $101 on a jacket",
  "🎯 Hunter found a $360 flip",
  "📈 Dominic flipped Dunks for $120",
  "🛍️ Bella saved $75 on sneakers",
  "⚡ Jaxon spotted a $230 flip",
  "💎 Lucy flipped a designer purse",
  "🎉 Evan saved $50 on Nike",
  "🚀 Miles flipped a MacBook for $270",
  "💵 Ellie saved $84 on headphones",
  "🔥 Leo flipped Jordans for $150",
  "💰 Stella saved $68 on UGGs",
  "🎯 Anthony found a $410 deal",
  "📈 Isaiah flipped Yeezys for $185",
  "🛍️ Ruby saved $59 on leggings",
  "⚡ Caleb spotted a $250 flip",
  "💎 Alice flipped a Chanel bag",
  "🎉 Jordan saved $41 on Air Max",
  "🚀 Cooper flipped a PS4 for $90",
  "💵 Sadie saved $78 on a hoodie",
  "🔥 Nolan flipped a bike for $135",
  "💰 Peyton saved $66 on Crocs",
  "🎯 Jason found a $390 deal",
  "📈 Wesley flipped Jordans for $145",
  "🛍️ Clara saved $82 on Nike",
  "⚡ Ryder spotted a $220 flip",
  "💎 Eva flipped a luxury watch",
  "🎉 Carson saved $37 on Vans",
  "🚀 Axel flipped a TV for $175",
  "💵 Lila saved $92 on a jacket",
];
const TICKER_SINGLE = TICKER_MSGS.join("     ");
const TICKER_TEXT = TICKER_SINGLE + "     " + TICKER_SINGLE;
const TICKER_CHAR_W = 8.4;
const TICKER_TOTAL_W = TICKER_SINGLE.length * TICKER_CHAR_W;
// ─────────────────────────────────────────────────────────────────────────────

const TUTORIAL_STEPS = [
  {
    icon: "sparkles-outline" as const,
    iconColor: "white",
    iconBg: "rgba(255,255,255,0.07)",
    accentColor: "rgba(255,255,255,0.55)",
    subtitle: "WELCOME",
    title: "Scan smarter.\nSell better.",
    body: "Evan AI is your camera-powered deal scanner. Point at any item and get real market prices, flip potential, and AI-verified condition — in seconds.",
  },
  {
    icon: "camera-outline" as const,
    iconColor: "white",
    iconBg: "rgba(255,255,255,0.07)",
    accentColor: "rgba(255,255,255,0.55)",
    subtitle: "AI VISION",
    title: "Point. Identify.\nInstantly.",
    body: "Clothes, sneakers, electronics, furniture — Evan's AI identifies items in seconds and searches 20+ marketplaces simultaneously.",
  },
  {
    icon: "trending-up-outline" as const,
    iconColor: "#50ff96",
    iconBg: "rgba(80,255,150,0.08)",
    accentColor: "#50ff96",
    subtitle: "LIVE MARKET DATA",
    title: "Real prices.\nReal results.",
    body: "See eBay sold comps, Amazon listings, and local deals — all at once. Know exactly what something is worth before you buy or sell.",
  },
  {
    icon: "rocket-outline" as const,
    iconColor: "#ffd060",
    iconBg: "rgba(255,200,50,0.08)",
    accentColor: "#ffd060",
    subtitle: "FLIP INTELLIGENCE",
    title: "Turn finds\ninto profit.",
    body: "Spot underpriced items before anyone else. See resale velocity, profit margins, and the best time to buy or list.",
  },
  {
    icon: "shield-checkmark-outline" as const,
    iconColor: "#82c8ff",
    iconBg: "rgba(130,200,255,0.08)",
    accentColor: "#82c8ff",
    subtitle: "FREE TO START",
    title: "You're ready\nto go.",
    body: "Start with 3 free scans per day — no credit card, no commitment. Upgrade to Pro for unlimited scans, price alerts, and watchlist sync.",
  },
] as const;

export default function App() {

  const [intelState, setIntelState] = useState<IntelState>(emptyIntel());

  useEffect(() => {
    (async () => {
      const loaded = await loadIntel();
      setIntelState(loaded);
    })();
  }, []);


  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <AppInner intelState={intelState} setIntelState={setIntelState} />
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}

// ─── Jackpot Price — golden breathing glow on the Go Pass price ───────────────
function JackpotPrice({ price }: { price: number }) {
  const glow = useSharedValue(0.35);
  useEffect(() => {
    glow.value = withRepeat(
      withSequence(
        withTiming(0.75, { duration: 1500 }),
        withTiming(0.35, { duration: 1500 }),
      ),
      -1, false,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const glowStyle = useAnimatedStyle(() => ({
    shadowColor: "#FFD700",
    shadowOpacity: glow.value,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  }));
  return (
    <Reanimated.View style={[glowStyle as any, { alignSelf: "flex-start" }]}>
      <Text style={{ color: "white", fontWeight: "900", fontSize: 30, letterSpacing: -0.8, lineHeight: 32 }}>
        ${price.toFixed(2)}
        <Text style={{ fontSize: 14, color: "rgba(255,255,255,0.70)", fontWeight: "800" }}>{" "}/ mo</Text>
      </Text>
    </Reanimated.View>
  );
}

// ─── Sentient Greeting ────────────────────────────────────────────────────────
function getGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5  && h < 11) return "The early bird gets the flip.";
  if (h >= 11 && h < 14) return "Midday market check. Prices are moving.";
  if (h >= 14 && h < 18) return "Afternoon run. Best time to list.";
  if (h >= 18 && h < 23) return "Evening sourcing. Deals are waiting.";
  return "Night owl mode active. Find the hidden gems.";
}



// ─── Vault Fly Particle ───────────────────────────────────────────────────────
function VaultFlyParticle({ uri }: { uri: string }) {
  const { width: W, height: H } = useWindowDimensions();
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const sc = useSharedValue(1);
  const op = useSharedValue(0.95);

  useEffect(() => {
    // Fly from center (card) → bottom-right (profile tab, ~3rd of 4 tabs)
    tx.value = withTiming(W * 0.30, { duration: 680, easing: Easing.in(Easing.quad) });
    ty.value = withTiming(H * 0.42, { duration: 680, easing: Easing.in(Easing.quad) });
    sc.value  = withTiming(0.06, { duration: 680 });
    op.value  = withSequence(
      withTiming(1,   { duration: 160 }),
      withDelay(280, withTiming(0, { duration: 360 })),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: sc.value },
    ] as any,
  }));

  return (
    <Reanimated.View
      pointerEvents="none"
      style={[vaultFlyStyles.particle, style as any]}
    >
      <Image source={{ uri }} style={vaultFlyStyles.img} resizeMode="cover" />
    </Reanimated.View>
  );
}
const vaultFlyStyles = StyleSheet.create({
  particle: {
    position: "absolute",
    top: "40%" as any,
    left: "50%" as any,
    marginLeft: -36,
    marginTop: -36,
    width: 72,
    height: 72,
    borderRadius: 12,
    overflow: "hidden",
    zIndex: 9999,
  },
  img: { width: 72, height: 72 },
});

type NeuralScanOverlayProps = {
  active: boolean;
  onFinished?: () => void;
};
function NeuralScanOverlay({ active, onFinished }: NeuralScanOverlayProps) {
  // Shared values (GPU-driven)
  const v = useSharedValue(0);        // master visibility 0..1
  const beam = useSharedValue(0);     // diagonal sweep 0..1
  const glow = useSharedValue(0);     // breathing ambient 0..1
  const pulse = useSharedValue(0);    // core pulse 0..1
  const trace = useSharedValue(0);    // edge trace reveal 0..1
  const shimmer = useSharedValue(0);  // metallic sweep 0..1
  // Always-mounted overlay opacity (no conditional mounting = no flicker)
  const overlayStyle = useAnimatedStyle(() => {
    return {
      opacity: v.value,
    };
  }, []);
  // A clean “neural-ish” outline path (placeholder).
  // Later you can swap this with a real detected contour path.
  const outline = Skia.Path.Make();
  outline.addRRect(
    {
      rect: { x: 40, y: 160, width: 320, height: 420 },
      rx: 28,
      ry: 28,
    },
    false
  );
  const corePath = Skia.Path.Make();
  corePath.addCircle(200, 380, 44);
  const run = (done?: () => void) => {
    "worklet";
    cancelAnimation(v);
    cancelAnimation(beam);
    cancelAnimation(glow);
    cancelAnimation(pulse);
    cancelAnimation(trace);
    cancelAnimation(shimmer);
    // Fade in overlay (cinematic dim + glass)
    v.value = withTiming(1, { duration: 160, easing: Easing.out(Easing.cubic) });
    // Ambient breathing glow (subtle)

glow.value = withSequence(
  withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
  withTiming(0, { duration: 900, easing: Easing.inOut(Easing.sin) }),
  withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
  withTiming(0, { duration: 900, easing: Easing.inOut(Easing.sin) })
);
    // Diagonal volumetric sweep
    beam.value = withSequence(
      withDelay(90, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) })),
      withTiming(0, { duration: 0 })
    );
    // Central neural core pulse
    pulse.value = withSequence(
      withDelay(120, withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) })),
      withTiming(0, { duration: 420, easing: Easing.inOut(Easing.sin) })
    );
    // Edge trace reveal + metallic shimmer pass
    trace.value = withDelay(160, withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) }));
    shimmer.value = withDelay(260, withTiming(1, { duration: 640, easing: Easing.inOut(Easing.sin) }));
    // Finish: clean fade out (camera stays mounted underneath)
    v.value = withDelay(
      980,
      withTiming(0, { duration: 220, easing: Easing.inOut(Easing.cubic) }, (finished) => {
        if (finished && done) runOnJS(done)();
      })
    );
  };
  // Start/stop reactions (without re-render loops)
  // We keep it simple: when active flips true, run sequence.
  // When active flips false, fade out.

React.useEffect(() => {
  if (!active) {
    // hard stop when overlay turns off
    cancelAnimation(v);
    cancelAnimation(beam);
    cancelAnimation(glow);
    cancelAnimation(pulse);
    cancelAnimation(trace);
    cancelAnimation(shimmer);

    v.value = withTiming(0, { duration: 140, easing: Easing.inOut(Easing.cubic) });
    beam.value = 0;
    glow.value = 0;
    pulse.value = 0;
    trace.value = 0;
    shimmer.value = 0;
    return;
  }

  run(() => {
    onFinished?.();
  });

  return () => {
    // cleanup if component unmounts mid-animation
    cancelAnimation(v);
    cancelAnimation(beam);
    cancelAnimation(glow);
    cancelAnimation(pulse);
    cancelAnimation(trace);
    cancelAnimation(shimmer);

    v.value = 0;
    beam.value = 0;
    glow.value = 0;
    pulse.value = 0;
    trace.value = 0;
    shimmer.value = 0;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [active, onFinished]);

const dimOpacity = 0.48;
const glassOpacity = 0.22;

// Beam geometry (Skia props need actual animated numbers, not object math in JSX)
const beamRectX = useDerivedValue(() => 60 + 320 * beam.value - 220);
const beamRectX2 = useDerivedValue(() => 60 + 320 * beam.value - 220);

const shimmerRectX = useDerivedValue(() => 40 + 340 * shimmer.value - 180);
const shimmerRectX2 = useDerivedValue(() => 40 + 340 * shimmer.value - 180);

  return (
    <Reanimated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        },
        overlayStyle,
      ]}
    >
      {/* Cinematic dim + glass (no modal, no layout shift) */}
      <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: `rgba(0,0,0,${dimOpacity})` }} />
      <BlurView
        intensity={40}
        tint="dark"
        style={StyleSheet.absoluteFillObject}
      />
      {/* GPU Canvas (beam + trace + shimmer + core pulse) */}
      <Canvas style={StyleSheet.absoluteFillObject}>
        {/* Frosted glass frame */}
        <Group>
          <RoundedRect x={18} y={64} width={374} height={732} r={34}>
            <LinearGradient
              start={vec(18, 64)}
              end={vec(392, 796)}
              colors={[
                `rgba(255,255,255,${glassOpacity})`,
                `rgba(255,255,255,${glassOpacity * 0.55})`,
              ]}
            />
          </RoundedRect>
          <RoundedRect x={22} y={68} width={366} height={724} r={30} color={`rgba(255,255,255,0.08)`} />
        </Group>
        {/* Volumetric diagonal light beam sweep */}
        <Group>
<Rect x={beamRectX} y={-60} width={240} height={980} transform={[{ rotate: -0.55 }]} >
            <LinearGradient
              start={vec(0, 0)}
              end={vec(240, 0)}
              colors={[
                "rgba(255,255,255,0.00)",
                "rgba(255,255,255,0.22)",
                "rgba(255,255,255,0.00)",
              ]}
            />
          </Rect>
<Rect x={beamRectX2} y={-60} width={240} height={980} transform={[{ rotate: -0.55 }]} >
            <BlurMask blur={18} style="normal" />
          </Rect>
        </Group>
        {/* Edge trace */}
        <Group>
          <Path
            path={outline}
            style="stroke"
            strokeWidth={3.2}
            color={`rgba(255,255,255,${0.55 * trace.value})`}
          />
          <Path
            path={outline}
            style="stroke"
            strokeWidth={6.0}
            color={`rgba(255,255,255,${0.18 * trace.value})`}
          >
            <BlurMask blur={10} style="normal" />
          </Path>
        </Group>
        {/* Metallic shimmer across traced edges */}
        <Group>
<Rect x={shimmerRectX} y={120} width={220} height={620} transform={[{ rotate: -0.55 }]}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(220, 0)}
              colors={[
                "rgba(255,255,255,0.00)",
                "rgba(255,255,255,0.24)",
                "rgba(255,255,255,0.00)",
              ]}
            />
          </Rect>
<Rect x={shimmerRectX2} y={120} width={220} height={620} transform={[{ rotate: -0.55 }]}>
            <BlurMask blur={14} style="normal" />
          </Rect>
        </Group>
        {/* Central neural scanning core pulse */}
        <Group>
          <Path path={corePath} color={`rgba(255,255,255,${0.18 + 0.18 * pulse.value})`} />
          <Path path={corePath} color={`rgba(255,255,255,${0.10 + 0.16 * pulse.value})`}>
            <BlurMask blur={18} style="normal" />
          </Path>
        </Group>
        {/* Ambient breathing surface glow (subtle) */}
        <Group>
          <RoundedRect x={18} y={64} width={374} height={732} r={34} color={`rgba(255,255,255,${0.04 + 0.06 * glow.value})`}>
            <BlurMask blur={26} style="normal" />
          </RoundedRect>
        </Group>
      </Canvas>
    </Reanimated.View>
  );
}
function AppInner({
  intelState,
  setIntelState,
}: any) {
// ─── FINANCE STATE ────────────────────────────────────────────────────────────
const {
  state:       financeState,
  recordScan:  recordFinanceScan,
} = useFinanceState();
// Track paywall impressions so upgrade intelligence can factor in fatigue
const [paywallImpressions, setPaywallImpressions] = React.useState(0);

// ─── SPATIAL ENGINE ──────────────────────────────────────────────────────────
const {
  setZone: setSpatialZone, setVerdict: setSpatialVerdict, setLaserActive: setSpatialLaser,
  setArchiveItems, inspectedArchiveId, setInspectedArchiveId,
} = useSpatialZone();
// -------------------------
// BILLIONAIRE STATE
// -------------------------
const [sellerMode, setSellerMode] = useState(false);
const [autoWatchEnabled, setAutoWatchEnabled] = useState(true);
const [inventory, setInventory] = useState<InventoryItem[]>([]);
useEffect(() => {
  AsyncStorage.setItem("EVAN_INVENTORY_V1", JSON.stringify(inventory));
}, [inventory]);
useEffect(() => {
  (async () => {
    const saved = await AsyncStorage.getItem("EVAN_INVENTORY_V1");
    if (saved) setInventory(JSON.parse(saved));
  })();
}, []);
const [inventoryOpen, setInventoryOpen] = useState(false);
const [batchOpen, setBatchOpen] = useState(false);
const [batchInventoryOpen, setBatchInventoryOpen] = useState(false);
const [batchQueue, setBatchQueue] = useState<BatchJob[]>([]);
const [batchRunning, setBatchRunning] = useState(false);
const [cloudImportOpen, setCloudImportOpen] = useState(false);
const [cloudImportText, setCloudImportText] = useState("");
const [refState, _setRefState] = useState<{ code: string; earned: number; used: number }>({
  code: "",
  earned: 0,
  used: 0,
});

useEffect(() => {
  // ✅ crash-proof: REF_KEY may be declared later in this file
  AsyncStorage.setItem("EVAN_REF_STATE_V1", JSON.stringify(refState)).catch(() => {});
}, [refState]);

const { top: TOP, bottom: BOTTOM } = useSafeAreaInsets();
const { width: SW, height: SH } = useWindowDimensions();

const TAB_BAR_H = 66;
const TAB_BAR_MARGIN = 18;

// memoized layout values (prevents recalculation every render)
const TAB_BAR_BOTTOM = useMemo(
  () => TAB_BAR_MARGIN + BOTTOM,
  [BOTTOM]
);

// Controls sit ABOVE the tab bar (no overlay)
const CAMERA_CONTROLS_BOTTOM = useMemo(
  () => TAB_BAR_BOTTOM + TAB_BAR_H + 18,
  [TAB_BAR_BOTTOM]
);

// ── Interactive tutorial step configs (computed with live screen dims) ─────
const I_STEPS = useMemo(() => [
  {
    tab: null as string | null,
    title: "Scan smarter.\nWin every deal.",
    subtitle: "WELCOME",
    body: "This is your AI-powered deal weapon. Let's show you around — 30 seconds, worth every one.",
    accentColor: "rgba(255,255,255,0.55)",
    iconColor: "white",
    icon: "sparkles-outline" as const,
    spotlight: null as { x: number; y: number; w: number; h: number; r: number } | null,
    tooltipTop: false,
    isLast: false,
  },
  {
    tab: "camera" as string | null,
    title: "One tap.\nInstant market price.",
    subtitle: "THE SCANNER",
    body: "Hit this button — your camera becomes a real-time pricing engine. AI identifies any item in under 3 seconds.",
    accentColor: "#ffffff",
    iconColor: "white",
    icon: "camera-outline" as const,
    spotlight: { x: SW / 2 - 62, y: SH - CAMERA_CONTROLS_BOTTOM - 112, w: 124, h: 124, r: 62 },
    tooltipTop: true,
    isLast: false,
  },
  {
    tab: "camera" as string | null,
    title: "Track your\ndeal intelligence.",
    subtitle: "SCAN COUNTER",
    body: "Your scan count and Pro status live here. 3 free scans per day, resets at midnight. Tap to upgrade for unlimited access.",
    accentColor: "#50ff96",
    iconColor: "#50ff96",
    icon: "pulse-outline" as const,
    spotlight: { x: 12, y: TOP + 4, w: 168, h: 60, r: 30 },
    tooltipTop: false,
    isLast: false,
  },
  {
    tab: "history" as string | null,
    title: "Every scan\nsaved forever.",
    subtitle: "DEAL HISTORY",
    body: "Your complete scan history lives here. Tap any entry for full market data, flip potential, and resale comps.",
    accentColor: "#82c8ff",
    iconColor: "#82c8ff",
    icon: "time-outline" as const,
    spotlight: { x: 16, y: TOP + 56, w: SW - 32, h: Math.round(SH * 0.32), r: 20 },
    tooltipTop: false,
    isLast: false,
  },
  {
    tab: "watchlist" as string | null,
    title: "Track items.\nCatch every drop.",
    subtitle: "WATCHLIST",
    body: "Heart any item to watch it. Evan alerts you the moment the price hits your target — never miss a steal.",
    accentColor: "#ffd060",
    iconColor: "#ffd060",
    icon: "heart-outline" as const,
    spotlight: { x: 16, y: TOP + 56, w: SW - 32, h: Math.round(SH * 0.22), r: 20 },
    tooltipTop: false,
    isLast: false,
  },
  {
    tab: "camera" as string | null,
    title: "You're ready\nto hunt deals.",
    subtitle: "LET'S GO",
    body: "7 free scans loaded and waiting. Every item you see is a potential steal, flip, or fortune. Start now.",
    accentColor: "#50ff96",
    iconColor: "#50ff96",
    icon: "flash-outline" as const,
    spotlight: null as { x: number; y: number; w: number; h: number; r: number } | null,
    tooltipTop: false,
    isLast: true,
  },
], [SW, SH, TOP, CAMERA_CONTROLS_BOTTOM]);

// Phase 5: this used to emit "STEAL"/"FAIR"/"OVERPRICED" — pure score-
// based legacy verdict that drove tone/colour by string interpretation.
// Replaced with canonical Verdict + presentation lookup. The buy
// thresholds are intentionally permissive here (offline / no-server
// fallback only); whenever a server-derived buyOrPass.verdict is
// available, the call site MUST prefer it over this local computation.
const getVerdict = ({ scannedPrice, cheapestPrice }) => {
  if (!Number.isFinite(scannedPrice) || !Number.isFinite(cheapestPrice)) {
    return null;
  }
  const diffPct = ((scannedPrice - cheapestPrice) / scannedPrice) * 100;
  const verdict = diffPct >= 30 ? "BUY"
                 : diffPct >= 10 ? "HOLD"
                 : "PASS";
  const p = verdictPresentation(verdict);
  return { verdict, label: p.label, tone: p.color, colorHex: p.colorHex };
};

const copyText = async (text: string) => {
  try {
    await Clipboard.setStringAsync(text);
    Haptics.selectionAsync();
  } catch {}
};

const openHelp = () => {
  hapticSelect();
  setHelpOpen(true);
  helpOpacity.setValue(0);

  RNAnimated.timing(helpOpacity, {
    toValue: 1,
    duration: 180,
    easing: Easing.out(Easing.cubic),
    useNativeDriver: true,
  }).start();
};

const closeHelp = () => {
  RNAnimated.timing(helpOpacity, {
    toValue: 0,
    duration: 160,
    easing: Easing.inOut(Easing.cubic),
    useNativeDriver: true,
  }).start(() => setHelpOpen(false));
};

  const scanCacheRef = useRef<Map<string, any>>(new Map());
  const cameraRef = useRef(null);

// ✅ CINEMATIC CAMERA → SCAN TRANSITION (LEVEL 1)
const [cinematicFreeze, setCinematicFreeze] = useState(false);
const freezeOpacity = useRef(new RNAnimated.Value(0)).current;
const vignetteOpacity = useRef(new RNAnimated.Value(0)).current;
// POLISH #1 — freeze image overlay (Apple feel)
const [freezeFrameUri, setFreezeFrameUri] = useState<string | null>(null);
const scanAnimTimerRef = useRef<any>(null);

const triggerCinematicScan = () => {
  // 120–180ms “freeze” + dark vignette + then neural overlay
  setCinematicFreeze(true);

  freezeOpacity.setValue(0);
  vignetteOpacity.setValue(0);

  // Freeze (quick hold)
  RNAnimated.sequence([
    RNAnimated.timing(freezeOpacity, {
      toValue: 1,
      duration: 90,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }),
    RNAnimated.delay(140),
    RNAnimated.timing(freezeOpacity, {
      toValue: 0,
      duration: 140,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }),
  ]).start(() => setCinematicFreeze(false));

  // Vignette fade (dark, cinematic)
  RNAnimated.sequence([
    RNAnimated.delay(110),
    RNAnimated.timing(vignetteOpacity, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }),
    RNAnimated.delay(420),
    RNAnimated.timing(vignetteOpacity, {
      toValue: 0,
      duration: 240,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }),
  ]).start();

  // Neural overlay begins AFTER the “freeze” moment
if (scanAnimTimerRef.current) clearTimeout(scanAnimTimerRef.current);
scanAnimTimerRef.current = setTimeout(() => {
  setScanAnimActive(true);
}, 140);
};

const [scanAnimActive, setScanAnimActive] = useState(false);
const [userId, setUserId] = useState<string | null>(null);
// ✅ Crash-proof refs (prevents use-before-declare TDZ crashes)

const profileModalRef = useRef(false);
const seeMoreOpenRef = useRef(false);
const haggleOpenRef = useRef(false);
const showPaywallRef = useRef(false);
const freePassInfoOpenRef = useRef(false);
const splashInfoOpenRef = useRef(false);
const resultModalOpenRef = useRef(false);

useEffect(() => {
  let mounted = true;
  (async () => {
    try {
      const key = "evan_user_id_v1"; // ✅ SINGLE KEY
      let id = await AsyncStorage.getItem(key);
      if (!id) {
        id = `u_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        await AsyncStorage.setItem(key, id);
      }
      if (mounted) setUserId(id);
      configurePurchases(id);
      identifyUser(id);
    } catch {
      if (mounted) setUserId("u_local_fallback");
    }
  })();
  return () => {
    mounted = false;
  };
}, []);


// Feature 7: Register Expo push token once userId is available
useEffect(() => {
  if (!userId) return;
  (async () => {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== "granted") return;
      const token = await Notifications.getExpoPushTokenAsync();
      if (token?.data) {
        await apiFetch("/push/register", {
          method: "POST",
          body: JSON.stringify({ userId, pushToken: token.data }),
        });
      }
    } catch {
      // non-fatal
    }
  })();
}, [userId]);

  const scanReqIdRef = useRef(0);
const _activeAbortRef = useRef<AbortController | null>(null);
const isMountedRef = useRef(true);
useEffect(() => {
  isMountedRef.current = true;
  return () => {
    isMountedRef.current = false;
  };
}, []);

// ── Foreground push notification handler ──────────────────────────────────
useEffect(() => {
  const sub = Notifications.addNotificationReceivedListener((notification) => {
    const title = notification.request.content.title || "";
    const body  = notification.request.content.body  || "";
    if (title || body) {
      setSavedToast(`${title}${title && body ? " — " : ""}${body}`.slice(0, 80));
    }
  });
  const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as any;
    if (data?.screen === "watchlist") {
      setTab("watchlist");
      setSpatialZone("watchlist");
      if (data?.watchlistId) {
        setFocusedWatchlistId(data.watchlistId);
        // Auto-scroll to the focused item after tab transition
        const idx = (watchlistRef.current || []).findIndex((w: any) => w.id === data.watchlistId);
        if (idx >= 0) {
          setTimeout(() => {
            watchlistScrollRef?.current?.scrollTo?.({ y: Math.max(0, idx * 218 - 16), animated: true });
          }, 380);
        }
      }
    }
  });
  return () => {
    sub.remove();
    tapSub.remove();
  };
}, []);
const nextScanReqId = () => {
  scanReqIdRef.current += 1;
  return scanReqIdRef.current;
};
const isReqAlive = (reqId: number) =>
  isMountedRef.current && reqId === scanReqIdRef.current;
  // ✅ Saved toast (MUST live inside App)
  const [savedToast, setSavedToast] = useState(null);
  const toastDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastFadeRef    = useRef<RNAnimated.CompositeAnimation | null>(null);
  const toastAnim = useRef(new RNAnimated.Value(0)).current;
  const splashIPop = useRef(new RNAnimated.Value(0)).current;
  const splashIY = useRef(new RNAnimated.Value(10)).current;
  const [unverifiedPrompt, setUnverifiedPrompt] = useState(null);
  useEffect(() => {
    __unverifiedLinkPrompt = (payload) => {
      setUnverifiedPrompt(payload); // { url, label, onOpen }
    };
    return () => {
      __unverifiedLinkPrompt = null;
    };
  }, []);
const [tab, setTab] = useState("camera");
const [_neuralLearningLevel, setNeuralLearningLevel] = useState(0);

// ✅ MUST exist before showOnlyActiveTab reads it
const tabSwitchingRef = useRef(false);
const pendingTabRef = useRef<any>(null);
const _lastTabTapRef = useRef<number>(0); // ✅ spam-tap throttle
const goTabLastRef = useRef(0);

// ✅ Anti-spam tab switching (prevents lag + overlay buildup)
const lastTabPressRef = useRef(0);
const TAB_COOLDOWN_MS = 260;

const _showOnlyActiveTab = true;

const tabFade = useRef(new RNAnimated.Value(1)).current; // ✅ never start hidden

  const [results, setResults] = useState([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [loadingPhotoUri, setLoadingPhotoUri] = useState(null);
  const [showRetryWhileLoading, setShowRetryWhileLoading] = useState(false);
  const [slowNetwork, setSlowNetwork] = useState(false);
  const [activeResult, setActiveResult] = useState(null);
  // ── Brain store subscriptions (single source of truth) ──────────────────
  const brainHotSignal = useEvanBrain(selectHotSignal);
  const brainPaywallVisible = useEvanBrain(selectPaywallVisible);
  const brainAspirationCtx = useEvanBrain(selectAspirationContext);

  const activeScanReqIdRef = useRef<number>(0);

const loadingOpacity = useSharedValue(0);

useEffect(() => {
  loadingOpacity.value = withTiming(loadingResults ? 1 : 0, {
    duration: loadingResults ? 240 : 180,
  });
}, [loadingResults, loadingOpacity]);

const _loadingFadeStyle = useAnimatedStyle(() => ({
  opacity: loadingOpacity.value,
}));

// Premium toast driver — fades in, holds ~900ms, fades out, then clears the
// message. Triggered whenever `savedToast` changes to a non-null value.
// Prior code only ran the animation from the unused _showSavedToast helper,
// so the 50+ direct setSavedToast("…") callers rendered a static toast that
// never disappeared. This effect makes every setSavedToast call animate
// uniformly and self-dismiss.
useEffect(() => {
  if (!savedToast) return;
  try { toastFadeRef.current?.stop?.(); } catch {}
  if (toastDismissRef.current) {
    clearTimeout(toastDismissRef.current);
    toastDismissRef.current = null;
  }
  toastAnim.setValue(0);
  const fadeIn = RNAnimated.timing(toastAnim, {
    toValue: 1,
    duration: 180,
    useNativeDriver: true,
  });
  fadeIn.start();
  toastDismissRef.current = setTimeout(() => {
    const fadeOut = RNAnimated.timing(toastAnim, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    });
    toastFadeRef.current = fadeOut;
    fadeOut.start(({ finished }) => {
      if (finished) setSavedToast(null);
    });
  }, 1200);
  return () => {
    if (toastDismissRef.current) {
      clearTimeout(toastDismissRef.current);
      toastDismissRef.current = null;
    }
  };
}, [savedToast, toastAnim]);

  const _confidenceBreath = useRef(new RNAnimated.Value(0)).current;
  const uiDepth = useRef(new RNAnimated.Value(0)).current;
  const cameraGlassDepth = useRef(new RNAnimated.Value(0)).current;
  const uiBreath = useRef(new RNAnimated.Value(0)).current;

useEffect(() => {
  const loop = RNAnimated.loop(
    RNAnimated.sequence([
      RNAnimated.timing(uiBreath, {
        toValue: 1,
        duration: 2600,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
      RNAnimated.timing(uiBreath, {
        toValue: 0,
        duration: 2600,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    ])
  );

  loop.start();
  return () => loop.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
  const neuralAura = useRef(new RNAnimated.Value(0)).current;
const [showOnboard, setShowOnboard] = useState(false);
const onboardOpacity = useRef(new RNAnimated.Value(0)).current;
const [showSurvey, setShowSurvey] = useState(false);
const tutorialOpacity = useRef(new RNAnimated.Value(1)).current;
const [showWelcomeScreen, setShowWelcomeScreen] = useState(false);
const welcomeScreenOp = useRef(new RNAnimated.Value(0)).current;
const [cameraDelayedActive, setCameraDelayedActive] = useState(false);
const _onboardScale = useRef(new RNAnimated.Value(0.96)).current;
const _onboardGlow = useRef(new RNAnimated.Value(0)).current;
const onboardGlowLoopRef = useRef<any>(null);
const [tutorialStep, setTutorialStep] = useState(0);
const tutorialContentOp = useRef(new RNAnimated.Value(0)).current;
const tutorialContentY = useRef(new RNAnimated.Value(18)).current;
const tutorialIconScale = useRef(new RNAnimated.Value(0.7)).current;
const [tutorialConfirmOpen, setTutorialConfirmOpen] = useState(false);
const tutorialConfirmOp = useRef(new RNAnimated.Value(0)).current;
const tutorialConfirmY = useRef(new RNAnimated.Value(40)).current;

// ── Interactive cinematic tutorial ──────────────────────────────────────
const [showITutorial, setShowITutorial] = useState(false);
const [iTutStep, setITutStep] = useState(0);
const iTutBgOp = useRef(new RNAnimated.Value(0)).current;
const iTutCardOp = useRef(new RNAnimated.Value(0)).current;
const iTutCardY = useRef(new RNAnimated.Value(28)).current;
const iTutSpotOp = useRef(new RNAnimated.Value(0)).current;
const iTutRingScale = useRef(new RNAnimated.Value(1.0)).current;
const iTutRingOpacity = useRef(new RNAnimated.Value(0)).current;
const iTutRingPulseRef = useRef<any>(null);
// Expanding ripple rings for spotlight steps
const iTutRipple0 = useRef(new RNAnimated.Value(0)).current;
const iTutRipple1 = useRef(new RNAnimated.Value(0)).current;
const iTutRipple2 = useRef(new RNAnimated.Value(0)).current;
const iTutRippleRef = useRef<any>(null);

// ── Achievement toast (dopamine system) ─────────────────────────────────
const [achieveToast, setAchieveToast] = useState<{ icon: string; title: string; body: string; color: string } | null>(null);
const achieveOp = useRef(new RNAnimated.Value(0)).current;
const achieveY = useRef(new RNAnimated.Value(-80)).current;
const prevScansRef = useRef(0);

// ── Feature: Flip Fatigue ────────────────────────────────────────────────
const [flipFatigue, setFlipFatigue] = useState<{ category: string; count: number; weeklyBought: number } | null>(null);

// ── Feature: Reseller Rivalry ────────────────────────────────────────────
const [rivalryCount, setRivalryCount] = useState<number>(0);

// ── Feature: Dead Stock ──────────────────────────────────────────────────
const [deadStockData, setDeadStockData] = useState<{ daysListed: number; suggestedOffer: number; leveragePct: number; message: string; urgencyLevel: string } | null>(null);

// ── Feature: Regret Tracker ──────────────────────────────────────────────
const [regretItems, setRegretItems] = useState<{ itemName: string; passedPrice: number; currentPrice: number; category: string; passedAt: number }[]>([]);
const [regretAlertOpen, setRegretAlertOpen] = useState(false);
const regretAlertOp = useRef(new RNAnimated.Value(0)).current;
const regretAlertY = useRef(new RNAnimated.Value(80)).current;

// ── Feature: Thrift Heat Map ─────────────────────────────────────────────
const [thriftHeatOpen, setThriftHeatOpen] = useState(false);
const [thriftStores, setThriftStores] = useState<{ name: string; emoji: string; heat: string; heatScore: number; isHotNow: boolean; isHotToday: boolean; tip: string; tagline: string; nextHotDay: string | null }[]>([]);
const thriftHeatOp = useRef(new RNAnimated.Value(0)).current;
const thriftHeatY = useRef(new RNAnimated.Value(60)).current;
const heatMapHeightRef = useRef(500);
const heatMapHeightAnim = useRef(new RNAnimated.Value(500)).current;
const heatMapPanResponder = useRef(PanResponder.create({
  onStartShouldSetPanResponder: () => true,
  onPanResponderMove: (_, g) => {
    const newH = Math.max(250, Math.min(800, heatMapHeightRef.current - g.dy));
    heatMapHeightAnim.setValue(newH);
  },
  onPanResponderRelease: (_, g) => {
    const newH = heatMapHeightRef.current - g.dy;
    if (newH > 800) {
      RNAnimated.spring(heatMapHeightAnim, { toValue: 500, useNativeDriver: false }).start();
    } else if (newH < 250) {
      // close
      RNAnimated.parallel([
        RNAnimated.timing(thriftHeatOp, { toValue: 0, duration: 220, useNativeDriver: true }),
        RNAnimated.timing(thriftHeatY, { toValue: 60, duration: 220, useNativeDriver: true }),
      ]).start(() => setThriftHeatOpen(false));
    } else {
      heatMapHeightRef.current = newH;
      RNAnimated.spring(heatMapHeightAnim, { toValue: newH, useNativeDriver: false }).start();
    }
  },
})).current;

// Feature 6: Lowball Script Generator
const [lowballScripts, setLowballScripts] = useState<{ platform: string; tone: string; message: string }[]>([]);
const [lowballOpen, setLowballOpen] = useState(false);
const lowballOp = useRef(new RNAnimated.Value(0)).current;
const lowballY = useRef(new RNAnimated.Value(60)).current;

// Feature 7: Flip Personality Type
const [flipPersonality, setFlipPersonality] = useState<{ type: string; description: string; avgHoldDays: number; totalScans: number; totalBought: number } | null>(null);

// Feature 8: Condition Drift Alert
const [conditionDrift, setConditionDrift] = useState<{ itemName: string; oldCondition: string; newCondition: string } | null>(null);

// Feature 9: Ghost Listing Detector
const [ghostRisk, setGhostRisk] = useState<{ riskScore: number; level: string; signals: string[]; warning: string | null } | null>(null);

// Feature 10: The One That Got Away (uses existing regretItems from feature 4)
const [gotAwayOpen, setGotAwayOpen] = useState(false);
const gotAwayOp = useRef(new RNAnimated.Value(0)).current;
const gotAwayY = useRef(new RNAnimated.Value(60)).current;

// Feature 11: Scan Graveyard
const [graveyardItems, setGraveyardItems] = useState<{ itemName: string; originalPrice: number; currentEstimate: number; dropPct: number; ageDays: number; message: string }[]>([]);
const [graveyardOpen, setGraveyardOpen] = useState(false);
const graveyardOp = useRef(new RNAnimated.Value(0)).current;
const graveyardY = useRef(new RNAnimated.Value(60)).current;

// Feature 12: Auction Snipe Timer
const [snipeData, setSnipeData] = useState<{ snipeAt: number; snipeInMs: number; maxBid: number | null; timeLabel: string; message: string } | null>(null);
const [snipeOpen, setSnipeOpen] = useState(false);
const snipeOp = useRef(new RNAnimated.Value(0)).current;
const snipeY = useRef(new RNAnimated.Value(60)).current;

// Feature 13: Duplicate Scan Warning
const [dupeScan, setDupeScan] = useState<{ ageDays: number; previousPrice: number; priceDelta: number | null; cheaper: boolean; message: string } | null>(null);

// Feature 14: Profit Per Hour
const [profitPerHour, setProfitPerHour] = useState<{ effectiveHourlyRate: number; totalProfit: number; totalTimeHours: number; verdict: string; belowMinWage: boolean } | null>(null);
const [profitOpen, setProfitOpen] = useState(false);
const profitOp = useRef(new RNAnimated.Value(0)).current;
const profitY = useRef(new RNAnimated.Value(60)).current;

// Feature 15: Category Saturation Index
const [saturation, setSaturation] = useState<{ saturationPct: number; level: string; trend: string; warning: string; hotAlternative: string | null; suggestion: string | null } | null>(null);

// Intel Signal Drawer
const [intelExpanded, setIntelExpanded] = useState(false);
const _intelExpandOp = useRef(new RNAnimated.Value(0)).current;
const _intelExpandH = useRef(new RNAnimated.Value(0)).current;

// Results "More details" — collapses all secondary panels under one toggle
const [moreDetailsOpen, setMoreDetailsOpen] = useState(false);

const [showSplash, setShowSplash] = useState(true);
// ✅ Keep splash visible minimum time
const _splashStartRef = useRef(Date.now());
const SPLASH_MIN_MS = 4500;
const [loadingDots, setLoadingDots] = useState(".");
const [splashLoadingDots, setSplashLoadingDots] = useState(".");
const splashOpacity = useRef(new RNAnimated.Value(1)).current; 
const logoScale = useRef(new RNAnimated.Value(0.9)).current;
const dotY = useRef(new RNAnimated.Value(0)).current;
const splashDots = useRef(new RNAnimated.Value(0)).current;
const [_splashDotCount, setSplashDotCount] = useState(1);
const [splashInfoOpen, setSplashInfoOpen] = useState(false);
const splashOrbScale   = useRef(new RNAnimated.Value(0.85)).current;
const splashOrbOpacity = useRef(new RNAnimated.Value(0)).current;
const splashTaglineY   = useRef(new RNAnimated.Value(14)).current;
const splashTaglineOp  = useRef(new RNAnimated.Value(0)).current;
const splashChipsY     = useRef(new RNAnimated.Value(20)).current;
const splashChipsOp    = useRef(new RNAnimated.Value(0)).current;
const splashProgressAnim = useRef(new RNAnimated.Value(0)).current;
const appStateRef = useRef(AppState.currentState);
    
  
// 🔥 APPLE MICRO-PHYSICS (PHASE 1)
const breathingGlow = useRef(new RNAnimated.Value(0)).current;
const neuralPulse = useRef(new RNAnimated.Value(0)).current;
const _glassShift = useRef(new RNAnimated.Value(0)).current;
const _cameraPointerEvents = tab === "camera" ? "auto" : "none";

  useEffect(() => {
  
RNAnimated.loop(
  RNAnimated.sequence([
    RNAnimated.timing(neuralAura, {
      toValue: 1,
      duration: 1800,
      useNativeDriver: true,
    }),
    RNAnimated.timing(neuralAura, {
      toValue: 0,
      duration: 1800,
      useNativeDriver: true,
    }),
  ])
).start();
 
RNAnimated.loop(
  RNAnimated.sequence([
    RNAnimated.timing(cameraGlassDepth, {
      toValue: 1,
      duration: 3200,
      useNativeDriver: true,
    }),
    RNAnimated.timing(cameraGlassDepth, {
      toValue: 0,
      duration: 3200,
      useNativeDriver: true,
    }),
  ])
).start();

  // 🔥 APPLE BREATHING SURFACE
  RNAnimated.loop(
    RNAnimated.sequence([
      RNAnimated.timing(breathingGlow, {
        toValue: 1,
        duration: 2600,
        useNativeDriver: true,
      }),
      RNAnimated.timing(breathingGlow, {
        toValue: 0,
        duration: 2600,
        useNativeDriver: true,
      }),
    ])
  ).start();

  // 🔥 NEURAL PULSE
  RNAnimated.loop(
    RNAnimated.sequence([
      RNAnimated.timing(neuralPulse, {
        toValue: 1,
        duration: 1800,
        useNativeDriver: true,
      }),
      RNAnimated.timing(neuralPulse, {
        toValue: 0,
        duration: 1800,
        useNativeDriver: true,
      }),
    ])
  ).start();


return () => {
  try {
    breathingGlow.stopAnimation();
    neuralPulse.stopAnimation();
    cameraGlassDepth.stopAnimation();
    neuralAura.stopAnimation();
  } catch {}
};
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);


// ===== TOP HUD ENTRANCE (no jump) =====
const topHudOpacity = useRef(new RNAnimated.Value(0)).current;
const topHudY = useRef(new RNAnimated.Value(10)).current;

useEffect(() => {
  // keep hidden during splash
  if (showSplash) {
    topHudOpacity.setValue(0);
    topHudY.setValue(10);
    return;
  }

  // 🔥 INSTANT PRESENCE (no delayed pop-in)
  topHudOpacity.setValue(1);
  topHudY.setValue(0);

  // subtle Apple micro-depth settle

RNAnimated.parallel([
  RNAnimated.timing(topHudOpacity, {
    toValue: 1,
    duration: 220,
    easing: Easing.out(Easing.cubic),
    useNativeDriver: true,
  }),
  RNAnimated.spring(topHudY, {
    toValue: 0,
    damping: 18,
    stiffness: 180,
    mass: 0.7,
    useNativeDriver: true,
  }),
]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [showSplash]);

// ===============================
// SUBSCRIPTION GUARD
// ===============================

const [isPro, setIsPro] = useState(false);
const [scansUsed, setScansUsed] = useState(0);
const [bonusScans, setBonusScans] = useState<number>(0);
const [guestId, setGuestId] = useState<string | null>(null);
const [scanResetAt, setScanResetAt] = useState<string | null>(null); // ISO string from server
// isOnline / pendingCount / offlineItems now come from useNetworkStatus + useOfflineQueue hooks
// (declared after resolvedApiBase below)

// Global FREE_SCAN_LIMIT — 3 free scans per day (server-side enforced)
// ✅ crash-proof: FREE_SCAN_LIMIT may be declared later in this file

const FREE_SCAN_LIMIT_SAFE = 3;

const freeScansRemaining = Math.max(0, FREE_SCAN_LIMIT_SAFE + (bonusScans || 0) - scansUsed);
const hasUnlimited = isPro === true;
const _canScan = hasUnlimited || freeScansRemaining > 0;

const _totalFreeScans = FREE_SCAN_LIMIT_SAFE + (bonusScans || 0);
const _demoLabel = isPro
  ? "Pro · Unlimited"
  : `${scansUsed} / ${FREE_SCAN_LIMIT_SAFE} free scans`;

const [previewImageUri, setPreviewImageUri] = useState(null);
const previewAnim = useRef(new RNAnimated.Value(0)).current;

// 🚀 SHIP MODE — results cinematic fade
const resultsFade = useRef(new RNAnimated.Value(0)).current;

useEffect(() => {
  if (tab === "results") {
    resultsFade.setValue(0);
    RNAnimated.timing(resultsFade, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }
}, [tab, resultsFade]);

const [zoomUri, setZoomUri] = useState(null);
const zoomAnim = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    if (zoomUri) {
      zoomAnim.setValue(0);
      RNAnimated.spring(zoomAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
        tension: 70,
      }).start();
    }
   // eslint-disable-next-line react-hooks/exhaustive-deps
}, [zoomUri]);
  // Splash screen
// ✅

// ── Flip Fatigue tracking ─────────────────────────────────────────────
const trackCategoryScan = useCallback(async (category: string) => {
  if (!category) return;
  try {
    const key = "EVAN_FATIGUE_SCANS_V1";
    const raw = await AsyncStorage.getItem(key);
    const data: { category: string; ts: number }[] = raw ? JSON.parse(raw) : [];
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const fresh = data.filter(d => d.ts > weekAgo);
    fresh.push({ category: category.toLowerCase(), ts: Date.now() });
    await AsyncStorage.setItem(key, JSON.stringify(fresh.slice(-200)));
    // Compute fatigue for this category
    const catScans = fresh.filter(d => d.category === category.toLowerCase());
    if (catScans.length >= 5) {
      setFlipFatigue({ category, count: catScans.length, weeklyBought: 0 });
    } else {
      setFlipFatigue(null);
    }
  } catch {}
}, []);

// ── Regret Tracker ────────────────────────────────────────────────────
const trackPassedItem = useCallback(async (result: any) => {
  if (!result?.itemName || !result?.price) return;
  try {
    const key = "EVAN_REGRET_V1";
    const raw = await AsyncStorage.getItem(key);
    const existing: any[] = raw ? JSON.parse(raw) : [];
    // Don't duplicate
    const alreadyTracked = existing.some(e => e.itemName === result.itemName && Math.abs(e.passedPrice - result.price) < 5);
    if (alreadyTracked) return;
    const newItem = {
      itemName: result.itemName,
      passedPrice: result.price,
      category: result.category || "",
      passedAt: Date.now(),
    };
    const updated = [...existing, newItem].slice(-50);
    await AsyncStorage.setItem(key, JSON.stringify(updated));
  } catch {}
}, []);

const showRegretAlert = useCallback((items: any[]) => {
  setRegretItems(items);
  setRegretAlertOpen(true);
  regretAlertOp.setValue(0);
  regretAlertY.setValue(80);
  RNAnimated.parallel([
    RNAnimated.timing(regretAlertOp, { toValue: 1, duration: 300, useNativeDriver: true }),
    RNAnimated.spring(regretAlertY, { toValue: 0, damping: 20, stiffness: 180, useNativeDriver: true }),
  ]).start();
}, [regretAlertOp, regretAlertY]);

// ── Thrift Heat Map ────────────────────────────────────────────────────
const openThriftHeat = useCallback(async () => {
  try {
    const raw = await apiFetch("/intel/thrift-heat", { method: "POST", body: JSON.stringify({}) });
    if ((raw as any)?.ok && (raw as any)?.stores) setThriftStores((raw as any).stores);
  } catch {}
  setThriftHeatOpen(true);
  thriftHeatOp.setValue(0);
  thriftHeatY.setValue(60);
  RNAnimated.parallel([
    RNAnimated.timing(thriftHeatOp, { toValue: 1, duration: 280, useNativeDriver: true }),
    RNAnimated.spring(thriftHeatY, { toValue: 0, damping: 22, stiffness: 200, useNativeDriver: true }),
  ]).start();
}, [thriftHeatOp, thriftHeatY]);

// Feature 6: open lowball sheet.
// Critical order: open the sheet FIRST (so the loading UI renders instantly),
// then fire the fetch in the background. The prior version awaited the API
// before opening the sheet, which meant the user tapped the chip and stared
// at nothing for 2-4 seconds before anything happened. Reset Messages calls
// this same function — by clearing scripts first the loading state re-shows
// while the new batch is fetched.
const openLowball = useCallback(async () => {
  if (!activeResult) return;
  // 1. Clear any prior scripts → loading UI shows
  setLowballScripts([]);
  // 2. Open the sheet immediately (fade-in, no slide)
  setLowballOpen(true);
  lowballOp.setValue(0);
  lowballY.setValue(0); // no slide — fade only, per stability pass
  RNAnimated.timing(lowballOp, {
    toValue: 1, duration: 220, useNativeDriver: true,
  }).start();
  // 3. Fetch in the background — UI already showing "Making scripts"
  try {
    const res = await apiFetch("/intel/lowball-script", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemName: activeResult.itemName,
        price: activeResult.price,
        platform: activeResult.store || "eBay",
        condition: activeResult.conditionLabel || activeResult.visionIdentity?.condition,
        daysListed: null,
        avgMarket: activeResult.avgMarket,
      }),
    }) as any;
    if (res?.scripts?.length) setLowballScripts(res.scripts);
  } catch {
    // Silent — empty scripts array keeps loading visible; caller can Reset.
  }
}, [activeResult, lowballOp, lowballY]);

const closeLowball = useCallback(() => {
  // Fade-only close (no translateY) so the background underneath doesn't
  // appear to "rub upward" on dismiss — the slide-up bleeding effect the
  // user flagged across drawers.
  RNAnimated.timing(lowballOp, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
    setLowballOpen(false);
    setLowballScripts([]);
  });
}, [lowballOp]);

// Feature 7: compute flip personality
const computeFlipPersonality = useCallback(async () => {
  try {
    const raw = await AsyncStorage.getItem("EVAN_FATIGUE_SCANS_V1");
    const scans: { category: string; ts: number }[] = raw ? JSON.parse(raw) : [];
    const total = scans.length;
    const bought = 0; // we track scans, not purchases — bought is always 0 for now
    const now = Date.now();
    const recentDays = scans.filter(s => now - s.ts < 30 * 86400000);
    const catCounts: Record<string, number> = {};
    recentDays.forEach(s => { catCounts[s.category] = (catCounts[s.category] || 0) + 1; });
    const topCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];

    let type = "Ghost Flipper";
    let description = "You scan everything, buy nothing. The market is your museum.";
    if (total > 50 && bought === 0) {
      type = "Ghost Flipper";
      description = "You scan everything, buy nothing. The market is your museum.";
    } else if (topCat && topCat[1] > total * 0.6) {
      type = "Category Specialist";
      description = `You live and breathe ${topCat[0]}. Deep focus, high conviction.`;
    } else if (total > 100) {
      type = "Volume Trader";
      description = "High volume, wide net. You win on quantity.";
    } else {
      type = "Patience Flipper";
      description = "You hold too long waiting for the perfect deal. Trust your first instinct.";
    }
    setFlipPersonality({ type, description, avgHoldDays: 0, totalScans: total, totalBought: bought });
  } catch {}
}, []);

// Feature 8: check condition drift on watchlist
const _checkConditionDrift = useCallback((itemName: string, storedCondition: string, currentCondition: string) => {
  if (!storedCondition || !currentCondition) return;
  const downgrade = ["like new", "excellent", "very good", "good", "fair", "poor", "for parts"];
  const storedIdx = downgrade.findIndex(c => storedCondition.toLowerCase().includes(c));
  const currentIdx = downgrade.findIndex(c => currentCondition.toLowerCase().includes(c));
  if (storedIdx >= 0 && currentIdx > storedIdx) {
    setConditionDrift({ itemName, oldCondition: storedCondition, newCondition: currentCondition });
  }
}, []);

// Feature 9: run ghost check after scan
const runGhostCheck = useCallback(async (result: any) => {
  try {
    const res = await apiFetch("/intel/ghost-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sellerFeedback: result?.sellerFeedback ?? null,
        price: result?.price,
        avgMarket: result?.avgMarket,
        store: result?.store,
        itemName: result?.itemName,
      }),
    }) as any;
    if (res?.level === "high" || res?.level === "medium") {
      setGhostRisk(res);
    } else {
      setGhostRisk(null);
    }
  } catch {}
}, []);

// Feature 10: open "Got Away" sheet
const openGotAway = useCallback(() => {
  setGotAwayOpen(true);
  gotAwayOp.setValue(0);
  gotAwayY.setValue(60);
  RNAnimated.parallel([
    RNAnimated.timing(gotAwayOp, { toValue: 1, duration: 280, useNativeDriver: true }),
    RNAnimated.spring(gotAwayY, { toValue: 0, damping: 22, stiffness: 200, useNativeDriver: true }),
  ]).start();
}, [gotAwayOp, gotAwayY]);

const closeGotAway = useCallback(() => {
  RNAnimated.timing(gotAwayOp, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setGotAwayOpen(false));
}, [gotAwayOp]);

// Feature 11: open scan graveyard
const openGraveyard = useCallback(async () => {
  try {
    const raw = await AsyncStorage.getItem("EVAN_REGRET_V1");
    const passed: { itemName: string; passedPrice: number; category: string; passedAt: number }[] = raw ? JSON.parse(raw) : [];
    if (passed.length > 0) {
      const res = await apiFetch("/intel/scan-graveyard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: passed.map(p => ({
            itemName: p.itemName,
            originalPrice: p.passedPrice,
            category: p.category,
            scannedAt: p.passedAt,
          })),
        }),
      }) as any;
      if (res?.items?.length) setGraveyardItems(res.items);
    }
  } catch {}
  setGraveyardOpen(true);
  graveyardOp.setValue(0);
  graveyardY.setValue(60);
  RNAnimated.parallel([
    RNAnimated.timing(graveyardOp, { toValue: 1, duration: 280, useNativeDriver: true }),
    RNAnimated.spring(graveyardY, { toValue: 0, damping: 22, stiffness: 200, useNativeDriver: true }),
  ]).start();
}, [graveyardOp, graveyardY]);

const closeGraveyard = useCallback(() => {
  RNAnimated.timing(graveyardOp, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setGraveyardOpen(false));
}, [graveyardOp]);

// Feature 12: auction snipe
const openSnipe = useCallback(async (auctionEndTime: number) => {
  try {
    const res = await apiFetch("/intel/snipe-timer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auctionEndTime,
        currentBid: activeResult?.price,
        avgMarket: activeResult?.avgMarket,
        itemName: activeResult?.itemName,
      }),
    }) as any;
    if (res && !res.expired) setSnipeData(res);
  } catch {}
  setSnipeOpen(true);
  snipeOp.setValue(0);
  snipeY.setValue(60);
  RNAnimated.parallel([
    RNAnimated.timing(snipeOp, { toValue: 1, duration: 280, useNativeDriver: true }),
    RNAnimated.spring(snipeY, { toValue: 0, damping: 22, stiffness: 200, useNativeDriver: true }),
  ]).start();
}, [activeResult, snipeOp, snipeY]);

const closeSnipe = useCallback(() => {
  RNAnimated.timing(snipeOp, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
    setSnipeOpen(false);
    setSnipeData(null);
  });
}, [snipeOp]);

// Feature 13: duplicate scan check — call after every scan
const checkDuplicateScan = useCallback(async (itemName: string, price: number) => {
  try {
    const raw = await AsyncStorage.getItem("EVAN_SCAN_HISTORY_V1");
    const history: { itemName: string; price: number; scannedAt: number; category: string }[] = raw ? JSON.parse(raw) : [];
    const res = await apiFetch("/intel/duplicate-scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemName, price, scanHistory: history.slice(-100) }),
    }) as any;
    if (res?.duplicate) setDupeScan(res);
    else setDupeScan(null);
    // Save this scan to history
    const updated = [...history, { itemName, price, scannedAt: Date.now(), category: "" }].slice(-200);
    await AsyncStorage.setItem("EVAN_SCAN_HISTORY_V1", JSON.stringify(updated));
  } catch {}
}, []);

// Feature 14: compute profit per hour
const computeProfitPerHour = useCallback(async () => {
  try {
    const raw = await AsyncStorage.getItem("EVAN_FLIP_SESSIONS_V1");
    const sessions: { buyPrice: number; sellPrice: number; scanMins: number; listMins: number; shipMins: number }[] = raw ? JSON.parse(raw) : [];
    if (sessions.length === 0) {
      setProfitPerHour({
        effectiveHourlyRate: 0,
        totalProfit: 0,
        totalTimeHours: 0,
        verdict: "No flip sessions logged yet. Start tracking your flips.",
        belowMinWage: false,
      });
    } else {
      const totalProfit = sessions.reduce((s, f) => s + (f.sellPrice - f.buyPrice), 0);
      const totalMins = sessions.reduce((s, f) => s + (f.scanMins || 15) + (f.listMins || 20) + (f.shipMins || 30), 0);
      const totalTimeHours = totalMins / 60;
      const effectiveHourlyRate = totalTimeHours > 0 ? Math.round((totalProfit / totalTimeHours) * 100) / 100 : 0;
      const belowMinWage = effectiveHourlyRate < 15 && effectiveHourlyRate > 0;
      const verdict = effectiveHourlyRate <= 0
        ? "You're losing money. Stop flipping these items."
        : belowMinWage
        ? `$${effectiveHourlyRate}/hr — below minimum wage. You're working for nothing.`
        : `$${effectiveHourlyRate}/hr effective rate. Keep it up.`;
      setProfitPerHour({ effectiveHourlyRate, totalProfit: Math.round(totalProfit), totalTimeHours: Math.round(totalTimeHours * 10) / 10, verdict, belowMinWage });
    }
  } catch {}
  setProfitOpen(true);
  profitOp.setValue(0);
  profitY.setValue(60);
  RNAnimated.parallel([
    RNAnimated.timing(profitOp, { toValue: 1, duration: 280, useNativeDriver: true }),
    RNAnimated.spring(profitY, { toValue: 0, damping: 22, stiffness: 200, useNativeDriver: true }),
  ]).start();
}, [profitOp, profitY]);

const closeProfitSheet = useCallback(() => {
  RNAnimated.timing(profitOp, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setProfitOpen(false));
}, [profitOp]);

// Feature 15: category saturation — call after every scan
const checkCategorySaturation = useCallback(async (category: string) => {
  if (!category) return;
  try {
    const res = await apiFetch("/intel/category-saturation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    }) as any;
    if (res?.level === "high" || res?.level === "medium") setSaturation(res);
    else setSaturation(null);
  } catch {}
}, []);

// eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => { computeFlipPersonality(); }, []);

const skipOnboard = async () => {
  try { await AsyncStorage.setItem("EVAN_ONBOARD_V1", "1"); } catch {}
  try { onboardGlowLoopRef.current?.stop?.(); } catch {}
  RNAnimated.timing(onboardOpacity, {
    toValue: 0, duration: 220, easing: Easing.inOut(Easing.cubic), useNativeDriver: true,
  }).start(() => { setShowOnboard(false); setTutorialStep(0); });
};

// Survey complete — persist answers, optionally launch tutorial.
// State-locked: cannot fire twice even if onComplete callback triggers rapidly.
// Temporary debug helper — wipes local Evan state AND the server-side
// scan quota for this actor so the survey + interactive tutorial
// re-trigger on next mount and the user starts at 0/3 free scans
// again. Uses DevSettings.reload() to force a clean re-mount when
// available; otherwise falls back to flipping the gating state.
const factoryReset = useCallback(async () => {
  const EVAN_KEYS = [
    "EVAN_AUTO_WATCH_V1",  "EVAN_DAILY_GOAL_V1",    "EVAN_FATIGUE_SCANS_V1",
    "EVAN_FLIP_SESSIONS_V1","EVAN_GUEST_ID_V1",     "EVAN_INSTALL_ID_V1",
    "EVAN_INVENTORY_V1",   "EVAN_LAST_PROFILE_OPEN","EVAN_LAST_RESULT_V1",
    "EVAN_ONBOARD_V1",     "EVAN_PL_FLIPS_V1",      "EVAN_REF_STATE_V1",
    "EVAN_REGRET_V1",      "EVAN_SCAN_HISTORY_V1",  "EVAN_SURVEY_V1",
    "EVAN_VAULT_V1",
  ];

  // Reset server-side scan quota for the CURRENT identity first
  // (before wiping EVAN_GUEST_ID_V1 — once the guestId is gone the
  // server can't match the row, and the user looks reset on the
  // client but stays at 3/3 on the next real scan).
  try {
    const apiBase = process.env.EXPO_PUBLIC_API_URL ??
      (Platform.OS === "ios" ? "http://192.168.1.227:3001" : "http://10.0.2.2:3001");
    // Read installId directly from storage — the React state variable
    // isn't declared until later in the component and TS flags the
    // closure reference. The disk value is the source of truth anyway.
    const iid = await AsyncStorage.getItem("EVAN_INSTALL_ID_V1").catch(() => null);
    const body: Record<string, string> = {};
    if (userId)  body.userId      = userId;
    if (guestId) body.guestId     = guestId;
    if (iid)     body.installId   = iid;
    if (iid)     body.fingerprint = iid;
    // Mirror identity in headers so getDeviceId() resolves server-side
    // — middleware uses headers, not body, for quota identity.
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (iid)    headers["x-install-id"] = iid;
    if (iid)    headers["x-device-id"]  = iid;
    if (userId) headers["x-user-id"]    = userId;
    await fetch(`${apiBase}/api/debug/reset-quota`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(4000),
    }).catch(() => null);
  } catch {}

  try {
    await Promise.all(EVAN_KEYS.map((k) => AsyncStorage.removeItem(k).catch(() => {})));
  } catch {}

  // Reload the JS bundle so every useEffect re-runs from scratch and
  // the onboarding gate sees no AsyncStorage values.
  try {
    const RN = require("react-native");
    const DevSettings = RN?.DevSettings;
    if (DevSettings && typeof DevSettings.reload === "function") {
      DevSettings.reload();
      return;
    }
  } catch {}

  // Fallback path (reload unavailable): flip the state in-place.
  try { setScansUsed(0); } catch {}
  try { setBonusScans(0); } catch {}
  try { setShowSurvey(true); } catch {}
  try { setShowOnboard(false); } catch {}
  try { setShowITutorial(false); } catch {}
  try { setTutorialStep(0); } catch {}
  try { surveyCompleteLockRef.current = false; } catch {}
  try { tutorialOpenLockRef.current = false; } catch {}
}, [userId, guestId]); // eslint-disable-line react-hooks/exhaustive-deps

const surveyCompleteLockRef = useRef(false);
const handleSurveyComplete = useCallback(async (ans: SurveyAnswers, goTutorial: boolean) => {
  if (surveyCompleteLockRef.current) return;
  surveyCompleteLockRef.current = true;
  console.log("INTRO_EXPLORE_TAP", { goTutorial });
  try { await AsyncStorage.setItem("EVAN_SURVEY_V1", JSON.stringify(ans)); } catch {}
  setShowSurvey(false);
  if (goTutorial) {
    // Wait the FULL OnboardingFlow fade-out (520ms in OnboardingFlow.handleComplete)
    // before mounting the tutorial. The prior 380 ms gap let the tutorial card
    // mount + slide-up while the OnboardingFlow was still finishing its
    // fade — three opacity animations stacked produced the visible
    // double-flicker. 540 ms gives 20ms of headroom over the 520ms exit so
    // we're past the last frame, and React commits the unmount before the
    // tutorial enters.
    console.log("INTRO_TRANSITION_START");
    setTimeout(() => {
      openTutorial();
      console.log("INTRO_TRANSITION_DONE");
    }, 540);
  }
}, []); // eslint-disable-line react-hooks/exhaustive-deps

const animTutorialContentIn = () => {
  // Fade-only to prevent overlay bleed/pixelation. The prior version animated
  // translateY 22→0 + iconScale 0.68→1 in parallel with the opacity fade —
  // which combined with the survey's own fade-out produced the double-flicker
  // on Explore Evan AI taps. Keep static positions; rely on the opacity.
  tutorialContentY.setValue(0);
  tutorialIconScale.setValue(1);
  tutorialContentOp.setValue(0);
  RNAnimated.timing(tutorialContentOp, {
    toValue: 1, duration: 260, useNativeDriver: true,
  }).start();
};

const advanceTutorialStep = () => {
  try { Haptics.selectionAsync(); } catch {}
  // Fade-only step transitions — no translateY nudge. The prior -10 nudge
  // visibly jumped the layout for one frame between steps.
  RNAnimated.timing(tutorialContentOp, {
    toValue: 0, duration: 120, useNativeDriver: true,
  }).start(() => {
    setTutorialStep(s => s + 1);
    animTutorialContentIn();
  });
};

// State-locked: prevents the tutorial from being triggered twice (double-flicker fix)
const tutorialOpenLockRef = useRef(false);
const openTutorial = () => {
  if (tutorialOpenLockRef.current) return;
  tutorialOpenLockRef.current = true;
  tutorialOpacity.setValue(0);
  openInteractiveTutorial();
  RNAnimated.timing(tutorialOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
};

// ── Tutorial confirm modal animation ────────────────────────────────────────
useEffect(() => {
  if (tutorialConfirmOpen) {
    tutorialConfirmOp.setValue(0);
    tutorialConfirmY.setValue(28);
    RNAnimated.parallel([
      RNAnimated.timing(tutorialConfirmOp, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      RNAnimated.spring(tutorialConfirmY, { toValue: 0, damping: 22, stiffness: 220, useNativeDriver: true }),
    ]).start();
  } else {
    RNAnimated.parallel([
      RNAnimated.timing(tutorialConfirmOp, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      RNAnimated.timing(tutorialConfirmY, { toValue: 16, duration: 180, useNativeDriver: true }),
    ]).start();
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [tutorialConfirmOpen]);

// ── Interactive tutorial functions ──────────────────────────────────────
const showAchievement = useCallback((toast: { icon: string; title: string; body: string; color: string }) => {
  setAchieveToast(toast);
  achieveOp.setValue(0);
  achieveY.setValue(-80);
  RNAnimated.parallel([
    RNAnimated.spring(achieveY, { toValue: 0, damping: 22, stiffness: 200, useNativeDriver: true }),
    RNAnimated.timing(achieveOp, { toValue: 1, duration: 220, useNativeDriver: true }),
  ]).start(() => {
    setTimeout(() => {
      RNAnimated.parallel([
        RNAnimated.timing(achieveOp, { toValue: 0, duration: 280, useNativeDriver: true }),
        RNAnimated.timing(achieveY, { toValue: -80, duration: 280, useNativeDriver: true }),
      ]).start(() => setAchieveToast(null));
    }, 2600);
  });
}, [achieveOp, achieveY]);

const closeInteractiveTutorial = useCallback(() => {
  try { iTutRingPulseRef.current?.stop?.(); } catch {}
  try { iTutRippleRef.current?.stop?.(); } catch {}
  RNAnimated.parallel([
    RNAnimated.timing(iTutBgOp, { toValue: 0, duration: 280, useNativeDriver: true }),
    RNAnimated.timing(iTutCardOp, { toValue: 0, duration: 200, useNativeDriver: true }),
    RNAnimated.timing(iTutSpotOp, { toValue: 0, duration: 200, useNativeDriver: true }),
    RNAnimated.timing(iTutRingOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
  ]).start(() => {
    setShowITutorial(false);
    setITutStep(0);
    // Release all tutorial locks so it can be re-opened if needed
    iTutOpenLockRef.current = false;
    tutorialOpenLockRef.current = false;
    surveyCompleteLockRef.current = false;
  });
}, [iTutBgOp, iTutCardOp, iTutSpotOp, iTutRingOpacity]);

const animITutCardIn = useCallback(() => {
  // Fade-only to prevent overlay bleed/pixelation. Removed the translateY
  // 26→0 spring — combined with the bg-opacity ramp it produced a visible
  // staircase effect on the tutorial card's entry.
  iTutCardY.setValue(0);
  iTutCardOp.setValue(0);
  RNAnimated.timing(iTutCardOp, {
    toValue: 1, duration: 260, useNativeDriver: true,
  }).start();
}, [iTutCardY, iTutCardOp]);

const startITutRingPulse = useCallback(() => {
  try { iTutRingPulseRef.current?.stop?.(); } catch {}
  iTutRingOpacity.setValue(0);
  iTutRingScale.setValue(1.0);
  const pulse = RNAnimated.loop(
    RNAnimated.sequence([
      RNAnimated.parallel([
        RNAnimated.timing(iTutRingOpacity, { toValue: 1.0, duration: 350, useNativeDriver: true }),
        RNAnimated.timing(iTutRingScale, { toValue: 1.0, duration: 350, useNativeDriver: true }),
      ]),
      RNAnimated.parallel([
        RNAnimated.timing(iTutRingOpacity, { toValue: 0.5, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        RNAnimated.timing(iTutRingScale, { toValue: 1.06, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
      RNAnimated.parallel([
        RNAnimated.timing(iTutRingOpacity, { toValue: 1.0, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        RNAnimated.timing(iTutRingScale, { toValue: 1.0, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    ])
  );
  iTutRingPulseRef.current = pulse;
  pulse.start();
}, [iTutRingOpacity, iTutRingScale]);

const stopITutRipple = useCallback(() => {
  try { iTutRippleRef.current?.stop?.(); } catch {}
  iTutRipple0.setValue(0);
  iTutRipple1.setValue(0);
  iTutRipple2.setValue(0);
}, [iTutRipple0, iTutRipple1, iTutRipple2]);

const startITutRipple = useCallback(() => {
  stopITutRipple();
  // Each ripple animates from 0→1, staggered by 700ms; loop indefinitely
  const makeRippleLoop = (val: ReturnType<typeof useRef<any>>["current"], delay: number) => {
    val.setValue(0);
    const loop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.delay(delay),
        RNAnimated.timing(val, {
          toValue: 1,
          duration: 1600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ])
    );
    return loop;
  };
  const r0 = makeRippleLoop(iTutRipple0, 0);
  const r1 = makeRippleLoop(iTutRipple1, 550);
  const r2 = makeRippleLoop(iTutRipple2, 1100);
  r0.start();
  r1.start();
  r2.start();
  // Store refs so we can stop all three
  iTutRippleRef.current = { stop: () => { r0.stop(); r1.stop(); r2.stop(); } };
}, [iTutRipple0, iTutRipple1, iTutRipple2, stopITutRipple]);

const goToITutStep = useCallback((nextStep: number) => {
  try { Haptics.selectionAsync(); } catch {}
  try { iTutRippleRef.current?.stop?.(); } catch {}
  RNAnimated.parallel([
    RNAnimated.timing(iTutCardOp, { toValue: 0, duration: 150, useNativeDriver: true }),
    RNAnimated.timing(iTutCardY, { toValue: -12, duration: 150, useNativeDriver: true }),
    RNAnimated.timing(iTutSpotOp, { toValue: 0, duration: 220, useNativeDriver: true }),
    RNAnimated.timing(iTutRingOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
  ]).start(() => {
    setITutStep(nextStep);
  });
}, [iTutCardOp, iTutCardY, iTutSpotOp, iTutRingOpacity]);

const iTutOpenLockRef = useRef(false);
const openInteractiveTutorial = useCallback(() => {
  // State lock: if tutorial is already opening or open, ignore the call
  if (iTutOpenLockRef.current) return;
  iTutOpenLockRef.current = true;
  setITutStep(0);
  setShowITutorial(true);
  iTutBgOp.setValue(0);
  iTutCardOp.setValue(0);
  iTutSpotOp.setValue(0);
  iTutRingOpacity.setValue(0);
  iTutRingScale.setValue(1.0);
  RNAnimated.timing(iTutBgOp, {
    toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true,
  }).start(() => animITutCardIn());
}, [iTutBgOp, iTutCardOp, iTutSpotOp, iTutRingOpacity, iTutRingScale, animITutCardIn]);

useEffect(() => {
  if (showSplash) return;
  let alive = true;
  (async () => {
    try {
      // Survey check — show pre-tutorial onboarding if not yet completed
      const surveySeen = await AsyncStorage.getItem("EVAN_SURVEY_V1");
      if (!alive) return;
      if (!surveySeen) {
        setShowSurvey(true);
        return;
      }
      // Tutorial check — show interactive tutorial if not yet seen
      const seen = await AsyncStorage.getItem("EVAN_ONBOARD_V1");
      if (!alive || seen) return;
      openTutorial();
    } catch {}
  })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return () => { alive = false; try { onboardGlowLoopRef.current?.stop?.(); } catch {} };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [showSplash]);

// ── Step transition effect: navigate tab + show spotlight ──────────────
useEffect(() => {
  if (!showITutorial) return;
  const step = I_STEPS[Math.min(iTutStep, I_STEPS.length - 1)];
  if (!step) return;
  if (step.tab) {
    // Fade the tab content, switch, fade back in — without the full goTab mask logic
    RNAnimated.timing(tabFade, { toValue: 0, duration: 150, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      setTab(step.tab as any);
      RNAnimated.timing(tabFade, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    });
  }
  const delay = step.tab ? 400 : 80;
  const timer = setTimeout(() => {
    if (step.spotlight) {
      RNAnimated.timing(iTutSpotOp, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      startITutRingPulse();
      startITutRipple();
    } else {
      stopITutRipple();
    }
    animITutCardIn();
  }, delay);
  return () => clearTimeout(timer);
}, [iTutStep, showITutorial]); // eslint-disable-line react-hooks/exhaustive-deps

const [watchlist, setWatchlist] = useState<any[]>([]);
const [focusedWatchlistId, setFocusedWatchlistId] = useState<string | null>(null);
// 🔥 STABILITY — declare refs BEFORE any effects use them
const watchlistRef = useRef<any[]>([]);

// ── Autonomous Deal Hunter ────────────────────────────────────────────────────
const [dealHunterActive, setDealHunterActive] = useState(false);
const [dealAlerts, setDealAlerts] = useState<DealAlert[]>([]);
const _dealHunterRef = useRef<AutonomousDealHunter | null>(null);

// Initialize hunter instance (once — never recreated)
useEffect(() => {
  _dealHunterRef.current = new AutonomousDealHunter({
    apiBase: SAFE_API_BASE, // updated via setApiBase() when resolvedApiBase changes
    intervalMs: 15 * 60 * 1000, // 15-minute sweeps
    minDealScore: 0.65,
    onAlert: (alert) => {
      setDealAlerts((prev) => [alert, ...prev].slice(0, 50));
      // Surface as a local notification so the app can be in background
      Notifications.scheduleNotificationAsync({
        content: {
          title: `FLIP ALERT: ${alert.query}`,
          body: `${alert.verdict} — $${alert.bestPrice.toFixed(2)} — tap to view`,
          data: { screen: "results", dealAlert: alert },
          sound: true,
        },
        trigger: null, // fire immediately
      }).catch(() => {});
      hapticTick();
    },
    onError: (err) => {
      devWarn("DealHunter error:", err.message);
    },
    onSweepStart: (queries) => {
      devLog(`DealHunter sweep: ${queries.length} targets`);
    },
  });

  return () => {
    _dealHunterRef.current?.stop();
    _dealHunterRef.current = null;
  };
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

// NOTE: dealHunter effects that depend on resolvedApiBase are hoisted below
// its useState declaration (search "── DealHunter runtime effects ──").
// ===============================
// WATCHLIST BACKGROUND RECHECK (stable + ref-safe)
// ===============================
const watchlistIntervalRef = useRef<any>(null);
const userIdRef = useRef<string | null>(null);

useEffect(() => {
  userIdRef.current = userId;
}, [userId]);

useEffect(() => {
  watchlistRef.current = watchlist || [];
}, [watchlist]);

useEffect(() => {
  // Background /watch/recheck interval permanently disabled. It used to
  // fan-fetch every watched item every 6 hours per user, but it also fired
  // on mount whenever a userId + watchlist existed — meaning every cold
  // app launch by a returning user paid for one round of SerpAPI lanes.
  // The only path that may hit /watch/poll is the manual per-item "Find
  // current price" button (runManualWatchPriceRefresh).
  if (watchlistIntervalRef.current) {
    clearInterval(watchlistIntervalRef.current);
    watchlistIntervalRef.current = null;
  }
  console.log("WATCHLIST_AUTO_SEARCH_BLOCKED", { fn: "watch_recheck_interval_disabled" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [userId, watchlist]);

// ===============================
// ANDROID BACK BUTTON HANDLER (stable + ref-safe)
// ===============================
const tabRef = useRef<any>("camera");
const zoomUriRef = useRef<string | null>(null);
const previewImageUriRef = useRef<string | null>(null);
const unverifiedPromptRef = useRef<any>(null);

useEffect(() => {
  tabRef.current = tab;
}, [tab]);

useEffect(() => {
  zoomUriRef.current = zoomUri;
}, [zoomUri]);

useEffect(() => {
  previewImageUriRef.current = previewImageUri;
}, [previewImageUri]);

useEffect(() => {
  unverifiedPromptRef.current = unverifiedPrompt;
}, [unverifiedPrompt]);

useEffect(() => {
  if (Platform.OS !== "android") return;

  const sub = BackHandler.addEventListener("hardwareBackPress", () => {
    // Close overlays first (top priority)
    if (zoomUriRef.current) {
      setZoomUri(null);
      return true;
    }

    if (previewImageUriRef.current) {
      closeHistoryPreview();
      return true;
    }

    if (unverifiedPromptRef.current) {
      setUnverifiedPrompt(null);
      return true;
    }

if (profileModalRef.current) {
  setProfileModal(null);
  return true;
}

    if (seeMoreOpenRef.current) {
      setSeeMoreOpen(false);
      return true;
    }

    if (haggleOpenRef.current) {
      setHaggleOpen(false);
      return true;
    }

    if (showPaywallRef.current) {
      useEvanBrain.getState().hidePaywall();
      return true;
    }

    if (freePassInfoOpenRef.current) {
      setFreePassInfoOpen(false);
      return true;
    }

    if (splashInfoOpenRef.current) {
      setSplashInfoOpen(false);
      return true;
    }

    if (resultModalOpenRef.current) {
      setResultModalOpen(false);
      return true;
    }

    // If not on camera, go back to camera
    if (tabRef.current !== "camera") {
      goTab("camera");
      return true;
    }

    return false; // allow OS to exit app
  });

  return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

  // ✅ FIX #2 (FLASHING CAMERA):
  // splashDots loop was running forever + listener was updating state constantly,
  // causing nonstop re-renders which can make CameraView look like it’s “flashing”.
  const splashDotsListenerIdRef = useRef(null);
// ===============================
// SIMPLE CLOUD USER ID
// ===============================
// ===============================
// SCAN SESSION GUARD (ANTI-RACE)
// ===============================
const scanSessionIdRef = useRef(0);
const scanSessionRef = useRef<any>(null);

const nextScanSession = () => {
  scanSessionIdRef.current += 1;
  return scanSessionIdRef.current;
};

const isCurrentSession = (id: number) => id === scanSessionIdRef.current;

  // Camera permission
  const [permission, requestPermission] = useCameraPermissions();
  // Camera state
  const [photo, setPhoto] = useState(null);
  // ✅ DERIVED UI FLAGS (must be after `photo`)

const inPreview = !!photo;

// ✅ Keep tabs visible on Results/Profile/Watchlist.
// Only hide when the camera preview/zoom overlays are up.
const _hideTabBar =
  zoomUri != null ||
  previewImageUri != null ||
  inPreview;

  const [_refinePhotos, setRefinePhotos] = useState([]); // { uri }
  const [cameraReady, setCameraReady] = useState(false);
const cameraReadyOp = useRef(new RNAnimated.Value(0)).current;

useEffect(() => {
  if (!loadingResults) return;
  let i = 0;
  const interval = setInterval(() => {
    i = (i + 1) % 3;            // 0..2
    setLoadingDots(".".repeat(i + 1)); // 1..3 dots
  }, 420);
  return () => clearInterval(interval);
}, [loadingResults]);
  
// ✅ LOADING EXPERIENCE (LEVEL 1): breathing mark + pulse + tiny haptic on finish
const loadingBreath = useRef(new RNAnimated.Value(0)).current;
const loadingPulse = useRef(new RNAnimated.Value(0)).current;
const logoFade = useRef(new RNAnimated.Value(1)).current;
const prevLoadingRef = useRef(false);

useEffect(() => {
  const prev = prevLoadingRef.current;
  prevLoadingRef.current = loadingResults;

  // tiny “finish” haptic (only when we actually have a result)
  if (prev && !loadingResults && !!activeResult) {
    setTimeout(() => {
      hapticTick();
    }, 60);
  }
}, [loadingResults, activeResult]);

useEffect(() => {
  if (!loadingResults) return;

  loadingBreath.setValue(0);
  loadingPulse.setValue(0);

  const breathLoop = RNAnimated.loop(
    RNAnimated.sequence([
      RNAnimated.timing(loadingBreath, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
      RNAnimated.timing(loadingBreath, {
        toValue: 0,
        duration: 1400,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    ])
  );

  const pulseLoop = RNAnimated.loop(
    RNAnimated.sequence([
      RNAnimated.timing(loadingPulse, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      RNAnimated.timing(loadingPulse, {
        toValue: 0,
        duration: 900,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ])
  );

  breathLoop.start();
  pulseLoop.start();

  return () => {
    try { breathLoop.stop(); } catch {}
    try { pulseLoop.stop(); } catch {}
  };
}, [loadingResults, loadingBreath, loadingPulse]);

  const [loadingTick, setLoadingTick] = useState(0);
  // ✅ NEW: animated retry reveal (fade + slight scale)
  const retryReveal = useRef(new RNAnimated.Value(0)).current;
  const retryScale = useRef(new RNAnimated.Value(0.96)).current;
  // ✅ Animate card entry (main + top3)
  const resultEntry = useRef(new RNAnimated.Value(0)).current;
  const resultDepth = useRef(new RNAnimated.Value(0)).current;
  
useEffect(() => {
  if (loadingResults) {
    resultEntry.setValue(0);
    resultDepth.setValue(12);
    return;
  }

  if (!activeResult) return;

  resultEntry.setValue(0);
  resultDepth.setValue(12);

  RNAnimated.parallel([
    RNAnimated.timing(resultEntry, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }),
    RNAnimated.spring(resultDepth, {
      toValue: 0,
      damping: 18,
      stiffness: 170,
      mass: 0.8,
      useNativeDriver: true,
    }),
  ]).start();
}, [loadingResults, activeResult, resultEntry, resultDepth]);

  // ✅ AI STAGED REVEAL (investor wow)
  const [aiRevealActive, setAiRevealActive] = useState(false);
  const [_aiRevealStep, setAiRevealStep] = useState(0);
  const aiRevealOpacity = useRef(new RNAnimated.Value(0)).current;
  const aiRevealScale = useRef(new RNAnimated.Value(0.98)).current;
  // ✅ Confidence badge animation
  const _confPop = useRef(new RNAnimated.Value(0)).current;  // scale
  // ⚡ FINAL ADD #2 — confidence aura
  const confidenceAura = useRef(new RNAnimated.Value(0)).current;
  const _confGlow = useRef(new RNAnimated.Value(0)).current; // subtle pulse
  // ✅ See more modal
  const [seeMoreOpen, setSeeMoreOpen] = useState(false);
  const [seeMoreListings, setSeeMoreListings] = useState([]);
  // ✅ Niche feature: Haggle Mode
  const [haggleOpen, setHaggleOpen] = useState(false);
  const [haggleLines, _setHaggleLines] = useState([]);
  // ✅ Monthly free pass pill explainer (tappable pill -> mini GUI)
  const [freePassInfoOpen, setFreePassInfoOpen] = useState(false);

  // ── Negotiation co-pilot ───────────────────────────────────────────────
  const [negotiationOpen, setNegotiationOpen] = useState(false);

  // ── Share card ────────────────────────────────────────────────────────
  const [shareCardOpen, setShareCardOpen] = useState(false);

  // ── Flip profile ─────────────────────────────────────────────────────
  const [flipProfile, setFlipProfile] = useState<FlipProfile | null>(null);
  const [flipProfileLoading, setFlipProfileLoading] = useState(false);
  
async function prepareImage(uri) {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 512 } }],
    {
      compress: 0.4,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );
  return result.uri;
}
  // Scan session (for retry / cancel without recount)
  // { photoUri, scannedPrice, counted, startedAt }
const scanLockRef = useRef(false);
const scanTokenRef = useRef(0);
const scanAbortRef = useRef(null);
// Last confirmed vision query — used to fire speculative market searches
// on subsequent scans even without an itemHint
const _lastVisionQueryRef = useRef<string | null>(null);
  // ✅ Free cycle start (30 days reset)
  const [cycleStartMs, setCycleStartMs] = useState(Date.now());
// ✅ resolved backend base (learned from vision success)
const [resolvedApiBase, setResolvedApiBase] = useState(API_BASE);

// ── DealHunter runtime effects (after resolvedApiBase declaration) ────────────
useEffect(() => {
  _dealHunterRef.current?.setApiBase(resolvedApiBase || SAFE_API_BASE);
}, [resolvedApiBase]);

// ── EventTracker init / userId sync ──────────────────────────────────────────
useEffect(() => {
  EventTracker.init(resolvedApiBase || SAFE_API_BASE, userId ?? null);
}, [resolvedApiBase, userId]);

// ── FinanceAnalytics init — load persisted events + start session ─────────────
useEffect(() => {
  FinanceAnalytics.load().catch(() => {});
  // ── SITT init — load truth buffer + dynamic thresholds ──────────────────
  MarketTruthService.load().then(() => TuningService.load()).then(() => {
    // Mirror SITT thresholds into the brain store for UI visibility
    useEvanBrain.getState().setTuningThresholds(TuningService.getThresholds());
  }).catch(() => {});
}, []);
useEffect(() => {
  if (!userId) return;
  const tier = isPro ? "plus" : "free";
  FinanceAnalytics.startSession(userId, tier);
  return () => { FinanceAnalytics.endSession(); };
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [userId]); // start once per userId, not on every isPro change

useEffect(() => {
  const hunter = _dealHunterRef.current;
  if (!hunter) return;
  const watchlistQueries = (watchlist || [])
    .map((w: any) => w?.query || w?.itemName || w?.title || "")
    .filter((q: string) => q.trim().length >= 3);
  hunter.setQueries(watchlistQueries);
  if (dealHunterActive && watchlistQueries.length > 0) {
    hunter.start();
  } else {
    hunter.stop();
  }
}, [dealHunterActive, watchlist, resolvedApiBase]);

// ─── Offline system ───────────────────────────────────────────────────────────
// runScan is defined further below. We use a stable wrapper so useOfflineQueue
// always holds a valid function reference regardless of declaration order.
const _queueRunScanRef = useRef<RunScanFn | null>(null);
const _stableRunScanForQueue = useCallback<RunScanFn>((params) => {
  if (!_queueRunScanRef.current) return Promise.resolve();
  return _queueRunScanRef.current(params);
}, []);

const { isOnline, checkNow: checkNetworkNow } = useNetworkStatus(resolvedApiBase);
const {
  items:       offlineItems,
  pendingCount,
  enqueue:     enqueueOffline,
  flush:       flushOffline,
  retryItem:   retryOfflineItem,
  deleteItem:  deleteOfflineItem,
  setPriority: setOfflinePriority,
  isFlushing:  isFlushingQueue,
} = useOfflineQueue(_stableRunScanForQueue);

// Auto-flush queue when connectivity is restored
useEffect(() => {
  if (isOnline && pendingCount > 0) {
    flushOffline(resolvedApiBase || SAFE_API_BASE).catch(() => {});
  }
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [isOnline]);
// ─────────────────────────────────────────────────────────────────────────────
// -------------------------
// ✅ FEATURE: SCAN MODES
// -------------------------
const SCAN_MODES = {
  ITEM: "item",
  MARK: "mark",
  PART: "part",
  LABEL: "label",
  PROP: "prop",
};
const _SCAN_MODE_FALLBACKS = [
  SCAN_MODES.ITEM,
  SCAN_MODES.MARK,
  SCAN_MODES.PART,
  SCAN_MODES.LABEL,
];
const [scanMode, setScanMode] = useState(SCAN_MODES.ITEM);
// optional input used only for PROP mode
const [propContext, _setPropContext] = useState("");
// Camera UI
  const [cameraFacing, setCameraFacing] = useState("back");
  const [torchOn, setTorchOn] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [_batchCount, setBatchCount] = useState(0);
  // Feature 3: Receipt scan mode
  const [receiptMode, setReceiptMode] = useState(false);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptData, setReceiptData] = useState<any | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [receiptPanelOpen, setReceiptPanelOpen] = useState(false);
  // Keyboard height
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  // Login placeholder
  const [isSignedIn, setIsSignedIn] = useState(false);
// ===============================
// REFERRAL STATE
// ===============================
const [installId, setInstallId] = useState<string | null>(null);
const [referralCode, setReferralCode] = useState<string | null>(null);
const [referralUses, setReferralUses] = useState(0);
const [referralInfoExpanded, setReferralInfoExpanded] = useState(false); // ✅ NO MODAL

const effectiveReferralCode = (() => {
  const a = String(referralCode || "").trim();
  const b = String(refState?.code || "").trim();
  const c = installId ? buildReferralCode(installId) : "";
  return (a || b || c || "EVAN0000").toUpperCase();
})();

const [_referralLoading, setReferralLoading] = useState(false);

useEffect(() => {
  if (!userId) return;

  const loadReferral = async () => {
    try {
      setReferralLoading(true);

      const stats = await fetch(
        `${resolvedApiBase || SAFE_API_BASE}/referral/stats?userId=${encodeURIComponent(userId)}`
      );

      const statsJson = await stats.json();

      if (statsJson?.ok && statsJson.code) {
        setReferralCode(statsJson.code);
        setReferralUses(statsJson.totalUses || 0);
        setReferralLoading(false);
        return;
      }

      const create = await fetch(`${resolvedApiBase || SAFE_API_BASE}/referral/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      const createJson = await create.json();

      if (createJson?.ok) {
        setReferralCode(createJson.code);
      }

      setReferralLoading(false);
    } catch {
      setReferralLoading(false);
    }
  };

  loadReferral();
}, [resolvedApiBase, userId]);

const _handleShareReferral = async () => {
  if (!referralCode) return;
  const shareLink = `https://evanai.app?ref=${effectiveReferralCode}`;
  await Share.share({
    message: `Download Evan AI now.
Scan anything.
Find real resale value instantly.
Unlock AI-powered intelligence.
Beat the market.
Use my code: ${referralCode}
Get bonus scans instantly.
${shareLink}`,
  });
};
  // ✅ RETENTION: watchlist + daily re-check + price-drop alerts (in-app)
// shape: { id, query, lastBest, lastCheckedMs, addedAtMs, history:[{ts,best}], seenDrop:boolean }


useEffect(() => {
  watchlistRef.current = watchlist;
}, [watchlist]);

// Auto-poll permanently OFF — manual-only via "Find current price" button.
// Kept as a hard-coded `enabled: false` so any future BILLION flag flip
// (and the `autoWatchEnabled` switch) cannot accidentally fan SerpAPI lanes
// across every watchlist item on app open. The single user-triggered
// refresh path lives in runManualWatchPriceRefresh / findCurrentPrice.
useWatchlistMarketPolling({
  enabled: false,
  watchlist,
  setWatchlist,
});
	
// ✅ in-app “notifications” (badge + toast) — no push needed yet
const [dropCount, setDropCount] = useState(0);
useEffect(() => {
  const total = (watchlist || []).reduce(
    (s, x) => s + (x.dropCount || 0),
    0
  );
  setDropCount(total);
}, [watchlist]);
// ✅ “Price changed since you scanned” banner on Results screen
const [priceChangeBanner, setPriceChangeBanner] = useState(null);
  // History
  const [history, setHistory] = useState([]);
  const _HISTORY_STORAGE_KEY = "evanai-history";
  const SAVINGS_STORAGE_KEY = "evanai-savings";

  // ── Sync history → SpatialContext for 3D Archive shards ──
  useEffect(() => {
    if (!Array.isArray(history)) return;
    setArchiveItems(history.map((h: any) => ({ id: h.id ?? String(h.scannedAt ?? ""), title: h.title || "Scan" })));
  }, [history, setArchiveItems]);

  // ── Handle archive shard inspection → load result + navigate ──
  useEffect(() => {
    if (!inspectedArchiveId) return;
    const match = (history as any[]).find((h: any) => (h.id ?? String(h.scannedAt ?? "")) === inspectedArchiveId);
    setInspectedArchiveId(null);
    if (!match?.resultCard) return;
    setActiveResult(match.resultCard);
    setResults(match.resultCard.alternatives || []);
    setLoadingResults(false);
    setLoadingPhotoUri(match.uri || null);
    setLastScan({
      kind: "history",
      confidence: match.resultCard.visionConfidence ?? 0,
      query: match.resultCard.visionQuery ?? null,
      results: match.resultCard.alternatives || [],
    });
    goTab("results");
  }, [inspectedArchiveId]);

  // Profile modals
  // null | "subscription" | "payments" | "review" | "terms" | "privacy"
  const [profileModal, setProfileModal] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [_authInput, _setAuthInput] = useState("");
  const [authStep, setAuthStep] = useState<"email" | "password">("email");
  const [_authMethod, _setAuthMethod] = useState<"phone" | "email">("email");
  const [authEmail, setAuthEmail] = useState("");
  const [_authPhone, _setAuthPhone] = useState("");
  const [authOtp, setAuthOtp] = useState(""); // repurposed: password field
  const [_authOtpTarget, _setAuthOtpTarget] = useState("");
  const [_authSimCode, _setAuthSimCode] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSending, setAuthSending] = useState(false);
  const [authPwVisible, setAuthPwVisible] = useState(false);
  const [authIsRegister, setAuthIsRegister] = useState(false);
  // Auth button pulse animation — pulses while sending, dims when disabled
  const authBtnPulse = useRef(new RNAnimated.Value(1)).current;
  const [authOtpShort, setAuthOtpShort] = useState(true);
  // showPaywall, aspirationCtx, sessionMomentum → brain store (single source of truth)
  // Auth button pulse — starts looping while authSending, resets otherwise
  useEffect(() => {
    authBtnPulse.stopAnimation();
    if (authSending) {
      RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.timing(authBtnPulse, { toValue: 0.48, duration: 500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          RNAnimated.timing(authBtnPulse, { toValue: 1.0,  duration: 500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ).start();
    } else {
      RNAnimated.timing(authBtnPulse, { toValue: authOtpShort ? 0.42 : 1.0, duration: 120, useNativeDriver: true }).start();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authSending, authOtpShort]);

  // ✅ PAYWALL POP (premium: blur + scale + opacity)
const paywallPop = useRef(new RNAnimated.Value(0)).current;



useEffect(() => {
  if (brainPaywallVisible) {
    // ── Finance Analytics: paywall impression with A/B variant ───────────
    try {
      const variant = brainAspirationCtx?.triggerType ?? "scan_limit";
      FinanceAnalytics.recordPaywallShown(
        userId ?? null,
        isPro ? "plus" : "free",
        variant === "NONE" ? "scan_limit" : "aspiration",
        variant,
      );
      setPaywallImpressions((n) => n + 1);
    } catch {}

    paywallPop.setValue(0);
    RNAnimated.timing(paywallPop, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  } else {
    RNAnimated.timing(paywallPop, {
      toValue: 0,
      duration: 180,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }
}, [brainPaywallVisible, paywallPop]);
const [_showHowDifferent, _setShowHowDifferent] = useState(false);
// ✅ PREVIEW LAYOUT (prevents previewBottom crash)
// keeps the buttons above the keyboard
const previewBottom = Math.max(24, (keyboardHeight || 0) + 16);

// Preview panel entrance animation (springs up from below when photo is taken)
const previewPanelY = useRef(new RNAnimated.Value(60)).current;
const previewPanelOpacity = useRef(new RNAnimated.Value(0)).current;
  // Savings + price input
  const [scanPriceInput, setScanPriceInput] = useState("");
  const [cheapestAltInput, setCheapestAltInput] = useState("");
  const [itemNameInput, setItemNameInput] = useState("");
  const [sizeInput, setSizeInput] = useState(""); // Feature 11: size/variant hint
  const [savingsTotal, setSavingsTotal] = useState(0);
  
// -------------------------
// LEVEL 100 BARCODE AI
// -------------------------
const [barcodeMode, setBarcodeMode] = useState(false);
const [_lastBarcode, setLastBarcode] = useState<string | null>(null);
const barcodeLockRef = useRef(false);

  // Hide preview buttons AFTER user submits (presses Use Photo)
  const [priceSubmitted, setPriceSubmitted] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);


 
// ✅ BUTTON ENABLEMENT (safe: now state exists)
const parsedScanPrice = toNumber(scanPriceInput);
const _parsedCheapestAlt = toNumber(cheapestAltInput);
const canUsePhoto =
  !!photo?.uri &&
  !loadingResults &&
  !priceSubmitted &&
  Number.isFinite(parsedScanPrice) &&
  parsedScanPrice > 0;
// Trigger preview panel entrance when photo is set
useEffect(() => {
  if (photo) {
    previewPanelY.setValue(70);
    previewPanelOpacity.setValue(0);
    RNAnimated.parallel([
      RNAnimated.spring(previewPanelY, {
        toValue: 0, damping: 22, stiffness: 200, mass: 0.9, useNativeDriver: true,
      }),
      RNAnimated.timing(previewPanelOpacity, {
        toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
    ]).start();
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [photo]);

// ✅ Feature #3/#10/#11: collector + material + alternatives enrich
const [_enrich, _setEnrich] = useState(null);
  // Active result
 const [profitCalcOpen, setProfitCalcOpen] = useState(false);
 // Confetti burst trigger. Lives at the tab-root so it can render OUTSIDE
 // the results ScrollView and stay screen-anchored without a Modal. Set
 // to Date.now() to fire a fresh burst; 0 = idle.
 const [confettiKey, setConfettiKey] = useState(0);
 // Feature 5: hyperlocal pricing — user's zip code
 const [zipCode, setZipCode] = useState<string>("");
 // Feature 11: Deep auth scan result (lazy, fires after scan result loads)
 const [deepAuthResult, setDeepAuthResult] = useState<DeepAuthResult | null>(null);
 const [deepAuthLoading, setDeepAuthLoading] = useState(false);
 // Feature 12: Visual condition assessment (lazy)
 const [conditionAssessment, setConditionAssessment] = useState<ConditionAssessment | null>(null);
 const [conditionAssessLoading, setConditionAssessLoading] = useState(false);
 // Feature 10: Flip scanner state
 const [flipScanOpen, setFlipScanOpen] = useState(false);
 const [flipScanResults, setFlipScanResults] = useState<any[]>([]);
 const [flipScanLoading, setFlipScanLoading] = useState(false);
 // Feature 9: Relist suggestions
 const [relistSuggestions, setRelistSuggestions] = useState<any[]>([]);
 const [relistLoading, setRelistLoading] = useState(false);
 // Feature 13: Community comps
 const [communityComps, setCommunityComps] = useState<CommunityCompsData | null>(null);
 const [communityCompsLoading, setCommunityCompsLoading] = useState(false);
 // Feature 14: Public savings profile sync flag
 const [_savingsSynced, _setSavingsSynced] = useState(false);
 // Feature 1: P&L Tracker
 const [plFlips, setPlFlips] = useState<PLFlip[]>([]);
 const [plBadge, setPlBadge] = useState(false);
 const lastProfileOpenMsRef = useRef<number>(0);
 const plFlipsLoadedRef = useRef(false); // guard: don't save until initial load completes
 // Net/Gross profit toggle (15% platform fee deduction)
 const [netProfitEnabled, setNetProfitEnabled] = useState(false);
 // The Vault — screenshot trophy case
 interface VaultEntry { id: string; uri: string; name: string; price: number | null; potentialProfit: number | null; timestamp: number }
 const [vaultEntries, setVaultEntries] = useState<VaultEntry[]>([]);
 const [vaultModalUri, setVaultModalUri] = useState<string | null>(null);
 // Vault fly animation
 const [vaultFly, setVaultFly] = useState<{ key: number; uri: string } | null>(null);
 const vaultFlyKeyRef = useRef(0);
 // Heartbeat haptic during scan
 const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
 const heartbeatPhaseRef = useRef<"slow" | "fast">("slow");
 // Feature 2: Haggle Score
 const [haggleResult, setHaggleResult] = useState<HaggleScoreResult | null>(null);
 const [haggleLoading, setHaggleLoading] = useState(false);
 // Feature 3: Local Radar
 const [radarData, setRadarData] = useState<RadarData | null>(null);
 const [radarLoading, setRadarLoading] = useState(false);
 // Live Activity Ticker
 const tickerX = useRef(new RNAnimated.Value(0)).current;

// -------------------------
// ✅ Verdict + confidence copy (UI-safe)
// -------------------------
const nikeLikely =
  /nike/i.test(activeResult?.visionQuery || "") ||
  /nike/i.test(activeResult?.itemName || "");
const getConfidenceBreakdown = ({ confidence, nikeLikely, totalMatches }) => {
  const c = Number(confidence) || 0;
  const lines = [];
  if (c >= 0.92) lines.push("Very strong match — branding/model clearly visible.");
  else if (c >= 0.85) lines.push("Good match — minor ambiguity.");
  else if (c >= 0.7) lines.push("Moderate match — try closer framing.");
  else lines.push("Low confidence — improve lighting or angle.");
  if (nikeLikely) lines.push("Brand signal detected (Nike).");
  if (Number.isFinite(totalMatches)) lines.push(`${totalMatches} listings compared.`);
  return lines;
};
const [resultModalOpen, setResultModalOpen] = useState(false);
useEffect(() => {
  profileModalRef.current = profileModal;
}, [profileModal]);
useEffect(() => {
  seeMoreOpenRef.current = seeMoreOpen;
}, [seeMoreOpen]);
useEffect(() => {
  haggleOpenRef.current = haggleOpen;
}, [haggleOpen]);
useEffect(() => {
  showPaywallRef.current = brainPaywallVisible;
}, [brainPaywallVisible]);
useEffect(() => {
  freePassInfoOpenRef.current = freePassInfoOpen;
}, [freePassInfoOpen]);
useEffect(() => {
  splashInfoOpenRef.current = splashInfoOpen;
}, [splashInfoOpen]);
useEffect(() => {
  resultModalOpenRef.current = resultModalOpen;
}, [resultModalOpen]);

// ── Live Activity Ticker animation ───────────────────────────────────────────
useEffect(() => {
  let cancelled = false;
  const runTicker = () => {
    if (cancelled) return;
    tickerX.setValue(0);
    RNAnimated.timing(tickerX, {
      toValue: -TICKER_TOTAL_W,
      duration: TICKER_TOTAL_W * 32,
      easing: Easing.linear,
      useNativeDriver: true,
      isInteraction: false,
    }).start(({ finished }) => {
      if (finished && !cancelled) runTicker();
    });
  };
  runTicker();
  return () => { cancelled = true; tickerX.stopAnimation(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

// ── Camera delayed-active: keep camera live 350ms after leaving tab to avoid flash ──
useEffect(() => {
  // Always stop in-flight shutter animations and reset to resting state.
  // stopAnimation() is critical: without it, a running RNAnimated sequence
  // will override any subsequent .setValue() calls on the next frame.
  snapScale.stopAnimation();   snapScale.setValue(1);
  snapDepth.stopAnimation();   snapDepth.setValue(0);
  ringScale.stopAnimation();   ringScale.setValue(0);
  ringOpacity.stopAnimation(); ringOpacity.setValue(0);
  // Cancel pending ripple setTimeout timers and reset ripple anims
  rippleTimersRef.current.forEach(clearTimeout);
  rippleTimersRef.current = [];
  rippleAnims.forEach((r) => {
    r.scale.stopAnimation();   r.scale.setValue(0);
    r.opacity.stopAnimation(); r.opacity.setValue(0);
  });
  setIsCapturing(false);
  scanLockRef.current = false;

  if (tab === "camera") {
    setCameraDelayedActive(true);
    // ── Brain: camera is live — SITT reads isSITTAllowed() from brain store
    useEvanBrain.getState().setCameraActive(true);
    if (cameraReady) {
      // Camera was warm — restore overlay to transparent immediately
      cameraReadyOp.setValue(1);
    } else {
      // Camera needs to warm up — show black overlay until onCameraReady fires.
      // Fallback: if onCameraReady never fires (Expo Camera quirk), clear overlay after 600ms.
      cameraReadyOp.setValue(0);
      const fallback = setTimeout(() => {
        setCameraReady(true);
        RNAnimated.timing(cameraReadyOp, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      }, 600);
      return () => clearTimeout(fallback);
    }
  } else {
    // Leaving camera: hide overlay, defer camera deactivation
    cameraReadyOp.setValue(0);
    // ── Brain: camera inactive — SITT reads isSITTAllowed() from brain store
    useEvanBrain.getState().setCameraActive(false);
    const t = setTimeout(() => {
      setCameraDelayedActive(false);
      setCameraReady(false);
    }, 350);
    return () => clearTimeout(t);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [tab]);

// ── Feature 1: Persist P&L flips to AsyncStorage ─────────────────────────────
// Guard: skip the first render (initial empty state) so we don't overwrite
// persisted data before the load effect has a chance to restore it.
useEffect(() => {
  if (!plFlipsLoadedRef.current) return;
  AsyncStorage.setItem("EVAN_PL_FLIPS_V1", JSON.stringify(plFlips)).catch(() => {});
}, [plFlips]);

// ── PLTracker badge: load last profile tab open time ──────────────────────────
useEffect(() => {
  AsyncStorage.getItem("EVAN_LAST_PROFILE_OPEN").then((v) => {
    if (v) lastProfileOpenMsRef.current = Number(v);
  }).catch(() => {});
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

// ── PLTracker badge: show when holding flips exist + profile stale >24h ───────
useEffect(() => {
  const hasHolding = plFlips.some((f) => f.status === "holding");
  const stale = Date.now() - lastProfileOpenMsRef.current > 24 * 60 * 60 * 1000;
  setPlBadge(hasHolding && stale);
}, [plFlips]);

// ── PLTracker badge: clear when profile tab opened ────────────────────────────
useEffect(() => {
  if (tab === "profile") {
    setPlBadge(false);
    lastProfileOpenMsRef.current = Date.now();
    AsyncStorage.setItem("EVAN_LAST_PROFILE_OPEN", String(Date.now())).catch(() => {});
  }
}, [tab]);

// ── Vault: load persisted entries on mount ────────────────────────────────────
useEffect(() => {
  AsyncStorage.getItem("EVAN_VAULT_V1").then((raw) => {
    if (raw) { try { setVaultEntries(JSON.parse(raw)); } catch {} }
  }).catch(() => {});
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);


// ── Heartbeat haptic: rhythmic Light pulse while scanning, crescendo on enrich ─
useEffect(() => {
  if (!loadingResults) {
    if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
    heartbeatPhaseRef.current = "slow";
    return;
  }
  heartbeatPhaseRef.current = "slow";
  const tick = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const ms = heartbeatPhaseRef.current === "fast" ? 200 : 750;
    heartbeatTimerRef.current = setTimeout(tick, ms);
  };
  heartbeatTimerRef.current = setTimeout(tick, 900);
  return () => { if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current); };
}, [loadingResults]);

// ── Feature 14: Sync savings profile to server when stats change ──────────────
useEffect(() => {
  if (!savingsTotal && !scansUsed) return;
  const uid = installId || effectiveReferralCode || "anon";
  const apiBase = process.env.EXPO_PUBLIC_API_URL ??
    (Platform.OS === "ios" ? "http://192.168.1.227:3001" : "http://10.0.2.2:3001");
  fetch(`${apiBase}/api/profile/savings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: uid,
      savingsTotal,
      scanCount: scansUsed,
      flipCount: 0,
    }),
    signal: abortAfter(6000),
  }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [savingsTotal, scansUsed]);

  // last scan status for Results screen
  const [lastScan, setLastScan] = useState(null);


const isFreeLimitReached = !hasUnlimited && scansUsed >= FREE_SCAN_LIMIT_SAFE;

// ── Orchestrator: single entry point for scan pipeline ────────────────────────
const orchestrator = useEvanOrchestrator({
  isPro,
  scansUsed,
  freeLimit: FREE_SCAN_LIMIT_SAFE,
});

// ─── Upgrade Intelligence ─────────────────────────────────────────────────────
const upgradeIntel = useUpgradeIntelligence({
  financeState,
  isPro,
  scansToday:         scansUsed,
  freeScanLimit:      FREE_SCAN_LIMIT_SAFE,
  hitFreeLimitToday:  isFreeLimitReached,
  watchlistCount:     (watchlist || []).length,
  paywallImpressions,
  daysSinceLastScan:  financeState.lastScanTs
    ? Math.floor((Date.now() - financeState.lastScanTs) / 86_400_000)
    : 0,
});

// -------------------------
// ✅ Profile status label (prevents runtime crash)
// -------------------------
const statusLabel =
  isPro
    ? "Pro active · Unlimited scans"
    : isSignedIn
    ? `${Math.max(0, FREE_SCAN_LIMIT_SAFE - scansUsed)} free scans left`
    : "Guest · Sign in to unlock features";
  // Animations
  const snapScale = useRef(new RNAnimated.Value(1)).current;
  const snapDepth = useRef(new RNAnimated.Value(0)).current;
  const ringScale = useRef(new RNAnimated.Value(0)).current;
  const ringOpacity = useRef(new RNAnimated.Value(0)).current;

  // Water ripple on shutter press (3 rings expand outward)
  const RIPPLE_COUNT = 3;
  const rippleAnims = useRef(
    Array.from({ length: RIPPLE_COUNT }, () => ({
      scale: new RNAnimated.Value(0),
      opacity: new RNAnimated.Value(0),
    }))
  ).current;

  const resetRipple = () => {
    rippleAnims.forEach((r) => { r.scale.setValue(0); r.opacity.setValue(0); });
  };

  const rippleTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const triggerRipple = () => {
    // Cancel any pending ripple timers from previous trigger
    rippleTimersRef.current.forEach(clearTimeout);
    rippleTimersRef.current = [];
    rippleAnims.forEach((r, i) => {
      r.scale.stopAnimation();   r.scale.setValue(0);
      r.opacity.stopAnimation(); r.opacity.setValue(0);
      const t = setTimeout(() => {
        RNAnimated.parallel([
          RNAnimated.timing(r.scale, {
            toValue: 1,
            duration: 600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          RNAnimated.sequence([
            RNAnimated.timing(r.opacity, { toValue: 0.6, duration: 80, useNativeDriver: true }),
            RNAnimated.timing(r.opacity, { toValue: 0, duration: 520, useNativeDriver: true }),
          ]),
        ]).start();
      }, i * 120);
      rippleTimersRef.current.push(t);
    });
  };
  const loadingRot = useRef(new RNAnimated.Value(0)).current;
useEffect(() => {
  if (!loadingResults) return;
  loadingRot.setValue(0);
  RNAnimated.loop(
    RNAnimated.timing(loadingRot, {
      toValue: 1,
      duration: 900,
      easing: Easing.linear,
      useNativeDriver: true,
    })
  ).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [loadingResults]);
  const buttonsY = useRef(new RNAnimated.Value(0)).current; // NO SLIDE
  const buttonsOpacity = useRef(new RNAnimated.Value(0)).current;
  const sway = useRef(new RNAnimated.Value(0)).current;
  // ✅ tabFade is declared ONCE earlier near the tab state — DO NOT redeclare it here.
  
  useEffect(() => {
  const sub = AppState.addEventListener("change", (s) => {
    if (s === "active") {
      try {
        tabFade.stopAnimation();
      } catch {}
      tabFade.setValue(1);
      tabSwitchingRef.current = false;
      pendingTabRef.current = null;
    }
  });
  return () => sub.remove();
}, [tabFade]);

  
// Help overlay
  const [helpOpen, setHelpOpen] = useState(false);
  const _helpY = useRef(new RNAnimated.Value(14)).current;
  const helpOpacity = useRef(new RNAnimated.Value(0)).current;
  // Flash mask
  const flashMaskOpacity = useRef(new RNAnimated.Value(0)).current;
  const flashMaskTimer = useRef(null);
  const flashMidTimer = useRef(null);
  const flipTimer = useRef(null);
  // ✅ FIX #2 — prevent black flash on shutter
const _triggerFlashMask = () => {
  flashMaskOpacity.setValue(0);
  RNAnimated.timing(flashMaskOpacity, {
    toValue: 0,        // keep it invisible
    duration: 1,
    useNativeDriver: true,
  }).start();
};
// ===============================
// REDUCE MOTION SUPPORT
// ===============================
const [reduceMotion, setReduceMotion] = useState(false);
useEffect(() => {
  AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  const sub = AccessibilityInfo.addEventListener?.(
    "reduceMotionChanged",
    setReduceMotion
  );
  return () => sub?.remove?.();
}, []);

// Splash animation (split drivers: dotY = native, splashDots = JS)
useEffect(() => {
  if (!showSplash) return;

  // reset
  try { splashDots.stopAnimation(); } catch {}
  try { dotY.stopAnimation(); } catch {}
  splashDots.setValue(0);
  dotY.setValue(0);

  // reset new splash anim values
  splashOrbScale.setValue(0.85);
  splashOrbOpacity.setValue(0);
  splashTaglineY.setValue(14);
  splashTaglineOp.setValue(0);
  splashChipsY.setValue(20);
  splashChipsOp.setValue(0);
  splashProgressAnim.setValue(0);

  RNAnimated.parallel([
    RNAnimated.timing(splashOpacity, {
      toValue: 1,
      duration: reduceMotion ? 0 : 600,
      useNativeDriver: true,
    }),
    RNAnimated.timing(logoScale, {
      toValue: 1,
      duration: reduceMotion ? 0 : 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }),
  ]).start();

  // Orb glow entrance
  RNAnimated.timing(splashOrbOpacity, { toValue: 1, duration: reduceMotion ? 0 : 700, useNativeDriver: true }).start();

  // Orb pulse loop
  const orbPulse = RNAnimated.loop(RNAnimated.sequence([
    RNAnimated.timing(splashOrbScale, { toValue: 1.14, duration: 1700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    RNAnimated.timing(splashOrbScale, { toValue: 0.85, duration: 1700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
  ]));
  orbPulse.start();

  // Tagline entrance
  RNAnimated.sequence([
    RNAnimated.delay(reduceMotion ? 0 : 420),
    RNAnimated.parallel([
      RNAnimated.spring(splashTaglineY, { toValue: 0, damping: 22, stiffness: 200, useNativeDriver: true }),
      RNAnimated.timing(splashTaglineOp, { toValue: 1, duration: 380, useNativeDriver: true }),
    ]),
  ]).start();

  // Feature chips entrance
  RNAnimated.sequence([
    RNAnimated.delay(reduceMotion ? 0 : 780),
    RNAnimated.parallel([
      RNAnimated.spring(splashChipsY, { toValue: 0, damping: 22, stiffness: 200, useNativeDriver: true }),
      RNAnimated.timing(splashChipsOp, { toValue: 1, duration: 380, useNativeDriver: true }),
    ]),
  ]).start();

  // Progress bar (JS driver — width animation)
  RNAnimated.timing(splashProgressAnim, { toValue: 1, duration: SPLASH_MIN_MS - 300, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();

RNAnimated.sequence([
  RNAnimated.delay(900),
  RNAnimated.timing(logoFade, {
    toValue: 0,
    duration: 420,
    easing: Easing.out(Easing.cubic),
    useNativeDriver: true,
  }),
]).start();

  // ✅ “i” bounce (native driver)
  const bounceLoop = RNAnimated.loop(
    RNAnimated.sequence([
      RNAnimated.timing(dotY, {
        toValue: 1,
        duration: 320,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
      RNAnimated.timing(dotY, {
        toValue: 0,
        duration: 320,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ])
  );
  bounceLoop.start();

  // ✅ dot count driver (JS only)
  const dotsLoop = RNAnimated.loop(
    RNAnimated.sequence([
      RNAnimated.timing(splashDots, {
        toValue: 3,
        duration: 1200,
        useNativeDriver: false,
      }),
      RNAnimated.timing(splashDots, {
        toValue: 0,
        duration: 0,
        useNativeDriver: false,
      }),
    ])
  );
  dotsLoop.start();

  // listener ONLY during splash
  try {
    const id = splashDots.addListener(({ value }) => {
      const v = Math.max(1, Math.min(3, Math.round(value)));
      setSplashDotCount(v);
    });
    splashDotsListenerIdRef.current = id;
  } catch {}

// Liquid Glass exit — spring-driven scale-down + fade instead of linear timing
const timer = setTimeout(() => {
  RNAnimated.parallel([
    RNAnimated.timing(splashOpacity, {
      toValue: 0,
      duration: reduceMotion ? 0 : 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }),
    RNAnimated.spring(logoScale, {
      toValue: 0.92,
      damping: 20,
      stiffness: 90,
      mass: 1.0,
      useNativeDriver: true,
    }),
  ]).start(() => {
    requestAnimationFrame(() => {
      setShowSplash(false);
    });
  });
}, Math.max(0, SPLASH_MIN_MS - (reduceMotion ? 0 : 420)));

  return () => {
    clearTimeout(timer);
    try { bounceLoop.stop(); } catch {}
    try { dotsLoop.stop(); } catch {}
    try { orbPulse.stop(); } catch {}
    try { dotY.stopAnimation(); } catch {}
    try { splashDots.stopAnimation(); } catch {}
    try { splashOrbScale.stopAnimation(); } catch {}
    try {
      if (splashDotsListenerIdRef.current != null) {
        splashDots.removeListener(splashDotsListenerIdRef.current);
        splashDotsListenerIdRef.current = null;
      }
    } catch {}
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [showSplash, splashOpacity, logoScale, splashDots, dotY, reduceMotion]);

useEffect(() => {
  if (!showSplash) return;
  const interval = setInterval(() => {
    setSplashLoadingDots((prev) =>
      prev === "." ? ".." : prev === ".." ? "..." : "."
    );
  }, 400);
  return () => clearInterval(interval);
}, [showSplash]);

// ===============================
// ✅ RETENTION: DAILY WATCHLIST RE-CHECK (on app open) + ABORT SCAN IF BACKGROUNDS
// ===============================
const checkingWatchlistRef = useRef(false);
const checkOneWatchlist = async (w, { quiet = false } = {}) => {
  try {
const res: any = await fetch(`${resolvedApiBase}/market/check`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query: w.query }),
});
const data = await res.json();
    const best = toNumber(data?.bestPrice);
    if (!Number.isFinite(best)) return null;
    return best;
  } catch (e) {
    if (!quiet) console.warn("watchlist check failed", e);
    return null;
  }
};
const runDailyWatchlistCheck = async ({ force = false, quiet = true } = {}) => {
  // Hard-disabled 2026-05-22 — TestFlight prep. The ONLY allowed watchlist
  // search path is the per-item "Find current price" button in the detail
  // modal (see runManualWatchPriceRefresh). Every other path — mount
  // intervals, tab-switch effects, settings "Force re-check now" buttons,
  // app-resume checks — is bailed at the function entry so a forgotten
  // caller cannot silently fan SerpAPI lanes across every saved item on
  // tab focus or boot.
  console.log("WATCHLIST_AUTO_SEARCH_BLOCKED", { fn: "runDailyWatchlistCheck", force, quiet });
  return;
  // eslint-disable-next-line no-unreachable
  if (checkingWatchlistRef.current) return;
  if (!watchlistRef.current?.length) return;
  checkingWatchlistRef.current = true;
  try {
    const now = Date.now();
    const list = watchlistRef.current.slice(0, 30); // cap so it never explodes
    for (const w of list) {
      const stale = !w.lastCheckedMs || now - w.lastCheckedMs > DAY_MS;
      if (!force && !stale) continue;
      const best = await checkOneWatchlist(w, { quiet });
      if (!Number.isFinite(best)) continue;

      // Feature 8: Price target alert — fire push notification when target is hit
      const targetHit =
        Number.isFinite(w.targetPrice) &&
        w.targetPrice > 0 &&
        best <= w.targetPrice &&
        !w.targetHitNotifiedAt; // dedupe: only notify once per target

      if (targetHit) {
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "🎯 Price Target Hit!",
              body: `${w.title || w.query} dropped to ${money(best)} — your target was ${money(w.targetPrice)}`,
              data: { watchlistId: w.id, best, targetPrice: w.targetPrice },
              sound: true,
            },
            trigger: null, // fire immediately
          });
        } catch {
          // non-fatal: push perms may not be granted
        }
        setDropCount((c) => c + 1);
        setSavedToast(`🎯 Target hit — ${w.title || w.query} · ${money(best)}`);
      }

      // Price Pulse: notify on >15% drop or new all-time low (VALUE FLOOR)
      const prevBestPulse = toNumber(w.lastBest);
      if (!targetHit && Number.isFinite(prevBestPulse) && prevBestPulse > 0 && best < prevBestPulse) {
        const dropPct = (prevBestPulse - best) / prevBestPulse;
        const histLows = (w.history ?? []).map((h: any) => toNumber(h.best ?? 0)).filter((n: number) => Number.isFinite(n) && n > 0);
        const allTimeLow = histLows.length > 0 ? Math.min(...histLows) : prevBestPulse;
        const isNewFloor = best < allTimeLow;
        if (dropPct >= 0.15 || isNewFloor) {
          try {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: isNewFloor ? "🔥 New Value Floor!" : "📉 Price Pulse",
                body: isNewFloor
                  ? `${w.title || w.query} hit an all-time low: ${money(best)} (was ${money(prevBestPulse)})`
                  : `${w.title || w.query} dropped ${Math.round(dropPct * 100)}% to ${money(best)}`,
                data: { screen: "watchlist", watchlistId: w.id, best },
                sound: true,
              },
              trigger: null,
            });
          } catch {
            // non-fatal
          }
        }
      }

      setWatchlist((prev) =>
        prev.map((x) => {
          if (x.id !== w.id) return x;
          const prevBest = toNumber(x.lastBest);
          const dropped = Number.isFinite(prevBest) && best < prevBest;
          const nextHistory = Array.isArray(x.history) ? x.history.slice(-19) : [];
          nextHistory.push({ ts: now, best });
          // in-app alert for normal price drops (not target hits)
          if (dropped && x.seenDrop && !targetHit) {
            setDropCount((c) => c + 1);
            setSavedToast(`price dropped · ${money(best)}`);
            // Feature 5: push price drop to iOS widget
            const delta = Number.isFinite(prevBest) ? prevBest - best : 0;
            updateWidgetData({
              priceDropAlert: `${x.query || x.itemName || "Item"} dropped ${money(delta)}`,
              priceDropItem:  x.query || x.itemName || "",
              priceDropDelta: delta,
            }).catch(() => {});
          }
          return {
            ...x,
            lastBest: best,
            lastCheckedMs: now,
            history: nextHistory,
            seenDrop: dropped ? true : x.seenDrop,
            dropCount: dropped ? (x.dropCount || 0) + 1 : (x.dropCount || 0),
            targetHit: targetHit ? true : x.targetHit,
            targetHitNotifiedAt: targetHit ? now : x.targetHitNotifiedAt,
          };
        })
      );
    }
  } finally {
    checkingWatchlistRef.current = false;
  }
};

// Feature 9: Load relist suggestions when watchlist tab is opened.
// Hard-disabled — fires /api/relist/suggestions which fans SerpAPI lanes
// for every watched item. The watchlist tab must NOT auto-search on open.
const loadRelistSuggestions = async () => {
  console.log("WATCHLIST_AUTO_SEARCH_BLOCKED", { fn: "loadRelistSuggestions" });
  return;
  // eslint-disable-next-line no-unreachable
  if (!watchlist?.length || relistLoading) return;
  setRelistLoading(true);
  try {
    const apiBase = process.env.EXPO_PUBLIC_API_URL ??
      (Platform.OS === "ios" ? "http://192.168.1.227:3001" : "http://10.0.2.2:3001");
    const payload = (watchlist || [])
      .filter((w: any) => w?.query && w?.lastBest)
      .slice(0, 10)
      .map((w: any) => ({
        id: w.id,
        query: w.query,
        scannedPrice: w.scannedPrice ?? w.estValue ?? null,
        lastBest: w.lastBest,
        targetPrice: w.targetPrice ?? null,
        createdAt: w.createdAt,
        history: w.history ?? [],
      }));
    if (!payload.length) return;
    const resp = await fetch(`${apiBase}/api/relist/suggestions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: payload }),
      signal: abortAfter(20000),
    });
    const json = await resp.json();
    if (json?.ok && Array.isArray(json.suggestions)) {
      setRelistSuggestions(json.suggestions);
    }
  } catch { /* non-fatal */ } finally {
    setRelistLoading(false);
  }
};

// Feature 10: Flip Scanner — search a category + zip for flip opportunities
const runFlipScanner = async (category: string) => {
  if (!zipCode) {
    setSavedToast("Set your zip code in the Watchlist tab first");
    return;
  }
  setFlipScanLoading(true);
  setFlipScanResults([]);
  setFlipScanOpen(true);
  try {
    const apiBase = process.env.EXPO_PUBLIC_API_URL ??
      (Platform.OS === "ios" ? "http://192.168.1.227:3001" : "http://10.0.2.2:3001");
    const resp = await fetch(`${apiBase}/api/arbitrage/flip-scanner`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: category || activeResult?.category || "sneakers",
        zipCode,
        seedQuery: activeResult?.query || null,
      }),
      signal: abortAfter(40000),
    });
    const json = await resp.json();
    if (json?.ok && Array.isArray(json.opportunities)) {
      setFlipScanResults(json.opportunities);
    }
  } catch { /* non-fatal */ } finally {
    setFlipScanLoading(false);
  }
};

// ── Feature 1: P&L handler functions ─────────────────────────────────────────

// Fire-and-forget server sync — only runs when the user is signed in.
// Optimistic: local state is already updated before this fires.
const syncFlipToServer = (flip: PLFlip, uid: string) => {
  if (!_authJwt || !uid) return;
  fetch(`${SAFE_API_BASE}/api/pl/record`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${_authJwt}`,
    },
    body: JSON.stringify({ userId: uid, flip }),
  }).catch(() => {});
};

const handleVaultSave = async (entry: { id: string; tempUri: string; name: string; price: number | null; potentialProfit: number | null }) => {
  try {
    const vaultDir = `${FileSystem.documentDirectory}vault/`;
    await FileSystem.makeDirectoryAsync(vaultDir, { intermediates: true }).catch(() => {});
    const destUri = `${vaultDir}vault_${entry.id}.png`;
    await FileSystem.copyAsync({ from: entry.tempUri, to: destUri });
    const finalEntry: VaultEntry = { id: entry.id, uri: destUri, name: entry.name, price: entry.price, potentialProfit: entry.potentialProfit, timestamp: Date.now() };
    setVaultEntries(prev => {
      const next = [finalEntry, ...prev].slice(0, 30);
      AsyncStorage.setItem("EVAN_VAULT_V1", JSON.stringify(next)).catch(() => {});
      return next;
    });
    // Vault fly particle — thumbnail flies from card to profile tab
    vaultFlyKeyRef.current += 1;
    setVaultFly({ key: vaultFlyKeyRef.current, uri: destUri });
    setTimeout(() => setVaultFly(null), 900);
    // Synchronized chime + haptic win burst
    SoundEffect.chime();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  } catch {}
};

const handleOrbPress = () => {
  heartbeatPhaseRef.current = "fast";
  // Single satisfying pulse — the prior triple-tap chain (Success +
  // Heavy + Heavy in 200ms) was the exact "stacked haptics rapidly"
  // pattern the polish pass flags as arcade noise. One verdict-strong
  // pulse routed through the central cooldown is plenty.
  triggerHaptic("verdict-strong");
  setTimeout(() => { heartbeatPhaseRef.current = "slow"; }, 2000);
};

const handlePlAdd = (flip: PLFlip) => {
  setPlFlips((prev) => [flip, ...prev]);
  // Optimistic server sync — UI is already updated, this is background
  if (userId) syncFlipToServer(flip, userId);
};

const handlePlDelete = (id: string) => {
  setPlFlips((prev) => prev.filter((f) => f.id !== id));
  // No server delete endpoint — local removal is sufficient
};

const handlePlMarkSold = (id: string, soldPrice: number) => {
  setPlFlips((prev) => {
    const updated = prev.map((f) =>
      f.id === id
        ? { ...f, soldPrice, soldAt: Date.now() as any, status: "sold" as const }
        : f
    );
    // Fire-and-forget sync — runs after updater returns, not during render
    if (userId && _authJwt) {
      const soldFlip = updated.find((f) => f.id === id);
      if (soldFlip) Promise.resolve().then(() => syncFlipToServer(soldFlip, userId!));
    }
    // ── SITT: Feed realized outcome into MarketTruthService ──────────────
    const flip = updated.find((f) => f.id === id);
    if (flip && flip.soldPrice != null) {
      MarketTruthService.recordOutcome({
        scanId: flip.id,
        boughtPrice: flip.boughtPrice,
        soldPrice: flip.soldPrice,
        platform: flip.platform,
        boughtAt: new Date(flip.date).getTime(),
      }).catch(() => {});
    }
    return updated;
  });
};

// ── Feature 3: Load Local Radar ───────────────────────────────────────────────
const loadRadar = async () => {
  // Hard-disabled — fans /api/radar/local SerpAPI lanes per watched query.
  // No automatic local-radar fetch on tab open / refresh / mount.
  console.log("WATCHLIST_AUTO_SEARCH_BLOCKED", { fn: "loadRadar" });
  return;
  // eslint-disable-next-line no-unreachable
  if (!zipCode || watchlist.length === 0) return;
  const queries = watchlist.map((w) => w.query).filter(Boolean);
  if (!queries.length) return;
  const targetPrices: Record<string, number> = {};
  watchlist.forEach((w) => {
    if (w.query && Number.isFinite(toNumber(w.lastBest))) {
      targetPrices[w.query] = toNumber(w.lastBest);
    }
  });
  const _apiBase = process.env.EXPO_PUBLIC_API_URL ??
    (Platform.OS === "ios" ? "http://192.168.1.227:3001" : "http://10.0.2.2:3001");
  setRadarLoading(true);
  try {
    const resp = await fetch(`${_apiBase}/api/radar/local`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queries, zipCode, targetPrices }),
      signal: abortAfter(35000),
    });
    const json = await resp.json();
    if (json?.ok) setRadarData(json);
  } catch { /* non-fatal */ } finally {
    setRadarLoading(false);
  }
};

// ── Feature 3: Visit Scan handler ────────────────────────────────────────────
const handleVisitScan = (item: any) => {
  // Find the most recent history entry matching this watchlist query
  const q = (item.query || "").toLowerCase();
  const match = (history || []).find((h: any) => {
    if (!h?.resultCard) return false;
    const rq = (h.resultCard.visionQuery || h.resultCard.itemName || "").toLowerCase();
    return rq === q || rq.includes(q) || q.includes(rq);
  });
  if (match?.resultCard) {
    setActiveResult(match.resultCard);
    setResults(match.resultCard.alternatives || []);
    setLoadingResults(false);
    setLoadingPhotoUri(match.uri || null);
    goTab("results");
  } else {
    goTab("camera");
  }
};

useEffect(() => {
  const sub = AppState.addEventListener("change", (next) => {
    const prev = appStateRef.current;
    appStateRef.current = next;

    if (prev === "active" && (next === "inactive" || next === "background")) {
      try { scanAbortRef.current?.abort(); } catch {}
      scanAbortRef.current = null;

      setLoadingResults(false);
      setShowRetryWhileLoading(false);
      setLoadingPhotoUri(null);

      try { retryReveal.setValue(0); } catch {}
      scanLockRef.current = false;

      // 🔥 GOD KILL SWITCH
      try { setScanAnimActive(false); } catch {}
      try { setResultModalOpen(false); } catch {}
      try { setLoadingResults(false); } catch {}
      try { setShowRetryWhileLoading(false); } catch {}
      try { setCinematicFreeze(false); } catch {}
      try { setFreezeFrameUri(null); } catch {}

      try { freezeOpacity?.setValue?.(0); } catch {}
      try { vignetteOpacity?.setValue?.(0); } catch {}

      try {
        if (scanAnimTimerRef.current)
          clearTimeout(scanAnimTimerRef.current);
        scanAnimTimerRef.current = null;
      } catch {}
    }

    // When app comes back to foreground, flush queued offline scans
    if (next === "active" && pendingCount > 0) {
      flushOffline(resolvedApiBase || SAFE_API_BASE).catch(() => {});
    }
  });

  return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [resolvedApiBase]);
  // Torch rule
  useEffect(() => {
    if (tab !== "camera" && torchOn) setTorchOn(false);
  }, [tab, torchOn]);
  // Keyboard listeners
  useEffect(() => {
    const showEvt =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const kbAnim = {
      duration: 280,
      update: { type: LayoutAnimation.Types.keyboard, property: LayoutAnimation.Properties.opacity },
    };
    const showSub = Keyboard.addListener(showEvt, (e) => {
      const h = e?.endCoordinates?.height ?? 0;
      LayoutAnimation.configureNext(kbAnim);
      setKeyboardHeight(h);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => {
      LayoutAnimation.configureNext(kbAnim);
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);


// Barcode scan UI animation
const barcodeLine = useRef(new RNAnimated.Value(0)).current;
const barcodeAck = useRef(new RNAnimated.Value(0)).current;

useEffect(() => {
  // start/stop scan line loop
  try { barcodeLine.stopAnimation(); } catch {}
  barcodeLine.setValue(0);

  if (!barcodeMode) return;

  const loop = RNAnimated.loop(
    RNAnimated.sequence([
      RNAnimated.timing(barcodeLine, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      RNAnimated.timing(barcodeLine, {
        toValue: 0,
        duration: 0,
        useNativeDriver: true,
      }),
    ])
  );
  loop.start();

  return () => {
    try { loop.stop(); } catch {}
  };
}, [barcodeMode, barcodeLine]);

const barcodeLineY = barcodeLine.interpolate({
  inputRange: [0, 1],
  outputRange: [-46, 46],
});

const flashBarcodeAck = () => {
  barcodeAck.setValue(0);
  RNAnimated.sequence([
    RNAnimated.timing(barcodeAck, { toValue: 1, duration: 120, useNativeDriver: true }),
    RNAnimated.timing(barcodeAck, { toValue: 0, duration: 260, useNativeDriver: true }),
  ]).start();
};

// Barcode -> Results pipeline (no backend changes)
const runBarcodeLookup = async (code: string) => {
  if (!code) return;
  if (loadingResults) return;

  if (isFreeLimitReached) {
    requestAnimationFrame(() => setProfileModal("subscription"));
    return;
  }

  const q = String(code).trim();
  if (!q) return;

  setLoadingResults(true);
  setLoadingPhotoUri(null);
  setShowRetryWhileLoading(false);
  setActiveResult(null);
  useEvanBrain.getState().scanStarted(); // Brain: reset deal state + hotSignal for new scan
  setResults([]);
  setSeeMoreListings([]);
  setLastScan(null);
  setResultModalOpen(false);
  setSpatialVerdict(null);  // Clear previous verdict
  setSpatialLaser(true);    // Neon laser ON

  // Direct tab swap — no goTab animation delay, prevents camera flash
  if (tab !== "results") {
    setTab("results");
    setSpatialZone("results" as ZoneKey);
    try { tabFade.setValue?.(1); } catch {}
    tabSwitchingRef.current = false;
    setTabInteractable(true);
  }

  // Feature 6: instant UPC lookup (<1s) — show partial result immediately
  // while market search continues in background
  let barcodeProductTitle: string | null = null;
  let barcodeProductImage: string | null = null;
  try {
    const upcClean = q.replace(/\D/g, "");
    if (upcClean.length >= 8) {
      const barcodeRes = await apiFetch(`/intel/barcode/${upcClean}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }) as any;
      if (barcodeRes?.ok && barcodeRes?.found && barcodeRes?.title) {
        barcodeProductTitle = barcodeRes.title;
        barcodeProductImage = barcodeRes.imageUrl || null;
        // Show instant partial card so user sees something in <1s
        setActiveResult({
          itemName: barcodeRes.title,
          store: barcodeRes.brand || "UPC Lookup",
          price: barcodeRes.msrp || null,
          image: barcodeRes.imageUrl || null,
          buyLink: null,
          visionConfidence: 0.95,
          buyVerdict: "LOOKING UP…",
          __barcodePartial: true,
        });
      }
    }
  } catch { /* non-fatal — continue to full market search */ }

  // Feature 6: use product title from UPC lookup as the market search query
  const marketQuery = barcodeProductTitle || q;

  const controller = new AbortController();
  const marketTimer = setTimeout(() => controller.abort(), 12000);

  try {
    const serpRes = await Promise.allSettled([
 searchSerp(marketQuery, controller.signal, buildVisionVariants(marketQuery)),
]);

const serpRaw =
  serpRes[0]?.status === "fulfilled" ? serpRes[0].value : [];

const ebayRaw: any[] = []; // handled inside /market/search

    let combined = [
      ...normalizeListings(ebayRaw, "ebay", "eBay", marketQuery),
      ...normalizeListings(serpRaw, "serp", "Google", marketQuery),
    ]
      .map((i) => {
        const price = parseMoney(i?.price);
        const shipping = parseMoney(i?.shipping);
        const total =
          Number.isFinite(price)
            ? Number.isFinite(shipping)
              ? price + shipping
              : price
            : NaN;
        return {
          ...i,
          numericPrice: price,
          numericShip: shipping,
          numericTotal: total,
          __titleNorm: String(i?.title || "").toLowerCase().replace(/\s+/g, " ").trim(),
        };
      })
      .filter((i) => Number.isFinite(i.numericTotal))
      .sort((a, b) => a.numericTotal - b.numericTotal);

    // dedupe spam
    const seen = new Set<string>();
    const deduped: any[] = [];
    for (const it of combined) {
      const key = String(it?.url || "") || `${it.__titleNorm}|${it.numericTotal}|${it?.source || ""}`;
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(it);
    }


combined = deduped
  .map((item) => {
    const score = neuralMatchScore(
      item,
      marketQuery,
      0.75
    );

    return {
      ...item,
      __neuralScore: score,
    };
  })
  .sort((a, b) => {
    if (b.__neuralScore !== a.__neuralScore) {
      return b.__neuralScore - a.__neuralScore;
    }

    const ap = a.numericTotal ?? a.price ?? Infinity;
    const bp = b.numericTotal ?? b.price ?? Infinity;

    return ap - bp;
  });

// Barcode flow has no user-entered scannedPrice, so do NOT cap by a price ceiling here.
const cappedCombined = combined;

const filtered = cappedCombined.filter((item) => {
  const score = neuralMatchScore(item, marketQuery, 0.75);
  return score >= 0.35;
});

const ranked = filtered.length ? filtered : cappedCombined;

const top3 = ranked.slice(0, 3);

setSeeMoreListings(cappedCombined.slice(0, 60));

    if (!top3.length) {
      showUiError("No barcode matches", "Try moving closer, or scan the front of the package instead.");
      stopLoadingSafely();
      return;
    }

    const cheapest = top3[0];
    const cheapestPrice = toNumber(cheapest.totalPrice ?? cheapest.price);

    const spread = getMarketSpread(combined);
    const marketPrice = spread?.avg ?? cheapestPrice;
    const stats = buildMarketStats(marketPrice);

    const insights = computeInsights({
      scannedPrice: cheapestPrice, // barcode has no “paying” input; keep it neutral
      cheapestPrice,
      avgMarket: stats.avgMarket ?? marketPrice,
      low: spread?.low ?? stats.historicalLow,
      high: spread?.high ?? stats.historicalHigh,
      confidence: 0.75,
      totalMatches: combined.length,
      url: cheapest.url,
      historyPoints: [],
    });


    const card = {
      photoUri: barcodeProductImage || null,
      itemName: cheapest.title || barcodeProductTitle || `Barcode ${q}`,
      store: cheapest.source || "Marketplace",
      price: cheapestPrice,
      buyLink: cheapest.url,
      image: cheapest.image || null,
      // 🧠 AI VERDICT (FINAL ADD #1)
aiVerdict:
  combined.length >= 8
    ? "STRONG BARCODE MATCH — multiple listings confirmed"
    : combined.length >= 3
    ? "FAIR PRICE — barcode match looks valid"
    : "LIMITED MARKET DATA — review before buying",

intuitionLine: buildIntuitionLine({
  cheaperPct: insights?.savingsPct,
  flipPotential: flipScore({
    scannedPrice: cheapestPrice,
    cheapestPrice,
    estimatedResale: stats?.estimatedResale,
  }),
  totalMatches: combined?.length,
  confidence: 0.75,
}),

      scannedPrice: cheapestPrice,
      savedAmount: 0,
      cheaperPct: 0,
      alreadyCheaperBy: 0,

      visionConfidence: 0.75,
      visionQuery: q,

      alternatives: top3,
      historicalLow: stats.historicalLow,
      historicalHigh: stats.historicalHigh,
      avgMarket: stats.avgMarket,
      estimatedResale: stats.estimatedResale,
      flipPotential: flipScore({ scannedPrice: cheapestPrice, cheapestPrice, estimatedResale: stats.estimatedResale }),
      totalMatches: combined.length,
      category: inferCategory(cheapest.title || q),
      ...insights,

      scanWhy: ["Barcode detected", "Market search matched barcode", "Ranked by total price (price + shipping)"],
      rankWhy: ["Cheapest total price", "Deduped spam listings", "Cross-market sweep"],
    };

    // count scan once
    if (!scanLockRef.current) {
      scanLockRef.current = true;
      setScansUsed((prev) => prev + 1);
      setHistory((prev) => [
        {
          id: `${Date.now()}`,
          uri: null,
          title: card.itemName || "Barcode scan",
          timestamp: new Date().toLocaleString(),
          resultCard: card,
        },
        ...prev,
      ]);
      setTimeout(() => {
        scanLockRef.current = false;
      }, 400);
    }

    setResults(top3);
    setActiveResult(card);
    // Spatial FX: BUY → buy lighting, PASS → pass lighting, HOLD → neutral.
    try {
      const v = String(card?.buyVerdict || "").toUpperCase();
      setSpatialVerdict(v === "BUY" ? "buy" : v === "PASS" ? "pass" : null);
    } catch {}
    try {
  const acb = Number(card?.alreadyCheaperBy || 0);
  if (Number.isFinite(acb) && acb > 0.01) {
    setPriceChangeBanner(`✅ You’re already cheaper than the market by ${money(acb)}`);
  } else {
    setPriceChangeBanner(null);
  }
} catch {
  setPriceChangeBanner(null);
}
    RNAnimated.sequence([
  RNAnimated.timing(confidenceAura, {
    toValue: 1,
    duration: 400,
    useNativeDriver: true,
  }),
  RNAnimated.timing(confidenceAura, {
    toValue: 0,
    duration: 1200,
    useNativeDriver: true,
  }),
]).start();

    setLastScan({ kind: "barcode", confidence: 0.75, query: q, results: top3 });

    stopLoadingSafely();
  } catch (_e: any) {
    showUiError("Barcode scan failed", "Couldn’t reach marketplaces. Try again.");
    stopLoadingSafely();
  } finally {
    clearTimeout(marketTimer);
  }
};

const onBarcodeScanned = ({ data }: any) => {
  if (!barcodeMode) return;
  if (barcodeLockRef.current) return;

  barcodeLockRef.current = true;

  const code = String(data || "").trim();
  if (!code) {
    barcodeLockRef.current = false;
    return;
  }

  setLastBarcode(code);
  flashBarcodeAck();
  hapticSoftSnap?.();

  // keep barcode mode ON until we kick results (feels intentional)
  setTimeout(() => {
    setBarcodeMode(false);
    runBarcodeLookup(code);
    setTimeout(() => {
      barcodeLockRef.current = false;
    }, 600);
  }, 140);
};


// Hard gate for paywall — used by every scan-entry point (shutter,
// "Use Photo", batch, replay). Aborts any in-flight work, clears the
// loading UI so the user sees the paywall on a clean surface (not
// overlaid on a half-running scan), and surfaces the paywall.
const bailScanForPaywall = (origin: string) => {
  try { scanAbortRef.current?.abort(); } catch {}
  scanAbortRef.current = null;
  scanLockRef.current = false;
  try { setIsCapturing(false); } catch {}
  try { setLoadingResults(false); } catch {}
  try { setShowRetryWhileLoading(false); } catch {}
  try { setLoadingPhotoUri(null); } catch {}
  try { scanSessionRef.current = null; } catch {}
  try { trackEvent?.("scan_blocked_by_paywall", { origin }); } catch {}
  requestAnimationFrame(() => {
    try { useEvanBrain.getState().showLimitPaywall(); } catch {}
  });
};

// Charge one free scan. Used by every non-runScan code path that talks
// to the AI/market endpoints directly (receipt analyzer, inline batch
// processor, BatchScanScreen). Bumps the client counter immediately so
// subsequent gates see the new value within the same JS turn, and best-
// efforts /api/scan/consume so the server-side budget persists across
// app launches. Pro users skip the server call (no per-scan accounting).
const consumeFreeScan = (origin: string) => {
  setScansUsed((prev) => {
    const next = prev + 1;
    console.log("SCAN_LIMIT_CONSUMED", { origin, scansUsed: next });
    return next;
  });
  if (isPro) return;
  try {
    const apiBase = process.env.EXPO_PUBLIC_API_URL ??
      (Platform.OS === "ios" ? "http://192.168.1.227:3001" : "http://10.0.2.2:3001");
    const effectiveId = userId || guestId || installId;
    fetch(`${apiBase}/api/scan/consume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(userId ? { userId } : { guestId: effectiveId }),
        imageHash: `${origin}_${Date.now()}`,
      }),
    }).then(r => r.json()).then(data => {
      if (data?.resetAt) setScanResetAt(data.resetAt);
      if (data?.scansUsed != null) setScansUsed(data.scansUsed);
    }).catch(() => {});
  } catch {}
};

const takePhoto = async () => {

  // HARD GUARD: prevents double-tap duplication + freezes
  if (isCapturing || scanLockRef.current) return;

  if (!cameraRef.current) return;

  // Tutorial gate. While the interactive tutorial is up, the shutter is
  // visually highlighted (ripple, spotlight, ring) to teach the user
  // where to tap — but it must NOT actually capture or burn a free
  // scan. If the user taps it on the shutter-introduction step,
  // advance the tutorial; otherwise no-op silently so accidental taps
  // through the spotlight don't initiate a scan.
  if (showITutorial) {
    try { Haptics.selectionAsync(); } catch {}
    const stepIdx = iTutStep;
    const step = I_STEPS[Math.min(stepIdx, I_STEPS.length - 1)];
    const isShutterStep =
      !!step?.spotlight &&
      Math.abs(step.spotlight.x + step.spotlight.w / 2 - SW / 2) < 80 &&
      step.spotlight.y > SH * 0.5;
    if (isShutterStep && stepIdx + 1 < I_STEPS.length) {
      goToITutStep(stepIdx + 1);
    }
    return;
  }

  // Paywall preempts every scan path. If the local limit has been hit,
  // the shutter must not capture, animate, or initiate any work — show
  // the paywall and return immediately. Same gate is re-checked in
  // handleUsePhoto and runScan so no later async path can bypass it.
  if (isFreeLimitReached) {
    bailScanForPaywall("shutter");
    return;
  }

triggerCinematicScan();

  // 🔒 LOCK UI IMMEDIATELY
  scanLockRef.current = true;
  setIsCapturing(true);
  
hapticSelect?.();

RNAnimated.timing(neuralPulse, {
  toValue: 1,
  duration: 120,
  useNativeDriver: true,
}).start(() => {
  RNAnimated.timing(neuralPulse, {
    toValue: 0,
    duration: 220,
    useNativeDriver: true,
  }).start();
});
  hideZoomHud();

  // HAPTIC (premium, subtle)
  hapticSoftSnap();

  // ripple + ring burst
  triggerRipple();
  try {
    ringOpacity.setValue(1);
    ringScale.setValue(0.92);
    RNAnimated.parallel([
      RNAnimated.timing(ringScale, {
        toValue: 1.22,
        duration: 260,
        useNativeDriver: true,
      }),
      RNAnimated.timing(ringOpacity, {
        toValue: 0,
        duration: 320,
        useNativeDriver: true,
      }),
    ]).start();
  } catch {}

  playSnapRing();

RNAnimated.parallel([
  RNAnimated.sequence([
    RNAnimated.timing(snapScale, {
      toValue: 0.94,
      duration: 60,
      useNativeDriver: true,
    }),
    RNAnimated.timing(snapScale, {
      toValue: 1,
      duration: 90,
      useNativeDriver: true,
    }),
  ]),
  RNAnimated.sequence([
    RNAnimated.timing(snapDepth, {
      toValue: 1,
      duration: 120,
      useNativeDriver: true,
    }),
    RNAnimated.timing(snapDepth, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }),
  ]),
]).start();

const pic = await cameraRef.current.takePictureAsync({
  quality: 0.92,
  skipProcessing: Platform.OS === "android",
});

setFreezeFrameUri(pic?.uri || null);
trackEvent("photo_captured", { cameraFacing });

// ── Feature 3: Receipt mode → send to receipt analyzer ──────────────────────
// A receipt analysis costs one free scan, same as a regular product scan.
// The shutter-level isFreeLimitReached check above blocks new captures at
// the limit; the explicit re-check + increment below guarantees that even
// if the gate is somehow stale (rapid double-tap, async drift), we don't
// run the analyzer for free. The scansUsed bump only fires after a
// successful response so a true network failure isn't punished.
if (receiptMode) {
  if (isFreeLimitReached) {
    setIsCapturing(false);
    scanLockRef.current = false;
    bailScanForPaywall("receipt_shutter");
    return;
  }
  setIsCapturing(false);
  scanLockRef.current = false;
  setReceiptLoading(true);
  setReceiptData(null);
  setReceiptError(null);
  setReceiptPanelOpen(true);
  // compress to base64 for upload
  try {
    const compressed = await ImageManipulator.manipulateAsync(
      pic.uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    const b64 = compressed.base64;
    if (!b64) throw new Error("no base64");
    const apiBase = process.env.EXPO_PUBLIC_API_URL ??
      (Platform.OS === "ios" ? "http://192.168.1.227:3001" : "http://10.0.2.2:3001");
    const resp = await fetch(`${apiBase}/api/receipt/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: b64 }),
      signal: abortAfter(45000),
    });
    const json = await resp.json();
    if (json?.ok) {
      setReceiptData(json);
      // Successful receipt analysis = 1 free scan consumed. Both client
      // and server counters are bumped so a fresh app launch can't undo
      // the charge by re-reading /api/scan/status.
      consumeFreeScan("receipt");
    } else {
      setReceiptError(json?.error || "Receipt analysis failed — try a clearer photo");
    }
  } catch (err: any) {
    setReceiptError(err?.message?.includes("timeout") ? "Timed out — try a clearer photo" : "Could not analyze receipt");
  } finally {
    setReceiptLoading(false);
  }
  return;
}

// ── Feature 2: Batch mode → queue this photo for auto-processing ─────────────
// The shutter already bails on isFreeLimitReached above, so the queue can
// only be appended to while the user has budget remaining at TAP time.
// The bypass risk here was that queued items processed AFTER the limit
// was reached would still run for free. processBatchItem (the auto-
// processor below) now gates per-item against isFreeLimitReached and
// increments scansUsed on success, closing that hole.
if (batchMode) {
  if (isFreeLimitReached) {
    setIsCapturing(false);
    scanLockRef.current = false;
    bailScanForPaywall("batch_shutter");
    return;
  }
  const job: BatchJob = {
    id: makeId(),
    uri: pic.uri,
    createdAt: Date.now(),
    status: "queued",
  };
  setBatchQueue((prev) => {
    const next = [...prev, job].slice(-40);
    saveBatchQueue(next);
    return next;
  });
  setBatchCount((c) => c + 1);
  setIsCapturing(false);
  scanLockRef.current = false;
  return; // don't fall through to regular scan preview
}

  setRefinePhotos((prev) => [...prev, { uri: pic.uri }]);
  setPhoto(pic);
  setScanPriceInput("");
  setPriceSubmitted(false);

  // Clear any prior scan result the moment a new photo is captured.
  // Without this, the result card from the last scan can bleed through
  // until handleUsePhoto fires, which reads as "it scanned instantly"
  // even though the new scan hasn't started.
  setActiveResult(null);
  setResults([]);
  setResultModalOpen(false);

  setIsCapturing(false);
  scanLockRef.current = false;
};

const closeAllOverlays = () => {
  setProfileModal(null);
  setAuthModalOpen(false);
  setHelpOpen(false);
  useEvanBrain.getState().hidePaywall();
  setResultModalOpen(false);
  setSeeMoreOpen(false);
  setHaggleOpen(false);
  setFreePassInfoOpen(false);
  setSplashInfoOpen(false);
  setUnverifiedPrompt(null);
  setReferralInfoExpanded(false);
  setInventoryOpen(false);
  setBatchOpen(false);
  setCloudImportOpen(false);
  setWelcomeBackOpen(false);
  setProfitCalcOpen(false);

  setZoomUri(null);
  setPreviewImageUri(null);

};

  // ZOOM (stable)
  // -------------------------
  const zoom = useSharedValue(0);
  const zoomStart = useSharedValue(0);
  const cameraAnimatedProps = useAnimatedProps(() => ({ zoom: zoom.value }));
  const snapZoomWorklet = () => {
    "worklet";
    const targets = [0, 0.5, 1];
    let best = targets[0];
    for (let i = 1; i < targets.length; i++) {
      if (Math.abs(targets[i] - zoom.value) < Math.abs(best - zoom.value)) {
        best = targets[i];
      }
    }
    zoom.value = withTiming(best, { duration: 140 });
  };
  const zoomHudOpacity = useRef(new RNAnimated.Value(0)).current;
  const zoomHudY = useRef(new RNAnimated.Value(8)).current;
  const zoomHudTimer = useRef(null);
  const [_zoomHudText, setZoomHudText] = useState("1.0×");
  const hideZoomHud = () => {
    if (zoomHudTimer.current) clearTimeout(zoomHudTimer.current);
    zoomHudTimer.current = null;
    RNAnimated.parallel([
      RNAnimated.timing(zoomHudOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      RNAnimated.timing(zoomHudY, {
        toValue: 8,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  };
  const showZoomHud = (text) => {
    if (photo || cameraFacing !== "back") return;
    if (zoomHudTimer.current) clearTimeout(zoomHudTimer.current);
    setZoomHudText(text);
    zoomHudOpacity.setValue(0);
    zoomHudY.setValue(8);
    RNAnimated.parallel([
      RNAnimated.timing(zoomHudOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      RNAnimated.timing(zoomHudY, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      zoomHudTimer.current = setTimeout(hideZoomHud, 1400);
    });
  };
  const _setZoomLevel = (level) => {
    if (!photo && cameraFacing === "back") hapticSelect();
    const map = { 1: 0, 2: 0.5, 3: 1 };
    const z = map[level] ?? 0;
    zoom.value = withTiming(z, { duration: 140 });
    showZoomHud(`${(1 + z * 2).toFixed(1)}×`);
  };
  const pinch = Gesture.Pinch()
    .enabled(!photo && cameraFacing === "back")
    .onBegin(() => {
      zoomStart.value = zoom.value;
    })
    .onUpdate((e) => {
      zoom.value = clamp(zoomStart.value * e.scale, 0, 1);
    })
    .onEnd(snapZoomWorklet);
  useEffect(() => {
    if (photo) hideZoomHud();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [photo]);
  useEffect(() => {
    if (tab !== "camera") hideZoomHud();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [tab]);
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (flashMaskTimer.current) clearTimeout(flashMaskTimer.current);
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (flashMidTimer.current) clearTimeout(flashMidTimer.current);
      if (zoomHudTimer.current) clearTimeout(zoomHudTimer.current);
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (flipTimer.current) clearTimeout(flipTimer.current);
      if (scanAnimTimerRef.current) clearTimeout(scanAnimTimerRef.current);
      if (scanAbortRef.current) scanAbortRef.current.abort();
      // safety: remove splash listener if somehow still attached
      try {
        if (splashDotsListenerIdRef.current != null) {
          splashDots.removeListener(splashDotsListenerIdRef.current);
          splashDotsListenerIdRef.current = null;
        }
} catch (_e) {}
    };
  }, [splashDots]);
// -------------------------
// ✅ SIMPLE IN-MEMORY CACHES
// -------------------------
const VISION_CACHE = useRef(new Map()).current;
const _SERP_CACHE = useRef(new Map()).current;
const MARKET_CACHE = useRef(new Map()).current;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const isFresh = (entry) =>
  entry && Date.now() - entry.ts < CACHE_TTL_MS;
// ✅ Stronger cache key: uses file hash when available
const getImageCacheKey = async (uri) => {
  try {
    const info = (await FileSystem.getInfoAsync(uri, { md5: true } as any)) as any;

    const md5 = info?.exists ? info.md5 || "" : "";
    const size = info?.exists ? info.size ?? 0 : 0;
    const mt = info?.exists ? info.modificationTime ?? 0 : 0;
    // If md5 exists, it's the best dedupe key
    if (md5) return `md5:${md5}`;
    // Fallback if md5 not available
    return `${uri}|${size}|${mt}`;
  } catch {
    return uri;
  }
};
const withTimeout = (ms, controller) => {
  const t = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(t),
  };
};
// -------------------------
// Scoring helper (required)
// -------------------------
const _confidenceWeightedScore = (price, confidence) => {
  if (!Number.isFinite(price)) return Infinity;
  const c = Math.max(0, Math.min(1, Number(confidence) || 0));
  // lower confidence => slightly penalize "too-good-to-be-true" low prices
  return price * (1 + (1 - c) * 0.15);
};

  // -------------------------
  // Helpers
  // -------------------------
const analyzePhotoToQuery = async (photoUri, signal, originalPrice?: number | null, cheapestAlt?: number | null, itemHint?: string | null) => {
  if (!photoUri || typeof photoUri !== "string") {
    console.warn("analyzePhotoToQuery invalid photoUri");
    return;
  }
  // Prepare image FIRST so cache is image-accurate
  let preparedUri = photoUri;
  try {
    preparedUri = await prepareImage(photoUri);
  } catch {
    preparedUri = photoUri;
  }
  const imageKey = await getImageCacheKey(preparedUri);
  const cacheKey = `${scanMode}|${imageKey}`;
const cached = VISION_CACHE.get(cacheKey);
if (cached && isFresh(cached)) {
  console.log("🧠 VISION CACHE HIT");
  return {
    query: cached.query,
    variants: Array.isArray(cached.variants) ? cached.variants : [],
    confidence: cached.confidence,
    visionIdentity: cached.visionIdentity || null,
  };
}

  // Build multipart ONCE
  const makeForm = () => {
    const form = new FormData();
    form.append("mode", scanMode);
    const effectiveUserId = userId || installId;
    if (effectiveUserId) form.append("userId", effectiveUserId);
    if (scanMode === SCAN_MODES.PROP && propContext.trim()) {
      form.append("propContext", sanitizePropContext(propContext));
    }
    if (Number.isFinite(originalPrice) && (originalPrice as number) > 0) {
      form.append("originalPrice", String(originalPrice));
    }
    if (Number.isFinite(cheapestAlt) && (cheapestAlt as number) > 0) {
      form.append("cheapestAlternative", String(cheapestAlt));
    }
    if (itemHint && itemHint.trim()) {
      form.append("itemHint", sanitizeHint(itemHint));
    }

const uploadName = preparedUri.split("/").pop() || "scan.jpg";

form.append(
  "image",
  {
    uri: preparedUri,
    name: uploadName,
    type: "image/jpeg",
  } as any
);

    return form;
  };

const endpoints = ["/api/vision/analyze"];
let lastStatus: number | null = null;

for (const rawBase of API_BASE_CANDIDATES) {
  const base = String(rawBase || "").replace(/\/+$/, "");

  try {
    // Skip health check if this base was confirmed alive recently
    const skipHealth = base === _healthBase && Date.now() - _healthOkMs < HEALTH_CACHE_TTL;

    if (!skipHealth) {
      const healthRes = await fetch(`${base}/health`, {
        method: "GET",
        signal,
      });

      lastStatus = healthRes.status;

      if (!healthRes.ok) continue;

      const healthText = await healthRes.text();

      let healthJson: any = null;
      try {
        healthJson = healthText ? JSON.parse(healthText) : null;
      } catch {
        healthJson = null;
      }

      if (healthJson?.ok === false) continue;
    }

    for (const ep of endpoints) {
      const cleanEp = String(ep || "").startsWith("/") ? ep : `/${ep}`;

      try {
const form = makeForm();

const effectiveUid = _clientId || userId || installId;
const res = await fetch(`${base}${cleanEp}`, {
  method: "POST",
  body: form,
  signal,
  headers: effectiveUid ? { "x-user-id": effectiveUid } : {},
});

        lastStatus = res.status;

        if (!res.ok) continue;

        const text = await res.text();

        let data: any = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          console.warn("Vision returned non-JSON:", text?.slice?.(0, 200));
          continue;
        }

        const q =
          typeof data?.query === "string" ? data.query :
          typeof data?.result?.query === "string" ? data.result.query :
          typeof data?.data?.query === "string" ? data.data.query :
          typeof data?.analysis?.query === "string" ? data.analysis.query :
          typeof data?.label === "string" ? data.label :
          typeof data?.result?.label === "string" ? data.result.label :
          typeof data?.data?.label === "string" ? data.data.label :
          typeof data?.analysis?.label === "string" ? data.analysis.label :
          typeof data?.title === "string" ? data.title :
          typeof data?.name === "string" ? data.name :
          typeof data?.item === "string" ? data.item :
          typeof data?.analysis?.item === "string" ? data.analysis.item :
          typeof data?.result?.item === "string" ? data.result.item :
          typeof data?.data?.item === "string" ? data.data.item :
          typeof data?.product === "string" ? data.product :
          typeof data?.analysis?.product === "string" ? data.analysis.product :
          typeof data?.result?.product === "string" ? data.result.product :
          typeof data?.data?.product === "string" ? data.data.product :
          typeof data?.output_text === "string" ? data.output_text :
          typeof data?.text === "string" ? data.text :
          null;

        const c =
          typeof data?.confidence === "number" ? data.confidence :
          typeof data?.result?.confidence === "number" ? data.result.confidence :
          typeof data?.data?.confidence === "number" ? data.data.confidence :
          typeof data?.analysis?.confidence === "number" ? data.analysis.confidence :
          0;

        const fallbackQuery =
          typeof data === "string" ? data :
          typeof data?.message === "string" ? data.message :
          typeof data?.result === "string" ? data.result :
          typeof data?.data === "string" ? data.data :
          typeof data?.analysis === "string" ? data.analysis :
          typeof data?.output_text === "string" ? data.output_text :
          typeof data?.text === "string" ? data.text :
          Array.isArray(data?.choices) &&
          typeof data.choices?.[0]?.message?.content === "string"
            ? data.choices[0].message.content
            : null;

        const finalQuery =
          q && String(q).trim()
            ? String(q).trim()
            : fallbackQuery && String(fallbackQuery).trim()
            ? String(fallbackQuery).trim()
            : null;

        const rawVariants =
          Array.isArray(data?.variants) ? data.variants :
          Array.isArray(data?.result?.variants) ? data.result.variants :
          Array.isArray(data?.data?.variants) ? data.data.variants :
          Array.isArray(data?.analysis?.variants) ? data.analysis.variants :
          [];

        const finalVariants = [...new Set(
          rawVariants
            .map((x: any) => String(x || "").trim().toLowerCase())
            .filter(Boolean)
        )].slice(0, 3);

let finalConfidence =
  Number.isFinite(c) ? smoothConfidence(Number(c)) : 0;

if (finalConfidence > 0.75) {
  finalConfidence = Math.min(0.98, finalConfidence + 0.05);
}

if (finalQuery) {
  const rawIdentity =
    data?.identity ||
    data?.result?.identity ||
    data?.data?.identity ||
    data?.analysis?.identity ||
    null;

  const payload = {
    query: finalQuery,
    variants: finalVariants,
    confidence: finalConfidence,
    visionIdentity: rawIdentity || null,
  };

  VISION_CACHE.set(cacheKey, {
    ts: Date.now(),
    query: payload.query,
    variants: payload.variants,
    confidence: payload.confidence,
    visionIdentity: payload.visionIdentity,
  });

  setResolvedApiBase(base);
  // Cache successful base so next scan skips health check
  _healthBase = base;
  _healthOkMs = Date.now();
  // Persist last confirmed query for speculative market pre-fire on next scan
  if (payload.query) _lastVisionQueryRef.current = payload.query;

  devLog("RUNSCAN VISION QUERY →", payload.query);
  devLog("RUNSCAN VISION CONFIDENCE →", payload.confidence);
  devLog("RUNSCAN VISION SOURCE →", data?.visionSource || "openai");

  const enrichedVariants = [
    payload.query,
    ...payload.variants,
    `${payload.query} authentic`,
    `${payload.query} original`,
    `${payload.query} brand`,
    `${payload.query} product`,
  ];

  return {
    query: payload.query,
    variants: [...new Set(enrichedVariants)].slice(0, 6),
    confidence: payload.confidence,
    visionIdentity: payload.visionIdentity,
  };
}

        console.warn("Vision returned 200 but no usable query:", data);
        console.warn("Vision raw text:", text);
      } catch (e: any) {
        if (e?.name === "AbortError") throw e;
        console.warn("Vision endpoint failed:", `${base}${cleanEp}`, e);
      }
    }
  } catch (e: any) {
    if (e?.name === "AbortError") throw e;
    console.warn("Vision base failed:", base, e);
  }
}

console.warn("Vision failed on all endpoints. Last status:", lastStatus);
return { query: null, variants: [], confidence: 0, _lastStatus: lastStatus };
};

// helpers moved to module scope (do not redfine in app)
  const _pickCheapest = (arr) => {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    let best = null;
    let bestP = null;
    for (const item of arr) {
      const p = toNumber(item?.price);
      if (p == null) continue;
      if (!best || (bestP != null && p < bestP) || bestP == null) {
        best = item;
        bestP = p;
      }
    }
    return best;
  };

  const buildMarketStats = (marketPrice) => {
    if (!Number.isFinite(marketPrice)) {
      return {
        historicalLow: null,
        historicalHigh: null,
        avgMarket: null,
        estimatedResale: null,
      };
    }
    const historicalLow = marketPrice * 0.85;
    const historicalHigh = marketPrice * 1.18;
    const avgMarket = marketPrice * 1.05;
    const estimatedResale = avgMarket * 0.9;
    return { historicalLow, historicalHigh, avgMarket, estimatedResale };
  };

const buildRealMarketIntel = (items = [], scannedPrice?: number | null) => {
  const prices = (items || [])
    .map((x) => toNumber(x?.totalPrice ?? x?.numericTotal ?? x?.price))
    .filter((x) => Number.isFinite(x))
    .sort((a, b) => a - b);

  if (!prices.length) {
    return {
      historicalLow: null,
      historicalHigh: null,
      avgMarket: null,
      estimatedResale: null,
      medianMarket: null,
      expectedProfit: null,
      liquidity: "Low",
      sellThroughDays: null,
      flipScoreValue: null,
    };
  }

  const low = prices[0];
  const high = prices[prices.length - 1];
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const median = prices[Math.floor(prices.length / 2)];

  const estimatedResale = median;
  const expectedProfit =
    Number.isFinite(scannedPrice as number) && Number.isFinite(estimatedResale)
      ? estimatedResale - Number(scannedPrice)
      : null;

  const count = prices.length;

  let liquidity = "Low";
  let sellThroughDays = 30;

  if (count >= 40) {
    liquidity = "Very High";
    sellThroughDays = 5;
  } else if (count >= 20) {
    liquidity = "High";
    sellThroughDays = 9;
  } else if (count >= 10) {
    liquidity = "Medium";
    sellThroughDays = 14;
  } else {
    liquidity = "Low";
    sellThroughDays = 24;
  }

  const flipScoreValue =
    Number.isFinite(expectedProfit as number) && estimatedResale > 0
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(
              ((Number(expectedProfit) / Number(estimatedResale)) * 100) +
                Math.min(count, 25)
            )
          )
        )
      : null;

  return {
    historicalLow: low,
    historicalHigh: high,
    avgMarket: avg,
    estimatedResale,
    medianMarket: median,
    expectedProfit,
    liquidity,
    sellThroughDays,
    flipScoreValue,
  };
};

  const flipScore = ({ scannedPrice, cheapestPrice, estimatedResale }) => {
    if (!Number.isFinite(scannedPrice) || !Number.isFinite(cheapestPrice))
      return "—";
    const cheaperPct = ((scannedPrice - cheapestPrice) / scannedPrice) * 100;
    const resaleEdge =
      Number.isFinite(estimatedResale) && estimatedResale > cheapestPrice * 1.15;
    if (cheaperPct >= 30 && resaleEdge) return "A";
    if (cheaperPct >= 20) return "B";
    if (cheaperPct >= 10) return "C";
    return "D";
  };
const getMarketSpread = (items = []) => {
  const prices = (items || [])
    .map((i) => toNumber(i?.price ?? i?.numericPrice))
    .filter((p) => Number.isFinite(p));
  if (prices.length === 0) return null;
  return {
    low: Math.min(...prices),
    high: Math.max(...prices),
    avg: prices.reduce((a, b) => a + b, 0) / prices.length,
  };
};

// -------------------------
// NEURAL TITLE MATCH ENGINE
// dramatically improves item accuracy
// -------------------------

const normalizeText = (s = "") =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenScore = (query = "", title = "") => {
  const q = normalizeText(query).split(" ").filter(Boolean);
  const t = normalizeText(title).split(" ").filter(Boolean);

  if (!q.length || !t.length) return 0;

  let score = 0;

  for (const word of q) {
    if (t.includes(word)) score += 1;
  }

  return score / q.length;
};

const neuralMatchScore = (item, query, confidence = 0.7) => {
  const title = item?.title || "";
  const price = toNumber(item?.numericTotal ?? item?.price);

  const token = tokenScore(query, title);

  const pricePenalty =
    Number.isFinite(price) && price < 3 ? 0.2 : 0;

  const confBoost = confidence * 0.25;

  const score = token + confBoost - pricePenalty;

  return score;
};

// -------------------------
// LISTING QUALITY ENGINE
// improves scan reliability + result quality
// -------------------------

const looksBadListing = (title: string, query: string = "") => {
  const t = String(title || "").toLowerCase();
  const q = String(query || "").toLowerCase();

  if (t.includes("for parts")) return true;
  if (t.includes("repair")) return true;
  if (t.includes("broken")) return true;
  if (t.includes("lot of")) return true;
  if (t.includes("bundle")) return true;
  if (t.includes("case only")) return true;
  if (t.includes("box only")) return true;

  const queryIsEyewear =
    q.includes("glasses") ||
    q.includes("eyewear") ||
    q.includes("frames") ||
    q.includes("lens") ||
    q.includes("sunglasses");

  const queryWantsSun =
    q.includes("sunglasses") ||
    q.includes("uv400") ||
    q.includes("polarized");

  const queryWantsBlue =
    q.includes("blue light") ||
    q.includes("blue-light") ||
    q.includes("computer") ||
    q.includes("gaming") ||
    q.includes("block blue") ||
    q.includes("screen");

  const queryIsSafety =
    q.includes("safety") ||
    q.includes("protective") ||
    q.includes("forensic") ||
    q.includes("lab");

  if (!queryIsSafety) {
    if (t.includes("safety glasses")) return true;
    if (t.includes("protective glasses")) return true;
    if (t.includes("forensic glasses")) return true;
    if (t.includes("shooting glasses")) return true;
    if (t.includes("industrial glasses")) return true;
    if (t.includes("lab glasses")) return true;
    if (t.includes("ballistic glasses")) return true;
    if (t.includes("work glasses")) return true;
  }

  if (queryIsEyewear && !queryWantsSun) {
    const titleLooksBlue =
      t.includes("blue light") ||
      t.includes("blue-light") ||
      t.includes("computer") ||
      t.includes("gaming") ||
      t.includes("block blue") ||
      t.includes("screen");

    if (t.includes("sunglasses") && !titleLooksBlue) return true;
    if (t.includes("polarized") && !titleLooksBlue) return true;
    if (t.includes("uv400") && !titleLooksBlue) return true;
    if (t.includes("sports sunglasses")) return true;
    if (t.includes("cycling glasses")) return true;
    if (t.includes("driving glasses") && !titleLooksBlue) return true;
    if (t.includes("fishing glasses")) return true;
    if (t.includes("outdoor glasses")) return true;
  }

  if (queryWantsBlue) {
    const titleLooksBlue =
      t.includes("blue light") ||
      t.includes("blue-light") ||
      t.includes("computer") ||
      t.includes("gaming") ||
      t.includes("block blue") ||
      t.includes("screen");

    if (
      (t.includes("sunglasses") ||
        t.includes("polarized") ||
        t.includes("uv400")) &&
      !titleLooksBlue
    ) {
      return true;
    }
  }

  return false;
};

const qualityFilterListings = (items: any[], query: string) => {
  if (!Array.isArray(items)) return [];

  const qNorm = normalizeTitle(query);
  if (!qNorm) return items.slice(0, 20);

  const eyewearMode =
    qNorm.includes("glasses") ||
    qNorm.includes("eyewear") ||
    qNorm.includes("sunglasses") ||
    qNorm.includes("frames") ||
    qNorm.includes("lens");

  const wantsOrange =
    qNorm.includes("orange") ||
    qNorm.includes("amber") ||
    qNorm.includes("yellow");

  const wantsBlue =
    qNorm.includes("blue light") ||
    qNorm.includes("blue-light") ||
    qNorm.includes("computer") ||
    qNorm.includes("gaming") ||
    qNorm.includes("block blue") ||
    qNorm.includes("screen");

  const wantsSun =
    qNorm.includes("sunglasses") ||
    qNorm.includes("uv400") ||
    qNorm.includes("polarized");

  const wantsWrap = qNorm.includes("wrap");
  const wantsShield = qNorm.includes("shield");
  const wantsAviator = qNorm.includes("aviator");

  const filtered = items
    .map((it) => {
      const titleNorm = normalizeTitle(it?.title);
      const sim = titleSimilarity(titleNorm, qNorm);

      const hasOrange =
        titleNorm.includes("orange") ||
        titleNorm.includes("amber") ||
        titleNorm.includes("yellow");

      const hasBlue =
        titleNorm.includes("blue light") ||
        titleNorm.includes("blue-light") ||
        titleNorm.includes("computer") ||
        titleNorm.includes("gaming") ||
        titleNorm.includes("block blue") ||
        titleNorm.includes("screen");

      const hasWrap = titleNorm.includes("wrap");
      const hasShield = titleNorm.includes("shield");
      const hasAviator = titleNorm.includes("aviator");

      const hasSunwear =
        titleNorm.includes("sunglasses") ||
        titleNorm.includes("polarized") ||
        titleNorm.includes("uv400") ||
        titleNorm.includes("sport") ||
        titleNorm.includes("sports") ||
        titleNorm.includes("cycling") ||
        titleNorm.includes("driving") ||
        titleNorm.includes("fishing") ||
        titleNorm.includes("outdoor");

      let score = sim;

      if (eyewearMode) {
        if (!wantsSun && hasSunwear) {
          score -= wantsBlue ? 0.55 : 0.38;
        }

        // Color (orange) is a variant attribute, not identity. Reward
        // presence but only mildly penalize absence so wrap-sunglasses
        // comps without "orange" in the title still ride above the gate.
        // Was -0.24, which combined with the 0.34 gate effectively
        // required sim ≥ 0.58 — too strict for legitimate comps.
        if (wantsOrange) score += hasOrange ? 0.22 : -0.06;
        if (wantsBlue) score += hasBlue ? 0.24 : -0.06;
        if (wantsWrap) score += hasWrap ? 0.12 : -0.08;
        if (wantsShield) score += hasShield ? 0.12 : -0.08;
        if (wantsAviator) score += hasAviator ? 0.12 : -0.08;
      }

      if (it?.__fromMarketSearch && Number.isFinite(it?.__serverRank)) {
        score += Math.max(0, 0.12 - Number(it.__serverRank) * 0.01);
      }

      return {
        ...it,
        __clientMatch: score,
      };
    })
    .filter((it) => {
      const titleNorm = normalizeTitle(it?.title);
      if (!titleNorm) return false;
      if (looksBadListing(titleNorm, qNorm)) return false;

      const total = Number(it.numericTotal);
      if (!Number.isFinite(total)) return false;
      if (total < 1) return false;
      if (total > 100000) return false;

      const hasOrange =
        titleNorm.includes("orange") ||
        titleNorm.includes("amber") ||
        titleNorm.includes("yellow");

      const hasBlue =
        titleNorm.includes("blue light") ||
        titleNorm.includes("blue-light") ||
        titleNorm.includes("computer") ||
        titleNorm.includes("gaming") ||
        titleNorm.includes("block blue") ||
        titleNorm.includes("screen");

      const hasWrap = titleNorm.includes("wrap");

      const hasSunwear =
        titleNorm.includes("sunglasses") ||
        titleNorm.includes("polarized") ||
        titleNorm.includes("uv400") ||
        titleNorm.includes("sport") ||
        titleNorm.includes("sports") ||
        titleNorm.includes("cycling") ||
        titleNorm.includes("driving") ||
        titleNorm.includes("fishing") ||
        titleNorm.includes("outdoor");

      if (eyewearMode && !wantsSun && hasSunwear && !hasBlue) return false;
      // Color (orange/blue) is a variant attribute, not identity. Most
      // sunglass listings omit it from the title (color is a SKU option).
      // Requiring it in title at score < 0.62 drops valid wrap-sunglasses
      // comps and starves the UI of inventory. Mirror the server's
      // relaxed thresholds.
      if (wantsOrange && !hasOrange && it.__clientMatch < 0.34) return false;
      if (wantsBlue && !hasBlue && it.__clientMatch < 0.50) return false;
      if (wantsWrap && !hasWrap && it.__clientMatch < 0.58) return false;

      return true;
    })
    .sort((a, b) => {
      const scoreDiff = Number(b.__clientMatch || 0) - Number(a.__clientMatch || 0);
      if (Math.abs(scoreDiff) > 0.03) return scoreDiff;
      return Number(a.numericTotal || Infinity) - Number(b.numericTotal || Infinity);
    });

  const strong = filtered.filter((it) => Number(it.__clientMatch || 0) >= 0.45);
  const medium = filtered.filter((it) => Number(it.__clientMatch || 0) >= 0.30);

  // Greedier inclusion than before: if strong has fewer than 6, mix in
  // medium so the UI sees a real comp distribution (median anchor needs
  // breadth). Previously returned strong-only the moment strong>=3, which
  // collapsed a 16-item pool down to 5 displayable items.
  if (strong.length >= 6) return strong;
  if (medium.length >= 3) return medium;
  if (filtered.length >= 1) return filtered.slice(0, 20);
  return filtered;
};

// Load persisted state ONCE
useEffect(() => {
  (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);

      // Feature 1: Load P&L flips
      try {
        const plRaw = await AsyncStorage.getItem("EVAN_PL_FLIPS_V1");
        if (plRaw) setPlFlips(JSON.parse(plRaw));
      } catch { /* non-fatal */ }
      plFlipsLoadedRef.current = true; // unlock the save effect

const intelRaw = await AsyncStorage.getItem(INTEL_KEY);
if (intelRaw) {
  try {
    const parsedIntel = JSON.parse(intelRaw);
    setIntelState(parsedIntel && typeof parsedIntel === "object" ? parsedIntel : emptyIntel());
  } catch {
    setIntelState(emptyIntel());
  }
}
      // cycle start
      const loadedCycleStart = Number.isFinite(parsed?.cycleStartMs)
        ? parsed.cycleStartMs
        : Date.now();
      setCycleStartMs(loadedCycleStart);
      // scans used
      let loadedScans = Number.isFinite(parsed?.scansUsed)
        ? parsed.scansUsed
        : 0;
      // reset free scans if 24 hours passed (daily quota)
      const now = Date.now();
      if (now - loadedCycleStart >= FREE_CYCLE_MS) {
        loadedScans = 0;
        setCycleStartMs(now);
      }
      setScansUsed(loadedScans);
      setIsPro(!!parsed?.isPro);
      setHistory(Array.isArray(parsed?.history) ? parsed.history : []);
      setWatchlist(Array.isArray(parsed?.watchlist) ? parsed.watchlist : []);
      setIsSignedIn(!!parsed?.isSignedIn);
      setSavingsTotal(
        Number.isFinite(parsed?.savingsTotal) ? parsed.savingsTotal : 0
      );
      if (parsed?.activeResult) setActiveResult(parsed.activeResult);
      if (parsed?.lastScan) setLastScan(parsed.lastScan);

      // Local-first result cache: restore last scan result (Subway Mode / crash recovery).
      // Phase 4/5: every cached card passes through migrateScanIfNeeded so legacy
      // verdicts (STRONG_BUY / GOOD_DEAL / GREAT_FLIP / etc.) are normalized to
      // canonical BEFORE the UI reads them. Migration is version-gated, so a
      // card already at _schemaVersion: 3 is a no-op. The original payload is
      // preserved under _backup for forensic audit.
      try {
        const lastResultRaw = await AsyncStorage.getItem("EVAN_LAST_RESULT_V1");
        if (lastResultRaw) {
          const lastResult = JSON.parse(lastResultRaw);
          const ageMs = Date.now() - (lastResult?.savedAt || 0);
          if (ageMs < 30 * 60 * 1000 && lastResult?.card && !parsed?.activeResult) {
            // Phase 4/5: legacy verdict-field normalizer (untouched).
            const migrationResult = normalizeStoredScan(lastResult.card);
            // Phase 7: hydrate against the v3 contract — convert legacy
            // verdicts to canonical at the TOP LEVEL, archive legacy
            // strings under .legacy, drop unrecoverable docs entirely.
            const v3Result = normalizeStoredScanV3(migrationResult.scan, {
              source: "EVAN_LAST_RESULT_V1",
            });
            const migratedCard = v3Result.dropped ? null : v3Result.scan;
            const dirty = migrationResult.migrated || v3Result.changed;

            if (dirty && migratedCard) {
              const next = { ...lastResult, card: migratedCard };
              AsyncStorage.setItem("EVAN_LAST_RESULT_V1", JSON.stringify(next)).catch(() => {});
              // Phase 6 telemetry: each non-canonical verdict-bearing field
              // emits one verdict_disagreement_event so we can locate the writer.
              for (const change of migrationResult.verdictChanges) {
                if (change.normalized !== null && change.normalized !== change.raw) {
                  reportCacheDrift(`EVAN_LAST_RESULT_V1:${change.path}`, change.raw, {
                    fromVersion: migrationResult.fromVersion,
                  });
                }
              }
            } else if (v3Result.dropped) {
              // Cache held an unrecoverable scan — wipe so the UI doesn't
              // try to render a contradictory card on next load.
              AsyncStorage.removeItem("EVAN_LAST_RESULT_V1").catch(() => {});
            }

            if (migratedCard) {
              setActiveResult(migratedCard);
              setResults([migratedCard]);
            }
          }
        }
      } catch { /* non-fatal */ }

      // Restore JWT session
      try {
        const jwt = await AsyncStorage.getItem("evan_jwt_v1");
        if (jwt) {
          // Quick expiry check (decode payload, no signature verify needed here)
          const parts = jwt.split(".");
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            const nowSec = Math.floor(Date.now() / 1000);
            if (payload.exp && payload.exp > nowSec) {
              _authJwt = jwt;
              setIsSignedIn(true);
              if (payload.sub) {
                setUserId(payload.sub);
                _clientId = payload.sub;
                // Monospace recovery toast — feels like the AI remembered you
                setSavedToast("[SYSTEM] SESSION RESTORED");
                // Merge server flips into local state (fire-and-forget)
                fetch(`${SAFE_API_BASE}/api/pl/flips/${payload.sub}`, {
                  headers: { "Authorization": `Bearer ${jwt}` },
                }).then((r) => r.json()).then((d) => {
                  if (Array.isArray(d?.flips) && d.flips.length) {
                    setPlFlips((prev: PLFlip[]) => {
                      const existingIds = new Set(prev.map((f) => f.id));
                      const fresh = d.flips.filter((f: any) => !existingIds.has(f.id));
                      if (!fresh.length) return prev;
                      return [...fresh, ...prev].sort(
                        (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()
                      );
                    });
                  }
                }).catch(() => {});
              }
            } else {
              await AsyncStorage.removeItem("evan_jwt_v1");
            }
          }
        }
      } catch { /* non-fatal */ }
    } catch (e) {
      console.log("Failed to load persisted state:", e);
      // SAFE DEFAULTS
      setScansUsed(0);
      setIsPro(false);
      setHistory([]);
      setWatchlist([]);
      setIsSignedIn(false);
      setSavingsTotal(0);
      setActiveResult(null);
      setLastScan(null);
      setCycleStartMs(Date.now());
    }
  })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

// ── Regret check on app open ──────────────────────────────────────────
useEffect(() => {
  (async () => {
    try {
      const key = "EVAN_REGRET_V1";
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return;
      const passed: any[] = JSON.parse(raw);
      if (!passed.length) return;
      // Only check items passed more than 24 hours ago
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const toCheck = passed.filter(p => p.passedAt < oneDayAgo).slice(0, 3);
      if (!toCheck.length) return;
      // Simulate price check (in production, would call /market/search per item)
      // For now, show items that were passed >3 days ago as "regret candidates"
      const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
      const regrets = passed.filter(p => p.passedAt < threeDaysAgo).map(p => ({
        ...p,
        currentPrice: p.passedPrice * (1 + Math.random() * 0.3), // simulated — replace with real API call
      })).filter(p => p.currentPrice > p.passedPrice * 1.1);
      if (regrets.length > 0) showRegretAlert(regrets);
    } catch {}
  })();
}, []); // eslint-disable-line react-hooks/exhaustive-deps

// -----------------------------------
// Marketplace fetches (MODULAR)
// -----------------------------------

const _fetchEbayResults = async (query, signal) => {
  try {
    const data: any = await apiFetch(
      `/search/ebay?q=${encodeURIComponent(String(query || "").trim())}`,
      {
        method: "GET",
        signal,
      }
    );

    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.items)) return data.items;

    return [];
  } catch (e: any) {
    if (e?.name === "AbortError") throw e;
    console.error("eBay fetch failed", e);
    return [];
  }
};

// ✅ SerpAPI results (via your backend)

const searchSerp = async (query, signal, variants: any[] = []) => {
  try {
    const data: any = await searchMarket(
      {
        query,
        variants,
      },
      signal
    );

    const items = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data)
      ? data
      : [];

    const finalQuery =
      typeof data?.finalQuery === "string" && data.finalQuery.trim()
        ? data.finalQuery.trim()
        : query;

    return items.map((it, idx) => ({
      ...it,
      __fromMarketSearch: true,
      __serverRank: idx,
      __finalQuery: finalQuery,
    }));
  } catch (e: any) {
    if (e?.name === "AbortError") throw e;
    console.error("Serp fetch failed", e);
    return [];
  }
};

// ✅ Etsy disabled for now (stub)

const _searchEtsy = async (_query, _signal) => {
  return [];
};

const mergeMarketResultSets = (...groups: any[][]) => {
  const flat = groups.flat().filter(Boolean);

  const seen = new Set<string>();
  const out: any[] = [];

  for (const it of flat) {
    const key =
      String(it?.url || "") ||
      `${String(it?.title || "").toLowerCase().trim()}|${Number(
        it?.totalPrice ?? it?.price ?? 0
      )}|${String(it?.source || "")}`;

    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }

  return out;
};

const _buildEarlyPrefetchQuery = (q: string) => {
  const s = normalizeTitle(String(q || ""));
  if (!s) return "";

  const hasOrange =
    s.includes("orange") || s.includes("amber") || s.includes("yellow");
  const hasBlue =
    s.includes("blue light") ||
    s.includes("computer") ||
    s.includes("gaming");
  const hasGlasses =
    s.includes("glasses") || s.includes("eyewear") || s.includes("frames");

  if (hasOrange && hasBlue) {
    return "orange blue light glasses";
  }

  if (hasOrange && hasGlasses) {
    return "orange lens glasses";
  }

  if (hasBlue && hasGlasses) {
    return "blue light glasses";
  }

  if (s.includes("glasses") && s.includes("wrap")) {
    return "wraparound glasses";
  }

  if (s.includes("glasses")) {
    return "glasses";
  }

  return s;
};

const buildVisionVariants = (q: string) => {
  const s = normalizeTitle(String(q || ""));
  if (!s) return [];

  const out = new Set<string>();

  const family =
    s.includes("sunglasses")
      ? "sunglasses"
      : s.includes("glasses") || s.includes("eyewear") || s.includes("frames")
      ? "glasses"
      : "glasses";

  const color =
    s.includes("orange")
      ? "orange"
      : s.includes("amber")
      ? "amber"
      : s.includes("yellow")
      ? "yellow"
      : s.includes("black")
      ? "black"
      : s.includes("brown")
      ? "brown"
      : "";

  const lensType =
    s.includes("blue light")
      ? "blue light"
      : s.includes("computer")
      ? "computer"
      : s.includes("gaming")
      ? "gaming"
      : s.includes("polarized")
      ? "polarized"
      : s.includes("uv400")
      ? "uv400"
      : s.includes("tinted")
      ? "tinted"
      : s.includes("lens")
      ? "lens"
      : color
      ? "lens"
      : "";

  const shape =
    s.includes("wraparound")
      ? "wraparound"
      : s.includes("wrap")
      ? "wraparound"
      : s.includes("shield")
      ? "shield"
      : s.includes("aviator")
      ? "aviator"
      : "";

  const push = (...parts: string[]) => {
    const value = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    if (value) out.add(value);
  };

  push(s);
  push(color, lensType, shape, family);
  push(color, lensType, family);
  push(color, shape, family);
  push(lensType, shape, family);
  push(color, family);
  push(lensType, family);
  push(shape, family);

  if (color && lensType && shape) {
    push(color, lensType, shape, "glasses");
  }

  if (color && shape) {
    push(color, shape, "glasses");
  }

  if (color && lensType) {
    push(color, lensType, "glasses");
  }

  if (lensType && shape) {
    push(lensType, shape, "glasses");
  }

  if (color === "orange" || color === "amber" || color === "yellow") {
    push(color, "lens", family);
    push(color, "lens", "glasses");
  }

  if (lensType === "blue light" || lensType === "computer" || lensType === "gaming") {
    push(color, "blue light", "glasses");
    push("blue light", shape, "glasses");
    push("computer", shape, "glasses");
    push("gaming", shape, "glasses");
  }

  if (shape === "wraparound") {
    push(color, "wraparound", "glasses");
    push(lensType, "wraparound", "glasses");
  }

  return Array.from(out)
    .map((x) => normalizeTitle(x))
    .filter(Boolean)
    .slice(0, 12);
};

const fetchVisionEnrich = async (query, mode = "item", context = "") => {
  try {
    const data: any = await apiFetch(`/vision/enrich`, {
      method: "POST",
      body: JSON.stringify({ query, mode, context }),
    });

    if (data?.ok) return data;
    return null;
  } catch (e) {
    console.error("Vision enrich failed", e);
    return null;
  }
};

const buildCollectorSearchQuery = (visionQuery: string, enrich: any) => {
  const maker = String(enrich?.collector?.maker || "").trim();
  const model = String(enrich?.collector?.model || "").trim();
  const era = String(enrich?.collector?.era || "").trim();

  const pieces = [maker, model, visionQuery].filter(Boolean);

  if (pieces.length >= 2) {
    return normalizeTitle(pieces.join(" ")).trim();
  }

  if (maker && era) {
    return normalizeTitle(`${maker} ${era} ${visionQuery}`).trim();
  }

  return "";
};

const shouldTriggerCollectorPass = (enrich: any) => {
  const maker = String(enrich?.collector?.maker || "").trim();
  const model = String(enrich?.collector?.model || "").trim();
  const tells = Array.isArray(enrich?.collector?.tells)
    ? enrich.collector.tells
    : [];
  const summary = String(enrich?.collector?.summary || "").trim();

  return !!(maker || model || summary || tells.length >= 2);
};

const dedupeQueryTokens = (raw: any) => {
  const toks = String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  const out: string[] = [];
  for (const t of toks) {
    if (!out.includes(t)) out.push(t);
  }
  return out.join(" ").trim();
};

const cleanVisionQuery = (q: any) => {
  if (!q) return "";

  let s = dedupeQueryTokens(q);

  const bad = ["object", "item", "product", "unknown", "thing"];
  s = s
    .split(" ")
    .filter((w) => w.length > 2 && !bad.includes(w))
    .join(" ")
    .trim();

  if (!s) return "";

  if (s === "orange lens eyewear") s = "orange lens glasses";
  if (s === "tinted eyewear") s = "tinted glasses";
  if (s === "fashion eyewear") s = "fashion glasses";

  const sig = extractProductSignature(s);

  const hasOrange =
    s.includes("orange") || s.includes("amber") || s.includes("yellow");
  const hasBlue =
    s.includes("blue light") ||
    s.includes("computer") ||
    s.includes("gaming") ||
    s.includes("block blue");
  const hasWrap = s.includes("wrap");
  const hasOval = s.includes("oval");
  const hasShield = s.includes("shield");
  const hasAviator = s.includes("aviator");
  const hasRound = s.includes("round");
  const hasSquare = s.includes("square");
  const hasRect = s.includes("rectangle") || s.includes("rectangular");
  const hasBlack = s.includes("black");
  const hasSun =
    s.includes("sunglasses") ||
    s.includes("sunwear") ||
    s.includes("shades") ||
    s.includes("shade") ||
    s.includes("uv") ||
    s.includes("polarized");
  const hasLensWord =
    s.includes("lens") ||
    s.includes("lenses") ||
    s.includes("tint") ||
    s.includes("tinted");

  const descriptors: string[] = [];
  if (hasBlack) descriptors.push("black");
  if (hasOval) descriptors.push("oval");
  if (hasWrap) descriptors.push("wraparound");
  if (hasShield) descriptors.push("shield");
  if (hasAviator) descriptors.push("aviator");
  if (hasRound) descriptors.push("round");
  if (hasSquare) descriptors.push("square");
  if (hasRect) descriptors.push("rectangle");

  const prefix = descriptors.join(" ").trim();

  // IMPORTANT:
  // if we already have a branded query, preserve it instead of rewriting it
  // into duplicated junk like "oakley glasses black glasses orange lenses"
  if (sig.brand) {
    return normalizeTitle(s);
  }

  if (hasOrange && hasBlue) {
    const base = hasLensWord
      ? "orange lens blue light glasses"
      : "orange blue light glasses";
    return normalizeTitle([prefix, base].filter(Boolean).join(" "));
  }

  if (hasOrange && hasSun) {
    const base = hasLensWord ? "orange lens sunglasses" : "orange sunglasses";
    return normalizeTitle([prefix, base].filter(Boolean).join(" "));
  }

  if (hasOrange) {
    const base = hasLensWord ? "orange lens glasses" : "orange glasses";
    return normalizeTitle([prefix, base].filter(Boolean).join(" "));
  }

  if (hasBlue) {
    return normalizeTitle([prefix, "blue light glasses"].filter(Boolean).join(" "));
  }

  return normalizeTitle(s);
};

// ------------------------------------------------------------
// PRODUCT SIGNATURE ENGINE
// improves brand + model detection for search accuracy
// ------------------------------------------------------------

const extractProductSignature = (raw: string) => {
  const q = normalizeTitle(String(raw || ""));
  if (!q) {
    return {
      brand: "",
      model: "",
      core: "",
    };
  }

  const brandList = [
    "nike","adidas","gucci","prada","ray ban","ray-ban","oakley",
    "apple","samsung","sony","canon","dell","hp","lenovo",
    "jansport","north face","patagonia","supreme",
    "louis vuitton","balenciaga","coach"
  ];

  let brand = "";

  for (const b of brandList) {
    if (q.includes(b)) {
      brand = b;
      break;
    }
  }

  const tokens = q.split(" ");
  let model = "";

  for (const t of tokens) {
    if (
      /[a-z]*\d+[a-z\d]*/i.test(t) || // model numbers
      (t.length >= 5 && !brandList.includes(t))
    ) {
      model = model ? model + " " + t : t;
    }
  }

  return {
    brand,
    model,
    core: q,
  };
};

const _buildVisionSeedVariants = (q: string) => {
  const sig = extractProductSignature(q);

  const base = normalizeTitle(sig.core);
  if (!base) return [];

  const variants = new Set<string>();

  variants.add(base);

  if (sig.brand && sig.model) {
    variants.add(`${sig.brand} ${sig.model}`);
    variants.add(`${sig.brand} ${base}`);
  }

  if (sig.model) {
    variants.add(sig.model);
  }

  const tokens = base.split(" ");

  if (tokens.length > 3) {
    variants.add(tokens.slice(0, 3).join(" "));
  }

  variants.add(base.replace(/s$/, ""));
  variants.add(base.replace(/es$/, ""));
  variants.add(base + " ebay");
  variants.add(base + " used");
  variants.add(base + " marketplace");
  variants.add(base + " listing");
  variants.add(base + " ebay listing");
  variants.add(base + " used ebay");
  variants.add(base + " resale");
  variants.add(base + " marketplace listing");
  variants.add(base + " pre owned");



return Array.from(variants)
  .map((x) => {
    const sig = extractProductSignature(x);

    // preserve branded queries exactly
    if (sig.brand || sig.model) {
      return normalizeTitle(x);
    }

    // otherwise clean generic ones
    return cleanVisionQuery(x);
  })
  .filter(Boolean)
  .slice(0, 18);
};

// ── Feature 1: Persistent price cache ────────────────────────────────────────
const PRICE_CACHE_STORE_KEY = "EVAN_PRICE_CACHE_V2";
const PRICE_CACHE_TTL_MS    = 7 * 24 * 60 * 60 * 1000; // 7 days
const PRICE_CACHE_MAX       = 250;

function normalizeCacheKey(q: string): string {
  return String(q || "").toLowerCase().trim().replace(/\s+/g, " ");
}

async function writePriceCache(query: string, data: any): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PRICE_CACHE_STORE_KEY);
    const store: Record<string, any> = raw ? JSON.parse(raw) : {};
    const key = normalizeCacheKey(query);
    store[key] = { ...data, __cachedAt: Date.now(), __query: key };
    // Evict oldest entries beyond cap
    const entries = Object.entries(store);
    if (entries.length > PRICE_CACHE_MAX) {
      entries.sort((a: any, b: any) => (b[1].__cachedAt || 0) - (a[1].__cachedAt || 0));
      const trimmed = Object.fromEntries(entries.slice(0, PRICE_CACHE_MAX));
      await AsyncStorage.setItem(PRICE_CACHE_STORE_KEY, JSON.stringify(trimmed));
    } else {
      await AsyncStorage.setItem(PRICE_CACHE_STORE_KEY, JSON.stringify(store));
    }
  } catch { /* non-fatal */ }
}

async function readPriceCache(query: string): Promise<any | null> {
  try {
    const raw = await AsyncStorage.getItem(PRICE_CACHE_STORE_KEY);
    if (!raw) return null;
    const store: Record<string, any> = JSON.parse(raw);
    const key = normalizeCacheKey(query);
    const entry = store[key];
    if (!entry) return null;
    if (Date.now() - (entry.__cachedAt || 0) > PRICE_CACHE_TTL_MS) return null;
    return entry;
  } catch {
    return null;
  }
}

// offline banner state — updated by searchMarket when serving cached data
const [offlineCachedAt, setOfflineCachedAt] = useState<number | null>(null);

const searchMarket = async (
  {
    query,
    variants = [],
    scannedPrice = null,
    visionConfidence = 0.5,
    visionIdentity = null,
    category = "",
    sizeHint = null, // Feature 11
    scanSource = null, // "vision" | "deterministic" — signals to backend which path was taken
    scanMode: reqScanMode = null,
  }: any,
  signal?: AbortSignal
) => {
  try {

const raw: any = await apiFetch(`/market/search`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
body: JSON.stringify({
  query,
  variants,
  scannedPrice: scannedPrice || null,
  visionConfidence: visionConfidence || 0,
  visionIdentity: visionIdentity || null,
  category,
  sizeHint: sizeHint || null,
  zipCode: zipCode || null,  // Feature 5: hyperlocal pricing
  userId: userId || installId || undefined,
  scanSource: scanSource || null,
  scanMode: reqScanMode || null,
}),
  signal,
});

    const marketData = normalizeMarketResponse(raw);

    console.log("MARKET RAW COUNTS →", {
      market: marketData.items.length,
    });

    console.log(
      "MARKET TOP TITLES →",
      marketData.items.slice(0, 5).map((x: any) => ({
        price: Number.isFinite(x?.totalPrice) ? x.totalPrice : x.price,
        source: x.store,
        title: x.title,
      }))
    );

    // Feature 1: persist successful results so we can serve offline later
    if (query && marketData?.items?.length) {
      writePriceCache(query, marketData); // fire-and-forget
    }
    setOfflineCachedAt(null); // clear any previous offline banner

    return marketData;
  } catch (e: any) {
    if (e?.name === "AbortError") throw e;
    console.error("Market fetch failed", e);

    // Feature 1: try to serve from persistent cache on network failure
    if (query) {
      try {
        const cached = await readPriceCache(query);
        if (cached && cached.items?.length) {
          console.log("⚡ Serving from price cache for:", query);
          setOfflineCachedAt(cached.__cachedAt || Date.now());
          return { ...cached, __fromCache: true };
        }
      } catch { /* fall through */ }
    }

    return {
      items: [],
      best: null,
      bestPrice: null,
      totalMatches: 0,
      finalQuery: query,
      searchedQueries: [query, ...variants].slice(0, 6),
      consensus: null,
      prediction: null,
      coach: null,
      pulse: null,
    };
  }
};

// ─── XHR-based SSE consumer ───────────────────────────────────────────────────
// React Native's fetch implementation does NOT expose Response.body as a
// ReadableStream — `resp.body` is null on iOS/Android. XMLHttpRequest,
// however, surfaces partial response data via xhr.responseText during
// readyState 3 (LOADING). That's the only reliable way to consume
// Server-Sent Events on-device in Expo/RN.
// ─────────────────────────────────────────────────────────────────────────────
type SSEHandler = (event: string, data: any) => void;

function streamSSEViaXHR(
  url:           string,
  body:          string,
  headers:       Record<string, string>,
  signal:        AbortSignal | undefined,
  onEvent:       SSEHandler,
  chunkTimeoutMs = 15000,
): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let parsedChars = 0;
    let lineBuf     = "";
    let lastEvent   = "";
    let timer: ReturnType<typeof setTimeout> | null = null;
    let settled  = false;
    let onAbort: (() => void) | null = null;

    const cleanup = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (signal && onAbort) {
        try { signal.removeEventListener("abort", onAbort); } catch {}
      }
    };
    const settleReject = (err: any) => {
      if (settled) return;
      settled = true;
      try { xhr.abort(); } catch {}
      cleanup();
      reject(err);
    };
    const settleResolve = (val: { status: number }) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(val);
    };
    const armChunkTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(
        () => settleReject(new Error("stream_read_timeout")),
        chunkTimeoutMs,
      );
    };

    const drain = () => {
      const text: string = xhr.responseText || "";
      if (text.length <= parsedChars) return;
      const chunk = text.slice(parsedChars);
      parsedChars = text.length;
      armChunkTimer();
      lineBuf += chunk;
      const lines = lineBuf.split("\n");
      lineBuf = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          lastEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            onEvent(lastEvent || "message", data);
          } catch { /* skip malformed line */ }
          lastEvent = "";
        }
      }
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState === 3 || xhr.readyState === 4) drain();
      if (xhr.readyState === 4) {
        const status = xhr.status;
        if (status >= 200 && status < 300) settleResolve({ status });
        else settleReject(new Error(`xhr_status_${status}`));
      }
    };
    xhr.onerror   = () => settleReject(new Error("xhr_network_error"));
    xhr.ontimeout = () => settleReject(new Error("xhr_timeout"));

    onAbort = () => settleReject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    if (signal) {
      if (signal.aborted) {
        settleReject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        return;
      }
      try { signal.addEventListener("abort", onAbort); } catch {}
    }

    try {
      xhr.open("POST", url);
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
      try { (xhr as any).responseType = "text"; } catch {}
      armChunkTimer();
      xhr.send(body);
    } catch (e: any) {
      settleReject(e);
    }
  });
}

// ─── Staged market search via SSE stream ──────────────────────────────────────
// Returns provisional results in ~4s (marketplace only), then complete in ~15s.
// Falls back to legacy searchMarket() if streaming is unavailable.
//
// onProvisional: called when Phase 1 marketplace data arrives (≥2 listings)
// onComplete:    called when Phase 2 enriched data arrives (oracle + sold comps)
// onPhase:       called on phase transitions ("analyzing_fast" | "enriching")
//
// Phase 3 additions:
//   • Stream read timeout (15s per chunk) prevents network partition hangs
//   • scanId consistency check: ignores stale events from prior scans
//   • degraded flag surfaced to callbacks so UI can show "limited data" indicator
//
// Returns the final/complete data, or provisional data if stream ends early.
// ─────────────────────────────────────────────────────────────────────────────
const searchMarketStream = async (
  params: {
    query: string;
    variants?: string[];
    scannedPrice?: number | null;
    visionConfidence?: number;
    visionIdentity?: any;
    category?: string;
    sizeHint?: string | null;
    scanSource?: string | null;
    scanMode?: string | null;
    attributeCertainty?: any;
  },
  signal: AbortSignal,
  onProvisional: (data: any) => void,
  onComplete:    (data: any) => void,
  onPhase?:      (phase: string) => void,
): Promise<any> => {
  const body = JSON.stringify({
    query:              params.query,
    variants:           params.variants    || [],
    scannedPrice:       params.scannedPrice ?? null,
    visionConfidence:   params.visionConfidence ?? 0.5,
    visionIdentity:     params.visionIdentity   ?? null,
    category:           params.category         ?? "",
    sizeHint:           params.sizeHint         ?? null,
    zipCode:            zipCode                  || null,
    userId:             userId || installId      || undefined,
    scanSource:         params.scanSource        ?? null,
    scanMode:           params.scanMode          ?? null,
    attributeCertainty: params.attributeCertainty ?? null,
  });

  let lastProvisional: any = null;
  let finalData: any = null;

  for (const rawBase of API_BASE_CANDIDATES) {
    const base = String(rawBase || "").replace(/\/+$/, "");
    const url  = `${base}/market/search/stream`;
    try {
      const streamHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
      };
      if (_authJwt) {
        streamHeaders["Authorization"] = `Bearer ${_authJwt}`;
      } else if (_clientId) {
        streamHeaders["x-user-id"] = _clientId;
      }
      console.log("searchMarketStream: attempting (xhr)", url);

      let activeScanId: string | null = null;
      let streamErr:    Error | null  = null;
      let completeSeen = false;

      // Local controller so we can short-circuit the XHR when we see `complete`
      // (server keeps SSE connection open briefly after the final event).
      const localCtl = new AbortController();
      const cancelOnOuter = () => localCtl.abort();
      try { signal?.addEventListener("abort", cancelOnOuter); } catch {}

      try {
        await streamSSEViaXHR(
          url,
          body,
          streamHeaders,
          localCtl.signal,
          (eventName, rawData) => {
            // Capture scanId from first event; ignore events with mismatched scanId
            if (rawData?.scanId) {
              if (activeScanId === null) activeScanId = rawData.scanId;
              else if (activeScanId !== rawData.scanId) return; // stale event
            }
            // Merge normalizeMarketResponse (adds trusted/id/buyLink per item)
            const data = rawData?.items
              ? { ...rawData, ...normalizeMarketResponse(rawData) }
              : rawData;

            if (eventName === "provisional") {
              lastProvisional = data;
              onProvisional(data);
            } else if (eventName === "complete") {
              finalData = data;
              try { console.log("FRONTEND_RESULT_ITEMS_RECEIVED", { event: "complete", count: (data?.items||[]).length, top5: (data?.items||[]).slice(0,5).map((i: any)=>({title:i?.title,price:i?.price,source:i?.source})) }); } catch {}
              onComplete(data);
              if (params.query && data?.items?.length) writePriceCache(params.query, data);
              setOfflineCachedAt(null);
              completeSeen = true;
              try { localCtl.abort(); } catch {} // stop reading; server may keep socket open
            } else if (eventName === "phase" && onPhase) {
              onPhase(data?.phase);
            } else if (eventName === "error") {
              streamErr = new Error(data?.message || data?.code || "stream_error");
              try { localCtl.abort(); } catch {}
            }
          },
        );
      } catch (xhrErr: any) {
        // If we already saw `complete` and aborted ourselves, swallow the abort.
        if (completeSeen && xhrErr?.name === "AbortError") {
          /* expected — we asked it to stop */
        } else if (signal?.aborted) {
          throw xhrErr; // outer caller cancelled — propagate
        } else if (streamErr) {
          throw streamErr;
        } else {
          throw xhrErr;
        }
      } finally {
        try { signal?.removeEventListener("abort", cancelOnOuter); } catch {}
      }

      const streamResult = finalData ?? lastProvisional ?? null;
      const streamHasItems =
        (Array.isArray(streamResult?.items)   && streamResult.items.length   > 0) ||
        (Array.isArray(streamResult?.results) && streamResult.results.length > 0);
      if (streamResult && streamHasItems) return streamResult;
      console.warn("searchMarketStream: stream-result empty", {
        base,
        finalDataKeys:       finalData       ? Object.keys(finalData).slice(0, 20)       : null,
        finalDataItemsLen:   Array.isArray(finalData?.items)                ? finalData.items.length                : null,
        finalDataMarketLen:  Array.isArray((finalData as any)?.market)      ? (finalData as any).market.length      : null,
        finalDataResultsLen: Array.isArray(finalData?.results)              ? finalData.results.length              : null,
        provKeys:            lastProvisional ? Object.keys(lastProvisional).slice(0, 20) : null,
        provItemsLen:        Array.isArray(lastProvisional?.items)          ? lastProvisional.items.length          : null,
        provMarketLen:       Array.isArray((lastProvisional as any)?.market)? (lastProvisional as any).market.length: null,
      });
    } catch (e: any) {
      if (e?.name === "AbortError") throw e;
      console.warn("searchMarketStream failed for base:", base, e?.message);
    }
  }

  // Fallback: if all stream attempts fail or returned no data, use legacy searchMarket
  console.warn("searchMarketStream: falling back to legacy searchMarket");
  const legacyData = await searchMarket(params, signal);
  if (legacyData) onComplete(legacyData);
  return legacyData;
};

  // ✅ keep free cycle reset fresh (runs occasionally)
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      if (now - cycleStartMs >= FREE_CYCLE_MS) {
        setScansUsed(0);
        setCycleStartMs(now);
      }
    }, 60000);
  return () => clearInterval(t);
  }, [cycleStartMs]);
useEffect(() => {
  if (!loadingResults) {
    setShowRetryWhileLoading(false);
    setLoadingTick(0);
    retryReveal.setValue(0);
    retryScale.setValue(0.96);
    return;
  }

  const startedAt = Date.now();
  setShowRetryWhileLoading(false);
  retryReveal.setValue(0);
  retryScale.setValue(0.96);
  const retryTimer = setTimeout(() => {
    setShowRetryWhileLoading(true);
    hapticTick();
    RNAnimated.parallel([
      RNAnimated.timing(retryReveal, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      RNAnimated.spring(retryScale, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, RETRY_REVEAL_MS);
  const tickInterval = setInterval(() => {
    setLoadingTick(Date.now() - startedAt);
  }, 420);
  return () => {
    clearTimeout(retryTimer);
    clearInterval(tickInterval);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [loadingResults]);

// ✅ AI staged reveal → THEN result entry anim + soft haptic
useEffect(() => {
  if (!activeResult || loadingResults) return;

  setAiRevealActive(true);
  setAiRevealStep(0);

  aiRevealOpacity.setValue(0);
  aiRevealScale.setValue(0.98);

  RNAnimated.parallel([
    RNAnimated.timing(aiRevealOpacity, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }),
    RNAnimated.spring(aiRevealScale, {
      toValue: 1,
      friction: 7,
      tension: 70,
      useNativeDriver: true,
    }),
  ]).start();

  const t1 = setTimeout(() => setAiRevealStep(1), 420);
  const t2 = setTimeout(() => setAiRevealStep(2), 860);

  const t3 = setTimeout(() => {
    RNAnimated.timing(aiRevealOpacity, {
      toValue: 0,
      duration: 220,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setAiRevealActive(false);

      // Now animate the hero card in
      resultEntry.stopAnimation();
      resultEntry.setValue(0);
      resultDepth.setValue(0);

RNAnimated.parallel([
  RNAnimated.timing(resultEntry, {
    toValue: 1,
    duration: 420,
    easing: Easing.out(Easing.cubic),
    useNativeDriver: true,
  }),
  RNAnimated.spring(resultDepth, {
    toValue: 1,
    friction: 7,
    tension: 80,
    useNativeDriver: true,
  }),
]).start();

      // tiny “result reveal” haptic
      hapticTick();
    });
  }, 1280);

  return () => {
    clearTimeout(t1);
    clearTimeout(t2);
    clearTimeout(t3);
  };
}, [activeResult, loadingResults, aiRevealOpacity, aiRevealScale, resultEntry, resultDepth]);

  // Heal old saved state
  useEffect(() => {
    if (isPro && !isSignedIn) setIsSignedIn(true);
  }, [isPro, isSignedIn]);
  // Persist whenever these change
  useEffect(() => {
    (async () => {
try {
  const payload = {
    scansUsed,
    cycleStartMs,
    isPro,
    history,
    watchlist,
    isSignedIn,
    savingsTotal,
    activeResult,
    lastScan,
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
} catch (_e) {}
    })();
  }, [
    scansUsed,
    cycleStartMs,
    isPro,
    history,
    watchlist,
    isSignedIn,
    savingsTotal,
    plFlips,
    activeResult,
    lastScan,
  ]);
  // Instruction sway loop
  useEffect(() => {
    const loop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(sway, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        RNAnimated.timing(sway, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [sway]);
  const _swayRotate = sway.interpolate({
    inputRange: [0, 1],
    outputRange: ["-2deg", "2deg"],
  });
  

// ✅ HUD RECOVERY: make sure camera HUD always reappears after loading/tab switches
useEffect(() => {
  const shouldShowHud =
    tab === "camera" && !photo && !loadingResults && !showSplash;

  try {
    topHudOpacity?.stopAnimation?.();
    topHudY?.stopAnimation?.();
  } catch {}

  if (shouldShowHud) {
    try { topHudOpacity?.setValue?.(1); } catch {}
    try { topHudY?.setValue?.(0); } catch {}
  } else {
    try { topHudOpacity?.setValue?.(0); } catch {}
    try { topHudY?.setValue?.(-10); } catch {}
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [tab, photo, loadingResults, showSplash]);

// Tab transition safety: opacity + pointerEvents must never desync
const [tabInteractable, setTabInteractable] = useState(true);
const tabFailSafeRef = useRef<any>(null);

// Liquid Glass tab switch — spring-physics fade, no mask hack, zero ghosting
const goTab = (next) => {
  if (!next || next === tab) return;

  // Kill any in-flight animation immediately
  try { tabFade.stopAnimation?.(); } catch {}

  // Hard throttle — prevents animation stacking + lag on rapid taps
  const now = Date.now();
  if (now - goTabLastRef.current < 220) return;
  goTabLastRef.current = now;

  // Hard cooldown — ignore spam presses
  if (now - lastTabPressRef.current < TAB_COOLDOWN_MS) return;
  lastTabPressRef.current = now;

  // If already switching, queue latest only
  if (tabSwitchingRef.current) {
    pendingTabRef.current = next;
    return;
  }
  pendingTabRef.current = null;

  closeAllOverlays?.();
  hapticSelect?.();
  Keyboard.dismiss?.();

  // Hard-close transient overlays that ghost during tab switches
  try { setResultModalOpen(false); } catch {}
  try { setSeeMoreOpen(false); } catch {}
  try { setHelpOpen(false); } catch {}
  try { setHaggleOpen(false); } catch {}
  try { setZoomUri(null); } catch {}
  try { setPreviewImageUri(null); } catch {}
  try { setProfitCalcOpen(false); } catch {}
  try { setCloudImportOpen(false); } catch {}
  try { setInventoryOpen(false); } catch {}
  try { setBatchOpen(false); } catch {}
  try { setTutorialConfirmOpen(false); } catch {}
  try { Keyboard.dismiss(); } catch {}

  tabSwitchingRef.current = true;
  pendingTabRef.current = next;
  setTabInteractable(false);

  // Failsafe recovery — if animation callback never fires
  try { if (tabFailSafeRef.current) clearTimeout(tabFailSafeRef.current); } catch {}
  tabFailSafeRef.current = setTimeout(() => {
    try { tabFade.stopAnimation?.(); } catch {}
    try { tabFade.setValue?.(1); } catch {}
    tabSwitchingRef.current = false;
    pendingTabRef.current = null;
    setTabInteractable(true);
  }, 500);

  // 1) Spring fade-out — fast exit, no linear jank
  RNAnimated.spring(tabFade, {
    toValue: 0,
    damping: 28,
    stiffness: 380,
    mass: 0.6,
    useNativeDriver: true,
  }).start(() => {
    const to = pendingTabRef.current || next;
    pendingTabRef.current = null;

    // Reset barcode state during switch
    try {
      setBarcodeMode(false);
      setLastBarcode(null);
      barcodeLockRef.current = false;
    } catch {}

    // Lock at 0 before switching
    try { tabFade.setValue?.(0); } catch {}

    // Switch tab + spatial zone
    setTab(to);
    setSpatialZone((to === "history" ? "archive" : to) as ZoneKey);

    // Lazy-load disabled for watchlist tab — both loadRelistSuggestions and
    // loadRadar fan SerpAPI lanes across saved items. The watchlist tab must
    // not trigger any marketplace search on focus. (Both functions are also
    // bailed at their entry — this removal is for grep clarity.)
    if (to === "watchlist") {
      console.log("WATCHLIST_AUTO_SEARCH_BLOCKED", { fn: "tab_switch_lazy_load_disabled" });
    }

    // Reset scroll positions
    const resetScroll = () => {
      try {
        if (to === "profile") profileScrollRef?.current?.scrollTo?.({ y: 0, animated: false });
        if (to === "history") historyScrollRef?.current?.scrollTo?.({ y: 0, animated: false });
        if (to === "watchlist") watchlistScrollRef?.current?.scrollTo?.({ y: 0, animated: false });
      } catch {}
    };
    requestAnimationFrame(() => {
      resetScroll();
      requestAnimationFrame(resetScroll);
    });

    // 2) Spring fade-in — liquid feel
    RNAnimated.spring(tabFade, {
      toValue: 1,
      damping: 22,
      stiffness: 260,
      mass: 0.7,
      useNativeDriver: true,
    }).start(() => {
      try { if (tabFailSafeRef.current) clearTimeout(tabFailSafeRef.current); } catch {}
      tabFailSafeRef.current = null;
      tabSwitchingRef.current = false;
      setTabInteractable(true);

      // Process queued tab switch (latest wins)
      if (pendingTabRef.current) {
        const queued = pendingTabRef.current;
        pendingTabRef.current = null;
        goTab(queued);
      }
    });
  });
};

  // Camera roll picker
  const pickFromRoll = async () => {
    if (isFreeLimitReached) {
      bailScanForPaywall("camera_roll");
      return;
    }
    hapticSelect();
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
const result = await ImagePicker.launchImageLibraryAsync({
  mediaTypes: ["images"] as any,
  quality: 0.92,
  allowsEditing: true,
  aspect: [4, 5],
});
    if (!result.canceled && result.assets && result.assets[0]?.uri) {
      setPhoto({ uri: result.assets[0].uri });
      animateUseRetryIn();
    }
  };
const flipCamera = () => {
  hapticSelect();
  // ✅ no flash mask, no delay = way less flicker
  setCameraFacing((prev) => (prev === "back" ? "front" : "back"));
  // keep HUD sane
  hideZoomHud();
  // optional: kill torch if switching away from back
  setTorchOn(false);
};
  // Snap ring burst (not a flash)
  const playSnapRing = () => {
    ringScale.stopAnimation();   ringScale.setValue(0.6);
    ringOpacity.stopAnimation(); ringOpacity.setValue(0);
    RNAnimated.sequence([
      RNAnimated.parallel([
        RNAnimated.timing(ringOpacity, { toValue: 0.85, duration: 70, useNativeDriver: true }),
        RNAnimated.timing(ringScale,   { toValue: 1.05, duration: 70, useNativeDriver: true }),
      ]),
      RNAnimated.parallel([
        RNAnimated.timing(ringOpacity, { toValue: 0, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        RNAnimated.timing(ringScale,   { toValue: 1.35, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
    ]).start();
  };

// ✅ Camera UI GROUP reveal — ensures HUD + buttons appear together (no stagger)
const cameraUiOpacity = useRef(new RNAnimated.Value(0)).current;

useEffect(() => {
  if (tab !== "camera" || !permission?.granted || showSplash || loadingResults || photo) {
    cameraUiOpacity.setValue(0);
    return;
  }
  // Use a small fixed delay instead of waiting for onCameraReady,
  // which may not re-fire when camera was never fully deactivated.
  const t = setTimeout(() => {
    cameraUiOpacity.setValue(0);
    RNAnimated.timing(cameraUiOpacity, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, 150);
  return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [tab, permission?.granted, showSplash, loadingResults, photo]);
  const animateUseRetryIn = () => {
    buttonsY.setValue(90);
    buttonsOpacity.setValue(0);
    RNAnimated.parallel([
      RNAnimated.timing(buttonsY, {
        toValue: 0,
        duration: 520,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
      RNAnimated.timing(buttonsOpacity, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  };
  const reset = () => {
    setRefinePhotos([]);
    scanLockRef.current = false;
    hapticSelect();
    resetRipple();
    setPhoto(null);
    setScanPriceInput("");
    setPriceSubmitted(false);
    Keyboard.dismiss();
    // Clean up cinematic state from takePhoto so overlays don't persist after retake
    try { setScanAnimActive(false); } catch {}
    try { setCinematicFreeze(false); } catch {}
    try { setFreezeFrameUri(null); } catch {}
    try { vignetteOpacity?.setValue?.(0); } catch {}
    try { freezeOpacity?.setValue?.(0); } catch {}
  };
  const _getLoadingCopy = () => {
    const ms = loadingTick;
    if (ms < 2200) return "Finding the cheapest match";
    if (ms < 6200) return "Checking more listings";
    return "Still working — marketplaces can be slow";
  };
// ✅ Cancel scan: HARD cancel (no ghost updates)
const cancelActiveScan = () => {
  scanLockRef.current = false;
  hapticSelect();
  try {
    scanAbortRef.current?.abort?.();
  } catch {}
  scanAbortRef.current = null;
  // invalidate pending scan writes
  scanTokenRef.current = scanTokenRef.current + 1;
  setShowRetryWhileLoading(false);
  setUiError(null);
  stopLoadingSafely();
  setSavedToast("Canceled");
  goTab("camera");
};


const tryDecodeMaybe = (value) => {
  try {
    return decodeURIComponent(String(value || "").trim());
  } catch {
    return String(value || "").trim();
  }
};

const unwrapGoogleishUrl = (input) => {
  const raw = tryDecodeMaybe(input);
  if (!raw || !/^https?:\/\//i.test(raw)) return "";

  try {
    const u = new URL(raw);
    const host = String(u.hostname || "").toLowerCase();

    if (host.includes("google.")) {
      const redirected =
        u.searchParams.get("url") ||
        u.searchParams.get("q") ||
        u.searchParams.get("adurl");

      if (redirected && /^https?:\/\//i.test(redirected)) {
        return tryDecodeMaybe(redirected);
      }
    }

    return raw;
  } catch {
    return raw;
  }
};

const isGoogleSearchResultsUrl = (input) => {
  try {
    const u = new URL(String(input || ""));
    const host = String(u.hostname || "").toLowerCase();
    const path = String(u.pathname || "").toLowerCase();
    return host.includes("google.") && path === "/search";
  } catch {
    return false;
  }
};

const isGoogleProductPageUrl = (input) => {
  try {
    const u = new URL(String(input || ""));
    const host = String(u.hostname || "").toLowerCase();
    const path = String(u.pathname || "").toLowerCase();

    if (!host.includes("google.")) return false;

    if (
      path.includes("/shopping/product/") ||
      path.startsWith("/shopping/product") ||
      path.startsWith("/aclk")
    ) {
      return true;
    }

    // Google Shopping inline product pages — what SerpAPI returns for
    // every product result. URL shape: /search?ibp=oshop&q=...&prds=...
    // They look like search URLs but resolve to a product detail page
    // (the prds= param is the product ID). Treat as a valid product URL
    // so promotionPool doesn't drop every SerpAPI comp.
    const ibp = (u.searchParams.get("ibp") || "").toLowerCase();
    const hasPrds = u.searchParams.has("prds");
    const udm = u.searchParams.get("udm");
    if (path === "/search" && (ibp === "oshop" || hasPrds || udm === "28")) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
};

const resolveBestListingUrl = (item, title) => {
  const candidates = [
    item?.merchant_link,
    item?.offer_page_url,
    item?.offer_link,
    item?.product_page_url,
    item?.product_url,
    item?.itemWebUrl,
    item?.canonicalUrl,
    item?.permalink,
    item?.buyLink,
    item?.href,
    item?.product_link,
    item?.link,
    item?.url,
    item?.listingUrl,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const clean = unwrapGoogleishUrl(candidate);
    if (!clean) continue;

    if (isGoogleProductPageUrl(clean)) return clean;
    if (!isGoogleSearchResultsUrl(clean)) return clean;
  }

  for (const candidate of candidates) {
    const raw = String(candidate || "").trim();
    if (!raw) continue;
    if (isGoogleProductPageUrl(raw)) return raw;
  }

  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(
    String(title || "").trim()
  )}`;
};

const normalizeListings = (raw, market, fallbackSource, query) => {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((it) => {
      const title =
        it?.title ||
        it?.name ||
        it?.productTitle ||
        it?.snippet ||
        it?.product_title ||
        it?.itemTitle ||
        it?.listingTitle ||
        it?.item_name ||
        query;

      const rawPrice =
        it?.price ??
        it?.extracted_price ??
        it?.price_value ??
        it?.value ??
        it?.salePrice ??
        it?.current_price ??
        it?.amount ??
        it?.listingPrice ??
        null;

      const safeUrl = resolveBestListingUrl(it, title);
      const linkVerified =
        !!safeUrl && (!isGoogleSearchResultsUrl(safeUrl) || isGoogleProductPageUrl(safeUrl));

      const image =
        it?.image ||
        it?.thumbnail ||
        it?.thumbnail_url ||
        it?.imageUrl ||
        it?.img ||
        it?.image_url ||
        it?.picture ||
        (Array.isArray(it?.photos) ? it.photos[0] : null) ||
        null;

      const rating =
        it?.rating ??
        it?.stars ??
        it?.review_rating ??
        it?.reviews_rating ??
        it?.reviews ??
        null;

      const source = it?.source || it?.market || it?.marketplace || fallbackSource;

      const backendTotal = toNumber(
        it?.totalPrice ??
          it?.total ??
          it?.allInPrice ??
          it?.finalPrice ??
          it?.price_total
      );

      const numericPriceRaw = toNumber(rawPrice);
      const numericPrice = Number.isFinite(numericPriceRaw)
        ? numericPriceRaw
        : Number.isFinite(backendTotal)
        ? backendTotal
        : null;

      const ship =
        toNumber(
          it?.shipping ??
            it?.shippingCost ??
            it?.delivery ??
            it?.shipping_price ??
            it?.shipping_amount ??
            0
        ) || 0;

      const totalPrice = Number.isFinite(backendTotal)
        ? Math.round(backendTotal * 100) / 100
        : Number.isFinite(numericPrice)
        ? Math.round((numericPrice + ship) * 100) / 100
        : null;

      return {
        ...it,
        title,
        price: rawPrice,
        url: safeUrl,
        image,
        rating,
        source,
        __market: market,
        __linkVerified: linkVerified,
        __fromMarketSearch: Boolean(
          it?.__fromMarketSearch ?? it?.fromMarketSearch ?? false
        ),
        __serverRank: Number.isFinite(it?.__serverRank ?? it?.serverRank)
          ? Number(it?.__serverRank ?? it?.serverRank)
          : null,
        numericPrice: Number.isFinite(numericPrice) ? Number(numericPrice) : null,
        shipping: ship,
        totalPrice,
      };
    })
    .filter((x) => x?.title && Number.isFinite(x?.totalPrice));
};

const _showSavedToast = (amount) => {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const msg = `saved ${money(amount)}`;
  setSavedToast(msg);
  toastAnim.setValue(0);
  RNAnimated.sequence([
    RNAnimated.spring(toastAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 7,
      tension: 90,
    }),
    RNAnimated.delay(900),
    RNAnimated.timing(toastAnim, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }),
  ]).start(() => setSavedToast(null));
};
const addToWatchlist = (card) => {
  const q = card?.visionQuery || card?.itemName;
  const best = toNumber(card?.price);
  if (!q || !Number.isFinite(best)) return;
  // Revenue: track watchlist add for demand graph
  try { EventTracker.trackWatchlistAdd(q, best); } catch {}
  setWatchlist((prev) => {
if (
  prev.some(
    (x) =>
      String(x.query || "").trim().toLowerCase() ===
      String(q || "").trim().toLowerCase()
  )
) return prev;
    return [
      {
        id: `${Date.now()}`,
        query: q,
        lastBest: best,
        lastCheckedMs: Date.now(),
        addedAtMs: Date.now(),
        history: [{ ts: Date.now(), best }],
        seenDrop: true,
      },
      ...prev,
    ];
  });
  setSavedToast("Added to watchlist");
};

const removeFromWatchlist = (card) => {
  const q = card?.visionQuery || card?.itemName || card?.query;
  if (!q) return;
  setWatchlist((prev) =>
    prev.filter(
      (x) =>
        String(x.query || "").trim().toLowerCase() !==
        String(q || "").trim().toLowerCase(),
    ),
  );
};

const toggleWatchlist = (card) => {
  const q = card?.visionQuery || card?.itemName || card?.query;
  if (!q) return;
  const exists = (watchlistRef.current || []).some(
    (x) => String(x.query || "").trim().toLowerCase() === String(q || "").trim().toLowerCase(),
  );
  if (exists) {
    removeFromWatchlist(card);
    setSavedToast("Removed from tracking");
  } else {
    addToWatchlist(card);
    // addToWatchlist already sets its own "Added to watchlist" toast; we
    // overwrite it with the cleaner verb the new dock chip implies. Calling
    // setSavedToast twice is fine — useState collapses to the last value.
    setSavedToast("Tracking");
  }
};

const openHistoryPreview = (uri) => {
  setPreviewImageUri(uri);
  previewAnim.setValue(0);
  RNAnimated.timing(previewAnim, {
    toValue: 1,
    duration: 220,
    useNativeDriver: true,
  }).start();
};
const closeHistoryPreview = () => {
  RNAnimated.timing(previewAnim, {
    toValue: 0,
    duration: 180,
    useNativeDriver: true,
  }).start(() => {
    setPreviewImageUri(null);
  });
};

const [uiError, setUiError] = useState(null);
const showUiError = (title, msg) => {
  setUiError({ title, msg });
};

const [scanStage, setScanStage] = useState<"idle" | "vision" | "market" | "analysis" | "collector">("idle");
const [scanStageMeta, setScanStageMeta] = useState("");

// ===============================
// PRODUCTION SAFE FETCH WRAPPER
// ===============================
const fetchWithTimeout = async (
  url: string,
  options: any = {},
  timeout = 15000
) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const data: any = await apiFetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    clearTimeout(id);
    return data;
  } catch (err: any) {
    clearTimeout(id);

    if (err?.name === "AbortError") {
      throw new Error("API_TIMEOUT");
    }

    throw err;
  }
};

// ===============================
// EXPONENTIAL RETRY WRAPPER
// ===============================
const safeApiCall = async (fn: () => Promise<any>, retries = 2) => {
  let attempt = 0;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = 600 * Math.pow(2, attempt);
      await new Promise((res) => setTimeout(res, delay));
      attempt++;
    }
  }
};
// ===============================
// CLIENT RATE LIMIT PROTECTION
// ===============================
const lastScanTimestampRef = useRef<number>(0);
const MIN_SCAN_INTERVAL = 2500; // 2.5 seconds hard minimum
const canTriggerScan = () => {
  const now = Date.now();
  if (now - lastScanTimestampRef.current < MIN_SCAN_INTERVAL) {
    return false;
  }
  lastScanTimestampRef.current = now;
  return true;
};

const stopLoadingSafely = (reqId?: number) => {
  if (typeof reqId === "number" && !isReqAlive(reqId)) return;
  if (!isMountedRef.current) return;

  scanLockRef.current = false;

  setLoadingResults(false);
  setShowRetryWhileLoading(false);
  setSlowNetwork(false);
  setSpatialLaser(false); // Neon laser OFF — scan pipeline complete

  setScanStage("idle");
  setScanStageMeta("");

  // clear loading visuals
  setLoadingPhotoUri(null);

  try { setScanAnimActive(false); } catch {}
  try { setCinematicFreeze(false); } catch {}
  try { setFreezeFrameUri(null); } catch {}

  try { freezeOpacity?.setValue?.(0); } catch {}
  try { vignetteOpacity?.setValue?.(0); } catch {}

  try { retryReveal.setValue(0); } catch {}
};

const _shippingCost = (item) => {
  if (typeof item.shipping === "number") return item.shipping;
  if (typeof item.shippingCost === "number") return item.shippingCost;
  return 0;
};
const _conditionWeight = (condition) => {
  if (!condition) return 0.6;
  const c = condition.toLowerCase();
  if (c.includes("new")) return 0;
  if (c.includes("like new")) return 0.1;
  if (c.includes("excellent")) return 0.2;
  if (c.includes("good")) return 0.4;
  return 0.6;
};
// ===============================
// MAIN SCAN PIPELINE
// ===============================

const trackEvent = (event: string, payload: any = {}) => {
  if (!userId) return;
  fetch(`${resolvedApiBase}/analytics/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      event,
      payload,
      ts: Date.now(),
    }),
  }).catch(() => {});
};


// ── Search-first: build a usable query from deterministic signals when vision
// returns nothing. Never returns empty — always gives the backend something
// meaningful to search with.
const buildDeterministicFallbackQuery = ({
  itemHint,
  scanMode: mode,
  scannedPrice,
}: {
  itemHint?: string | null;
  scanMode?: string;
  scannedPrice?: number | null;
}): string | null => {
  // Tier 1: user typed a hint — use it directly
  const hint = typeof itemHint === "string" ? itemHint.trim() : "";
  if (hint.length >= 2) return hint.toLowerCase();

  // Tier 2: mode-based category seed
  const modeHints: Record<string, string> = {
    mark:    "brand logo item",
    part:    "replacement part",
    label:   "product label item",
    prop:    "prop item",
    barcode: "product",
  };
  if (mode && mode !== "item" && modeHints[mode]) return modeHints[mode];

  // Tier 3: price-anchored generic search
  if (Number.isFinite(scannedPrice) && (scannedPrice as number) > 0) {
    return "item for sale";
  }

  // No usable signal — caller should hard-fail
  return null;
};

const runScan = async ({
  photoUri,
  scannedPrice,
  cheapestAlt = null,
  itemHint = null,
  sizeHint = null,
  countScan,
  forcedMode = null,
  internalRetry = false,
}: {
  photoUri: any;
  scannedPrice: any;
  cheapestAlt?: number | null;
  itemHint?: string | null;
  sizeHint?: string | null;
  countScan: any;
  forcedMode?: any;
  internalRetry?: boolean;
}) => {
  if (!internalRetry && !canTriggerScan()) {
    return;
  }

  const reqId = nextScanReqId();
  activeScanReqIdRef.current = reqId;

  const effectiveScanMode = forcedMode || scanMode;

if (!isPro) {
  const paidUsed = Number(scansUsed || 0);
  const bank = Number(bonusScans || 0);
  const effectiveUsed = Math.max(0, paidUsed - bank);

  if (effectiveUsed >= FREE_SCAN_LIMIT_SAFE) {
    bailScanForPaywall("runscan_local");
    return;
  }

  // Server-side quota check — the authoritative gate. Local state can be
  // stale (e.g. a prior scan consumed quota but the response hasn't
  // hydrated yet, or counters reset on the server). If the server says
  // no, kill any half-started UI and show the paywall.
  if (!internalRetry) {
    try {
      const apiBase = process.env.EXPO_PUBLIC_API_URL ??
        (Platform.OS === "ios" ? "http://192.168.1.227:3001" : "http://10.0.2.2:3001");
      const effectiveId = userId || guestId || installId;
      const qs = effectiveId ? (userId ? `userId=${userId}` : `guestId=${effectiveId}`) : "";
      const checkRes = await fetch(`${apiBase}/api/scan/status${qs ? `?${qs}` : ""}`, { signal: AbortSignal.timeout(3000) })
        .then(r => r.json()).catch(() => null);
      if (checkRes?.ok && !checkRes.canScan) {
        if (checkRes.resetAt) setScanResetAt(checkRes.resetAt);
        setScansUsed(FREE_SCAN_LIMIT_SAFE); // sync local state so subsequent shutter taps fail fast
        bailScanForPaywall("runscan_server");
        return;
      }
      if (checkRes?.resetAt) setScanResetAt(checkRes.resetAt);
    } catch { /* fail open — local gate is the fallback */ }
  }

  // consume a bonus scan only when a scan is actually counted
  // (we decrement later when we confirm countScan)
}

  try {
    if (scanAbortRef.current) scanAbortRef.current.abort();
} catch (_e) {}

  const controller = new AbortController();
  scanAbortRef.current = controller;

const _startedAt = Date.now();

const token = (scanTokenRef.current += 1);
const hardStopToken = token;

const isLiveScan = () =>
  isMountedRef.current &&
  activeScanReqIdRef.current === reqId &&
  scanTokenRef.current === token;

const softRetryTimer = setTimeout(() => {
  if (!isLiveScan() || hardStopToken !== scanTokenRef.current) return;

  try {
    setShowRetryWhileLoading(true);
  } catch {}

  console.log("RUNSCAN WATCHDOG → keeping scan alive", {
    hardStopMs: HARD_SCAN_ABORT_MS,
    reqId,
  });
}, SOFT_SCAN_UI_MS);

// Subway Mode: connection weak indicator at 10s (before retry UI)
const subwayModeTimer = setTimeout(() => {
  if (!isLiveScan() || hardStopToken !== scanTokenRef.current) return;
  try { setSlowNetwork(true); } catch {}
}, 10000);

const hardStopTimer = setTimeout(() => {
  if (!isLiveScan() || hardStopToken !== scanTokenRef.current) return;

  console.warn("RUNSCAN HARD ABORT", {
    reqId,
    ms: HARD_SCAN_ABORT_MS,
  });

  try {
    controller.abort();
  } catch {}

  try {
    setShowRetryWhileLoading(true);
  } catch {}
}, HARD_SCAN_ABORT_MS);

// Perceived-performance haptic: success pulse at 2.5s regardless of state
// Psychologically signals the AI has processed something — reduces anxiety
const successHapticTimer = setTimeout(() => {
  if (!isLiveScan()) return;
  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
}, 2500);

  // Preserve visionRetries across internalRetry so MAX_VISION_RETRIES
  // actually bounds the loop. Without this, each retry resets the counter
  // to 0 and the loop runs forever on a 429.
  const prevRetries = internalRetry
    ? Number(scanSessionRef.current?.visionRetries ?? 0)
    : 0;
  scanSessionRef.current = {
    photoUri,
    scannedPrice,
    cheapestAlt: cheapestAlt ?? null,
    counted: !!countScan,
    startedAt: Date.now(),
    visionRetries: prevRetries,
  };

  setUiError(null);
  setActiveResult(null);
  useEvanBrain.getState().scanStarted(); // Brain: reset deal state + hotSignal for new scan
  setResults([]);
  setSeeMoreListings([]);
  setLastScan(null);
  setPriceChangeBanner(null);
  setShowRetryWhileLoading(false);
  setLoadingPhotoUri(photoUri);
  const sessionId = nextScanSession();

  setLoadingResults(true);
  setResultModalOpen(false);
  setScanStage("vision");
  setScanStageMeta("Identifying item...");
  setSpatialVerdict(null);  // Clear previous verdict
  setSpatialLaser(true);    // Neon laser ON during scan pipeline

  // Pre-warm: background precompute cache fetch for itemHint only.
  // _lastVisionQueryRef.current is always the PREVIOUS scan's query at this point in
  // the flow — using it as a fallback fires a stale precompute (e.g. sunglasses query
  // during a new airplane scan). Only fire when itemHint gives us a current-scan query.
  const _preWarmQuery = (itemHint && itemHint.trim().length >= 3)
    ? itemHint.trim()
    : null; // never fall back to previous scan's _lastVisionQueryRef
  if (_preWarmQuery && sessionId === scanSessionIdRef.current) {
    console.log("PRECOMPUTE_QUERY_POLICY", {
      sessionId,
      activeSessionId: scanSessionIdRef.current,
      query: _preWarmQuery,
      accepted: true,
      reason: "itemHint_current_scan",
    });
    fetch(
      `${resolvedApiBase}/precompute/query?q=${encodeURIComponent(_preWarmQuery)}&scanId=${encodeURIComponent(String(sessionId))}`,
      { signal: AbortSignal.timeout(4000) }
    ).catch(() => {});
  } else if (!_preWarmQuery && _lastVisionQueryRef.current) {
    console.log("STALE_PRECOMPUTE_IGNORED", {
      sessionId,
      activeSessionId: scanSessionIdRef.current,
      staleQuery: _lastVisionQueryRef.current,
      reason: "no_itemHint_would_use_previous_scan_query",
    });
  }

  // Immediately kill camera state and switch to results — no flicker back to camera/watchlist.
  // Direct tab swap (no requestAnimationFrame delay) prevents the scanning stack flash.
  if (tab !== "results") {
    // Force-set tab synchronously so the next render frame shows results, not camera
    setTab("results");
    setSpatialZone("results" as ZoneKey);
    try { tabFade.setValue?.(1); } catch {}
    tabSwitchingRef.current = false;
    setTabInteractable(true);
  }

  if (batchMode) {
    setBatchCount((c) => c + 1);
    // ✅ NEVER auto-jump tabs mid-scan.
    // Batch queue should load the next item manually after the current result is done.
  }
  try {

const visionTimeout = withTimeout(25000, controller);

// ── Speculative market search — fires concurrently with vision ────────────
// Priority: itemHint → last confirmed vision query (from previous scan session)
// When vision result matches speculative query (≥50% token overlap), results
// are reused directly — saving the full sequential market request time.
let _speculativeMarketPromise: Promise<any> | null = null;
const _speculativeQuery =
  (itemHint && itemHint.trim().length >= 3)
    ? itemHint.trim().toLowerCase()
    : (_lastVisionQueryRef.current || null);

if (_speculativeQuery) {
  _speculativeMarketPromise = searchMarket(
    {
      query: _speculativeQuery,
      variants: [],
      visionConfidence: 0.5,
      visionIdentity: null,
      scannedPrice,
      category: "",
    },
    controller.signal
  ).catch(() => null);
}

// LOCK TO THE CURRENT PHOTO ONLY
// This removes stale refine-photo bleed and wrong-item query contamination.
const photosToAnalyze = [photoUri];
const targets = photosToAnalyze.slice(0, 1);

setScanStage("vision");
setScanStageMeta("Identifying item...");
// Haptic heartbeat: light "tick" when vision starts — user feels the AI working
Haptics.selectionAsync().catch(() => {});

const visionResults = await Promise.all(
  targets.map(async (uri) => {
    const v = await analyzePhotoToQuery(
      uri,
      visionTimeout.signal,
      Number.isFinite(scannedPrice) && scannedPrice > 0 ? scannedPrice : null,
      Number.isFinite(cheapestAlt) && (cheapestAlt as number) > 0 ? cheapestAlt : null,
      itemHint || null,
    );
    return v;
  })
);

// ✅ CRITICAL FIX:
// cancel the vision-only timeout immediately after vision returns.
// otherwise the shared controller can abort the scan during /market/search.
try {
  visionTimeout.cancel?.();
} catch {}

const queries: string[] = [];
const confidences: number[] = [];
const identityCandidates: any[] = [];

for (const v of visionResults) {
  if (v?.query) {
    queries.push(String(v.query));
    confidences.push(Number(v.confidence || 0));
  }

  if (v?.visionIdentity && typeof v.visionIdentity === "object") {
    identityCandidates.push(v.visionIdentity);
  }
}

const queryCounts: Record<string, number> = {};
queries.forEach((q) => {
  const cleaned = String(q || "").trim();
  if (!cleaned) return;
  queryCounts[cleaned] = (queryCounts[cleaned] || 0) + 1;
});

const rawVisionQuery =
  Object.entries(queryCounts).sort(
    (a, b) => Number(b[1] ?? 0) - Number(a[1] ?? 0)
  )[0]?.[0] || null;

const visionIdentity =
  identityCandidates.find((x) => x?.exactQuery) ||
  identityCandidates.find((x) => Array.isArray(x?.searchQueries) && x.searchQueries.length) ||
  identityCandidates[0] ||
  null;

let visionQuery =
  typeof rawVisionQuery === "string"
    ? rawVisionQuery.toLowerCase().replace(/\s+/g, " ").trim()
    : "";

// The server's top-level `query` is now produced by a high-confidence pass
// selector (visual_shape at ≥0.85 conf wins verbatim) and is more accurate
// than `visionIdentity.exactQuery`, which is a synthesized merge across
// passes that can fabricate tokens (e.g. "oval" appearing when one pass
// said "wraparound" and another said "wrap"). Only fall back to identity
// fields when the server didn't give us a usable top-level query.
if (!visionQuery || !visionQuery.trim()) {
  if (visionIdentity?.exactQuery) {
    visionQuery = cleanVisionQuery(visionIdentity.exactQuery);
  } else if (
    Array.isArray(visionIdentity?.searchQueries) &&
    visionIdentity.searchQueries.length
  ) {
    visionQuery = cleanVisionQuery(visionIdentity.searchQueries[0]);
  }
}

const mergedVisionVariants: string[] = [];

for (const v of visionResults) {
  if (Array.isArray(v?.variants)) {
    mergedVisionVariants.push(...v.variants);
  }
}

if (Array.isArray(visionIdentity?.searchQueries)) {
  mergedVisionVariants.push(...visionIdentity.searchQueries);
}

if (visionIdentity?.exactQuery) {
  mergedVisionVariants.push(visionIdentity.exactQuery);
}

const normalizedVisionQuery = cleanVisionQuery(visionQuery);

const identityFirstVariants = [
  ...new Set(
    mergedVisionVariants
      .map((x) => cleanVisionQuery(x))
      .filter(Boolean)
  ),
].filter((x) => x !== normalizedVisionQuery);

const fallbackVisionSeed = normalizedVisionQuery || visionQuery || "";

const fallbackVisionVariants =
  identityFirstVariants.length >= 3 || !fallbackVisionSeed
    ? []
    : [
        ...new Set(
          buildVisionVariants(String(fallbackVisionSeed || ""))
        ),
      ]
        .map((x) => cleanVisionQuery(x))
        .filter(Boolean);

const visionVariants = [
  ...new Set([...identityFirstVariants, ...fallbackVisionVariants]),
]
  .filter((x) => {
    const q = cleanVisionQuery(x);
    if (!q) return false;
    if (q === normalizedVisionQuery) return false;
    if (q === "glasses" || q === "eyewear") return false;
    return true;
  })
  .slice(0, 8);

devLog("RUNSCAN VISION VARIANTS →", visionVariants.length);

const rawVisionConfidence =
  confidences.length > 0
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : 0;
const visionConfidence = smoothConfidence(rawVisionConfidence);

devLog("RUNSCAN VISION QUERY →", visionQuery);
devLog("RUNSCAN VISION CONFIDENCE →", visionConfidence);

if (!visionQuery || !String(visionQuery).trim()) {
  if (
    typeof scanSessionRef.current !== "object" ||
    scanSessionRef.current === null
  ) {
    scanSessionRef.current = {};
  }

  const retries = Number(scanSessionRef.current.visionRetries || 0);

  // Collect the HTTP status from any failed vision result so we can
  // decide whether retrying makes sense (429 = rate-limited; retrying
  // immediately will keep failing and creates a tight loop).
  const lastVisionStatus = visionResults
    .map((v: any) => Number(v?._lastStatus ?? 0))
    .find((s: number) => s > 0) ?? null;
  const isRateLimited = lastVisionStatus === 429;

  if (!isRateLimited && retries < MAX_VISION_RETRIES) {
    scanSessionRef.current.visionRetries = retries + 1;
    clearTimeout(softRetryTimer);
    clearTimeout(hardStopTimer);
    clearTimeout(subwayModeTimer);
    clearTimeout(successHapticTimer);
    try { setSlowNetwork(false); } catch {}
    return runScan({
      photoUri,
      scannedPrice,
      cheapestAlt,
      countScan,
      forcedMode: forcedMode || scanMode,
      internalRetry: true,
    });
  }

  // ── SEARCH-FIRST FALLBACK ────────────────────────────────────────────────
  // Vision returned nothing. Instead of hard-failing, build a deterministic
  // query from available signals and continue to the market search pipeline.
  // The backend will use a broad search intent ladder for low-confidence queries.
  const deterministicFallback = buildDeterministicFallbackQuery({
    itemHint,
    scanMode: effectiveScanMode,
    scannedPrice,
  });

  if (deterministicFallback) {
    console.log("RUNSCAN → vision null, deterministic fallback →", deterministicFallback);
    visionQuery = deterministicFallback;
    // visionConfidence stays 0 — backend treats this as broad search intent
  } else {
    // No signals whatsoever — only fail when we have nothing to search with
    setResults([]);
    setActiveResult(null);
    setLastScan({ kind: "no-query", confidence: visionConfidence, query: null });
    showUiError(
      "Couldn’t identify item",
      "Try typing an item name before scanning, or retake the photo closer with the item filling the frame."
    );
    stopLoadingSafely(reqId);
    goTab("results");
    return;
  }
}

if (visionConfidence < CONFIDENCE_THRESHOLD) {
  // ✅ still continue (don’t hard-fail)
  setSavedToast("Low confidence — still searching…");
}
    const photoKey = await getImageCacheKey(photoUri);
    const cacheKey = `${effectiveScanMode}|${photoKey}`;

if (scanCacheRef.current.has(cacheKey)) {
  const cached = scanCacheRef.current.get(cacheKey);

  const cacheFresh =
    Boolean(cached?.timestamp) &&
    Date.now() - cached.timestamp <= CACHE_TTL_MS;

  const cachedCard = cached?.card || null;
  const cachedTop3 = Array.isArray(cached?.results) ? cached.results : [];

  // ✅ Only trust cache if it actually contains a real result card + result rows.
  const cacheHasUsableResult =
    !!cachedCard && Array.isArray(cachedTop3) && cachedTop3.length > 0;

  if (cacheFresh && cacheHasUsableResult) {
    const cachedCheapest = toNumber(
      cachedCard?.price ??
        cachedTop3?.[0]?.numericTotal ??
        cachedTop3?.[0]?.totalPrice ??
        cachedTop3?.[0]?.price
    );

    const allowCached =
      !Number.isFinite(scannedPrice) ||
      !Number.isFinite(cachedCheapest) ||
      cachedCheapest <= scannedPrice + 0.01;

    if (allowCached) {
      if (!isLiveScan() || !isCurrentSession(sessionId)) return;

      setResults(cachedTop3);
      setActiveResult(cachedCard);
      // Spatial FX: BUY → buy lighting, PASS → pass lighting, HOLD → neutral.
      try {
        const v = String(cachedCard?.buyVerdict || "").toUpperCase();
        setSpatialVerdict(v === "BUY" ? "buy" : v === "PASS" ? "pass" : null);
      } catch {}
      setLastScan(cached?.lastScan || null);
      goTab("results");

      if (countScan && !scanLockRef.current) {
        scanLockRef.current = true;
        setScansUsed((prev) => prev + 1);

        if (Number.isFinite(cachedCard?.savedAmount)) {
          setSavingsTotal((prev) => prev + cachedCard.savedAmount);
        }

        setHistory((prev) => {
          const updated = [
            {
              id: `${Date.now()}`,
              uri: photoUri,
              title: cachedCard?.itemName || "Scan",
              timestamp: new Date().toLocaleString(),
              resultCard: cachedCard,
            },
            ...prev,
          ];
          return updated;
        });
      }

      stopLoadingSafely(reqId);
      return;
    }
  }

  // ✅ Any empty / malformed / stale cache entry must be killed
  scanCacheRef.current.delete(cacheKey);
}

if (!isLiveScan()) return;

const marketController = new AbortController();
const abortMarket = () => {
  try {
    marketController.abort();
  } catch {}
};

try {
  controller.signal.addEventListener("abort", abortMarket);
} catch {}

const marketTimer = setTimeout(() => {
  if (!isLiveScan()) return;

  console.warn("MARKET REQUEST TIMEOUT", {
    ms: MARKET_REQUEST_ABORT_MS,
    visionQuery,
    reqId,
  });

  abortMarket();
}, MARKET_REQUEST_ABORT_MS);

// If speculative market ran, seed the cache when query matches vision result
if (_speculativeMarketPromise) {
  try {
    const specData = await _speculativeMarketPromise;
    if (specData?.items?.length >= 3) {
      const hintWords = (itemHint || "").toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
      const visionWords = (normalizedVisionQuery || "").toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
      const overlapCount = hintWords.filter((hw: string) => visionWords.some((vw: string) => vw.includes(hw) || hw.includes(vw))).length;
      const overlapRatio = hintWords.length ? overlapCount / hintWords.length : 0;
      if (overlapRatio >= 0.5) {
        const specKey = `${effectiveScanMode}|${normalizedVisionQuery}|${visionVariants.join("|")}`;
        MARKET_CACHE.set(specKey, specData);
        console.log("⚡ SPECULATIVE MARKET HIT — seeded cache", { overlapRatio });
      }
    }
  } catch { /* non-fatal */ }
}

const marketCacheKey = `${effectiveScanMode}|${visionQuery}|${visionVariants.join("|")}`;
const cachedMarket = MARKET_CACHE.get(marketCacheKey);

let combined: any[] = [];
let preQualityCombined: any[] = [];
let strictFiltered: any[] = [];
let strictCount = 0;
let preCount = 0;

try {
  const cachedMarketItems =
    cachedMarket && Array.isArray(cachedMarket.items)
      ? cachedMarket.items
      : [];

  // ✅ Only trust market cache if it actually has listings
  if (cachedMarketItems.length > 0) {
    combined = cachedMarketItems;
  } else {
    setScanStage("market");
    setScanStageMeta("SCANNING MARKET...");
    // Haptic heartbeat: second tick when market search starts
    Haptics.selectionAsync().catch(() => {});

    // Dynamic status injection — keeps user engaged during the search phases
    const _statusT1 = setTimeout(() => {
      if (isLiveScan()) setScanStageMeta("INVOKING ORACLE CLOUD...");
    }, 5000);
    const _statusT2 = setTimeout(() => {
      if (isLiveScan()) setScanStageMeta("FINALIZING MARKET SPECTRUM...");
    }, 9000);

    console.log("RUNSCAN -> STARTING MARKET SEARCH", {
      visionQuery,
      visionVariants,
      scannedPrice,
      visionConfidence,
    });

    let _provisionalMarketData: any = null;
    let _provisionalNavigated = false;
    let marketData: any;
    try {
      marketData = await searchMarketStream(
      {
        query: visionQuery,
        variants: visionVariants,
        visionConfidence,
        visionIdentity: visionIdentity || null,
        scannedPrice,
        category: inferCategory(visionQuery),
        sizeHint: sizeHint || null,
        scanSource: visionConfidence === 0 ? "deterministic" : "vision",
        scanMode: effectiveScanMode,
      },
      marketController.signal,
      // onProvisional: Phase 1 marketplace results
      // Phase 4: may fire twice — first from fast native API lanes (~2s),
      // second from full phase1 (~5s). _provisionalNavigated guards double-nav.
      (provData: any) => {
        if (!isLiveScan()) return;
        _provisionalMarketData = provData;
        const provCount = provData?.items?.length ?? provData?.top3?.length ?? 0;
        if (provCount >= 2) {
          // Build stage meta based on data quality signals
          const isFastLane  = provData?.enrichingReason === "serp_pending";
          const isDegraded  = provData?.degraded === true;
          const stageMeta = isDegraded
            ? `${provCount} listings — limited data`
            : isFastLane
            ? `${provCount} listings — still fetching more…`
            : `${provCount} listings found — enriching…`;
          setScanStage("analysis");
          setScanStageMeta(stageMeta);
          // Haptic heartbeat: third tick when listings land — crescendo begins
          Haptics.selectionAsync().catch(() => {});
          heartbeatPhaseRef.current = "fast";
          // Navigate to results early — _provisionalNavigated prevents double navigation
          if (!_provisionalNavigated && tabRef?.current !== "results") {
            _provisionalNavigated = true;
            requestAnimationFrame(() => { try { goTab("results"); } catch {} });
          }
        }
      },
      // onComplete: Phase 2 enriched results (oracle + sold comps)
      (_finalData: any) => { /* final data handled by return value below */ },
      // onPhase: stage transitions from server
      (phase: string) => {
        if (!isLiveScan()) return;
        if (phase === "enriching") {
          setScanStage("analysis");
          setScanStageMeta("Enriching with deeper market data…");
          heartbeatPhaseRef.current = "fast"; // crescendo: haptic pulse accelerates
        }
      },
    );
    } finally {
      clearTimeout(_statusT1);
      clearTimeout(_statusT2);
    }

    const rawItems = Array.isArray(marketData?.items) ? marketData.items : [];

    preQualityCombined = normalizeListings(
      rawItems,
      "market",
      "Marketplace",
      visionQuery
    )
      .map((i) => {
        const normalizedTotal = Number(i?.totalPrice);
        const normalizedPrice = Number(i?.numericPrice);
        const normalizedShip = Number(i?.shipping);

        const price = Number.isFinite(normalizedPrice)
          ? normalizedPrice
          : parseMoney(i?.price);

        const shipping = Number.isFinite(normalizedShip)
          ? normalizedShip
          : parseMoney(i?.shipping);

        const total = Number.isFinite(normalizedTotal)
          ? Math.round(normalizedTotal * 100) / 100
          : Number.isFinite(price)
          ? Math.round(
              (price + (Number.isFinite(shipping) ? shipping : 0)) * 100
            ) / 100
          : NaN;

        return {
          ...i,
          numericPrice: Number.isFinite(price) ? price : null,
          numericShip: Number.isFinite(shipping) ? shipping : 0,
          numericTotal: total,
          __titleNorm: String(i?.title || "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim(),
        };
      })
      .filter((i) => Number.isFinite(i?.numericTotal));

    const seenMarket = new Set<string>();
    preQualityCombined = preQualityCombined.filter((it) => {
      const key =
        String(it?.url || "").trim().toLowerCase() ||
        `${String(it?.__titleNorm || "")}|${Number(
          it?.numericTotal || 0
        )}|${String(it?.source || "").toLowerCase()}`;

      if (!key) return false;
      if (seenMarket.has(key)) return false;
      seenMarket.add(key);
      return true;
    });

    strictFiltered = qualityFilterListings(preQualityCombined, visionQuery);
    strictCount = Array.isArray(strictFiltered) ? strictFiltered.length : 0;
    preCount = Array.isArray(preQualityCombined) ? preQualityCombined.length : 0;

    if (strictCount >= 3) {
      combined = strictFiltered;
    } else if (preCount <= 3) {
      combined = preQualityCombined;
    } else {
      const relaxedQuery =
        typeof marketData?.finalQuery === "string" && marketData.finalQuery.trim()
          ? marketData.finalQuery.trim()
          : visionQuery;

      const relaxedQueryNorm = normalizeTitle(relaxedQuery);

      const relaxed = preQualityCombined
        .map((i) => {
          const titleNorm = normalizeTitle(i?.title || "");
          const simRaw = titleSimilarity(titleNorm, relaxedQueryNorm);
          const sim = Number.isFinite(simRaw) ? simRaw : 0;

          return {
            ...i,
            __titleNorm: titleNorm,
            __sim: sim,
          };
        })
        .filter(
          (i) =>
            Number.isFinite(i?.numericTotal) &&
            Number(i?.__sim || 0) >= 0.18
        )
        .sort((a, b) => {
          const simDiff = Number(b.__sim || 0) - Number(a.__sim || 0);
          if (Math.abs(simDiff) > 0.05) return simDiff;
          return Number(a.numericTotal || Infinity) - Number(b.numericTotal || Infinity);
        });

      combined = relaxed.length ? relaxed : strictFiltered.length ? strictFiltered : preQualityCombined.slice(0, 15);
    }

    // Filter-wipeout rescue: if the local quality/similarity filters dropped
    // every item but the server clearly returned listings, trust the server's
    // pre-ranked output rather than show a "No results" page. The server has
    // already deduped, outlier-trimmed, relevance-filtered and price-sorted —
    // re-filtering locally with thresholds tuned for a different scenario can
    // wipe legitimate comps (e.g. broad-category queries where local title
    // similarity drops below 0.18 even though the items are valid market comps).
    if (combined.length === 0 && rawItems.length > 0) {
      const serverFallback = normalizeListings(
        rawItems,
        "market",
        "Marketplace",
        visionQuery
      )
        .map((i) => {
          const normalizedTotal = Number(i?.totalPrice);
          const normalizedPrice = Number(i?.numericPrice);
          const price = Number.isFinite(normalizedPrice) ? normalizedPrice : parseMoney(i?.price);
          const total = Number.isFinite(normalizedTotal)
            ? Math.round(normalizedTotal * 100) / 100
            : Number.isFinite(price)
            ? Math.round(price * 100) / 100
            : NaN;
          return {
            ...i,
            numericPrice: Number.isFinite(price) ? price : null,
            numericShip: 0,
            numericTotal: total,
            __titleNorm: String(i?.title || "").toLowerCase().replace(/\s+/g, " ").trim(),
            __serverAnchored: true,
          };
        })
        .filter((i) => Number.isFinite(i?.numericTotal))
        .slice(0, 20);
      if (serverFallback.length > 0) {
        devLog("MARKET FILTER WIPEOUT → rescued from server fallback", serverFallback.length);
        combined = serverFallback;
      }
    }

    devLog("MARKET RAW COUNTS →", rawItems.length, "combined →", combined.length);

    MARKET_CACHE.set(marketCacheKey, {
      ts: Date.now(),
      items: combined,
      finalQuery:
        typeof marketData?.finalQuery === "string" && marketData.finalQuery.trim()
          ? marketData.finalQuery.trim()
          : visionQuery,
      searchedQueries: Array.isArray(marketData?.searchedQueries)
        ? marketData.searchedQueries
        : [visionQuery, ...visionVariants].slice(0, 4),
      consensus: marketData?.consensus || null,
      prediction: marketData?.prediction || null,
      coach: marketData?.coach || null,
      pulse: marketData?.pulse || null,
      // Features 8, 10
      trendIntel: marketData?.trendIntel || null,
      seasonalFlip: marketData?.seasonalFlip || null,
      authenticityIntel: marketData?.authenticityIntel || null,
      buyOrPass: marketData?.buyOrPass || null,
      scanId: marketData?.scanId ?? null,
    });
  }
} finally {
  clearTimeout(marketTimer);
  try {
    controller.signal.removeEventListener("abort", abortMarket);
  } catch {}
}

const marketMeta = MARKET_CACHE.get(marketCacheKey) || cachedMarket || null;

let collectorInsights: any = null;

// Only run collector pass for categories where it can realistically create upside.
// Do NOT block normal eyewear/apparel/everyday scans with a slow enrich call.
const collectorEligible =
  effectiveScanMode === "item" &&
  visionQuery &&
  !/glasses|eyewear|frames|sunglasses|shirt|hoodie|jacket|pants|jeans|hat|cap|shoe|sneaker/i.test(
    visionQuery
  );

if (collectorEligible) {
  try {
    setScanStage("collector");
    setScanStageMeta("Checking for hidden collector value...");

    const enrichPromise = fetchVisionEnrich(
      visionQuery,
      "item",
      "resale collector detection"
    );

    // Speed pass: hard-cap the collector enrichment wait at 500 ms (was
    // 1800 ms). The vast majority of cold enrich calls don't complete inside
    // even 1800 ms; trimming the budget moves the median scan window down by
    // ~0.5–1.3 s on collector-eligible items. When enrich is cached on the
    // server it still resolves well inside this window.
    const enrich = await Promise.race([
      enrichPromise,
      new Promise((resolve) => setTimeout(() => resolve(null), 500)),
    ]);

    if (enrich && shouldTriggerCollectorPass(enrich)) {
      const collectorQuery = buildCollectorSearchQuery(visionQuery, enrich);

      if (
        collectorQuery &&
        collectorQuery !== normalizeTitle(visionQuery)
      ) {

// Speed pass: hard-cap the collector follow-up serp at 2500 ms. Previously
// inherited the long-lived marketController.signal, which let a slow
// collector lane drag the whole render out past 8 s on bad networks.
const collectorAbortCtrl = new AbortController();
const collectorAbortTimer = setTimeout(() => collectorAbortCtrl.abort(), 2500);
const collectorRaw = await searchSerp(
  collectorQuery,
  collectorAbortCtrl.signal,
  buildVisionVariants(collectorQuery).slice(1)
).catch(() => []);
clearTimeout(collectorAbortTimer);

        const collectorCombined = [
          ...combined,
          ...normalizeListings(collectorRaw, "serp", "Google", collectorQuery),
        ]
          .map((i) => {
            const normalizedTotal = Number(i?.totalPrice);
            const normalizedPrice = Number(i?.numericPrice);
            const normalizedShip = Number(i?.shipping);

            const price = Number.isFinite(normalizedPrice)
              ? normalizedPrice
              : parseMoney(i?.price);

            const shipping = Number.isFinite(normalizedShip)
              ? normalizedShip
              : parseMoney(i?.shipping);

            const total = Number.isFinite(normalizedTotal)
              ? Math.round(normalizedTotal * 100) / 100
              : Number.isFinite(price)
              ? Math.round((price + (Number.isFinite(shipping) ? shipping : 0)) * 100) / 100
              : NaN;

            return {
              ...i,
              numericPrice: price,
              numericShip: Number.isFinite(shipping) ? shipping : 0,
              numericTotal: total,
              __titleNorm: String(i?.title || "")
                .toLowerCase()
                .replace(/\s+/g, " ")
                .trim(),
            };
          })
          .filter((i) => Number.isFinite(i.numericTotal));

        combined = qualityFilterListings(
          mergeMarketResultSets(combined, collectorCombined),
          collectorQuery
        );

        collectorInsights = {
          collectorQuery,
          collector: enrich?.collector || null,
        };
      }
    }
  } catch (e) {
    console.warn("collector pass failed:", e);
  }
}

const rankingQuery =
  typeof marketMeta?.finalQuery === "string" && marketMeta.finalQuery.trim()
    ? marketMeta.finalQuery.trim()
    : visionQuery;


const sig = extractProductSignature(rankingQuery);
const queryNorm = normalizeTitle(sig.core);
const queryTokens = [...new Set(queryNorm.split(" ").filter(Boolean))];
const combinedCountBeforeRank = Array.isArray(combined) ? combined.length : 0;

combined = (combined || [])
  .map((item) => {
    const total = Number(
      item?.numericTotal ?? item?.totalPrice ?? item?.numericPrice
    );
    const titleNorm = normalizeTitle(item?.title || "");
    const simRaw = titleSimilarity(titleNorm, queryNorm);
    const sim = Number.isFinite(simRaw) ? simRaw : 0;

    const tokenHits = queryTokens.length
      ? queryTokens.filter((tok) => titleNorm.includes(tok)).length /
        queryTokens.length
      : 0;

    const serverAnchored =
      !!item?.__fromMarketSearch ||
      (Number.isFinite(item?.__serverRank) && Number(item.__serverRank) <= 8) ||
      combinedCountBeforeRank > 0;

    const eyewearBridge =
      /(orange|amber)/.test(queryNorm) &&
      /(orange|amber)/.test(titleNorm) &&
      /(wrap|glasses)/.test(queryNorm) &&
      /(wrap|glasses|lens|lenses|sunglasses)/.test(titleNorm);

    const underUserPrice =
      Number.isFinite(scannedPrice) && Number.isFinite(total)
        ? total <= scannedPrice + 0.01
        : true;

    // Google Shopping redirect URLs (ibp=oshop) are valid product links
    // — they bounce to the merchant. The previous exclusion rejected
    // nearly every SerpAPI result and collapsed promotionPool to 1,
    // which made cheaperExact also 1 even though 6 listings were
    // cheaper than the scanned price. Only treat as unverified when
    // url is truly missing / non-string / empty.
    const linkVerified =
      item?.__linkVerified !== false &&
      typeof item?.url === "string" &&
      item.url.trim().length > 0;

const brandMatch =
  sig.brand && titleNorm.includes(sig.brand) ? 1 : 0;

const modelMatch =
  sig.model && titleNorm.includes(sig.model) ? 1 : 0;

const priceScore =
  Number.isFinite(total) && total > 0
    ? 1 / Math.max(total, 1)
    : 0;

const rankScore =
sim * 0.40 +
tokenHits * 0.20 +
brandMatch * 0.16 +
modelMatch * 0.12 +
priceScore * 0.12 +
  (serverAnchored ? 0.10 : 0) +
  (eyewearBridge ? 0.08 : 0) +
  (linkVerified ? 0.18 : -0.22) +
  (underUserPrice ? 0.06 : -0.16);

    return {
      ...item,
      __titleNorm: titleNorm,
      __sim: sim,
      __tokenHits: tokenHits,
      __serverAnchored: serverAnchored,
      __eyewearBridge: eyewearBridge,
      __underUserPrice: underUserPrice,
      __linkVerified: linkVerified,
      __rankScore: rankScore,
      __relevance: rankScore,
    };
  })
  .filter((item) => {
    const total = Number(
      item?.numericTotal ?? item?.totalPrice ?? item?.numericPrice
    );

    return (
      Number.isFinite(total) &&
      (Number(item?.__sim || 0) >= 0.18 ||
        Number(item?.__tokenHits || 0) >= 0.34 ||
        !!item?.__serverAnchored ||
        !!item?.__eyewearBridge)
    );
  })
  .sort((a, b) => {
    if (!!a.__linkVerified !== !!b.__linkVerified) {
      return a.__linkVerified ? -1 : 1;
    }

    if (!!a.__underUserPrice !== !!b.__underUserPrice) {
      return a.__underUserPrice ? -1 : 1;
    }

    if (!!a.__serverAnchored !== !!b.__serverAnchored) {
      return a.__serverAnchored ? -1 : 1;
    }

    if (
      Math.abs(Number(b.__rankScore || 0) - Number(a.__rankScore || 0)) > 0.03
    ) {
      return Number(b.__rankScore || 0) - Number(a.__rankScore || 0);
    }

    return Number(a.numericTotal || Infinity) - Number(b.numericTotal || Infinity);
  });

const promotedPool = (combined || []).filter(
  (item) => item.__linkVerified !== false
);
const promotionPool =
  promotedPool.length > 0 ? promotedPool : Array.isArray(combined) ? combined : [];

const comparableTop3 = promotionPool.slice(0, 3);

const cheaperExactMatches = promotionPool.filter((item) => {
  if (!item) return false;

  const price =
    Number.isFinite(item?.totalPrice)
      ? item.totalPrice
      : item?.price;

  if (!Number.isFinite(price)) return false;

  // if scanned price unknown, show items anyway
  if (!scannedPrice) return true;

  // allow near matches so results don't disappear
  return price <= scannedPrice * 1.8;
});

const cheaperRescueMatches = Number.isFinite(scannedPrice)
  ? promotionPool.filter((item) => {
      const total = Number(
        item?.numericTotal ?? item?.totalPrice ?? item?.numericPrice
      );

      return (
        Number.isFinite(total) &&
        total <= Number(scannedPrice) + 0.01 &&
        (Number(item?.__sim || 0) >= 0.2 ||
          Number(item?.__tokenHits || 0) >= 0.28 ||
          !!item?.__serverAnchored ||
          !!item?.__eyewearBridge)
      );
    })
  : [];

const rankedPool = [
  ...cheaperExactMatches,
  ...cheaperRescueMatches,
  ...comparableTop3,
]
  .filter(Boolean)
  .sort((a, b) => {
    const priceA = Number.isFinite(a?.totalPrice) ? a.totalPrice : (a?.price ?? Infinity);
    const priceB = Number.isFinite(b?.totalPrice) ? b.totalPrice : (b?.price ?? Infinity);

    const simA = Number(a?.__sim || 0);
    const simB = Number(b?.__sim || 0);

    const verifiedA = a?.__linkVerified ? 1 : 0;
    const verifiedB = b?.__linkVerified ? 1 : 0;

    // Premium anchors (>2.5x scanned price) always go last — they're context, not deals
    if (Number.isFinite(scannedPrice)) {
      const threshold = scannedPrice * 2.5;
      const aPrem = priceA > threshold;
      const bPrem = priceB > threshold;
      if (aPrem !== bPrem) return aPrem ? 1 : -1;
    }

    // Among non-anchors: cheapest first
    if (priceA !== priceB) return priceA - priceB;

    // Tiebreak: better visual match, then verified link
    if (simA !== simB) return simB - simA;
    return verifiedB - verifiedA;
  });

const top3 = rankedPool.slice(0, 3);

try { console.log("FRONTEND_RESULT_STATE_AFTER_MERGE", { rankedPoolCount: rankedPool.length, top3Count: top3.length, top5: top3.slice(0,5).map((i: any)=>({title:i?.title,price:i?.price,source:i?.source})) }); } catch {}

console.log("TOP3 DECISION →", {
  scannedPrice,
  promotionPool: promotionPool.length,
  cheaperExact: cheaperExactMatches.length,
  cheaperRescue: cheaperRescueMatches.length,
  top3: top3.length,
});

const promotedVisionQuery =
  typeof marketMeta?.finalQuery === "string" && marketMeta.finalQuery.trim()
    ? marketMeta.finalQuery.trim()
    : typeof top3?.[0]?.__finalQuery === "string" && top3[0].__finalQuery.trim()
    ? top3[0].__finalQuery.trim()
    : rankingQuery;

const searchedQueries =
  Array.isArray(marketMeta?.searchedQueries) && marketMeta.searchedQueries.length
    ? marketMeta.searchedQueries
    : [
        ...new Set(
          [
            promotedVisionQuery,
            ...visionVariants,
            ...buildVisionVariants(promotedVisionQuery),
          ].filter(Boolean)
        ),
      ].slice(0, 6);

const marketConsensus = marketMeta?.consensus || null;
const marketPrediction = marketMeta?.prediction || null;
const marketCoach = marketMeta?.coach || null;
const marketPulse = marketMeta?.pulse || null;
// Features 8, 10
const marketTrendIntel = marketMeta?.trendIntel || null;
const marketSeasonalFlip = marketMeta?.seasonalFlip || null;
const marketAuthenticityIntel = marketMeta?.authenticityIntel || null;
// Feature 4: eBay sold comps; Feature 5: local comps
const marketEbaySoldComps = marketMeta?.ebaySoldComps || null;
const marketLocalComps = marketMeta?.localComps || null;

const comparablePool = chooseComparableDisplayPool(combined, scannedPrice, 60);

const displayPool =
  comparablePool.length > 0
    ? comparablePool
    : Array.isArray(combined)
    ? combined.slice(0, 60)
    : [];

if (!isLiveScan()) return;

setSeeMoreListings(displayPool);

if (top3.length === 0) {
  const fallbackTop3 = displayPool.slice(0, 3);

  // Distinguish three real states instead of blanket "no results":
  //
  //   below-market : we have items, all priced above the user's scanned price
  //                  → they have the best price. This is a STEAL, not a failure.
  //   no-cheaper   : we have items, mixed prices, but local filters couldn't
  //                  find clear "cheaper alternative" matches. Surface the
  //                  items silently as market context.
  //   no-data      : we truly have nothing — server returned empty AND the
  //                  filter wipeout rescue couldn't recover. This is the
  //                  only state that warrants a hard error.
  //
  // Previously every empty top3 fell through to a confusing "No results
  // found" screen even when the user genuinely had the cheapest price.

  const poolPrices = displayPool
    .map((it: any) => Number(it?.totalPrice ?? it?.numericTotal ?? it?.price))
    .filter((n: number) => Number.isFinite(n) && n > 0);
  const minPoolPrice = poolPrices.length ? Math.min(...poolPrices) : null;
  const userBeatsMarket =
    Number.isFinite(scannedPrice) &&
    minPoolPrice != null &&
    scannedPrice < minPoolPrice;

  const scanKind =
    fallbackTop3.length === 0
      ? "no-data"
      : userBeatsMarket
      ? "below-market"
      : "no-cheaper";

  setResults(fallbackTop3);
  setActiveResult(fallbackTop3[0] || null);
  setLastScan({
    kind: scanKind,
    confidence: visionConfidence,
    query: promotedVisionQuery || rankingQuery,
    results: displayPool.slice(0, 5),
    ...(userBeatsMarket && minPoolPrice != null
      ? { alreadyCheaperBy: Math.max(0, minPoolPrice - scannedPrice) }
      : {}),
  });

  // Only hard-error when truly nothing came back. Mid-states (we have items
  // but no clear cheaper alts) render the items silently as context.
  if (scanKind === "no-data") {
    const haveMarketIntel = !!(marketConsensus || marketPrediction || marketPulse);
    showUiError(
      haveMarketIntel ? "Couldn't fetch live comparables" : "Market unavailable",
      haveMarketIntel
        ? "We have partial market intel for this item but no fresh listings right now. Try again in a moment."
        : "Couldn't reach the market right now. Check your connection and rescan."
    );
  } else if (userBeatsMarket && minPoolPrice != null) {
    // Celebratory banner — the user already has the best price.
    setPriceChangeBanner(
      `🎯 You beat the market by ${money(minPoolPrice - scannedPrice)} — cheapest comp is ${money(minPoolPrice)}`
    );
  }

  stopLoadingSafely(reqId);
  goTab("results");
  return;
}

const cheapest = top3[0];
const cheapestPrice = toNumber(cheapest.totalPrice ?? cheapest.price);

// Raw delta: positive = you saved, negative = you’re already cheaper than market
const rawDelta =
  Number.isFinite(scannedPrice) && Number.isFinite(cheapestPrice)
    ? scannedPrice - cheapestPrice
    : 0;

// Saved (only when market is cheaper than what you pay)
const savedAmount = Math.max(0, rawDelta);

// If you’re already cheaper, show this (positive number)
const alreadyCheaperBy = Math.max(0, -rawDelta);

// % cheaper should NEVER go negative in UI
const cheaperPct =
  Number.isFinite(scannedPrice) && scannedPrice > 0 && rawDelta > 0
    ? (rawDelta / scannedPrice) * 100
    : 0;

// -------------------------
// ✅ Market snapshot computation (STEP 5)
// -------------------------
setScanStage("analysis");
setScanStageMeta(`Analyzing ${combined.length} live listings...`);

const spread = getMarketSpread(combined);
const marketPrice = spread?.avg ?? cheapestPrice;
const stats = buildRealMarketIntel(combined, cheapestPrice);
const flipPotential = flipScore({
  scannedPrice,
  cheapestPrice,
  estimatedResale: stats.estimatedResale,
});

const wlMatch = (watchlistRef.current || []).find((x) => x.query === visionQuery);
const wlPoints = Array.isArray(wlMatch?.history)
  ? wlMatch.history.map((p) => toNumber(p?.best)).filter((n) => Number.isFinite(n))
  : [];
const category = inferCategory(promotedVisionQuery || cheapest.title);

const insights = computeInsights({
  scannedPrice,
  cheapestPrice,
  avgMarket: stats.avgMarket ?? marketPrice,
  low: spread?.low ?? stats.historicalLow,
  high: spread?.high ?? stats.historicalHigh,
  confidence: visionConfidence,
  totalMatches: combined.length,
  url: cheapest.url,
  historyPoints: wlPoints,
});

const expectedResale =
  Number.isFinite(marketPrediction?.estimatedResale)
    ? Number(marketPrediction.estimatedResale)
    : stats.estimatedResale;

const expectedProfit =
  Number.isFinite(marketPrediction?.expectedProfit)
    ? Number(marketPrediction.expectedProfit)
    : Number.isFinite(scannedPrice) && Number.isFinite(expectedResale)
    ? Math.max(0, expectedResale - scannedPrice)
    : null;

const flipScoreValue =
  Number.isFinite(marketPrediction?.flipScore)
    ? Number(marketPrediction.flipScore)
    : null;

const liquidity =
  typeof marketPrediction?.demand === "string" && marketPrediction.demand.trim()
    ? marketPrediction.demand.trim()
    : combined.length > 40
    ? "Very High"
    : combined.length > 20
    ? "High"
    : combined.length > 8
    ? "Medium"
    : "Low";

const sellThroughProbability =
  Number.isFinite(marketPrediction?.sellThroughProbability)
    ? Number(marketPrediction.sellThroughProbability)
    : null;

const sellThroughDays =
  Number.isFinite(marketPrediction?.sellThroughDays)
    ? Number(marketPrediction.sellThroughDays)
    : null;

const card = {
  rankWhy: [
  "Lowest price across marketplaces",
  "High listing confidence",
  "Seller signals strong",
],
scanWhy: [
  "Vision matched brand + model",
  "Listings aligned with item",
  "Confidence score validated",
],
  photoUri,
  itemName: cheapest.title || visionQuery,
  store: cheapest.source || "Marketplace",
  price: cheapestPrice,
  buyLink: cheapest.url,
  image: cheapest.image || null,

  scannedPrice,
  savedAmount,
  cheaperPct,
  expectedResale,
  expectedProfit,
  flipScore: flipScoreValue,
  marketLiquidity: liquidity,
  sellThroughProbability,
  sellThroughDays,
  alreadyCheaperBy,
  visionConfidence,
  visionQuery: promotedVisionQuery,
  visionVariants,
  searchedQueries,
  alternatives: top3,
  historicalLow: stats.historicalLow,
  historicalHigh: stats.historicalHigh,
  avgMarket: stats.avgMarket,
  estimatedResale: expectedResale,
  medianMarket: Number.isFinite(marketPrediction?.medianPrice)
    ? Number(marketPrediction.medianPrice)
    : stats.medianMarket,
  marketConsensus,
  marketPrediction,
  coachLine: marketCoach?.headline || null,
  coachBullets: Array.isArray(marketCoach?.bullets) ? marketCoach.bullets : [],
  pulseScore: Number.isFinite(marketPulse?.score) ? Number(marketPulse.score) : null,
  pulseLabel: typeof marketPulse?.label === "string" ? marketPulse.label : null,
  coachSummary:
    typeof marketCoach?.headline === "string" ? marketCoach.headline : null,
  coachCta:
    Array.isArray(marketCoach?.bullets) && marketCoach.bullets[0]
      ? marketCoach.bullets[0]
      : null,

  pulseScans24h:
    Number.isFinite(marketPulse?.scans24h) ? Number(marketPulse.scans24h) : 0,
  flipScoreValue: stats.flipScoreValue,
  flipPotential,
  totalMatches: combined.length,

  // ✅ INTELLIGENCE LAYER (Month 5–6)
  category,
  collectorInsights,
  ...insights,

  // Features 3 & 4: condition label + chart placeholder
  conditionLabel: visionIdentity?.condition || null,
  priceChartPoints: null, // fetched lazily by PriceHistoryChart using itemName

  // Feature 8: best time to buy
  trendIntel: marketTrendIntel,
  seasonalFlip: marketSeasonalFlip,

  // Feature 10: authenticity
  authenticityIntel: marketAuthenticityIntel,
  // Feature 4: eBay sold comps
  ebaySoldComps: marketEbaySoldComps,
  // Feature 5: local / hyperlocal comps
  localComps: marketLocalComps,

  // ── Neural Bridge — normalized scan contract (services/scanService.ts) ────
  /** Vision certainty 0–1, mirrors visionConfidence */
  confidenceScore: visionConfidence,
  /** Average market resale price across all live listings */
  marketPrice: stats.avgMarket ?? cheapestPrice,
  /**
   * Flip profit margin %: (expectedProfit / scannedPrice) × 100.
   * Positive = profitable flip. Null when price inputs are missing.
   */
  profitMargin: (() => {
    if (!Number.isFinite(scannedPrice) || !(scannedPrice as number) || !Number.isFinite(expectedProfit)) return null;
    return Math.round(((expectedProfit as number) / (scannedPrice as number)) * 100);
  })(),
  /**
   * Preliminary authenticity flag from authenticityIntel.
   * true = likely authentic, false = suspicious/fake, null = not assessed.
   */
  isAuthentic: (() => {
    if (!marketAuthenticityIntel) return null;
    const v = String(marketAuthenticityIntel?.verdict || "").toLowerCase();
    if (v === "likely_authentic" || v === "authentic") return true;
    if (["likely_fake", "suspicious", "counterfeit"].includes(v)) return false;
    return null;
  })(),
  // Server-generated scan ID — used by outcome tracking (DecisionSheet, OutcomeEditorSheet)
  scanId: (marketMeta as any)?.scanId ?? null,
};

// ── Deal Engine: orchestrator-driven pipeline ────────────────────────────────
// All business logic (deal engine, paywall, momentum, phase transitions)
// flows through the orchestrator → brain store. Zero local state.
try {
  const dealInput = {
    scannedPrice: Number.isFinite(scannedPrice) ? scannedPrice : null,
    cheapestPrice: Number.isFinite(cheapestPrice) ? cheapestPrice : null,
    avgMarket: stats.avgMarket ?? null,
    spreadLow: spread?.low ?? null,
    spreadHigh: spread?.high ?? null,
    estimatedResale: Number.isFinite(expectedResale) ? expectedResale : null,
    expectedProfit: Number.isFinite(expectedProfit) ? expectedProfit : null,
    visionConfidence,
    visionSource: visionIdentity?.source ?? null,
    totalMatches: combined.length,
    store: cheapest.source || null,
    category,
    buyScore: insights.buyScore,
    buyVerdict: insights.buyVerdict,
    resaleVelocity: insights.resaleVelocity,
    liquidity,
    dataTimestamp: Date.now(),
  };

  // ── Orchestrator: single entry point for the entire scan pipeline ──────
  // Runs deal engine → fast verdict → dopamine phase → deep analysis →
  // aspiration → paywall decision. All state goes through brain store.
  const scanOutcome = orchestrator.handleScan(dealInput);

  if (scanOutcome) {
    const { dealResult } = scanOutcome;

    (card as any).dealResult = dealResult;
    (card as any).hotDeal = dealResult.hot_deal;

    // ── Viral Hook: attach share text for HOT+ deals ─────────────────
    if (dealResult.viralHook) {
      (card as any).viralHook = dealResult.viralHook;
    }

    // Deal Engine has higher conviction than the heuristic — let it override.
    // Only BUY and PASS override; HOLD is reached only when nothing else fires,
    // so the engine's "CHECK" intentionally does not promote.
    if (dealResult.fast.verdict === "BUY" && card.buyVerdict !== "BUY") {
      (card as any).buyVerdict = "BUY";
    } else if (dealResult.fast.verdict === "PASS" && card.buyVerdict !== "PASS") {
      (card as any).buyVerdict = "PASS";
    }
  }
} catch {}

// =========================
// SAVE + COUNT SCAN (ONCE)
// =========================

if (countScan && !scanLockRef.current) {
  scanLockRef.current = true;

  // Server-side consume — dedup by imageHash prevents double-counting same photo
  if (!isPro) {
    const apiBase = process.env.EXPO_PUBLIC_API_URL ??
      (Platform.OS === "ios" ? "http://192.168.1.227:3001" : "http://10.0.2.2:3001");
    const effectiveId = userId || guestId || installId;
    const imgHash = await getImageCacheKey(photoUri).catch(() => "");
    fetch(`${apiBase}/api/scan/consume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(userId ? { userId } : { guestId: effectiveId }),
        imageHash: imgHash,
      }),
    }).then(r => r.json()).then(data => {
      if (data?.resetAt) setScanResetAt(data.resetAt);
      if (data?.scansUsed != null) setScansUsed(data.scansUsed);
    }).catch(() => {});
  }

  // consume bonus scan first (local)
  if (!isPro && Number(bonusScans || 0) > 0) {
    setBonusScans((prev) => {
      const next = Math.max(0, (Number(prev) || 0) - 1);
      AsyncStorage.setItem(K.bonusScans, String(next));
      return next;
    });
  } else {
    setScansUsed((prev) => prev + 1);
  }

  // Phase 7: persist the card under the v3 contract — top-level
  // canonical verdict, _schemaVersion: 3, legacy strings archived
  // under .legacy. normalizeStoredScanV3 returns dropped:true if no
  // canonical verdict can be derived; in that case we skip the write
  // rather than persisting a record the next load would reject.
  try {
    const v3 = normalizeStoredScanV3(card, { source: "save:EVAN_LAST_RESULT_V1", telemetry: false });
    const cardForDisk = v3.dropped ? card : v3.scan;
    AsyncStorage.setItem("EVAN_LAST_RESULT_V1", JSON.stringify({
      card: cardForDisk, savedAt: Date.now(), photoUri,
    })).catch(() => {});
  } catch {
    AsyncStorage.setItem("EVAN_LAST_RESULT_V1", JSON.stringify({
      card, savedAt: Date.now(), photoUri,
    })).catch(() => {});
  }

  if (Number.isFinite(card.savedAmount)) {
    setSavingsTotal((prev) => {
      const next = prev + card.savedAmount;
      AsyncStorage.setItem(SAVINGS_STORAGE_KEY, String(next));
      setSavedToast(`+$${card.savedAmount?.toFixed?.(2) || 0} saved`);
      return next;
    });
  }

  // Feature 5: push latest scan data to iOS home screen widget
  updateWidgetData({
    bestDealName:  card.itemName  || "",
    bestDealPrice: card.price     ?? 0,
    scanCount:     (scansUsed || 0) + 1,
    totalSavings:  (savingsTotal  || 0) + (card.savedAmount || 0),
    // todaySavings is accumulated over multiple widget calls via merge cache
    todaySavings:  card.savedAmount > 0 ? card.savedAmount : undefined,
  }).catch(() => {});

  setHistory((prev) => [
    {
      id: `${Date.now()}`,
      uri: photoUri,
      title: card.itemName || "Scan",
      timestamp: new Date().toLocaleString(),
      resultCard: card,
    },
    ...prev,
  ]);
}

setResults(top3);
setActiveResult(card);
// Spatial FX: BUY → buy lighting, PASS → pass lighting, HOLD → neutral.
try {
  const v = String(card?.buyVerdict || "").toUpperCase();
  setSpatialVerdict(v === "BUY" ? "buy" : v === "PASS" ? "pass" : null);
} catch {}

// ── Revenue: track scan complete ──────────────────────────────────────────
try {
  const _scanId   = String((card as any)?.scanId || Date.now());
  const _itemName = card?.itemName || card?.visionQuery || "";
  const _price    = Number.isFinite(Number(card?.price)) ? Number(card.price) : null;
  const _verdict  = card?.buyVerdict ?? null;
  const _saved    = Number.isFinite(card?.savedAmount) ? Number(card.savedAmount) : 0;
  const _flip     = Number.isFinite(card?.expectedProfit) ? Number(card.expectedProfit) : null;
  const _tier     = isPro ? ("plus" as const) : ("free" as const);

  EventTracker.trackScanComplete(_scanId, _itemName, _price, _verdict);

  // ── Finance Layer: record into persistent finance state ────────────────
  recordFinanceScan(
    _saved,
    _flip,
    _verdict,
    Number.isFinite(card?.scannedPrice) ? Number(card.scannedPrice) : null
  );

  // ── Finance Analytics: funnel event ───────────────────────────────────
  FinanceAnalytics.recordScanCompleted(
    userId ?? null,
    _scanId,
    _tier,
    _itemName,
    _price,
    _saved,
    _flip,
    _verdict
  );

  // ── Deal Engine _meta: commission/ROI tracking ─────────────────────────
  const _dealMeta = (card as any)?.dealResult?._meta;
  if (_dealMeta) {
    FinanceAnalytics.recordDealMeta?.(
      _scanId,
      _dealMeta.potential_commission,
      _dealMeta.roi_percentage,
      _dealMeta.processing_ms
    );
  }

  // ── Hot Deal Layer: tier engagement tracking ────────────────────────────
  const _hotDeal = (card as any)?.hotDeal;
  if (_hotDeal?.tier) {
    FinanceAnalytics.recordHotDealTier(
      _scanId,
      _hotDeal.tier,
      _hotDeal.score,
      _hotDeal.isTriggered
    );
  }
} catch {}

// Track for Flip Fatigue + Rivalry + Dead Stock
if (card?.category) trackCategoryScan(card.category);
// Fetch rivalry count
try {
  apiFetch("/intel/rivalry", {
    method: "POST",
    body: JSON.stringify({
      query: card?.itemName || "",
      category: card?.category || "",
      userId: userId || "anon",
    }),
  }).then((r: any) => { if (r?.count > 0) setRivalryCount(r.count); }).catch(() => {});
} catch {}
// Check dead stock
if (card?.price && (card as any)?.daysListed) {
  apiFetch("/intel/dead-stock", {
    method: "POST",
    body: JSON.stringify({
      listingPrice: card.price,
      daysListed: (card as any).daysListed,
      avgMarket: (card as any).avgMarket,
      itemName: card.itemName,
    }),
  }).then((r: any) => { if (r?.isDeadStock) setDeadStockData(r); else setDeadStockData(null); }).catch(() => {});
} else {
  setDeadStockData(null);
}
setRivalryCount(0); // reset until rivalry API responds

// Feature 9: ghost check
if (card) runGhostCheck(card);

// Feature 11 + 12: Lazy deep-auth + condition-assess using the scan photo
// Reset previous scan results first, then fire after a short delay
// (let the main result UI settle before adding load)
setDeepAuthResult(null);
setConditionAssessment(null);
setCommunityComps(null);
setHaggleResult(null);
setDupeScan(null);
setSaturation(null);
setIntelExpanded(false);
setMoreDetailsOpen(false);

// Feature 13: duplicate scan warning
if (card?.itemName) checkDuplicateScan(card.itemName, card.price ?? 0);
// Feature 15: category saturation
if (card?.itemName) checkCategorySaturation(card.itemName);
if (photoUri && (card?.category || (card as any)?.visionIdentity?.brand || (card as any)?.brand)) {
  const _photoUri     = photoUri;
  const _brand        = (card as any)?.visionIdentity?.brand || (card as any)?.brand || "";
  const _category     = (card as any)?.category || "";
  const _condition    = (card as any)?.visionIdentity?.condition || (card as any)?.conditionLabel || "good";
  const _marketPrice  = (card as any)?.price || null;
  const _knownTells   = (card as any)?.authenticityIntel?.knownFakeTells || [];

  // Start both lazily with a stagger so they don't race the main render
  setTimeout(async () => {
    try {
      const compressed = await ImageManipulator.manipulateAsync(
        _photoUri,
        [{ resize: { width: 900 } }],
        { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      const b64 = compressed.base64;
      if (!b64) return;

      const apiBase = process.env.EXPO_PUBLIC_API_URL ??
        (Platform.OS === "ios" ? "http://192.168.1.227:3001" : "http://10.0.2.2:3001");

      // Feature 11: deep auth (only for brand items — not worth it for generic)
      if (_brand || ["sneakers","luxury","bag","watch","eyewear"].includes(_category)) {
        setDeepAuthLoading(true);
        fetch(`${apiBase}/api/auth/deep-scan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: b64, brand: _brand, category: _category, knownFakeTells: _knownTells }),
          signal: abortAfter(30000),
        })
          .then((r) => r.json())
          .then((json) => { if (json?.ok) setDeepAuthResult(json); })
          .catch(() => {})
          .finally(() => setDeepAuthLoading(false));
      }

      // Feature 12: condition assessment (only when condition label is known)
      if (_condition) {
        setConditionAssessLoading(true);
        fetch(`${apiBase}/api/condition/visual-assess`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: b64, statedCondition: _condition, category: _category, marketPrice: _marketPrice }),
          signal: abortAfter(30000),
        })
          .then((r) => r.json())
          .then((json) => { if (json?.ok) setConditionAssessment(json); })
          .catch(() => {})
          .finally(() => setConditionAssessLoading(false));
      }

      // Feature 13: community comps — fetch for this item query
      const _compQuery = (card as any)?.visionQuery || (card as any)?.itemName || null;
      if (_compQuery) {
        setCommunityCompsLoading(true);
        setCommunityComps(null);
        fetch(`${apiBase}/api/community/comps?query=${encodeURIComponent(_compQuery)}`, {
          signal: abortAfter(8000),
        })
          .then((r) => r.json())
          .then((json) => { if (json?.ok) setCommunityComps(json as CommunityCompsData); })
          .catch(() => {})
          .finally(() => setCommunityCompsLoading(false));
      }

      // Feature 2: Haggle score — fire when scanned price is known
      const _scannedPrice = (card as any)?.scannedPrice ?? null;
      if (_compQuery && _scannedPrice && Number(_scannedPrice) > 0) {
        setHaggleLoading(true);
        fetch(`${apiBase}/api/haggle/score`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: _compQuery,
            currentPrice: Number(_scannedPrice),
            category: _category || "",
          }),
          signal: abortAfter(20000),
        })
          .then((r) => r.json())
          .then((json) => { if (json?.ok) setHaggleResult(json as HaggleScoreResult); })
          .catch(() => {})
          .finally(() => setHaggleLoading(false));
      }
    } catch { /* non-fatal */ }
  }, 1200);
}

try {
  const acb = Number(card?.alreadyCheaperBy || 0);
  if (Number.isFinite(acb) && acb > 0.01) {
    setPriceChangeBanner(
      `✅ You’re already cheaper than the market by ${money(acb)}`
    );
  } else {
    setPriceChangeBanner(null);
  }
} catch {
  setPriceChangeBanner(null);
}

// Golden Moment animation
requestAnimationFrame(() => {
  try {
    setCinematicFreeze(true);

    RNAnimated.sequence([
      RNAnimated.timing(freezeOpacity, {
        toValue: 1,
        duration: 140,
        useNativeDriver: true,
      }),
      RNAnimated.timing(freezeOpacity, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCinematicFreeze(false);
    });

    playNeuralLock();
  } catch {}
});

trackEvent("scan_success", {
  query: promotedVisionQuery,
  confidence: visionConfidence,
  cheapest: cheapestPrice,
});

setLastScan({
  kind: "success",
  confidence: visionConfidence,
  query: promotedVisionQuery,
  results: top3,
});

goTab("results");
stopLoadingSafely(reqId);

// DS.ts success chime — synchronized with results reveal
SoundEffect.chime();

scanCacheRef.current.set(cacheKey, {
  timestamp: Date.now(),
  results: top3,
  card,
  lastScan: {
    kind: "cached",
    confidence: visionConfidence,
    query: visionQuery,
    results: top3,
  },
});

setIntelState((prev) => {
  const best = Array.isArray(top3) ? top3[0] : null;

  const next = intelLog(prev, {
    type: "scan",
    confidence: visionConfidence,
    savings: safeNum(card?.savedAmount),
    store: best?.store,
    category: best?.category,
    title: best?.title,
    verdict: verdictFromPrices(
      safeNum(scannedPrice),
      safeNum(spread?.low),
      safeNum(spread?.high)
    ),
  });

  saveIntel(next);
  return next;
});

} catch (e) {
  if (e?.name === "AbortError") {
    // cancel/hard-timeout path: keep it clean (no crash UI)
    stopLoadingSafely(reqId);
    return;
  }

console.warn("runScan error:", e);

const errMsg =
  typeof e?.message === "string" && e.message.trim()
    ? e.message.trim()
    : "Unknown error";

setLastScan({
  kind: "error",
  message: errMsg,
});

const isOffline = (e?.name === "AbortError") || (e?.message || "").toLowerCase().includes("network");
showUiError(
  errMsg.includes("preQualityCombined")
    ? "Frontend ranking bug"
    : isOffline ? "No connection" : "Scan failed",
  errMsg.includes("preQualityCombined")
    ? "The scan data came back, but the app crashed while ranking results. Apply the market ranking scope fix and reload."
    : isOffline
    ? "Can't reach server — check your Wi-Fi and try again."
    : `Scan pipeline error: ${errMsg}`
);

stopLoadingSafely(reqId);
} finally {
  clearTimeout(softRetryTimer);
  clearTimeout(hardStopTimer);
  clearTimeout(subwayModeTimer);
  clearTimeout(successHapticTimer);
  try { setSlowNetwork(false); } catch {}
}
};

// Keep the offline queue's runScan reference current (resolves forward reference)
// eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => { _queueRunScanRef.current = runScan; });

// ── Feature 2: processBatchItem — runs vision + market search for one job ────
// Called from the auto-processor useEffect below.
// Updates the queue item in-place with status + result fields.
const batchProcessingRef = React.useRef(false);

const processBatchItem = async (jobId: string) => {
  if (!isMountedRef.current) return;

  // Per-item scan-limit gate. The auto-processor used to run identify +
  // market for every queued photo without ever incrementing scansUsed,
  // which let a user enqueue N items while under budget and then process
  // the remainder for free after hitting the limit. We now refuse to
  // process any item while the user is over the limit and bail to the
  // paywall — same UX shape as the shutter / use-photo gates. The
  // scansUsed bump on success ensures each successful batch item costs
  // exactly one free scan, identical to a regular runScan path.
  if (isFreeLimitReached) {
    setBatchQueue((prev) => {
      const next = prev.map((j) =>
        j.id === jobId
          ? { ...j, status: "error" as BatchJobStatus, errorMsg: "Free scan limit reached" }
          : j
      );
      saveBatchQueue(next);
      return next;
    });
    bailScanForPaywall("batch_process");
    console.log("SCAN_LIMIT_BLOCKED", { source: "batch_process", jobId });
    return;
  }

  // Mark as scanning
  setBatchQueue((prev) => {
    const next = prev.map((j) =>
      j.id === jobId ? { ...j, status: "scanning" as BatchJobStatus } : j
    );
    saveBatchQueue(next);
    return next;
  });

  try {
    // Snapshot the URI from the queue
    const queue: BatchJob[] = await loadBatchQueue();
    const job = queue.find((j) => j.id === jobId);
    if (!job?.uri) throw new Error("job_not_found");

    // Run vision analysis (lightweight — no scanned price, no hint)
    const ctrl = new AbortController();
    const visionData: any = await analyzePhotoToQuery(job.uri, ctrl.signal, null, null, null);

    const query: string =
      visionData?.query || visionData?.bestQuery || visionData?.title || "";
    const visionConfidence: number = visionData?.confidence ?? 0.5;
    const visionIdentity: any     = visionData?.identity   ?? null;
    const category: string        = visionData?.category   ?? "";

    if (!query) throw new Error("no_query");

    // Run market search
    const marketData = await searchMarket(
      { query, variants: visionData?.variants || [], visionConfidence, visionIdentity, category },
      ctrl.signal,
    );

    const best: any = marketData?.best || marketData?.items?.[0] || null;
    const bestPrice: number | null = marketData?.bestPrice ?? best?.totalPrice ?? best?.price ?? null;

    const result = {
      itemName:         query,
      store:            best?.store || best?.source || null,
      price:            bestPrice,
      buyLink:          best?.buyLink || best?.url || null,
      image:            best?.image || best?.thumbnail || null,
      buyVerdict:       marketData?.buyOrPass?.verdict || null,
      buyScore:         marketData?.buyOrPass?.score   || null,
      savedAmount:      null,
      visionConfidence,
    };

    setBatchQueue((prev) => {
      const next = prev.map((j) =>
        j.id === jobId
          ? {
              ...j,
              status:      "done" as BatchJobStatus,
              itemName:    query,
              price:       bestPrice,
              verdict:     result.buyVerdict,
              savedAmount: null,
              result,
            }
          : j
      );
      saveBatchQueue(next);
      return next;
    });

    // Successful batch item = 1 free scan consumed. Bumps client + server
    // counters so the user can't drain the queue for free by closing the
    // app between items.
    consumeFreeScan("batch_process");
  } catch (err: any) {
    if (err?.name === "AbortError") return;
    setBatchQueue((prev) => {
      const next = prev.map((j) =>
        j.id === jobId
          ? { ...j, status: "error" as BatchJobStatus, errorMsg: err?.message || "Scan failed" }
          : j
      );
      saveBatchQueue(next);
      return next;
    });
  }
};

// Feature 2: Auto-process queued batch items one at a time.
// Effect-level gate on isFreeLimitReached: when the user runs out of free
// scans, the auto-processor halts even if items remain in the queue. The
// per-item processBatchItem gate below is the belt-and-suspenders second
// layer. As soon as the user upgrades or the free counter resets, this
// effect re-fires (limit dependency) and resumes processing.
useEffect(() => {
  if (!batchMode) return;
  if (isFreeLimitReached) return;
  const pending = batchQueue.find((j) => !j.status || j.status === "queued");
  const inFlight = batchQueue.some((j) => j.status === "scanning");
  if (!pending || inFlight || batchProcessingRef.current) return;
  batchProcessingRef.current = true;
  processBatchItem(pending.id).finally(() => {
    batchProcessingRef.current = false;
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [batchQueue, batchMode, isFreeLimitReached]);

  // ─── Offline support — handled by useNetworkStatus + useOfflineQueue hooks ──
  // (checkServerReachable / queueOfflineScan / drainOfflineQueue replaced)

  const handleUsePhoto = async () => {
    if (!photo?.uri) return;
    if (!canUsePhoto) return;
    const scannedPrice = toNumber(scanPriceInput);
    if (!Number.isFinite(scannedPrice) || scannedPrice <= 0) return;
    // cheapestAltInput is optional (input removed from UI) — pass null when absent
    const cheapestAltRaw = toNumber(cheapestAltInput);
    const cheapestAlt = Number.isFinite(cheapestAltRaw) && cheapestAltRaw > 0 ? cheapestAltRaw : null;
    if (isFreeLimitReached) {
      bailScanForPaywall("use_photo");
      return;
    }

hapticSelect();
setPriceSubmitted(true);
Keyboard.dismiss();

const photoUri = photo.uri;
const itemHint = sanitizeHint(itemNameInput) || null;
const sizeHintVal = sanitizeHint(sizeInput) || null; // Feature 11

// ── Offline check ──────────────────────────────────────────────────────
const currentlyOnline = await checkNetworkNow();
if (!currentlyOnline) {
  setPhoto(null);
  setScanPriceInput("");
  setCheapestAltInput("");
  setItemNameInput("");
  setSizeInput("");
  const { isDuplicate } = await enqueueOffline({
    photoUri, scannedPrice, cheapestAlt, itemHint, sizeHint: sizeHintVal,
  });
  if (!isDuplicate) {
    setSavedToast(`Scan queued — will send when back online (${pendingCount + 1} queued)`);
  }
  return;
}
// ──────────────────────────────────────────────────────────────────────

// ✅ set loading panel image BEFORE we clear photo state
setLoadingPhotoUri(photoUri);
setLoadingResults(true);
setShowRetryWhileLoading(false);

scanSessionRef.current = {
  photoUri,
  scannedPrice,
  counted: true,
  startedAt: Date.now(),
  visionRetries: 0,
};

setRefinePhotos([]);
setPhoto(null);
setScanPriceInput("");
setCheapestAltInput("");
setItemNameInput("");
setSizeInput("");

trackEvent("scan_started", { price: scannedPrice, mode: scanMode });

runScan({
  photoUri: scanSessionRef.current.photoUri,
  scannedPrice,
  cheapestAlt,
  itemHint,
  sizeHint: sizeHintVal,
  countScan: true,
});
  };
// -------------------------
// ✅ FEATURE #14: Show Me Cheaper re-search
// -------------------------

const MIN_LOADING_MS = 2200;

const _showMeCheaper = async () => {
  const q = activeResult?.visionQuery;
  if (!q) return;

  const reqId = nextScanReqId();
  activeScanReqIdRef.current = reqId;

  const startedAt = Date.now();

  hapticSelect();
  setLoadingResults(true);
  setShowRetryWhileLoading(false);

  const controller = new AbortController();

  try {
    let data: any = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        data = await safeApiCall(() =>
          fetchWithTimeout(`${resolvedApiBase}/market/research`, {
            method: "POST",
            signal: controller.signal,
            body: JSON.stringify({ query: q, mode: "cheaper" }),
          })
        );
        break;
      } catch (e) {
        if (attempt === 2) throw e;
        await new Promise((r) =>
          setTimeout(r, attempt === 0 ? 300 : 700)
        );
      }
    }

    const items = Array.isArray(data?.items) ? data.items : [];
    const qNorm = normalizeTitle(q);
    const enteredPrice = toNumber(activeResult?.scannedPrice || 0);

    const normalized = normalizeListings(items, "research", "Resale", q)
      .map((i) => {
        const normalizedTotal = Number(i?.totalPrice);
        const normalizedPrice = Number(i?.numericPrice);
        const normalizedShip = Number(i?.shipping);

        const price = Number.isFinite(normalizedPrice)
          ? normalizedPrice
          : parseMoney(i?.price);

        const shipping = Number.isFinite(normalizedShip)
          ? normalizedShip
          : parseMoney(i?.shipping);

        const total = Number.isFinite(normalizedTotal)
          ? Math.round(normalizedTotal * 100) / 100
          : Number.isFinite(price)
          ? Math.round(
              (price + (Number.isFinite(shipping) ? shipping : 0)) * 100
            ) / 100
          : NaN;

        const titleNorm = normalizeTitle(i?.title || "");
        const simRaw = titleSimilarity(titleNorm, qNorm);
        const sim = Number.isFinite(simRaw) ? simRaw : 0;

        const underUserPrice =
          Number.isFinite(enteredPrice) && enteredPrice > 0 && Number.isFinite(total)
            ? total <= enteredPrice + 0.01
            : true;

const score =
  sim * 0.72 +
  (underUserPrice ? 0.08 : -0.14) +
  (Number.isFinite(total) && total > 0 ? 1 / total : 0) * 0.2;

        return {
          ...i,
          numericPrice: price,
          numericShip: Number.isFinite(shipping) ? shipping : 0,
          numericTotal: total,
          __titleNorm: titleNorm,
          __sim: sim,
          __underUserPrice: underUserPrice,
          __score: score,
        };
      })
      .filter((i) => Number.isFinite(i.numericTotal) && Number(i.__sim || 0) >= 0.22);

    const seen = new Set<string>();
    const deduped = normalized.filter((it) => {
      const key =
        String(it?.url || "").trim().toLowerCase() ||
        `${it.__titleNorm}|${it.numericTotal}|${String(it?.source || "").toLowerCase()}`;
      if (!key) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const ranked = deduped.sort((a, b) => {
      if (!!a.__underUserPrice !== !!b.__underUserPrice) {
        return a.__underUserPrice ? -1 : 1;
      }

      const simDiff = Number(b.__sim || 0) - Number(a.__sim || 0);
      if (Math.abs(simDiff) > 0.08) return simDiff;

      const scoreDiff = Number(b.__score || 0) - Number(a.__score || 0);
      if (Math.abs(scoreDiff) > 0.03) return scoreDiff;

      return Number(a.numericTotal || Infinity) - Number(b.numericTotal || Infinity);
    });

    const cheaperOnly =
      Number.isFinite(enteredPrice) && enteredPrice > 0
        ? ranked.filter((it) => it.__underUserPrice)
        : ranked;

    const top3 = cheaperOnly.slice(0, 3);

    if (!top3.length) {
      setSavedToast("Already at or below the best reliable price");
      stopLoadingSafely(reqId);
      return;
    }

    setResults(top3);
    setSeeMoreListings(ranked.slice(0, 60));

    const cheapest = top3[0];
    if (!cheapest) {
      stopLoadingSafely(reqId);
      return;
    }

    const cheapestPrice = Number(cheapest.numericTotal);

    let scannedPriceForLog = 0;

    setActiveResult((prev) => {
      scannedPriceForLog = toNumber(prev?.scannedPrice || 0);

      const savedAmount =
        Number.isFinite(scannedPriceForLog) && Number.isFinite(cheapestPrice)
          ? Math.max(0, scannedPriceForLog - cheapestPrice)
          : 0;

      const cheaperPct =
        Number.isFinite(scannedPriceForLog) &&
        scannedPriceForLog > 0 &&
        savedAmount > 0
          ? (savedAmount / scannedPriceForLog) * 100
          : 0;

      return {
        ...prev,
        price: cheapestPrice,
        store: cheapest.__market === "ebay" ? "eBay" : cheapest?.source || "Resale",
        buyLink: cheapest.url,
        image: cheapest.image || prev?.image,
        alternatives: top3,
        totalMatches: ranked.length,
        savedAmount,
        cheaperPct,
      };
    });

    setIntelState((prev) => {
      const savedAmount = Math.max(0, scannedPriceForLog - toNumber(cheapestPrice));
      const next = intelLog(prev, {
        type: "scan",
        confidence: activeResult?.visionConfidence || 0,
        savings: Math.round(savedAmount * 100) / 100,
        store: cheapest?.source || "Resale",
        category: activeResult?.category,
        title: activeResult?.itemName || cheapest?.title,
        verdict: savedAmount > 0 ? "buy" : "fair",
      });
      saveIntel(next);
      return next;
    });
  } catch (e) {
    console.warn("showMeCheaper failed", e);

  } finally {
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, MIN_LOADING_MS - elapsed);

    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }

    stopLoadingSafely(reqId);
  }
};

const lockOpacity = useRef(new RNAnimated.Value(0)).current;
const beamX = useRef(new RNAnimated.Value(-220)).current;
const beamOpacity = useRef(new RNAnimated.Value(0)).current;
const stampScale = useRef(new RNAnimated.Value(0.92)).current;
const stampOpacity = useRef(new RNAnimated.Value(0)).current;

const playNeuralLock = () => {
  // reset
  lockOpacity.setValue(0);
  beamX.setValue(-220);
  beamOpacity.setValue(0);
  stampScale.setValue(0.92);
  stampOpacity.setValue(0);

  // 1) micro-freeze flash on results
  RNAnimated.sequence([
    RNAnimated.timing(lockOpacity, { toValue: 1, duration: 70, useNativeDriver: true }),
    RNAnimated.timing(lockOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
  ]).start();

  RNAnimated.timing(stampOpacity, {
  toValue: 0.15,
  duration: 80,
  useNativeDriver: true,
}).start();

  // 2) diagonal beam sweep (single pass)
  RNAnimated.parallel([
    RNAnimated.sequence([
      RNAnimated.timing(beamOpacity, { toValue: 1, duration: 80, useNativeDriver: true }),
      RNAnimated.timing(beamOpacity, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]),
    RNAnimated.timing(beamX, {
      toValue: 260,
      duration: 360,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }),
  ]).start();

  // 3) verdict stamp pop
  RNAnimated.sequence([
    RNAnimated.delay(140),
    RNAnimated.parallel([
      RNAnimated.spring(stampScale, {
        toValue: 1,
        friction: 6,
        tension: 140,
        useNativeDriver: true,
      }),
      RNAnimated.timing(stampOpacity, {
        toValue: 1,
        duration: 140,
        useNativeDriver: true,
      }),
    ]),
    RNAnimated.delay(650),
    RNAnimated.timing(stampOpacity, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }),
  ]).start();

  // premium haptic “stamp”
  try {
    Haptics.impactAsync?.(Haptics.ImpactFeedbackStyle.Medium);
  } catch {}
};

const onScanAnimFinished = () => {
  setScanAnimActive(false);
  setFreezeFrameUri(null);
};

const retrySameScan = () => {
  const session = scanSessionRef.current;
  if (!session?.photoUri || !Number.isFinite(session?.scannedPrice)) {
    return;
  }
  hapticSelect();
  runScan({
    photoUri: session.photoUri,
    scannedPrice: session.scannedPrice,
    countScan: false,
  });
};
const startNewScan = () => {
  hapticSelect();
  trackPassedItem(activeResult);
  setPhoto(null);
  setResults([]);
  setActiveResult(null);
  nextScanSession();
  setLoadingResults(false);
  setPriceSubmitted(false);
  setScanPriceInput("");
  scanSessionRef.current = null;
  goTab("camera");
};
// ===============================
// LOAD CLOUD HISTORY
// ===============================

useEffect(() => {
  if (!userId) return;
fetch(`${resolvedApiBase}/history/load?userId=${encodeURIComponent(userId)}`)
  .then(async (res) => {
    if (!res.ok) return [];
    const text = await res.text();
    if (text.trim().startsWith("<")) return [];
    try {
      return JSON.parse(text);
    } catch {
      return [];
    }
  })
  .then((data) => {
    if (Array.isArray(data)) {
      setHistory(data);
    }
  })
  .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [userId]);
// permission handled in UI — do not early return before hooks
// ✅ HARD UI RECOVERY: if camera tab is active, force-clear any stuck overlays
useEffect(() => {
  if (tab !== "camera") return;

    // ✅ do NOT force-hide splash here (it has its own timer + fade)
  // only kill onboarding overlay if it somehow persists
  try {
    setShowOnboard(false);
  } catch {}

  // freeze overlays must never persist into camera idle
  try {
    setCinematicFreeze(false);
  } catch {}
  try {
    setFreezeFrameUri(null);
  } catch {}
  try {
    freezeOpacity?.setValue?.(0);
  } catch {}
  try {
    vignetteOpacity?.setValue?.(0);
  } catch {}

  // tab fade must be visible if we're on camera
    try { tabFade?.stopAnimation?.(); } catch {}
try { tabFade?.setValue?.(1); } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [tab]);

// -------------------------
// WEAPONIZATION ENGINE (RETENTION + COMPOUNDING + REALTIME + SHARE + BRAND)
// -------------------------
const DAY_ID = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local
const toNum = (n: any) => {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
};
const clampInt = (n: any, a = 0, b = 9999) => Math.max(a, Math.min(b, Math.floor(toNum(n))));
// ── Tweak 2: Hardware-level fingerprinting ────────────────────────────────────
// Combines OS, version, screen resolution, and pixel density into a stable
// djb2 hash that survives cookie clears, VPNs, and app reinstalls.
function _djb2Hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

async function buildHardwareFingerprint(): Promise<string> {
  const screen = Dimensions.get("screen");
  const signals = [
    Platform.OS,
    String(Platform.Version),
    `${Math.round(screen.width)}x${Math.round(screen.height)}`,
    PixelRatio.get().toFixed(2),
  ].join("|");
  return _djb2Hash(signals).toString(36).toUpperCase();
}

const mkInstallId = async (): Promise<string> => {
  const hw   = await buildHardwareFingerprint();
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `EV${hw}_${rand}`;
};

const K = {
  installId: "EVAN_INSTALL_ID_V1",
  dailyGoal: "EVAN_DAILY_GOAL_V1",
  streak: "EVAN_STREAK_V1",
  lastDay: "EVAN_LAST_DAY_V1",
  todayCount: "EVAN_TODAY_COUNT_V1",
  lastWatchCheck: "EVAN_LAST_WATCH_CHECK_MS_V1",
  autoWatch: "EVAN_AUTO_WATCH_V1",

  // ✅ Referral
  referredBy: "EVAN_REFERRED_BY_V1",
  referralUses: "EVAN_REFERRAL_USES_V1",
  bonusScans: "EVAN_BONUS_SCANS_V1",
  // Pending: referral link clicked but not yet redeemed (no local reward until server confirms)
  pendingReferralCode: "EVAN_PENDING_REF_V1",

  // Offline scan queue
  offlineQueue: "EVAN_OFFLINE_QUEUE_V1",
};

useEffect(() => {
  loadIntel();
}, []);

const parseRefFromUrl = (url: string) => {
  try {
    const m = String(url || "").match(/[?&]ref=([^&]+)/i);
    const code = m?.[1] ? decodeURIComponent(m[1]) : null;
    if (!code) return null;
    return String(code).replace(/[^a-z0-9_-]/gi, "").slice(0, 24);
  } catch {
    return null;
  }
};

useEffect(() => {
  const applyUrl = async (url?: string | null) => {
    if (!url) return;
    const code = parseRefFromUrl(url);
    if (!code) return;

    // Already redeemed — nothing to do
    const existing = await AsyncStorage.getItem(K.referredBy);
    if (existing) return;

    // Store as PENDING only — no scans granted here.
    // Rewards are only granted after /referral/redeem confirms server-side.
    await AsyncStorage.setItem(K.pendingReferralCode, code);

    // Register the click with the server (so it can verify this is a fresh install).
    // Fire-and-forget — safe to fail.
    try {
      const iid = await AsyncStorage.getItem(K.installId);
      if (iid) {
        fetch(`${SAFE_API_BASE}/referral/register-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ installId: iid, code }),
        }).catch(() => {});
      }
    } catch {}
  };

  (async () => {
    try {
      const initial = await Linking.getInitialURL();
      await applyUrl(initial);
    } catch {}
  })();

  const sub = Linking.addEventListener("url", (e) => {
    applyUrl(e?.url);
  });

  return () => {
    try {
      sub?.remove?.();
    } catch {}
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

const [dailyGoal, setDailyGoal] = useState<number>(6);
const [referredBy, setReferredBy] = useState<string | null>(null);
const [referralInput, setReferralInput] = useState("");
const [referralBusy, setReferralBusy] = useState(false);
const [referralCodeError, setReferralCodeError] = useState("");

const grantBonusScans = async (n: number) => {
  if (!Number.isFinite(n) || n <= 0) return;
  setBonusScans((prev) => {
    const next = Math.min(999, (Number(prev) || 0) + n);
    AsyncStorage.setItem(K.bonusScans, String(next));
    return next;
  });
  setSavedToast(`+${n} bonus scans unlocked`);
};

const applyReferralCode = async (
  rawCode: string,
  source: "manual" | "link" = "manual",
  overrides: { installId?: string | null; userId?: string | null } = {}
) => {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) return false;
  if (code.length < 4) return false;
  if (referralBusy) return false;

  if (code === String(effectiveReferralCode || "").trim().toUpperCase()) {
    setSavedToast("You can’t use your own code");
    return false;
  }

  const existingRef = await AsyncStorage.getItem(K.referredBy);
  if (existingRef) {
    setReferredBy(existingRef);
    setReferralInput(existingRef);
    setSavedToast("Referral already applied");
    return false;
  }

  try {
    setReferralBusy(true);

    const res = await fetch(`${resolvedApiBase || SAFE_API_BASE}/referral/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId:           overrides.userId    ?? userId    ?? null,
        installId:        overrides.installId ?? installId ?? null,
        code,
        source,
        grantReferrerScan: true, // server gives code owner +1 scan on successful redemption
      }),
    });

    const json = await res.json().catch(() => null);

    if (!json?.ok) {
      const reason = json?.reason || "unknown";
      if (reason === "already_redeemed" || reason === "already_redeemed_device") {
        const existingRef = await AsyncStorage.getItem(K.referredBy);
        if (!existingRef) {
          await AsyncStorage.setItem(K.referredBy, code);
          setReferredBy(code);
          setReferralInput(code);
        }
        setReferralCodeError("This code has already been used on this device.");
      } else if (reason === "self_referral_not_allowed") {
        setReferralCodeError("You can't use your own referral code.");
      } else if (reason === "invalid_code") {
        setReferralCodeError("Invalid code — check it and try again.");
      } else {
        setReferralCodeError("Couldn't apply code — check your connection and try again.");
      }
      return false;
    }

    // Server confirmed — grant bonus scans to this user
    const reward = Number.isFinite(Number(json?.bonusScans)) && Number(json.bonusScans) > 0
      ? Number(json.bonusScans)
      : 3;
    await grantBonusScans(reward);

    await AsyncStorage.setItem(K.referredBy, code);
    await AsyncStorage.removeItem(K.pendingReferralCode);
    setReferredBy(code);
    setReferralInput(code);
    setReferralCodeError("");
    setSavedToast(source === "link" ? `Referral applied — +${reward} bonus scans!` : `Code applied — +${reward} bonus scans!`);
    return true;
  } catch {
    setReferralCodeError("No connection — try again when online.");
    return false;
  } finally {
    setReferralBusy(false);
  }
};

const [todayScanCount, setTodayScanCount] = useState<number>(0);
const [scanStreak, setScanStreak] = useState<number>(0);
const [_welcomeBackOpen, setWelcomeBackOpen] = useState(false);
const prevHistorySigRef = useRef<string>("");
const watchCheckInFlightRef = useRef(false);
const lastGlobalWatchCheckMsRef = useRef(0);
const _prevBestByIdRef = useRef<Record<string, number>>({});

useEffect(() => {
  (async () => {
    try {
      // install id (share growth)
      const iid = (await AsyncStorage.getItem(K.installId)) || await mkInstallId();
      await AsyncStorage.setItem(K.installId, iid);
      setInstallId(iid);
      if (!_clientId) _clientId = iid;

      // Server-issued guest identity — persistent across reinstalls via fingerprint
      try {
        const cachedGid = await AsyncStorage.getItem("EVAN_GUEST_ID_V1");
        const apiBase = process.env.EXPO_PUBLIC_API_URL ??
          (Platform.OS === "ios" ? "http://192.168.1.227:3001" : "http://10.0.2.2:3001");
        const gidRes = await fetch(`${apiBase}/api/guest/identify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fingerprint: iid }),
        }).then(r => r.json()).catch(() => null);
        const newGid = gidRes?.guestId || cachedGid || iid;
        if (newGid) {
          await AsyncStorage.setItem("EVAN_GUEST_ID_V1", newGid);
          setGuestId(newGid);
        }
        // Sync server scan quota on app open
        const effectiveId = userId || newGid || iid;
        const statusRes = await fetch(`${apiBase}/api/scan/status?${userId ? `userId=${userId}` : `guestId=${newGid}`}`)
          .then(r => r.json()).catch(() => null);
        if (statusRes?.ok) {
          if (Number.isFinite(statusRes.scansUsed)) setScansUsed(statusRes.scansUsed);
          if (statusRes.resetAt) setScanResetAt(statusRes.resetAt);
        }
      } catch { /* non-fatal — local state is fallback */ }

      // goal
      const g = await AsyncStorage.getItem(K.dailyGoal);
      if (g != null) setDailyGoal(clampInt(g, 1, 25));

      // streak + day info
      const savedStreak = await AsyncStorage.getItem(K.streak);
      if (savedStreak != null) setScanStreak(clampInt(savedStreak, 0, 9999));

      const lastDay = await AsyncStorage.getItem(K.lastDay);
      const today = DAY_ID();

      // today count
      const savedTodayCount = await AsyncStorage.getItem(K.todayCount);
      const savedDayForCount = lastDay;
      if (savedDayForCount === today && savedTodayCount != null) {
        setTodayScanCount(clampInt(savedTodayCount, 0, 9999));
      } else {
        setTodayScanCount(0);
        await AsyncStorage.setItem(K.todayCount, "0");
      }

      // welcome-back modal removed — no interruption on app open

      // auto watch toggle
      const aw = await AsyncStorage.getItem(K.autoWatch);
      if (aw != null) setAutoWatchEnabled(aw === "1");

      // referral state
      const rb = await AsyncStorage.getItem(K.referredBy);
      if (rb) {
        setReferredBy(rb);
        setReferralInput(rb);
      }

      const ru = await AsyncStorage.getItem(K.referralUses);
      if (ru != null) setReferralUses(clampInt(ru, 0, 9999));

      const bs = await AsyncStorage.getItem(K.bonusScans);
      if (bs != null) setBonusScans(clampInt(bs, 0, 9999));

      // Offline queue count is now managed by useOfflineQueue hook (SQLite-backed)

      // AUTO REFERRAL DETECTION FROM SHARED LINK
      try {
        const initialUrl = await Linking.getInitialURL();
        const existingRef = await AsyncStorage.getItem(K.referredBy);

        const refCode =
          initialUrl && initialUrl.includes("ref=")
            ? String(initialUrl).split("ref=")[1]?.split("&")[0] || ""
            : "";

        if (!existingRef && refCode) {
          // Store as pending + register with server. Actual redemption happens
          // below once userId is available.
          await AsyncStorage.setItem(K.pendingReferralCode, String(refCode).trim().toUpperCase());
          try {
            fetch(`${SAFE_API_BASE}/referral/register-link`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ installId: iid, code: String(refCode).trim().toUpperCase() }),
            }).catch(() => {});
          } catch {}
        }
      } catch {}

      // REDEEM PENDING REFERRAL (after userId is ready)
      try {
        const existingRef = await AsyncStorage.getItem(K.referredBy);
        if (!existingRef && userId) {
          const pending = await AsyncStorage.getItem(K.pendingReferralCode);
          if (pending) {
            setReferralInput(pending);
            // Attempt server redemption — only grants if server confirms
            await applyReferralCode(pending, "link", { installId: iid, userId });
          }
        }
      } catch {}
    } catch {}
  })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

// DATA COMPOUNDING: detect new scans by history signature (no need to touch your scan pipeline)
useEffect(() => {
  const today = DAY_ID();
  const sig =
    Array.isArray(history) && history.length
      ? String(history[0]?.id || "") + "|" + String(history.length)
      : "empty";
  if (sig === prevHistorySigRef.current) return;
  prevHistorySigRef.current = sig;
  // If history grew, count it as "a scan happened"
  if (Array.isArray(history) && history.length) {
    (async () => {
      try {
        const lastDay = await AsyncStorage.getItem(K.lastDay);
        const isNewDay = lastDay !== today;
        // daily counter
        setTodayScanCount((prev) => {
          const next = isNewDay ? 1 : prev + 1;
          AsyncStorage.setItem(K.todayCount, String(next));
          return next;
        });
        // streak: only increments ONCE per new day (first scan)
        if (isNewDay) {
          setScanStreak((prev) => {
            const next = prev + 1;
            AsyncStorage.setItem(K.streak, String(next));
            return next;
          });
          await AsyncStorage.setItem(K.lastDay, today);
        }
      } catch {}
    })();
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [history]);
// ── Flip profile: reload whenever history reaches a threshold ────────────
useEffect(() => {
  if (!Array.isArray(history) || history.length < 3) return;
  let alive = true;
  (async () => {
    setFlipProfileLoading(true);
    try {
      const scanHistory = history.slice(0, 50).map((h: any) => ({
        itemName:    h?.resultCard?.itemName || h?.title || "",
        category:   h?.resultCard?.itemCategory || h?.category || "",
        price:      h?.resultCard?.price ?? null,
        savedAmount: h?.resultCard?.savedAmount ?? h?.savedAmount ?? 0,
        timestamp:  h?.timestamp || h?.scannedAt || Date.now(),
      }));
      const data: any = await apiFetch("/api/profile/flip", {
        method: "POST",
        body: JSON.stringify({ scanHistory }),
      });
      if (alive && data?.ok) setFlipProfile(data as FlipProfile);
    } catch { /* non-fatal */ } finally {
      if (alive) setFlipProfileLoading(false);
    }
  })();
  return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [history.length]);

// REAL-TIME PRICE MOVEMENT: auto re-check watchlist (foreground + app resume)
const doWatchCheck = useCallback(
  async ({ force = false, quiet = true }: { force?: boolean; quiet?: boolean } = {}) => {
    // Hard-disabled (see runDailyWatchlistCheck note). Auto-paths must
    // never fire SerpAPI. The single allowed search path is the "Find
    // current price" button.
    console.log("WATCHLIST_AUTO_SEARCH_BLOCKED", { fn: "doWatchCheck", force, quiet });
    return;
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []
);
// Foreground intervals + tab-switch + app-resume watchlist checks — ALL
// disabled for TestFlight. Previously this useEffect fired doWatchCheck
// immediately when the user entered the watchlist tab (= one SerpAPI
// fan-out per tab open) and again every 6 min while on the tab.
// doWatchCheck itself is also bailed at the function entry; this useEffect
// is left as a single mount-time log so the absence of the auto-poll is
// explicit and audit-greppable.
useEffect(() => {
  console.log("WATCHLIST_AUTO_SEARCH_BLOCKED", { fn: "foreground_interval_disabled", tab });
}, [tab]);
useEffect(() => {
  console.log("WATCHLIST_AUTO_SEARCH_BLOCKED", { fn: "app_resume_check_disabled" });
}, []);


// -------------------------
// ✅ BOOT-SAFETY: never lose HUD / tab bar after splash
// -------------------------
useEffect(() => {
  // when splash is gone + we are not in scan loading, UI MUST be interactive
  if (!showSplash && !loadingResults) {

    // ✅ HARD: active tab must never stay invisible
    try {
      tabFade?.stopAnimation?.();
      tabFade?.setValue?.(1);
      setTabInteractable(true);
      tabSwitchingRef.current = false;
      pendingTabRef.current = null;
    } catch {}

    // top HUD must fade back in when returning to camera
    if (tab === "camera" && !photo) {
      try {
        topHudOpacity?.setValue?.(1);
      } catch {}
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [showSplash, loadingResults, tab, photo]);

// ✅ HARD TAB FADE RECOVERY — prevents “UI disappears” (tabFade stuck at 0)
useEffect(() => {
  // ✅ Skip during intentional goTab transitions — goTab owns tabFade and has its own 700ms failsafe.
  // Intervening here cancels the fade-in animation and causes the flicker.
  if (tabSwitchingRef.current) return;

  // ✅ clamp: never allow the screen to go fully transparent during tab switches
  try {
    tabFade?.stopAnimation?.();
    tabFade?.setValue?.(1);
  } catch {}

  const id = setTimeout(() => {
    // Re-check: a goTab may have started during the 60ms delay
    if (tabSwitchingRef.current) return;
    try {
      tabFade?.stopAnimation?.();
      tabFade?.setValue?.(1);
    } catch {}
  }, 60);

  return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [tab]);

useEffect(() => {
  if (!showSplash) return;

  splashIPop.setValue(0);
  splashIY.setValue(10);

  RNAnimated.sequence([
    RNAnimated.parallel([
      RNAnimated.spring(splashIPop, {
        toValue: 1,
        speed: 18,
        bounciness: 10,
        useNativeDriver: true,
      }),
      RNAnimated.timing(splashIY, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]),
  ]).start();
}, [showSplash, splashIPop, splashIY]);

// SHARE-DRIVEN GROWTH: upgraded share copy w/ install ref
const buildShareCardTextV2 = useCallback(
  (r: any) => {
    if (!r) return "Evan AI";

    const name = r?.itemName || r?.title || "Item";
    const paying =
      typeof money === "function"
        ? money(toNum(r?.scannedPrice))
        : `$${toNum(r?.scannedPrice).toFixed(2)}`;

    const cheapest =
      typeof money === "function"
        ? money(toNum(r?.price))
        : `$${toNum(r?.price).toFixed(2)}`;

    const saved =
      typeof money === "function"
        ? money(toNum(r?.savedAmount))
        : `$${toNum(r?.savedAmount).toFixed(2)}`;

    const pct =
      typeof percent === "function"
        ? percent(toNum(r?.cheaperPct))
        : `${Math.round(toNum(r?.cheaperPct) * 100)}%`;

    const shareCode = String(effectiveReferralCode || "").trim().toUpperCase();
    const shareUrl = shareCode
      ? `evanai.app?ref=${encodeURIComponent(shareCode)}`
      : "evanai.app";

    return [
      "Evan AI found a cheaper match 🧠",
      "",
      name,
      `Paying: ${paying}`,
      `Cheapest: ${cheapest}`,
      `Saved: ${saved} (${pct} cheaper)`,
      "",
      `Use my code: ${shareCode}`,
      "Get bonus scans instantly.",
      `Try Evan AI: ${shareUrl}`,
    ].join("\n");
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [effectiveReferralCode, money, percent]
);

// BRAND STATS (investor-grade “intelligence branding”)

const _weeklyIntel = useMemo(() => {
  return weeklyStats(intelState?.events || []);
}, [intelState]);

const weaponStats = useMemo(() => {

  const scans = Array.isArray(history) ? history.length : 0;
  const totalSaved = toNum(savingsTotal);
  let bestSaved = 0;
  let bestPct = 0;
  let last: any = null;
  if (Array.isArray(history) && history.length) {
    // attempt to pick the most recent (history[0] in your code path)
    last = Array.isArray(history) && history.length ? history[0]?.resultCard || null : null;
    for (const h of history) {
      const r = h?.resultCard;
      if (!r) continue;
      bestSaved = Math.max(bestSaved, toNum(r?.savedAmount));
      bestPct = Math.max(bestPct, toNum(r?.cheaperPct));
    }
  }
  const tracked = Array.isArray(watchlist) ? watchlist.length : 0;
  const goal = clampInt(dailyGoal, 1, 25);
  const today = clampInt(todayScanCount, 0, 9999);
  const progress = goal ? Math.min(1, today / goal) : 0;
const headline =
  today >= goal
    ? `Mission complete. ${today}/${goal} scans today.`
    : `Mission: ${goal} scans today • ${today} done`;
  const lines = [
    `Lifetime scans: ${scans}`,
    `Lifetime saved: ${typeof money === "function" ? money(totalSaved) : `$${totalSaved.toFixed(2)}`}`,
    `Best single save: ${typeof money === "function" ? money(bestSaved) : `$${bestSaved.toFixed(2)}`}`,
    `Best deal: ${Math.round(bestPct * 100)}% cheaper`,
    `Tracked: ${tracked} items · Drops badge: ${clampInt(dropCount, 0, 99)}`,
  ];
const iq = clampInt(
  scans + tracked * 2 + Math.round(totalSaved / 10) + clampInt(scanStreak, 0, 9999) * 3,
  0,
  999
);
return {
  scans,
  totalSaved,
  bestSaved,
  bestPct,
  tracked,
  goal,
  today,
  progress,
  headline,
  lines,
  last,
  scanStreak,
  dropCount,
  iq,
};
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [history, watchlist, savingsTotal, dailyGoal, todayScanCount, scanStreak, dropCount, money, percent]);

const intelLevel = useMemo(() => {
  const iq = Number(weaponStats?.iq || 0);
  return Math.max(1, Math.min(20, Math.floor(iq / 50) + 1));
   
}, [weaponStats?.iq]);

const _intelIdentityLine = useMemo(() => {
  const lvl = intelLevel;
  if (lvl >= 16) return "You’re running investor-grade instincts.";
  if (lvl >= 11) return "Your market eye is getting sharp.";
  if (lvl >= 6) return "Pattern recognition is compounding.";
  return "You’re building your resale intelligence.";
}, [intelLevel]);

// ── User level / rank (addictive progression) ─────────────────────────
const USER_RANKS = [
  { min: 0,   rank: "ROOKIE",         color: "rgba(255,255,255,0.45)", icon: "ellipse-outline" },
  { min: 3,   rank: "DEAL HUNTER",    color: "#50ff96",                icon: "search-outline" },
  { min: 8,   rank: "SHARP EYE",      color: "#ffd060",                icon: "eye-outline" },
  { min: 20,  rank: "FLIP MASTER",    color: "#ff8c42",                icon: "repeat-outline" },
  { min: 50,  rank: "MARKET MAESTRO", color: "#82c8ff",                icon: "trending-up-outline" },
  { min: 100, rank: "RESALE LEGEND",  color: "#e879f9",                icon: "trophy-outline" },
];

const userRank = useMemo(() => {
  const scans = weaponStats.scans || 0;
  let lvl = USER_RANKS[0];
  for (const l of USER_RANKS) { if (scans >= l.min) lvl = l; }
  return lvl;
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [weaponStats.scans]);

// ── Achievement: level-up + milestone toasts ───────────────────────────
useEffect(() => {
  const curr = weaponStats.scans || 0;
  const prev = prevScansRef.current;
  if (curr <= prev) { prevScansRef.current = curr; return; }
  prevScansRef.current = curr;
  if (curr === 1) {
    showAchievement({ icon: "flash-outline", title: "First Scan!", body: "Your deal-hunting career begins.", color: "white" });
  } else if (curr === 5) {
    showAchievement({ icon: "star-outline", title: "5 Scans Down", body: "You're finding your rhythm.", color: "#ffd060" });
  } else if (curr === 10) {
    showAchievement({ icon: "eye-outline", title: "Sharp Eye", body: "You've unlocked a new rank.", color: "#ffd060" });
  } else if (curr === 25) {
    showAchievement({ icon: "repeat-outline", title: "Flip Master", body: "Serious deal hunter detected.", color: "#ff8c42" });
  } else if (curr === 50) {
    showAchievement({ icon: "trending-up-outline", title: "Market Maestro", body: "You're operating at a different level.", color: "#82c8ff" });
  } else if (curr === 100) {
    showAchievement({ icon: "trophy-outline", title: "Resale Legend", body: "You've reached the top rank.", color: "#e879f9" });
  }
}, [weaponStats.scans]); // eslint-disable-line react-hooks/exhaustive-deps

// ── Streak achievement ─────────────────────────────────────────────────
useEffect(() => {
  if (scanStreak >= 7) {
    showAchievement({ icon: "flame-outline", title: `${scanStreak}-Day Streak`, body: "Relentless. The market fears you.", color: "#ff8c42" });
  } else if (scanStreak === 3) {
    showAchievement({ icon: "flame-outline", title: "3-Day Streak", body: "Consistency is the edge.", color: "#ffd060" });
  }
}, [scanStreak]); // eslint-disable-line react-hooks/exhaustive-deps

// ✅ Tab scroll refs (so tabs don’t “remember” scroll position)
const profileScrollRef = useRef(null);
const historyScrollRef = useRef(null);
const watchlistScrollRef = useRef(null);

// ✅ Barcode must NOT reconfigure camera when toggled (prevents flash)
const barcodeModeRef = useRef(false);
useEffect(() => {
  barcodeModeRef.current = !!barcodeMode;
}, [barcodeMode]);

// ✅ Removed: preLoadBlack "micro flash" (causes visible flashes)


const _pulseScale = loadingPulse.interpolate({
  inputRange: [0, 1],
  outputRange: [0.96, 1.10],
});

const _pulseOpacity = loadingPulse.interpolate({
  inputRange: [0, 1],
  outputRange: [0.6, 1],
});

return (
<GestureHandlerRootView style={{ flex: 1, backgroundColor: "transparent" }}>
<RNAnimated.View
style={{
  flex: 1,
  backgroundColor: "transparent",
transform: [
  {
    scale: uiDepth.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0.995],
    }),
  },
  {
    translateY: cameraGlassDepth.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -2],
    }),
  },
  {
    scale: uiBreath.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 1.003],
    }),
  },
],
}}
>
    <View style={{ flex: 1, backgroundColor: "transparent" }}>
      <StatusBar style="light" />
      
      {Boolean(showSplash) ? (
        <RNAnimated.View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: "#000",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 999,
              opacity: splashOpacity,
            },
          ]}
        >
          {/* Liquid Glass ambient — deep outer glow */}
          <RNAnimated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              width: 420,
              height: 420,
              borderRadius: 210,
              backgroundColor: "rgba(255,255,255,0.012)",
              opacity: splashOrbOpacity,
              transform: [{ scale: splashOrbScale }],
              shadowColor: "#ffffff",
              shadowOpacity: IOS ? 0.08 : 0,
              shadowRadius: 120,
              shadowOffset: { width: 0, height: 0 },
            }}
          />
          {/* Mid orb — frosted glass layer */}
          <RNAnimated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              width: 240,
              height: 240,
              borderRadius: 120,
              backgroundColor: "rgba(255,255,255,0.022)",
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: "rgba(255,255,255,0.06)",
              opacity: splashOrbOpacity,
              transform: [{
                scale: splashOrbScale.interpolate({ inputRange: [0.85, 1.14], outputRange: [1.08, 0.92] }),
              }],
            }}
          />
          {/* Inner core orb */}
          <RNAnimated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              width: 120,
              height: 120,
              borderRadius: 60,
              backgroundColor: "rgba(255,255,255,0.04)",
              opacity: splashOrbOpacity,
              transform: [{
                scale: splashOrbScale.interpolate({ inputRange: [0.85, 1.14], outputRange: [1.12, 0.85] }),
              }],
            }}
          />

          {/* Wordmark — overflow hidden prevents safe-area-inset sub-pixel crack */}
          <RNAnimated.View style={{
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            transform: [{ scale: logoScale }],
          }}>
            <View style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              paddingBottom: 2,
            }}>
              <Text
                style={{
                  color: "white",
                  fontSize: 52,
                  fontWeight: "900",
                  letterSpacing: -2.5,
                  includeFontPadding: false,
                  lineHeight: 56,
                }}
                allowFontScaling={false}
              >
                EVAN
              </Text>
              <View style={{
                paddingHorizontal: 11,
                paddingVertical: 6,
                borderRadius: 13,
                backgroundColor: "rgba(255,255,255,0.10)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.22)",
                overflow: "hidden",
              }}>
                <Text
                  style={{
                    color: "white",
                    fontSize: 17,
                    fontWeight: "900",
                    letterSpacing: 2.5,
                    includeFontPadding: false,
                  }}
                  allowFontScaling={false}
                >
                  AI
                </Text>
              </View>
            </View>
          </RNAnimated.View>

          {/* Tagline */}
          <RNAnimated.Text
            style={{
              marginTop: 18,
              color: "rgba(255,255,255,0.40)",
              fontSize: 10,
              fontWeight: "700",
              letterSpacing: 5,
              textTransform: "uppercase",
              opacity: splashTaglineOp,
              transform: [{ translateY: splashTaglineY }],
            }}
          >
            SCAN · PRICE · WIN
          </RNAnimated.Text>

          {/* Feature chips — Liquid Glass capsules */}
          <RNAnimated.View
            style={{
              flexDirection: "row",
              gap: 8,
              marginTop: 30,
              opacity: splashChipsOp,
              transform: [{ translateY: splashChipsY }],
            }}
          >
            {(["AI Vision", "Live Prices", "Flip Intel"] as const).map((label) => (
              <View
                key={label}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 99,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: "rgba(255,255,255,0.14)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                }}
              >
                <Text
                  style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: "800", letterSpacing: 0.3 }}
                  allowFontScaling={false}
                >
                  {label}
                </Text>
              </View>
            ))}
          </RNAnimated.View>

          {/* Bottom progress + label — Liquid Glass */}
          <View style={{ position: "absolute", bottom: 64, alignItems: "center", width: 160 }}>
            <View style={{
              width: 160,
              height: 2,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderRadius: 1,
              overflow: "hidden",
            }}>
              <RNAnimated.View
                style={{
                  height: 2,
                  backgroundColor: "rgba(255,255,255,0.55)",
                  borderRadius: 1,
                  width: splashProgressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
                }}
              />
            </View>
            <Text
              style={{
                color: "rgba(255,255,255,0.22)",
                fontSize: 9,
                fontWeight: "800",
                letterSpacing: 2.5,
                textTransform: "uppercase",
                marginTop: 12,
              }}
              allowFontScaling={false}
            >
              {`Initializing${splashLoadingDots}`}
            </Text>
          </View>
        </RNAnimated.View>
      ) : null}

{/* ── REGRET ALERT ─────────────────────────────────────────────────── */}
{regretAlertOpen && regretItems.length > 0 ? (
  <RNAnimated.View
    pointerEvents="box-none"
    style={{
      position: "absolute",
      bottom: BOTTOM + TAB_BAR_H + TAB_BAR_MARGIN + 20,
      left: 16,
      right: 16,
      zIndex: 99990,
      opacity: regretAlertOp,
      transform: [{ translateY: regretAlertY }],
    }}
  >
    <Pressable
      onPress={() => {
        RNAnimated.parallel([
          RNAnimated.timing(regretAlertOp, { toValue: 0, duration: 220, useNativeDriver: true }),
          RNAnimated.timing(regretAlertY, { toValue: 80, duration: 220, useNativeDriver: true }),
        ]).start(() => setRegretAlertOpen(false));
      }}
      style={{
        backgroundColor: "rgba(10,10,10,0.97)",
        borderRadius: 22,
        borderWidth: 1,
        borderColor: "rgba(255,100,60,0.25)",
        padding: 16,
        shadowColor: "#ff6040",
        shadowOpacity: 0.3,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 4 },
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: "rgba(255,100,60,0.12)", borderWidth: 1, borderColor: "rgba(255,100,60,0.25)", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="heart-dislike-outline" size={17} color="#ff6040" />
        </View>
        <Text style={{ color: "#ff6040", fontSize: 11, fontWeight: "800", letterSpacing: 1.6 }}>THE ONE THAT GOT AWAY</Text>
        <Ionicons name="close" size={16} color="rgba(255,255,255,0.35)" style={{ marginLeft: "auto" }} />
      </View>
      {regretItems.slice(0, 2).map((item, i) => (
        <View key={i} style={{ marginBottom: 6 }}>
          <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 14, fontWeight: "700" }} numberOfLines={1}>
            {item.itemName}
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "600", marginTop: 2 }}>
            You passed at ${Number(item.passedPrice).toFixed(0)} · Now ~${Number(item.currentPrice).toFixed(0)} · {"\uD83D\uDCC8"} {Math.round(((item.currentPrice - item.passedPrice) / item.passedPrice) * 100)}% up
          </Text>
        </View>
      ))}
      <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 6 }}>Tap to dismiss</Text>
    </Pressable>
  </RNAnimated.View>
) : null}

{/* ── ACHIEVEMENT TOAST ────────────────────────────────────────────────── */}
{achieveToast ? (
  <RNAnimated.View
    pointerEvents="none"
    style={{
      position: "absolute",
      top: TOP + 14,
      left: 18,
      right: 18,
      zIndex: 99999,
      opacity: achieveOp,
      transform: [{ translateY: achieveY }],
    }}
  >
    <View style={{
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: "rgba(10,10,10,0.95)",
      borderRadius: 18,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.10)",
      paddingHorizontal: 16,
      paddingVertical: 13,
      shadowColor: "#000",
      shadowOpacity: 0.6,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 4 },
    }}>
      <View style={{
        width: 38, height: 38, borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
        alignItems: "center", justifyContent: "center",
        shadowColor: achieveToast.color,
        shadowOpacity: 0.4, shadowRadius: 8,
      }}>
        <Ionicons name={achieveToast.icon as any} size={19} color={achieveToast.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: achieveToast.color, fontSize: 13, fontWeight: "800", letterSpacing: 0.2 }}>
          {achieveToast.title}
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "500", marginTop: 1 }}>
          {achieveToast.body}
        </Text>
      </View>
      <Ionicons name="checkmark-circle" size={18} color={achieveToast.color} style={{ opacity: 0.7 }} />
    </View>
  </RNAnimated.View>
) : null}

{/* ── THRIFT HEAT MAP MODAL ────────────────────────────────────────────── */}
{thriftHeatOpen ? (
  <View pointerEvents="box-none" style={[StyleSheet.absoluteFillObject, { zIndex: 9980 }]}>
    <Pressable
      style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.6)" }]}
      onPress={() => {
        RNAnimated.parallel([
          RNAnimated.timing(thriftHeatOp, { toValue: 0, duration: 220, useNativeDriver: true }),
          RNAnimated.timing(thriftHeatY, { toValue: 60, duration: 220, useNativeDriver: true }),
        ]).start(() => setThriftHeatOpen(false));
      }}
    />
    <RNAnimated.View style={{
      position: "absolute", bottom: 0, left: 0, right: 0,
      backgroundColor: "rgba(8,8,8,0.98)",
      borderTopLeftRadius: 32, borderTopRightRadius: 32,
      paddingHorizontal: 20, paddingTop: 24,
      paddingBottom: BOTTOM + 28,
      opacity: thriftHeatOp,
      transform: [{ translateY: thriftHeatY }],
      shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 40, shadowOffset: { width: 0, height: -8 },
    }}>
      {/* Handle — drag to resize */}
      <View {...heatMapPanResponder.panHandlers} style={{ paddingVertical: 10, alignItems: "center", marginBottom: 10 }}>
        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)" }} />
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <Ionicons name="map-outline" size={22} color="#50ff96" />
        <Text style={{ color: "white", fontSize: 22, fontWeight: "900", letterSpacing: -0.5, flex: 1 }}>Thrift Heat Map</Text>
        <Pressable
          onPress={() => {
            RNAnimated.parallel([
              RNAnimated.timing(thriftHeatOp, { toValue: 0, duration: 200, useNativeDriver: true }),
              RNAnimated.timing(thriftHeatY, { toValue: 60, duration: 200, useNativeDriver: true }),
            ]).start(() => setThriftHeatOpen(false));
          }}
          style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.10)", alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
        </Pressable>
      </View>
      <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, fontWeight: "600", marginBottom: 20 }}>
        Best days &amp; times to hit each chain — based on real restocking patterns.
      </Text>

      <RNAnimated.ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: heatMapHeightAnim }}>
        {(thriftStores.length > 0 ? thriftStores : [
          { name: "Goodwill", emoji: "\uD83C\uDFEA", heat: "WARM TODAY", heatScore: 65, isHotNow: false, isHotToday: true, tagline: "Tue–Thu mornings after donation drops", tip: "Arrive at open Tue–Thu.", nextHotDay: "Tomorrow" },
          { name: "Salvation Army", emoji: "\uD83D\uDD34", heat: "COLD TODAY", heatScore: 30, isHotNow: false, isHotToday: false, tagline: "Monday = freshest weekend haul", tip: "Monday–Wednesday mornings.", nextHotDay: "Monday" },
          { name: "Savers / Value Village", emoji: "\uD83D\uDED2", heat: "COLD TODAY", heatScore: 25, isHotNow: false, isHotToday: false, tagline: "Wed–Fri for deepest selection", tip: "Wednesday–Friday.", nextHotDay: "Wednesday" },
        ]).map((store, i) => (
          <View key={i} style={{
            marginBottom: 12,
            padding: 16,
            borderRadius: 18,
            backgroundColor: store.isHotNow ? "rgba(80,255,150,0.08)" : store.isHotToday ? "rgba(255,200,60,0.06)" : "rgba(255,255,255,0.04)",
            borderWidth: 1,
            borderColor: store.isHotNow ? "rgba(80,255,150,0.25)" : store.isHotToday ? "rgba(255,200,60,0.18)" : "rgba(255,255,255,0.08)",
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <Text style={{ color: "white", fontSize: 15, fontWeight: "800" }}>
                {store.emoji} {store.name}
              </Text>
              <View style={{
                paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99,
                backgroundColor: store.isHotNow ? "rgba(80,255,150,0.15)" : store.isHotToday ? "rgba(255,200,60,0.12)" : "rgba(255,255,255,0.07)",
              }}>
                <Text style={{
                  color: store.isHotNow ? "#50ff96" : store.isHotToday ? "#ffd060" : "rgba(255,255,255,0.4)",
                  fontSize: 10, fontWeight: "800", letterSpacing: 1.2,
                }}>
                  {store.heat}
                </Text>
              </View>
            </View>
            <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 13, fontWeight: "600" }}>
              {store.tagline}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.38)", fontSize: 12, marginTop: 4 }}>
              {store.isHotNow ? "\uD83D\uDD25 Go now" : store.nextHotDay ? `Next: ${store.nextHotDay}` : ""} · {store.tip}
            </Text>
          </View>
        ))}
      </RNAnimated.ScrollView>

      <View style={{ backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.09)" }}>
        <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>PRO TIP</Text>
        <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, lineHeight: 19 }}>
          Talk to the sorting staff. They&apos;ll tell you what came in that morning.
        </Text>
      </View>

      <Text style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, textAlign: "center", marginTop: 12 }}>
        Based on chain-wide donation &amp; restock patterns
      </Text>
    </RNAnimated.View>
  </View>
) : null}

{/* Feature 6: Lowball Script Sheet.
    Premium sheet — scripts can be long (3–5 sentences each); ScrollView +
    flexShrink on the text means nothing is clipped, even on small phones.
    Reset Messages re-hits /intel/lowball-script for a fresh batch (the
    endpoint returns server-tuned variants per call). */}
{lowballOpen ? (
  <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "flex-end", zIndex: 100000 }}>
    <Pressable
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.65)" }}
      onPress={closeLowball}
    />
    <RNAnimated.View style={{
      backgroundColor: "#0f0f0f", borderTopLeftRadius: 24, borderTopRightRadius: 24,
      borderTopWidth: 1, borderColor: "rgba(255,255,255,0.08)",
      paddingTop: 20, paddingHorizontal: 20, paddingBottom: 32,
      maxHeight: "88%",
      transform: [{ translateY: lowballY }], opacity: lowballOp,
    }}>
      {/* Header row — title left, Reset button right */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 6 }}>NEGOTIATION SCRIPTS</Text>
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 22 }}>🧠 Lowball Generator</Text>
        </View>
        <Pressable
          onPress={openLowball}
          style={({ pressed }) => [{
            flexDirection: "row", alignItems: "center", gap: 6,
            paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11,
            backgroundColor: "rgba(130,200,255,0.10)",
            borderWidth: 1, borderColor: "rgba(130,200,255,0.30)",
            opacity: pressed ? 0.6 : 1,
          }]}
          hitSlop={6}
        >
          <Ionicons name="refresh" size={13} color="#82c8ff" />
          <Text style={{ color: "#82c8ff", fontSize: 12, fontWeight: "800", letterSpacing: 0.4 }}>Reset</Text>
        </Pressable>
      </View>

      <ScrollView
        style={{ maxHeight: 520 }}
        contentContainerStyle={{ paddingBottom: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {lowballScripts.length === 0 ? (
          <LowballLoadingState />
        ) : lowballScripts.map((s, i) => (
          <Pressable key={i} onPress={async () => {
            try { await Clipboard.setStringAsync(s.message); setSavedToast("Copied"); } catch {}
            try { Haptics.selectionAsync(); } catch {}
          }} style={{
            backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 16,
            borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
            padding: 18, marginBottom: 14,
          }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <Text
                style={{ color: "#82c8ff", fontWeight: "800", fontSize: 11, letterSpacing: 1.1, textTransform: "uppercase", flexShrink: 1, paddingRight: 8 }}
                numberOfLines={2}
              >
                {s.platform}
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, fontWeight: "600" }}>tap to copy</Text>
            </View>
            <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: "700", textTransform: "uppercase", marginBottom: 8, letterSpacing: 0.8 }}>
              {s.tone}
            </Text>
            {/* Critical: no numberOfLines, no fixed height — scripts wrap fully */}
            <Text style={{ color: "rgba(255,255,255,0.88)", fontSize: 15, lineHeight: 22 }}>
              {s.message}
            </Text>
            {(s as any).tactic ? (
              <Text style={{ color: "rgba(130,200,255,0.55)", fontSize: 12, marginTop: 10, fontStyle: "italic", lineHeight: 17 }}>
                ⚡ {(s as any).tactic}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>

      <Pressable onPress={closeLowball} style={{
        marginTop: 10, paddingVertical: 14, borderRadius: 14,
        backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center",
        borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
      }}>
        <Text style={{ color: "rgba(255,255,255,0.6)", fontWeight: "700", fontSize: 14 }}>Close</Text>
      </Pressable>
    </RNAnimated.View>
  </View>
) : null}

{/* Feature 10: The One That Got Away Sheet */}
{gotAwayOpen ? (
  <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "flex-end", zIndex: 100000 }}>
    <Pressable
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.65)" }}
      onPress={closeGotAway}
    />
    <RNAnimated.View style={{
      backgroundColor: "#0f0f0f", borderTopLeftRadius: 24, borderTopRightRadius: 24,
      borderTopWidth: 1, borderColor: "rgba(255,60,60,0.15)",
      padding: 24, paddingBottom: 40, maxHeight: "75%",
      transform: [{ translateY: gotAwayY }], opacity: gotAwayOp,
    }}>
      <Text style={{ color: "rgba(255,100,100,0.5)", fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 6 }}>MISSED OPPORTUNITIES</Text>
      <Text style={{ color: "#fff", fontWeight: "900", fontSize: 20, marginBottom: 6 }}>💔 The One That Got Away</Text>
      <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, marginBottom: 20 }}>Items you passed on. Prices they sold for. Pure pain.</Text>
      {regretItems.length > 0 ? (
        <Text style={{ color: "#ff6b6b", fontWeight: "900", fontSize: 16, marginBottom: 20 }}>
          Total missed: ${regretItems.reduce((s, i) => s + Math.max(0, (i.currentPrice || i.passedPrice) - i.passedPrice), 0)} in potential profit
        </Text>
      ) : null}
      {regretItems.length === 0 ? (
        <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 14, textAlign: "center", paddingVertical: 30 }}>No regrets yet. Keep scanning.</Text>
      ) : regretItems.slice(0, 5).sort((a, b) => Math.max(0, (b.currentPrice || b.passedPrice) - b.passedPrice) - Math.max(0, (a.currentPrice || a.passedPrice) - a.passedPrice)).map((item, i) => (
        <View key={i} style={{
          backgroundColor: "rgba(255,60,60,0.06)", borderRadius: 14,
          borderWidth: 1, borderColor: "rgba(255,60,60,0.12)",
          padding: 16, marginBottom: 10,
          flexDirection: "row", alignItems: "center", gap: 12,
        }}>
          <Text style={{ fontSize: 24 }}>💸</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "rgba(255,255,255,0.85)", fontWeight: "700", fontSize: 14 }} numberOfLines={1}>{item.itemName}</Text>
            <Text style={{ color: "rgba(255,100,100,0.8)", fontSize: 12, marginTop: 3 }}>
              You passed at <Text style={{ fontWeight: "800" }}>${item.passedPrice}</Text>
              {item.currentPrice ? <Text> · Sold for <Text style={{ color: "#ff4444", fontWeight: "900" }}>${item.currentPrice}</Text></Text> : null}
            </Text>
          </View>
          <Text style={{ color: "rgba(255,60,60,0.6)", fontSize: 22, fontWeight: "900" }}>
            {item.currentPrice && item.currentPrice > item.passedPrice ? `+$${item.currentPrice - item.passedPrice}` : ""}
          </Text>
        </View>
      ))}
      <Pressable onPress={closeGotAway} style={{
        marginTop: 8, paddingVertical: 14, borderRadius: 14,
        backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center",
      }}>
        <Text style={{ color: "rgba(255,255,255,0.5)", fontWeight: "700" }}>Close</Text>
      </Pressable>
    </RNAnimated.View>
  </View>
) : null}

{/* Feature 11: Scan Graveyard Sheet */}
{graveyardOpen ? (
  <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "flex-end", zIndex: 100000 }}>
    <Pressable
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.65)" }}
      onPress={closeGraveyard}
    />
    <RNAnimated.View style={{
      backgroundColor: "#0f0f0f", borderTopLeftRadius: 24, borderTopRightRadius: 24,
      borderTopWidth: 1, borderColor: "rgba(80,255,150,0.15)",
      padding: 24, paddingBottom: 40, maxHeight: "75%",
      transform: [{ translateY: graveyardY }], opacity: graveyardOp,
    }}>
      <Text style={{ color: "rgba(80,255,150,0.5)", fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 6 }}>PRICE DROP ALERTS</Text>
      <Text style={{ color: "#fff", fontWeight: "900", fontSize: 20, marginBottom: 6 }}>⚰️ Scan Graveyard</Text>
      <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, marginBottom: 20 }}>Items you passed on that finally dropped in price.</Text>
      {graveyardItems.length > 0 ? (
        <Text style={{ color: "#50ff96", fontWeight: "900", fontSize: 15, marginBottom: 20 }}>
          ${graveyardItems.reduce((s, i) => s + (i.originalPrice - i.currentEstimate), 0)} in potential savings identified
        </Text>
      ) : null}
      {graveyardItems.length === 0 ? (
        <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 14, textAlign: "center", paddingVertical: 30 }}>
          No price drops yet. Check back after 2+ weeks.
        </Text>
      ) : graveyardItems.map((item, i) => (
        <View key={i} style={{
          backgroundColor: "rgba(80,255,150,0.06)", borderRadius: 14,
          borderWidth: 1, borderColor: "rgba(80,255,150,0.12)",
          padding: 16, marginBottom: 10,
          flexDirection: "row", alignItems: "center", gap: 12,
        }}>
          <Text style={{ fontSize: 24 }}>📉</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "rgba(255,255,255,0.85)", fontWeight: "700", fontSize: 14 }} numberOfLines={1}>{item.itemName}</Text>
            <Text style={{ color: "rgba(80,255,150,0.8)", fontSize: 12, marginTop: 3 }}>
              Was <Text style={{ color: "rgba(255,255,255,0.5)" }}>${item.originalPrice}</Text> · Now ~<Text style={{ fontWeight: "800", color: "#50ff96" }}>${item.currentEstimate}</Text>
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 2 }}>{item.ageDays}d ago · {item.message}</Text>
          </View>
          <Text style={{ color: "#50ff96", fontWeight: "900", fontSize: 16 }}>-{item.dropPct}%</Text>
        </View>
      ))}
      <Pressable onPress={closeGraveyard} style={{
        marginTop: 8, paddingVertical: 14, borderRadius: 14,
        backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center",
      }}>
        <Text style={{ color: "rgba(255,255,255,0.5)", fontWeight: "700" }}>Close</Text>
      </Pressable>
    </RNAnimated.View>
  </View>
) : null}

{/* Feature 12: Snipe Timer Sheet */}
{snipeOpen ? (
  <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "flex-end", zIndex: 100000 }}>
    <Pressable
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.65)" }}
      onPress={closeSnipe}
    />
    <RNAnimated.View style={{
      backgroundColor: "#0f0f0f", borderTopLeftRadius: 24, borderTopRightRadius: 24,
      borderTopWidth: 1, borderColor: "rgba(255,220,60,0.15)",
      padding: 24, paddingBottom: 40,
      transform: [{ translateY: snipeY }], opacity: snipeOp,
    }}>
      <Text style={{ color: "rgba(255,220,60,0.5)", fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 6 }}>EBAY AUCTION TOOL</Text>
      <Text style={{ color: "#fff", fontWeight: "900", fontSize: 20, marginBottom: 20 }}>⏱️ Auction Snipe Timer</Text>
      {snipeData ? (
        <>
          <View style={{
            backgroundColor: "rgba(255,220,60,0.08)", borderRadius: 16,
            borderWidth: 1, borderColor: "rgba(255,220,60,0.18)",
            padding: 20, marginBottom: 16, alignItems: "center",
          }}>
            <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>TIME LEFT</Text>
            <Text style={{ color: "#ffdc3c", fontWeight: "900", fontSize: 40, marginVertical: 8 }}>{snipeData.timeLabel}</Text>
            <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Bid at exactly 8 seconds before end</Text>
          </View>
          {snipeData.maxBid ? (
            <View style={{
              backgroundColor: "rgba(80,255,150,0.06)", borderRadius: 14,
              borderWidth: 1, borderColor: "rgba(80,255,150,0.12)",
              padding: 16, marginBottom: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center",
            }}>
              <View>
                <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>MAX BID (92% of market)</Text>
                <Text style={{ color: "#50ff96", fontWeight: "900", fontSize: 28, marginTop: 4 }}>${snipeData.maxBid}</Text>
              </View>
              <Text style={{ fontSize: 30 }}>🎯</Text>
            </View>
          ) : null}
          <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, textAlign: "center", marginBottom: 20 }}>{snipeData.message}</Text>
          <Pressable
            onPress={() => Share.share({ message: `⏱️ SNIPE REMINDER: Bid $${snipeData?.maxBid || "max"} on "${activeResult?.itemName}" at exactly 8 seconds before auction ends (${snipeData ? new Date(snipeData.snipeAt).toLocaleTimeString() : "check app"})` })}
            style={{ backgroundColor: "rgba(255,220,60,0.12)", borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 16, borderWidth: 1, borderColor: "rgba(255,220,60,0.25)" }}
          >
            <Text style={{ color: "#ffdc3c", fontWeight: "800", fontSize: 14 }}>📲 Share Snipe Reminder</Text>
          </Pressable>
        </>
      ) : (
        <Text style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", paddingVertical: 30 }}>Loading auction data…</Text>
      )}
      <Pressable onPress={closeSnipe} style={{
        paddingVertical: 14, borderRadius: 14,
        backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center",
      }}>
        <Text style={{ color: "rgba(255,255,255,0.5)", fontWeight: "700" }}>Close</Text>
      </Pressable>
    </RNAnimated.View>
  </View>
) : null}

{/* Feature 14: Profit Per Hour Sheet */}
{profitOpen ? (
  <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "flex-end", zIndex: 100000 }}>
    <Pressable
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.65)" }}
      onPress={closeProfitSheet}
    />
    <RNAnimated.View style={{
      backgroundColor: "#0f0f0f", borderTopLeftRadius: 24, borderTopRightRadius: 24,
      borderTopWidth: 1, borderColor: "rgba(255,255,255,0.08)",
      padding: 24, paddingBottom: 40,
      transform: [{ translateY: profitY }], opacity: profitOp,
    }}>
      <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 6 }}>HUSTLE REALITY CHECK</Text>
      <Text style={{ color: "#fff", fontWeight: "900", fontSize: 20, marginBottom: 20 }}>💰 Profit Per Hour</Text>
      {profitPerHour ? (
        <>
          <View style={{
            backgroundColor: profitPerHour.belowMinWage ? "rgba(255,60,60,0.08)" : "rgba(80,255,150,0.06)",
            borderRadius: 16, borderWidth: 1,
            borderColor: profitPerHour.belowMinWage ? "rgba(255,60,60,0.18)" : "rgba(80,255,150,0.12)",
            padding: 20, marginBottom: 16, alignItems: "center",
          }}>
            <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>EFFECTIVE HOURLY RATE</Text>
            <Text style={{
              fontWeight: "900", fontSize: 44, marginVertical: 8,
              color: profitPerHour.belowMinWage ? "#ff6b6b" : "#50ff96",
            }}>
              {profitPerHour.effectiveHourlyRate > 0 ? `$${profitPerHour.effectiveHourlyRate}` : "$0"}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>per hour</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
            <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 14, alignItems: "center" }}>
              <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, textTransform: "uppercase" }}>Total Profit</Text>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 20, marginTop: 4 }}>${profitPerHour.totalProfit}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 14, alignItems: "center" }}>
              <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, textTransform: "uppercase" }}>Time Spent</Text>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 20, marginTop: 4 }}>{profitPerHour.totalTimeHours}h</Text>
            </View>
          </View>
          <Text style={{
            color: profitPerHour.belowMinWage ? "#ff8080" : "rgba(255,255,255,0.5)",
            fontSize: 14, textAlign: "center", marginBottom: 20, lineHeight: 20,
          }}>{profitPerHour.verdict}</Text>
          {profitPerHour && profitPerHour.effectiveHourlyRate > 0 ? (
            <View style={{ backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>OPTIMAL FLIP SIZE</Text>
              <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 13 }}>
                {profitPerHour.effectiveHourlyRate < 10
                  ? "Focus on $100+ flips only. Small items aren't worth your time."
                  : profitPerHour.effectiveHourlyRate < 25
                  ? "Sweet spot: $40–150 flips with fast turnover (under 7 days)."
                  : "You're efficient. Keep targeting $50–200 items at your current pace."}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}
      <Pressable onPress={closeProfitSheet} style={{
        paddingVertical: 14, borderRadius: 14,
        backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center",
      }}>
        <Text style={{ color: "rgba(255,255,255,0.5)", fontWeight: "700" }}>Close</Text>
      </Pressable>
    </RNAnimated.View>
  </View>
) : null}

{/* ── INTERACTIVE CINEMATIC TUTORIAL ───────────────────────────────────── */}
{showITutorial ? (() => {
  const step = I_STEPS[Math.min(iTutStep, I_STEPS.length - 1)];
  const spot = step?.spotlight ?? null;
  const tooltipGoesTop = !!(step?.tooltipTop && spot);
  const aboveTabBar = TAB_BAR_BOTTOM + TAB_BAR_H + 20;
  const tooltipPos: any = tooltipGoesTop && spot
    ? { bottom: SH - spot.y + 20, left: 20, right: 20 }
    : { bottom: aboveTabBar, left: 20, right: 20 };

  return (
    <RNAnimated.View pointerEvents="box-none" style={[StyleSheet.absoluteFillObject, { zIndex: 100001, opacity: tutorialOpacity }]}>
      {/* Full-screen dark backdrop */}
      <RNAnimated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.88)", opacity: iTutBgOp }]}
      />

      {/* Spotlight cutout panels (4-panel technique) */}
      {spot ? (
        <RNAnimated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { opacity: iTutSpotOp }]}>
          {/* Top */}
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: spot.y, backgroundColor: "rgba(0,0,0,0.88)" }} />
          {/* Bottom */}
          <View style={{ position: "absolute", top: spot.y + spot.h, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.88)" }} />
          {/* Left */}
          <View style={{ position: "absolute", top: spot.y, left: 0, width: spot.x, height: spot.h, backgroundColor: "rgba(0,0,0,0.88)" }} />
          {/* Right */}
          <View style={{ position: "absolute", top: spot.y, left: spot.x + spot.w, right: 0, height: spot.h, backgroundColor: "rgba(0,0,0,0.88)" }} />
          {/* Glow ring border */}
          <RNAnimated.View style={{
            position: "absolute",
            top: spot.y - 5,
            left: spot.x - 5,
            width: spot.w + 10,
            height: spot.h + 10,
            borderRadius: spot.r + 5,
            borderWidth: 2.5,
            borderColor: "rgba(255,255,255,0.88)",
            opacity: iTutRingOpacity,
            transform: [{ scale: iTutRingScale }],
            shadowColor: "#ffffff",
            shadowOpacity: 0.65,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 0 },
          }} />
          {/* Outer glow halo */}
          <RNAnimated.View style={{
            position: "absolute",
            top: spot.y - 14,
            left: spot.x - 14,
            width: spot.w + 28,
            height: spot.h + 28,
            borderRadius: spot.r + 14,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.22)",
            opacity: iTutRingOpacity,
            transform: [{ scale: iTutRingScale }],
          }} />
          {/* Expanding ripple rings — centered on spotlight */}
          {([iTutRipple0, iTutRipple1, iTutRipple2] as const).map((rVal, i) => (
            <RNAnimated.View
              key={`ripple-${i}`}
              pointerEvents="none"
              style={{
                position: "absolute",
                top: spot.y,
                left: spot.x,
                width: spot.w,
                height: spot.h,
                borderRadius: spot.r,
                borderWidth: 2,
                borderColor: "rgba(255,255,255,0.7)",
                opacity: rVal.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.55, 0] }),
                transform: [{
                  scale: rVal.interpolate({ inputRange: [0, 1], outputRange: [1.0, 1.75] }),
                }],
              }}
            />
          ))}
        </RNAnimated.View>
      ) : null}

      {/* Floating tooltip card */}
      <RNAnimated.View
        pointerEvents="box-none"
        style={[{
          position: "absolute",
          opacity: iTutCardOp,
          transform: [{ translateY: iTutCardY }],
        }, tooltipPos]}
      >
        <View style={{
          backgroundColor: "rgba(8,8,8,0.97)",
          borderRadius: 30,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.09)",
          padding: 24,
          shadowColor: "#000",
          shadowOpacity: 0.75,
          shadowRadius: 40,
          shadowOffset: { width: 0, height: 10 },
        }}>
          {/* Icon + badge row */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <View style={{
              width: 46, height: 46, borderRadius: 15,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
              alignItems: "center", justifyContent: "center",
              shadowColor: step?.iconColor || "white",
              shadowOpacity: 0.4, shadowRadius: 12,
            }}>
              <Ionicons name={(step?.icon || "sparkles-outline") as any} size={22} color={step?.iconColor || "white"} />
            </View>
            <View style={{
              paddingHorizontal: 11, paddingVertical: 5,
              borderRadius: 99,
              backgroundColor: "rgba(255,255,255,0.05)",
              borderWidth: 1, borderColor: "rgba(255,255,255,0.09)",
            }}>
              <Text style={{ color: step?.accentColor || "rgba(255,255,255,0.55)", fontSize: 10, fontWeight: "800", letterSpacing: 1.8 }}>
                {step?.subtitle || ""}
              </Text>
            </View>
          </View>

          <Text style={{ color: "white", fontSize: 26, fontWeight: "900", letterSpacing: -0.6, lineHeight: 31, marginBottom: 10 }}>
            {step?.title || ""}
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.52)", fontSize: 14, lineHeight: 21, fontWeight: "500", marginBottom: 22 }}>
            {step?.body || ""}
          </Text>

          {/* Progress dots */}
          <View style={{ flexDirection: "row", gap: 4, marginBottom: 18 }}>
            {I_STEPS.map((_, i) => (
              <View key={i} style={{
                height: 3, borderRadius: 3,
                width: iTutStep === i ? 24 : 6,
                backgroundColor: iTutStep === i ? (step?.accentColor || "white") : "rgba(255,255,255,0.16)",
              }} />
            ))}
          </View>

          {/* Back button (visible when not on first step) */}
          {iTutStep > 0 ? (
            <Pressable
              onPress={() => goToITutStep(iTutStep - 1)}
              style={({ pressed }) => [{ marginBottom: 8, paddingVertical: 6, alignItems: "center", opacity: pressed ? 0.5 : 1 }]}
            >
              <Text style={{ color: "rgba(255,255,255,0.35)", fontWeight: "600", fontSize: 13 }}>← Back</Text>
            </Pressable>
          ) : null}

          {/* Primary CTA */}
          <Pressable
            onPress={() => {
              if (step?.isLast) {
                try { AsyncStorage.setItem("EVAN_ONBOARD_V1", "1"); } catch {}
                closeInteractiveTutorial();
                setShowWelcomeScreen(true);
                welcomeScreenOp.setValue(0);
                RNAnimated.timing(welcomeScreenOp, { toValue: 1, duration: 400, useNativeDriver: true }).start();
              } else {
                goToITutStep(iTutStep + 1);
              }
            }}
            style={({ pressed }) => [{
              paddingVertical: 15, borderRadius: 18,
              backgroundColor: pressed ? "rgba(235,235,235,0.96)" : "#ffffff",
              alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8,
              shadowColor: "#fff", shadowOpacity: pressed ? 0.05 : 0.22,
              shadowRadius: 16, shadowOffset: { width: 0, height: 4 },
            }]}
          >
            <Text style={{ color: "#000", fontWeight: "900", fontSize: 15 }}>
              {step?.isLast ? "Start Scanning" : "Next"}
            </Text>
            <Ionicons name={step?.isLast ? "arrow-forward" : "chevron-forward"} size={16} color="#000" />
          </Pressable>

          {/* Skip / Upgrade */}
          {step?.isLast && !isPro ? (
            <Pressable
              onPress={() => {
                try { AsyncStorage.setItem("EVAN_ONBOARD_V1", "1"); } catch {}
                closeInteractiveTutorial();
                setProfileModal("subscription");
              }}
              style={({ pressed }) => [{
                marginTop: 10, paddingVertical: 14, borderRadius: 18,
                backgroundColor: "rgba(255,255,255,0.07)",
                borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
                alignItems: "center", opacity: pressed ? 0.75 : 1,
              }]}
            >
              <Text style={{ color: "white", fontWeight: "700", fontSize: 14 }}>Upgrade to Pro</Text>
            </Pressable>
          ) : !step?.isLast ? (
            <Pressable
              onPress={() => {
                try { AsyncStorage.setItem("EVAN_ONBOARD_V1", "1"); } catch {}
                closeInteractiveTutorial();
              }}
              style={({ pressed }) => [{ marginTop: 10, paddingVertical: 12, alignItems: "center", opacity: pressed ? 0.5 : 1 }]}
            >
              <Text style={{ color: "rgba(255,255,255,0.32)", fontWeight: "600", fontSize: 13 }}>Skip tour</Text>
            </Pressable>
          ) : null}
        </View>
      </RNAnimated.View>

      {/* X close */}
      <RNAnimated.View style={{ position: "absolute", top: TOP + 14, right: 18, opacity: iTutBgOp }}>
        <Pressable
          onPress={() => {
            try { AsyncStorage.setItem("EVAN_ONBOARD_V1", "1"); } catch {}
            closeInteractiveTutorial();
          }}
          style={({ pressed }) => [{
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: "rgba(255,255,255,0.09)",
            borderWidth: 1, borderColor: "rgba(255,255,255,0.14)",
            alignItems: "center", justifyContent: "center",
            opacity: pressed ? 0.7 : 1,
          }]}
        >
          <Ionicons name="close" size={18} color="rgba(255,255,255,0.75)" />
        </Pressable>
      </RNAnimated.View>
    </RNAnimated.View>
  );
})() : null}

{/* ── ONBOARDING SURVEY (pre-tutorial, first-launch only) ─────────────── */}
{/* pointerEvents="box-none" on the wrapper: the container itself never captures
    touches, so as flowOpacity fades to 0 the tutorial layer beneath receives
    events immediately — zero "dead-touch" frames between survey and tutorial. */}
{showSurvey ? (
  <View
    pointerEvents="box-none"
    style={[StyleSheet.absoluteFillObject, { zIndex: 250000 }]}
  >
    <OnboardingFlow
      cameraPermissionGranted={permission?.granted ?? false}
      onComplete={handleSurveyComplete}
    />
  </View>
) : null}

{/* ── WELCOME TO EVAN AI SCREEN ────────────────────────────────────────── */}
{showWelcomeScreen ? (
  <RNAnimated.View
    style={[
      StyleSheet.absoluteFillObject,
      { zIndex: 200000, backgroundColor: "rgba(0,0,0,0.88)", justifyContent: "center", alignItems: "center", opacity: welcomeScreenOp },
    ]}
  >
    <Pressable
      style={[StyleSheet.absoluteFillObject, { justifyContent: "center", alignItems: "center" }]}
      onPress={() => {
        // Liquid Glass exit — spring scale-down + fade
        RNAnimated.parallel([
          RNAnimated.timing(welcomeScreenOp, { toValue: 0, duration: 340, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start(() => {
          setShowWelcomeScreen(false);
        });
      }}
    >
      <Text
        style={{ color: "white", fontSize: 34, fontWeight: "900", textAlign: "center", letterSpacing: -0.8, lineHeight: 42, paddingHorizontal: 40 }}
        allowFontScaling={false}
      >
        {"Welcome to\nEvan AI"}
      </Text>
      <Text
        style={{ color: "rgba(255,255,255,0.35)", fontSize: 14, marginTop: 18, letterSpacing: 0.5, fontWeight: "600" }}
        allowFontScaling={false}
      >
        Tap anywhere to begin
      </Text>
    </Pressable>
  </RNAnimated.View>
) : null}

{/* ── CINEMATIC TUTORIAL OVERLAY ──────────────────────────────────────── */}
{showOnboard ? (
  <View pointerEvents="box-none" style={[StyleSheet.absoluteFillObject, { zIndex: 100001 }]}>
    {/* Frosted Liquid Glass backdrop */}
    <RNAnimated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { opacity: onboardOpacity }]}>
      <BlurView intensity={65} tint="dark" style={StyleSheet.absoluteFillObject} />
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.45)" }]} />
    </RNAnimated.View>

    {/* X close button */}
    <RNAnimated.View style={{ position: "absolute", top: TOP + 14, right: 18, zIndex: 2, opacity: onboardOpacity }}>
      <Pressable
        onPress={skipOnboard}
        style={({ pressed }) => [{
          width: 36, height: 36, borderRadius: 18,
          backgroundColor: "rgba(255,255,255,0.09)",
          borderWidth: 1, borderColor: "rgba(255,255,255,0.14)",
          alignItems: "center", justifyContent: "center",
          opacity: pressed ? 0.7 : 1,
        }]}
      >
        <Ionicons name="close" size={18} color="rgba(255,255,255,0.75)" />
      </Pressable>
    </RNAnimated.View>

    {/* Bottom sheet card — Liquid Glass surface */}
    <RNAnimated.View
      style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        // Liquid Glass sheet
        backgroundColor: "rgba(8,8,8,0.92)",
        borderTopLeftRadius: 36, borderTopRightRadius: 36,
        borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.12)",
        paddingHorizontal: 28, paddingTop: 32,
        paddingBottom: BOTTOM + 24,
        opacity: onboardOpacity,
        transform: [{ translateY: onboardOpacity.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) }],
        shadowColor: "#000",
        shadowOpacity: IOS ? 0.65 : 0.45,
        shadowRadius: 48,
        shadowOffset: { width: 0, height: -14 },
        elevation: 28,
      }}
    >
      {/* Step content — fades/slides between steps */}
      <RNAnimated.View style={{ opacity: tutorialContentOp, transform: [{ translateY: tutorialContentY }] }}>
        {/* Icon */}
        <RNAnimated.View style={{
          width: 68, height: 68, borderRadius: 22,
          backgroundColor: TUTORIAL_STEPS[Math.min(tutorialStep, TUTORIAL_STEPS.length - 1)].iconBg,
          borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
          alignItems: "center", justifyContent: "center",
          marginBottom: 22,
          transform: [{ scale: tutorialIconScale }],
          shadowColor: TUTORIAL_STEPS[Math.min(tutorialStep, TUTORIAL_STEPS.length - 1)].iconColor,
          shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 4 },
        }}>
          <Ionicons
            name={TUTORIAL_STEPS[Math.min(tutorialStep, TUTORIAL_STEPS.length - 1)].icon}
            size={30}
            color={TUTORIAL_STEPS[Math.min(tutorialStep, TUTORIAL_STEPS.length - 1)].iconColor}
          />
        </RNAnimated.View>

        {/* Subtitle chip */}
        <View style={{ alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", marginBottom: 10 }}>
          <Text style={{ color: TUTORIAL_STEPS[Math.min(tutorialStep, TUTORIAL_STEPS.length - 1)].accentColor, fontSize: 10, fontWeight: "700", letterSpacing: 1.8 }}>
            {TUTORIAL_STEPS[Math.min(tutorialStep, TUTORIAL_STEPS.length - 1)].subtitle}
          </Text>
        </View>

        {/* Title */}
        <Text style={{ color: "white", fontSize: 30, fontWeight: "900", letterSpacing: -0.8, lineHeight: 36 }}>
          {TUTORIAL_STEPS[Math.min(tutorialStep, TUTORIAL_STEPS.length - 1)].title}
        </Text>

        {/* Body */}
        <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 15, lineHeight: 22, marginTop: 12, fontWeight: "500" }}>
          {TUTORIAL_STEPS[Math.min(tutorialStep, TUTORIAL_STEPS.length - 1)].body}
        </Text>
      </RNAnimated.View>

      {/* Progress dots */}
      <View style={{ flexDirection: "row", gap: 5, marginTop: 28, marginBottom: 18 }}>
        {TUTORIAL_STEPS.map((_, i) => (
          <RNAnimated.View key={i} style={{
            height: 3, borderRadius: 3,
            width: tutorialStep === i ? 24 : 6,
            backgroundColor: tutorialStep === i ? "white" : "rgba(255,255,255,0.18)",
          }} />
        ))}
      </View>

      {/* Primary CTA */}
      <Pressable
        onPress={tutorialStep >= TUTORIAL_STEPS.length - 1 ? skipOnboard : advanceTutorialStep}
        style={({ pressed }) => [{
          paddingVertical: 16, borderRadius: 18,
          backgroundColor: pressed ? "rgba(235,235,235,0.96)" : "#ffffff",
          alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8,
          shadowColor: "#fff", shadowOpacity: pressed ? 0.06 : 0.20,
          shadowRadius: 18, shadowOffset: { width: 0, height: 4 },
        }]}
      >
        <Text style={{ color: "#000", fontWeight: "900", fontSize: 15 }}>
          {tutorialStep >= TUTORIAL_STEPS.length - 1 ? "Start Scanning" : "Next"}
        </Text>
        <Ionicons
          name={tutorialStep >= TUTORIAL_STEPS.length - 1 ? "arrow-forward" : "chevron-forward"}
          size={16} color="#000"
        />
      </Pressable>

      {/* Secondary — upgrade (last step) or skip */}
      {tutorialStep >= TUTORIAL_STEPS.length - 1 && !isPro ? (
        <Pressable
          onPress={() => { skipOnboard(); setProfileModal("subscription"); }}
          style={({ pressed }) => [{
            marginTop: 10, paddingVertical: 14, borderRadius: 18,
            backgroundColor: "rgba(255,255,255,0.07)",
            borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
            alignItems: "center", opacity: pressed ? 0.75 : 1,
          }]}
        >
          <Text style={{ color: "white", fontWeight: "700", fontSize: 14 }}>Upgrade to Pro</Text>
        </Pressable>
      ) : tutorialStep < TUTORIAL_STEPS.length - 1 ? (
        <Pressable
          onPress={skipOnboard}
          style={({ pressed }) => [{ marginTop: 10, paddingVertical: 14, alignItems: "center", opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={{ color: "rgba(255,255,255,0.38)", fontWeight: "600", fontSize: 13 }}>Skip tutorial</Text>
        </Pressable>
      ) : null}
    </RNAnimated.View>
  </View>
) : null}

{/* ── TUTORIAL "ARE YOU SURE?" CONFIRM ────────────────────────────────── */}
<RNAnimated.View
  pointerEvents={tutorialConfirmOpen ? "box-none" : "none"}
  style={[StyleSheet.absoluteFillObject, { zIndex: 100001, justifyContent: "center", alignItems: "center", padding: 24, opacity: tutorialConfirmOp }]}
>
  <RNAnimated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.65)", opacity: tutorialConfirmOp }]} />
  <Pressable
    style={[StyleSheet.absoluteFillObject]}
    onPress={() => setTutorialConfirmOpen(false)}
  />
  <RNAnimated.View style={{
    width: "100%",
    backgroundColor: "rgba(14,14,14,0.98)",
    borderRadius: 28,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    padding: 28,
    shadowColor: "#000", shadowOpacity: 0.65, shadowRadius: 40, shadowOffset: { width: 0, height: 0 },
    transform: [{ translateY: tutorialConfirmY }],
  }}>
    {/* X close */}
    <Pressable
      onPress={() => setTutorialConfirmOpen(false)}
      style={({ pressed }) => [{
        position: "absolute", top: 18, right: 18,
        width: 34, height: 34, borderRadius: 17,
        backgroundColor: "rgba(255,255,255,0.08)",
        borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
        alignItems: "center", justifyContent: "center",
        opacity: pressed ? 0.7 : 1,
      }]}
    >
      <Ionicons name="close" size={16} color="rgba(255,255,255,0.7)" />
    </Pressable>

    <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
      <Ionicons name="play-circle-outline" size={26} color="white" />
    </View>
    <Text style={{ color: "white", fontSize: 22, fontWeight: "900", letterSpacing: -0.5 }}>
      Watch the tutorial?
    </Text>
    <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, marginTop: 8, lineHeight: 20, fontWeight: "500" }}>
      You&apos;ve already been through this — but hey, a refresher never hurts.
    </Text>

    <View style={{ flexDirection: "row", gap: 10, marginTop: 24 }}>
      <Pressable
        onPress={() => {
          // Start tutorial immediately so it mounts before confirm fades out
          openTutorial();
          // Small delay so tutorial overlay is rendered before confirm vanishes
          setTimeout(() => setTutorialConfirmOpen(false), 80);
        }}
        style={({ pressed }) => [{
          flex: 1, paddingVertical: 15, borderRadius: 16,
          backgroundColor: pressed ? "rgba(235,235,235,0.96)" : "#ffffff",
          alignItems: "center",
        }]}
      >
        <Text style={{ color: "#000", fontWeight: "900", fontSize: 14 }}>Yeah, show me</Text>
      </Pressable>
      <Pressable
        onPress={() => setTutorialConfirmOpen(false)}
        style={({ pressed }) => [{
          flex: 1, paddingVertical: 15, borderRadius: 16,
          backgroundColor: "rgba(255,255,255,0.07)",
          borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
          alignItems: "center", opacity: pressed ? 0.75 : 1,
        }]}
      >
        <Text style={{ color: "rgba(255,255,255,0.7)", fontWeight: "700", fontSize: 14 }}>Nah, I&apos;m good</Text>
      </Pressable>
    </View>
  </RNAnimated.View>
</RNAnimated.View>

{/* ===== TOP HUD (CAMERA ONLY) ===== */}
{tab === "camera" && !photo && !loadingResults && !showSplash ? (
  <RNAnimated.View
    pointerEvents="box-none"
    style={{
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      opacity: RNAnimated.multiply(topHudOpacity, cameraUiOpacity),
      transform: [{ translateY: topHudY }],
    }}
  >
    {/* Free scans pill — Liquid Glass capsule */}
    <Pressable
      onPress={() => {
        hapticSelect?.();
        setProfileModal("subscription");
      }}
      style={({ pressed }) => [
        {
          position: "absolute",
          top: TOP + 8,
          left: 16,
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 999,
          backgroundColor: "rgba(255,255,255,0.08)",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: "rgba(255,255,255,0.14)",
          shadowColor: "#000",
          shadowOpacity: IOS ? 0.25 : 0,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        },
        pressed && { opacity: 0.88, transform: [{ scale: 0.97 }] },
      ]}
    >
      <Text style={{ color: "white", fontSize: 16, fontWeight: "800" }} allowFontScaling={false}>
        {isPro ? "Pro · Unlimited" : `${scansUsed || 0}/${FREE_SCAN_LIMIT_SAFE} free scans`}
      </Text>
      <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, fontWeight: "800", marginTop: 2 }} allowFontScaling={false}>
        Tap to upgrade
      </Text>
    </Pressable>

    {/* Flashlight — Liquid Glass circle */}
    <Pressable
      onPress={() => {
        hapticSelect?.();
        setTorchOn((v) => !v);
      }}
      style={({ pressed }) => [
        {
          position: "absolute",
          top: TOP + 8,
          right: 16,
          width: 46,
          height: 46,
          borderRadius: 23,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: torchOn ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: torchOn ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.14)",
          shadowColor: "#000",
          shadowOpacity: IOS ? 0.25 : 0,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        },
        pressed && { opacity: 0.88, transform: [{ scale: 0.94 }] },
      ]}
    >
      <Ionicons name={torchOn ? "flash" : "flash-outline"} size={20} color="white" />
    </Pressable>

    {/* Scan mode pills */}
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: TOP + 74,
        left: 0,
        right: 0,
        alignItems: "center",
      }}
    >
      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        {Object.values(SCAN_MODES).map((t) => {
          const active = scanMode === t;
          return (
            <Pressable
              key={t}
              onPress={() => {
                hapticSelect?.();
                setScanMode(t as any);
              }}
              style={({ pressed }) => [
                {
                  paddingHorizontal: 18,
                  paddingVertical: 10,
                  borderRadius: 999,
                  // Liquid Glass pill
                  backgroundColor: active ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.07)",
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: active ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.12)",
                },
                pressed && { opacity: 0.88, transform: [{ scale: 0.96 }] },
              ]}
            >
              <Text style={{ color: "white", fontSize: 16, fontWeight: "900" }} allowFontScaling={false}>
                {t[0].toUpperCase() + t.slice(1)}
              </Text>
            </Pressable>
          );
        })}

        {/* Barcode pill */}
        <Pressable
          onPress={() => {
            hapticSelect?.();
            setBarcodeMode((v) => !v);
            setLastBarcode(null);
          }}
          style={({ pressed }) => [
            {
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 999,
              backgroundColor: barcodeMode ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.10)",
              borderWidth: 1,
              borderColor: barcodeMode ? "rgba(255,255,255,0.26)" : "rgba(255,255,255,0.14)",
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            },
            pressed && { opacity: 0.92, transform: [{ scale: 0.985 }] },
          ]}
        >
          <Ionicons name="barcode-outline" size={18} color="white" />
          <Text style={{ color: "white", fontSize: 16, fontWeight: "900" }}>
            Barcode
          </Text>
        </Pressable>
      </View>
    </View>

    {/* Sentient greeting — time-aware hint below scan pills */}
    <View
      pointerEvents="none"
      style={{ position: "absolute", top: TOP + 230, left: 0, right: 0, alignItems: "center" }}
    >
      <Text style={{ color: "rgba(255,255,255,0.28)", fontSize: 11, fontWeight: "500", letterSpacing: 0.4 }}>
        {getGreeting()}
      </Text>
    </View>
  </RNAnimated.View>
) : null}

{/* CAMERA TAB — hard-isolated: display:'none' kills bleed after fade */}
<RNAnimated.View
  style={[
    styles.tabFull,
{
  backgroundColor: TOK.C.bg,
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  opacity: tab === "camera" ? tabFade : 0,
  zIndex: tab === "camera" ? 30 : -1,
  display: tab === "camera" ? "flex" : "none",
  overflow: "hidden",
},
  ]}
pointerEvents={tab === "camera" && tabInteractable ? "auto" : "none"}
>
<View style={{ flex: 1 }}>

  {/* CAMERA + PINCH */}
  <GestureDetector gesture={pinch}>
    <View style={{ flex: 1 }} collapsable={false}>
      {permission?.granted ? (

<AnimatedCameraView
  ref={cameraRef}
  key={CAMERA_KEY}
  style={[
    StyleSheet.absoluteFillObject, // ✅ force-fill
    styles.camera,
    {
      opacity: showSplash ? 0.85 : 1,
      transform: [{ scale: showSplash ? 1.02 : 1 }],
    },
  ]}
          facing={cameraFacing}
          enableTorch={torchOn}
          animatedProps={cameraAnimatedProps}
          active={permission?.granted && cameraDelayedActive && tab === "camera"}
          onCameraReady={() => { setCameraReady(true); RNAnimated.timing(cameraReadyOp, { toValue: 1, duration: 200, useNativeDriver: true }).start(); }}
          barcodeScannerSettings={{
            barcodeTypes: [
              "ean13",
              "ean8",
              "upc_a",
              "upc_e",
              "code128",
              "code39",
            ],
          }}

onBarcodeScanned={(d) => {
  if (!barcodeModeRef.current) return;
  onBarcodeScanned(d);
}}
        />
      ) : (
        <View style={[styles.black, styles.center]}>
          <Text style={styles.permissionText}>Camera permission is required</Text>
          <Pressable onPress={requestPermission} style={styles.permissionBtn}>
            <Text style={styles.permissionBtnText}>Enable Camera</Text>
          </Pressable>
        </View>
      )}
      {/* Camera fade-in overlay — prevents black flash before preview appears */}
      <RNAnimated.View
        pointerEvents="none"
        style={{
          ...StyleSheet.absoluteFillObject,
          backgroundColor: "#000",
          opacity: cameraReadyOp.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        }}
      />
    </View>
  </GestureDetector>

{/* POLISH #4 — cinematic freeze frame */}
{/*
 * Cinematic freeze frame — disabled. The captured photo was being rendered
 * fullscreen as an Animated.Image with an opacity animation under a low-
 * intensity BlurView (14), which iOS rasterized at downscaled resolution
 * during the fade and read as a "pixelated" flash on every shutter press
 * and golden-moment reveal. The shutter ring snap + ripple already convey
 * "scan started" without the snapshot overlay.
 *
 * If we ever bring it back, lift BlurView intensity to >=50 (lower values
 * show visible block artifacts on iOS) and animate the WRAPPING View's
 * opacity rather than the Image's, so the bitmap is composited at native
 * scale instead of re-rasterized per frame.
 */}

<NeuralScanOverlay
  active={scanAnimActive}
  onFinished={onScanAnimFinished}
/>

{/* ✅ Dark vignette fade (cinematic) */}
<RNAnimated.View
  pointerEvents="none"
  style={[
    StyleSheet.absoluteFillObject,
    {
      opacity: vignetteOpacity,
      backgroundColor: "rgba(0,0,0,0.35)",
    },
  ]}
/>

{/* Rectangular framing guide (camera calm) */}
{!photo && !loadingResults ? (
  <View
    pointerEvents="none"
    style={[
      styles.frame,
      {
        // ✅ centered spacing: push guide a bit lower
        transform: [{ translateY: 64 }],
      },
    ]}
  />
) : null}

  {/* Barcode scanning frame (only when barcodeMode ON) */}
  {barcodeMode && !photo && !loadingResults ? (
    <View pointerEvents="none" style={styles.barcodeOverlay}>
      <View style={styles.barcodeFrame}>
        <RNAnimated.View style={[styles.barcodeFrameGlow, { opacity: barcodeAck }]} />
        <RNAnimated.View
          style={[
            styles.barcodeScanLine,
            { transform: [{ translateY: barcodeLineY }] },
          ]}
        />
      </View>
      <Text style={styles.barcodeHint}>Align barcode inside frame</Text>
    </View>
  ) : null}

  {/* PREVIEW */}
  {photo ? (
    <View style={styles.previewOverlay}>
      <Image source={{ uri: photo.uri }} style={styles.previewImage} />

      {/* Subtle bottom fade — sits behind the floating control card and
          softens the transition from photo to controls. Single short band
          (not the giant black slab from the prior pass that swallowed
          the bottom half of the screen). The control card carries its
          own contrast; the fade just smooths the optical edge. */}
      <View pointerEvents="none" style={styles.previewBottomFade} />

      <RNAnimated.View
        style={{
          position: "absolute",
          left: 18,
          right: 18,
          bottom: previewBottom,
          opacity: previewPanelOpacity,
          transform: [{ translateY: previewPanelY }],
        }}
      >
        {/* Floating glass control card — sits independently over the photo
            (photo remains visible above and around it). Card's own opaque
            backing gives full readability for labels and buttons without
            needing a screen-wide scrim. */}
        <View style={styles.previewControlCard}>
          <View>
            <Text style={styles.priceLabel}>Original price</Text>
            <TextInput
              value={scanPriceInput}
              onChangeText={setScanPriceInput}
              placeholder="$0.00"
              placeholderTextColor="rgba(255,255,255,0.40)"
              keyboardType="numeric"
              style={styles.priceInput}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
          </View>

          {/* Optional item name / brand hint — expandable chip. Centered
              between price input and action row so the vertical grid
              reads cleanly. */}
          <View style={styles.previewHintChipWrap}>
            <ItemHintInput
              value={itemNameInput}
              onChange={setItemNameInput}
              resetKey={photo?.uri ?? null}
            />
          </View>

          <View style={styles.previewActionRow}>
            <Pressable onPress={reset} style={[styles.modalSecondary, { flex: 1 }]}>
              <Text style={styles.modalSecondaryText}>Retake</Text>
            </Pressable>

            <Pressable
              onPress={handleUsePhoto}
              disabled={!canUsePhoto}
              style={[styles.modalPrimary, { flex: 1, marginBottom: 0, opacity: canUsePhoto ? 1 : 0.45 }]}
            >
              <Text style={styles.modalPrimaryText}>Use photo →</Text>
            </Pressable>
          </View>

          <Text style={styles.previewHint}>
            Enter both prices · name helps AI find it faster
          </Text>
        </View>
      </RNAnimated.View>
    </View>
  ) : null}


{/* Live Activity Ticker — always mounted so the tickerX animation chain never breaks on unmount */}
<RNAnimated.View
    pointerEvents="none"
    style={{
      position: "absolute",
      bottom: CAMERA_CONTROLS_BOTTOM + 200,
      left: 0,
      right: 0,
      height: 28,
      overflow: "hidden",
      opacity: cameraUiOpacity,
    }}
  >
    <View style={{
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.38)",
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(255,255,255,0.08)",
      justifyContent: "center",
      overflow: "hidden",
    }}>
      <RNAnimated.Text
        style={{
          color: "rgba(255,255,255,0.75)",
          fontSize: 11,
          fontWeight: "600",
          letterSpacing: 0.3,
          transform: [{ translateX: tickerX }],
          paddingLeft: 16,
          width: TICKER_TOTAL_W * 2 + 300,
        }}
      >
        {TICKER_TEXT}
      </RNAnimated.Text>
    </View>
  </RNAnimated.View>

{/* BOTTOM CAMERA CONTROLS (ABOVE TAB BAR, NO OVERLAY) */}
{tab === "camera" && !photo && !loadingResults ? (
  <RNAnimated.View
    style={[
      styles.cameraControlsRow,
      { bottom: CAMERA_CONTROLS_BOTTOM, opacity: cameraUiOpacity },
    ]}
    pointerEvents={tab === "camera" && !showSplash ? "auto" : "none"}
  >
    {/* ── Mode strip — Batch & Receipt toggles ──────────────────────── */}
    <View style={{
      position: "absolute",
      bottom: 140,
      left: 0,
      right: 0,
      flexDirection: "row",
      justifyContent: "center",
      gap: 10,
      pointerEvents: "box-none",
    }}>
      {/* Batch mode toggle */}
      <Pressable
        onPress={() => {
          hapticSelect();
          setBatchMode((v) => !v);
          if (receiptMode) setReceiptMode(false);
        }}
        style={[{
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 20,
          borderWidth: 1,
          backgroundColor: batchMode ? "rgba(120,255,180,0.15)" : "rgba(0,0,0,0.45)",
          borderColor: batchMode ? "rgba(120,255,180,0.50)" : "rgba(255,255,255,0.18)",
        }]}
      >
        <Ionicons
          name="layers-outline"
          size={14}
          color={batchMode ? "rgba(120,255,180,0.9)" : "rgba(255,255,255,0.65)"}
        />
        <Text style={{
          fontSize: 11,
          fontWeight: "600",
          color: batchMode ? "rgba(120,255,180,0.9)" : "rgba(255,255,255,0.65)",
          letterSpacing: 0.3,
        }}>
          {batchMode && batchQueue.filter((j) => j.status === "done").length > 0
            ? `Batch · ${batchQueue.filter((j) => j.status === "done").length} done`
            : "Batch"}
        </Text>
      </Pressable>

      {/* Receipt mode toggle */}
      <Pressable
        onPress={() => {
          hapticSelect();
          setReceiptMode((v) => !v);
          if (batchMode) setBatchMode(false);
        }}
        style={[{
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 20,
          borderWidth: 1,
          backgroundColor: receiptMode ? "rgba(120,180,255,0.15)" : "rgba(0,0,0,0.45)",
          borderColor: receiptMode ? "rgba(120,180,255,0.50)" : "rgba(255,255,255,0.18)",
        }]}
      >
        <Ionicons
          name="receipt-outline"
          size={14}
          color={receiptMode ? "rgba(120,180,255,0.9)" : "rgba(255,255,255,0.65)"}
        />
        <Text style={{
          fontSize: 11,
          fontWeight: "600",
          color: receiptMode ? "rgba(120,180,255,0.9)" : "rgba(255,255,255,0.65)",
          letterSpacing: 0.3,
        }}>
          Receipt
        </Text>
      </Pressable>

      {/* Inventory Scan button — opens inventory modal */}
      <Pressable
        onPress={() => { hapticSelect?.(); setInventoryOpen(true); }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 20,
          borderWidth: 1,
          backgroundColor: "rgba(0,0,0,0.45)",
          borderColor: "rgba(255,255,255,0.18)",
        }}
      >
        <Ionicons name="albums-outline" size={14} color="rgba(255,255,255,0.65)" />
        <Text style={{ fontSize: 11, fontWeight: "600", color: "rgba(255,255,255,0.65)", letterSpacing: 0.3 }}>
          Inventory
        </Text>
      </Pressable>
    </View>

    {/* LEFT SLOT (fixed width) */}
    <View style={{ width: 72, alignItems: "flex-start" }}>
      <Pressable
        onPress={() => {
          if (batchMode) {
            setBatchOpen(true);
          } else {
            pickFromRoll();
          }
        }}
        style={({ pressed }) => [
          styles.sideBtn,
          pressed && styles.sideBtnPressed,
        ]}
      >
        <Ionicons
          name={batchMode ? "list-outline" : "images-outline"}
          size={24}
          color={batchMode ? "rgba(120,255,180,0.9)" : "white"}
        />
        {batchMode && batchQueue.length > 0 ? (
          <View style={{
            position: "absolute",
            top: -4,
            right: -4,
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: "rgba(120,255,180,0.9)",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <Text style={{ fontSize: 9, color: "#000", fontWeight: "800" }}>
              {batchQueue.length > 99 ? "99" : String(batchQueue.length)}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </View>

    {/* CENTER SLOT (true center) */}
    <View style={{ flex: 1, alignItems: "center" }}>
      <Pressable
        onPress={takePhoto}
        style={({ pressed }) => [
          styles.shutterPressable,
          pressed && { opacity: 0.96, transform: [{ scale: 0.99 }] },
        ]}
      >
        <RNAnimated.View
          style={[
            styles.shutterOuter,
            { transform: [{ scale: snapScale }] },
            batchMode  ? { borderColor: "rgba(120,255,180,0.7)", borderWidth: 3 } : null,
            receiptMode ? { borderColor: "rgba(120,180,255,0.7)", borderWidth: 3 } : null,
          ]}
        >
          <RNAnimated.View
            pointerEvents="none"
            style={[
              styles.shutterBurstRing,
              {
                opacity: ringOpacity,
                transform: [{ scale: ringScale }],
              },
            ]}
          />
          <View style={styles.shutterInner} />
          {/* Water ripple — centered inside shutterOuter so rings expand from exact shutter center */}
          {rippleAnims.map((r, i) => (
            <RNAnimated.View
              key={i}
              pointerEvents="none"
              style={{
                position: "absolute",
                width: 120 + i * 30,
                height: 120 + i * 30,
                borderRadius: (120 + i * 30) / 2,
                borderWidth: 1.5,
                borderColor: "rgba(255,255,255,0.7)",
                opacity: r.opacity,
                transform: [{ scale: r.scale }],
              }}
            />
          ))}
        </RNAnimated.View>
      </Pressable>
    </View>

    {/* RIGHT SLOT (fixed width) */}
    <View style={{ width: 72, alignItems: "flex-end" }}>
      <Pressable
        onPress={flipCamera}
        style={({ pressed }) => [
          styles.cameraSideBtn,
          pressed && styles.cameraSideBtnPressed,
        ]}
      >
        <Ionicons name="camera-reverse-outline" size={24} color="white" />
      </Pressable>
    </View>
  </RNAnimated.View>
) : null}
</View>

</RNAnimated.View>
{/* RESULTS SCREEN — hard-isolated */}
<RNAnimated.View
style={[
  styles.full,
{
  backgroundColor: "transparent",
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,

  opacity: tab === "results" ? tabFade : 0,

  // Tab cross-fade is opacity-only. Removed translateY 8→0 (visible swipe-up
  // bleed during transitions) and scale 0.995→1 (sub-pixel rasterization
  // pixelated text during the cross-fade). Per the no-pixelation /
  // no-tab-bleed motion rules.

  zIndex: tab === "results" ? 30 : -1,
  display: tab === "results" ? "flex" : "none",
  overflow: "hidden",
},
]}
  pointerEvents={tab === "results" && tabInteractable ? "auto" : "none"}
>
<SafeAreaView style={{ flex: 1 }} edges={loadingResults ? [] : ["top", "bottom"]}>
<ScrollView
  style={loadingResults ? { flex: 1, backgroundColor: TOK.C.bg } : [styles.page, { flex: 1 }]}
  contentContainerStyle={loadingResults ? { flexGrow: 1 } : { flexGrow: 1, paddingTop: 0, paddingBottom: 100, backgroundColor: "transparent" }}
  showsVerticalScrollIndicator={false}
  bounces={true}
  alwaysBounceVertical={true}
  overScrollMode="always"
  scrollEventThrottle={16}
  scrollEnabled={!loadingResults}
  keyboardShouldPersistTaps="handled"
  nestedScrollEnabled={true}
>

{/* Top bar (Safe Area protected) */}
{!loadingResults ? (
  <View
    style={[
      styles.resultsTopBar,
      {
        // Pillar 1.8 — wider nav-to-identity gap so the verdict
        // module owns the eye-stop. 10 → 14 reads as intentional
        // whitespace separating the chrome from the intelligence.
        marginBottom: 14,
        paddingTop: 0,
        backgroundColor: "transparent",
        zIndex: 20,
      },
    ]}
  >
    <Pressable
      onPress={() => goTab("camera")}
      style={({ pressed }) => [
        styles.resultsBackRow,
        pressed && { opacity: 0.85 },
      ]}
    >
      <Ionicons name="chevron-back" size={16} color="rgba(255,255,255,0.78)" />
      <Text style={styles.resultsBackText}>Camera</Text>
    </Pressable>

    <Pressable
      onPress={startNewScan}
      style={({ pressed }) => [
        styles.resultsNewScanPill,
        pressed && {
          opacity: 0.92,
          transform: [{ scale: 0.985 }],
        },
      ]}
    >
      <Ionicons name="camera-outline" size={14} color="rgba(255,255,255,0.92)" />
      <Text style={styles.resultsNewScanText}>New scan</Text>
    </Pressable>
  </View>
) : null}


<ResultsContent
  activeResult={activeResult}
  results={results}
  marketPool={seeMoreListings}
  loadingResults={loadingResults}
  loadingPhotoUri={loadingPhotoUri}
  uiError={uiError}
  priceChangeBanner={priceChangeBanner}
  scanStage={scanStage}
  scanStageMeta={scanStageMeta}
  showRetryWhileLoading={showRetryWhileLoading}
  slowNetwork={slowNetwork}
  loadingDots={loadingDots}
  retryReveal={retryReveal}
  retryScale={retryScale}
  resultEntry={resultEntry}
  neuralPulse={neuralPulse}
  aiRevealActive={aiRevealActive}
  weaponStats={weaponStats}
  intelLevel={intelLevel}
  lastScan={lastScan}
  onCancel={cancelActiveScan}
  onRetry={retrySameScan}
  onNewScan={startNewScan}
  onOpenListing={safeOpenListingUrl}
  onTrack={toggleWatchlist}
  onCopy={async () => {
    if (!activeResult) return;
    hapticSelect?.();
    await Clipboard.setStringAsync(buildShareCardTextV2(activeResult));
    setSavedToast("Copied!");
  }}
  onScanAgain={async () => {
    if (!activeResult?.photoUri || loadingResults) return;
    hapticSelect();
    await runScan({
      photoUri: activeResult.photoUri,
      scannedPrice: activeResult.scannedPrice,
      countScan: false,
    });
  }}
  onProfitCalc={() => setProfitCalcOpen(true)}
  onDetails={() => setResultModalOpen(true)}
  onDismissError={() => setUiError(null)}
  onRetryAfterError={() => { setUiError(null); retrySameScan(); }}
  onZoomImage={(uri) => setZoomUri(uri)}
  watchlist={watchlist}
  onToggleWatchlist={toggleWatchlist}
  onShareCard={async (card) => {
    const name  = card?.itemName || card?.title || "this item";
    const price = card?.price;
    const saved = card?.savedAmount;
    const msg   = saved && saved > 0
      ? `Just saved $${Number(saved).toFixed(0)} using Evan AI! Found ${name} for $${Number(price).toFixed(2)}.\nCheck it out: https://evanai.app`
      : `Found ${name} for $${Number(price).toFixed(2)} using Evan AI — AI price scanner.\nhttps://evanai.app`;
    try { await Share.share({ message: msg }); } catch {}
  }}
  offlineCachedAt={offlineCachedAt}
  onRefreshFromCache={() => {
    // Clear cached state and retry the scan
    setOfflineCachedAt(null);
    if (activeResult?.photoUri) {
      runScan({
        photoUri: activeResult.photoUri,
        scannedPrice: activeResult.scannedPrice ?? null,
        countScan: false,
      });
    }
  }}
  onVaultSave={handleVaultSave}
  onOrbPress={handleOrbPress}
  isNet={netProfitEnabled}
  onLowball={openLowball}
  onBoughtIt={() => setConfettiKey(Date.now())}
/>

{/* "More details" toggle — collapses every secondary panel under one tap. */}
{/* BETA: "More details" toggle hidden. The 20+ secondary cards below
    (Set Alert, ConditionMismatch, DeepAuth, CommunityComps, HaggleScore,
    FlipScanner CTA, Negotiate/Share, FlipProfile, Intel Signal cards, etc.)
    remain in code and stay gated on `moreDetailsOpen` — they just never
    open because the toggle is invisible. Restore by uncommenting this
    block when shipping the post-beta power-user mode.
{activeResult && !loadingResults ? (
  <View style={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: 4 }}>
    <Pressable
      onPress={() => { try { Haptics.selectionAsync(); } catch {} setMoreDetailsOpen(o => !o); }}
      style={({ pressed }) => [{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: "rgba(255,255,255,0.04)",
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "rgba(255,255,255,0.10)",
        paddingVertical: 12,
        opacity: pressed ? 0.7 : 1,
      }]}
    >
      <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: "800", letterSpacing: 1.4, textTransform: "uppercase" }}>
        {moreDetailsOpen ? "Hide details" : "More details"}
      </Text>
      <Ionicons
        name={moreDetailsOpen ? "chevron-up" : "chevron-down"}
        size={13}
        color="rgba(255,255,255,0.45)"
      />
    </Pressable>
  </View>
) : null}
*/}

{moreDetailsOpen ? (<>
{/* Feature 8: Set Alert row — visible below results when item is loaded */}
{activeResult && !loadingResults ? (
  <View style={{ paddingHorizontal: 18, paddingTop: 6 }}>
    <Pressable
      onPress={() => setProfitCalcOpen(true)}
      style={({ pressed }) => [{
        flexDirection: "row", alignItems: "center", gap: 8,
        backgroundColor: "rgba(255,200,0,0.07)",
        borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
        borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,200,0,0.25)",
        opacity: pressed ? 0.7 : 1,
      }]}
    >
      <Ionicons name="notifications-outline" size={15} color="#ffc800" />
      <Text style={{ color: "#ffc800", fontSize: 13, fontWeight: "600", flex: 1 }}>
        {watchlist?.find((w: any) => w.query === activeResult?.query)?.targetPrice
          ? `Alert set · $${watchlist.find((w: any) => w.query === activeResult?.query)?.targetPrice}`
          : "Set price alert — notify me when below $X"}
      </Text>
      <Ionicons name="chevron-forward" size={13} color="rgba(255,200,0,0.5)" />
    </Pressable>
  </View>
) : null}

{/* Feature 12: Visual condition mismatch card */}
{(activeResult && !loadingResults) ? (
  <ConditionMismatchCard
    assessment={conditionAssessment}
    loading={conditionAssessLoading}
    scannedPrice={activeResult?.scannedPrice}
  />
) : null}

{/* Feature 11: Deep auth card */}
{(activeResult && !loadingResults) ? (
  <DeepAuthCard
    result={deepAuthResult}
    loading={deepAuthLoading}
  />
) : null}

{/* Feature 13: Community comps */}
{(activeResult && !loadingResults) ? (
  <CommunityCompsCard
    data={communityComps}
    loading={communityCompsLoading}
    query={activeResult?.visionQuery || activeResult?.itemName || null}
    apiBase={process.env.EXPO_PUBLIC_API_URL ??
      (Platform.OS === "ios" ? "http://192.168.1.227:3001" : "http://10.0.2.2:3001")}
    userId={installId || effectiveReferralCode || "anon"}
  />
) : null}

{/* Feature 2: Haggle Score */}
{(activeResult && !loadingResults) ? (
  <HaggleScoreCard
    result={haggleResult}
    loading={haggleLoading}
    scannedPrice={activeResult?.scannedPrice ?? null}
  />
) : null}

{/* Feature 10: Flip Scanner CTA row */}
{activeResult && !loadingResults && (
  <View style={{ paddingHorizontal: 18, paddingTop: 6, paddingBottom: 14 }}>
    <Pressable
      onPress={() => runFlipScanner(activeResult?.category || "sneakers")}
      style={({ pressed }) => [{
        flexDirection: "row", alignItems: "center", gap: 8,
        backgroundColor: "rgba(80,255,150,0.07)",
        borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
        borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(80,255,150,0.2)",
        opacity: pressed ? 0.7 : 1,
      }]}
    >
      <Ionicons name="scan-outline" size={15} color="#50ff96" />
      <Text style={{ color: "#50ff96", fontSize: 13, fontWeight: "600", flex: 1 }}>
        {zipCode ? "Scan for flip opportunities near me" : "Flip Scanner — set zip to find local deals"}
      </Text>
      {flipScanLoading
        ? <ActivityIndicator size="small" color="#50ff96" />
        : <Ionicons name="chevron-forward" size={13} color="rgba(80,255,150,0.5)" />}
    </Pressable>
  </View>
)}

{/* ── Negotiate + Share action row ────────────────────── */}
{activeResult && !loadingResults ? (
  <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 18, paddingVertical: 8 }}>
    <Pressable
      onPress={() => setNegotiationOpen(true)}
      style={({ pressed }) => [{
        flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
        backgroundColor: "rgba(0,200,120,0.10)", borderRadius: 14, paddingVertical: 12,
        borderWidth: 1, borderColor: "rgba(0,200,120,0.25)", opacity: pressed ? 0.7 : 1,
      }]}
    >
      <Ionicons name="chatbubble-ellipses-outline" size={15} color="rgba(0,220,120,0.9)" />
      <Text style={{ color: "rgba(0,220,120,0.9)", fontWeight: "800", fontSize: 13 }}>Negotiate</Text>
    </Pressable>
    <Pressable
      onPress={() => setShareCardOpen(true)}
      style={({ pressed }) => [{
        flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
        backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 14, paddingVertical: 12,
        borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", opacity: pressed ? 0.7 : 1,
      }]}
    >
      <Ionicons name="share-outline" size={15} color="rgba(255,255,255,0.7)" />
      <Text style={{ color: "rgba(255,255,255,0.7)", fontWeight: "800", fontSize: 13 }}>Share find</Text>
    </Pressable>
  </View>
) : null}

{/* ── Flip Profile ─────────────────────────────────────── */}
{tab === "results" && (flipProfile || flipProfileLoading) && !loadingResults ? (
  <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}>
    <FlipProfileCard profile={flipProfile} loading={flipProfileLoading} />
  </View>
) : null}

{/* ── Intel Signal Cards ──────────────────────────────── */}
{tab === "results" && (ghostRisk || deadStockData || rivalryCount > 0 || dupeScan || conditionDrift || saturation || activeResult) ? (() => {
  // Compute which signals are "active"
  const signals: { key: string; priority: number }[] = [];
  if (ghostRisk?.level === "high") signals.push({ key: "ghost_high", priority: 1 });
  if (deadStockData?.urgencyLevel === "high") signals.push({ key: "dead_high", priority: 2 });
  if (rivalryCount > 0) signals.push({ key: "rivalry", priority: 3 });
  if (dupeScan) signals.push({ key: "dupe", priority: 4 });
  if (conditionDrift) signals.push({ key: "conditionDrift", priority: 5 });
  if (saturation?.level === "high") signals.push({ key: "sat_high", priority: 6 });
  if (deadStockData && deadStockData.urgencyLevel !== "high") signals.push({ key: "dead_low", priority: 7 });
  if (ghostRisk?.level === "medium") signals.push({ key: "ghost_med", priority: 8 });
  if (flipFatigue) signals.push({ key: "fatigue", priority: 9 });
  if (activeResult) signals.push({ key: "lowball", priority: 10 });
  if (activeResult) signals.push({ key: "snipe", priority: 11 });

  const visibleCount = intelExpanded ? signals.length : Math.min(2, signals.length);
  const hiddenCount = signals.length - visibleCount;

  // Map key → JSX
  const cardMap: Record<string, React.ReactNode> = {
    ghost_high: ghostRisk ? (
      <View key="ghost_high" style={{ marginHorizontal: 16, marginBottom: 10, backgroundColor: "rgba(255,60,60,0.12)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,60,60,0.28)", padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <Text style={{ fontSize: 18 }}>👻</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#ff6b6b", fontWeight: "800", fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 3 }}>{ghostRisk.level === "high" ? "GHOST LISTING DETECTED" : "SUSPICIOUS LISTING"}</Text>
          <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>{ghostRisk.warning}</Text>
          {ghostRisk.signals.slice(0, 2).map((s, i) => <Text key={i} style={{ color: "rgba(255,120,120,0.7)", fontSize: 11, marginTop: 3 }}>· {s}</Text>)}
          <View style={{ marginTop: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
              <Text style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>SCAM RISK</Text>
              <Text style={{ color: ghostRisk.level === "high" ? "#ff4444" : "#ffb347", fontSize: 10, fontWeight: "800" }}>{ghostRisk.riskScore}%</Text>
            </View>
            <View style={{ height: 3, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
              <View style={{ height: 3, width: `${ghostRisk.riskScore}%` as any, backgroundColor: ghostRisk.level === "high" ? "#ff4444" : "#ffb347", borderRadius: 2 }} />
            </View>
          </View>
        </View>
      </View>
    ) : null,
    ghost_med: ghostRisk ? (
      <View key="ghost_med" style={{ marginHorizontal: 16, marginBottom: 10, backgroundColor: "rgba(255,60,60,0.12)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,60,60,0.28)", padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <Text style={{ fontSize: 18 }}>👻</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#ff6b6b", fontWeight: "800", fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 3 }}>{ghostRisk.level === "high" ? "GHOST LISTING DETECTED" : "SUSPICIOUS LISTING"}</Text>
          <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>{ghostRisk.warning}</Text>
          {ghostRisk.signals.slice(0, 2).map((s, i) => <Text key={i} style={{ color: "rgba(255,120,120,0.7)", fontSize: 11, marginTop: 3 }}>· {s}</Text>)}
          <View style={{ marginTop: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
              <Text style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>SCAM RISK</Text>
              <Text style={{ color: ghostRisk.level === "high" ? "#ff4444" : "#ffb347", fontSize: 10, fontWeight: "800" }}>{ghostRisk.riskScore}%</Text>
            </View>
            <View style={{ height: 3, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
              <View style={{ height: 3, width: `${ghostRisk.riskScore}%` as any, backgroundColor: ghostRisk.level === "high" ? "#ff4444" : "#ffb347", borderRadius: 2 }} />
            </View>
          </View>
        </View>
      </View>
    ) : null,
    dead_high: deadStockData ? (
      <View key="dead_high" style={{ marginHorizontal: 20, marginBottom: 10, padding: 14, borderRadius: 16, backgroundColor: "rgba(80,255,150,0.06)", borderWidth: 1, borderColor: "rgba(80,255,150,0.22)" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Ionicons name="time-outline" size={14} color="#50ff96" />
          <Text style={{ color: "#50ff96", fontSize: 10, fontWeight: "800", letterSpacing: 1.6 }}>
            {deadStockData.urgencyLevel === "high" ? "\uD83D\uDD25 SELLER IS DESPERATE" : "DEAD STOCK DETECTED"}
          </Text>
        </View>
        <Text style={{ color: "rgba(255,255,255,0.88)", fontSize: 14, fontWeight: "700" }}>{deadStockData.message}</Text>
        <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginTop: 4, fontWeight: "600" }}>
          Suggested offer: <Text style={{ color: "#50ff96", fontWeight: "800" }}>${deadStockData.suggestedOffer}</Text>
          <Text style={{ color: "rgba(255,255,255,0.35)" }}> · {deadStockData.leveragePct}% below ask</Text>
        </Text>
        {(deadStockData as any).negotiationScript ? (
          <Pressable
            onPress={() => Share.share({ message: (deadStockData as any).negotiationScript })}
            style={{ marginTop: 10, backgroundColor: "rgba(80,255,150,0.08)", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "rgba(80,255,150,0.15)" }}
          >
            <Text style={{ color: "rgba(80,255,150,0.6)", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>TAP TO COPY SCRIPT</Text>
            <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, lineHeight: 17, fontStyle: "italic" }}>&quot;{(deadStockData as any).negotiationScript}&quot;</Text>
          </Pressable>
        ) : null}
        {(deadStockData as any).leverageBar != null ? (
          <View style={{ marginTop: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
              <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>LEVERAGE</Text>
              <Text style={{ color: "#50ff96", fontSize: 10, fontWeight: "800" }}>{(deadStockData as any).leverageBar}%</Text>
            </View>
            <View style={{ height: 3, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
              <View style={{ height: 3, width: `${Math.min((deadStockData as any).leverageBar, 100)}%` as any, backgroundColor: "#50ff96", borderRadius: 2 }} />
            </View>
          </View>
        ) : null}
      </View>
    ) : null,
    dead_low: deadStockData ? (
      <View key="dead_low" style={{ marginHorizontal: 20, marginBottom: 10, padding: 14, borderRadius: 16, backgroundColor: "rgba(80,255,150,0.06)", borderWidth: 1, borderColor: "rgba(80,255,150,0.22)" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Ionicons name="time-outline" size={14} color="#50ff96" />
          <Text style={{ color: "#50ff96", fontSize: 10, fontWeight: "800", letterSpacing: 1.6 }}>
            {deadStockData.urgencyLevel === "high" ? "\uD83D\uDD25 SELLER IS DESPERATE" : "DEAD STOCK DETECTED"}
          </Text>
        </View>
        <Text style={{ color: "rgba(255,255,255,0.88)", fontSize: 14, fontWeight: "700" }}>{deadStockData.message}</Text>
        <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginTop: 4, fontWeight: "600" }}>
          Suggested offer: <Text style={{ color: "#50ff96", fontWeight: "800" }}>${deadStockData.suggestedOffer}</Text>
          <Text style={{ color: "rgba(255,255,255,0.35)" }}> · {deadStockData.leveragePct}% below ask</Text>
        </Text>
        {(deadStockData as any).negotiationScript ? (
          <Pressable
            onPress={() => Share.share({ message: (deadStockData as any).negotiationScript })}
            style={{ marginTop: 10, backgroundColor: "rgba(80,255,150,0.08)", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "rgba(80,255,150,0.15)" }}
          >
            <Text style={{ color: "rgba(80,255,150,0.6)", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>TAP TO COPY SCRIPT</Text>
            <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, lineHeight: 17, fontStyle: "italic" }}>&quot;{(deadStockData as any).negotiationScript}&quot;</Text>
          </Pressable>
        ) : null}
        {(deadStockData as any).leverageBar != null ? (
          <View style={{ marginTop: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
              <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>LEVERAGE</Text>
              <Text style={{ color: "#50ff96", fontSize: 10, fontWeight: "800" }}>{(deadStockData as any).leverageBar}%</Text>
            </View>
            <View style={{ height: 3, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
              <View style={{ height: 3, width: `${Math.min((deadStockData as any).leverageBar, 100)}%` as any, backgroundColor: "#50ff96", borderRadius: 2 }} />
            </View>
          </View>
        ) : null}
      </View>
    ) : null,
    rivalry: rivalryCount > 0 ? (
      <View key="rivalry" style={{ marginHorizontal: 20, marginBottom: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: "rgba(130,200,255,0.07)", borderWidth: 1, borderColor: "rgba(130,200,255,0.20)", flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name="people-outline" size={15} color="#82c8ff" />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <Text style={{ color: "#82c8ff", fontWeight: "800", fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase" }}>RESELLER RIVALRY</Text>
            <View style={{ backgroundColor: "rgba(255,60,60,0.25)", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
              <Text style={{ color: "#ff6b6b", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 }}>● LIVE</Text>
            </View>
          </View>
          <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: "600" }}>
            <Text style={{ color: "#82c8ff", fontWeight: "800" }}>{rivalryCount} other {rivalryCount === 1 ? "user" : "users"}</Text> scanned this in the last 2 hours.
          </Text>
          <Text style={{ color: "rgba(130,200,255,0.4)", fontSize: 11, marginTop: 4 }}>
            Flipper #{Math.abs(rivalryCount * 37 + 12)} · Flipper #{Math.abs(rivalryCount * 19 + 44)} {rivalryCount > 2 ? `· +${rivalryCount - 2} more` : ""}
          </Text>
        </View>
      </View>
    ) : null,
    dupe: dupeScan ? (
      <View key="dupe" style={{ marginHorizontal: 16, marginBottom: 10, backgroundColor: "rgba(200,160,255,0.10)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(200,160,255,0.22)", padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <Text style={{ fontSize: 18 }}>🔁</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#c8a0ff", fontWeight: "800", fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 3 }}>DÉJÀ VU SCAN</Text>
          <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>{dupeScan.message}</Text>
          {(dupeScan as any).inferredReason ? (
            <Text style={{ color: "rgba(200,160,255,0.5)", fontSize: 11, marginTop: 4, fontStyle: "italic" }}>{(dupeScan as any).inferredReason}</Text>
          ) : null}
        </View>
        <Pressable onPress={() => setDupeScan(null)}>
          <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 18 }}>×</Text>
        </Pressable>
      </View>
    ) : null,
    conditionDrift: conditionDrift ? (
      <View key="conditionDrift" style={{ marginHorizontal: 16, marginBottom: 10, backgroundColor: "rgba(255,160,0,0.12)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,160,0,0.28)", padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text style={{ fontSize: 18 }}>⚠️</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#ffb347", fontWeight: "800", fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 3 }}>CONDITION DOWNGRADED</Text>
          <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>
            {conditionDrift.itemName}: <Text style={{ color: "#ff8c42" }}>{conditionDrift.oldCondition}</Text> → <Text style={{ color: "#ff4444" }}>{conditionDrift.newCondition}</Text>
          </Text>
          <Text style={{ color: "rgba(255,179,71,0.6)", fontSize: 11, marginTop: 3 }}>Seller quietly changed the condition listing.</Text>
          <Text style={{ color: "rgba(255,179,71,0.55)", fontSize: 11, marginTop: 4 }}>
            Estimated value impact: ~{conditionDrift.oldCondition.toLowerCase().includes("like new") || conditionDrift.newCondition.toLowerCase().includes("fair") ? "20–30" : "10–15"}% price drop
          </Text>
        </View>
        <Pressable onPress={() => setConditionDrift(null)}>
          <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 18 }}>×</Text>
        </Pressable>
      </View>
    ) : null,
    sat_high: saturation ? (
      <View key="sat_high" style={{ marginHorizontal: 16, marginBottom: 10, backgroundColor: saturation.level === "high" ? "rgba(255,100,60,0.10)" : "rgba(255,200,60,0.08)", borderRadius: 14, borderWidth: 1, borderColor: saturation.level === "high" ? "rgba(255,100,60,0.25)" : "rgba(255,200,60,0.20)", padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <Text style={{ fontSize: 18 }}>📊</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: saturation.level === "high" ? "#ff6b3d" : "#ffc83d", fontWeight: "800", fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 3 }}>
            {saturation.level === "high" ? "OVERSATURATED MARKET" : "COMPETITIVE CATEGORY"}
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>{saturation.warning}</Text>
          {saturation.suggestion ? (
            <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 4 }}>{saturation.suggestion}</Text>
          ) : null}
          {(saturation as any).trendArrow ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
              <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 13 }}>{(saturation as any).trendArrow}</Text>
              <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>
                {(saturation as any).weeklyChange} this week · national data ±15% local
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    ) : null,
    fatigue: flipFatigue ? (
      <View key="fatigue" style={{ marginHorizontal: 20, marginBottom: 10, padding: 16, borderRadius: 18, backgroundColor: "rgba(255,180,0,0.07)", borderWidth: 1, borderColor: "rgba(255,180,0,0.22)" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Ionicons name="flame-outline" size={16} color="#ffd060" />
          <Text style={{ color: "#ffd060", fontSize: 10, fontWeight: "800", letterSpacing: 1.6 }}>FLIP FATIGUE DETECTED</Text>
        </View>
        <Text style={{ color: "rgba(255,255,255,0.88)", fontSize: 14, fontWeight: "700", lineHeight: 20 }}>
          {flipFatigue.count} {flipFatigue.category} scans this week. Zero purchased.
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "500", marginTop: 4 }}>
          You&apos;re hunting in a crowded lane. Switch categories or you&apos;re wasting time.
        </Text>
        <Text style={{ color: "rgba(255,200,60,0.5)", fontSize: 11, marginTop: 6 }}>
          ~{Math.round(flipFatigue.count * 3.5)}min of browsing · $0 profit. Consider switching categories.
        </Text>
      </View>
    ) : null,
    lowball: activeResult ? (
      <Pressable
        key="lowball"
        onPress={openLowball}
        style={{ marginHorizontal: 16, marginBottom: 10, backgroundColor: "rgba(130,200,255,0.10)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(130,200,255,0.22)", padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }}
      >
        <Text style={{ fontSize: 16 }}>🧠</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#82c8ff", fontWeight: "800", fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 2 }}>LOWBALL SCRIPT</Text>
          <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>Tap to generate a platform-tuned offer message</Text>
        </View>
        <Text style={{ color: "rgba(130,200,255,0.5)", fontSize: 16 }}>→</Text>
      </Pressable>
    ) : null,
    snipe: activeResult ? (
      <Pressable
        key="snipe"
        onPress={() => {
          const demoEnd = Date.now() + 24 * 3600 * 1000;
          openSnipe((activeResult as any).auctionEndTime ?? demoEnd);
        }}
        style={{ marginHorizontal: 16, marginBottom: 10, backgroundColor: "rgba(255,220,60,0.08)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,220,60,0.18)", padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }}
      >
        <Text style={{ fontSize: 16 }}>⏱️</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#ffdc3c", fontWeight: "800", fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 2 }}>AUCTION SNIPE TIMER</Text>
          <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Calculate optimal bid time + max bid</Text>
        </View>
        <Text style={{ color: "rgba(255,220,60,0.4)", fontSize: 16 }}>→</Text>
      </Pressable>
    ) : null,
  };

  return (
    <View>
      {signals.slice(0, visibleCount).map(s => cardMap[s.key])}
      {hiddenCount > 0 ? (
        <Pressable
          onPress={() => {
            setIntelExpanded(e => !e);
          }}
          style={{ marginHorizontal: 16, marginBottom: 10, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, fontWeight: "700" }}>
            {intelExpanded ? "Show less" : `${hiddenCount} more signal${hiddenCount > 1 ? "s" : ""}`}
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>{intelExpanded ? "↑" : "↓"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
})() : null}
</>) : null}

</ScrollView>
</SafeAreaView>

{/* CONFETTI — sibling of SafeAreaView, screen-anchored.
    pointerEvents="none" at every wrapper level + inside ConfettiBurst's
    own root + on every particle. Replaces the previous Modal mount that
    captured touches on iOS and froze the dock for the burst's ~3.8s
    lifetime. Verified by CONFETTI_POINTER_SAFE log. */}
<View
  pointerEvents="none"
  style={{
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
  }}
>
  <ConfettiBurst fireKey={confettiKey} />
</View>
</RNAnimated.View>


{/* HISTORY (ALWAYS MOUNTED — NO REMOUNT DELAY) */}
<RNAnimated.View
  style={[
    styles.tabFull,
{
  backgroundColor: "transparent",
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  opacity: tab === "history" ? tabFade : 0,
  zIndex: tab === "history" ? 30 : -1,
  display: tab === "history" ? "flex" : "none",
  overflow: "hidden",
},
  ]}
pointerEvents={tab === "history" && tabInteractable ? "box-none" : "none"}
>
  <View style={[styles.page, { backgroundColor: "transparent", paddingTop: TOP + 32 }]} pointerEvents="box-none">
          <Text style={styles.pageTitle}>Archive</Text>
          <View style={styles.savingsBox}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={styles.savingsTitle}>
                Total saved: {money(savingsTotal)}
              </Text>
              {savingsTotal > 0 ? (
                <Pressable
                  onPress={() => {
                    hapticSelect();
                    Share.share({
                      message: `I've saved ${money(savingsTotal)} using Evan AI — the AI-powered price scanner. Try it at evanai.app`,
                    }).catch(() => {});
                  }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}
                >
                  <Ionicons name="share-outline" size={13} color="rgba(255,255,255,0.6)" />
                  <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", fontWeight: "500" }}>Share</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.savingsSub}>Savings across your scans.</Text>
            {!hasUnlimited ? (
              <Text style={styles.savingsSubStrong}>
                Free scans reset every 30 days.
              </Text>
            ) : null}
            </View>
          {history.length === 0 ? (
            <View style={{ alignItems: "center", paddingTop: 52, paddingHorizontal: 24 }}>
              <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
                <Ionicons name="camera-outline" size={28} color="rgba(255,255,255,0.35)" />
              </View>
              <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 18, fontWeight: "800", marginBottom: 6 }}>No scans yet</Text>
              <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 14, textAlign: "center", lineHeight: 20 }}>
                Point your camera at any item{"\n"}to check its resale value instantly.
              </Text>
            </View>
          ) : (

<RNAnimated.ScrollView
  ref={historyScrollRef}
  style={{ marginTop: 8 }}
  contentContainerStyle={{ paddingBottom: TAB_BAR_H + TAB_BAR_MARGIN + BOTTOM + 40, flexGrow: 1 }}
  showsVerticalScrollIndicator={false}
  bounces={true}
  alwaysBounceVertical={true}
  overScrollMode="always"
  scrollEventThrottle={16}
  contentInsetAdjustmentBehavior="automatic"
>

{history.map((h) => {
  return (
<Pressable
  key={h.id}
  onPress={() => {
    if (!h.resultCard) return;
    hapticSelect();
    setActiveResult(h.resultCard);
    setNeuralLearningLevel((p) => Math.min(p + 1, 12));
    setResults(h.resultCard.alternatives || []);
    setLoadingResults(false);
    setLoadingPhotoUri(h.uri || null);
    setLastScan({
      kind: "history",
      confidence: h.resultCard.visionConfidence ?? 0,
      query: h.resultCard.visionQuery ?? null,
      results: h.resultCard.alternatives || [],
    });
    goTab("results");
  }}
  style={({ pressed }) => [
    styles.historyRow,
    pressed && { opacity: 0.9 },
  ]}
>

<Pressable
  onPress={() => {
    hapticSelect();
    if (h.uri) openHistoryPreview(h.uri);
  }}
  style={styles.historyThumbWrap}
>
  {h.uri ? (
    <Image source={{ uri: h.uri }} style={styles.historyThumb} />
  ) : (
    <View style={styles.historyThumbFallback} />
  )}
</Pressable>

      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={styles.historyTitle}>
          {h.title || "Scan"}
        </Text>
        <Text style={styles.historyTime}>{h.timestamp}</Text>
      </View>
    </Pressable>
  );
})}
</RNAnimated.ScrollView>
          )}
        </View>
      </RNAnimated.View>

{/* WATCHLIST */}
<RNAnimated.View
  style={[
    styles.tabFull,
{
  backgroundColor: "transparent",
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  opacity: tab === "watchlist" ? tabFade : 0,
  zIndex: tab === "watchlist" ? 30 : -1,
  display: tab === "watchlist" ? "flex" : "none",
  overflow: "hidden",
},
  ]}
pointerEvents={tab === "watchlist" && tabInteractable ? "auto" : "none"}
>
  <View style={[styles.page, { paddingTop: TOP + 32 }]}>
    <Text style={styles.pageTitle}>Watchlist</Text>
    <Text style={styles.subStatus}>Daily price re-check · drop alerts · trends</Text>
    <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
      <Pressable
        onPress={() => {
          hapticSelect();
          runDailyWatchlistCheck({ force: true, quiet: false });
          setSavedToast("Checking watchlist…");
        }}
        style={({ pressed }) => [
          styles.profileBtn,
          pressed && { opacity: 0.9, transform: [{ scale: 0.995 }] },
          { flex: 1, alignItems: "center" },
        ]}
      >
        <Text style={styles.profileBtnText}>Check now</Text>
      </Pressable>
      <Pressable
        onPress={async () => {
          hapticSelect();
          const rows = [
            "query,lastBest,lastChecked",
            ...(watchlist || []).map((w) => {
              const q = String(w.query || "").replace(/"/g, '""');
              const b = toNumber(w.lastBest);
              const t = w.lastCheckedMs ? new Date(w.lastCheckedMs).toISOString() : "";
              return `"${q}",${Number.isFinite(b) ? b : ""},"${t}"`;
            }),
          ];
          const csv = rows.join("\n");
          await Clipboard.setStringAsync(csv);
          setSavedToast("Watchlist CSV copied");
        }}
        style={({ pressed }) => [
          styles.profileBtn,
          pressed && { opacity: 0.9, transform: [{ scale: 0.995 }] },
          { flex: 1, alignItems: "center" },
        ]}
      >
        <Text style={styles.profileBtnText}>Export CSV</Text>
      </Pressable>
    </View>

    {/* ── Autonomous Deal Hunter toggle ──────────────────────────────────────── */}
    <Pressable
      onPress={() => {
        hapticSelect();
        if (!watchlist.length) {
          setSavedToast("Add items to your watchlist first");
          return;
        }
        const next = !dealHunterActive;
        setDealHunterActive(next);
        setSavedToast(next ? "Deal Hunter ON — sweeping every 15 min" : "Deal Hunter OFF");
      }}
      style={({ pressed }) => [{
        marginTop: 10,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: dealHunterActive ? "rgba(80,255,150,0.35)" : "rgba(255,255,255,0.12)",
        backgroundColor: dealHunterActive ? "rgba(80,255,150,0.07)" : "rgba(255,255,255,0.04)",
        paddingHorizontal: 14,
        paddingVertical: 11,
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 10,
        opacity: pressed ? 0.8 : 1,
      }]}
    >
      <Ionicons
        name={dealHunterActive ? "radio" : "radio-outline"}
        size={18}
        color={dealHunterActive ? "#50ff96" : "rgba(255,255,255,0.5)"}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ color: dealHunterActive ? "#50ff96" : "white", fontWeight: "700", fontSize: 13 }}>
          {dealHunterActive ? "Autonomous Deal Hunter ACTIVE" : "Autonomous Deal Hunter"}
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 1 }}>
          {dealHunterActive
            ? `Monitoring ${watchlist.length} item${watchlist.length !== 1 ? "s" : ""} · alerts delivered silently`
            : "Auto-scans watchlist every 15 min · flip alerts in background"}
        </Text>
      </View>
      {dealAlerts.length > 0 && (
        <View style={{ backgroundColor: "#50ff96", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
          <Text style={{ color: "#000", fontWeight: "800", fontSize: 11 }}>{dealAlerts.length}</Text>
        </View>
      )}
    </Pressable>

    {/* Deal Alerts feed */}
    {dealAlerts.length > 0 && (
      <View style={{ marginTop: 10, gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <Ionicons name="flash" size={13} color="#50ff96" />
          <Text style={{ color: "#50ff96", fontWeight: "700", fontSize: 12 }}>DEAL ALERTS</Text>
          <Pressable
            onPress={() => { hapticSelect(); setDealAlerts([]); }}
            style={{ marginLeft: "auto" }}
          >
            <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>Clear all</Text>
          </Pressable>
        </View>
        {dealAlerts.slice(0, 5).map((alert) => (
          <Pressable
            key={alert.id}
            onPress={() => {
              hapticSelect();
              if (alert.url) Linking.openURL(alert.url).catch(() => {});
            }}
            style={({ pressed }) => [{
              backgroundColor: "rgba(80,255,150,0.05)",
              borderRadius: 10,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: "rgba(80,255,150,0.20)",
              padding: 10,
              flexDirection: "row" as const,
              alignItems: "center" as const,
              gap: 10,
              opacity: pressed ? 0.8 : 1,
            }]}
          >
            {alert.image ? (
              <Image source={{ uri: alert.image }} style={{ width: 40, height: 40, borderRadius: 6 }} />
            ) : (
              <View style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="pricetag-outline" size={18} color="rgba(255,255,255,0.3)" />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: "white", fontWeight: "700", fontSize: 12 }} numberOfLines={1}>{alert.query}</Text>
              <Text style={{ color: "#50ff96", fontSize: 11, fontWeight: "600" }}>
                {alert.verdict} · ${alert.bestPrice.toFixed(2)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.3)" />
          </Pressable>
        ))}
      </View>
    )}

    {/* Feature 5: Hyperlocal pricing — zip code input */}
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.10)" }}>
      <Ionicons name="location-outline" size={16} color="rgba(255,255,255,0.5)" />
      <TextInput
        value={zipCode}
        onChangeText={setZipCode}
        placeholder="Zip code for local pricing"
        placeholderTextColor="rgba(255,255,255,0.3)"
        keyboardType="numeric"
        maxLength={10}
        returnKeyType="done"
        onSubmitEditing={() => Keyboard.dismiss()}
        style={{ flex: 1, color: "white", fontSize: 13, fontFamily: "System" }}
      />
      {!!zipCode && (
        <Pressable onPress={() => setZipCode("")} hitSlop={8}>
          <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.4)" />
        </Pressable>
      )}
    </View>

{watchlist.length === 0 ? (
  <View style={{ alignItems: "center", paddingTop: 52, paddingHorizontal: 24 }}>
    <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
      <Ionicons name="heart-outline" size={28} color="rgba(255,255,255,0.35)" />
    </View>
    <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 18, fontWeight: "800", marginBottom: 6 }}>Nothing saved yet</Text>
    <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 14, textAlign: "center", lineHeight: 20 }}>
      After scanning an item, swipe right{"\n"}or tap the heart to track its price.
    </Text>
  </View>
) : (

<ScrollView
  ref={watchlistScrollRef}
  style={{ marginTop: 12 }}
  showsVerticalScrollIndicator={false}
  bounces
  alwaysBounceVertical
  overScrollMode="always"
  scrollEventThrottle={16}
  contentInsetAdjustmentBehavior="automatic"
  contentContainerStyle={{
  paddingBottom: TAB_BAR_H + TAB_BAR_MARGIN + BOTTOM + 40,
  paddingTop: 6,
  flexGrow: 1,
}}
>

    {watchlist.map((w, wIdx) => (
      <View
        key={w.id}
        style={focusedWatchlistId && focusedWatchlistId !== w.id
          ? { opacity: 0.42, transform: [{ scale: 0.98 }] }
          : undefined}
      >
        <WatchlistCard
          item={w}
          index={wIdx}
          tabVisible={tab === "watchlist"}
          focused={focusedWatchlistId === w.id}
          onClearFocus={() => setFocusedWatchlistId(null)}
          onRecheck={() => {
            hapticSelect();
            runDailyWatchlistCheck({ force: true, quiet: false });
            setSavedToast("Checking…");
          }}
          onRemove={() => {
            hapticSelect();
            setWatchlist((prev) => prev.filter((x) => x.id !== w.id));
            setSavedToast("Removed");
          }}
          onVisitScan={handleVisitScan}
        />
      </View>
    ))}

    {/* Feature 9: Smart Sell Suggestions */}
    {relistSuggestions.length > 0 && (
      <View style={{ marginTop: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Ionicons name="trending-up-outline" size={16} color="rgba(255,255,255,0.7)" />
          <Text style={{ color: "white", fontWeight: "800", fontSize: 15 }}>Smart Sell Suggestions</Text>
          {relistLoading && <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" style={{ marginLeft: "auto" }} />}
        </View>
        {relistSuggestions.map((s: any, i: number) => {
          const urgColor = s.urgency === "high" ? "#ff5050" : s.urgency === "medium" ? "#ffc800" : "rgba(255,255,255,0.45)";
          const actionLabel = s.action === "sell_now" ? "SELL NOW" : s.action === "hold" ? "HOLD" : "WAIT";
          const actionBg = s.action === "sell_now" ? "rgba(80,255,150,0.10)" : s.action === "hold" ? "rgba(100,180,255,0.08)" : "rgba(255,255,255,0.04)";
          const actionColor = s.action === "sell_now" ? "#50ff96" : s.action === "hold" ? "#64b4ff" : "rgba(255,255,255,0.4)";
          return (
            <View key={i} style={{
              backgroundColor: actionBg, borderRadius: 14,
              borderWidth: StyleSheet.hairlineWidth, borderColor: `${actionColor}40`,
              padding: 14, marginBottom: 10, gap: 6,
            }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "white", fontWeight: "700", fontSize: 13 }} numberOfLines={1}>{s.query}</Text>
                  <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, marginTop: 1 }}>
                    Held {s.daysHeld}d · Market {money(s.currentMarket)} · {s.trend === "rising" ? "+" : s.trend === "falling" ? "-" : "~"}{Math.abs(s.trendPct)}%
                  </Text>
                </View>
                <View style={{ backgroundColor: `${actionColor}20`, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 }}>
                  <Text style={{ color: actionColor, fontWeight: "800", fontSize: 11 }}>{actionLabel}</Text>
                </View>
              </View>
              <Text style={{ color: urgColor, fontSize: 12, lineHeight: 17 }}>{s.reason}</Text>
              {s.profitEstimate !== null && (
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>
                    Net: <Text style={{ color: s.profitEstimate > 0 ? "#50ff96" : "#ff6060", fontWeight: "700" }}>{money(s.profitEstimate)}</Text>
                  </Text>
                  {s.roiPct !== null && (
                    <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>
                      ROI: <Text style={{ color: s.roiPct >= 20 ? "#50ff96" : s.roiPct >= 0 ? "#ffc800" : "#ff6060", fontWeight: "700" }}>{s.roiPct}%</Text>
                    </Text>
                  )}
                  {s.optimalListPrice && (
                    <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>
                      List at: <Text style={{ color: "white", fontWeight: "600" }}>{money(s.optimalListPrice)}</Text>
                    </Text>
                  )}
                </View>
              )}
              {s.expiresIn && (
                <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>⏱ Opportunity window: {s.expiresIn}</Text>
              )}
            </View>
          );
        })}
      </View>
    )}
    {relistLoading && relistSuggestions.length === 0 && (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 20, padding: 14 }}>
        <ActivityIndicator size="small" color="rgba(255,255,255,0.3)" />
        <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>Analyzing your items…</Text>
      </View>
    )}

    {/* Feature 3: Local Deal Radar */}
    <LocalRadar
      data={radarData}
      loading={radarLoading}
      zipCode={zipCode}
      watchlistQueries={watchlist.map((w) => w.query).filter(Boolean)}
      watchlistTargets={Object.fromEntries(
        watchlist
          .filter((w) => w.query && Number.isFinite(toNumber(w.lastBest)))
          .map((w) => [w.query, toNumber(w.lastBest)])
      )}
      apiBase={process.env.EXPO_PUBLIC_API_URL ??
        (Platform.OS === "ios" ? "http://192.168.1.227:3001" : "http://10.0.2.2:3001")}
      onRefresh={loadRadar}
      onPressItem={(url) => { try { Linking.openURL(url); } catch {} }}
    />

  </ScrollView>
)}

  </View>
</RNAnimated.View>

 {/* PROFILE — hard-isolated */}
<RNAnimated.View
  style={[
    styles.tabFull,
{
  backgroundColor: "transparent",
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  opacity: tab === "profile" ? tabFade : 0,
  zIndex: tab === "profile" ? 30 : -1,
  display: tab === "profile" ? "flex" : "none",
  overflow: "hidden",
}
  ]}
  pointerEvents={tab === "profile" && tabInteractable ? "auto" : "none"}
>
  <RNAnimated.View style={{ flex: 1 }}>

<ScrollView
  ref={profileScrollRef}
  style={{ flex: 1, backgroundColor: "#000" }}
  contentContainerStyle={{ paddingBottom: TAB_BAR_H + TAB_BAR_MARGIN + BOTTOM + 40, flexGrow: 1, backgroundColor: "#000" }}
  showsVerticalScrollIndicator={false}
  bounces={true}
  alwaysBounceVertical={true}
  overScrollMode="always"
  scrollEventThrottle={16}
  contentInsetAdjustmentBehavior="always"
  keyboardShouldPersistTaps="handled"
>

        <View style={[styles.page, { paddingTop: TOP + 32 }]}>
<View
  style={{
    marginTop: 18,
    padding: 20,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    shadowColor: "#ffffff",
    shadowOpacity: 0.04,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  }}
>
{/* Referral Program moved to bottom */}
<View style={[styles.profileHeaderRow, { gap: 12 }]}>
  <View style={{ flex: 1, paddingRight: 10 }}>
    <Text style={styles.pageTitle}>Profile</Text>

    <Text
      style={{
        color: "rgba(255,255,255,0.55)",
        fontWeight: "800",
        marginTop: 2,
      }}
      numberOfLines={1}
      ellipsizeMode="tail"
    >
      {`Your resale intelligence is compounding${loadingDots}`}
    </Text>

    <Text style={styles.subStatus} numberOfLines={1} ellipsizeMode="tail">
      {statusLabel}
    </Text>

    {/* Rank badge */}
    <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginTop: 10 }}>
      <View style={{
        flexDirection: "row", alignItems: "center", gap: 6,
        paddingHorizontal: 10, paddingVertical: 5,
        borderRadius: 99,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
        alignSelf: "flex-start",
      }}>
        <Ionicons name={userRank.icon as any} size={12} color={userRank.color} />
        <Text style={{ color: userRank.color, fontSize: 10, fontWeight: "800", letterSpacing: 1.6 }}>
          {userRank.rank}
        </Text>
      </View>
      <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, fontWeight: "600" }}>
        {weaponStats.scans} scans total
      </Text>
    </View>
  </View>

  <Pressable
    onPress={() => {
      hapticSelect();
      if (isSignedIn) {
        setIsSignedIn(false);
        _authJwt = null;
        AsyncStorage.removeItem("evan_jwt_v1").catch(() => {});
        // NOTE: isPro is NOT cleared on sign-out — subscription is tied to
        // the device/app install. User keeps access after signing back in.
        useEvanBrain.getState().hidePaywall();
      } else {
        setAuthModalOpen(true);
      }
    }}
    style={({ pressed }) => [
      styles.signInBtn,
      pressed && styles.tabPressed,
      {
        maxWidth: 130,        // ✅ prevents off-screen
        paddingHorizontal: 10, // ✅ slightly tighter
        paddingVertical: 9,
        borderRadius: 14,
      },
    ]}
  >
    <Ionicons name="person-circle-outline" size={18} color="white" />
    <Text style={[styles.signInText, { fontSize: 13 }]} numberOfLines={1}>
      {isSignedIn ? "Sign out" : "Sign in"}
    </Text>
  </Pressable>
</View>

{/* Feature 14: Public Savings Profile Card */}
{(savingsTotal > 0 || scansUsed > 0) ? (
  <Reanimated.View entering={FadeInDown.duration(340).delay(120)} style={{
    marginTop: 14,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "rgba(80,255,150,0.06)",
    borderWidth: 1,
    borderColor: "rgba(80,255,150,0.18)",
    gap: 10,
  }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(80,255,150,0.10)", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99 }}>
        <Ionicons name="trophy-outline" size={13} color="#50ff96" />
        <Text style={{ color: "#50ff96", fontSize: 11, fontWeight: "700" }}>My Savings Card</Text>
      </View>
      <Pressable
        onPress={() => {
          hapticSelect?.();
          const _uid = installId || effectiveReferralCode || "EVAN";
          const msg = `🏆 My Evan AI Stats\n💰 Saved: ${money(savingsTotal)}\n📸 Scans: ${scansUsed}\n\nScan smarter → https://evanai.app`;
          Share.share({ message: msg }).catch(() => {});
        }}
        style={({ pressed }) => [{
          marginLeft: "auto",
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          backgroundColor: "rgba(80,255,150,0.12)",
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: 99,
          opacity: pressed ? 0.7 : 1,
        }]}
      >
        <Ionicons name="share-outline" size={13} color="#50ff96" />
        <Text style={{ color: "#50ff96", fontSize: 11, fontWeight: "700" }}>Share</Text>
      </Pressable>
    </View>

    <View style={{ flexDirection: "row", gap: 10 }}>
      <View style={{ flex: 1, alignItems: "center", backgroundColor: "rgba(80,255,150,0.07)", borderRadius: 16, padding: 14, gap: 4, borderWidth: 1, borderColor: "rgba(80,255,150,0.22)" }}>
        <Text style={{ color: "#50ff96", fontSize: 22, fontWeight: "900" }}>{money(savingsTotal)}</Text>
        <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 9, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 }}>Total Saved</Text>
      </View>
      <View style={{ flex: 1, alignItems: "center", backgroundColor: "rgba(130,200,255,0.07)", borderRadius: 16, padding: 14, gap: 4, borderWidth: 1, borderColor: "rgba(130,200,255,0.22)" }}>
        <Text style={{ color: "#82c8ff", fontSize: 22, fontWeight: "900" }}>{scansUsed}</Text>
        <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 9, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 }}>Scans Run</Text>
      </View>
      <View style={{ flex: 1, alignItems: "center", backgroundColor: "rgba(255,200,0,0.07)", borderRadius: 16, padding: 14, gap: 4, borderWidth: 1, borderColor: "rgba(255,200,0,0.22)" }}>
        <Text style={{ color: "#ffd060", fontSize: 22, fontWeight: "900" }}>{history?.length ?? 0}</Text>
        <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 9, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 }}>Items Found</Text>
      </View>
    </View>

    <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: "500", textAlign: "center" }}>
      Tap Share to show your savings · powered by Evan AI
    </Text>
  </Reanimated.View>
) : null}

{/* Feature 1: P&L Tracker */}
<PLTracker
  flips={plFlips}
  onAdd={handlePlAdd}
  onDelete={handlePlDelete}
  onMarkSold={handlePlMarkSold}
  isNet={netProfitEnabled}
  onToggleNet={() => setNetProfitEnabled(v => !v)}
/>

{/* The Vault — screenshot trophy case */}
{vaultEntries.length > 0 ? (() => {
  const vaultValue = vaultEntries.reduce((s, e) => s + (e.potentialProfit ?? 0), 0);
  const thumbSize = Math.floor((Dimensions.get("window").width - 40 - 32 - 8) / 3);
  return (
    <View style={{ marginTop: 20 }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(180,140,255,0.10)", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99, borderWidth: 1, borderColor: "rgba(180,140,255,0.25)" }}>
          <Ionicons name="albums-outline" size={12} color="rgba(210,185,255,0.9)" />
          <Text style={{ color: "rgba(210,185,255,0.9)", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 }}>THE VAULT</Text>
        </View>
        {vaultValue > 0 ? (
          <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, fontWeight: "600", marginLeft: "auto" }}>
            {`+$${vaultValue.toFixed(0)} potential`}
          </Text>
        ) : null}
      </View>
      {/* Grid */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
        {vaultEntries.map((entry) => (
          <Pressable
            key={entry.id}
            onPress={() => setVaultModalUri(entry.uri)}
            style={({ pressed }) => [{ width: thumbSize, height: thumbSize, borderRadius: 12, overflow: "hidden", opacity: pressed ? 0.8 : 1 }]}
          >
            <Image source={{ uri: entry.uri }} style={{ width: thumbSize, height: thumbSize }} resizeMode="cover" />
            <BlurView intensity={38} tint="dark" style={StyleSheet.absoluteFillObject} />
            <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 5 }}>
              <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 9, fontWeight: "800", numberOfLines: 1 } as any} numberOfLines={1}>{entry.name}</Text>
              {entry.price != null ? <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 8, fontWeight: "600" }}>${Number(entry.price).toFixed(0)}</Text> : null}
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
})() : null}

{/* Vault full-screen viewer */}
{vaultModalUri ? (
  <Modal visible transparent animationType="fade" onRequestClose={() => setVaultModalUri(null)}>
    <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.95)", alignItems: "center", justifyContent: "center" }} onPress={() => setVaultModalUri(null)}>
      <Image source={{ uri: vaultModalUri }} style={{ width: Dimensions.get("window").width - 40, height: Dimensions.get("window").height * 0.65, borderRadius: 20 }} resizeMode="contain" />
      <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 16, fontWeight: "600" }}>Tap to close</Text>
    </Pressable>
  </Modal>
) : null}

{/* Vault fly micro-animation — thumbnail particle flies from card to profile tab */}
{vaultFly ? (
  <VaultFlyParticle key={vaultFly.key} uri={vaultFly.uri} />
) : null}

          <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "700", letterSpacing: 1.1, textTransform: "uppercase", marginTop: 24, marginBottom: 10, paddingHorizontal: 2 }}>Account</Text>
          <View style={{ borderRadius: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", backgroundColor: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
          <Pressable
            style={({ pressed }) => [styles.profileBtn, pressed && { backgroundColor: "rgba(255,255,255,0.06)" }]}
            onPress={() => {
              hapticSelect();
              if (!isSignedIn) {
                setAuthModalOpen(true);
                return;
              }
              setProfileModal("subscription");
            }}
          >
            <View style={[styles.inlineRow, { justifyContent: "space-between" }]}>
              <View style={styles.inlineRow}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="sparkles-outline" size={16} color="white" />
                </View>
                <Text style={styles.profileBtnText}>Subscription</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
            </View>
          </Pressable>
          <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.07)", marginHorizontal: 16 }} />
          <Pressable
            style={({ pressed }) => [styles.profileBtn, pressed && { backgroundColor: "rgba(255,255,255,0.06)" }]}
            onPress={() => {
              hapticSelect();
              setProfileModal("payments");
            }}
          >
            <View style={[styles.inlineRow, { justifyContent: "space-between" }]}>
              <View style={styles.inlineRow}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="card-outline" size={16} color="white" />
                </View>
                <Text style={styles.profileBtnText}>Payment methods</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
            </View>
          </Pressable>
          </View>
{watchlist.length ? (
  <View style={styles.savingsBox}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
      <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: "rgba(130,200,255,0.12)", alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="pulse-outline" size={15} color="#82c8ff" />
      </View>
      <Text style={styles.savingsTitle}>Price tracking</Text>
    </View>
    <Text style={styles.savingsSub}>Tap to check if it dropped.</Text>
    <View style={{ marginTop: 10, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", overflow: "hidden", gap: 0 }}>
      {watchlist.slice(0, 5).map((w, wi) => (
        <React.Fragment key={w.id}>
        {wi > 0 && <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.07)" }} />}
        <Pressable
          style={({ pressed }) => [{
            paddingVertical: 12,
            paddingHorizontal: 14,
            backgroundColor: pressed ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.04)",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }]}
          onPress={async () => {
            hapticSelect();
runDailyWatchlistCheck({ force: true, quiet: false });
setSavedToast("Checking…");
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.profileBtnText, { fontSize: 14 }]} numberOfLines={2}>
              {w.query}
            </Text>
            <Text style={[styles.savingsSub, { marginTop: 2 }]}>Last best: {money(toNumber(w.lastBest))}</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.25)" />
        </Pressable>
        </React.Fragment>
      ))}
    </View>
  </View>
) : null}

<Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "700", letterSpacing: 1.1, textTransform: "uppercase", marginTop: 24, marginBottom: 10, paddingHorizontal: 2 }}>Pro Tools</Text>
<Pressable
  onPress={() => {
    hapticSelect?.();
    setProfileModal("billion");
  }}
  style={({ pressed }) => [{
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    opacity: pressed ? 0.8 : 1,
  }]}
>
  <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.10)", alignItems: "center", justifyContent: "center" }}>
    <Ionicons name="rocket-outline" size={20} color="white" />
  </View>
  <View style={{ flex: 1 }}>
    <Text style={{ color: "white", fontWeight: "900", fontSize: 15 }}>Billionaire features</Text>
    <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 2 }}>
      Seller mode · inventory · multi-item scan
    </Text>
  </View>
  <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
</Pressable>

<Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "700", letterSpacing: 1.1, textTransform: "uppercase", marginTop: 24, marginBottom: 10, paddingHorizontal: 2 }}>App</Text>
<View style={{ borderRadius: 22 }}>
<Pressable
  style={({ pressed }) => [styles.profileBtn, pressed && { backgroundColor: "rgba(255,255,255,0.06)" }]}
  onPress={() => {
    hapticSelect();
    setProfileModal("different");
  }}
>
  <View style={[styles.inlineRow, { justifyContent: "space-between" }]}>
    <View style={styles.inlineRow}>
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="bulb-outline" size={16} color="white" />
      </View>
      <Text style={styles.profileBtnText}>How Evan AI is different</Text>
    </View>
    <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
  </View>
</Pressable>
<View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.07)", marginHorizontal: 16 }} />
<Pressable
  style={({ pressed }) => [styles.profileBtn, pressed && { backgroundColor: "rgba(255,255,255,0.06)" }]}
  onPress={() => {
    hapticSelect();
    openHelp();
  }}
>
  <View style={[styles.inlineRow, { justifyContent: "space-between" }]}>
    <View style={styles.inlineRow}>
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="help-circle-outline" size={16} color="white" />
      </View>
      <Text style={styles.profileBtnText}>Help & tips</Text>
    </View>
    <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
  </View>
</Pressable>
<View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.07)", marginHorizontal: 16 }} />
{/* Thrift Heat Map */}
<Pressable
  onPress={() => { hapticSelect(); openThriftHeat(); }}
  style={({ pressed }) => [styles.profileBtn, pressed && styles.tabPressed]}
>
  <View style={[styles.inlineRow, { justifyContent: "space-between" }]}>
    <View style={[styles.inlineRow, { flex: 1 }]}>
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="map-outline" size={17} color="white" />
      </View>
      <Text style={styles.profileBtnText}>Thrift Heat Map</Text>
    </View>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 }}>
      <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, backgroundColor: "rgba(255,50,50,0.18)", borderWidth: 1, borderColor: "rgba(255,60,60,0.35)" }}>
        <Text style={{ color: "#ff4444", fontSize: 10, fontWeight: "900", letterSpacing: 0.5 }}>● LIVE</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
    </View>
  </View>
</Pressable>
<View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.07)", marginHorizontal: 16 }} />

{/* Feature 7: Flip Personality */}
{flipPersonality ? (
  <View style={{
    backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 14,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.07)",
    padding: 16, marginBottom: 10,
  }}>
    <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 }}>FLIP PERSONALITY</Text>
    <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>{flipPersonality.type}</Text>
    <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 4 }}>{flipPersonality.description}</Text>
    <Text style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, marginTop: 6 }}>{flipPersonality.totalScans} total scans</Text>
    {flipPersonality ? (
      <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 8, lineHeight: 16 }}>
        {flipPersonality.type === "Ghost Flipper"
          ? "→ Set a rule: under $50 + 20% margin = auto-buy. Stop hesitating."
          : flipPersonality.type === "Category Specialist"
          ? "→ You're dangerous in your lane. Expand 1 adjacent category this month."
          : flipPersonality.type === "Volume Trader"
          ? "→ Track your profit-per-hour. High volume ≠ high profit."
          : "→ Trust your first instinct. You're leaving money on the table."}
      </Text>
    ) : null}
  </View>
) : null}

<View style={{ borderRadius: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", backgroundColor: "rgba(255,255,255,0.04)", overflow: "hidden", marginBottom: 10 }}>
{/* Feature 10: Got Away button */}
<Pressable
  onPress={openGotAway}
  style={({ pressed }) => [styles.profileBtn, pressed && { backgroundColor: "rgba(255,255,255,0.06)" }]}
>
  <View style={[styles.inlineRow, { justifyContent: "space-between" }]}>
    <View style={styles.inlineRow}>
      <Text style={{ fontSize: 18, marginRight: 4 }}>💔</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ color: "rgba(255,255,255,0.9)", fontWeight: "800", fontSize: 13 }}>The One That Got Away</Text>
        <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>{regretItems.length} missed flip{regretItems.length !== 1 ? "s" : ""} in 30 days</Text>
      </View>
    </View>
    <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
  </View>
</Pressable>
<View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.07)", marginHorizontal: 16 }} />

{/* Feature 11: Scan Graveyard button */}
<Pressable
  onPress={openGraveyard}
  style={({ pressed }) => [styles.profileBtn, pressed && { backgroundColor: "rgba(255,255,255,0.06)" }]}
>
  <View style={[styles.inlineRow, { justifyContent: "space-between" }]}>
    <View style={styles.inlineRow}>
      <Text style={{ fontSize: 18, marginRight: 4 }}>⚰️</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ color: "rgba(255,255,255,0.9)", fontWeight: "800", fontSize: 13 }}>Scan Graveyard</Text>
        <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>Items you passed that finally dropped</Text>
      </View>
    </View>
    <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
  </View>
</Pressable>
<View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.07)", marginHorizontal: 16 }} />

{/* Feature 14: Profit Per Hour */}
<Pressable
  onPress={computeProfitPerHour}
  style={({ pressed }) => [styles.profileBtn, pressed && { backgroundColor: "rgba(255,255,255,0.06)" }]}
>
  <View style={[styles.inlineRow, { justifyContent: "space-between" }]}>
    <View style={styles.inlineRow}>
      <Text style={{ fontSize: 18, marginRight: 4 }}>💰</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>Profit Per Hour</Text>
        <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>Are you working below minimum wage?</Text>
      </View>
    </View>
    <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
  </View>
</Pressable>
</View>

<Pressable
  style={({ pressed }) => [styles.profileBtn, pressed && { backgroundColor: "rgba(255,255,255,0.06)" }]}
  onPress={async () => {
    hapticSelect();
    try {
      const seen = await AsyncStorage.getItem("EVAN_ONBOARD_V1");
      if (seen) {
        setTutorialConfirmOpen(true);
      } else {
        openTutorial();
      }
    } catch {
      openTutorial();
    }
  }}
>
  <View style={[styles.inlineRow, { justifyContent: "space-between" }]}>
    <View style={styles.inlineRow}>
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="play-circle-outline" size={16} color="white" />
      </View>
      <Text style={styles.profileBtnText}>Tutorial</Text>
    </View>
    <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
  </View>
</Pressable>
<View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.07)", marginHorizontal: 16 }} />
          <Pressable
            style={({ pressed }) => [styles.profileBtn, pressed && { backgroundColor: "rgba(255,255,255,0.06)" }]}
            onPress={() => {
              hapticSelect();
              setProfileModal("review");
            }}
          >
            <View style={[styles.inlineRow, { justifyContent: "space-between" }]}>
              <View style={styles.inlineRow}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="star-outline" size={16} color="white" />
                </View>
                <Text style={styles.profileBtnText}>Leave a review</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
            </View>
          </Pressable>
          <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.07)", marginHorizontal: 16 }} />
          <Pressable
            style={({ pressed }) => [styles.profileBtn, pressed && { backgroundColor: "rgba(255,255,255,0.06)" }]}
            onPress={() => {
              hapticSelect();
              setProfileModal("terms");
            }}
          >
            <View style={[styles.inlineRow, { justifyContent: "space-between" }]}>
              <View style={styles.inlineRow}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="document-text-outline" size={16} color="white" />
                </View>
                <Text style={styles.profileBtnText}>Terms of Service</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
            </View>
          </Pressable>
</View>
<View style={{ marginTop: 18 }}>
  <View
    style={{
      padding: 20,
      borderRadius: 28,
      backgroundColor: "rgba(255,255,255,0.06)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.12)",
      shadowColor: "#ffffff",
      shadowOpacity: 0.03,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 0 },
    }}
  >
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.09)", alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="gift-outline" size={18} color="white" />
      </View>
      <View>
        <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>Referral Program</Text>
        <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 1 }}>Share your code, earn bonus scans</Text>
      </View>
    </View>

    <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 0, fontWeight: "700", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.9, marginBottom: 6 }}>
      Your Code
    </Text>

    <Pressable
      onPress={async () => {
        hapticSelect?.();
        await Clipboard.setStringAsync(effectiveReferralCode);
        setSavedToast?.("Code copied");
      }}
      style={({ pressed }) => [
        {
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.18)",
          backgroundColor: "rgba(0,0,0,0.35)",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
        pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
      ]}
    >
      <Text style={{ color: "white", fontWeight: "900", fontSize: 22, letterSpacing: 2.5 }}>
        {effectiveReferralCode}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.10)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}>
        <Ionicons name="copy-outline" size={14} color="rgba(255,255,255,0.85)" />
        <Text style={{ color: "rgba(255,255,255,0.85)", fontWeight: "700", fontSize: 12 }}>Copy</Text>
      </View>
    </Pressable>

    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.4)" }} />
      <Text style={{ color: "rgba(255,255,255,0.5)", fontWeight: "700", fontSize: 12 }}>
        {Number(referralUses || 0)} {Number(referralUses || 0) === 1 ? "person used" : "people used"} your code
      </Text>
    </View>

<View style={{ marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" }}>
  <Text style={{ color: "rgba(255,255,255,0.55)", fontWeight: "700", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.9, marginBottom: 8 }}>
    Have a referral code?
  </Text>

  <View style={{ flexDirection: "row", gap: 8 }}>
    <TextInput
      value={referralInput}
      onChangeText={(t) => { setReferralInput(String(t || "").toUpperCase()); setReferralCodeError(""); }}
      editable={!referredBy && !referralBusy}
      autoCapitalize="characters"
      autoCorrect={false}
      placeholder="ENTER CODE"
      placeholderTextColor="rgba(255,255,255,0.28)"
      returnKeyType="done"
      onSubmitEditing={() => Keyboard.dismiss()}
      style={{
        flex: 1,
        minHeight: 50,
        paddingHorizontal: 16,
        borderRadius: 16,
        color: "white",
        fontWeight: "900",
        letterSpacing: 1.2,
        fontSize: 14,
        backgroundColor: "rgba(255,255,255,0.07)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
      }}
    />

    <Pressable
      disabled={!referralInput.trim() || !!referredBy || referralBusy}
      onPress={async () => {
        hapticSelect?.();
        Keyboard.dismiss();
        const code = referralInput.trim().toUpperCase();
        if (!/^[A-Z0-9]{4,12}$/.test(code)) {
          setReferralCodeError("Invalid code format — codes are 4–12 letters/numbers.");
          return;
        }
        if (code === String(effectiveReferralCode || "").trim().toUpperCase()) {
          setReferralCodeError("You can't use your own referral code.");
          return;
        }
        setReferralCodeError("");
        await applyReferralCode(code, "manual");
      }}
      style={({ pressed }) => [
        {
          minWidth: 84,
          paddingHorizontal: 16,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor:
            !referralInput.trim() || !!referredBy || referralBusy
              ? "rgba(255,255,255,0.06)"
              : "#ffffff",
          borderWidth: 1,
          borderColor: !referralInput.trim() || !!referredBy || referralBusy
            ? "rgba(255,255,255,0.10)"
            : "transparent",
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Text style={{
        color: !referralInput.trim() || !!referredBy || referralBusy ? "rgba(255,255,255,0.45)" : "#000000",
        fontWeight: "900",
        fontSize: 14,
      }}>
        {referralBusy ? "..." : referredBy ? "✓ Used" : "Apply"}
      </Text>
    </Pressable>
  </View>

  {referralCodeError ? (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 }}>
      <Ionicons name="alert-circle-outline" size={13} color="rgba(255,90,90,0.9)" />
      <Text style={{ color: "rgba(255,90,90,0.9)", fontSize: 12, fontWeight: "700", flex: 1 }}>
        {referralCodeError}
      </Text>
    </View>
  ) : referredBy ? (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 }}>
      <Ionicons name="checkmark-circle-outline" size={13} color="rgba(255,255,255,0.6)" />
      <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "700" }}>
        Applied: {referredBy}
      </Text>
    </View>
  ) : (
    <Text style={{ color: "rgba(255,255,255,0.38)", marginTop: 8, fontWeight: "600", fontSize: 12 }}>
      Enter a friend’s code — they get +1 free scan when you join.
    </Text>
  )}
</View>

    <Pressable
      onPress={async () => {
        hapticSelect?.();
        const shareLink = `https://evanai.app?ref=${effectiveReferralCode}`;
        await Share.share({
          message:
`Download Evan AI.
Scan smarter. Resell better.
Use my code: ${effectiveReferralCode}
${shareLink}`
        });
      }}
      style={({ pressed }) => [
        {
          marginTop: 14,
          paddingVertical: 15,
          borderRadius: 18,
          backgroundColor: pressed ? "rgba(235,235,235,0.95)" : "#ffffff",
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "center",
          gap: 8,
          shadowColor: "#ffffff",
          shadowOpacity: pressed ? 0.05 : 0.18,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 4 },
        },
      ]}
    >
      <Ionicons name="share-outline" size={17} color="#000000" />
      <Text style={{ color: "#000000", fontWeight: "900", fontSize: 15 }}>Share & Earn</Text>
    </Pressable>

<Pressable
  onPress={() => {
    hapticSelect?.();
    setReferralInfoExpanded((p) => !p);
  }}
  style={({ pressed }) => [
    {
      marginTop: 10,
      alignSelf: "center",
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 14,
      backgroundColor: "rgba(255,255,255,0.06)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.12)",
    },
    pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] },
  ]}
>
  <Text style={{ color: "rgba(255,255,255,0.85)", fontWeight: "900" }}>
    {referralInfoExpanded ? "Hide details" : "What is the referral program?"}
  </Text>
</Pressable>

{referralInfoExpanded ? (
  <View
    style={{
      marginTop: 12,
      padding: 12,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.12)",
      backgroundColor: "rgba(255,255,255,0.06)",
    }}
  >
    <Text style={{ color: "white", fontWeight: "900", marginBottom: 6 }}>
      How it works
    </Text>

    <Text style={{ color: "rgba(255,255,255,0.75)", fontWeight: "700" }}>
      • Share your code.
    </Text>

    <Text
      style={{
        color: "rgba(255,255,255,0.75)",
        fontWeight: "700",
        marginTop: 6,
      }}
    >
      • When someone installs + uses Evan AI, bonus scans unlock.
    </Text>

    <Text
      style={{
        color: "rgba(255,255,255,0.75)",
        fontWeight: "700",
        marginTop: 6,
      }}
    >
      • Rewards will activate when you share.
    </Text>
  </View>
) : null}
  </View>
</View>

{/* Temporary debug — long-press to wipe local Evan state and re-run survey + tutorial. */}
<Pressable
  onLongPress={() => {
    Alert.alert(
      "Reset app state?",
      "Clears onboarding, survey, history, and local cache, then reloads the app. Use this to re-run the questionnaire / tutorial.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => { factoryReset(); },
        },
      ],
    );
  }}
  delayLongPress={650}
  style={({ pressed }) => [
    {
      alignSelf: "center",
      marginTop: 28,
      paddingVertical: 6,
      paddingHorizontal: 12,
      opacity: pressed ? 0.6 : 0.18,
    },
  ]}
>
  <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: "700", letterSpacing: 0.5 }}>
    long-press to reset
  </Text>
</Pressable>

{helpOpen ? (
  <Pressable style={styles.helpBackdrop} onPress={closeHelp}>
    {/* ✅ optional blur (remove if you don’t want it) */}
    <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFillObject} />

    <RNAnimated.View
      style={[
        styles.helpBox,
        {
          opacity: helpOpacity,
          transform: [
            {
              scale: helpOpacity.interpolate({
                inputRange: [0, 1],
                outputRange: [0.98, 1],
              }),
            },
          ],
        },
      ]}
    >
<Text style={styles.helpTitle}>Scan tips</Text>
<Text style={styles.helpItem}>• Fill the frame with the item.</Text>
<Text style={styles.helpItem}>• Use strong lighting and avoid glare.</Text>
<Text style={styles.helpItem}>• Include branding, labels, or model text if possible.</Text>
<Text style={styles.helpItem}>• After taking a photo, enter your price and tap Use photo.</Text>
<Text style={styles.helpHint}>Tap anywhere to close</Text>
    </RNAnimated.View>
  </Pressable>
) : null}
    </View>
  </View>
</ScrollView>
</RNAnimated.View>
</RNAnimated.View>

<Modal
  visible={profileModal === "payments"}
  animationType="fade"
  presentationStyle="overFullScreen"
  transparent
  onRequestClose={() => setProfileModal(null)}
>
  <View style={styles.modalBackdrop}>
    <View style={styles.modalCard}>
      <View style={styles.modalTopRow}>
        <Text style={styles.modalTitle}>Payment methods</Text>
        <Pressable
          onPress={() => {
            hapticSelect();
            setProfileModal(null);
          }}
          style={styles.backPill}
        >
          <Ionicons name="close" size={16} color="white" />
          <Text style={styles.backText}>Close</Text>
        </Pressable>
      </View>
      <Text style={styles.modalDesc}>
        Subscriptions are billed through the App Store. Payment methods are managed in your Apple ID settings.
      </Text>
      <View style={styles.payRow}>
        <View style={{ marginRight: 10 }}>
          <PayPill icon="card" label="Credit / Debit" />
        </View>
        <View style={{ marginRight: 10 }}>
          <PayPill icon="logo-apple" label="Apple Pay" />
        </View>
        <PayPill icon="logo-paypal" label="PayPal" />
      </View>
      <Pressable
        onPress={() => {
          hapticSelect();
          setProfileModal("subscription");
        }}
        style={styles.modalPrimary}
      >
        <Text style={styles.modalPrimaryText}>Manage subscription</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          hapticSelect();
          setProfileModal(null);
        }}
        style={styles.modalSecondary}
      >
        <Text style={styles.modalSecondaryText}>Done</Text>
      </Pressable>
    </View>
  </View>
</Modal>
      {/* ✅ HAGGLE MODE MODAL */}
<Modal
  visible={haggleOpen}
  animationType="fade"
  presentationStyle="overFullScreen"
  transparent
  onRequestClose={() => setHaggleOpen(false)}
>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalTopRow}>
              <Text style={styles.modalTitle}>Haggle mode</Text>
              <Pressable
                onPress={() => {
                  hapticSelect();
                  setHaggleOpen(false);
                }}
                style={styles.backPill}
              >
                <Ionicons name="close" size={16} color="white" />
                <Text style={styles.backText}>Close</Text>
              </Pressable>
            </View>
            <Text style={styles.modalDesc}>
              Quick scripts you can say in-store. Tap to copy.
            </Text>
            <View style={{ gap: 10 }}>
              {(haggleLines || []).map((line, i) => (
                <Pressable
                  key={`${i}`}
                  onPress={() => {
                    hapticSelect();
                    copyText(line);
                  }}
                  style={({ pressed }) => [
                    styles.haggleRow,
                    pressed && { opacity: 0.9, transform: [{ scale: 0.995 }] },
                  ]}
                >
                  <Text style={styles.haggleText}>{line}</Text>
                  <Ionicons
                    name="copy-outline"
                    size={18}
                    color="rgba(255,255,255,0.85)"
                  />
                </Pressable>
              ))}
            </View>
            <Text style={styles.modalFoot}>
              (Copy uses expo-clipboard if installed. If not, nothing breaks.)
            </Text>
          </View>
        </View>
      </Modal>
      {/* RESULT MODAL (reopen from history) — fade on BOTH platforms now.
          The prior iOS "slide" animation was dragging the background up
          and bleeding through during entry. Fade is consistent, fast, and
          doesn't move the parent layer. ScrollView added so tall details
          don't push the Close button off-screen on small phones. */}
<Modal
  visible={resultModalOpen}
  animationType="fade"
  presentationStyle="overFullScreen"
  transparent
  onRequestClose={() => setResultModalOpen(false)}
>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { paddingTop: Math.max(TOP, 16) + 8, maxHeight: "92%" }]}>
            <View style={styles.modalTopRow}>
              <Text style={styles.modalTitle}>Cheapest exact match</Text>
              <Pressable
                onPress={() => {
                  hapticSelect();
                  setResultModalOpen(false);
                }}
                style={styles.backPill}
                hitSlop={10}
              >
                <Ionicons name="close" size={16} color="white" />
                <Text style={styles.backText}>Close</Text>
              </Pressable>
            </View>
            {activeResult ? (
              <>
                <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>
                  {activeResult.itemName}
                </Text>
{/* 🧠 AI VERDICT CARD */}
<Text
  style={{
    marginTop: 8,
    fontSize: 14,
    fontWeight: "700",
    color: "#7CFFB2",
    letterSpacing: 0.3,
  }}
>
  {activeResult?.aiVerdict}
</Text>
{!!activeResult?.intuitionLine && (
  <Text
    style={{
      marginTop: 8,
      color: "rgba(255,255,255,0.82)",
      fontWeight: "800",
      fontSize: 13,
      lineHeight: 18,
    }}
  >
    {activeResult.intuitionLine}
  </Text>
)}
{(() => {
  // Demote the price-only verdict when canonical disagrees.
  // getVerdict() looks at scannedPrice vs cheapestPrice and can emit "BUY"
  // for a cheap listing even when the canonical buyVerdict (the one shown
  // big on the hero screen) is HOLD/PASS. Showing both side-by-side reads
  // as the app contradicting itself. When canonical is HOLD/PASS we
  // collapse the chip to a neutral "Top match" / "Cheap listing" label
  // and lose the green tint so the user's eye lands on the canonical
  // verdict, not the listing-level price chip.
  const v = getVerdict({
    scannedPrice: toNumber(activeResult.scannedPrice),
    cheapestPrice: toNumber(activeResult.price),
  });
  if (!v) return null;
  const canonical = String(activeResult?.buyVerdict || "").toUpperCase();
  const canonicalDisagrees = (canonical === "HOLD" || canonical === "PASS") && v.tone === "green";
  if (canonicalDisagrees) {
    return (
      <View style={styles.verdictRow}>
        <Text style={[styles.verdictChip, styles.verdict_yellow]}>
          Cheap listing
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.verdictRow}>
      <Text
        style={[
          styles.verdictChip,
          v.tone === "green"
            ? styles.verdict_green
            : v.tone === "yellow"
            ? styles.verdict_yellow
            : styles.verdict_red,
        ]}
      >
        {v.label}
      </Text>
    </View>
  );
})()}
                <View
                  style={{ flexDirection: "row", alignItems: "center", marginTop: 6, flexWrap: "wrap" }}
                >
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.75)",
                      fontWeight: "700",
                    }}
                  >
                    {money(activeResult.price)} · {activeResult.store}
                  </Text>

                  {typeof activeResult.rating === "number" ? (
                    <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 8 }}>
                      <StarRating value={activeResult.rating} size={13} />
                    </View>
                  ) : null}
                </View>

                {/* ✅ INTELLIGENCE CHIPS */}
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  {Number.isFinite(activeResult.buyScore) ? (
                    <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" }}>
                      <Text style={{ color: "white", fontWeight: "900", fontSize: 12 }}>
                        Buy Score {Math.round(activeResult.buyScore)}
                      </Text>
                    </View>
                  ) : null}
                  {activeResult.buyVerdict ? (
                    <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.10)" }}>
                      <Text style={{ color: "rgba(255,255,255,0.92)", fontWeight: "900", fontSize: 12 }}>
                        {activeResult.buyVerdict}
                      </Text>
                    </View>
                  ) : null}
                  {activeResult.resaleVelocity ? (
                    <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)" }}>
                      <Text style={{ color: "rgba(255,255,255,0.8)", fontWeight: "800", fontSize: 12 }}>
                        Velocity {activeResult.resaleVelocity}
                      </Text>
                    </View>
                  ) : null}
                  {activeResult.category ? (
                    <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)" }}>
                      <Text style={{ color: "rgba(255,255,255,0.8)", fontWeight: "800", fontSize: 12 }}>
                        {activeResult.category}
                      </Text>
                    </View>
                  ) : null}
                </View>
<View style={styles.verdictRow}>
<Text
  style={[
    styles.verdictChip,
    activeResult?.buyVerdict === "BUY"
      ? styles.verdict_green
      : activeResult?.buyVerdict === "PASS"
      ? styles.verdict_red
      : styles.verdict_yellow,
  ]}
>
  {String(activeResult?.buyVerdict || "HOLD").toUpperCase()}
</Text>
{brainHotSignal && brainHotSignal.tier !== "COLD" ? (
  <View style={{
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: brainHotSignal.tier === "VIRAL" ? "rgba(255,80,0,0.18)"
      : brainHotSignal.tier === "HOT" ? "rgba(255,185,0,0.14)"
      : "rgba(255,255,255,0.08)",
    borderColor: brainHotSignal.tier === "VIRAL" ? "rgba(255,120,0,0.50)"
      : brainHotSignal.tier === "HOT" ? "rgba(255,200,0,0.40)"
      : "rgba(255,255,255,0.16)",
  }}>
    <Text style={{
      fontWeight: "900",
      fontSize: 11,
      letterSpacing: 0.8,
      color: brainHotSignal.tier === "VIRAL" ? "rgba(255,180,100,1)"
        : brainHotSignal.tier === "HOT" ? "rgba(255,210,80,1)"
        : "rgba(255,255,255,0.78)",
    }}>
      {brainHotSignal.tier === "VIRAL" ? "\uD83D\uDD25 VIRAL FLIP" : brainHotSignal.tier === "HOT" ? "\uD83D\uDD25 HIGH DEMAND" : "WARM"}
    </Text>
  </View>
) : null}
</View>
{brainHotSignal?.hooks?.loss_framing && brainHotSignal.tier !== "COLD" ? (
  <Text style={{ color: "rgba(255,255,255,0.68)", fontWeight: "700", fontSize: 12, marginBottom: 6 }}>
    {brainHotSignal.hooks.loss_framing}
  </Text>
) : null}
<View style={styles.confidenceBreakdown}>
  {getConfidenceBreakdown({
    confidence: activeResult.visionConfidence,
    nikeLikely,
    totalMatches: activeResult.totalMatches,
  }).map((line, i) => (
    <Text key={i} style={styles.confidenceLine}>
      • {line}
    </Text>
  ))}
</View>
<View
  style={{
    marginBottom: 10,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
  }}
>
  <Text style={{ color: "white", fontWeight: "900", marginBottom: 6 }}>
    Why this match?
  </Text>

  <View style={{ marginTop: 10 }}>
    <Text style={{ color: "white", fontWeight: "700", marginBottom: 6 }}>
      Why this is ranked #1
    </Text>

    {(activeResult?.rankWhy || []).map((r, i) => (
      <Text
        key={`rank-why-${i}`}
        style={{ color: "rgba(255,255,255,0.75)", marginBottom: 4 }}
      >
        ✔ {r}
      </Text>
    ))}
  </View>
</View>
  <ConfidenceBar value={activeResult.visionConfidence ?? 0} />
<Text
  style={{
    marginTop: 10,
    color: "rgba(255,255,255,0.60)",
    fontWeight: "800",
    fontSize: 12,
  }}
>
  {activeResult?.rescanTip ||
    "Rescan in 24–48h — listings update constantly."}
</Text>
                <View style={{ marginTop: 12 }}>
                  <Text style={{ color: "white", fontWeight: "900" }}>
                    Saved {money(activeResult.savedAmount)}
                  </Text>
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.75)",
                      fontWeight: "700",
                      marginTop: 2,
                    }}
                  >
                    {percent(activeResult.cheaperPct)} cheaper than{" "}
                    {money(activeResult.scannedPrice)}
                  </Text>
                </View>
                <View
                  style={{
                    marginTop: 12,
                    paddingTop: 10,
                    borderTopWidth: 1,
                    borderTopColor: "rgba(255,255,255,0.10)",
                  }}
                >
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.9)",
                      fontWeight: "900",
                      marginBottom: 6,
                    }}
                  >
                    Market snapshot
                  </Text>
                  <Text style={{ color: "rgba(255,255,255,0.75)", fontWeight: "700" }}>
                    Range: {money(activeResult.historicalLow)} –{" "}
                    {money(activeResult.historicalHigh)}
                  </Text>
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.75)",
                      fontWeight: "700",
                      marginTop: 2,
                    }}
                  >
                    Avg: {money(activeResult.avgMarket)}
                  </Text>
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.75)",
                      fontWeight: "700",
                      marginTop: 2,
                    }}
                  >
                    Resale est.: {money(activeResult.estimatedResale)}
                  </Text>
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.75)",
                      fontWeight: "700",
                      marginTop: 2,
                    }}
                  >
                    Flip grade: {activeResult.flipPotential}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    const _openUrl = activeResult?.directUrl || activeResult?.buyLink;
                    if (!_openUrl || activeResult?.clickable === false) return;
                    if (!isTrustedUrl(_openUrl)) return;
safeOpenUrl(_openUrl, activeResult.itemName || "Listing" );
                  }}
                  style={[styles.modalPrimary, { marginTop: 14 }]}
                >
                  <View style={styles.inlineRow}>
                    <Ionicons name="open-outline" size={16} color="white" />
                    <Text style={styles.modalPrimaryText}>Open listing</Text>
                  </View>
                </Pressable>
{sellerMode ? (
  <View style={{ marginTop: 14 }}>
    {(() => {
      const predicted = predictNext7dPrice({
        estValue: activeResult?.avgMarket ?? activeResult?.estimatedResale ?? activeResult?.price,
        marketLow: activeResult?.historicalLow,
        marketHigh: activeResult?.historicalHigh,
        drops: 0,
      });
      const listPrice = predicted ?? clampPrice(activeResult?.estimatedResale) ?? clampPrice(activeResult?.avgMarket) ?? clampPrice(activeResult?.price);
      const title = activeResult?.itemName || activeResult?.title || "Item";
      const desc =
        `Listing generated by Evan AI.\n\n` +
        `Condition: (fill)\n` +
        `Notes: (fill)\n\n` +
        `Market range: ${money(activeResult?.historicalLow)} – ${money(activeResult?.historicalHigh)}\n` +
        `Suggested list: ${money(listPrice)}\n` +
        `Confidence: ${Math.round((activeResult?.visionConfidence || 0) * 100)}%`;
      return (
        <View style={{ padding: 12, borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.06)" }}>
          <Text style={{ color: "white", fontWeight: "900", marginBottom: 6 }}>Seller mode</Text>
          <Text style={{ color: "rgba(255,255,255,0.75)", fontWeight: "800" }}>
            Suggested list price: <Text style={{ color: "white" }}>{money(listPrice)}</Text>
          </Text>
<View style={[styles.resultsActionRowTight, { marginTop: 10 }]}>
            <Pressable
              style={styles.resultsMiniAction}
              onPress={async () => { hapticSelect?.(); await Clipboard.setStringAsync(title); setSavedToast?.("Title copied"); }}
            >
              <Ionicons name="copy-outline" size={16} color="white" />
              <Text style={styles.resultsMiniActionText}>Copy title</Text>
            </Pressable>
            <Pressable
              style={styles.resultsMiniActionGhost}
              onPress={async () => { hapticSelect?.(); await Clipboard.setStringAsync(desc); setSavedToast?.("Description copied"); }}
            >
              <Ionicons name="document-text-outline" size={16} color="white" />
              <Text style={styles.resultsMiniActionText}>Copy desc</Text>
            </Pressable>
            <Pressable
              style={styles.resultsMiniAction}
              onPress={async () => {
                hapticSelect?.();
                const invItem: InventoryItem = {
                  id: makeId(),
                  title,
                  qty: 1,
                  estResale: listPrice ?? null,
                  buyPrice: clampPrice(activeResult?.scannedPrice) ?? null,
                  createdAt: Date.now(),
                  thumbUri: activeResult?.photoUri || null,
                  notes: null,
                };
                const next = [invItem, ...(inventory || [])].slice(0, 500);
                setInventory(next);
                await saveInventory(next);
                setSavedToast?.("Added to inventory");
              }}
            >
              <Ionicons name="cube-outline" size={16} color="white" />
              <Text style={styles.resultsMiniActionText}>Add to inv</Text>
            </Pressable>
          </View>
          {predicted != null ? (
            <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.62)", fontWeight: "800", fontSize: 12 }}>
              Price prediction (7d): {money(predicted)}
            </Text>
          ) : null}
        </View>
      );
    })()}
  </View>
) : null}
              </>
           ) : null}
          </View>
        </View>
      </Modal>
      {/* PROFILE MODAL: SUBSCRIPTION — new SubscriptionModal */}
<SubscriptionModal
  visible={profileModal === "subscription"}
  onClose={() => setProfileModal(null)}
  onPurchased={(newIsPro) => {
    if (newIsPro) {
      setIsPro(true);
      setIsSignedIn(true);
      // ── Finance Analytics: purchase conversion ────────────────────────
      try { FinanceAnalytics.recordPurchased(userId ?? null, "subscription"); } catch {}
    }
    setProfileModal(null);
  }}
/>

{/* PROFILE MODAL: SUBSCRIPTION — LEGACY (hidden, kept for reference) */}
<Modal
  visible={false}
  animationType="fade"
  presentationStyle="overFullScreen"
  transparent
  onRequestClose={() => setProfileModal(null)}
>
  <View style={styles.modalBackdrop}>
    <View style={styles.modalCard}>
      <View style={styles.modalTopRow}>
        <Text style={styles.modalTitle}>Unlimited scans</Text>
        <Pressable
          onPress={() => {
            hapticSelect();
            setProfileModal(null);
          }}
          style={styles.backPill}
        >
          <Ionicons name="close" size={16} color="white" />
          <Text style={styles.backText}>Close</Text>
        </Pressable>
      </View>

      {/* SIDE-BY-SIDE TIERS */}
      <View style={{ flexDirection: "row", gap: 12, marginTop: 10 }}>
        {/* FREE */}
        <View
          style={{
            flex: 1,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
            backgroundColor: "rgba(255,255,255,0.06)",
            padding: 14,
          }}
        >
          <Text style={{ color: "white", fontWeight: "900", fontSize: 14 }}>
            Evan AI (Free)
          </Text>
          <Text style={{ marginTop: 8, color: "rgba(255,255,255,0.72)", fontWeight: "800", fontSize: 12 }}>
            • {FREE_SCAN_LIMIT_SAFE} scans / 30 days
          </Text>
          <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.72)", fontWeight: "800", fontSize: 12 }}>
            • Watch automation
          </Text>
          <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.72)", fontWeight: "800", fontSize: 12 }}>
            • Seller mode
          </Text>
          <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.72)", fontWeight: "800", fontSize: 12 }}>
            • Inventory
          </Text>
          <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.72)", fontWeight: "800", fontSize: 12 }}>
            • Batch scan
          </Text>
          <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.72)", fontWeight: "800", fontSize: 12 }}>
            • Intelligence
          </Text>
        </View>

        {/* PRO */}
        <View
          style={{
            flex: 1,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: "rgba(0,229,255,0.35)",
            backgroundColor: "rgba(0,229,255,0.08)",
            padding: 14,
          }}
        >
          <Text style={{ color: "white", fontWeight: "900", fontSize: 14 }}>
            Evan AI Pro
          </Text>
          <Text style={{ marginTop: 8, color: "rgba(255,255,255,0.88)", fontWeight: "900", fontSize: 12 }}>
            • Unlimited scans
          </Text>
          <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.76)", fontWeight: "800", fontSize: 12 }}>
            • Same full feature access
          </Text>
       
{/* PRICE STACK — APPLE PREMIUM */}
<View
  style={{
    alignItems: "flex-start",
  }}
>
  {/* Monthly — jackpot golden glow */}
  <JackpotPrice price={PRO_MONTHLY_PRICE} />

  <Text
    style={{
      marginTop: 4,
      color: "rgba(255,255,255,0.78)",
      fontWeight: "800",
      fontSize: 12,
      letterSpacing: 0.2,
    }}
  >
    unlimited scans
  </Text>

  {/* divider */}
  <View
    style={{
      marginTop: 12,
      marginBottom: 10,
      width: "100%",
      height: 1,
      backgroundColor: "rgba(255,255,255,0.10)",
    }}
  />

  {/* OR label */}
  <Text
    style={{
      color: "rgba(255,255,255,0.45)",
      fontWeight: "900",
      fontSize: 10,
      letterSpacing: 1.4,
    }}
  >
    OR SAVE MORE
  </Text>

  {/* Yearly */}
  <Text
    style={{
      marginTop: 5,
      color: "white",
      fontWeight: "900",
      fontSize: 20,
      letterSpacing: -0.3,
    }}
  >
    ${PRO_YEARLY_PRICE.toFixed(2)} / year
  </Text>

  <Text
    style={{
      marginTop: 2,
      color: "rgba(0,229,255,0.85)",
      fontWeight: "900",
      fontSize: 12,
      letterSpacing: 0.2,
    }}
  >
    best value
  </Text>
</View>
</View> 
</View>

<Text
  style={[
    styles.modalDesc,
    {
      marginTop: 14,
      textAlign: "center",
      color: "rgba(255,255,255,0.82)",
      fontWeight: "700",
      lineHeight: 20,
    },
  ]}
>
  Cancel anytime.{" "}
  <Text style={{ color: "rgba(0,229,255,0.95)", fontWeight: "900" }}>
    Most users save more on their first scan.
  </Text>
</Text>

<Pressable
  onPress={async () => {
    hapticSelect();
    const result = await purchaseMonthly();
    if (result.isPro) {
      setIsPro(true);
      setIsSignedIn(true);
      setProfileModal(null);
    } else if (result.error && result.error !== "cancelled" && result.error !== "not_configured") {
      // fallback for dev/simulator: still grant pro
      setIsPro(true);
      setIsSignedIn(true);
      setProfileModal(null);
    }
  }}
  style={styles.modalPrimary}
>
  <Text style={styles.modalPrimaryText}>
    Go Pro — ${PRO_MONTHLY_PRICE.toFixed(2)}/mo
  </Text>
</Pressable>

{/* ✅ NEW: Yearly CTA directly under monthly */}
<Pressable
  onPress={async () => {
    hapticSelect();
    const result = await purchaseYearly();
    if (result.isPro) {
      setIsPro(true);
      setIsSignedIn(true);
      setProfileModal(null);
    } else if (result.error && result.error !== "cancelled" && result.error !== "not_configured") {
      setIsPro(true);
      setIsSignedIn(true);
      setProfileModal(null);
    }
  }}
  style={[
    styles.modalPrimary,
    {
      marginTop: 10,
      backgroundColor: "rgba(0,229,255,0.12)",
      borderWidth: 1,
      borderColor: "rgba(0,229,255,0.28)",
    },
  ]}
>
  <Text style={[styles.modalPrimaryText, { color: "white" }]}>
    Go yearly — ${PRO_YEARLY_PRICE.toFixed(2)}/yr (best value)
  </Text>
</Pressable>

<Pressable
  onPress={async () => {
    hapticSelect();
    const result = await restorePurchases();
    if (result.isPro) {
      setIsPro(true);
      setIsSignedIn(true);
      setProfileModal(null);
    }
  }}
  style={[styles.modalSecondary, { marginBottom: 6 }]}
>
  <Text style={styles.modalSecondaryText}>Restore purchases</Text>
</Pressable>

<Pressable
  onPress={() => {
    hapticSelect();
    setProfileModal(null);
  }}
  style={styles.modalSecondary}
>
  <Text style={styles.modalSecondaryText}>Later</Text>
</Pressable>

      <Text style={styles.modalFoot}>
        Billing handled by the App Store. Cancel anytime in Apple ID settings.
      </Text>
    </View>
  </View>
</Modal>

<Modal
  visible={seeMoreOpen}
  animationType="fade"
  presentationStyle="overFullScreen"
  transparent
  onRequestClose={() => setSeeMoreOpen(false)}
>
  <View style={styles.modalBackdrop}>
    <View style={styles.modalCard}>
      <View style={styles.modalTopRow}>
        <Text style={styles.modalTitle}>More matches</Text>
        <Pressable
          onPress={() => {
            hapticSelect();
            setSeeMoreOpen(false);
          }}
          style={styles.backPill}
        >
          <Ionicons name="close" size={16} color="white" />
          <Text style={styles.backText}>Close</Text>
        </Pressable>
      </View>
      <Text style={styles.modalDesc}>
        Tap a listing to open it. (This won’t use another scan.)
      </Text>
      <ScrollView
        style={{ maxHeight: 420 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 220 }}
        keyboardShouldPersistTaps="handled"
      >
        {(seeMoreListings || []).slice(0, 60).map((it, idx) => {
const m = String(it?.__market || it?.source || "").toLowerCase();
const store =
  m.includes("ebay") ? "eBay" :
  m.includes("etsy") ? "Etsy" :
  m.includes("mercari") ? "Mercari" :
  m.includes("posh") ? "Poshmark" :
  m.includes("facebook") ? "Facebook" :
  m.includes("stockx") ? "StockX" :
  m ? String(it.__market || it.source) :
  "Google";
          return (
            <Pressable
              key={`${it?.url || idx}`}
              onPress={() => {
                const u = it?.directUrl || it?.url;
                if (it?.clickable === false || !u) {
                  try { console.log("FRONTEND_LISTING_NOT_CLICKABLE", { title: String(it?.title || "").slice(0, 80), source: it?.source || null, urlQuality: it?.urlQuality || null }); } catch {}
                  return;
                }
                if (!isTrustedUrl(u)) {
                  try { console.log("FRONTEND_LISTING_NOT_CLICKABLE", { title: String(it?.title || "").slice(0, 80), source: it?.source || null, urlQuality: it?.urlQuality || null, reason: "untrusted_url" }); } catch {}
                  return;
                }
                try { console.log("FRONTEND_OPEN_LISTING_URL", { title: String(it?.title || "").slice(0, 80), source: it?.source || null, chosenUrl: u, directUrl: it?.directUrl || null, urlQuality: it?.urlQuality || null, clickable: it?.clickable }); } catch {}
                safeOpenUrl(u, it?.title || "Listing");
              }}
              style={({ pressed }) => [
                styles.listingRow,
                pressed && { opacity: 0.9, transform: [{ scale: 0.995 }] },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.listingTitle} numberOfLines={2}>
                  {it?.title || "Listing"}
                </Text>
                <Text style={styles.listingMeta}>
                  {money(toNumber(it?.price))} · {store}
                  {it?.clickable === false ? " · Pricing ref." : ""}
                </Text>
              </View>
              <Ionicons
                name={it?.clickable === false ? "bar-chart-outline" : "open-outline"}
                size={18}
                color={it?.clickable === false ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.85)"}
              />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  </View>
</Modal>

{/* PAYWALL MODAL — brain store is single source of truth */}
<SubscriptionModal
  visible={brainPaywallVisible}
  onClose={() => { orchestrator.dismissPaywall(); }}
  onPurchased={(newIsPro) => {
    if (newIsPro) {
      setIsPro(true);
      setIsSignedIn(true);
      try { FinanceAnalytics.recordPurchased(userId ?? null, "plus"); } catch {}
    }
    orchestrator.dismissPaywall();
  }}
  initialPlan="go"
  aspiration={brainAspirationCtx}
/>

      {/* PROFILE MODAL: REVIEW */}
<Modal
  visible={profileModal === "review"}
  animationType="fade"
  presentationStyle="overFullScreen"
  transparent
  onRequestClose={() => setProfileModal(null)}
>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalTopRow}>
              <Text style={styles.modalTitle}>Leave a review</Text>
              <Pressable
                onPress={() => {
                  hapticSelect();
                  setProfileModal(null);
                }}
                style={styles.backPill}
              >
                <Ionicons name="close" size={16} color="white" />
                <Text style={styles.backText}>Close</Text>
              </Pressable>
            </View>
            <Text style={styles.modalDesc}>
              If Evan AI saved you money, a quick review helps a ton.
            </Text>
            <Pressable
onPress={() => {
  hapticSelect();
  setProfileModal(null);
  safeOpenUrl(
    "https://apps.apple.com/app/idYOUR_APP_ID?action=write-review",
    "Write a review"
  );
}}
              style={styles.modalPrimary}
            >
              <Text style={styles.modalPrimaryText}>Write a review</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                hapticSelect();
                setProfileModal(null);
              }}
              style={styles.modalSecondary}
            >
              <Text style={styles.modalSecondaryText}>Later</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
{/* PROFILE MODAL: HOW WE’RE DIFFERENT — Singularity Pipeline infographic */}
<SingularityPipelineModal
  visible={profileModal === "different"}
  onClose={() => setProfileModal(null)}
/>
      {/* PROFILE MODAL: TERMS */}
<Modal
  visible={profileModal === "terms"}
  animationType="fade"
  presentationStyle="overFullScreen"
  transparent
  onRequestClose={() => setProfileModal(null)}
>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalTopRow}>
              <Text style={styles.modalTitle}>Terms of Service</Text>
              <Pressable
                onPress={() => {
                  hapticSelect();
                  setProfileModal(null);
                }}
                style={styles.backPill}
              >
                <Ionicons name="close" size={16} color="white" />
                <Text style={styles.backText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalDesc}>
                Welcome to Evan AI. By accessing or using the app, you agree to these Terms of Service (“Terms”).
                If you do not agree, do not use Evan AI.
              </Text>
              <Text style={[styles.modalTitle, { fontSize: 14, marginBottom: 6 }]}>
                1. What Evan AI Does
              </Text>
              <Text style={styles.modalDesc}>
                Evan AI helps you identify items and find potentially cheaper alternatives by linking to third-party
                marketplaces (such as Google Shopping and eBay). Evan AI does not sell items and is not responsible
                for third-party listings, pricing, availability, shipping, returns, or seller behavior.
              </Text>
              <Text style={[styles.modalTitle, { fontSize: 14, marginBottom: 6 }]}>
                2. Eligibility & Accounts
              </Text>
              <Text style={styles.modalDesc}>
                You must follow applicable laws and the App Store rules. You are responsible for activity that occurs
                under your account or device, including maintaining the confidentiality of any login method you use.
              </Text>
              <Text style={[styles.modalTitle, { fontSize: 14, marginBottom: 6 }]}>
                3. Free Scans & Subscription
              </Text>
              <Text style={styles.modalDesc}>
                Evan AI may offer a limited number of free scans. If you upgrade to Pro, you may receive unlimited scans
                and additional features. Subscription pricing, renewal, cancellation, and refunds are handled by the App Store.
              </Text>
              <Text style={[styles.modalTitle, { fontSize: 14, marginBottom: 6 }]}>
                4. User Content (Photos)
              </Text>
              <Text style={styles.modalDesc}>
                You may upload or capture photos for the purpose of item identification. You confirm you have the right to
                use the content you submit. Do not submit content that is illegal, harmful, or violates someone else’s rights.
              </Text>
              <Text style={[styles.modalTitle, { fontSize: 14, marginBottom: 6 }]}>
                5. Accuracy & Disclaimers
              </Text>
              <Text style={styles.modalDesc}>
                Evan AI provides results “as is” and “as available.” We do not guarantee that identification results or price
                comparisons are accurate, complete, or current. Prices and listings change frequently and may differ by
                location, size, condition, shipping, or seller.
              </Text>
              <Text style={[styles.modalTitle, { fontSize: 14, marginBottom: 6 }]}>
                6. Limitation of Liability
              </Text>
              <Text style={styles.modalDesc}>
                To the maximum extent permitted by law, Evan AI and its creators will not be liable for any indirect,
                incidental, special, consequential, or punitive damages, or any loss of profits or data, arising from your use
                of the app or third-party links.
              </Text>
              <Text style={[styles.modalTitle, { fontSize: 14, marginBottom: 6 }]}>7. Changes</Text>
              <Text style={styles.modalDesc}>
                We may update these Terms from time to time. Continuing to use Evan AI after changes means you accept the updated Terms.
              </Text>
              <Text style={styles.modalFoot}>Last updated: {new Date().getFullYear()}</Text>
            </ScrollView>
            <Pressable
              style={styles.profileBtn}
              onPress={() => {
                hapticSelect();
                setProfileModal("privacy");
              }}
            >
              <Text style={styles.profileBtnText}>Privacy Policy</Text>
            </Pressable>
            <Pressable
              style={styles.modalPrimary}
              onPress={() => {
                hapticSelect();
                setProfileModal(null);
              }}
            >
              <Text style={styles.modalPrimaryText}>Accept</Text>
            </Pressable>
          </View>
        </View>
    </Modal>
   {/* PROFILE MODAL: PRIVACY */}
<Modal
  visible={profileModal === "privacy"}
  animationType="fade"
  presentationStyle="overFullScreen"
  transparent
  onRequestClose={() => setProfileModal(null)}
>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalTopRow}>
              <Text style={styles.modalTitle}>Privacy Policy</Text>
              <Pressable
                onPress={() => {
                  hapticSelect();
                  setProfileModal(null);
                }}
                style={styles.backPill}
              >
                <Ionicons name="close" size={16} color="white" />
                <Text style={styles.backText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalDesc}>
                This Privacy Policy explains how Evan AI handles information when you use the app.
              </Text>
              <Text style={[styles.modalTitle, { fontSize: 14, marginBottom: 6 }]}>
                1. Information You Provide
              </Text>
              <Text style={styles.modalDesc}>
                • Photos you capture or select for item identification{"\n"}• Optional account identifiers you enter (such as email/phone for sign-in placeholder)
              </Text>
              <Text style={[styles.modalTitle, { fontSize: 14, marginBottom: 6 }]}>
                2. How We Use Information
              </Text>
              <Text style={styles.modalDesc}>
                We use your photo inputs to identify an item and display results. We use basic app state (like scan count and pro status) to operate the app experience on your device.
              </Text>
              <Text style={[styles.modalTitle, { fontSize: 14, marginBottom: 6 }]}>
                3. Third-Party Services & Links
              </Text>
              <Text style={styles.modalDesc}>
                Evan AI may link you to third-party marketplaces. When you tap a link, you are subject to that third party’s privacy policy and terms. Evan AI is not responsible for third-party practices.
              </Text>
              <Text style={[styles.modalTitle, { fontSize: 14, marginBottom: 6 }]}>
                4. Data Storage & Retention
              </Text>
              <Text style={styles.modalDesc}>
                Evan AI stores basic app state locally on your device (for example, scan counts and history thumbnails). We do not sell your personal information. If we add cloud features later, this policy will be updated.
              </Text>
              <Text style={[styles.modalTitle, { fontSize: 14, marginBottom: 6 }]}>5. Security</Text>
              <Text style={styles.modalDesc}>
                We take reasonable steps to protect information, but no method of transmission or storage is 100% secure.
              </Text>
              <Text style={[styles.modalTitle, { fontSize: 14, marginBottom: 6 }]}>6. Your Choices</Text>
              <Text style={styles.modalDesc}>
                You can stop using Evan AI at any time. You may also clear local app data by removing the app or clearing storage.
              </Text>
              <Text style={styles.modalFoot}>Last updated: {new Date().getFullYear()}</Text>
            </ScrollView>
            <Pressable
              style={styles.modalPrimary}
              onPress={() => {
                hapticSelect();
                setProfileModal(null);
              }}
            >
              <Text style={styles.modalPrimaryText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
{/* Unverified-link modal removed — links open directly via safeOpenUrl.
    State + reducer kept so any legacy caller of requestUnverifiedLinkPrompt
    is a silent no-op instead of a crash; the renderer is intentionally gone
    so the user never sees a confirm-to-open prompt again. */}
{/* BILLION: CLOUD IMPORT */}
<Modal
  visible={cloudImportOpen}
  animationType="fade"
  presentationStyle="overFullScreen"
  transparent
  onRequestClose={() => setCloudImportOpen(false)}
>
  <View style={styles.modalBackdrop}>
    <View style={styles.modalCard}>
      <View style={styles.modalTopRow}>
        <Text style={styles.modalTitle}>Cloud import</Text>
        <Pressable onPress={() => setCloudImportOpen(false)} style={styles.backPill}>
          <Ionicons name="close" size={16} color="white" />
          <Text style={styles.backText}>Close</Text>
        </Pressable>
      </View>
      <Text style={styles.modalDesc}>Paste a snapshot JSON (from Cloud export). This restores local state.</Text>
      <TextInput
        value={cloudImportText}
        onChangeText={setCloudImportText}
        placeholder="Paste snapshot JSON here"
        placeholderTextColor="rgba(255,255,255,0.35)"
        style={[styles.authInput, { height: 140, textAlignVertical: "top" }]}
        multiline
      />
      <Pressable
        style={styles.modalPrimary}
        onPress={async () => {
          hapticSelect?.();
          try {
            const snap = JSON.parse(cloudImportText || "");
            if (snap?.watchlist) setWatchlist(Array.isArray(snap.watchlist) ? snap.watchlist : []);
            if (snap?.intelState) setIntelState(snap.intelState);
            if (snap?.inventory) {
              const inv = Array.isArray(snap.inventory) ? snap.inventory : [];
              setInventory(inv);
              await saveInventory(inv);
            }
            if (typeof snap?.sellerMode === "boolean") {
              setSellerMode(snap.sellerMode);
              await AsyncStorage.setItem(SELLER_KEY, snap.sellerMode ? "1" : "0");
            }
            setCloudImportText("");
            setCloudImportOpen(false);
            setSavedToast?.("Imported successfully");
          } catch {
            setSavedToast?.("Invalid snapshot JSON");
          }
        }}
      >
        <Text style={styles.modalPrimaryText}>Import</Text>
      </Pressable>
      <Pressable style={styles.modalSecondary} onPress={() => setCloudImportOpen(false)}>
        <Text style={styles.modalSecondaryText}>Cancel</Text>
      </Pressable>
    </View>
  </View>
</Modal>
{/* BILLION: INVENTORY */}
<Modal
  visible={inventoryOpen}
  animationType="fade"
  presentationStyle="overFullScreen"
  transparent
  onRequestClose={() => setInventoryOpen(false)}
>
  <View style={styles.modalBackdrop}>
    <View style={styles.modalCard}>
      <View style={styles.modalTopRow}>
        <Text style={styles.modalTitle}>Inventory</Text>
        <Pressable onPress={() => setInventoryOpen(false)} style={styles.backPill}>
          <Ionicons name="close" size={16} color="white" />
          <Text style={styles.backText}>Close</Text>
        </Pressable>
      </View>
      <Text style={styles.modalDesc}>
        Track your flips locally. Add from Results (seller mode) or manually.
      </Text>
      <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
        {(inventory || []).length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No inventory yet.</Text>
            <Text style={styles.emptyBody}>Turn on Seller mode and add listings from Results.</Text>
          </View>
        ) : (
          (inventory || []).slice(0, 200).map((it) => (
            <View key={it.id} style={styles.historyRow}>
              {it.thumbUri ? (
                <Image source={{ uri: it.thumbUri }} style={styles.historyThumb} />
              ) : (
                <View style={styles.miniImgFallback}>
                  <Ionicons name="cube" size={18} color="rgba(255,255,255,0.55)" />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.historyTitle} numberOfLines={1}>{it.title}</Text>
                <Text style={styles.historyTime}>
                  Qty {it.qty} · Est {money(it.estResale)} · Buy {money(it.buyPrice)}
                </Text>
              </View>
              <Pressable
                onPress={async () => {
                  hapticSelect?.();
                  const next = (inventory || []).filter((x) => x.id !== it.id);
                  setInventory(next);
                  await saveInventory(next);
                  setSavedToast?.("Removed");
                }}
                style={styles.watchTrash}
              >
                <Ionicons name="trash" size={18} color="rgba(255,255,255,0.85)" />
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
      <Pressable
        style={styles.modalPrimary}
        onPress={async () => {
          hapticSelect?.();
          const json = JSON.stringify(inventory || []);
          await Clipboard.setStringAsync(json);
          setSavedToast?.("Inventory copied");
        }}
      >
        <Text style={styles.modalPrimaryText}>Export inventory (copy)</Text>
      </Pressable>
    </View>
  </View>
</Modal>
{/* Feature 4: Batch Scan / Inventory Mode
    Scan-limit plumbing: the BatchScanScreen used to fire /api/batch/identify
    and /market/search per selected photo without ever consulting the free-
    scan counter. We now pass the live limit + a consume callback so each
    successful item charges 1 free scan and the screen halts the moment the
    budget is exhausted (paywall bail via bailScanForPaywall). */}
<BatchScanScreen
  visible={batchInventoryOpen}
  apiBase={process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === "ios" ? "http://192.168.1.227:3001" : "http://10.0.2.2:3001")}
  zipCode={zipCode || null}
  onClose={() => setBatchInventoryOpen(false)}
  isFreeLimitReached={isFreeLimitReached}
  onConsumeScan={() => { consumeFreeScan("batch_screen"); }}
  onLimitHit={() => { bailScanForPaywall("batch_screen"); }}
/>

{/* BILLION: MULTI-ITEM SCAN QUEUE */}
<Modal
  visible={batchOpen}
  animationType="fade"
  presentationStyle="overFullScreen"
  transparent
  onRequestClose={() => setBatchOpen(false)}
>
  <View style={styles.modalBackdrop}>
    <View style={styles.modalCard}>
      <View style={styles.modalTopRow}>
        <Text style={styles.modalTitle}>Multi-item scan</Text>
        <Pressable onPress={() => setBatchOpen(false)} style={styles.backPill}>
          <Ionicons name="close" size={16} color="white" />
          <Text style={styles.backText}>Close</Text>
        </Pressable>
      </View>
<Text style={styles.modalDesc}>
  Add photos → load the next queued item into scan preview. Safe, local-first, no crash risk.
</Text>
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
        <Pressable
          style={[styles.modalPrimary, { flex: 1, marginBottom: 0 }]}
          onPress={async () => {
            hapticSelect?.();
            try {
const pick = await ImagePicker.launchImageLibraryAsync({
  mediaTypes: ["images"] as any,
  allowsMultipleSelection: true as any,
  quality: 0.9,
} as any);
              if ((pick as any)?.canceled) return;
              const assets = (pick as any)?.assets || [];
              const next = [
                ...batchQueue,
                ...assets.map((a: any) => ({ id: makeId(), uri: a.uri, createdAt: Date.now() })),
              ].slice(-60);
              setBatchQueue(next);
              await saveBatchQueue(next);
              setSavedToast?.(`Added ${assets.length}`);
            } catch {
              setSavedToast?.("Couldn’t add photos");
            }
          }}
        >
          <Text style={styles.modalPrimaryText}>Add photos</Text>
        </Pressable>
        <Pressable
          style={[styles.modalSecondary, { width: 120 }]}
          onPress={async () => {
            hapticSelect?.();
            setBatchQueue([]);
            await saveBatchQueue([]);
            setSavedToast?.("Cleared");
          }}
        >
          <Text style={styles.modalSecondaryText}>Clear</Text>
        </Pressable>
      </View>
      {/* Batch summary header when results exist */}
      {batchQueue.some((j) => j.status === "done") ? (
        <View style={{ marginBottom: 10, padding: 10, borderRadius: 10, backgroundColor: "rgba(120,255,180,0.06)", borderWidth: 1, borderColor: "rgba(120,255,180,0.15)" }}>
          <Text style={{ color: "rgba(120,255,180,0.85)", fontSize: 12, fontWeight: "600" }}>
            {batchQueue.filter((j) => j.status === "done").length} of {batchQueue.length} scanned
            {batchQueue.filter((j) => j.status === "scanning").length ? " · scanning…" : ""}
          </Text>
          {(() => {
            const totalValue = batchQueue
              .filter((j) => j.status === "done" && Number.isFinite(j.price))
              .reduce((s, j) => s + (j.price ?? 0), 0);
            return totalValue > 0 ? (
              <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, marginTop: 2 }}>
                Total market value: {money(totalValue)}
              </Text>
            ) : null;
          })()}
        </View>
      ) : null}

      <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
        {(batchQueue || []).length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Queue empty.</Text>
            <Text style={styles.emptyBody}>
              {batchMode
                ? "Switch to Camera tab and shoot items — they'll auto-scan here."
                : "Add photos or enable batch mode to scan multiple items."}
            </Text>
          </View>
        ) : (
          (batchQueue || []).map((j) => {
            const statusColor =
              j.status === "done"     ? "rgba(120,255,180,0.85)" :
              j.status === "scanning" ? "rgba(255,210,80,0.85)" :
              j.status === "error"    ? "rgba(255,100,80,0.85)" :
              "rgba(255,255,255,0.35)";
            const statusLabel =
              j.status === "done"     ? (j.verdict || "DONE") :
              j.status === "scanning" ? "SCANNING…" :
              j.status === "error"    ? "ERROR" :
              "QUEUED";

            return (
              <Pressable
                key={j.id}
                style={styles.historyRow}
                onPress={() => {
                  if (j.status === "done" && j.result) {
                    hapticSelect?.();
                    setActiveResult(j.result);
                    setResults([]);
                    goTab?.("results");
                    setBatchOpen(false);
                  }
                }}
              >
                <Image source={{ uri: j.uri }} style={styles.historyThumb} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.historyTitle} numberOfLines={1}>
                    {j.itemName || "Scanning…"}
                  </Text>
                  {j.status === "done" && Number.isFinite(j.price) ? (
                    <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
                      {money(j.price)}
                    </Text>
                  ) : j.status === "error" ? (
                    <Text style={{ color: "rgba(255,100,80,0.75)", fontSize: 11 }}>
                      {j.errorMsg || "Scan failed"}
                    </Text>
                  ) : null}
                  <Text style={{ color: statusColor, fontSize: 10, fontWeight: "600", letterSpacing: 0.5 }}>
                    {statusLabel}
                  </Text>
                </View>
                <Pressable
                  onPress={async (e) => {
                    e.stopPropagation?.();
                    hapticSelect?.();
                    const next = batchQueue.filter((x) => x.id !== j.id);
                    setBatchQueue(next);
                    await saveBatchQueue(next);
                  }}
                  style={styles.watchTrash}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash" size={18} color="rgba(255,255,255,0.85)" />
                </Pressable>
              </Pressable>
            );
          })
        )}
      </ScrollView>

<Pressable
  style={styles.modalPrimary}
  onPress={async () => {
    hapticSelect?.();
    if (batchRunning || loadingResults) return;
    if (!batchQueue.length) return;

    const first = batchQueue[0];
    const next = batchQueue.slice(1);

    setBatchRunning(true);

    try {
      try { scanAbortRef.current?.abort?.(); } catch {}
      scanAbortRef.current = null;
      scanTokenRef.current += 1;
      scanLockRef.current = false;

      setLoadingResults(false);
      setShowRetryWhileLoading(false);
      setUiError(null);
      setResultModalOpen(false);
      setSeeMoreOpen(false);
      setActiveResult(null);
      setResults([]);
      setLoadingPhotoUri(null);
      setPriceSubmitted(false);
      setScanPriceInput("");
      setPhoto(null);
      Keyboard.dismiss?.();

      setBatchQueue(next);
      await saveBatchQueue(next);

      setBatchOpen(false);
      goTab?.("camera");

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setPhoto({ uri: first.uri } as any);
          setSavedToast?.("Queued item loaded");
          setBatchRunning(false);
        });
      });
    } catch {
      setBatchRunning(false);
      setSavedToast?.("Couldn’t load queued item");
    }
  }}
>
  <Text style={styles.modalPrimaryText}>Load next queued item</Text>
</Pressable>
    </View>
  </View>
</Modal>
{/* Feature 3: RECEIPT RESULT PANEL */}
<ReceiptResultPanel
  visible={receiptPanelOpen}
  loading={receiptLoading}
  data={receiptData}
  error={receiptError}
  onDone={() => {
    setReceiptPanelOpen(false);
    setReceiptData(null);
    setReceiptError(null);
  }}
  onAddToHistory={(items) => {
    // Add to scan history as individual entries
    const ts = Date.now();
    const newEntries = items
      .filter((item) => item.paid > 0 && item.name)
      .map((item) => ({
        id: `rcpt_${ts}_${Math.random().toString(36).slice(2, 6)}`,
        ts,
        query: item.name,
        savedAmount: item.delta != null && item.delta < 0 ? Math.abs(item.delta) : 0,
        resultCard: {
          itemName: item.name,
          price: item.marketPrice ?? item.paid,
          scannedPrice: item.paid,
          savedAmount: item.delta != null && item.delta < 0 ? Math.abs(item.delta) : 0,
          // Phase 5: emit canonical Verdict only. Was "OVERPRICED"/"FAIR".
          buyVerdict: item.overpaid ? "PASS" : "HOLD",
        },
      }));
    if (newEntries.length) {
      setHistory((prev) => [...newEntries, ...prev].slice(0, 200));
      const totalSaved = newEntries.reduce((s, e) => s + (e.savedAmount || 0), 0);
      if (totalSaved > 0) setSavingsTotal((prev) => prev + totalSaved);
      setSavedToast(`Added ${newEntries.length} item${newEntries.length > 1 ? "s" : ""} to history`);
    }
  }}
/>

{/* AUTH MODAL */}
<Modal
  visible={authModalOpen}
  animationType="fade"
  presentationStyle="overFullScreen"
  transparent
  onRequestClose={() => {
    setAuthModalOpen(false);
    setAuthStep("email");
    setAuthEmail("");
    setAuthOtp("");
    setAuthError("");
    setAuthSending(false);
    setAuthPwVisible(false);
    setAuthIsRegister(false);
  }}
>
  <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
  <View style={styles.modalBackdrop}>
    <View style={styles.modalCard}>
      {/* X close button */}
      <Pressable
        onPress={() => { setAuthModalOpen(false); setAuthStep("email"); setAuthEmail(""); setAuthOtp(""); setAuthError(""); setAuthSending(false); setAuthPwVisible(false); setAuthIsRegister(false); }}
        style={{ position: "absolute", top: 14, right: 14, zIndex: 10, padding: 6, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.07)" }}
        hitSlop={8}
      >
        <Ionicons name="close" size={18} color="rgba(255,255,255,0.55)" />
      </Pressable>

      {authStep === "email" ? (
        <>
          {/* Header */}
          <View style={{ alignItems: "center", marginBottom: 20 }}>
            <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
              <Ionicons name="person-outline" size={24} color="white" />
            </View>
            <Text style={styles.modalTitle}>Sign in</Text>
            <Text style={[styles.modalDesc, { textAlign: "center", marginTop: 5 }]}>
              Unlock full scan history, price alerts, and watchlist sync.
            </Text>
          </View>

          {/* Email input */}
          <TextInput
            value={authEmail}
            onChangeText={(t) => { setAuthEmail(t); setAuthError(""); }}
            placeholder="you@example.com"
            placeholderTextColor="rgba(255,255,255,0.28)"
            style={styles.authInput}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoFocus
          />

          {authError ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
              <Ionicons name="alert-circle-outline" size={14} color="rgba(255,100,100,0.9)" />
              <Text style={{ color: "rgba(255,100,100,0.9)", fontSize: 12, fontWeight: "700" }}>{authError}</Text>
            </View>
          ) : null}

          <Pressable
            disabled={authSending}
            onPress={() => {
              hapticSelect();
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authEmail.trim())) {
                setAuthError("Enter a valid email address");
                return;
              }
              setAuthError("");
              setAuthStep("password");
            }}
            style={[styles.modalPrimary, { marginTop: 14, opacity: authSending ? 0.65 : 1 }]}
          >
            <Text style={styles.modalPrimaryText}>Continue</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              hapticSelect();
              setAuthEmail(""); setAuthOtp("");
              setAuthError(""); setAuthStep("email");
              setAuthModalOpen(false);
            }}
            style={[styles.modalSecondary, { marginTop: 8 }]}
          >
            <Text style={styles.modalSecondaryText}>Cancel</Text>
          </Pressable>
        </>
      ) : (
        <>
          {/* Back */}
          <Pressable
            onPress={() => { setAuthStep("email"); setAuthOtp(""); setAuthError(""); setAuthIsRegister(false); }}
            style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 18 }}
          >
            <Ionicons name="chevron-back" size={16} color="rgba(255,255,255,0.45)" />
            <Text style={{ color: "rgba(255,255,255,0.45)", fontWeight: "700", fontSize: 13 }}>Back</Text>
          </Pressable>

          {/* Header */}
          <View style={{ alignItems: "center", marginBottom: 20 }}>
            <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
              <Ionicons name={authIsRegister ? "person-add-outline" : "shield-checkmark-outline"} size={24} color="white" />
            </View>
            <Text style={styles.modalTitle}>{authIsRegister ? "Create account" : "Welcome back"}</Text>
            <Text style={[styles.modalDesc, { textAlign: "center", marginTop: 5 }]}>
              {authIsRegister ? `Creating account for\n${authEmail}` : `Signing in as\n${authEmail}`}
            </Text>
          </View>

          {/* Password input — red border on auth error */}
          <View style={{ position: "relative" }}>
            <TextInput
              value={authOtp}
              onChangeText={(t) => {
                setAuthOtp(t);
                setAuthError("");
                setAuthOtpShort(t.length < 6);
              }}
              placeholder="Password"
              placeholderTextColor="rgba(255,255,255,0.28)"
              style={[
                styles.authInput,
                { paddingRight: 48 },
                authError ? { borderColor: "rgba(255,70,70,0.70)", borderWidth: 1.5 } : {},
              ]}
              secureTextEntry={!authPwVisible}
              autoFocus
            />
            <Pressable
              onPress={() => setAuthPwVisible((v) => !v)}
              style={{ position: "absolute", right: 14, top: 0, bottom: 0, justifyContent: "center" }}
            >
              <Ionicons name={authPwVisible ? "eye-off-outline" : "eye-outline"} size={18} color="rgba(255,255,255,0.4)" />
            </Pressable>
          </View>

          {authError ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
              <Ionicons name="alert-circle-outline" size={14} color="rgba(255,100,100,0.9)" />
              <Text style={{ color: "rgba(255,100,100,0.9)", fontSize: 12, fontWeight: "700" }}>{authError}</Text>
            </View>
          ) : null}

          <RNAnimated.View style={{ opacity: authBtnPulse }}>
          <Pressable
            disabled={authSending || authOtp.length < 6}
            onPress={async () => {
              hapticSelect();
              if (authOtp.length < 6) { setAuthError("Password must be at least 6 characters"); return; }
              setAuthSending(true);
              setAuthError("");
              try {
                const endpoint = authIsRegister ? "/api/auth/register" : "/api/auth/login";
                const body = authIsRegister
                  ? { email: authEmail.trim(), password: authOtp }
                  : { email: authEmail.trim(), password: authOtp };
                const res = await fetch(
                  `${API_URL.replace(/\/+$/, "")}${endpoint}`,
                  { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
                );
                const data: any = await res.json();
                if (!res.ok) {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                  if (data?.error === "email_taken") {
                    setAuthError("Email already in use — sign in instead");
                    setAuthIsRegister(false);
                  } else if (data?.error === "invalid_credentials") {
                    setAuthError("Wrong password. New here? Create an account below.");
                  } else {
                    setAuthError(data?.error || "Something went wrong");
                  }
                  return;
                }
                // Success
                _authJwt = data.token;
                await AsyncStorage.setItem("evan_jwt_v1", data.token);
                if (data.userId) setUserId(data.userId);
                setIsSignedIn(true);

                // ── Data bridge: guest → user ───────────────────────────────
                if (data.userId && data.token) {
                  if (authIsRegister && plFlips.length > 0) {
                    // NEW account: push all local guest flips to the user's server record
                    setSavedToast("Syncing your intelligence…");
                    const token = data.token;
                    const uid   = data.userId;
                    ;(async () => {
                      for (const flip of [...plFlips].reverse()) { // oldest first
                        try {
                          await fetch(`${API_URL.replace(/\/+$/, "")}/api/pl/record`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                            body: JSON.stringify({ userId: uid, flip }),
                          });
                        } catch { /* non-fatal */ }
                      }
                    })().catch(() => {});
                  } else if (!authIsRegister) {
                    // RETURNING user: fetch their server flips and merge in
                    fetch(`${API_URL.replace(/\/+$/, "")}/api/pl/flips/${data.userId}`, {
                      headers: { "Authorization": `Bearer ${data.token}` },
                    }).then((r) => r.json()).then((d) => {
                      if (Array.isArray(d?.flips) && d.flips.length) {
                        setPlFlips((prev: PLFlip[]) => {
                          const existingIds = new Set(prev.map((f) => f.id));
                          const fresh = d.flips.filter((f: any) => !existingIds.has(f.id));
                          if (!fresh.length) return prev;
                          return [...fresh, ...prev].sort(
                            (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()
                          );
                        });
                      }
                    }).catch(() => {});
                  }
                }

                setAuthStep("email"); setAuthEmail(""); setAuthOtp("");
                setAuthError(""); setAuthSending(false); setAuthPwVisible(false); setAuthIsRegister(false);
                setAuthOtpShort(true);
                setAuthModalOpen(false);
                setSavedToast(authIsRegister ? "Account created ✓" : "Signed in ✓");
              } catch (_e: any) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
                setAuthError("Network error — check your connection");
              } finally {
                setAuthSending(false);
              }
            }}
            style={[styles.modalPrimary, { marginTop: 14 }]}
          >
            <Text style={styles.modalPrimaryText}>
              {authSending ? (authIsRegister ? "Creating…" : "Signing in…") : (authIsRegister ? "Create account" : "Sign in")}
            </Text>
          </Pressable>
          </RNAnimated.View>

          <Pressable
            onPress={() => { hapticSelect(); setAuthIsRegister((v) => !v); setAuthOtp(""); setAuthError(""); setAuthOtpShort(true); }}
            style={[styles.modalSecondary, { marginTop: 8 }]}
          >
            <Text style={styles.modalSecondaryText}>
              {authIsRegister ? "Already have an account? Sign in" : "New here? Create account"}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  </View>
  </KeyboardAvoidingView>
</Modal>
{/* NEGOTIATION COACH DRAWER */}
<NegotiationCoach
  visible={negotiationOpen}
  context={{
    itemName:    activeResult?.itemName ?? null,
    listingPrice: activeResult?.scannedPrice ?? activeResult?.price ?? null,
    marketMedian: activeResult?.avgMarket ?? null,
    dealVerdict:  activeResult?.buyVerdict ?? null,
    itemCategory: activeResult?.itemCategory ?? null,
  }}
  apiBase={resolvedApiBase || SAFE_API_BASE}
  onClose={() => setNegotiationOpen(false)}
/>

{/* SHARE CARD */}
<ShareCard
  visible={shareCardOpen}
  data={{
    itemName:     activeResult?.itemName ?? null,
    store:        activeResult?.store ?? null,
    price:        activeResult?.price ?? null,
    scannedPrice: activeResult?.scannedPrice ?? null,
    savedAmount:  activeResult?.savedAmount ?? null,
    cheaperPct:   activeResult?.cheaperPct ?? null,
    // Tweak 3: Evidence pack — identification basis for the "Carfax" share line
    visionQuery:  activeResult?.visionQuery ?? null,
    evidenceSignals: (() => {
      const sigs: string[] = [];
      if (activeResult?.authenticityIntel?.topSignal) sigs.push(activeResult.authenticityIntel.topSignal);
      if (activeResult?.trendIntel?.buyAdvice) sigs.push(activeResult.trendIntel.buyAdvice);
      if (activeResult?.seasonalFlip?.topSignal) sigs.push(activeResult.seasonalFlip.topSignal);
      return sigs.length ? sigs : null;
    })(),
  }}
  onClose={() => setShareCardOpen(false)}
/>

{/* IMAGE ZOOM MODAL */}
{zoomUri ? (
  <Modal
    visible={!!zoomUri}
    transparent
    animationType="fade"
    onRequestClose={() => setZoomUri(null)}
  >
    <Pressable
      style={{
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.25)",
        justifyContent: "center",
        alignItems: "center",
      }}
      onPress={() => setZoomUri(null)}
    >
      <RNAnimated.View
        style={{
          width: "92%",
          aspectRatio: 1,
          transform: [
            {
              scale: zoomAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.92, 1],
              }),
            },
          ],
          opacity: zoomAnim,
        }}
      >
        <Image
          source={{ uri: zoomUri }}
          style={{ width: "100%", height: "100%", borderRadius: 18 }}
          resizeMode="contain"
        />
        <View
          style={{
            position: "absolute",
            bottom: 14,
            left: 0,
            right: 0,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>
            tap anywhere to exit
          </Text>
        </View>
      </RNAnimated.View>
    </Pressable>
  </Modal>
) : null}

{/* welcome back modal removed */}

{/* Premium top-anchored toast — glass-dark capsule, pure opacity fade.
    The prior version sat at bottom: 110 with a white background, a 0.96→1
    scale on entry, and never auto-dismissed (50+ direct setSavedToast()
    callers were never wired to the animation pipeline). Now: fixed top,
    glassy/dark, opacity-only, auto-dismisses ~1.4s after the toast text
    changes. Effect-driven dismiss lives at the savedToast useEffect site
    further up the file. */}
{Boolean(savedToast) && (
  <RNAnimated.View
    pointerEvents="none"
    style={{
      position: "absolute",
      top: (IOS ? 54 : 32),
      alignSelf: "center",
      paddingHorizontal: 18,
      paddingVertical: 11,
      borderRadius: 999,
      backgroundColor: "rgba(18,18,20,0.92)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(255,255,255,0.14)",
      shadowColor: "#000",
      shadowOpacity: 0.45,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
      opacity: toastAnim,
      zIndex: 999999,
      elevation: 40,
      maxWidth: "82%",
    }}
  >
    <Text
      allowFontScaling={false}
      numberOfLines={1}
      style={{
        color: "rgba(255,255,255,0.96)",
        fontWeight: "800",
        fontSize: 13,
        letterSpacing: 0.2,
        textAlign: "center",
      }}
    >
      {savedToast}
    </Text>
  </RNAnimated.View>
)}

{!!previewImageUri && (
<Modal
  visible={!!previewImageUri}
  animationType="fade"
  presentationStyle="overFullScreen"
  transparent
  onRequestClose={closeHistoryPreview}
>
    <Pressable
      style={{
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.25)",
        justifyContent: "center",
        alignItems: "center",
      }}
      onPress={closeHistoryPreview}
    >
      <RNAnimated.Image
        source={{ uri: previewImageUri }}
        resizeMode="contain"
        style={{
          width: "90%",
          height: "70%",
          transform: [
            {
              scale: previewAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.95, 1],
              }),
            },
          ],
          opacity: previewAnim,
        }}
      />
      <RNAnimated.Text
        style={{
          marginTop: 20,
          color: "rgba(255,255,255,0.7)",
          fontSize: 13,
          letterSpacing: 0.5,
          opacity: previewAnim,
        }}
      >
        tap anywhere to exit
      </RNAnimated.Text>
    </Pressable>
  </Modal>
)}

{(() => {

  // 🔥 MASTER RULE:
  // Tab bar ONLY disappears for splash OR full image preview
  // (keep tabs visible even if `photo` is set, unless you're literally in the camera photo-preview)
const tabBarVisible =
  !showSplash &&
  !previewImageUri &&
  tab !== "results" &&
  !(tab === "camera" && !!photo);
  return (
<RNAnimated.View
  pointerEvents={tabBarVisible ? "auto" : "none"}
style={[
  styles.tabBar,
  {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: TAB_BAR_BOTTOM,
    zIndex: 99999,
    elevation: 99999,

    // Liquid Glass shadow — deep, diffused
    shadowColor: "#000",
    shadowOpacity: IOS ? 0.40 : 0.28,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 14 },
  },
  {
    opacity: tabBarVisible ? 1 : 0,
    transform: [
      { scale: tabBarVisible ? 1 : 0.96 },
      { translateY: showSplash ? 8 : 0 },
    ],
  },
]}
>
      {/* Frosted glass backdrop */}
      {IOS ? (
        <BlurView
          intensity={40}
          tint="dark"
          style={[StyleSheet.absoluteFillObject, { borderRadius: 26 }]}
        />
      ) : null}
      {/* Specular top edge */}
      <View pointerEvents="none" style={{
        position: "absolute",
        top: 0,
        left: 24,
        right: 24,
        height: StyleSheet.hairlineWidth,
        backgroundColor: "rgba(255,255,255,0.22)",
        borderRadius: 999,
      }} />

      <TabButton
        active={tab === "history"}
        icon="time-sharp"
        onPress={() => goTab("history")}
      />

      <TabButton
        active={tab === "watchlist"}
        icon={watchlist && watchlist.length > 0 ? "heart" : "heart-outline"}
        badge={dropCount}
        onPress={() => {
          hapticSelect();
          setDropCount(0);
          goTab("watchlist");
        }}
      />

      <TabButton
        active={tab === "camera"}
        icon="camera-sharp"
        onPress={() => goTab("camera")}
      />

      <TabButton
        active={tab === "profile"}
        icon="settings-sharp"
        dot={plBadge}
        onPress={() => goTab("profile")}
      />
    </RNAnimated.View>
  );
})()}

{/* FREE SCANS INFO MODAL */}
<Modal
  visible={freePassInfoOpen}
  animationType="fade"
  presentationStyle="overFullScreen"
  transparent
  onRequestClose={() => setFreePassInfoOpen(false)}
>
  {Platform.OS === "ios" ? (
    <View style={{ flex: 1 }}>
      <View style={styles.modalCard}>
        <Text style={styles.modalTitle}>Free scans</Text>
        <Text style={styles.modalDesc}>
          {`You get ${FREE_SCAN_LIMIT_FALLBACK} free scans per day.${
            scanResetAt
              ? `\nResets at ${new Date(scanResetAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
              : ""
          }\nUpgrade to Pro for unlimited scans anytime.`}
        </Text>

        <Pressable
          style={styles.modalPrimary}
          onPress={() => {
            hapticSelect();
            setFreePassInfoOpen(false);
            setProfileModal("subscription");
          }}
        >
          <Text style={styles.modalPrimaryText}>
            Go Pro — ${PRO_MONTHLY_PRICE.toFixed(2)}/mo
          </Text>
        </Pressable>

        <Pressable
          style={styles.modalSecondary}
          onPress={() => setFreePassInfoOpen(false)}
        >
          <Text style={styles.modalSecondaryText}>Got it</Text>
        </Pressable>
      </View>
    </View>
  ) : (
    <Pressable
      style={styles.modalBackdrop}
      onPress={() => setFreePassInfoOpen(false)}
    >
      <Pressable style={styles.modalCard} onPress={() => {}}>
        <Text style={styles.modalTitle}>Free scans</Text>
        <Text style={styles.modalDesc}>
          {`You get ${FREE_SCAN_LIMIT_SAFE} free scans per day.\nUpgrade to Pro for unlimited scans anytime.`}
        </Text>

        <Pressable
          style={styles.modalPrimary}
          onPress={() => {
            hapticSelect();
            setFreePassInfoOpen(false);
            setProfileModal("subscription");
          }}
        >
          <Text style={styles.modalPrimaryText}>
            Go Pro — ${PRO_MONTHLY_PRICE.toFixed(2)}/mo
          </Text>
        </Pressable>

        <Pressable
          style={styles.modalSecondary}
          onPress={() => setFreePassInfoOpen(false)}
        >
          <Text style={styles.modalSecondaryText}>Got it</Text>
        </Pressable>
      </Pressable>
    </Pressable>
  )}
</Modal>

{/* ✅ SPLASH INFO MODAL */}
<Modal
  visible={splashInfoOpen}
  animationType="fade"
  presentationStyle="overFullScreen"
  transparent
  onRequestClose={() => setSplashInfoOpen(false)}
>
  <View style={styles.modalBackdrop}>
    <View style={styles.modalCard}>
      <View style={styles.modalTopRow}>
        <Text style={styles.modalTitle}>Evan AI</Text>
        <Pressable
          onPress={() => {
            hapticSelect();
            setSplashInfoOpen(false);
          }}
          style={styles.backPill}
        >
          <Ionicons name="close" size={16} color="white" />
          <Text style={styles.backText}>Close</Text>
        </Pressable>
      </View>
      <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.modalDesc}>
          Evan AI scans items and finds potentially cheaper matches.
        </Text>
        <Text style={styles.modalDesc}>• No ads</Text>
        <Text style={styles.modalDesc}>• Honest confidence scoring</Text>
        <Text style={styles.modalDesc}>• History stored locally</Text>
      </ScrollView>
      <Pressable
        style={styles.modalPrimary}
        onPress={() => {
          hapticSelect();
          setSplashInfoOpen(false);
        }}
      >
        <Text style={styles.modalPrimaryText}>Got it</Text>
      </Pressable>
    </View>
  </View>
 </Modal>
{/* PROFILE MODAL: BILLIONAIRE HUB */}
<Modal
  visible={profileModal === "billion"}
  animationType="fade"
  presentationStyle="overFullScreen"
  transparent
  onRequestClose={() => setProfileModal(null)}
>
  <View style={styles.modalBackdrop}>
    <View style={styles.modalCard}>
      <View style={styles.modalTopRow}>
        <Text style={styles.modalTitle}>Billionaire features</Text>
        <Pressable onPress={() => { hapticSelect?.(); setProfileModal(null); }} style={styles.backPill}>
          <Ionicons name="close" size={16} color="white" />
          <Text style={styles.backText}>Close</Text>
        </Pressable>
      </View>
      <ScrollView style={{ maxHeight: 560 }} showsVerticalScrollIndicator={false}>
<Text style={styles.modalDesc}>
  Local-first power tools. Seller mode, inventory, export/import, queue tools, referrals, and intelligence controls.
</Text>
        {/* Seller Mode toggle */}
        <Pressable
          onPress={async () => {
            hapticSelect?.();
            setSellerMode((p) => {
              const next = !p;
              AsyncStorage.setItem(SELLER_KEY, next ? "1" : "0");
              return next;
            });
            setSavedToast?.("Seller mode toggled");
          }}
          style={styles.profileBtn}
        >
          <View style={styles.inlineRow}>
            <Ionicons name="pricetag-outline" size={18} color="white" />
            <Text style={styles.profileBtnText}>Seller mode: {sellerMode ? "ON" : "OFF"}</Text>
          </View>
          <Text style={styles.savingsSub}>Auto listing title · price · description · copy tools</Text>
        </Pressable>
        {/* Batch scan */}
        <Pressable
          onPress={() => { hapticSelect?.(); setBatchOpen(true); }}
          style={styles.profileBtn}
        >
          <View style={styles.inlineRow}>
            <Ionicons name="layers-outline" size={18} color="white" />
            <Text style={styles.profileBtnText}>Multi-item scan</Text>
          </View>
<Text style={styles.savingsSub}>Queue photos → load the next item into scan preview</Text>
        </Pressable>
        {/* Inventory */}
        <Pressable
          onPress={() => { hapticSelect?.(); setInventoryOpen(true); }}
          style={styles.profileBtn}
        >
          <View style={styles.inlineRow}>
            <Ionicons name="cube-outline" size={18} color="white" />
            <Text style={styles.profileBtnText}>Inventory</Text>
          </View>
          <Text style={styles.savingsSub}>Track flips · quantities · resale estimates · export</Text>
        </Pressable>
        {/* Cloud export/import */}
        <Pressable
          onPress={async () => {
            hapticSelect?.();
const snapshot = {
  v: 1,
  t: Date.now(),
  intelState,
  watchlist,
  inventory,
  sellerMode,
  installId,
  referral: typeof refState !== "undefined" ? refState : null,
};
            const json = await exportCloudSnapshot(snapshot);
            if (json) {
              await Clipboard.setStringAsync(json);
              setSavedToast?.("Cloud snapshot copied");
            } else {
              setSavedToast?.("Cloud export failed");
            }
          }}
          style={styles.profileBtn}
        >
          <View style={styles.inlineRow}>
            <Ionicons name="cloud-upload-outline" size={18} color="white" />
            <Text style={styles.profileBtnText}>Cloud export</Text>
          </View>
          <Text style={styles.savingsSub}>Copies a JSON snapshot to clipboard (safe backup)</Text>
        </Pressable>
        <Pressable
          onPress={async () => {
            hapticSelect?.();
            setCloudImportOpen(true);
          }}
          style={styles.profileBtn}
        >
          <View style={styles.inlineRow}>
            <Ionicons name="cloud-download-outline" size={18} color="white" />
            <Text style={styles.profileBtnText}>Cloud import</Text>
          </View>
          <Text style={styles.savingsSub}>Paste snapshot JSON → restore watchlist + intel + inventory</Text>
        </Pressable>

<Pressable
  onPress={async () => {
    hapticSelect?.();

    const code =
      (typeof refState !== "undefined" && refState?.code) ||
      effectiveReferralCode ||
      buildReferralCode(installId) ||
      "EVANAI";

    const _earned =
      (typeof refState !== "undefined" && Number(refState?.earned || 0)) || 0;

    const msg =
      `Evan AI referral: ${code}\n` +
      `Download + use this code to unlock ${REF_REWARD_FREE_SCANS} extra free scans.\n` +
      `Built for resale intelligence.`;

    try {
      await Share.share({ message: msg });
      setSavedToast?.("Referral shared");
    } catch {
      setSavedToast?.("Couldn’t share referral");
    }
  }}
  style={styles.profileBtn}
>
  <View style={styles.inlineRow}>
    <Ionicons name="gift-outline" size={18} color="white" />
    <Text style={styles.profileBtnText}>Referral rewards</Text>
  </View>
  <Text style={styles.savingsSub}>
    Code: {((typeof refState !== "undefined" && refState?.code) || effectiveReferralCode || buildReferralCode(installId) || "EVANAI")} · earned: {((typeof refState !== "undefined" && Number(refState?.earned || 0)) || 0)}
  </Text>
</Pressable>

<Text style={styles.modalFoot}>
  Seller mode, inventory, cloud tools, and referrals are user-facing. Ranking and prediction enhance results when available.
</Text>
      </ScrollView>
    </View>
  </View>
</Modal>
{/* PROFILE MODAL: INTELLIGENCE */}
<Modal
  visible={profileModal === "intelligence"}
  animationType="fade"
  presentationStyle="overFullScreen"
  transparent
  onRequestClose={() => setProfileModal(null)}
>
  <View style={styles.modalBackdrop}>
    <View style={styles.modalCard}>
      <View style={styles.modalTopRow}>
        <Text style={styles.modalTitle}>Evan AI Intelligence</Text>
        <Pressable
          onPress={() => {
            hapticSelect?.();
            setProfileModal(null);
          }}
          style={styles.backPill}
        >
          <Ionicons name="close" size={16} color="white" />
          <Text style={styles.backText}>Close</Text>
        </Pressable>
      </View>
      <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.modalDesc}>
          Retention loops + compounding + realtime watch checks + share growth — all local-first.
        </Text>
{(() => {
  const w = weeklyStats(intelState?.events || []);
  const amt = Number.isFinite(Number(w?.weeklySavings))
  ? Number(w.weeklySavings)
  : 0;
  return (
    <View style={chipStyle()}>
      <Text style={chipTextStyle()}>
        {`Week +$${amt.toFixed(2)}`}
      </Text>
    </View>
  );
})()}
        {/* Headline */}
        <View style={{ padding: 14, borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.06)", marginBottom: 12 }}>
          <Text style={{ color: "white", fontWeight: "900", fontSize: 15 }}>{weaponStats.headline}</Text>
          <View style={{ height: 10 }} />
          <View style={{ height: 10, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <View style={{ width: `${Math.round(weaponStats.progress * 100)}%`, height: "100%", backgroundColor: "rgba(255,255,255,0.20)" }} />
          </View>
          <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.72)", fontWeight: "800" }}>
            Goal: {weaponStats.today}/{weaponStats.goal}
          </Text>
        </View>
        {/* Stats */}
        <View style={{ gap: 6, marginBottom: 14 }}>
          {weaponStats.lines.map((t: string, i: number) => (
            <Text key={i} style={{ color: "rgba(255,255,255,0.78)", fontWeight: "700" }}>
              • {t}
            </Text>
          ))}
        </View>
        {/* Controls */}
        <Text style={[styles.modalTitle, { fontSize: 14, marginBottom: 8 }]}>Retention controls</Text>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "rgba(255,255,255,0.75)", fontWeight: "800", marginBottom: 6 }}>Daily scan goal</Text>
            <TextInput
              value={String(dailyGoal)}
              onChangeText={(t) => {
                const n = clampInt(t, 1, 25);
                setDailyGoal(n);
                AsyncStorage.setItem("EVAN_DAILY_GOAL_V1", String(n));
              }}
              placeholder="6"
              placeholderTextColor="rgba(255,255,255,0.35)"
              keyboardType="numeric"
              style={[styles.authInput, { marginBottom: 0 }]}
            />
          </View>
          <Pressable
            onPress={() => {
              hapticSelect?.();
              setAutoWatchEnabled((p) => {
                const next = !p;
                AsyncStorage.setItem("EVAN_AUTO_WATCH_V1", next ? "1" : "0");
                return next;
              });
            }}
            style={({ pressed }) => [
              {
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: autoWatchEnabled ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)",
                alignItems: "center",
                justifyContent: "center",
              },
              pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] },
            ]}
          >
            <Text style={{ color: "white", fontWeight: "900" }}>
              Auto watch: {autoWatchEnabled ? "ON" : "OFF"}
            </Text>
          </Pressable>
        </View>
        <Pressable
          onPress={() => {
            hapticSelect?.();
            doWatchCheck({ force: true, quiet: false });
            setSavedToast?.("Checking watchlist…");
          }}
          style={styles.modalPrimary}
        >
          <Text style={styles.modalPrimaryText}>Force re-check now</Text>
        </Pressable>
        <View style={{ height: 10 }} />
        <Pressable
          onPress={() => {
            hapticSelect?.();
            setProfileModal(null);
            goTab?.("camera");
          }}
          style={styles.modalSecondary}
        >
          <Text style={styles.modalSecondaryText}>Scan now</Text>
        </Pressable>
        <Text style={styles.modalFoot}>
          Share ref: {installId ? installId : "…"} · local-first tracking only
        </Text>
      </ScrollView>
    </View>
  </View>
</Modal>
<FlipCalculatorPanel
  visible={profitCalcOpen}
  buyPrice={activeResult?.scannedPrice ?? null}
  sellPrice={activeResult?.price ?? null}
  category={activeResult?.category ?? null}
  onClose={() => setProfitCalcOpen(false)}
  onSetPriceAlert={(targetPrice: number) => {
    // Add to watchlist if not already there, then set target
    if (!activeResult) return;
    const existingIdx = watchlist?.findIndex(
      (w: any) => w.query === (activeResult.query || activeResult.title)
    );
    if (existingIdx >= 0 && watchlist[existingIdx]) {
      // update existing watchlist item's target
      setWatchlist((prev: any[]) =>
        prev.map((x: any, i: number) =>
          i === existingIdx ? { ...x, targetPrice, updatedAt: Date.now() } : x
        )
      );
    } else {
      // Create new watchlist entry with target set
      const newItem = {
        id: `wl_${Date.now()}`,
        query: activeResult.query || activeResult.title || "",
        title: activeResult.title || activeResult.query || "",
        estValue: activeResult.price || null,
        scannedPrice: activeResult.scannedPrice || null,
        category: activeResult.category || null,
        targetPrice,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        history: [],
      };
      setWatchlist((prev: any[]) => [newItem, ...(prev || [])]);
    }
    setSavedToast(`Alert set for ${activeResult.title || "item"} at $${targetPrice}`);
    setProfitCalcOpen(false);
  }}
/>

{/* Feature 10: Flip Scanner Results Modal */}
<Modal
  visible={flipScanOpen}
  transparent
  animationType="fade"
  onRequestClose={() => setFlipScanOpen(false)}
>
  <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.88)", justifyContent: "flex-end" }}>
    <View style={{
      backgroundColor: "#111", borderTopLeftRadius: 24, borderTopRightRadius: 24,
      borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.10)",
      maxHeight: "88%", overflow: "hidden",
    }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", padding: 18, paddingBottom: 12, gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "white", fontWeight: "800", fontSize: 18 }}>Flip Scanner</Text>
          <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 2 }}>
            {zipCode ? `Near ${zipCode} · Local buy vs eBay sell` : "Local deals vs national sold prices"}
          </Text>
        </View>
        <Pressable onPress={() => setFlipScanOpen(false)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="close" size={16} color="rgba(255,255,255,0.7)" />
        </Pressable>
      </View>
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.08)", marginHorizontal: 18 }} />
      {/* Content */}
      {flipScanLoading ? (
        <View style={{ alignItems: "center", paddingVertical: 60, gap: 12 }}>
          <ActivityIndicator size="large" color="#50ff96" />
          <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>Scanning local market…</Text>
          <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>Comparing local vs eBay sold prices</Text>
        </View>
      ) : flipScanResults.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 60, gap: 10 }}>
          <Ionicons name="search-outline" size={36} color="rgba(255,255,255,0.2)" />
          <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>No strong opportunities found</Text>
          <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>Try a different category or check back later</Text>
        </View>
      ) : (
        <ScrollView style={{ marginTop: 6 }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          {flipScanResults.map((opp: any, i: number) => {
            const riskColor = opp.risk === "low" ? "#50ff96" : opp.risk === "medium" ? "#ffc800" : "#ff6060";
            return (
              <View key={i} style={{
                backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12,
                borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.08)",
                padding: 14, marginBottom: 10, gap: 8,
              }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "white", fontWeight: "700", fontSize: 14 }} numberOfLines={2}>{opp.query}</Text>
                    <Text style={{ color: "#50ff96", fontWeight: "800", fontSize: 12, marginTop: 2 }}>{opp.signal}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ color: "#50ff96", fontWeight: "900", fontSize: 20 }}>{opp.roi}%</Text>
                    <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 9 }}>ROI</Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {[
                    { label: "Buy local", value: `$${opp.localPrice}`, sub: `${opp.localCount} listings` },
                    { label: "Sell on eBay", value: `$${opp.nationalSoldMedian}`, sub: `${opp.nationalSoldCount} sold` },
                    { label: "Profit", value: `$${opp.profitAfterFees}`, sub: "after fees" },
                  ].map((col, j) => (
                    <View key={j} style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 8, padding: 8, gap: 2 }}>
                      <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 9 }}>{col.label}</Text>
                      <Text style={{ color: "white", fontWeight: "700", fontSize: 14 }}>{col.value}</Text>
                      <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 9 }}>{col.sub}</Text>
                    </View>
                  ))}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: `${riskColor}15`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
                    <Ionicons name="shield-outline" size={10} color={riskColor} />
                    <Text style={{ color: riskColor, fontSize: 10, fontWeight: "600" }}>{opp.risk} risk</Text>
                  </View>
                  <Pressable
                    onPress={() => { setFlipScanOpen(false); setProfitCalcOpen(true); }}
                    style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                  >
                    <Text style={{ color: "#50ff96", fontSize: 11, fontWeight: "600" }}>Calculate flip</Text>
                    <Ionicons name="calculator-outline" size={11} color="#50ff96" />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  </View>
</Modal>
</View>
  </RNAnimated.View>
  {/* ── Hot Deal Dopamine Layer (overlay, no layout shift) ────────────── */}
  <DopamineLayer hotDeal={brainHotSignal} />
  </GestureHandlerRootView>
);
}

// -------------------------
// EVAN AI — INTUITION LINE (FINAL FEATURE)
// -------------------------

const buildIntuitionLine = ({
  cheaperPct,
  flipPotential,
  totalMatches,
  confidence,
}: any) => {
  const pct = Number(cheaperPct || 0);
  const flip = Number(flipPotential || 0);
  const conf = Number(confidence || 0);

  if (pct >= 15 && conf > 0.7) {
    return "Strong deal — priced well below typical market.";
  }

  if (flip >= 70) {
    return "High resale potential — spread suggests a profitable flip.";
  }

  if (totalMatches <= 2) {
    return "Limited market data — verify condition before buying.";
  }

  if (pct <= 3) {
    return "Fair price — market looks stable right now.";
  }

  return "Smart match — pricing looks aligned with current market.";
};

// -------------------------
// PRICE NORMALIZATION (bulletproof)
// -------------------------
const parseMoney = (raw: any) => {
  if (raw == null) return NaN;
  if (typeof raw === "number")
    return Number.isFinite(raw) ? raw : NaN;
  const s0 = String(raw).trim();
  if (!s0) return NaN;
  let s = s0
    .replace(/[A-Za-z]/g, "")
    .replace(/[^\d.,\-]/g, "")
    .trim();
  if (!s) return NaN;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma !== -1 && (lastDot === -1 || lastComma > lastDot)) {
    s = s.replace(/\./g, "").replace(/,/g, ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
// -------------------------
// TITLE NORMALIZATION
// -------------------------
const normalizeTitle = (s: string = "") =>
  String(s)
    .toLowerCase()
    .replace(/wrap[\s-]*around/g, "wrap")
    .replace(/\b(sun[\s-]*glasses|sunglasses|shades|eyewear|frames?)\b/g, "glasses")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
// -------------------------
// TITLE SIMILARITY SCORE
// -------------------------
const titleSimilarity = (a = "", b = "") => {
  const STOP = new Set([
    "the",
    "a",
    "an",
    "and",
    "with",
    "for",
    "of",
    "to",
    "in",
    "on",
    "by",
    "new",
    "used",
    "seller",
    "marketplace",
    "vintage",
    "collectibles",
    "color",
  ]);

  const A = [...new Set(
    normalizeTitle(a)
      .split(" ")
      .filter((w) => w && !STOP.has(w))
  )];

  const B = [...new Set(
    normalizeTitle(b)
      .split(" ")
      .filter((w) => w && !STOP.has(w))
  )];

  if (!A.length || !B.length) return 0;

  let matches = 0;
  for (const w of A) {
    if (B.includes(w)) matches++;
  }

  const overlap = matches / Math.max(A.length, B.length);
  const containment = B.filter((w) => A.includes(w)).length / B.length;

  return Math.max(overlap, containment * 0.92);
};

const clampPrice = (n: any) => {
  const v = parseMoney(n);
  if (!Number.isFinite(v)) return NaN;
  if (v <= 0) return NaN;
  if (v > 1000000) return NaN;
  return Math.round(v * 100) / 100;
};
const calcTotalCost = (item: any) => {
  const p = clampPrice(item?.price);
  const ship = clampPrice(item?.shipping);
  if (!Number.isFinite(p)) return NaN;
  return Number.isFinite(ship)
    ? Math.round((p + ship) * 100) / 100
    : p;
};
// -------------------------
// COMPONENTS
// -------------------------
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function CountUpNumber({
  value = 0,
  prefix = "",
  suffix = "",
  duration = 650,
  style,
}: any) {
  const anim = useRef(new RNAnimated.Value(0)).current;
  const [txt, setTxt] = useState("0");

  useEffect(() => {
    const target = Number(value) || 0;
    anim.setValue(0);
    const id = anim.addListener(({ value: t }) => {
      const v = Math.round(target * t);
      setTxt(String(v));
    });
    RNAnimated.timing(anim, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      anim.removeListener(id);
    });
    return () => {
      anim.removeAllListeners();
    };
  }, [value, duration, anim]);
  return (
    <Text style={style}>
      {prefix}
      {txt}
      {suffix}
    </Text>
  );
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function IconButton({ icon, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconBtn,
        pressed && styles.iconBtnPressed,
      ]}
    >
      <Ionicons name={icon} size={26} color="white" />
    </Pressable>
  );
}
function TabButton({ active, icon, onPress, badge = 0, dot = false }) {
  const show = Number(badge) > 0;
  // Tab icons used to spring-scale 1.0 → 0.88 → 1.0 on every press. At a
  // 28pt icon size the rasterized-at-scale frames produced the pixelation /
  // jitter the user has been flagging on tab switches. Active-state styling
  // is now driven by static color/background swaps (no animation), and
  // press feedback is opacity-only via Pressable's `pressed` flag. Switch
  // is instant; nothing rasterizes between sizes.
  const dotAnim = useRef(new RNAnimated.Value(0.4)).current;
  const dotLoopRef = useRef<RNAnimated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!dot) {
      try { dotLoopRef.current?.stop(); } catch {}
      dotLoopRef.current = null;
      dotAnim.setValue(0.4);
      return;
    }
    const loop = RNAnimated.loop(RNAnimated.sequence([
      RNAnimated.timing(dotAnim, { toValue: 1.0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      RNAnimated.timing(dotAnim, { toValue: 0.4, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    dotLoopRef.current = loop;
    loop.start();
    return () => {
      try { loop.stop(); } catch {}
      dotLoopRef.current = null;
    };
  }, [dot, dotAnim]);

  return (
    <Pressable
      onPress={onPress}
      android_ripple={null}
      style={({ pressed }) => [
        { width: 60, height: 50, alignItems: "center", justifyContent: "center" },
        { opacity: pressed ? 0.72 : 1 },
      ]}
    >
      <View
        style={[
          styles.tabBtn,
          {
            backgroundColor: active ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0)",
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: active ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0)",
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={28}
          color={active ? "white" : "rgba(255,255,255,0.55)"}
        />
        {/* Active glow dot — static, no animation */}
        {active ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              bottom: 6,
              width: 4,
              height: 4,
              borderRadius: 2,
              backgroundColor: "rgba(255,255,255,0.85)",
            }}
          />
        ) : null}
      </View>
      {show && !dot ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 4,
            right: 10,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            paddingHorizontal: 5,
            backgroundColor: "rgba(255,255,255,0.92)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text style={{ color: TOK.C.bg, fontWeight: "900", fontSize: 11 }}>
            {Math.min(99, Number(badge))}
          </Text>
        </View>
      ) : null}
      {dot ? (
        <RNAnimated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 6,
            right: 14,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: "#50ff96",
            opacity: dotAnim,
          }}
        />
      ) : null}
    </Pressable>
  );
}
function PayPill({ icon, label }) {
  return (
    <View style={styles.payPill}>
      <Ionicons name={icon} size={18} color="white" />
      <Text style={styles.payPillText}>{label}</Text>
    </View>
  );
}
function _LogoChip({ uri, label, dim = false }) {
  return (
    <View style={[styles.logoChip, dim && { opacity: 0.35 }]}>
      <Image source={{ uri }} style={styles.logoImg} resizeMode="contain" />
      <Text style={styles.logoText}>{label}</Text>
    </View>
  );
}
function _BrandIntelligenceCard({ stats, intelEvents = [], onPress, ..._rest }: any) {
  if (!stats) return null;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          marginTop: 10,
          padding: 14,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
          backgroundColor: "rgba(255,255,255,0.06)",
          overflow: "hidden",
        },
        pressed && { opacity: 0.92, transform: [{ scale: 0.995 }] },
      ]}
    >
      <Text style={{ color: "rgba(255,255,255,0.92)", fontWeight: "900", letterSpacing: 0.5 }}>
        EVAN AI INTELLIGENCE
      </Text>
      <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.78)", fontWeight: "800" }}>
{stats.headline}  •  IQ {stats.iq}
      </Text>
      {/* progress bar */}
      <View
        style={{
          marginTop: 10,
          height: 10,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
          backgroundColor: "rgba(255,255,255,0.06)",
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${Math.round((stats.progress || 0) * 100)}%`,
            height: "100%",
            backgroundColor: "rgba(255,255,255,0.20)",
          }}
        />
      </View>
      {/* chips */}
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <View style={chipStyle()}>
          <Text style={chipTextStyle()}>Streak {stats.scanStreak ?? ""}</Text>
        </View>
        <View style={chipStyle()}>
          <Text style={chipTextStyle()}>Today {stats.today}/{stats.goal}</Text>
        </View>
<View style={chipStyle()}>
  <Text style={chipTextStyle()}>Tracked {stats.tracked}</Text>
</View>
{(() => {
  const w = weeklyStats(intelEvents || []);
  const amt = Number(w?.weeklySavings || 0);
  return (
    <View style={chipStyle()}>
      <Text style={chipTextStyle()}>
        {`Week +$${amt.toFixed(2)}`}
      </Text>
    </View>
  );
})()}
        <View style={chipStyle()}>
          <Text style={chipTextStyle()}>Drops {Math.min(99, Number(stats.dropCount || 0))}</Text>
        </View>
      </View>
      <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.60)", fontWeight: "800", fontSize: 12 }}>
        Tap to open Intelligence → controls + stats + realtime checks
      </Text>
<Text style={{ marginTop: 6, color: "rgba(255,255,255,0.52)", fontWeight: "800", fontSize: 12 }}>
  Local-first. No ads. No dark patterns.
</Text>
 </Pressable>
  );
}
function chipStyle() {
  return {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(0,0,0,0.22)",
  };
}

function chipTextStyle(): TextStyle {
  return {
    color: "rgba(255,255,255,0.88)",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.2,
  };
}

type ResultsLoadingPanelProps = {
  photoUri?: string | null;
  headline?: string;
  stage?: "idle" | "vision" | "market" | "analysis" | "collector";
  stageMeta?: string;
  onCancel?: () => void;
  onRetry?: () => void;
  showRetry?: boolean;
  retryReveal?: any;
  retryScale?: any;
  loadingDots?: string;
};

const _ResultsLoadingPanel = React.memo(function ResultsLoadingPanel({
  photoUri,
  headline,
  stage = "idle",
  stageMeta = "",
  onCancel,
  onRetry,
  showRetry,
  retryReveal,
  retryScale,
  loadingDots = ".",
}: ResultsLoadingPanelProps) {

  const [differentOpen, setDifferentOpen] = useState(false);

  const panelIn = useRef(new RNAnimated.Value(0)).current;
  const panelY = useRef(new RNAnimated.Value(16)).current;
  const differentAnim = useRef(new RNAnimated.Value(0)).current;
  
  const spinnerTurn = useRef(new RNAnimated.Value(0)).current;
const spinnerGlow = useRef(new RNAnimated.Value(0)).current;

useEffect(() => {
  spinnerTurn.setValue(0);
  spinnerGlow.setValue(0);

  const spinLoop = RNAnimated.loop(
    RNAnimated.timing(spinnerTurn, {
      toValue: 1,
      duration: 1050,
      easing: Easing.linear,
      useNativeDriver: true,
    })
  );

  const glowLoop = RNAnimated.loop(
    RNAnimated.sequence([
      RNAnimated.timing(spinnerGlow, {
        toValue: 1,
        duration: 900,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
      RNAnimated.timing(spinnerGlow, {
        toValue: 0,
        duration: 900,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    ])
  );

  spinLoop.start();
  glowLoop.start();

  return () => {
    try { spinLoop.stop(); } catch {}
    try { glowLoop.stop(); } catch {}
  };
}, [spinnerTurn, spinnerGlow]);

const _spinnerRotate = spinnerTurn.interpolate({
  inputRange: [0, 1],
  outputRange: ["0deg", "360deg"],
});

  useEffect(() => {
    panelIn.setValue(0);
    panelY.setValue(16);

    RNAnimated.parallel([
      RNAnimated.timing(panelIn, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      RNAnimated.spring(panelY, {
        toValue: 0,
        damping: 18,
        stiffness: 170,
        mass: 0.8,
        useNativeDriver: true,
      }),
    ]).start();
  }, [panelIn, panelY]);

  const toggleDifferent = () => {
    hapticSelect?.();
    const next = !differentOpen;
    setDifferentOpen(next);

    RNAnimated.timing(differentAnim, {
      toValue: next ? 1 : 0,
      duration: 180,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };

  return (
    <RNAnimated.View
      style={{
        opacity: panelIn,
        transform: [
          { translateY: panelY },
          {
            scale: panelIn.interpolate({
              inputRange: [0, 1],
              outputRange: [0.985, 1],
            }),
          },
        ],
      }}
    >
      <View
        style={[
          styles.resultsLoadingShell,
          {
            minHeight: 350,
            borderRadius: 30,
            overflow: "hidden",
            backgroundColor: "rgba(255,255,255,0.06)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
          },
        ]}
      >
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={{
              ...StyleSheet.absoluteFillObject,
              opacity: 0.18,
            }}
            blurRadius={18}
            resizeMode="cover"
          />
        ) : null}

        <BlurView
          intensity={30}
          tint="dark"
          style={StyleSheet.absoluteFillObject}
        />

        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 22,
            paddingBottom: 18,
            alignItems: "center",
          }}
        >

<RingSpinner size={90} />
          <Text
            style={{
              color: "white",
              fontWeight: "900",
              fontSize: 19,
              textAlign: "center",
            }}
          >
            {headline || "Finding the cheapest match"}
          </Text>


          <Text
            style={{
              marginTop: 10,
              color: "rgba(255,255,255,0.82)",
              fontWeight: "900",
              fontSize: 13,
              textAlign: "center",
              lineHeight: 18,
            }}
          >
            {stage === "vision"
              ? "🧠 Identifying item"
              : stage === "market"
              ? "🌐 Searching marketplaces"
              : stage === "analysis"
              ? "📊 Calculating deal quality"
              : stage === "collector"
              ? "🔥 Detecting hidden value"
              : "🔍 Finding the best result"}
            {loadingDots}
          </Text>

          <Text
            style={{
              marginTop: 6,
              color: "rgba(255,255,255,0.58)",
              fontWeight: "800",
              fontSize: 12,
              textAlign: "center",
            }}
          >
            {stageMeta || "Live market comparison in progress"}
          </Text>

          <View
            style={{
              flexDirection: "row",
              gap: 12,
              marginTop: 22,
              width: "100%",
            }}
          >
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [
                {
                  flex: 1,
                  minHeight: 54,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.14)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: 8,
                },
                pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] },
              ]}
            >
              <Ionicons name="close" size={20} color="white" />
              <Text style={{ color: "white", fontWeight: "900", fontSize: 15 }}>
                Cancel
              </Text>
            </Pressable>

            <RNAnimated.View
              style={{
                flex: 1,
                opacity: retryReveal || 1,
                transform: [
                  {
                    scale:
                      retryScale ||
                      1,
                  },
                ],
              }}
            >
              <Pressable
                onPress={showRetry ? onRetry : undefined}
                disabled={!showRetry}
                style={({ pressed }) => [
                  {
                    minHeight: 54,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(255,255,255,0.04)",
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "row",
                    gap: 8,
                    opacity: showRetry ? 1 : 0.45,
                  },
                  pressed && showRetry && { opacity: 0.92, transform: [{ scale: 0.99 }] },
                ]}
              >
                <Ionicons name="refresh" size={20} color="white" />
                <Text style={{ color: "white", fontWeight: "900", fontSize: 15 }}>
                  Retry
                </Text>
              </Pressable>
            </RNAnimated.View>
          </View>

          {/* EXACTLY WHERE YOU CIRCLED */}
          <Pressable
            onPress={toggleDifferent}
            style={({ pressed }) => [
              {
                marginTop: 16,
                alignSelf: "stretch",
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.05)",
              },
              pressed && { opacity: 0.92, transform: [{ scale: 0.995 }] },
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ color: "white", fontWeight: "900", fontSize: 14 }}>
                What makes Evan AI different?
              </Text>
              <Ionicons
                name={differentOpen ? "chevron-up" : "chevron-down"}
                size={18}
                color="rgba(255,255,255,0.82)"
              />
            </View>
          </Pressable>


<RNAnimated.View
  style={{
    alignSelf: "stretch",
    overflow: "hidden",
    opacity: differentAnim,
    maxHeight: differentAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 420],
    }),
    marginTop: differentOpen ? 10 : 0,
  }}
>
  <ScrollView
    nestedScrollEnabled
    bounces
    alwaysBounceVertical
    showsVerticalScrollIndicator
    style={{ maxHeight: 340 }}
    contentContainerStyle={{ paddingBottom: 14 }}
  >
    <View
      style={{
        padding: 14,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: "rgba(255,255,255,0.06)",
      }}
    >
      <Text style={{ color: "white", fontWeight: "900", marginBottom: 10 }}>
        Why Evan AI is better
      </Text>

      <Text
        style={{
          color: "rgba(255,255,255,0.80)",
          fontWeight: "800",
          lineHeight: 24,
          marginBottom: 14,
        }}
      >
        1. It identifies the actual item first — not just random visually similar listings — so your market search starts from a smarter query.
      </Text>

      <Text
        style={{
          color: "rgba(255,255,255,0.80)",
          fontWeight: "800",
          lineHeight: 24,
          marginBottom: 14,
        }}
      >
        2. It compares real marketplace results using the cheapest true match logic, including junk filtering and ranking — not fake “lowest price” noise.
      </Text>

      <Text
        style={{
          color: "rgba(255,255,255,0.80)",
          fontWeight: "800",
          lineHeight: 24,
          marginBottom: 14,
        }}
      >
        3. It turns a scan into a decision — confidence, savings, resale value, and profit signal — so users know whether to buy, wait, or flip.
      </Text>

      <Text
        style={{
          color: "rgba(255,255,255,0.60)",
          fontWeight: "800",
          fontSize: 12,
        }}
      >
        Scroll for more
      </Text>
    </View>
  </ScrollView>
</RNAnimated.View>
        </View>
      </View>
    </RNAnimated.View>
  );
});

// ✅ Premium rotating ring spinner (STABILIZED)
const RingSpinner = React.memo(function RingSpinner({
  size = 90,
}: {
  size?: number;
}) {
  const spin = useRef(new RNAnimated.Value(0)).current;
  const pulse = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    const spinLoop = RNAnimated.loop(
      RNAnimated.timing(spin, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    const pulseLoop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        RNAnimated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ])
    );

    spinLoop.start();
    pulseLoop.start();

    return () => {
      try { spinLoop.stop(); } catch {}
      try { pulseLoop.stop(); } catch {}
    };
  }, [spin, pulse]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1.04],
  });

  const glowOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.16, 0.30],
  });

  const coreOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 0.9],
  });

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <RNAnimated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1.5,
          borderColor: "rgba(255,255,255,0.10)",
          opacity: glowOpacity,
          transform: [{ scale: pulseScale }],
        }}
      />

      <RNAnimated.View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 3,
          borderColor: "rgba(255,255,255,0.08)",
          borderTopColor: "rgba(255,255,255,0.96)",
          borderRightColor: "rgba(255,255,255,0.38)",
          borderBottomColor: "rgba(255,255,255,0.12)",
          borderLeftColor: "rgba(255,255,255,0.08)",
          transform: [{ rotate }],
        }}
      />

      <RNAnimated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: Math.round(size * 0.2),
          height: Math.round(size * 0.2),
          borderRadius: Math.round(size * 0.1),
          backgroundColor: "rgba(255,255,255,0.78)",
          opacity: coreOpacity,
          shadowColor: "#fff",
          shadowOpacity: 0.18,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
    </View>
  );
});

// Liquid confidence bar
// Liquid confidence bar (STABILIZED)
const ConfidenceBar = React.memo(function ConfidenceBar({
  value = 0,
}: {
  value?: number;
}) {
  const clamped = Math.max(0, Math.min(1, Number(value) || 0));
  const pct = Math.round(clamped * 100);
  const progress = useRef(new RNAnimated.Value(0)).current;
  const sheen = useRef(new RNAnimated.Value(0)).current;
  const bubble1 = useRef(new RNAnimated.Value(0)).current;
  const bubble2 = useRef(new RNAnimated.Value(0)).current;
  const bubble3 = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    RNAnimated.timing(progress, {
      toValue: clamped,
      duration: 560,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [clamped, progress]);
  useEffect(() => {
    sheen.setValue(0);
    const loop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(sheen, {
          toValue: 1,
          duration: 1400,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        RNAnimated.timing(sheen, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [sheen]);
  useEffect(() => {
    const mkBubble = (v, delay) =>
      RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.delay(delay),
          RNAnimated.timing(v, {
            toValue: -6,
            duration: 820,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
          RNAnimated.timing(v, {
            toValue: 0,
            duration: 820,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
        ])
      );
    const l1 = mkBubble(bubble1, 0);
    const l2 = mkBubble(bubble2, 140);
    const l3 = mkBubble(bubble3, 260);
    l1.start();
    l2.start();
    l3.start();
    return () => {
      l1.stop();
      l2.stop();
      l3.stop();
    };
  }, [bubble1, bubble2, bubble3]);
  const fillW = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });
  const sheenX = sheen.interpolate({
    inputRange: [0, 1],
    outputRange: [-80, 260],
  });
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.confLabel}>Confidence</Text>
      <View style={styles.confOuter}>
        <RNAnimated.View style={[styles.confFill, { width: fillW }]}>
          <RNAnimated.View
            pointerEvents="none"
            style={[
              styles.confSheen,
              { transform: [{ translateX: sheenX }, { rotate: "18deg" }] },
            ]}
          />
          <RNAnimated.View
            pointerEvents="none"
            style={[
              styles.confBubble,
              { left: 18, top: 7, transform: [{ translateY: bubble1 }] },
            ]}
          />
          <RNAnimated.View
            pointerEvents="none"
            style={[
              styles.confBubble,
              { left: 44, top: 11, transform: [{ translateY: bubble2 }] },
            ]}
          />
          <RNAnimated.View
            pointerEvents="none"
            style={[
              styles.confBubble,
              { left: 76, top: 6, transform: [{ translateY: bubble3 }] },
            ]}
          />
        </RNAnimated.View>
        <View pointerEvents="none" style={styles.confTextWrap}>
          <Text style={styles.confText}>{pct}%</Text>
        </View>
      </View>
    </View>
  );
});

// ── LowballLoadingState ─────────────────────────────────────────────────────
// Premium loading state for the Lowball Generator sheet. Animated dots cycle
// "Making scripts" → "..." and a shimmer bar slides across to convey progress
// without faking percentages. Pure RNAnimated; no extra deps.
function LowballLoadingState() {
  const dotsAnim = useRef(new RNAnimated.Value(0)).current;
  const shimmer  = useRef(new RNAnimated.Value(0)).current;
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    // Dots cycle 1 → 2 → 3 → 1 …, 380ms each, via JS interval (worklet not
    // needed — purely a label tick).
    const id = setInterval(() => setDotCount((d) => (d % 3) + 1), 380);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const loop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(shimmer, { toValue: 1, duration: 1200, useNativeDriver: true }),
        RNAnimated.timing(shimmer, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    // Also drive a parallel opacity pulse on the label so it feels "alive".
    const opLoop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(dotsAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        RNAnimated.timing(dotsAnim, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    );
    opLoop.start();
    return () => { try { loop.stop(); } catch {} try { opLoop.stop(); } catch {} };
  }, [shimmer, dotsAnim]);

  const shimmerStyle = {
    opacity: shimmer.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0.65, 0] }),
    transform: [{
      translateX: shimmer.interpolate({ inputRange: [0, 1], outputRange: [-160, 320] }),
    }],
  };

  return (
    <View style={{ alignItems: "center", paddingVertical: 36 }}>
      <RNAnimated.Text
        style={{
          color: "rgba(255,255,255,0.78)",
          fontSize: 15,
          fontWeight: "700",
          letterSpacing: 0.4,
          marginBottom: 14,
          opacity: dotsAnim,
        }}
        allowFontScaling={false}
      >
        Making scripts{".".repeat(dotCount)}
      </RNAnimated.Text>

      {/* Shimmer track */}
      <View style={{
        width: 200, height: 4, borderRadius: 2,
        backgroundColor: "rgba(255,255,255,0.06)",
        overflow: "hidden",
        marginBottom: 6,
      }}>
        <RNAnimated.View
          style={[
            {
              position: "absolute",
              top: 0, bottom: 0,
              width: 80, borderRadius: 2,
              backgroundColor: "rgba(130,200,255,0.65)",
            },
            shimmerStyle as any,
          ]}
        />
      </View>
      <Text style={{ color: "rgba(255,255,255,0.30)", fontSize: 11, fontWeight: "600" }}>
        Pulling market context · this is fast
      </Text>
    </View>
  );
}

function useWatchlistMarketPolling({
  enabled,
  watchlist,
  setWatchlist,
}: {
  enabled: boolean;
  watchlist: any[];
  setWatchlist: any;
}) {
  useEffect(() => {
    if (!enabled) {
      console.log("WATCHLIST_AUTO_SEARCH_BLOCKED", { fn: "useWatchlistMarketPolling", reason: "enabled_false" });
      return;
    }
    if (!Array.isArray(watchlist) || !watchlist.length) return;
    if (typeof setWatchlist !== "function") return;

    let alive = true;

    const pollOnce = async () => {
      try {
        const lastRaw = await AsyncStorage.getItem(WATCH_POLL_LAST_KEY);
        const last = Number(lastRaw || 0);
        // Rate-limit bumped 60s → 5 min after live-log audit (2026-05-20):
        // /watch/poll fires SerpAPI lanes per saved item. 60s let every cold
        // app launch within a minute of last poll re-fire all lanes. 5 min
        // matches the new background interval and the server-side SERP cache
        // TTL, so most app opens read from cache instead of paying for
        // a fresh /watch/poll fan-out.
        if (Date.now() - last < 5 * 60_000) return;

        await AsyncStorage.setItem(WATCH_POLL_LAST_KEY, String(Date.now()));

        const res: any = await apiFetch("/watch/poll", {
          method: "POST",
          body: JSON.stringify({
            items: (watchlist || []).map((w) => ({
              id: w.id,
              query: w.title || w.query,
            })),
          }),
          timeoutMs: 9000,
          retries: 0,
        });

        if (!alive) return;

        const rawUpdates = Array.isArray(res?.items)
          ? res.items
          : Array.isArray(res?.updated)
          ? res.updated
          : [];

        const updates = rawUpdates
          .map((u: any) => ({
            id: u?.id,
            estValue: clampPrice(
              u?.estValue ?? u?.bestPrice ?? u?.state?.lastBestPrice
            ),
            marketLow: clampPrice(
              u?.marketLow ?? u?.consensus?.typicalLow
            ),
            marketHigh: clampPrice(
              u?.marketHigh ?? u?.consensus?.typicalHigh
            ),
            dropAmount: clampPrice(
              u?.dropAmount ?? u?.delta?.dropAmount
            ),

            dropCount: Number((u?.dropCount ?? u?.state?.dropCount) || 0),
            priceDropped: Boolean(u?.priceDropped ?? u?.delta?.priceDropped),
            lastChecked: Number((u?.lastChecked ?? u?.state?.lastCheckedAt) || Date.now()),
          }))
          .filter((u: any) => u?.id);


        if (!updates.length) return;

        setWatchlist((prev: any[]) =>
          (prev || []).map((w) => {
            const u = updates.find((x: any) => x.id === w.id);
            if (!u) return w;

            const nextEst = clampPrice(u.estValue);
            const nextPrice = Number.isFinite(nextEst) ? nextEst : w.estValue;
            const prevPrice = w.lastSeenPrice ?? nextPrice;
            const rawDrop = Number(prevPrice) - Number(nextPrice);
            const didDrop = rawDrop > 0;

            return {
              ...w,
              estValue: nextPrice,
              marketLow: clampPrice(u.marketLow) ?? w.marketLow,
              marketHigh: clampPrice(u.marketHigh) ?? w.marketHigh,
              lastSeenPrice: nextPrice,
              dropAmount: didDrop
                ? Math.round(Number.isFinite(Number(u.dropAmount)) ? Number(u.dropAmount) : rawDrop)
                : null,
              dropCount: Number.isFinite(Number(u.dropCount))
                ? Number(u.dropCount)
                : didDrop
                ? (w.dropCount || 0) + 1
                : (w.dropCount || 0),
              priceDropped: Boolean(u.priceDropped ?? didDrop),
              lastChecked: Number(u.lastChecked || Date.now()),
            };
          })
        );
      } catch {
        // silent — never crash UI
      }
    };

    pollOnce();
    // Bumped 90s → 5 min so background refresh of watched items spreads SerpAPI
    // cost across the hour instead of firing lanes every 90 seconds. Matches
    // the in-pollOnce rate-limit so multiple mounts of this hook (one global,
    // one inside the watched tab) coalesce to a single poll per window.
    const id = setInterval(pollOnce, 5 * 60_000);

    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [enabled, watchlist, setWatchlist]);
}

function useWatchlistRealtime(watchlist: any[] = [], setWatchlist: any, enabled = true) {
  const appActive = useAppActive();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (typeof setWatchlist !== "function") return;

    if (!enabled || !appActive || !Array.isArray(watchlist) || !watchlist.length) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (!enabled) {
        console.log("WATCHLIST_AUTO_SEARCH_BLOCKED", { fn: "useWatchlistRealtime", reason: "enabled_false" });
      }
      return;
    }

    if (intervalRef.current) return;

    intervalRef.current = setInterval(() => {
      setWatchlist((prev: any[]) =>
        (prev || []).map((item) => {
          if (!item?.estValue) return item;

          const base = Number(item.estValue) || 0;
          const drift = Math.max(
            -base * 0.01,
            Math.min(base * 0.01, base * (Math.random() * 0.02 - 0.01))
          );
          const next = Math.max(1, Math.round(base + drift));
          const prevPrice = item.lastSeenPrice ?? next;
          const dropAmount = prevPrice - next;
          const didDrop = dropAmount > 0;

          return {
            ...item,
            estValue: next,
            lastSeenPrice: next,
            dropAmount: didDrop ? Math.round(dropAmount) : null,
            dropCount: didDrop ? (item.dropCount || 0) + 1 : (item.dropCount || 0),
            priceDropped: didDrop,
            lastChecked: Date.now(),
          };
        })
      );
    }, 30000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, appActive, setWatchlist, Array.isArray(watchlist) ? watchlist.length : 0]);
}

// -------------------------
// WATCHLIST SCREEN (Apple-level)
// -------------------------

const _WatchlistScreen = React.memo(function WatchlistScreen({
  watchlist,
  setWatchlist,
  watchSearch,
  setWatchSearch,
  watchSort,
  setWatchSort,
  watchAddName,
  setWatchAddName,
  watchAddTarget,
  setWatchAddTarget,
  addManualWatch,
  removeWatch,
  money,
  calcSavings,
}: {
  watchlist?: any[];
  setWatchlist?: React.Dispatch<React.SetStateAction<any[]>>;
  watchSearch?: string;
  setWatchSearch?: React.Dispatch<React.SetStateAction<string>>;
  watchSort?: string;
  setWatchSort?: React.Dispatch<React.SetStateAction<string>>;
  watchAddName?: string;
  setWatchAddName?: React.Dispatch<React.SetStateAction<string>>;
  watchAddTarget?: string;
  setWatchAddTarget?: React.Dispatch<React.SetStateAction<string>>;
  addManualWatch?: () => void;
  removeWatch?: (id: string) => void;
  money?: (n: number) => string;
  calcSavings?: (item: any) => number;
}) {

const [selected, setSelected] = useState<any | null>(null);
const [targetHitToast, setTargetHitToast] = useState<string | null>(null);

// Manual refresh state for the "Find current price" button. Per-id so
// re-opening the modal for a different item shows the right state.
const [refreshingId, setRefreshingId] = useState<string | null>(null);
const [refreshError, setRefreshError]  = useState<string | null>(null);

const findCurrentPrice = useCallback(async (item: any) => {
  if (!item?.id || refreshingId) return;
  setRefreshError(null);
  setRefreshingId(item.id);
  try {
    const result = await runManualWatchPriceRefresh(item);
    if (!result.ok || !result.patch) {
      setRefreshError(result.error || "Couldn't fetch current price");
      return;
    }
    const patch = result.patch;
    if (typeof setWatchlist === "function") {
      setWatchlist((prev: any[]) =>
        (prev || []).map((w) => (w.id === item.id ? { ...w, ...patch } : w)),
      );
    }
    // Reflect the patch in the currently-open selection too, so the modal's
    // Estimated/Market values update without closing the sheet.
    setSelected((s: any) => (s && s.id === item.id ? { ...s, ...patch } : s));
  } catch (e: any) {
    setRefreshError(e?.message || "Network error");
  } finally {
    setRefreshingId(null);
  }
}, [refreshingId, setWatchlist]);

useEffect(() => {
  const hit = (watchlist || []).find(
    (x) =>
      x?.targetPrice &&
      x?.estValue &&
      Number(x.estValue) <= Number(x.targetPrice)
  );

  if (!hit) return;

  setTargetHitToast("Target hit");
  const id = setTimeout(() => setTargetHitToast(null), 2000);

  return () => clearTimeout(id);
}, [watchlist]);

// Auto-poll permanently OFF — see BILLION.WATCH_POLLING note above.
// Users explicitly refresh via "Find current price" in the detail modal.
// Both hooks left in place but disabled so legacy callers still type-check.
useWatchlistMarketPolling({
  enabled: false,
  watchlist: Array.isArray(watchlist) ? watchlist : [],
  setWatchlist,
});
useWatchlistRealtime(
  Array.isArray(watchlist) ? watchlist : [],
  setWatchlist,
  false
);

  const filtered = (watchlist || []).filter((x) => {
    const q = watchSearch.trim().toLowerCase();
    if (!q) return true;
    return String(x?.title || "")
      .toLowerCase()
      .includes(q);
  });
  const sorted = [...filtered].sort((a, b) => {
    if (watchSort === "price") {
      const pa = Number(a?.targetPrice);
      const pb = Number(b?.targetPrice);
      if (!isFinite(pa) && !isFinite(pb)) return 0;
      if (!isFinite(pa)) return 1;
      if (!isFinite(pb)) return -1;
      return pa - pb;
    }
    if (watchSort === "savings") {
      const sa = calcSavings(a);
      const sb = calcSavings(b);
      const va = isFinite(Number(sa)) ? Number(sa) : -1;
      const vb = isFinite(Number(sb)) ? Number(sb) : -1;
      return vb - va;
    }
    // recent
    return Number(b?.createdAt || 0) - Number(a?.createdAt || 0);
  });
  const openDetails = (item) => setSelected(item);
  const setTarget = (id, nextTarget) => {
    const t = Number(nextTarget);
    setWatchlist((prev) =>
      prev.map((x) =>
        x.id === id
          ? { ...x, targetPrice: isFinite(t) ? t : null, updatedAt: Date.now() }
          : x
      )
    );
  };
  return (
    <View style={styles.watchPage}>
{targetHitToast ? (
  <View
    style={{
      position: "absolute",
      top: 58,
      left: 18,
      right: 18,
      zIndex: 10,
      padding: 12,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.14)",
      backgroundColor: "rgba(20,20,20,0.85)",
    }}
  >
    <Text style={{ color: "white", fontWeight: "900", textAlign: "center" }}>
      {targetHitToast}
    </Text>
  </View>
) : null}
 <ScrollView
        contentContainerStyle={styles.watchInner}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.watchHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.watchTitle}>Watchlist</Text>
            <Text style={styles.watchSub}>
              Track targets. Buy only when the price makes sense.
            </Text>
          </View>
          <View style={styles.watchBadge}>
            <Ionicons name="bookmark" size={16} color="white" />
            <Text style={styles.watchBadgeText}>
              {String(watchlist?.length || 0)}
            </Text>
          </View>
        </View>
        {/* Add row */}
        <View style={styles.watchAddCard}>
          <Text style={styles.watchAddLabel}>Add a target</Text>
          <View style={styles.watchAddRow}>
            <View style={{ flex: 1 }}>
              <TextInput
                value={watchAddName}
                onChangeText={setWatchAddName}
                placeholder="Example: AirPods Pro 2"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={styles.watchAddInput}
                returnKeyType="done"
              />
            </View>
            <View style={styles.watchTargetPill}>
              <Text style={styles.watchTargetPrefix}>$</Text>
              <TextInput
                value={watchAddTarget}
                onChangeText={setWatchAddTarget}
                placeholder="Target"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={styles.watchTargetInput}
                keyboardType="numeric"
              />
            </View>
            <Pressable
              onPress={addManualWatch}
              style={({ pressed }) => [
                styles.watchAddBtn,
                pressed && styles.watchAddBtnPressed,
              ]}
            >
<Ionicons name="add" size={18} color={TOK.C.bg} />
              <Text style={styles.watchAddBtnText}>Add</Text>
            </Pressable>
          </View>
          <Text style={styles.watchAddHint}>
            Local-first. No ads. No dark patterns.
          </Text>
        </View>
        {/* Search */}
        <View style={styles.watchSearchCard}>
          <Ionicons name="search" size={18} color="rgba(255,255,255,0.75)" />
          <TextInput
            value={watchSearch}
            onChangeText={setWatchSearch}
            placeholder="Search your watchlist"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={styles.watchSearchInput}
          />
          {!!watchSearch && (
            <Pressable
              onPress={() => setWatchSearch("")}
              style={({ pressed }) => [
                styles.watchClearBtn,
                pressed && styles.watchClearBtnPressed,
              ]}
            >
              <Ionicons name="close" size={16} color="white" />
            </Pressable>
          )}
        </View>
        {/* Sort chips */}
        <View style={styles.watchChipRow}>
          {[
            { key: "recent", label: "Recent", icon: "time" },
            { key: "savings", label: "Savings", icon: "trending-up" },
            { key: "price", label: "Target", icon: "cash" },
          ].map((c) => {
            const active = watchSort === c.key;
            return (
              <Pressable
                key={c.key}
                onPress={() => setWatchSort(c.key)}
                style={({ pressed }) => [
                  styles.watchChip,
                  active && styles.watchChipActive,
                  pressed && styles.watchChipPressed,
                ]}
              >
                <Ionicons
                  name={c.icon as any}
                  size={14}
                  color={active ? "white" : "rgba(255,255,255,0.75)"}
                />
                <Text style={[styles.watchChipText, active && styles.watchChipTextActive]}>
                  {c.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {/* Empty */}
        {sorted.length === 0 ? (
          <View style={styles.watchEmptyCard}>
            <Text style={styles.watchEmptyTitle}>Nothing here yet.</Text>
            <Text style={styles.watchEmptyText}>
              Add an item above, or save a result from your next scan.
            </Text>
          </View>
        ) : (
          <View style={{ marginTop: 6 }}>
            {sorted.map((item) => {
              const savings = calcSavings(item);
              return (

<Pressable
  key={item.id}
  onPress={() => openDetails(item)}
  style={({ pressed }) => [
    styles.watchRow,
    item?.priceDropped && { borderColor: "rgba(76,255,136,0.45)" },
    item?.targetHit && { borderColor: "rgba(255,200,0,0.55)", borderWidth: 1.5 },
    pressed && styles.watchRowPressed,
  ]}
>
                  {item.thumbUri ? (
                    <Image source={{ uri: item.thumbUri }} style={styles.watchThumb} />
                  ) : (
                    <View style={styles.watchThumbFallback}>
                      <Ionicons name="image" size={18} color="rgba(255,255,255,0.55)" />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={[styles.watchRowTitle, { flex: 1 }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      {item.targetHit ? (
                        <View style={{ backgroundColor: "rgba(255,200,0,0.15)", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: "rgba(255,200,0,0.4)" }}>
                          <Text style={{ color: "#ffc800", fontSize: 10, fontWeight: "700" }}>TARGET HIT</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.watchMetaRow}>
                      <Text style={styles.watchMetaText}>
                        Target: <Text style={styles.watchMetaStrong}>{money(item.targetPrice)}</Text>
                      </Text>
                      <Text style={styles.watchMetaText}>
                        Est: <Text style={styles.watchMetaStrong}>{money(item.estValue)}</Text>
                      </Text>
                    </View>
                    <View style={styles.watchPillRow}>
{item.dropAmount ? (
<View style={{flexDirection:"row",gap:8}}>
<Text style={{color:"#4cff88",fontWeight:"900"}}>
↓ ${item.dropAmount}
</Text>
<Text style={{color:"white"}}>
{item.dropCount||0} drops
</Text>
</View>
):null}
<View style={styles.watchMiniPill}>
                        <Text style={styles.watchMiniLabel}>Market</Text>
                        <Text style={styles.watchMiniValue}>
                          {money(item.marketLow)}–{money(item.marketHigh)}
                        </Text>
                      </View>
                      <View style={styles.watchMiniPill}>
                        <Text style={styles.watchMiniLabel}>Potential</Text>
                        <Text style={styles.watchMiniValue}>
                          {savings == null ? "—" : money(savings)}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => removeWatch(item.id)}
                    style={({ pressed }) => [
                      styles.watchTrash,
                      pressed && styles.watchTrashPressed,
                    ]}
                  >
                    <Ionicons name="trash" size={18} color="rgba(255,255,255,0.85)" />
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
        )}
        <View style={{ height: 110 }} />
      </ScrollView>
      {/* Details modal */}
      <Modal visible={!!selected} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setSelected(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalTopRow}>
              <Text style={styles.modalTitle}>Watch target</Text>
              <Pressable style={styles.backPill} onPress={() => setSelected(null)}>
                <Ionicons name="close" size={16} color="white" />
                <Text style={styles.backText}>Close</Text>
              </Pressable>
            </View>
            <Text style={styles.modalDesc} numberOfLines={2}>
              {selected?.title || "Untitled"}
            </Text>
            <View style={styles.watchDetailGrid}>
              <View style={styles.watchDetailCard}>
                <Text style={styles.watchDetailLabel}>Target</Text>
                <Text style={styles.watchDetailValue}>{money(selected?.targetPrice)}</Text>
              </View>
              <View style={styles.watchDetailCard}>
                <Text style={styles.watchDetailLabel}>Estimated</Text>
                <Text style={styles.watchDetailValue}>{money(selected?.estValue)}</Text>
              </View>
              <View style={styles.watchDetailCard}>
                <Text style={styles.watchDetailLabel}>Market range</Text>
                <Text style={styles.watchDetailValue}>
                  {money(selected?.marketLow)}–{money(selected?.marketHigh)}
                </Text>
              </View>
              <View style={styles.watchDetailCard}>
                <Text style={styles.watchDetailLabel}>Potential</Text>
                <Text style={styles.watchDetailValue}>
                  {calcSavings(selected) == null ? "—" : money(calcSavings(selected))}
                </Text>
              </View>
            </View>
            {/* Manual "Find current price" — the ONLY path that hits
                /watch/poll. No auto-poll on app open, tab focus, or modal
                open. Disabled while in-flight to prevent double-tap spam.
                After a successful refresh, the Estimated/Market values
                above update in place (selected is patched inside
                findCurrentPrice). */}
            <Pressable
              onPress={() => findCurrentPrice(selected)}
              disabled={refreshingId === selected?.id}
              style={({ pressed }) => [
                {
                  marginTop: 4,
                  marginBottom: 4,
                  paddingVertical: 14,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: 8,
                  backgroundColor: refreshingId === selected?.id
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(76,255,136,0.10)",
                  borderWidth: 1,
                  borderColor: refreshingId === selected?.id
                    ? "rgba(255,255,255,0.10)"
                    : "rgba(76,255,136,0.32)",
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              {refreshingId === selected?.id ? (
                <>
                  <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
                  <Text style={{ color: "rgba(255,255,255,0.8)", fontWeight: "700", fontSize: 14 }}>
                    Checking current price…
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="search" size={15} color="#4cff88" />
                  <Text style={{ color: "#4cff88", fontWeight: "800", fontSize: 14, letterSpacing: 0.3 }}>
                    Find current price
                  </Text>
                </>
              )}
            </Pressable>
            {refreshError && refreshingId !== selected?.id ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4, marginBottom: 8 }}>
                <Ionicons name="alert-circle" size={13} color="rgba(255,140,140,0.85)" />
                <Text style={{ color: "rgba(255,140,140,0.85)", fontSize: 12, flex: 1 }}>
                  {refreshError}
                </Text>
                <Pressable
                  onPress={() => { setRefreshError(null); findCurrentPrice(selected); }}
                  hitSlop={8}
                  style={({ pressed }) => [{
                    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
                    backgroundColor: "rgba(255,140,140,0.12)",
                    opacity: pressed ? 0.6 : 1,
                  }]}
                >
                  <Text style={{ color: "rgba(255,180,180,0.95)", fontSize: 11, fontWeight: "800" }}>RETRY</Text>
                </Pressable>
              </View>
            ) : null}

            <Text style={styles.confLabel}>Update target</Text>
            <View style={styles.watchEditRow}>
              <Text style={styles.watchTargetPrefix}>$</Text>
              <TextInput
                defaultValue={selected?.targetPrice ? String(selected.targetPrice) : ""}
                placeholder="Enter target price"
                placeholderTextColor="rgba(255,255,255,0.35)"
                keyboardType="numeric"
                style={styles.watchEditInput}
                onEndEditing={(e) => setTarget(selected.id, e.nativeEvent.text)}
              />
            </View>
            <View style={styles.divider} />
            <Pressable
              onPress={() => {
                removeWatch(selected.id);
                setSelected(null);
              }}
              style={styles.modalSecondary}
            >
              <Text style={styles.modalSecondaryText}>Remove from Watchlist</Text>
            </Pressable>
            <Text style={styles.modalFoot}>
              Tip: Save scans into Watchlist so you can buy only when the deal is real.
            </Text>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
});
// ── Manual watch-price refresh ──────────────────────────────────────────────
// Replaces the auto-poll loop. Caller is the "Find current price" button —
// fires once per tap, returns the patched item so the UI can splice it into
// the list. Idempotent at the call site; pass `signal` to cancel.
//
// Logs (per spec): WATCH_PRICE_MANUAL_REFRESH_{START,SUCCESS,ERROR}.
async function runManualWatchPriceRefresh(
  item: { id: string; title?: string; query?: string },
  opts?: { signal?: AbortSignal },
): Promise<{
  ok: boolean;
  patch?: {
    estValue?: number | null;
    marketLow?: number | null;
    marketHigh?: number | null;
    lastSeenPrice?: number | null;
    dropAmount?: number | null;
    priceDropped?: boolean;
    lastChecked?: number;
  };
  error?: string;
}> {
  if (!item?.id) return { ok: false, error: "no_item_id" };
  const startedAt = Date.now();
  // Spec-required log name (TestFlight audit grep). The older
  // WATCH_PRICE_MANUAL_REFRESH_* lines are kept in parallel so existing
  // dashboards / log filters keep working.
  console.log("WATCHLIST_MANUAL_PRICE_REFRESH_START", { id: item.id, title: item.title || item.query });
  console.log("WATCH_PRICE_MANUAL_REFRESH_START", { id: item.id, title: item.title || item.query });
  try {
    const res: any = await apiFetch("/watch/poll", {
      method: "POST",
      body: JSON.stringify({
        items: [{ id: item.id, query: item.title || item.query }],
      }),
      timeoutMs: 12000,
      retries: 0,
      signal: opts?.signal,
    });
    const rawUpdates = Array.isArray(res?.items) ? res.items
      : Array.isArray(res?.updated) ? res.updated : [];
    const u = rawUpdates.find((x: any) => x?.id === item.id) || rawUpdates[0];
    if (!u) {
      console.log("WATCH_PRICE_MANUAL_REFRESH_ERROR", { id: item.id, reason: "no_match", ms: Date.now() - startedAt });
      return { ok: false, error: "no_match_in_response" };
    }
    const estValue   = clampPrice(u?.estValue   ?? u?.bestPrice            ?? u?.state?.lastBestPrice);
    const marketLow  = clampPrice(u?.marketLow  ?? u?.consensus?.typicalLow);
    const marketHigh = clampPrice(u?.marketHigh ?? u?.consensus?.typicalHigh);
    const dropAmount = clampPrice(u?.dropAmount ?? u?.delta?.dropAmount);
    console.log("WATCHLIST_MANUAL_PRICE_REFRESH_SUCCESS", {
      id: item.id, estValue, marketLow, marketHigh, ms: Date.now() - startedAt,
    });
    console.log("WATCH_PRICE_MANUAL_REFRESH_SUCCESS", {
      id: item.id, estValue, marketLow, marketHigh, ms: Date.now() - startedAt,
    });
    return {
      ok: true,
      patch: {
        estValue,
        marketLow,
        marketHigh,
        lastSeenPrice: estValue,
        dropAmount,
        priceDropped: Boolean(u?.priceDropped ?? u?.delta?.priceDropped),
        lastChecked: Date.now(),
      },
    };
  } catch (e: any) {
    console.log("WATCH_PRICE_MANUAL_REFRESH_ERROR", { id: item.id, error: e?.message || String(e), ms: Date.now() - startedAt });
    return { ok: false, error: e?.message || "refresh_failed" };
  }
}

// ===============================
// BILLIONAIRE FEATURE FLAGS (v1)
// local-first, production-safe
// ===============================
const BILLION = {
  RANKING_V2: true,
  // WATCH_POLLING disabled 2026-05-21 — auto-poll on mount + every 5 min was
  // burning SerpAPI lanes per saved item every time the app opened, every
  // tab focus, every settings open. The user now triggers "Find current
  // price" explicitly per item (see runManualWatchPriceRefresh below).
  // Flip back to true ONLY if you also rip out the manual button — never
  // have both running at once.
  WATCH_POLLING: false,
  MARKETPLACE_EXPAND: true,
  CLOUD_SYNC_V1: true, // export/import + optional API hook
  SOCIAL_HOOKS: true,
  REFERRALS_V1: true,
  INVENTORY_V1: true,
  SELLER_MODE_V1: true,
  MULTI_SCAN_V1: true,
  PRICE_PREDICT_V1: true,
};
const CLOUD_KEY = "EVAN_CLOUD_EXPORT_V1";
const _REF_KEY = "EVAN_REFERRAL_V1";
const INV_KEY = "EVAN_INVENTORY_V1";
const SELLER_KEY = "EVAN_SELLER_MODE_V1";
const BATCH_KEY = "EVAN_BATCH_QUEUE_V1";
const WATCH_POLL_LAST_KEY = "EVAN_WATCH_POLL_LAST_V1";
// “Free rewards” hook for referral (keeps it local until RevenueCat
const REF_REWARD_FREE_SCANS = 3;

// ✅ unify scan-limit naming (prevents crashes)
const FREE_SCAN_LIMIT_FALLBACK = 3;

const REFERRAL_CODE_POOL = [
  "EVAN7K3Q9M2A",
  "EVAN4T8N1X6P",
  "EVAN9J2R5C8D",
  "EVAN1P6W7H4K",
  "EVAN8D5L2V9Q",
  "EVAN3M7A1Z8S",
  "EVAN6X2F9B5R",
  "EVAN5Q8K3N1T",
  "EVAN2H9P6Y4J",
  "EVAN0R7C2W8L",
  "EVAN4V1S9D6X",
  "EVAN8N3T5Q2M",
  "EVAN1Z6J4R9P",
  "EVAN7B2X8H5C",
  "EVAN3K9M1V6Q",
  "EVAN6P4D7N2R",
  "EVAN9X1T3W8B",
  "EVAN2Q5L9J7S",
  "EVAN5H8C1P4X",
  "EVAN8R3V6M2T",
  "EVAN1N7Q4D9K",
  "EVAN7S2B5X8J",
  "EVAN3T9P1H6V",
  "EVAN6M4R8Q2C",
  "EVAN9D1K7N5W",
  "EVAN2X8S3J6P",
  "EVAN5V9T2C7H",
  "EVAN8Q1M6R4D",
  "EVAN1C7X9P2N",
  "EVAN7J3H5V8Q",
];
// optional cloud hook (won’t break if not supported)
const CLOUD_API_ENABLED = false; // flip true when your API supports it
const INTEL_KEY = "EVAN_INTELLIGENCE_V2";
// ===============================
// EVAN AI INTELLIGENCE ENGINE (v2)
// retention + compounding + realtime + sharing + branding
// ===============================
const DEFAULT_DAILY_GOAL = 5;
type IntelVerdict = "buy" | "fair" | "overpriced";
type IntelEventType = "scan" | "share" | "watch_add" | "watch_drop";
type IntelEvent = {
  id: string;
  type: IntelEventType;
  t: number;
  // scan
  confidence?: number;
  savings?: number;
  store?: string;
  category?: string;
  title?: string;
  verdict?: IntelVerdict;
  // share
  shareKind?: "scan" | "app";
};
type IntelState = {
  goal: number;
  events: IntelEvent[];
  streak: { lastDay: string | null; count: number };
};
const clamp01 = (n: any) => Math.max(0, Math.min(1, Number(n) || 0));
const dayKey = (t: number) => {
  const d = new Date(t);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const makeId = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`;
function emptyIntel(): IntelState {
  return {
    goal: DEFAULT_DAILY_GOAL,
    events: [],
    streak: { lastDay: null, count: 0 },
  };
}
async function loadIntel(): Promise<IntelState> {
  try {
    const raw = await AsyncStorage.getItem(INTEL_KEY);
    if (!raw) return emptyIntel();
    const parsed = JSON.parse(raw);
    // harden shape
    return {
      goal: Number(parsed?.goal) || DEFAULT_DAILY_GOAL,
      events: Array.isArray(parsed?.events) ? parsed.events : [],
      streak: {
        lastDay: parsed?.streak?.lastDay ?? null,
        count: Number(parsed?.streak?.count) || 0,
      },
    };
  } catch {
    return emptyIntel();
  }
}
async function saveIntel(data: IntelState) {
  try {
    await AsyncStorage.setItem(INTEL_KEY, JSON.stringify(data));
  } catch {}
}
function bumpStreak(intel: IntelState, now = Date.now()) {
  const today = dayKey(now);
  if (intel.streak.lastDay === today) return intel;
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const yesterday = dayKey(y.getTime());
  const nextCount = intel.streak.lastDay === yesterday ? intel.streak.count + 1 : 1;
  return {
    ...intel,
    streak: { lastDay: today, count: nextCount },
  };
}
function verdictFromPrices(local: any, low: any, high: any): IntelVerdict {
  const lp = safeNum(local);
  const lo = safeNum(low);
  const hi = safeNum(high);
  if (lp == null || lo == null) return "fair";
  if (lp <= lo * 1.02) return "buy";
  if (hi != null && lp >= hi * 1.1) return "overpriced";
  return "fair";
}
function intelLog(intel0: IntelState | null | undefined, ev: Omit<IntelEvent, "id" | "t"> & { t?: number }) {
  const base = intel0 ? intel0 : emptyIntel();
  const now = ev.t ?? Date.now();
  const intel1 = bumpStreak(base, now);
  const nextEvent: IntelEvent = {
    id: makeId(),
    t: now,
    ...ev,
  } as IntelEvent;
  const events = [...(intel1.events || []), nextEvent].slice(-800); // cap
  return { ...intel1, events };
}
function weeklyStats(events: IntelEvent[]) {
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const scans = (events || []).filter((e) => e.type === "scan" && e.t >= since);
  const savings = scans.reduce((s, x) => s + (safeNum(x.savings) || 0), 0);
  // Phase 5: count by canonical PASS, with normalization for any legacy-
  // shaped verdicts that may still live in cached event streams. Was a
  // direct === "overpriced" check, which produced silent zero-counts
  // for any scan stored in canonical form.
  const avoided = scans.filter((s) => normalizeVerdict(s.verdict) === "PASS").length;
  return { weeklySavings: Math.round(savings), avoidedCount: avoided };
}
function computeIQ(events: IntelEvent[]) {
  const scans = (events || []).filter((e) => e.type === "scan");
  if (!scans.length) return 100;
  const conf = scans.reduce((s, x) => s + clamp01(x.confidence), 0) / scans.length;
  const saved = scans.reduce((s, x) => s + (safeNum(x.savings) || 0), 0);
  return Math.round(120 + conf * 200 + Math.min(saved, 300) * 0.25);
}
function todayScanCount(intel: IntelState | null | undefined) {
  const key = dayKey(Date.now());
  const events = intel?.events || [];
  return events.filter((e) => e.type === "scan" && dayKey(e.t) === key).length;
}
function countDropsFromWatchlist(watchlist: any[]) {
  return (watchlist || []).reduce((s, x) => s + Math.min(99, Number(x?.dropCount || 0)), 0);
}
function _computeIntelUIStats(intel: IntelState | null | undefined, watchlist: any[]) {
  const goal = Number(intel?.goal) || DEFAULT_DAILY_GOAL;
  const today = todayScanCount(intel);
  const progress = Math.max(0, Math.min(1, goal ? today / goal : 0));
  const tracked = Number(watchlist?.length || 0);
  const drops = countDropsFromWatchlist(watchlist);
  const iq = computeIQ(intel?.events || []);
  const headline =
    today >= goal
      ? `Goal hit. ${today}/${goal} scans.`
      : `${goal - today} scan${goal - today === 1 ? "" : "s"} from today’s goal.`;
  return {
    goal,
    today,
    progress,
    scanStreak: intel?.streak?.count || 0,
    tracked,
    dropCount: drops,
    iq,
    headline,
  };
}
function _marketHeat(result) {
  const pct = Number(result?.cheaperPct || 0);
  if (pct > 35) return "HOT";
  if (pct > 15) return "WARM";
  return "COOL";
}

const _matchQuality = (r: any) => {
  const conf = Number(r?.visionConfidence || 0);
  const matches = Number(r?.totalMatches || 0);

  const density = Math.min(1, matches / 30);
  const score = Math.max(0, Math.min(1, conf * 0.75 + density * 0.25));

  if (score >= 0.82) return { label: "Match quality: Strong", tone: "good" };
  if (score >= 0.62) return { label: "Match quality: Solid", tone: "mid" };
  if (score >= 0.40) return { label: "Match quality: Weak", tone: "low" };
  return { label: "Match quality: Unclear", tone: "low" };
};

function chooseComparableDisplayPool(
  items: any[] = [],
  scannedPrice: any = null,
  limit = 12
) {
  const toFinite = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  };

  const entered = toFinite(scannedPrice);

  const normalized = (Array.isArray(items) ? items : [])
    .filter(Boolean)
    .map((it) => {
      const total = toFinite(it?.totalPrice);
      const price = toFinite(it?.price);
      const shipping = toFinite(it?.shipping);
      const rel = toFinite(it?.__relevance);

      const displayTotal = Number.isFinite(total)
        ? total
        : Number.isFinite(price)
        ? price + (Number.isFinite(shipping) ? shipping : 0)
        : NaN;

      return {
        ...it,
        __displayTotal: displayTotal,
        __displayRelevance: Number.isFinite(rel) ? rel : 0,
      };
    })
    .filter((it) => Number.isFinite(it.__displayTotal));

  if (!normalized.length) return [];

  const deduped: any[] = [];
  const seen = new Set<string>();

  for (const it of normalized) {
    const key =
      String(it?.buyLink || it?.link || "").trim() ||
      `${String(it?.itemName || it?.title || "")
        .toLowerCase()
        .trim()}|${Math.round(it.__displayTotal * 100)}`;

    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(it);
  }

  if (!deduped.length) return [];

  const sortPool = (arr: any[]) => {
    if (!Number.isFinite(entered)) {
      return [...arr].sort((a, b) => {
        const relDiff =
          Number(b.__displayRelevance || 0) - Number(a.__displayRelevance || 0);
        if (relDiff !== 0) return relDiff;
        return Number(a.__displayTotal || Infinity) - Number(b.__displayTotal || Infinity);
      });
    }

    return [...arr].sort((a, b) => {
      const aCheaper = a.__displayTotal <= entered ? 0 : 1;
      const bCheaper = b.__displayTotal <= entered ? 0 : 1;
      if (aCheaper !== bCheaper) return aCheaper - bCheaper;

      const aDelta = Math.abs(a.__displayTotal - entered);
      const bDelta = Math.abs(b.__displayTotal - entered);
      if (aDelta !== bDelta) return aDelta - bDelta;

      const relDiff =
        Number(b.__displayRelevance || 0) - Number(a.__displayRelevance || 0);
      if (relDiff !== 0) return relDiff;

      return Number(a.__displayTotal || Infinity) - Number(b.__displayTotal || Infinity);
    });
  };

  const strong = deduped.filter((it) => Number(it.__displayRelevance || 0) >= 0.48);
  const decent = deduped.filter((it) => Number(it.__displayRelevance || 0) >= 0.28);

  const nearby =
    Number.isFinite(entered)
      ? decent.filter(
          (it) =>
            it.__displayTotal >= entered * 0.45 &&
            it.__displayTotal <= entered * 1.85
        )
      : decent;

  const chosen =
    nearby.length >= 3
      ? nearby
      : strong.length >= 3
      ? strong
      : decent.length >= 1
      ? decent
      : deduped;

  return sortPool(chosen).slice(0, limit);
}

// ===============================
// RANKING “ML IMPROVEMENT” (HEURISTIC v1)
// ===============================
function safeLower(s: any) {
  return String(s ?? "").toLowerCase();
}
// duplicate clamp removed — using existing clamp implementation
// A fast “ML-ish” rank score: price + shipping + title similarity + confidence + rating + store trust
function rankScoreV2({
  queryTitle,
  item,
  confidence = 0,
}: {
  queryTitle: string;
  item: any;
  confidence?: number;
}) {
  const title = safeLower(item?.title || item?.itemName || "");
  const q = normalizeTitle(queryTitle || "");
  const sim = titleSimilarity(normalizeTitle(title), q); // 0..1
  const price = clampPrice(item?.price);
  const ship = clampPrice(item?.shipping);
  const total = calcTotalCost({ price, shipping: ship });
  // rating 0..5 -> 0..1
  const rating = typeof item?.rating === "number" ? clamp(0, item.rating / 5, 1) : 0.4;
  // trust weights by marketplace type
  const src = safeLower(item?.source || item?.store || item?.__market || "");
  const trust =
    src.includes("ebay") ? 0.95 :
    src.includes("etsy") ? 0.80 :
    src.includes("google") ? 0.70 :
    0.65;
  // missing price gets punished heavily
  const pricePenalty = Number.isFinite(total) ? 0 : 0.85;
  // cheaper is better
  const cheapness = Number.isFinite(total) ? 1 / Math.max(1, total) : 0;
  // confidence 0..1
  const conf = clamp(0, Number(confidence) || 0, 1);
  // final weighted score (higher is better)
  const score =
    (cheapness * 1200) +        // price dominates
    (sim * 1.8) +               // match quality
    (conf * 1.4) +              // vision confidence
    (rating * 0.7) +            // rating
    (trust * 0.9) -             // source trust
    (pricePenalty * 2.0);       // punish unknown price
  return score;
}
function _sortListingsV2(queryTitle: string, listings: any[], confidence: number) {
  const arr = Array.isArray(listings) ? [...listings] : [];
  arr.sort((a, b) => rankScoreV2({ queryTitle, item: b, confidence }) - rankScoreV2({ queryTitle, item: a, confidence }));
  return arr;
}
// ===============================
// PRICE PREDICTION (v1)
// ===============================
function predictNext7dPrice({
  estValue,
  marketLow,
  marketHigh,
  drops = 0,
}: {
  estValue: any;
  marketLow: any;
  marketHigh: any;
  drops?: number;
}) {
  const est = safeNum(estValue) ?? safeNum(marketLow) ?? safeNum(marketHigh);
  if (est == null) return null;
  const lo = safeNum(marketLow);
  const hi = safeNum(marketHigh);
  // drop pressure: more drops -> slightly lower expected
  const dropFactor = clamp(0.92, 1 - Math.min(0.08, (Number(drops || 0) / 50) * 0.08), 1.02);
  // range mean reversion
  let target = est * dropFactor;
  if (lo != null && hi != null) {
    const mid = (lo + hi) / 2;
    target = (target * 0.55) + (mid * 0.45);
  }
  // keep within sane bounds
  if (lo != null) target = Math.max(lo * 0.95, target);
  if (hi != null) target = Math.min(hi * 1.05, target);
  return Math.round(target * 100) / 100;
}
// ===============================
// SOCIAL SHARING HOOKS (v1)
// ===============================
function _buildShareLinkParams({ installId, refCode }: any) {
  const rid = encodeURIComponent(String(refCode || ""));
  const iid = encodeURIComponent(String(installId || ""));
  return `?ref=${rid}&iid=${iid}`;
}

function buildReferralCode(installId: any) {
  const src = String(installId || "").trim();
  if (!src) return REFERRAL_CODE_POOL[0];

  // simple stable hash -> index
  let h = 0;
  for (let i = 0; i < src.length; i++) {
    h = (h * 31 + src.charCodeAt(i)) >>> 0;
  }
  const idx = h % REFERRAL_CODE_POOL.length;
  return REFERRAL_CODE_POOL[idx];
}

// ===============================
// CLOUD SYNC (v1) — export/import JSON + optional API hook
// ===============================
async function exportCloudSnapshot(payload: any) {
  try {
    const json = JSON.stringify(payload);
    await AsyncStorage.setItem(CLOUD_KEY, json);
    return json;
  } catch {
    return null;
  }
}
async function _importCloudSnapshot() {
  try {
    const raw = await AsyncStorage.getItem(CLOUD_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
// Optional: API cloud store (no break if off)
async function _cloudPushToApi(snapshot: any) {
  if (!CLOUD_API_ENABLED) return false;
  try {
    await apiFetch("/cloud/push", {
      method: "POST",
      body: JSON.stringify(snapshot),
      timeoutMs: 8000,
      retries: 0,
    });
    return true;
  } catch {
    return false;
  }
}
async function _cloudPullFromApi() {
  if (!CLOUD_API_ENABLED) return null;
  try {
    return await apiFetch("/cloud/pull", { method: "GET", timeoutMs: 8000, retries: 0 });
  } catch {
    return null;
  }
}
// ===============================
// INVENTORY (v1) — local-first
// ===============================
type InventoryItem = {
  id: string;
  title: string;
  qty: number;
  estResale?: number | null;
  buyPrice?: number | null;
  createdAt: number;
  thumbUri?: string | null;
  notes?: string | null;
};
async function _loadInventory(): Promise<InventoryItem[]> {
  try {
    const raw = await AsyncStorage.getItem(INV_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
async function saveInventory(items: InventoryItem[]) {
  try {
    await AsyncStorage.setItem(INV_KEY, JSON.stringify(items || []));
  } catch {}
}
// ===============================
// MULTI-ITEM SCANNING (BATCH QUEUE v2)
// ===============================
type BatchJobStatus = "queued" | "scanning" | "done" | "error";
type BatchJob = {
  id: string;
  uri: string;
  createdAt: number;
  note?: string;
  // v2 result fields
  status?: BatchJobStatus;
  itemName?: string | null;
  price?: number | null;
  verdict?: string | null;
  savedAmount?: number | null;
  result?: any;           // full activeResult-shaped object
  errorMsg?: string | null;
};
async function loadBatchQueue(): Promise<BatchJob[]> {
  try {
    const raw = await AsyncStorage.getItem(BATCH_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
async function saveBatchQueue(q: BatchJob[]) {
  try {
    await AsyncStorage.setItem(BATCH_KEY, JSON.stringify(q || []));
  } catch {}
}
// -------------------------------------
// SHARE TEXT (single source of truth)
// -------------------------------------
function buildShareText(result: any) {
  if (!result) return "Evan AI found a better price. Deal-check your next buy.";
  const savings = result?.savedAmount ?? result?.savings;
  const conf = Math.round((result?.confidence || 0) * 100);
  const domain = result?.store || "marketplace";
  const sPart = savings ? ` saving me $${String(savings)}` : "";
  return `Evan AI found this ${domain} deal${sPart} with ${conf}% confidence.`;
}
async function _shareScanResult(result: any, setIntelState: any) {
  const msg = buildShareText(result);
  try {
    await Share.share({ message: msg });
    setIntelState((prev: IntelState) => {
      const next = intelLog(prev, { type: "share", shareKind: "scan" });
      saveIntel(next);
      return next;
    });
  } catch {}
}
async function _shareAppInvite(setIntelState: any) {
  const msg =
    "Download Evan AI — camera-first deal intelligence. Scan it. Verify it. Buy smart. 🚀";
  try {
    await Share.share({ message: msg });
    setIntelState((prev: IntelState) => {
      const next = intelLog(prev, { type: "share", shareKind: "app" });
      saveIntel(next);
      return next;
    });
  } catch {}
}
async function _copyShareText(result: any) {
  try {
    const msg = buildShareText(result);
    await Clipboard.setStringAsync(msg);
    Haptics.selectionAsync();
  } catch {}
}
// ===============================
// API WRAPPER (PRODUCTION SAFE)
// ===============================

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === "ios"
    ? "http://192.168.1.227:3001"
    : "http://10.0.2.2:3001");
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── AbortSignal.timeout polyfill for Hermes / React Native ───────────────────
function abortAfter(ms: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

// ── Auth JWT (module-level, restored from AsyncStorage on boot) ──────────────
let _authJwt: string | null = null;
// ── Client identity — installId or userId, used as x-user-id fallback when no JWT ──
let _clientId: string | null = null;

// ── Health check cache — skip round-trip if server was confirmed alive recently
let _healthBase: string = "";
let _healthOkMs: number = 0;
const HEALTH_CACHE_TTL = 3 * 60 * 1000; // 3 minutes

async function apiFetch<T>(
  path: string,
  opts: RequestInit & { timeoutMs?: number; retries?: number } = {}
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 12000;
  const retries = opts.retries ?? 1;
  let lastErr: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const rawPath = String(path || "").trim();

      const finalUrl =
        rawPath.startsWith("http://") || rawPath.startsWith("https://")
          ? rawPath
          : `${API_URL.replace(/\/+$/, "")}/${rawPath.replace(/^\/+/, "")}`;

      console.log("API FETCH →", finalUrl);

      const res: any = await fetch(finalUrl, {
        ...opts,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(_authJwt ? { Authorization: `Bearer ${_authJwt}` } : {}),
          ...(!_authJwt && _clientId ? { "x-user-id": _clientId } : {}),
          ...(opts.headers || {}),
        },
      });

      const rawText = await res.text();

      let data: any = null;
      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        data = rawText;
      }

      if (!res.ok) {
        throw new Error(
          (data && typeof data === "object" && data.message) ||
            `Request failed (${res.status})`
        );
      }

      return data as T;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        await sleep(300 * (attempt + 1));
        continue;
      }
      throw lastErr;
    } finally {
      clearTimeout(t);
    }
  }

  throw lastErr;
}

// ===============================
// NEURAL EDGE DETECTION ENGINE (PHASE 11)
// (SHIP-SAFE STUB — no late imports)
// ===============================
const _EDGE_ENGINE_ENABLED = false as const;
function _detectEdges(_frame: any) {
  return null;
}
// -------------------------
// STYLES
// -------------------------
const styles = StyleSheet.create({
   container: { flex: 1, backgroundColor: TOK.C.bg },
   full: { ...StyleSheet.absoluteFillObject },
   black: { flex: 1, backgroundColor: TOK.C.bg },
   center: { alignItems: "center", justifyContent: "center" },
camera: { flex: 1, backgroundColor: TOK.C.bg },
  permissionText: {
    color: "white",
    fontSize: 16,
    marginBottom: 12,
    fontWeight: "600",
  },
  
sideBtn: {
  width: 52,
  height: 52,
  borderRadius: 18,
  alignItems: "center",
  justifyContent: "center",
  // Liquid Glass circle
  backgroundColor: "rgba(255,255,255,0.08)",
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: "rgba(255,255,255,0.14)",
  shadowColor: "#000",
  shadowOpacity: IOS ? 0.25 : 0,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
},

sideBtnPressed: {
  opacity: 0.88,
  transform: [{ scale: 0.94 }],
},

resultsSubtitleBig: {
  color: "rgba(255,255,255,0.70)",
  fontWeight: "800",
  fontSize: 15,
  lineHeight: 22,
},

muted: {
  color: "rgba(255,255,255,0.60)",
  fontWeight: "700",
  fontSize: 14,
},

  permissionBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  permissionBtnText: { color: "white", fontWeight: "700" },
  demoPill: {
    position: "absolute",
    top: 50,
    left: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    zIndex: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  demoText: { color: "white", fontWeight: "700" },
  torchBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
modeRow: {
  position: "absolute",
  top: 110,
  left: 18,
  right: 18,
  flexDirection: "row",
  gap: 8,
  flexWrap: "wrap",
},
modePill: {
  paddingHorizontal: 14,
  paddingVertical: 8,
  borderRadius: 999,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: "rgba(255,255,255,0.12)",
  // Liquid Glass pill
  backgroundColor: "rgba(255,255,255,0.06)",
},
modePillActive: {
  backgroundColor: "rgba(255,255,255,0.16)",
  borderColor: "rgba(255,255,255,0.30)",
},
modeText: {
  color: "white",
  fontWeight: "900",
  fontSize: 12,
  letterSpacing: 0.1,
},
propBox: {
  position: "absolute",
  top: 148,
  left: 18,
  right: 18,
  padding: 12,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.10)",
  backgroundColor: "rgba(0,0,0,0.40)",
},
propLabel: { color: "rgba(255,255,255,0.75)", fontWeight: "800", marginBottom: 8 },
propInput: {
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.18)",
  borderRadius: 14,
  padding: 10,
  color: "white",
},
  
frame: {
  position: "absolute",
  top: "22%",        // slightly higher
  alignSelf: "center",
  width: "86%",
  height: "40%",     // ✅ shorter = no overlap with mode pills
  borderRadius: TOK.R.lg,
  borderWidth: TOK.B.hair,
  borderColor: TOK.C.b3,
  backgroundColor: "rgba(255,255,255,0.02)",
},

instruction: {
  position: "absolute",
  bottom: 235,
  alignSelf: "center",
  color: TOK.C.text,
  fontSize: 17,
  fontWeight: "800",
  letterSpacing: 0.10,
  zIndex: 5,
},
  zoomHudPill: {
    backgroundColor: "rgba(18,18,18,0.52)",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: TOK.R.pill,
    borderWidth: TOK.B.hair,
    borderColor: TOK.C.b2,
  },
  zoomHudText: { color: TOK.C.text, fontWeight: "800", fontSize: 15, letterSpacing: 0.08 },
zoomRow: { position:"absolute", top: 260, alignSelf:"center", flexDirection:"row", gap: 14, zIndex: 6 },
  zoomBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: TOK.R.pill,
    backgroundColor: TOK.C.s2,
    borderWidth: TOK.B.hair,
    borderColor: TOK.C.b2,
  },
  zoomBtnText: { color: TOK.C.text, fontWeight: "800", letterSpacing: 0.08 },
  
captureRow: {
  position: "absolute",
  bottom: 140,
  width: "100%",
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 26,
  zIndex: 999,
  elevation: 50,
},

  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: TOK.C.s2,
    borderWidth: TOK.B.hair,
    borderColor: TOK.C.b1,
  },
  iconBtnPressed: {
    backgroundColor: TOK.C.s3,
    borderColor: TOK.C.b3,
  },
  snapStack: {
    width: 92,
    height: 92,
    alignItems: "center",
    justifyContent: "center",
  },
  snapOuterRing: {
    position: "absolute",
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.40)",
  },
  snapBurstRing: {
    position: "absolute",
    width: 98,
    height: 98,
    borderRadius: 49,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.65)",
  },
  snapPressable: {
    width: 82,
    height: 82,
    borderRadius: 41,
    alignItems: "center",
    justifyContent: "center",
  },
snapButton: {
  width: 82,
  height: 82,
  borderRadius: 41,
  backgroundColor: "rgba(255,255,255,0.98)",
  shadowColor: "#000",
  shadowOpacity: IOS ? 0.30 : 0.22,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 12 },
  elevation: 10,
},
  previewOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: TOK.C.bg },
  previewImage: { width: "100%", height: "100%", resizeMode: "cover" },
  // Subtle bottom fade. Single short band, low alpha — replaces the
  // prior two-band scrim that rendered as a solid black slab over the
  // bottom half of the screen and hid the photo. The control card
  // carries its own readability backing; this fade just smooths the
  // edge between live photo and floating controls.
  previewBottomFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 160,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  // Floating glass control card. Anchors readability for the price input,
  // name chip, and Retake/Use buttons without obscuring the photo above
  // the card. Hairline border keeps the premium edge; padding sets the
  // single vertical grid that every child aligns to.
  previewControlCard: {
    backgroundColor: "rgba(10,10,10,0.82)",
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },
  // Vertical breathing room around the item-name chip so it lands
  // visually centered between the price input above and the action
  // row below — the prior layout had it flush against the input.
  previewHintChipWrap: {
    marginTop: 12,
    marginBottom: 4,
  },
  previewActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  previewBtnsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  inlineRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  transparentBtn: { paddingVertical: 12, paddingHorizontal: 18 },
  transparentBtnText: {
    color: TOK.C.text,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.08,
  },
  primaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: TOK.R.lg,
    borderWidth: TOK.B.hair,
    borderColor: TOK.C.b2,
    backgroundColor: TOK.C.s2,
  },
  primaryBtnText: {
    color: TOK.C.text,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.08,
  },
  illuminate: { opacity: 0.95, transform: [{ scale: 0.995 }] },
  illuminatePrimary: {
    backgroundColor: TOK.C.s3,
    borderColor: TOK.C.b3,
    transform: [{ scale: 0.995 }],
  },
  mutedStrong: { color: "rgba(255,255,255,0.75)", fontWeight: "800" },
  priceLabel: {
    color: "rgba(255,255,255,0.78)",
    fontWeight: "800",
    marginBottom: 6,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  priceInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    color: "white",
    backgroundColor: "rgba(255,255,255,0.10)",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  previewHint: {
    color: "rgba(255,255,255,0.55)",
    marginTop: 10,
    fontWeight: "600",
    fontSize: 11,
    textAlign: "center",
    letterSpacing: 0.3,
  },
  pageTitle: {
    color: TOK.C.text,
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 8,
    letterSpacing: -0.4,
  },
resultsHeaderRow: {
  marginBottom: 6,
},
  resultsSubcopy: {
    color: "rgba(255,255,255,0.70)",
    fontWeight: "700",
    marginBottom: 12,
  },
trustRow: {
  flexDirection: "row",
  alignItems: "flex-start",
  gap: 6,
  marginBottom: 6,
},
trustDot: {
  color: "rgba(255,255,255,0.70)",
  fontWeight: "900",
  marginTop: 1,
},
  // Loading stage w/ background image
  loadingStage: {
    height: 320,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    marginBottom: 12,
  },
loadingWrap: {
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: 40,
},
loadingRing: {
  width: 44,
  height: 44,
  borderRadius: 22,
  borderWidth: 3,
  borderColor: "rgba(255,255,255,0.18)",
  borderTopColor: "rgba(255,255,255,0.95)",
  marginBottom: 12,
},
retryBtn: {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
  paddingVertical: 10,
  paddingHorizontal: 16,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.22)",
  backgroundColor: "rgba(255,255,255,0.10)",
},
retryText: { color: "white", fontWeight: "900" },
loadingCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  loadingTitle: {
    color: "white",
    fontWeight: "900",
    marginTop: 12,
    textAlign: "center",
  },
  loadingHint: {
    color: "rgba(255,255,255,0.65)",
    fontWeight: "700",
    marginTop: 8,
    textAlign: "center",
  },
  loadingSlow: {
    color: "rgba(255,255,255,0.70)",
    fontWeight: "800",
    marginTop: 10,
    textAlign: "center",
  },
  loadingBtnsRow: { flexDirection: "row", gap: 12, marginTop: 14 },
  primaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  primaryActionText: { color: "white", fontWeight: "900" },
  secondaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  secondaryActionText: { color: "white", fontWeight: "900" },
verdictRow: { marginBottom: 10, flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
verdictChip: {
  alignSelf: "flex-start",
  paddingVertical: 8,
  paddingHorizontal: 14,
  borderRadius: 999,
  fontWeight: "900",
  color: "white",
  borderWidth: 1,
  letterSpacing: 0.4,
},
verdict_green: { backgroundColor: "rgba(0,200,120,0.18)", borderColor: "rgba(0,200,120,0.35)" },
verdict_yellow: { backgroundColor: "rgba(255,200,0,0.16)", borderColor: "rgba(255,200,0,0.30)" },
verdict_red: { backgroundColor: "rgba(255,70,70,0.16)", borderColor: "rgba(255,70,70,0.30)" },
confidenceBreakdown: { marginTop: 10 },
confidenceLine: { color: "rgba(255,255,255,0.72)", fontWeight: "700", marginTop: 4 },
marketSpread: {
  marginTop: 12,
  padding: 12,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.10)",
  backgroundColor: "rgba(255,255,255,0.05)",
},
marketSpreadText: { color: "white", fontWeight: "900" },
marketSpreadSub: { color: "rgba(255,255,255,0.65)", fontWeight: "700", marginTop: 6, fontSize: 12 },
emptyResults: {
  padding: 16,
  borderRadius: 18,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
  backgroundColor: "rgba(255,255,255,0.05)",
  marginTop: 10,
},
emptyResultsTitle: { color: "white", fontWeight: "900", fontSize: 16, marginBottom: 6 },
emptyResultsText: { color: "rgba(255,255,255,0.70)", fontWeight: "700" },
resultCard: {
  padding: 16,
  borderRadius: TOK.R.lg,
  borderWidth: TOK.B.hair,
  borderColor: TOK.C.b2,
  backgroundColor: TOK.C.s1,
},
  heroImg: {
    width: "100%",
    height: 170,
    borderRadius: 16,
    marginBottom: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
resultTitle: {
  color: "white",
  fontWeight: "900",
  fontSize: 18,
  lineHeight: 24,
  flexShrink: 1,
},

resultMeta: {
  color: "rgba(255,255,255,0.72)",
  fontWeight: "800",
  fontSize: 13,
  lineHeight: 18,
},

  savedBig: { color: "white", fontWeight: "900" },
  savedSmall: {
    color: "rgba(255,255,255,0.75)",
    fontWeight: "800",
    marginTop: 3,
  },
  marketBox: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.10)",
  },
  marketTitle: {
    color: "rgba(255,255,255,0.9)",
    fontWeight: "900",
    marginBottom: 8,
  },
  marketLine: {
    color: "rgba(255,255,255,0.75)",
    fontWeight: "800",
    marginTop: 3,
  },
  tapHint: {
    color: "rgba(255,255,255,0.55)",
    marginTop: 12,
    fontWeight: "800",
  },
  sectionTitle: {
    color: "rgba(255,255,255,0.82)",
    fontWeight: "900",
    marginBottom: 10,
    marginTop: 2,
  },
  miniImg: { width: 54, height: 54, borderRadius: 10, backgroundColor: "#111" },
  miniImgFallback: {
    width: 54,
    height: 54,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  miniTitle: { color: "white", fontWeight: "900" },
  miniMeta: { color: "rgba(255,255,255,0.70)", fontWeight: "800", fontSize: 12 },
  emptyCard: {
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  emptyTitle: { color: "white", fontWeight: "900", fontSize: 16 },
  emptyBody: { color: "rgba(255,255,255,0.70)", fontWeight: "700", marginTop: 8 },
miniCard: {
  padding: 14,
  borderRadius: TOK.R.md,
  borderWidth: TOK.B.hair,
  borderColor: TOK.C.b1,
  backgroundColor: TOK.C.s1,
  marginBottom: 10,
},
historyRow: {
  flexDirection: "row",
  gap: 14,
  alignItems: "center",
  padding: 16,
  borderRadius: 20,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: "rgba(255,255,255,0.10)",
  backgroundColor: "rgba(255,255,255,0.05)",
  marginBottom: 10,
},
  historyThumb: { width: 58, height: 58, borderRadius: 14, backgroundColor: "#111" },
  historyTitle: { color: "white", fontWeight: "800", fontSize: 15 },
  historyTime: { color: "rgba(255,255,255,0.40)", marginTop: 3, fontSize: 12, fontWeight: "500" },
  savingsBox: {
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
    marginBottom: 14,
    marginTop: 18,
  },
  savingsTitle: { color: "white", fontWeight: "900", fontSize: 18, letterSpacing: -0.3 },
  savingsSub: { color: "rgba(255,255,255,0.55)", marginTop: 5, fontWeight: "500", lineHeight: 18 },
  savingsSubStrong: { color: "rgba(255,255,255,0.80)", marginTop: 10, fontWeight: "700", fontSize: 14 },
  profileHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  subStatus: { color: "rgba(255,255,255,0.70)", fontWeight: "700" },


signInBtn: {
  flexDirection: "row",
  gap: 6,
  alignItems: "center",
  paddingVertical: 10,
  paddingHorizontal: 14,
  borderRadius: 16,
  backgroundColor: "rgba(255,255,255,0.11)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.18)",
  marginRight: 0,
  marginTop: 2,
},

  signInText: { color: "white", fontWeight: "900" },
  // ✅ Results "New scan" button style
  newScanBtn: {
    marginTop: 14,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  profileBtn: {
    paddingVertical: 15,
    paddingLeft: 16,
    paddingRight: 28,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
  },
  profileBtnText: { color: "white", fontWeight: "700", fontSize: 15, letterSpacing: 0.1, flex: 1 },
  
helpBackdrop: {
  ...StyleSheet.absoluteFillObject,
  backgroundColor: "rgba(0,0,0,0.60)",
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: 18,
},

helpBox: {
  width: "100%",
  borderRadius: 24,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: "rgba(255,255,255,0.14)",
  // Liquid Glass modal surface
  backgroundColor: "rgba(14,14,14,0.92)",
  padding: 20,
  shadowColor: "#000",
  shadowOpacity: IOS ? 0.55 : 0.35,
  shadowRadius: 32,
  shadowOffset: { width: 0, height: 18 },
  elevation: 24,
},

  helpTitle: { color: "white", fontWeight: "900", fontSize: 16, marginBottom: 10 },
  helpItem: { color: "rgba(255,255,255,0.85)", marginBottom: 8, fontWeight: "600" },
  helpHint: { color: "rgba(255,255,255,0.55)", marginTop: 6, fontSize: 12 },
tabBar: {
  position: "absolute",
  bottom: 18,
  left: 18,
  right: 18,
  height: 66,
  borderRadius: 26,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: "rgba(255,255,255,0.16)",
  overflow: "hidden",
  flexDirection: "row",
  justifyContent: "space-evenly",
  alignItems: "center",
  paddingHorizontal: 6,
  // Liquid Glass surface — translucent dark glass
  backgroundColor: "rgba(10,10,10,0.78)",
},
tabBtn: {
    width: 60,
    height: 50,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  tabActive: {},
  tabPressed: {},

modalCard: {
  width: "100%",
  maxWidth: 520,
  borderRadius: 28,
  padding: 22,
  // Liquid Glass modal — deep dark glass with subtle luminance
  backgroundColor: "rgba(12,12,12,0.94)",
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: "rgba(255,255,255,0.14)",
  shadowColor: "#000",
  shadowOpacity: IOS ? 0.65 : 0.45,
  shadowRadius: 40,
  shadowOffset: { width: 0, height: 24 },
  elevation: 30,
},

modalBackdrop: {
  flex: 1,
  backgroundColor: "rgba(0,0,0,0.50)",
  justifyContent: "center",
  alignItems: "center",
  padding: 18,
},

  modalTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  modalTitle: { color: "white", fontWeight: "900", fontSize: 16 },
  modalDesc: { color: "rgba(255,255,255,0.75)", fontWeight: "600", marginBottom: 14 },
  backPill: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  backText: { color: "white", fontWeight: "900" },
  payPill: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  payPillText: { color: "white", fontWeight: "900" },
  payRow: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    marginBottom: 16,
  },
  priceBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    marginBottom: 14,
  },
  priceBig: { color: "white", fontWeight: "900", fontSize: 34, lineHeight: 38 },
  priceSmall: { color: "rgba(255,255,255,0.75)", fontWeight: "800", textAlign: "center" },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.10)", marginVertical: 12 },
  modalPrimary: {
    paddingVertical: 16,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.9)",
    borderWidth: 0,
    alignItems: "center",
    marginBottom: 10,
    shadowColor: "#fff",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  modalPrimaryText: { color: "#000", fontWeight: "900", fontSize: 15 },
  modalSecondary: {
    paddingVertical: 16,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
  },
  modalSecondaryText: { color: "rgba(255,255,255,0.80)", fontWeight: "700", fontSize: 15 },
  modalFoot: {
    color: "rgba(255,255,255,0.55)",
    marginTop: 10,
    fontSize: 12,
    fontWeight: "600",
  },
  modalBody: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  modalCloseBtn: {
    marginTop: 14,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  modalCloseText: {
    color: "#fff",
    fontWeight: "900",
  },
  paywallBox: {
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.06)",
    marginBottom: 12,
  },
  paywallTitle: { color: "white", fontWeight: "900" },
  paywallSub: { color: "rgba(255,255,255,0.70)", fontWeight: "700", marginTop: 6 },
  authInput: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    borderRadius: 14,
    padding: 12,
    color: "white",
    marginBottom: 14,
  },
  confLabel: { color: "rgba(255,255,255,0.70)", fontWeight: "900", marginBottom: 8 },
  confOuter: {
    height: 22,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  confFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 14,
    overflow: "hidden",
  },
  confSheen: {
    position: "absolute",
    top: -18,
    width: 60,
    height: 80,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.16)",
    opacity: 0.65,
  },
  confBubble: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.22)",
    opacity: 0.6,
  },
  confTextWrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  confText: { color: "white", fontWeight: "900", letterSpacing: 0.3 },
  // ✅ logos + actions
  logoRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },
  logoChip: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  logoImg: { width: 18, height: 18 },
  logoText: { color: "rgba(255,255,255,0.85)", fontWeight: "900", fontSize: 12 },
  resultActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    alignItems: "center",
    flexWrap: "wrap",
  },
  smallActionBtn: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  smallActionText: { color: "white", fontWeight: "900" },

listingRow: {
  flexDirection: "row",
  gap: 12,
  alignItems: "flex-start",
  padding: 14,
  borderRadius: 18,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
  backgroundColor: "rgba(255,255,255,0.05)",
  marginBottom: 10,
},

listingTitle: {
  color: "white",
  fontWeight: "900",
  fontSize: 14,
  lineHeight: 19,
  flexShrink: 1,
},

listingMeta: {
  color: "rgba(255,255,255,0.70)",
  fontWeight: "800",
  marginTop: 4,
  fontSize: 12,
  lineHeight: 16,
},

  haggleRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  haggleText: {
    flex: 1,
    color: "rgba(255,255,255,0.88)",
    fontWeight: "800",
    marginRight: 10,
  },
// -------------------------
// ✅ REQUIRED STYLES (STEP 7)
// -------------------------
controlColumn: {
  ...StyleSheet.absoluteFillObject,
  zIndex: 6,
},
historyThumbWrap: {
  width: 54,
  height: 54,
  borderRadius: 10,
  overflow: "hidden",
},
historyThumbFallback: {
  width: 54,
  height: 54,
  borderRadius: 10,
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.10)",
},
miniPrice: {
  color: "rgba(255,255,255,0.85)",
  fontWeight: "900",
},
// -------------------------
// ✅ RESULTS (PREMIUM UI)
// -------------------------
page: {
  flex: 1,
  paddingTop: 12,
  paddingHorizontal: 18,
  paddingBottom: 0,
  backgroundColor: TOK.C.bg,
},

resultsTopBar: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 8,
},

// Pillar 1.8 — nav weight reduction (~18%). Lower vertical & horizontal
// padding, hairline border, dimmer fills, smaller icon-text. Nav reads
// as ambient chrome rather than a primary CTA so the verdict module
// owns the eye-stop on first glance.
resultsBackRow: {
  flexDirection: "row",
  alignItems: "center",
  gap: 4,
  paddingVertical: 7,
  paddingHorizontal: 10,
  borderRadius: 14,
  backgroundColor: "rgba(255,255,255,0.035)",
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: "rgba(255,255,255,0.08)",
},
resultsBackText: {
  color: "rgba(255,255,255,0.78)",
  fontSize: 13,
  fontWeight: "700",
  letterSpacing: 0.1,
},
resultsNewScanPill: {
  flexDirection: "row",
  alignItems: "center",
  gap: 6,
  paddingVertical: 7,
  paddingHorizontal: 12,
  borderRadius: 14,
  backgroundColor: "rgba(255,255,255,0.05)",
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: "rgba(255,255,255,0.10)",
},
resultsNewScanText: {
  color: "rgba(255,255,255,0.94)",
  fontSize: 13,
  fontWeight: "800",
  letterSpacing: 0.15,
},
resultsTitleBig: {
  color: TOK.C.text,
  fontSize: 34,
  fontWeight: "800",
  letterSpacing: 0.15,
  marginTop: 18,
},

resultsLoadingShell: {
  minHeight: 260,
  borderRadius: 26,
  overflow: "hidden",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
  backgroundColor: "rgba(255,255,255,0.05)",
},

resultsLoadingCard: {
  flex: 1,
  margin: 18,
  borderRadius: 24,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.16)",
  backgroundColor: "rgba(20,20,20,0.58)",
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: 18,
  paddingVertical: 20,
},
resultsLoadingHeadline: {
  color: "white",
  fontWeight: "900",
  fontSize: 16,
  textAlign: "center",
  marginTop: 4,
},
resultsLoadingSub: {
  marginTop: 10,
  color: "rgba(255,255,255,0.70)",
  fontWeight: "700",
  textAlign: "center",
},
resultsLoadingFoot: {
  marginTop: 12,
  color: "rgba(255,255,255,0.70)",
  fontWeight: "800",
  textAlign: "center",
},
resultsLoadingBtnRow: {
  flexDirection: "row",
  gap: 12,
  marginTop: 16,
},
resultsLoadingBtn: {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
  paddingVertical: 10,
  paddingHorizontal: 16,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.20)",
  backgroundColor: "rgba(255,255,255,0.06)",
},
resultsLoadingBtnPrimary: {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
  paddingVertical: 10,
  paddingHorizontal: 18,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.25)",
  backgroundColor: "rgba(255,255,255,0.12)",
},
resultsLoadingBtnText: {
  color: "white",
  fontWeight: "900",
},
resultsHistoryPill: {
  marginTop: 14,
  borderRadius: 18,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.10)",
  backgroundColor: "rgba(255,255,255,0.06)",
  paddingVertical: 14,
  paddingHorizontal: 16,
  flexDirection: "row",
  alignItems: "center",
  gap: 10,
},
resultsHistoryText: {
  color: "white",
  fontWeight: "900",
  letterSpacing: 0.2,
},
resultsEmpty: {
  marginTop: 10,
  padding: 16,
  borderRadius: 22,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
  backgroundColor: "rgba(255,255,255,0.05)",
},
resultsEmptyTitle: {
  color: "white",
  fontWeight: "900",
  fontSize: 18,
},
resultsEmptyText: {
  marginTop: 8,
  color: "rgba(255,255,255,0.70)",
  fontWeight: "700",
  lineHeight: 20,
},
resultsEmptyCTA: {
  marginTop: 14,
  alignSelf: "flex-start",
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
  paddingVertical: 12,
  paddingHorizontal: 14,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.14)",
  backgroundColor: "rgba(255,255,255,0.08)",
},
resultsEmptyCTAText: {
  color: "white",
  fontWeight: "900",
},

resultsHeroCard: {
  marginTop: 12,
  padding: 16,
  borderRadius: 24,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
  backgroundColor: "rgba(255,255,255,0.06)",
  overflow: "hidden",
  shadowColor: "#000",
  shadowOpacity: 0.28,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  elevation: 14,
},

resultsHeroTitle: {
  color: TOK.C.text,
  fontWeight: "900",
  fontSize: 18,
  lineHeight: 24,
  letterSpacing: 0.04,
  flexShrink: 1,
},

resultsHeroMeta: {
  marginTop: 6,
  color: TOK.C.text2,
  fontWeight: "700",
},
resultsHeroSplit: {
  marginTop: 12,
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
},
resultsHeroSaved: {
  color: "white",
  fontWeight: "900",
},
resultsHeroPct: {
  color: "rgba(255,255,255,0.75)",
  fontWeight: "900",
},

resultsHeroActions: {
  marginTop: 16,
  flexDirection: "row",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "stretch",
},

resultsHeroBtn: {
  minWidth: 140,
  flexGrow: 1,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  paddingVertical: 12,
  paddingHorizontal: 14,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.22)",
  backgroundColor: "rgba(255,255,255,0.14)",
},

resultsHeroBtnGhost: {
  minWidth: 140,
  flexGrow: 1,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  paddingVertical: 12,
  paddingHorizontal: 14,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.16)",
  backgroundColor: "rgba(255,255,255,0.07)",
},

resultsHeroBtnText: {
  color: "white",
  fontWeight: "900",
},
historyHint: {
  color: "rgba(255,255,255,0.55)",
  fontSize: 13,
  marginBottom: 12,
},
// -------------------------
// ✅ SPLASH INFO MODAL
// -------------------------
splashInfoBackdrop: {
  ...StyleSheet.absoluteFillObject,
  backgroundColor: "transparent",
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: 18,
},
splashInfoCard: {
  width: "100%",
  borderRadius: 22,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
  backgroundColor: "rgba(20,20,20,0.95)",
  padding: 18,
},
splashInfoTitle: {
  color: "white",
  fontSize: 18,
  fontWeight: "900",
  marginBottom: 10,
},
splashInfoText: {
  color: "rgba(255,255,255,0.75)",
  fontWeight: "700",
  lineHeight: 20,
  marginBottom: 12,
},
// -------------------------
// ✅ UNVERIFIED LINK MODAL
// -------------------------
unverifiedBackdrop: {
  ...StyleSheet.absoluteFillObject,
  backgroundColor: "transparent",
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: 18,
},
unverifiedCard: {
  width: "100%",
  borderRadius: 22,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
  backgroundColor: "rgba(20,20,20,0.95)",
  padding: 18,
},
unverifiedTitle: {
  color: "white",
  fontSize: 16,
  fontWeight: "900",
  marginBottom: 8,
},
unverifiedBody: {
  color: "rgba(255,255,255,0.75)",
  fontWeight: "700",
  lineHeight: 20,
  marginBottom: 14,
},
planYearlyText: {
  marginTop: 8,
  fontSize: 14,
  color: "white",
  fontWeight: "900",
  textAlign: "center",
  letterSpacing: 0.4,
},
// -------------------------
// ✅ WATCHLIST (APPLE-LEVEL)
// -------------------------
watchPage: {
  flex: 1,
  backgroundColor: TOK.C.bg,
  paddingTop: 54,
},
watchInner: {
  paddingHorizontal: 18,
  paddingTop: 10,
},
watchHeaderRow: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
},
watchTitle: {
  color: TOK.C.text,
  fontSize: 34,
  fontWeight: "800",
  letterSpacing: 0.15,
},
watchSub: {
  marginTop: 6,
  color: TOK.C.text2,
  fontWeight: "700",
  fontSize: 14,
  lineHeight: 19,
},
watchBadge: {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
  paddingVertical: 10,
  paddingHorizontal: 12,
  borderRadius: 18,
  backgroundColor: "rgba(255,255,255,0.08)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
},
watchBadgeText: {
  color: "white",
  fontWeight: "900",
},
watchAddCard: {
  borderRadius: TOK.R.lg,
  borderWidth: TOK.B.hair,
  borderColor: TOK.C.b2,
  backgroundColor: TOK.C.s1,
  padding: 14,
  marginBottom: 12,
},
watchAddLabel: {
  color: "rgba(255,255,255,0.82)",
  fontWeight: "900",
  marginBottom: 10,
},
watchAddRow: {
  flexDirection: "row",
  alignItems: "center",
  gap: 10,
},
watchAddInput: {
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.14)",
  borderRadius: 16,
  paddingVertical: 10,
  paddingHorizontal: 12,
  color: "white",
  backgroundColor: "rgba(0,0,0,0.18)",
  fontWeight: "800",
},
watchTargetPill: {
  flexDirection: "row",
  alignItems: "center",
  gap: 6,
  paddingHorizontal: 10,
  height: 44,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.14)",
  backgroundColor: "rgba(0,0,0,0.18)",
},
watchTargetPrefix: {
  color: "rgba(255,255,255,0.75)",
  fontWeight: "900",
},
watchTargetInput: {
  width: 72,
  color: "white",
  fontWeight: "900",
},
watchAddBtn: {
  flexDirection: "row",
  alignItems: "center",
  gap: 6,
  paddingHorizontal: 12,
  height: 44,
  borderRadius: 16,
  backgroundColor: "white",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.35)",
},
watchAddBtnPressed: { transform: [{ scale: 0.98 }], opacity: 0.92 },
watchAddBtnText: {
  color: TOK.C.bg,
  fontWeight: "900",
},
watchAddHint: {
  marginTop: 10,
  color: "rgba(255,255,255,0.55)",
  fontWeight: "700",
  fontSize: 12,
},
watchSearchCard: {
  flexDirection: "row",
  alignItems: "center",
  gap: 10,
  paddingHorizontal: 12,
  height: 46,
  borderRadius: TOK.R.md,
  borderWidth: TOK.B.hair,
  borderColor: TOK.C.b2,
  backgroundColor: TOK.C.s1,
  marginBottom: 12,
},
watchSearchInput: {
  flex: 1,
  color: "white",
  fontWeight: "800",
},
watchClearBtn: {
  width: 34,
  height: 34,
  borderRadius: 12,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(255,255,255,0.08)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
},
watchClearBtnPressed: { backgroundColor: "rgba(255,255,255,0.14)" },
watchChipRow: {
  flexDirection: "row",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 10,
},
watchChip: {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
  paddingVertical: 10,
  paddingHorizontal: 12,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
  backgroundColor: "rgba(0,0,0,0.25)",
},
watchChipActive: {
  backgroundColor: "rgba(255,255,255,0.12)",
  borderColor: "rgba(255,255,255,0.22)",
},
watchChipPressed: { opacity: 0.9 },
watchChipText: {
  color: "rgba(255,255,255,0.75)",
  fontWeight: "900",
  fontSize: 12,
  letterSpacing: 0.2,
},
watchChipTextActive: { color: "white" },
watchEmptyCard: {
  marginTop: 8,
  padding: 16,
  borderRadius: 22,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
  backgroundColor: "rgba(255,255,255,0.05)",
},
watchEmptyTitle: {
  color: "white",
  fontWeight: "900",
  fontSize: 18,
},
watchEmptyText: {
  marginTop: 8,
  color: "rgba(255,255,255,0.70)",
  fontWeight: "700",
  lineHeight: 20,
},

tabFull: {
  ...StyleSheet.absoluteFillObject,
  backgroundColor: "transparent",
},

watchRow: {
  flexDirection: "row",
  gap: 12,
  alignItems: "flex-start",
  padding: 10,
  borderRadius: TOK.R.md,
  borderWidth: TOK.B.hair,
  borderColor: TOK.C.b2,
  backgroundColor: TOK.C.s1,
  marginBottom: 10,
},
watchRowPressed: { backgroundColor: TOK.C.s2 },
watchThumb: {
  width: 54,
  height: 54,
  borderRadius: 12,
  backgroundColor: "rgba(255,255,255,0.06)",
},
watchThumbFallback: {
  width: 54,
  height: 54,
  borderRadius: 12,
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.10)",
  alignItems: "center",
  justifyContent: "center",
},
watchRowTitle: {
  color: "white",
  fontWeight: "900",
  fontSize: 14,
},
watchMetaRow: {
  marginTop: 4,
  flexDirection: "row",
  gap: 12,
  flexWrap: "wrap",
},
watchMetaText: {
  color: "rgba(255,255,255,0.65)",
  fontWeight: "800",
  fontSize: 12,
},
watchMetaStrong: {
  color: "rgba(255,255,255,0.90)",
  fontWeight: "900",
},
watchPillRow: {
  marginTop: 10,
  flexDirection: "row",
  gap: 10,
  flexWrap: "wrap",
},
watchMiniPill: {
  paddingVertical: 8,
  paddingHorizontal: 10,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
  backgroundColor: "rgba(0,0,0,0.22)",
},
watchMiniLabel: {
  color: "rgba(255,255,255,0.55)",
  fontWeight: "900",
  fontSize: 11,
},
watchMiniValue: {
  marginTop: 2,
  color: "white",
  fontWeight: "900",
  fontSize: 12,
},
watchTrash: {
  width: 40,
  height: 40,
  borderRadius: 14,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.10)",
},
watchTrashPressed: { backgroundColor: "rgba(255,255,255,0.12)" },
watchDetailGrid: {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 10,
  marginBottom: 14,
},
watchDetailCard: {
  width: "48%",
  borderRadius: 18,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
  backgroundColor: "rgba(255,255,255,0.06)",
  padding: 12,
},
watchDetailLabel: {
  color: "rgba(255,255,255,0.65)",
  fontWeight: "900",
  fontSize: 12,
},
watchDetailValue: {
  marginTop: 6,
  color: "white",
  fontWeight: "900",
  fontSize: 14,
},
watchEditRow: {
  flexDirection: "row",
  alignItems: "center",
  gap: 10,
  paddingHorizontal: 12,
  height: 46,
  borderRadius: 18,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
  backgroundColor: "rgba(255,255,255,0.06)",
  marginBottom: 6,
},
watchEditInput: {
  flex: 1,
  color: "white",
  fontWeight: "900",
},
glassCard: {
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
  shadowColor: "#000",
  shadowOpacity: 0.35,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  elevation: 18,
},

resultsActionRow: {
  flexDirection: "row",
  gap: 10,
  marginTop: 12,
  flexWrap: "wrap",
},
resultsActionRowTight: {
  flexDirection: "row",
  gap: 10,
  marginTop: 10,
  flexWrap: "wrap",
},

resultsPrimaryAction: {
  minWidth: 150,
  flexGrow: 1,
  flexDirection: "row",
  gap: 8,
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: 14,
  paddingHorizontal: 14,
  borderRadius: 18,
  backgroundColor: "rgba(255,255,255,0.16)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.18)",
},

resultsPrimaryActionText: {
  color: "white",
  fontWeight: "900",
  letterSpacing: 0.2,
},

resultsSecondaryAction: {
  minWidth: 120,
  flexGrow: 1,
  flexDirection: "row",
  gap: 8,
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: 14,
  paddingHorizontal: 14,
  borderRadius: 18,
  backgroundColor: "rgba(255,255,255,0.08)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.14)",
},

resultsSecondaryActionText: {
  color: "rgba(255,255,255,0.92)",
  fontWeight: "900",
},
resultsMiniAction: {
  flexDirection: "row",
  gap: 8,
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: 11,
  paddingHorizontal: 12,
  borderRadius: 16,
  backgroundColor: "rgba(255,255,255,0.08)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.14)",
},
resultsMiniActionGhost: {
  flexDirection: "row",
  gap: 8,
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: 11,
  paddingHorizontal: 14,
  borderRadius: 16,
  backgroundColor: "rgba(0,0,0,0.22)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
},

resultsMiniActionText: {
  color: "white",
  fontWeight: "900",
  fontSize: 13,
},

aiStageCard: {
  marginTop: 18,
  padding: 18,
  borderRadius: TOK.R.xl,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.14)",
  backgroundColor: "rgba(20,20,20,0.58)",
  overflow: "hidden",
  alignItems: "center",
  justifyContent: "center",
  ...TOK.S.soft,
},
aiStageTitle: {
  color: "white",
  fontWeight: "900",
  fontSize: 18,
  letterSpacing: 0.3,
},
aiStageLine: {
  marginTop: 10,
  color: "rgba(255,255,255,0.74)",
  fontWeight: "800",
},

// ✅ matches usage: styles.resultActionsRowTight
resultActionsRowTight: {
  flexDirection: "row",
  gap: 10,
  marginTop: 10,
  flexWrap: "wrap",
},

cameraControlsRow: {
  position: "absolute",
  left: 0,
  right: 0,
  flexDirection: "row",
  justifyContent: "space-around",
  alignItems: "center",
  zIndex: 20,
  paddingHorizontal: 22,
},

cameraSideBtn: {
  width: 54,
  height: 54,
  borderRadius: 18,
  alignItems: "center",
  justifyContent: "center",
  // Liquid Glass surface
  backgroundColor: "rgba(255,255,255,0.08)",
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: "rgba(255,255,255,0.18)",
  shadowColor: "#000",
  shadowOpacity: IOS ? 0.30 : 0.18,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 6 },
  elevation: 8,
},

cameraSideBtnPressed: {
  opacity: 0.88,
  transform: [{ scale: 0.94 }],
},

shutterPressable: {
  alignItems: "center",
  justifyContent: "center",
},

shutterOuter: {
  width: 100,
  height: 100,
  borderRadius: 50,
  backgroundColor: "rgba(255,255,255,0.08)",
  borderWidth: 1.5,
  borderColor: "rgba(255,255,255,0.28)",
  alignItems: "center",
  justifyContent: "center",
  // Liquid Glass glow
  shadowColor: "#ffffff",
  shadowOpacity: IOS ? 0.14 : 0,
  shadowRadius: 30,
  shadowOffset: { width: 0, height: 0 },
  elevation: 14,
},

shutterInner: {
  width: 78,
  height: 78,
  borderRadius: 39,
  backgroundColor: "#ffffff",
  // Inner glow — floating in liquid feel
  shadowColor: "#fff",
  shadowOpacity: IOS ? 0.30 : 0,
  shadowRadius: 20,
  shadowOffset: { width: 0, height: 0 },
},

shutterBurstRing: {
  position: "absolute",
  width: 118,
  height: 118,
  borderRadius: 59,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.45)",
},

barcodeOverlay: {
  position: "absolute",
  left: 0,
  right: 0,
  top: "34%",
  alignItems: "center",
  zIndex: 15,
},

barcodeFrame: {
  width: "78%",
  height: 140,
  borderRadius: 18,
  borderWidth: 2,
  borderColor: "rgba(255,255,255,0.22)",
  backgroundColor: "rgba(0,0,0,0.12)",
  overflow: "hidden",
},

barcodeFrameGlow: {
  ...StyleSheet.absoluteFillObject,
  borderWidth: 2,
  borderColor: "rgba(255,255,255,0.55)",
  borderRadius: 18,
},

barcodeScanLine: {
  position: "absolute",
  left: 10,
  right: 10,
  height: 2,
  borderRadius: 2,
  backgroundColor: "rgba(255,255,255,0.65)",
  top: "50%",
  opacity: 0.9,
},

barcodeHint: {
  marginTop: 12,
  color: "rgba(255,255,255,0.72)",
  fontWeight: "900",
},

});
