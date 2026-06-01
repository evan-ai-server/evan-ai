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
 *                                   → labeled "Market signal" in user-facing UI
 *   - cardActionLabel returns "View listing" ONLY when there is a real
 *     directUrl AND clickable is not false. Otherwise "Market signal"
 *     so the dock CTA never tries to open a URL it doesn't have.
 *
 * User-facing label policy (Pillar 1.5):
 *   The internal evidenceQuality value stays "pricing_signal" so backend
 *   field shape never changes, but every helper that produces text shown
 *   to a human emits "Market signal" instead. This is a deliberate
 *   trust-language change: "pricing signal" reads like jargon; "market
 *   signal" tells the user honestly that there's evidence but no direct
 *   verified listing. One name, one place.
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

// ─── Phase 4A.2: Evidence calibration reader ────────────────────────────────
// Normalized view of the backend's confidenceCalibration object. Used by
// deriveVerdictCopy and deriveEvansRead to gate language strength.

/** Evidence tiers that carry insufficient certainty for strong positive claims. */
const WEAK_EVIDENCE_TIERS = new Set([
  "pricing_signal_only",
  "thin_pricing_signal",
  "estimate_only",
  "no_evidence",
  "unknown",
]);

export interface CalibrationRead {
  evidenceTier: string;
  verdictStrength: string;
  capReasons: string[];
  canShowStrongLanguage: boolean;
  canShowVerifiedLanguage: boolean;
  canShowMedianAsAuthoritative: boolean;
  verifiedListingCount: number;
  pricingSignalCount: number;
  calibratedConfidence: number | null;
  confidenceCap: number | null;
  explanationForUI: string | null;
  hasCalibration: boolean;
}

/**
 * Safely extract Phase 4A.1 confidence calibration from the active scan result.
 * Priority: confidenceCalibration object → buyOrPass mirrors → legacy card fields.
 * Missing data always resolves conservatively, never confidently.
 */
