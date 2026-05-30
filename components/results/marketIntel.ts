/**
 * Market intelligence helpers — derive structured signals from the raw
 * scan result + market response so the results screen can present
 * "Evan investigated the market" instead of "Evan returned one listing."
 *
 * All functions are pure: no mutation of inputs, no side effects, no
 * network. Safe to call repeatedly with the same arguments and from
 * useMemo dependencies.
 *
 * Trust rules enforced here (Pillar 1):
 *   - clickable === false           → never treated as openable
 *   - evidenceQuality === "verified_listing" && clickable !== false
 *                                   → labeled "Verified listing"
 *   - evidenceQuality === "oracle_estimate"
 *                                   → labeled "AI estimate"
 *   - evidenceQuality === "pricing_signal" OR clickable === false
 *                                   → labeled "Pricing signal"
 *   - cardActionLabel returns "View listing" ONLY when there is a real
 *     directUrl AND clickable is not false. Otherwise "Pricing signal"
 *     so the dock CTA never tries to open a URL it doesn't have.
 */

import { fmtMoney } from "../design/DS";

// ─── Types ──────────────────────────────────────────────────────────────────
export type EvidenceQuality =
  | "verified_listing"
  | "pricing_signal"
  | "oracle_estimate"
  | "legacy_unknown"
  | null
  | undefined;

export interface MarketCard {
  itemName?: string | null;
  title?: string | null;
  store?: string | null;
  source?: string | null;
  price?: number | null;
  totalPrice?: number | null;
  buyLink?: string | null;
  url?: string | null;
  directUrl?: string | null;
  image?: string | null;
  thumbnail?: string | null;
  clickable?: boolean | null;
  evidenceQuality?: EvidenceQuality;
  isVerifiedListing?: boolean | null;
  isPricingEvidenceOnly?: boolean | null;
  matchScore?: number | null;
  visionConfidence?: number | null;
  buyVerdict?: string | null;
  [key: string]: any;
}

export interface MarketStats {
  totalMatches: number;
  shownMatches: number;
  verifiedCount: number;
  pricingSignalCount: number;
  oracleCount: number;
  lowPrice: number | null;
  highPrice: number | null;
  medianPrice: number | null;
  bestPrice: number | null;
  hasDirectListings: boolean;
  hasOnlyPricingSignals: boolean;
  strongestVisualMatch: number | null;
  priceSpreadLabel: "tight" | "moderate" | "wide" | "thin";
  spreadMultiplier: number | null;
}

export type VerdictWord = "BUY" | "HOLD" | "PASS";

export interface VerdictCopy {
  word: VerdictWord;
  title: string;
  sentence: string;
  silent: boolean;
}

export interface EvansRead {
  sentence: string;
  chips: string[];
}

export interface EvidenceStripStat {
  label: string;
  value: string;
  tone?: "default" | "good" | "warn" | "muted";
}

// ─── Identity / filter primitives ───────────────────────────────────────────
const JUNK_TITLE =
  /^(sponsored|featured|advertisement|click here|see (price|more)|view ad|best sellers? in|results for|shop now)/i;
const PUNCT_SPAM = /([!?$*])\1{4,}/;
const JUNK_STORE = /sponsored|advertis|promoted|^ad\b/i;

const norm = (s: any): string =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const titleKey = (t: any): string => norm(t);

const imageKey = (u: any): string => {
  const raw = String(u ?? "").trim().toLowerCase();
  if (!raw) return "";
  try {
    const m = raw.match(/([a-z0-9]{8,})\.(jpg|jpeg|png|webp)/i);
    return m ? m[1] : raw.split("?")[0];
  } catch {
    return raw;
  }
};

const storeKey = (s: any): string =>
  norm(String(s || "other")).split(" ")[0] || "other";

const safeNum = (n: any): number | null => {
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
};

// ─── Trust predicates ───────────────────────────────────────────────────────
export function isVerifiedListing(card: MarketCard | null | undefined): boolean {
  if (!card) return false;
  return (
    card.evidenceQuality === "verified_listing" && card.clickable !== false
  );
}

