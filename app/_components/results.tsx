import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ScrollView,
  ActivityIndicator,
  Modal,
  Linking,
  Alert,
  Platform,
} from "react-native";

type ScoredListing = {
  listing: Listing;
  score: number; // 0..1
  reasons: string[]; // short trust signals
  flags: string[]; // warnings
};

type Listing = {
  id: string;
  title: string;
  price?: number | null;
  marketplace?: string | null; // e.g. "eBay", "Walmart"
  seller?: string | null;
  imageUrl?: string | null;
  url: string;
};

type MarketRange = {
  low?: number | null;
  avg?: number | null;
  high?: number | null;
};

type ResultsScreenProps = {
  // Scan / item
  scanImageUri?: string | null;
  itemLabel?: string | null; // e.g. "Stanford University S logo baseball cap"
  confidence?: number | null; // 0..1

  // Pricing
  marketRange?: MarketRange | null;
  myPrice?: number | null; // price user entered or current price
  currencySymbol?: string; // "$"

  // Listings
  topListings?: Listing[]; // top 3 cheapest matches

  // Loading overlay (Show me cheaper flow)
  isCheckingListings?: boolean;
  checkingTitle?: string; // "Checking more listings.."
  checkingSubtitle?: string; // "Searching the web for cheaper matches."
  onCancelChecking?: () => void;
  onRetryChecking?: () => void;

  // Primary actions
  onNewScan?: () => void;
  onShowMeCheaper?: () => void;
  onTrackPrice?: () => void;

  // Listing actions
  onOpenListing?: (listing: Listing) => void; // optional hook
  onCopyAllLinks?: () => void;
  onShareResults?: () => void;

  // History navigation hook (optional)
  onGoToHistory?: () => void;
};

const TRUSTED_HOSTS = new Set<string>([
  "amazon.com",
  "ebay.com",
  "walmart.com",
  "target.com",
  "bestbuy.com",
  "etsy.com",
  "mercari.com",
  "poshmark.com",
  "aliexpress.com",
  "costco.com",
]);

