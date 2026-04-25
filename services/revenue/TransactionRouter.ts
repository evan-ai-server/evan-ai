/**
 * Evan AI — TransactionRouter
 *
 * Smart buy-routing layer that sits on top of openProductLink.
 *
 * For every outbound listing click the router:
 *   1. Resolves the best URL (affiliate, partner, or direct)
 *   2. Appends UTM tracking params for conversion attribution
 *   3. Fires a ClickEvent to EventTracker (non-blocking)
 *   4. Opens the URL via openProductLink (trusted-domain check preserved)
 *
 * Architecture: single function `routeListingClick` — easy to extend to
 * partner programs by expanding AFFILIATE_RULES.
 *
 * Adding a new partner:
 *   1. Add an entry to AFFILIATE_RULES with the domain and utm_campaign.
 *   2. If the partner has a deep-link scheme, add it to DEEP_LINK_MAP
 *      in openProductLink.ts.
 *   That's it — no other code paths to change.
 */

import { openProductLink } from "../../components/utils/openProductLink";
import { EventTracker } from "./EventTracker";
import type { ClickEvent, LinkIntent, LinkRouteMode, RouteResult } from "./RevenueTypes";

// ─── Affiliate program config ──────────────────────────────────────────────────

interface AffiliateRule {
  domain: string;
  /**
   * UTM campaign value. In the future, swap this URL param for the
   * real affiliate tag when the program is live.
   */
  utmCampaign: string;
  mode: LinkRouteMode;
}

// Extend this list as affiliate programs are signed.
// Right now all links are "affiliate" mode with UTM tracking (no rev-share yet).
const AFFILIATE_RULES: AffiliateRule[] = [
  { domain: "ebay.com",    utmCampaign: "ebay_resale",   mode: "affiliate" },
  { domain: "amazon.com",  utmCampaign: "amz_product",   mode: "affiliate" },
  { domain: "mercari.com", utmCampaign: "mcr_listing",   mode: "direct"    },
  { domain: "stockx.com",  utmCampaign: "stx_listing",   mode: "direct"    },
  { domain: "poshmark.com",utmCampaign: "pm_listing",    mode: "direct"    },
  { domain: "goat.com",    utmCampaign: "goat_listing",  mode: "direct"    },
  { domain: "grailed.com", utmCampaign: "grl_listing",   mode: "direct"    },
];

const UTM_SOURCE   = "evan_ai";
const UTM_MEDIUM   = "app_link";

// ─── URL helpers ──────────────────────────────────────────────────────────────

function getDomain(url: string): string | null {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
}

function findRule(url: string | null | undefined): AffiliateRule | null {
  if (!url) return null;
  const domain = getDomain(url);
  if (!domain) return null;
  return AFFILIATE_RULES.find(
    (r) => domain === r.domain || domain.endsWith("." + r.domain)
  ) ?? null;
}

function appendUtm(url: string, campaign: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("utm_source",   UTM_SOURCE);
    u.searchParams.set("utm_medium",   UTM_MEDIUM);
    u.searchParams.set("utm_campaign", campaign);
    return u.toString();
  } catch {
    // URL parse failed — return original unchanged
    return url;
  }
}

function resolveRoute(url: string | null | undefined, titleHint?: string | null): RouteResult {
  const rule = findRule(url);

  if (!url) {
    // Fallback: eBay search
    const fallback = titleHint
      ? `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(titleHint.trim().slice(0, 100))}&_sop=15&utm_source=${UTM_SOURCE}&utm_medium=${UTM_MEDIUM}&utm_campaign=ebay_search`
      : "https://www.ebay.com";
    return { url: fallback, mode: "affiliate", tracked: true };
  }

  if (rule) {
    const tracked = appendUtm(url, rule.utmCampaign);
    return { url: tracked, mode: rule.mode, tracked: true };
  }

  // Trusted domain not in affiliate rules — open direct, no UTM
  return { url, mode: "direct", tracked: false };
}

// ─── Main export ───────────────────────────────────────────────────────────────

export interface RoutingContext {
  scanId?: string | null;
  userId?: string | null;
  itemName: string;
  listingPrice?: number | null;
  source?: string | null;
  cardRole?: "hero" | "alt";
  intent?: LinkIntent;
}

/**
 * Route and open a listing with click tracking.
 *
 * - Resolves the best URL (affiliate / direct)
 * - Appends UTM params for attribution
 * - Fires ListingClick to EventTracker (non-blocking)
 * - Opens via openProductLink (trusted-domain + deep-link checks preserved)
 */
export async function routeListingClick(
  url: string | null | undefined,
  ctx: RoutingContext
): Promise<void> {
  const {
    scanId    = null,
    userId    = null,
    itemName,
    listingPrice = null,
    source    = null,
    cardRole  = "hero",
    intent    = "buy",
  } = ctx;

  const route = resolveRoute(url, itemName);

  // Fire analytics (non-blocking, never await)
  const clickEvent: ClickEvent = {
    scanId,
    userId,
    itemName,
    listingPrice,
    source,
    resolvedUrl: route.url,
    routeMode: route.mode,
    intent,
    cardRole,
    ts: Date.now(),
  };
  EventTracker.trackListingClick(
    clickEvent.scanId,
    clickEvent.itemName,
    clickEvent.listingPrice,
    clickEvent.source,
    clickEvent.cardRole
  );

  // Open the link — openProductLink handles trusted-domain check + deep-link
  await openProductLink(route.url, { preferDeepLink: true, titleHint: itemName });
}