export function isVerifiedClickable(
  card: MarketCard | null | undefined,
): boolean {
  if (!card) return false;
  if (!isVerifiedListing(card)) return false;
  return (
    typeof card.directUrl === "string" && card.directUrl.length > 0
  );
}

export function isPricingSignal(card: MarketCard | null | undefined): boolean {
  if (!card) return false;
  if (card.clickable === false) return true;
  if (card.evidenceQuality === "pricing_signal") return true;
  if (card.isPricingEvidenceOnly === true) return true;
  return false;
}

export function isOracleEstimate(
  card: MarketCard | null | undefined,
): boolean {
  return !!card && card.evidenceQuality === "oracle_estimate";
}

export function evidenceLabel(card: MarketCard | null | undefined): string {
  if (!card) return "Market signal";
  if (isVerifiedListing(card)) return "Verified listing";
  if (isOracleEstimate(card)) return "AI estimate";
  if (isPricingSignal(card)) return "Pricing signal";
  return "Market signal";
}

export function cardActionLabel(
  card: MarketCard | null | undefined,
): "View listing" | "Pricing signal" {
  if (
    card &&
    card.clickable !== false &&
    typeof card.directUrl === "string" &&
    card.directUrl.length > 0
  ) {
    return "View listing";
  }
  return "Pricing signal";
}

// ─── Card normalization ─────────────────────────────────────────────────────
/**
 * Normalize a raw market item into a MarketCard. Preserves all source
 * fields under spread so the downstream deck/rail still receive
 * evidenceQuality, isVerifiedListing, isPricingEvidenceOnly, etc.
 */
function normalizeRaw(r: any, fallbackVerdict: string | null): MarketCard {
  const titleStr = String(r?.itemName || r?.title || "").trim();
  const storeStr = String(r?.source || r?.store || "Marketplace").trim();
  const priceN =
    safeNum(r?.price) ??
    safeNum(r?.totalPrice) ??
    safeNum(r?.numericPrice);
  return {
    ...r,
    itemName: titleStr,
    title: titleStr,
    store: storeStr,
    source: storeStr,
    price: priceN,
    totalPrice: safeNum(r?.totalPrice) ?? priceN,
    buyLink: r?.buyLink || r?.url || null,
    url: r?.url || r?.buyLink || null,
    image: r?.image || r?.thumbnail || null,
    thumbnail: r?.thumbnail || r?.image || null,
    buyVerdict: r?.buyVerdict ?? fallbackVerdict ?? null,
    clickable: r?.clickable ?? null,
    evidenceQuality: r?.evidenceQuality ?? null,
    isVerifiedListing: r?.isVerifiedListing ?? null,
    isPricingEvidenceOnly: r?.isPricingEvidenceOnly ?? null,
    directUrl: r?.directUrl ?? null,
    matchScore: safeNum(r?.matchScore),
    visionConfidence: safeNum(r?.visionConfidence),
  };
}

interface CombineOptions {
  /**
   * Maximum total cards to return (hero + alts). Default 8.
   * The rail caps at 7, the deck sits around 6, so 8 leaves headroom.
   */
  maxCards?: number;
  /**
   * Per-store diversity cap. Default 2 (no single retailer floods the deck).
   */
  perStoreCap?: number;
}

/**
 * Build the canonical card array used by the deck and the Best Market
 * Matches rail.
 *
 * Input order:
 *   1. activeResult is the hero (index 0).
 *   2. results / marketPool are the candidate alts. marketPool wins when
 *      present (it's the richer pool of up to 60 items); results acts as
 *      a fallback for older code paths that don't pass marketPool.
 *
 * Output guarantees:
 *   - Hero is always index 0 when activeResult exists.
 *   - Alts are deduped by exact title + image-hash identity.
 *   - Junk SERP rows ("Sponsored", "Best sellers in …", punctuation spam)
 *     are dropped.
 *   - Alts must render: image + finite positive price + ≥5-char title.
 *   - Pricing-signal cards survive (not dropped) — they're labeled
 *     honestly downstream.
 *   - Per-store cap (default 2) prevents one retailer from flooding.
 *   - Sort order: verified+clickable first, then ascending price,
 *     premium anchors (>2.5× scannedPrice) pushed to the tail.
 */