function clamp01(n: number) {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function money(symbol: string, n?: number | null) {
  if (typeof n !== "number" || !isFinite(n)) return "—";
  const fixed = n % 1 === 0 ? n.toFixed(0) : n.toFixed(2);
  return `${symbol}${fixed}`;
}

function normalizeText(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/[\u2019']/g, "'")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string) {
  const stop = new Set([
    "the","and","for","with","a","an","to","of","in","on","at","by","from",
    "new","sale","free","shipping","authentic","genuine","original",
  ]);
  return normalizeText(s)
    .split(" ")
    .filter(Boolean)
    .filter((t) => t.length >= 2 && !stop.has(t));
}

function jaccard(a: string[], b: string[]) {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  if (!union) return 0;
  return inter / union;
}

function hasBadKeyword(s: string) {
  const t = normalizeText(s);
  const bad = [
    "replica","knockoff","fake","counterfeit","dupe",
    "case","cover","skin","sticker","decal","replacement",
    "bundle","lot","set of","pack","assorted",
    "for iphone","for samsung","for ipad","for macbook",
  ];
  return bad.some((k) => t.includes(k));
}

function extractBrandToken(tokens: string[]) {
  // heuristic: first “strong” token often acts as brand
  // avoid generic words
  const blacklist = new Set(["university","official","baseball","cap","hat","shirt","hoodie","jacket","men","women","kids"]);
  for (const t of tokens) {
    if (t.length >= 3 && !blacklist.has(t)) return t;
  }
  return null;
}

function priceOutlierPenalty(price?: number | null, marketAvg?: number | null) {
  if (typeof price !== "number" || !isFinite(price)) return { mult: 0.75, flag: "Missing price" };
  if (typeof marketAvg !== "number" || !isFinite(marketAvg) || marketAvg <= 0) return { mult: 1, flag: "" };

  const ratio = price / marketAvg;

  // suspiciously low compared to market (common scam / wrong item / accessory)
  if (ratio <= 0.45) return { mult: 0.55, flag: "Suspiciously low vs market" };
  if (ratio <= 0.70) return { mult: 0.75, flag: "Low vs market" };

  // very high doesn't hurt trust, but hurts “cheapest relevance” vibes slightly
  if (ratio >= 1.8) return { mult: 0.90, flag: "" };

  return { mult: 1, flag: "" };
}

function scoreListingAgainstLabel(listingTitle: string, itemLabel: string) {
  const labelTokens = tokenize(itemLabel);
  const titleTokens = tokenize(listingTitle);

  const overlap = jaccard(labelTokens, titleTokens);

  const labelBrand = extractBrandToken(labelTokens);
  const titleBrand = extractBrandToken(titleTokens);
  const brandHit = labelBrand && titleBrand && labelBrand === titleBrand ? 1 : 0;

  const bad = hasBadKeyword(listingTitle) ? 1 : 0;

  // weighted score
  let score = overlap * 0.75 + brandHit * 0.25;
  if (bad) score *= 0.55; // hard penalty

  // reasons + flags for UI trust
  const reasons: string[] = [];
  const flags: string[] = [];

  if (overlap >= 0.45) reasons.push("High title match");
  else if (overlap >= 0.28) reasons.push("Good title match");
  else reasons.push("Partial match");

  if (brandHit) reasons.push("Brand match");
  if (bad) flags.push("Possible accessory / replica / bundle");

  // clamp
  if (score < 0) score = 0;
  if (score > 1) score = 1;

  return { score, reasons, flags };
}

function getHost(url: string) {
  // RN-safe host parse (no global URL dependency)
  const s = (url || "").trim();
  const m = s.match(/^(https?:\/\/)?([^\/?#]+)(\/|$)/i);
  const host = (m?.[2] ?? "").toLowerCase();
  return host;
}

function isTrustedUrl(url: string) {
  const host = getHost(url);
  if (!host) return false;

  // normalize: strip leading "www."
  const h = host.startsWith("www.") ? host.slice(4) : host;

  // build base trusted list (also stripped)
  for (const raw of TRUSTED_HOSTS) {
    const t = raw.startsWith("www.") ? raw.slice(4) : raw;

    if (h === t) return true;          // exact match
    if (h.endsWith(`.${t}`)) return true; // subdomain match (m.ebay.com)
  }

  return false;
}


async function safeOpenUrl(url: string) {
  const trusted = isTrustedUrl(url);

if (!trusted) {
  Alert.alert(
    "Unverified link",
    "This seller’s website isn’t a trusted marketplace. Open anyway?",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Open",
        style: "destructive",
        onPress: async () => {
          try {
            await Linking.openURL(url);
          } catch {
            Alert.alert("Couldn’t open link", "Please try again.");
          }
        },
      },
    ]
  );
  return;
}

  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Couldn’t open link", "Please try again.");
  }
}

function verdictFrom(myPrice?: number | null, avg?: number | null) {
  if (typeof myPrice !== "number" || !isFinite(myPrice)) return { label: "NO PRICE", tone: "neutral" as const };
  if (typeof avg !== "number" || !isFinite(avg)) return { label: "NO MARKET", tone: "neutral" as const };

  const ratio = myPrice / avg;

  if (ratio <= 0.8) return { label: "STEAL", tone: "good" as const };
  if (ratio <= 1.05) return { label: "FAIR", tone: "neutral" as const };
  return { label: "OVERPRICED", tone: "bad" as const };
}

export default function ResultsScreen(props: ResultsScreenProps) {
  const symbol = props.currencySymbol ?? "$";
  const scanUri = props.scanImageUri ?? null;

  const confidence = useMemo(() => {
    const c = typeof props.confidence === "number" ? clamp01(props.confidence) : null;
    return c;
  }, [props.confidence]);

const market = useMemo(() => {
  const m = props.marketRange ?? {};
  const hasAny = typeof m.low === "number" || typeof m.avg === "number" || typeof m.high === "number";
  if (hasAny) return m;

  const prices = (props.topListings ?? [])
    .map((x) => (typeof x.price === "number" && isFinite(x.price) ? x.price : null))
    .filter((x): x is number => x != null);

  if (!prices.length) return {};

  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;

  return { low, avg, high };
}, [props.marketRange, props.topListings]);

  const avg = typeof market?.avg === "number" ? market.avg : null;

  const verdict = useMemo(() => verdictFrom(props.myPrice ?? null, avg), [props.myPrice, avg]);

  const savings = useMemo(() => {
    const my = props.myPrice;
    if (typeof my !== "number" || !isFinite(my)) return null;
    if (typeof avg !== "number" || !isFinite(avg)) return null;
    return avg - my;
  }, [props.myPrice, avg]);

const scoredTop = useMemo<ScoredListing[]>(() => {
  const label = (props.itemLabel ?? "").trim();
  const raw = props.topListings ?? [];

  // If we don’t have a label, don’t filter aggressively
  if (!label.length) {
    return raw.slice(0, 3).map((listing) => ({
      listing,
      score: 0.5,
      reasons: ["Match based on image"],
      flags: [],
    }));
  }

const scored = raw.map((listing) => {
  const { score: baseScore, reasons, flags } = scoreListingAgainstLabel(listing.title ?? "", label);

  const avgMarket =
    typeof market?.avg === "number" && isFinite(market.avg) ? market.avg : null;

const nextFlags = [...flags];  
const out = priceOutlierPenalty(listing.price ?? null, avgMarket);

  let score = baseScore * out.mult;

  // attach flag if we have one
if (out.flag) nextFlags.push(out.flag);

  // bump reasons when not suspicious
  if (!out.flag && typeof listing.price === "number") reasons.push("Price within market band");

  // clamp
  score = clamp01(score);

return { listing, score, reasons, flags: nextFlags };
});

  // filter out low comparability
  const filtered = scored.filter((x) => x.score >= 0.28);

  // sort: highest score first, then cheapest
  filtered.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ap = typeof a.listing.price === "number" ? a.listing.price : Number.POSITIVE_INFINITY;
    const bp = typeof b.listing.price === "number" ? b.listing.price : Number.POSITIVE_INFINITY;
    return ap - bp;
  });

  // keep top 3
  return filtered.slice(0, 3);
}, [props.topListings, props.itemLabel, market]);


  const verdictPillStyle =
    verdict.tone === "good"
      ? styles.pillGood
      : verdict.tone === "bad"
      ? styles.pillBad
      : styles.pillNeutral;

  const confidenceLabel = useMemo(() => {
    if (confidence == null) return "Match confidence: —";
    const pct = Math.round(confidence * 100);
    return `Match confidence: ${pct}%`;
  }, [confidence]);

  const title = (props.itemLabel ?? "").trim();

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.h1}>Results</Text>
<Text style={styles.subhead}>
  Cheapest comparable listings — market range derived from real matches.