export function readCalibration(activeResult: any): CalibrationRead {
  // 1. Full confidenceCalibration object (Phase 4A.1+)
  const cal = activeResult?.confidenceCalibration;
  if (cal && typeof cal === "object") {
    return {
      evidenceTier:                String(cal.evidenceTier ?? "unknown"),
      verdictStrength:             String(cal.verdictStrengthCap ?? cal.verdictStrength ?? "soft"),
      capReasons:                  Array.isArray(cal.capReasons) ? cal.capReasons : [],
      canShowStrongLanguage:       cal.canShowStrongLanguage === true,
      canShowVerifiedLanguage:     cal.canShowVerifiedLanguage === true,
      canShowMedianAsAuthoritative: cal.canShowMedianAsAuthoritative === true,
      verifiedListingCount:        Number(cal.evidence?.verifiedListingCount ?? 0),
      pricingSignalCount:          Number(cal.evidence?.pricingSignalCount ?? 0),
      calibratedConfidence:        safeNum(cal.calibratedConfidence),
      confidenceCap:               safeNum(cal.confidenceCap),
      explanationForUI:            typeof cal.explanationForUI === "string" ? cal.explanationForUI : null,
      hasCalibration:              true,
    };
  }

  // 2. buyOrPass mirror fields (Phase 4A.1 convenience mirrors)
  const bop = activeResult?.buyOrPass;
  if (bop && (bop.evidenceTier || bop.verdictStrength)) {
    const tier = String(bop.evidenceTier ?? "unknown");
    const strength = String(bop.verdictStrength ?? "soft");
    const isVerifiedTier = tier === "verified_strong" || tier === "verified_moderate" || tier === "verified_thin";
    return {
      evidenceTier:                tier,
      verdictStrength:             strength,
      capReasons:                  Array.isArray(bop.capReasons) ? bop.capReasons : [],
      canShowStrongLanguage:       strength === "strong",
      canShowVerifiedLanguage:     isVerifiedTier && strength !== "evidence_limited",
      canShowMedianAsAuthoritative: strength !== "evidence_limited" && !WEAK_EVIDENCE_TIERS.has(tier),
      verifiedListingCount:        0,
      pricingSignalCount:          0,
      calibratedConfidence:        null,
      confidenceCap:               null,
      explanationForUI:            null,
      hasCalibration:              true,
    };
  }

  // 3. Legacy fallback: infer from hero-card evidenceQuality / clickable flags.
  const eq = activeResult?.evidenceQuality;
  const isVerifiedLegacy =
    eq === "verified_listing" ||
    activeResult?.isVerifiedListing === true ||
    activeResult?.clickable === true;
  const isPricingLegacy =
    eq === "pricing_signal" || activeResult?.clickable === false;

  if (isVerifiedLegacy) {
    return {
      evidenceTier: "verified_thin", verdictStrength: "soft",
      capReasons: [], canShowStrongLanguage: false,
      canShowVerifiedLanguage: true, canShowMedianAsAuthoritative: false,
      verifiedListingCount: 1, pricingSignalCount: 0,
      calibratedConfidence: null, confidenceCap: null,
      explanationForUI: null, hasCalibration: false,
    };
  }
  if (isPricingLegacy) {
    return {
      evidenceTier: "pricing_signal_only", verdictStrength: "evidence_limited",
      capReasons: ["no_verified_listings"], canShowStrongLanguage: false,
      canShowVerifiedLanguage: false, canShowMedianAsAuthoritative: false,
      verifiedListingCount: 0, pricingSignalCount: 0,
      calibratedConfidence: null, confidenceCap: null,
      explanationForUI: null, hasCalibration: false,
    };
  }

  // Unknown — conservative defaults
  return {
    evidenceTier: "unknown", verdictStrength: "soft",
    capReasons: [], canShowStrongLanguage: false,
    canShowVerifiedLanguage: false, canShowMedianAsAuthoritative: false,
    verifiedListingCount: 0, pricingSignalCount: 0,
    calibratedConfidence: null, confidenceCap: null,
    explanationForUI: null, hasCalibration: false,
  };
}

// Dev-only logging — fires at most once per new scan (called from inside useMemo deps).
// Declared at module level so it's tree-shaken in production builds.
const _devLog = typeof __DEV__ !== "undefined" && __DEV__
  ? (tag: string, data: Record<string, unknown>) => { console.log(tag, data); }
  : () => undefined;

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
  // Pillar 1.5 — unify pricing-only evidence under one user-facing
  // label. Both pricing signals and unclassified rows present as
  // "Market signal" so the UI stops bouncing between names.
  if (isPricingSignal(card)) return "Market signal";
  return "Market signal";
}

/**
 * Pillar 1.6 — tight-context evidence label. Returns a single short
 * word ("Verified" / "Signal" / "AI") for chip surfaces where the full
 * "Market signal" string truncates (e.g. the card meta-row chip on
 * iPhone width). Dock CTA, rail subtitle, and Evan's Read keep the
 * full evidenceLabel since they have room. Same trust gates apply —
 * "Verified" still requires verified_listing + clickable !== false.
 */