export function buildAllMarketCards(
  activeResult: any,
  results: any[] | undefined,
  marketPool?: any[] | undefined,
  opts: CombineOptions = {},
): MarketCard[] {
  if (!activeResult) return [];
  const maxCards = Math.max(2, opts.maxCards ?? 8);
  const perStoreCap = Math.max(1, opts.perStoreCap ?? 2);

  const heroVerdict = activeResult?.buyVerdict ?? null;
  const hero: MarketCard = normalizeRaw(activeResult, heroVerdict);

  const scannedPrice = safeNum(activeResult?.scannedPrice);
  const anchorThreshold =
    scannedPrice != null ? scannedPrice * 2.5 : Infinity;

  const seenTitles = new Set<string>();
  const seenImages = new Set<string>();
  const heroTitleK = titleKey(hero.itemName);
  const heroImageK = imageKey(hero.image);
  if (heroTitleK) seenTitles.add(heroTitleK);
  if (heroImageK) seenImages.add(heroImageK);

  // Prefer marketPool when present (60-deep), fall back to results (top3-deep).
  const pool: any[] = Array.isArray(marketPool) && marketPool.length > 0
    ? marketPool
    : Array.isArray(results) ? results.slice(1) : [];

  const dedup: MarketCard[] = [];
  for (const r of pool) {
    if (!r) continue;
    const titleStr = String(r?.itemName || r?.title || "").trim();
    const imageStr = r?.image || r?.thumbnail || null;
    const priceN =
      safeNum(r?.price) ??
      safeNum(r?.totalPrice) ??
      safeNum(r?.numericPrice);
    const storeStr = String(r?.source || r?.store || "").trim();

    if (!imageStr) continue;
    if (priceN == null || priceN <= 0) continue;
    if (titleStr.length < 5) continue;
    if (JUNK_TITLE.test(titleStr)) continue;
    if (PUNCT_SPAM.test(titleStr)) continue;
    if (storeStr && JUNK_STORE.test(storeStr)) continue;

    const tk = titleKey(titleStr);
    const ik = imageKey(imageStr);
    if (tk && seenTitles.has(tk)) continue;
    if (ik && seenImages.has(ik)) continue;
    if (tk) seenTitles.add(tk);
    if (ik) seenImages.add(ik);

    dedup.push(normalizeRaw(r, heroVerdict));
    if (dedup.length >= maxCards * 3) break;
  }

  // Re-rank.
  const sorted = dedup.slice().sort((a, b) => {
    const av = isVerifiedClickable(a) ? 0 : 1;
    const bv = isVerifiedClickable(b) ? 0 : 1;
    if (av !== bv) return av - bv;
    const pa = a.price ?? Infinity;
    const pb = b.price ?? Infinity;
    const aIsPrem = pa > anchorThreshold;
    const bIsPrem = pb > anchorThreshold;
    if (aIsPrem !== bIsPrem) return aIsPrem ? 1 : -1;
    if (pa !== pb) return pa - pb;
    const la = String(a.itemName ?? "").length;
    const lb = String(b.itemName ?? "").length;
    return la - lb;
  });

  // Per-store cap.
  const storeCount: Record<string, number> = {};
  const altsDiversified: MarketCard[] = [];
  for (const a of sorted) {
    const sk = storeKey(a.store);
    if ((storeCount[sk] || 0) >= perStoreCap) continue;
    storeCount[sk] = (storeCount[sk] || 0) + 1;
    altsDiversified.push(a);
    if (altsDiversified.length >= maxCards - 1) break;
  }

  return [hero, ...altsDiversified];
}