</Text>
        </View>
<Text
  style={{
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    marginTop: 6,
  }}
>
  Links verified • Trusted marketplaces only
</Text>

        <Pressable
          onPress={props.onNewScan}
          style={({ pressed }) => [styles.newScanBtn, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.newScanBtnText}>New scan</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* HERO SCAN IMAGE */}
        <View style={styles.heroWrap}>
          {scanUri ? (
            <Image source={{ uri: scanUri }} style={styles.heroImage} />
          ) : (
            <View style={styles.heroPlaceholder}>
              <Text style={styles.heroPlaceholderText}>No scan image</Text>
            </View>
          )}

          <View style={styles.heroFade} />

          {/* Item title overlay */}
          <View style={styles.heroTitleWrap}>
            <Text numberOfLines={2} style={styles.heroTitle}>
              {title.length ? title : "Detected item"}
            </Text>

            <View style={styles.verdictRow}>
              <Text style={styles.confidenceText}>{confidenceLabel}</Text>
              <View style={[styles.verdictPill, verdictPillStyle]}>
                <Text style={styles.verdictText}>{verdict.label}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* MARKET + SAVINGS GRID */}
        <View style={styles.gridRow}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Market range</Text>
            <View style={styles.marketRow}>
              <View style={styles.marketCell}>
                <Text style={styles.microLabel}>Low</Text>
                <Text style={styles.bigValue}>{money(symbol, market.low ?? null)}</Text>
              </View>
              <View style={styles.marketCell}>
                <Text style={styles.microLabel}>Avg</Text>
                <Text style={styles.bigValue}>{money(symbol, market.avg ?? null)}</Text>
              </View>
              <View style={styles.marketCell}>
                <Text style={styles.microLabel}>High</Text>
                <Text style={styles.bigValue}>{money(symbol, market.high ?? null)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Your price</Text>
            <Text style={styles.priceHero}>{money(symbol, props.myPrice ?? null)}</Text>

            <View style={styles.savingsRow}>
              <Text style={styles.microLabel}>Savings vs avg</Text>
              <Text
                style={[
                  styles.savingsValue,
                  savings == null ? styles.savingsNeutral : savings >= 0 ? styles.savingsGood : styles.savingsBad,
                ]}
              >
                {savings == null ? "—" : `${savings >= 0 ? "+" : ""}${money(symbol, savings)}`}
              </Text>
            </View>
          </View>
        </View>

        {/* PRIMARY ACTIONS */}
        <Pressable
          onPress={props.onShowMeCheaper}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryBtnText}>Show me cheaper</Text>
        </Pressable>

        <Pressable
          onPress={props.onTrackPrice}
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryBtnText}>Track this price</Text>
        </Pressable>

        {/* UTILITY ACTIONS */}
        <View style={styles.utilityRow}>
          <Pressable
            onPress={props.onCopyAllLinks}
            style={({ pressed }) => [styles.utilityBtn, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.utilityBtnText}>Copy links</Text>
          </Pressable>

          <Pressable
            onPress={props.onShareResults}
            style={({ pressed }) => [styles.utilityBtn, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.utilityBtnText}>Share</Text>
          </Pressable>

          <Pressable
            onPress={props.onGoToHistory}
            style={({ pressed }) => [styles.utilityBtn, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.utilityBtnText}>History</Text>
          </Pressable>
        </View>

        {/* LISTINGS */}
        <View style={styles.sectionHead}>
<Text style={styles.sectionTitle}>
  Evan.AI finds the cheapest comparable listing — and shows your savings instantly.
</Text>
          <Text style={styles.sectionHint}>Tap a row to open the listing.</Text>
        </View>
{/* MARKETPLACE SEARCH (MANUAL, TRUSTED) */}
<View style={styles.marketSearchRow}>
  <Pressable
    onPress={async () => {
      const q = encodeURIComponent(title || "item");
      await safeOpenUrl(`https://www.amazon.com/s?k=${q}`);
    }}
    style={({ pressed }) => [styles.marketSearchBtn, pressed && styles.pressed]}
  >
    <Text style={styles.marketSearchText}>Search Amazon</Text>
  </Pressable>

  <Pressable
    onPress={async () => {
      const q = encodeURIComponent(title || "item");
      await safeOpenUrl(`https://www.ebay.com/sch/i.html?_nkw=${q}`);
    }}
    style={({ pressed }) => [styles.marketSearchBtn, pressed && styles.pressed]}
  >
    <Text style={styles.marketSearchText}>Search eBay</Text>
  </Pressable>

  <Pressable
    onPress={async () => {
      const q = encodeURIComponent(title || "item");
      await safeOpenUrl(`https://www.walmart.com/search?q=${q}`);
    }}
    style={({ pressed }) => [styles.marketSearchBtn, pressed && styles.pressed]}
  >
    <Text style={styles.marketSearchText}>Search Walmart</Text>
  </Pressable>
</View>

        {scoredTop.length === 0 ? (
          <View style={styles.emptyCard}>
<Text style={styles.emptyTitle}>No comparable listings</Text>
<Text style={styles.emptySub}>
  Try a new scan with better lighting, or use marketplace search below.
</Text>
          </View>
) : (
  scoredTop.map((x, idx) => {
    const l = x.listing;
            const priceText = money(symbol, l.price ?? null);
const scorePct = Math.round(x.score * 100);
const why = x.reasons.join(" • ");
const flag = x.flags.length ? x.flags[0] : "";            
const metaLeft = (l.marketplace ?? "Marketplace").trim();
            const metaRight = (l.seller ?? "").trim();

            return (
              <Pressable
                key={l.id || `${idx}`}
                onPress={async () => {
                  // optional hook for analytics / history / etc
                  props.onOpenListing?.(l);
                  await safeOpenUrl(l.url);
                }}
                style={({ pressed }) => [styles.listingRow, pressed && styles.pressedRow]}
                accessibilityRole="button"
              >
                <View style={styles.thumbWrap}>
                  {l.imageUrl ? (
                    <Image source={{ uri: l.imageUrl }} style={styles.thumb} />
                  ) : (
                    <View style={styles.thumbPlaceholder}>
                      <Text style={styles.thumbPlaceholderText}>IMG</Text>
                    </View>
                  )}
                </View>

<View style={styles.listingMid}>
  <Text numberOfLines={2} style={styles.listingTitle}>
    {l.title}
  </Text>

  <Text numberOfLines={1} style={styles.listingMeta}>
    {priceText} • {metaLeft}
    {metaRight ? ` • ${metaRight}` : ""}
  </Text>

  <Text numberOfLines={1} style={styles.matchLine}>
    {scorePct}% comparable • {why}
  </Text>

  {!!flag && (
    <Text numberOfLines={1} style={styles.flagLine}>
      ⚠ {flag}
    </Text>
  )}
</View>

                <View style={styles.openChip}>
                  <Text style={styles.openChipText}>Open</Text>
                </View>
              </Pressable>
            );
          })
        )}

        {/* Bottom spacer (for scroll breathing room) */}
        <View style={{ height: 26 }} />
      </ScrollView>

      {/* CHECKING OVERLAY (VISIBLE, HIGH CONTRAST) */}
      <Modal visible={!!props.isCheckingListings} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ActivityIndicator size="large" />
            <Text style={styles.modalTitle}>{props.checkingTitle ?? "Checking more listings.."}</Text>
            <Text style={styles.modalSub}>{props.checkingSubtitle ?? "Searching the web for cheaper matches."}</Text>

            <View style={styles.modalBtnsRow}>
              <Pressable
                onPress={props.onCancelChecking}
                style={({ pressed }) => [styles.modalBtn, styles.modalBtnGhost, pressed && styles.pressed]}
              >
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={props.onRetryChecking}
                style={({ pressed }) => [styles.modalBtn, styles.modalBtnSolid, pressed && styles.pressed]}
              >
                <Text style={styles.modalBtnText}>Retry</Text>
              </Pressable>
            </View>

            <Text style={styles.modalFootnote}>
              Tip: Use good lighting and fill the frame for stronger matches.
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },

  header: {
    paddingTop: Platform.OS === "ios" ? 56 : 24,
    paddingHorizontal: 18,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  headerLeft: {
    flex: 1,
    paddingRight: 12,
  },
  h1: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  subhead: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 13,
    marginTop: 4,
  },

  newScanBtn: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  newScanBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
  },

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 18,
  },

  heroWrap: {
    height: 240,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  heroImage: { width: "100%", height: "100%" },
  heroPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  heroPlaceholderText: {
    color: "rgba(255,255,255,0.55)",
    fontWeight: "700",
  },

  heroFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 110,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  heroTitleWrap: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 12,
  },
  heroTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  verdictRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  confidenceText: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: "700",
  },
  verdictPill: {
    paddingHorizontal: 10,
    height: 26,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  verdictText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  pillGood: {
    backgroundColor: "rgba(70,255,175,0.10)",
    borderColor: "rgba(70,255,175,0.22)",
  },
  pillBad: {
    backgroundColor: "rgba(255,80,80,0.12)",
    borderColor: "rgba(255,80,80,0.25)",
  },
  pillNeutral: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.14)",
  },

  gridRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  card: {
    flex: 1,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  cardLabel: {
    color: "rgba(255,255,255,0.60)",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 10,
  },

  marketRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  marketCell: { alignItems: "flex-start" },

  microLabel: {
    color: "rgba(255,255,255,0.52)",
    fontSize: 11,
    fontWeight: "700",
  },
  bigValue: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 4,
    letterSpacing: -0.2,
  },

  priceHero: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  savingsRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  savingsValue: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  savingsGood: { color: "rgba(70,255,175,0.95)" },
  savingsBad: { color: "rgba(255,90,90,0.95)" },
  savingsNeutral: { color: "rgba(255,255,255,0.55)" },

  primaryBtn: {
    marginTop: 12,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  secondaryBtn: {
    marginTop: 10,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  secondaryBtnText: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.2,
  },

  utilityRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 10,
  },
  utilityBtn: {
    flex: 1,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  utilityBtnText: {
    color: "rgba(255,255,255,0.82)",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.3,
  },

  sectionHead: {
    marginTop: 18,
    marginBottom: 10,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  sectionHint: {
    marginTop: 4,
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontWeight: "600",
  },

marketSearchRow: {
  flexDirection: "row",
  gap: 10,
  marginBottom: 10,
},
marketSearchBtn: {
  flex: 1,
  height: 42,
  borderRadius: 16,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(255,255,255,0.04)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.10)",
},
marketSearchText: {
  color: "rgba(255,255,255,0.88)",
  fontWeight: "900",
  fontSize: 12,
  letterSpacing: 0.2,
},

  emptyCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  emptyTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },
  emptySub: {
    marginTop: 6,
    color: "rgba(255,255,255,0.60)",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },

  listingRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    marginBottom: 10,
  },
  thumbWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  thumb: { width: "100%", height: "100%" },
  thumbPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbPlaceholderText: {
    color: "rgba(255,255,255,0.55)",
    fontWeight: "900",
    fontSize: 11,
  },

  listingMid: {
    flex: 1,
    paddingHorizontal: 12,
  },
  listingTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: -0.1,
  },
  listingMeta: {  
  marginTop: 6,
    color: "rgba(255,255,255,0.62)",
    fontSize: 12,
    fontWeight: "700",
  },

matchLine: {
  marginTop: 5,
  color: "rgba(255,255,255,0.55)",
  fontSize: 11,
  fontWeight: "800",
},
flagLine: {
  marginTop: 4,
  color: "rgba(255,90,90,0.92)",
  fontSize: 11,
  fontWeight: "900",
},

  openChip: {
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  openChipText: {
    color: "rgba(255,255,255,0.90)",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.4,
  },

  pressed: { opacity: 0.8 },
  pressedRow: { opacity: 0.85 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(20,20,20,0.98)",
    alignItems: "center",
  },
  modalTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 12,
    letterSpacing: -0.2,
  },
  modalSub: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 6,
    textAlign: "center",
    lineHeight: 16,
  },
  modalBtnsRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  modalBtn: {
    flex: 1,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  modalBtnGhost: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.10)",
  },
  modalBtnSolid: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderColor: "rgba(255,255,255,0.16)",
  },
  modalBtnText: {
    color: "#fff",
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  modalFootnote: {
    marginTop: 10,
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
});