export function evidenceLabelShort(
  card: MarketCard | null | undefined,
): string {
  if (!card) return "Signal";
  if (isVerifiedListing(card)) return "Verified";
  if (isOracleEstimate(card)) return "AI";
  if (isPricingSignal(card)) return "Signal";
  return "Signal";
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
  // Pillar 2.1 — was "Market signal". Renamed to "Pricing signal" so the
  // primary dock CTA reads with distinct vocabulary from the depth-row
  // badge ("SIGNAL") and the card meta chip ("Signal"). Same concept,
  // less semantic fatigue. Trust posture (non-clickable) is unchanged.
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

  // Phase 4A.2: read calibration before computing silence so we can apply
  // the evidence-limited BUY→HOLD frontend defense before any early return.
  const calib = readCalibration(activeResult);
  const isWeakEvidence = WEAK_EVIDENCE_TIERS.has(calib.evidenceTier);
  const isEvidenceLimited = calib.verdictStrength === "evidence_limited";

  // A PASS that came from the calibration layer (scanned price far above
  // pricing signals) is a valid PASS — keep it, don't silence it.
  const isSignalPass =
    calib.capReasons.includes("pricing_signal_against_high_scan_price") ||
    calib.capReasons.includes("pass_on_pricing_signal_above_market");

  // Compute isBuy before the silent check so forceSilentByCalibration can
  // reference it (evidence_limited BUY → display as HOLD).
  const isBuy =
    rawVerdict === "BUY" ||
    (rawVerdict === "" &&
      ((saved != null && saved > 0) ||
        (cheaperPct != null && cheaperPct > 5) ||
        (avg != null && scanned != null && avg > scanned)));

  // Silent / HOLD branch: triggered by upstream HOLD, thin comp signal,
  // low visual confidence, OR calibration showing evidence_limited on a BUY.
  // Mirrors the existing resolveVerdictTone logic from ResultsContent.
  const tooFewComps = stats.totalMatches < 2 && upstreamTotalMatches < 3;
  const lowVision = conf > 0 && conf < 0.45;
  const upstreamHold = rawVerdict === "HOLD";
  // Defense-in-depth: backend may have let a BUY through on evidence_limited
  // evidence (e.g., pricing signals with high rejection ratio). Display as
  // HOLD so the UI never claims "Market edge found" on unverified signals.
  const forceSilentByCalibration = isBuy && isEvidenceLimited && !isSignalPass;
  const silent = upstreamHold || tooFewComps || lowVision || forceSilentByCalibration;

  const onlySignals = stats.verifiedCount === 0 && stats.totalMatches > 0;
  const onlySignalsAppend = onlySignals
    ? " Most evidence here is market signal only, not verified direct listings."
    : "";

  // Dev log — fires once per new scan result (inside useMemo)
  _devLog("FRONTEND_CALIBRATION_READ", {
    evidenceTier: calib.evidenceTier,
    verdictStrength: calib.verdictStrength,
    canShowStrongLanguage: calib.canShowStrongLanguage,
    canShowVerifiedLanguage: calib.canShowVerifiedLanguage,
    canShowMedianAsAuthoritative: calib.canShowMedianAsAuthoritative,
    verifiedListingCount: calib.verifiedListingCount,
    pricingSignalCount: calib.pricingSignalCount,
    hasCalibration: calib.hasCalibration,
  });

  if (silent) {
    // Evidence-limited silence gets its own copy that names the evidence gap
    // rather than the generic "spread not strong enough" fallback.
    const title = forceSilentByCalibration ? "Limited evidence" : "Mixed resale signal";
    const baseSentence = forceSilentByCalibration
      ? "Evan found pricing signals, but no verified direct listings. Treat this as caution — check the market yourself before buying."
      : "Evan found market evidence, but the spread or direct-link confidence is not strong enough for a clean buy.";
    const result: VerdictCopy = {
      word: "HOLD",
      title,
      sentence: baseSentence + onlySignalsAppend,
      silent: true,
    };
    _devLog("FRONTEND_VERDICT_COPY_CALIBRATED", {
      rawVerdict,
      displayVerdict: result.word,
      evidenceTier: calib.evidenceTier,
      verdictStrength: calib.verdictStrength,
      strongLanguageAllowed: calib.canShowStrongLanguage,
      verifiedLanguageAllowed: calib.canShowVerifiedLanguage,
      reason: forceSilentByCalibration ? "evidence_limited_buy_silenced" : "existing_silent_trigger",
    });
    return result;
  }

  if (isBuy) {
    // canShowStrongLanguage requires verified_strong or verified_moderate
    // with all conditions met. Only then do we say "Market edge found."
    // On pricing-signal-only evidence, soften the title.
    const title = calib.canShowStrongLanguage
      ? "Market edge found"
      : isWeakEvidence
        ? "Pricing signal edge"
        : "Potential edge found";
    const sentence = calib.canShowVerifiedLanguage
      ? "Evan found verified listings above your cost. Check the best one before buying." + onlySignalsAppend
      : isWeakEvidence
        ? "There's upside in the pricing signals, but no verified direct listings. Treat this as a signal, not a contract." + onlySignalsAppend
        : "Evan found resale evidence above your cost with enough signal to justify a closer look." + onlySignalsAppend;
    const result: VerdictCopy = { word: "BUY", title, sentence, silent: false };
    _devLog("FRONTEND_VERDICT_COPY_CALIBRATED", {
      rawVerdict,
      displayVerdict: result.word,
      evidenceTier: calib.evidenceTier,
      verdictStrength: calib.verdictStrength,
      strongLanguageAllowed: calib.canShowStrongLanguage,
      verifiedLanguageAllowed: calib.canShowVerifiedLanguage,
      reason: "buy_path",
    });
    return result;
  }

  // PASS — may be a pricing-signal PASS (price clearly above market signals)
  const passTitle = isSignalPass ? "Above pricing signals" : "Not enough edge";
  const passSentence = isSignalPass
    ? "This looks above the active pricing signal range. There are no verified listings — this is a signal-based call, not confirmed resale data."
    : "This looks above the current resale market. Evan found price evidence, but not enough upside to recommend buying." + onlySignalsAppend;

  const result: VerdictCopy = { word: "PASS", title: passTitle, sentence: passSentence, silent: false };
  _devLog("FRONTEND_VERDICT_COPY_CALIBRATED", {
    rawVerdict,
    displayVerdict: result.word,
    evidenceTier: calib.evidenceTier,
    verdictStrength: calib.verdictStrength,
    strongLanguageAllowed: calib.canShowStrongLanguage,
    verifiedLanguageAllowed: calib.canShowVerifiedLanguage,
    reason: isSignalPass ? "signal_pass" : "pass_path",
  });
  return result;
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
// Pillar 1.5 — the strip now reads as a sentence:
//   "{N} CHECKED · {M} MATCH(ES) · ${X} LOW · {K} VERIFIED · SIGNAL ONLY"
//
// Cells:
//   - "Checked": raw pool count (the listings Evan examined). Only emitted
//     when listingsChecked > totalMatches so we don't show the same number
//     twice.
//   - "Match" / "Matches": built strong-match count, singular/plural correct.
//   - "Low" / "High": price range. High is suppressed when equal to low.
//   - "Verified": direct verified count, "good" tone when >0, "warn" tone
//     when 0 (so the eye lands on the trust gap).
//   - "Signal only" warn pill: appended when verified=0 AND totalMatches>0
//     so the user knows the supporting evidence is signal-grade, not
//     direct-listing-grade. Replaces the legacy "Signals" numeric cell
//     for that case so the strip never reads as "0 Verified · 1 Signals"
//     (jargon) — it now reads "0 Verified · Signal only" (honest).
export function deriveEvidenceStripStats(
  stats: MarketStats,
  listingsChecked?: number | null,
): EvidenceStripStat[] {
  const out: EvidenceStripStat[] = [];
  const checked = Math.max(0, Math.floor(Number(listingsChecked ?? 0)));

  // "Checked" cell — only when it adds information beyond the built count.
  if (checked > 0 && checked > stats.totalMatches) {
    out.push({
      label: "Checked",
      value: String(checked),
      tone: "muted",
    });
  }

  const matchLabel = stats.totalMatches === 1 ? "Match" : "Matches";
  out.push({
    label: matchLabel,
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

  // Pillar 2.1 — only emit the numeric "Verified" cell when there ARE
  // verified comps. Showing "0 VERIFIED" felt harsh ("then why trust any
  // of this?"); the trailing "Signal only" pill below carries the same
  // information honestly without the panic-inducing zero.
  if (stats.verifiedCount > 0) {
    out.push({
      label: "Verified",
      value: String(stats.verifiedCount),
      tone: "good",
    });
  }

  if (stats.verifiedCount === 0 && stats.totalMatches > 0) {
    // Honest trailing pill — no number, just the trust label. Rendered
    // by MarketEvidenceStrip as a value-less cell (label-only).
    out.push({
      label: "Signal only",
      value: "",
      tone: "warn",
    });
  } else if (stats.verifiedCount > 0 && stats.pricingSignalCount > 0) {
    // When we DO have verified evidence, keep the numeric "Signals" cell
    // so the user can still see the pricing-signal depth in context.
    out.push({
      label: "Signals",
      value: String(stats.pricingSignalCount),
      tone: "muted",
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

  // Phase 4A.2: read calibration to sharpen Evan's sentence when evidence tier
  // is weak. If the backend gave us an explanationForUI, prefer it in HOLD path.
  const calib = readCalibration(activeResult);
  const isWeakEvidence = WEAK_EVIDENCE_TIERS.has(calib.evidenceTier);
  const isEvidenceLimited = calib.verdictStrength === "evidence_limited";

  let sentence = "";
  if (verdict.word === "PASS") {
    const isSignalPass =
      calib.capReasons.includes("pricing_signal_against_high_scan_price") ||
      calib.capReasons.includes("pass_on_pricing_signal_above_market");
    if (isSignalPass) {
      sentence =
        "Pricing signals place this above the current resale range. Evan hasn't found verified direct listings — treat this as a signal-based assessment.";
    } else if (stats.hasOnlyPricingSignals) {
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
    // Pillar 2.1 — sharpened HOLD voice. Phase 4A.2: when calibration gave us
    // an explanationForUI (e.g. "Pricing signal only — no verified direct
    // listings"), prefer it over the generic spread/evidence sentence so Evan
    // names the actual reason rather than a generic caution.
    if (isEvidenceLimited && calib.explanationForUI) {
      sentence = calib.explanationForUI + " Verify the market yourself before committing.";
    } else if (isEvidenceLimited) {
      sentence =
        "Evan found pricing signals but no verified direct listings. This is caution, not a call — verify the market before buying.";
    } else {
      sentence =
        "Comparables exist, but the spread is wide and the verified evidence is thin. Treat this as caution, not a confident call.";
    }
  } else {
    // BUY path — use calibration to pick the right confidence level in copy.
    if (isWeakEvidence || stats.hasOnlyPricingSignals) {
      sentence =
        "There's upside in the pricing signals, but no verified direct listings back it. Treat the resale price as a signal, not a contract.";
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
  // Pillar 2.1 — "Market signal only" → "Signal-only evidence".
  if (stats.hasOnlyPricingSignals) chips.push("Signal-only evidence");
  // Phase 4A.2: add calibration-tier chip when evidence is weak AND we don't
  // already have a signal-only chip (avoid duplication).
  if (isEvidenceLimited && !stats.hasOnlyPricingSignals && stats.totalMatches > 0) {
    chips.push("Evidence limited");
  }
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
    !stats.hasOnlyPricingSignals &&
    !isWeakEvidence
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
    // Pillar 2.1 — "Lowest market signal" → "Lowest pricing signal".
    // Avoids the third repetition of "market signal" on the same screen.
    else if (isPricingSignal(card)) out.push("Lowest pricing signal");
    else if (isOracleEstimate(card)) out.push("AI estimate · lowest");
    else out.push("Lowest in current set");
  } else if (isVerifiedListing(card)) {
    out.push("Direct listing available");
  } else if (isPricingSignal(card)) {
    out.push("Pricing signal only");
  } else if (isOracleEstimate(card)) {
    out.push("AI market estimate");
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