// ─── Market stats ───────────────────────────────────────────────────────────
export function computeMarketStats(
  cards: MarketCard[],
  _scannedPrice: number | null = null,
): MarketStats {
  const total = cards.length;
  let verifiedCount = 0;
  let pricingSignalCount = 0;
  let oracleCount = 0;
  for (const c of cards) {
    if (isVerifiedListing(c)) verifiedCount += 1;
    if (isPricingSignal(c)) pricingSignalCount += 1;
    if (isOracleEstimate(c)) oracleCount += 1;
  }
  const prices = cards
    .map((c) => safeNum(c.price))
    .filter((p): p is number => p != null && p > 0);
  const low = prices.length ? Math.min(...prices) : null;
  const high = prices.length ? Math.max(...prices) : null;
  let median: number | null = null;
  if (prices.length) {
    const s = prices.slice().sort((a, b) => a - b);
    median = s[Math.floor(s.length / 2)];
  }
  // bestPrice: lowest verified if any, else overall lowest.
  const verifiedPrices = cards
    .filter(isVerifiedListing)
    .map((c) => safeNum(c.price))
    .filter((p): p is number => p != null && p > 0);
  const bestPrice = verifiedPrices.length ? Math.min(...verifiedPrices) : low;

  let strongestVisualMatch: number | null = null;
  for (const c of cards) {
    const m = safeNum(c.matchScore) ?? safeNum(c.visionConfidence);
    if (m == null) continue;
    if (strongestVisualMatch == null || m > strongestVisualMatch) {
      strongestVisualMatch = m;
    }
  }

  const spreadMultiplier =
    low != null && high != null && low > 0 ? high / low : null;

  let priceSpreadLabel: MarketStats["priceSpreadLabel"] = "moderate";
  if (total <= 2 || spreadMultiplier == null) priceSpreadLabel = "thin";
  else if (spreadMultiplier >= 3.0) priceSpreadLabel = "wide";
  else if (spreadMultiplier <= 1.35) priceSpreadLabel = "tight";

  return {
    totalMatches: total,
    shownMatches: total,
    verifiedCount,
    pricingSignalCount,
    oracleCount,
    lowPrice: low,
    highPrice: high,
    medianPrice: median,
    bestPrice,
    hasDirectListings: verifiedCount > 0,
    hasOnlyPricingSignals:
      verifiedCount === 0 && (pricingSignalCount > 0 || total > 0),
    strongestVisualMatch,
    priceSpreadLabel,
    spreadMultiplier,
  };
}

// ─── Verdict copy ───────────────────────────────────────────────────────────
export function deriveVerdictCopy(
  activeResult: any,
  stats: MarketStats,
): VerdictCopy {
  const rawVerdict = String(activeResult?.buyVerdict || "").toUpperCase();
  const scanned = safeNum(activeResult?.scannedPrice);
  const avg = safeNum(activeResult?.avgMarket);
  const saved = safeNum(activeResult?.savedAmount);
  const cheaperPct = safeNum(activeResult?.cheaperPct);
  const conf = safeNum(activeResult?.visionConfidence) ?? 0;
  const upstreamTotalMatches = safeNum(activeResult?.totalMatches) ?? 0;

  // Silent / HOLD branch: triggered by upstream HOLD, thin comp signal,
  // or low visual confidence. Mirrors the existing resolveVerdictTone
  // logic from ResultsContent so the new compact verdict module
  // preserves the "Bloomberg-calm declines to call it" UX.
  const tooFewComps =
    stats.totalMatches < 2 && upstreamTotalMatches < 3;
  const lowVision = conf > 0 && conf < 0.45;
  const upstreamHold = rawVerdict === "HOLD";
  const silent = upstreamHold || tooFewComps || lowVision;

  const onlySignals =
    stats.verifiedCount === 0 && stats.totalMatches > 0;
  const onlySignalsAppend = onlySignals
    ? " Most evidence here is pricing signal only, not verified direct listings."
    : "";

  if (silent) {
    return {
      word: "HOLD",
      title: "Mixed resale signal",
      sentence:
        "Evan found market evidence, but the spread or direct-link confidence is not strong enough for a clean buy." +
        onlySignalsAppend,
      silent: true,
    };
  }

  const isBuy =
    rawVerdict === "BUY" ||
    (rawVerdict === "" &&
      ((saved != null && saved > 0) ||
        (cheaperPct != null && cheaperPct > 5) ||
        (avg != null && scanned != null && avg > scanned)));

  if (isBuy) {
    return {
      word: "BUY",
      title: "Market edge found",
      sentence:
        "Evan found resale evidence above your cost with enough signal to justify a closer look." +
        onlySignalsAppend,
      silent: false,
    };
  }

  return {
    word: "PASS",
    title: "Not enough edge",
    sentence:
      "This looks above the current resale market. Evan found price evidence, but not enough upside to recommend buying." +
      onlySignalsAppend,
    silent: false,
  };
}

// ─── Headline numbers for the compact verdict ───────────────────────────────
export interface VerdictNumbers {
  costLabel: "Your cost" | "Cost";
  cost: number | null;
  marketLabel: "Market" | "Best market" | "Median";
  market: number | null;
  /** Signed delta (cost − market). Negative = you're paying under market. */
  delta: number | null;
  /** Percent below/above market. Positive = above market. */
  deltaPct: number | null;
}

export function deriveVerdictNumbers(
  activeResult: any,
  stats: MarketStats,
): VerdictNumbers {
  const scanned = safeNum(activeResult?.scannedPrice);
  const avgUpstream = safeNum(activeResult?.avgMarket);
  // Prefer the median we computed across the actual cards over the upstream
  // avg — it tracks the user's visible market spread rather than the wider
  // pool. Fall back to the upstream avg when we don't have enough cards
  // to compute a credible median.
  const market =
    stats.medianPrice != null
      ? stats.medianPrice
      : avgUpstream != null
        ? avgUpstream
        : stats.bestPrice;
  let delta: number | null = null;
  let deltaPct: number | null = null;
  if (scanned != null && market != null && market > 0) {
    delta = scanned - market;
    deltaPct = (delta / market) * 100;
  }
  return {
    costLabel: "Your cost",
    cost: scanned,
    marketLabel: stats.medianPrice != null ? "Median" : "Market",
    market,
    delta,
    deltaPct,
  };
}

// ─── Evidence strip ─────────────────────────────────────────────────────────
export function deriveEvidenceStripStats(
  stats: MarketStats,
): EvidenceStripStat[] {
  const out: EvidenceStripStat[] = [];
  out.push({
    label: "Matches",
    value: String(stats.totalMatches),
    tone: stats.totalMatches >= 6 ? "default" : "muted",
  });
  if (stats.lowPrice != null) {
    out.push({ label: "Low", value: fmtCompactMoney(stats.lowPrice) });
  }
  if (
    stats.highPrice != null &&
    stats.highPrice !== stats.lowPrice
  ) {
    out.push({ label: "High", value: fmtCompactMoney(stats.highPrice) });
  }
  out.push({
    label: "Verified",
    value: String(stats.verifiedCount),
    tone: stats.verifiedCount > 0 ? "good" : "warn",
  });
  if (stats.pricingSignalCount > 0) {
    out.push({
      label: "Signals",
      value: String(stats.pricingSignalCount),
      tone: stats.verifiedCount > 0 ? "muted" : "default",
    });
  }
  return out;
}

function fmtCompactMoney(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 10000) return `$${Math.round(n / 1000)}k`;
  if (n >= 100) return `$${Math.round(n)}`;
  // Strip cents when they're .00 so the strip reads "$30" not "$30.00".
  return fmtMoney(n).replace(/\.00$/, "");
}

// ─── Evan's Read ────────────────────────────────────────────────────────────
export function deriveEvansRead(
  activeResult: any,
  stats: MarketStats,
  verdict: VerdictCopy,
): EvansRead {
  const cheaperPct = safeNum(activeResult?.cheaperPct);

  let sentence = "";
  if (verdict.word === "PASS") {
    if (stats.hasOnlyPricingSignals) {
      sentence =
        "This is a risky buy. Evan found price evidence below your entered cost, but no verified direct listing from this source. Treat this as a market signal, not a guaranteed sell-through price.";
    } else if (stats.totalMatches <= 2) {
      sentence =
        "Evan can see the listing but not a real market around it. Without more comps, there's no upside Evan can stand behind.";
    } else {
      sentence =
        "The resale market sits below your cost. Verified listings exist, but none clear a margin Evan trusts.";
    }
  } else if (verdict.silent || verdict.word === "HOLD") {
    sentence =
      "The market is mixed. Evan found comparable prices, but the spread is wide or the evidence is too thin to recommend a buy.";
  } else {
    if (stats.hasOnlyPricingSignals) {
      sentence =
        "There's upside on paper, but no verified direct listings backing it. Treat the resale price as a signal, not a contract.";
    } else if (stats.totalMatches >= 4) {
      sentence =
        "This has real market edge. Evan found multiple comparable listings above your cost with enough signal to justify checking the best one.";
    } else {
      sentence =
        "This looks like an edge, but the market underneath it is thin. Verified listings exist — just not many.";
    }
  }

  const chips: string[] = [];
  if (stats.verifiedCount > 0) chips.push("Verified listings found");
  if (stats.hasOnlyPricingSignals) chips.push("Pricing signal only");
  if (stats.priceSpreadLabel === "wide") chips.push("Wide spread");
  if (stats.priceSpreadLabel === "thin" || stats.totalMatches < 4) {
    chips.push("Thin market");
  }
  if (
    stats.strongestVisualMatch != null &&
    stats.strongestVisualMatch >= 0.7
  ) {
    chips.push("Strong visual match");
  } else if (
    stats.strongestVisualMatch != null &&
    stats.strongestVisualMatch < 0.5
  ) {
    chips.push("Low direct-link confidence");
  }
  if (
    verdict.word === "BUY" &&
    cheaperPct != null &&
    cheaperPct >= 15 &&
    !stats.hasOnlyPricingSignals
  ) {
    chips.push("Good upside");
  }
  if (verdict.word === "PASS") chips.push("Weak resale");
  if (verdict.silent || verdict.word === "HOLD") chips.push("Mixed market");

  // Dedup + cap at 4.
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of chips) {
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
    if (out.length >= 4) break;
  }
  return { sentence, chips: out };
}

// ─── Rail / mini-card helpers ───────────────────────────────────────────────
export function deriveMatchPercent(card: MarketCard): number | null {
  const m =
    safeNum(card.matchScore) ?? safeNum(card.visionConfidence);
  if (m == null) return null;
  // matchScore/visionConfidence land in [0,1]. Clamp + round.
  const v = Math.max(0, Math.min(1, m));
  return Math.round(v * 100);
}

/**
 * Bullets for the card body. Two short proof points, evidence-aware.
 * Never claims "verified" without verification.
 */
export function deriveCardBullets(
  card: MarketCard,
  isLowest: boolean,
): string[] {
  const out: string[] = [];
  const matchPct = deriveMatchPercent(card);
  if (matchPct != null && matchPct >= 50) {
    out.push(`Visual match ${matchPct}%`);
  }
  if (isLowest) {
    if (isVerifiedListing(card)) out.push("Lowest verified price");
    else if (isPricingSignal(card)) out.push("Lowest pricing signal");
    else if (isOracleEstimate(card)) out.push("AI estimate · lowest");
    else out.push("Lowest in current set");
  } else if (isVerifiedListing(card)) {
    out.push("Direct listing available");
  } else if (isPricingSignal(card)) {
    out.push("Price evidence only");
  } else if (isOracleEstimate(card)) {
    out.push("Market price signal");
  }
  return out.slice(0, 2);
}

/**
 * One-line summary used by the rail mini-card under price/source.
 * Combines evidence label with match % when available.
 */
export function deriveMiniCardSubtitle(card: MarketCard): string {
  const label = evidenceLabel(card);
  const pct = deriveMatchPercent(card);
  return pct != null ? `${label} · ${pct}%` : label;
}
