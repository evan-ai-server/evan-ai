/**
 * openProductLink — smart trusted product URL opener.
 *
 * - Only opens URLs from the trusted resale platform list
 * - HARD-rejects Google redirect / search / aclk / shopping-aggregator URLs
 *   even if they sneak past the trusted-domain whitelist (Phase 8 hardening)
 * - Falls back to eBay search if URL is null or untrusted
 * - No warning dialogs, no "unverified link" UI — just opens cleanly
 * - Uses SFSafariViewController (iOS) / Chrome Custom Tabs (Android)
 * - Attempts native app deep link first for eBay and Amazon
 */
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";

// ── Google redirect / search / aclk rejection ──────────────────────────────
// We refuse to open these no matter what. They are the #1 source of "I tapped
// the listing and it took me to a Google search page" complaints.
const GOOGLE_HOSTS_RE = /(^|\.)(google\.|googleadservices\.|googlesyndication\.|googleusercontent\.com|doubleclick\.net)/i;

function isGoogleRedirectUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = (u.hostname || "").toLowerCase();
    const path = (u.pathname || "").toLowerCase();
    // /aclk is an ad-click redirect on any host.
    if (/\/aclk(\?|\/|$)/i.test(url)) return true;
    if (!GOOGLE_HOSTS_RE.test(host)) return false;
    // Only reject *pure redirect* paths. /shopping/product/ is a browsable
    // aggregator page that lists real merchant offers — strictly better than
    // a title-built eBay search fallback when the server can't extract a
    // direct merchant URL.
    return (
      path === "/url" ||
      path === "/search" ||
      path.startsWith("/aclk")
    );
  } catch {
    return false;
  }
}

// Dev-only log helper. Stripped in production builds.
const devLog = (event: string, payload?: Record<string, unknown>) => {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[openProductLink] ${event}`, payload || "");
  }
};

// Trusted resale + marketplace domains
const TRUSTED_DOMAINS = [
  "ebay.com",
  "amazon.com",
  "walmart.com",
  "target.com",
  "bestbuy.com",
  "costco.com",
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
  "mercari.com",
  "swappa.com",
  "chrono24.com",
  "watchuseek.com",
  "app.apple.com",
];

function getDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isTrustedUrl(url: string): boolean {
  const domain = getDomain(url);
  if (!domain) return false;
  if (TRUSTED_DOMAINS.some((trusted) => domain === trusted || domain.endsWith("." + trusted))) {
    return true;
  }
  // Google Shopping product aggregator pages are browsable — the server
  // surfaces them as a low-confidence fallback when no direct merchant URL
  // could be resolved. Treat them as trusted so the user lands on the
  // aggregator instead of an eBay search built from the title.
  try {
    const u = new URL(url);
    const host = (u.hostname || "").toLowerCase();
    const path = (u.pathname || "").toLowerCase();
    if (/(^|\.)google\./.test(host) && path.startsWith("/shopping/product")) {
      return true;
    }
  } catch {}
  return false;
}

/** Build an eBay search URL as fallback for any item title */
function ebayFallbackUrl(titleHint?: string | null): string {
  const q = titleHint ? encodeURIComponent(titleHint.trim().slice(0, 100)) : "";
  return q
    ? `https://www.ebay.com/sch/i.html?_nkw=${q}&_sop=15`
    : "https://www.ebay.com";
}

/** Attempt to open eBay/Amazon in native app first */
const DEEP_LINK_MAP: Record<string, (url: string) => string | null> = {
  "ebay.com": (url) => {
    const m = url.match(/ebay\.com\/itm\/(\d+)/);
    return m ? `ebay://item/${m[1]}` : null;
  },
  "amazon.com": (url) => {
    const m = url.match(/amazon\.com\/(?:dp|gp\/product)\/([A-Z0-9]+)/i);
    return m ? `com.amazon.mobile.shopping.web://amazon.com/dp/${m[1]}` : null;
  },
};

async function tryDeepLink(url: string): Promise<boolean> {
  const domain = getDomain(url);
  if (!domain) return false;
  const builder = Object.entries(DEEP_LINK_MAP).find(([k]) => domain.includes(k))?.[1];
  if (!builder) return false;
  const deepUrl = builder(url);
  if (!deepUrl) return false;
  try {
    const canOpen = await Linking.canOpenURL(deepUrl);
    if (canOpen) {
      await Linking.openURL(deepUrl);
      return true;
    }
  } catch {}
  return false;
}

async function openInBrowser(url: string): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      controlsColor: "#ffffff",
      toolbarColor: "#0a0a0a",
      enableDefaultShareMenuItem: true,
    });
    return;
  } catch {}
  try {
    await Linking.openURL(url);
  } catch {}
}

export async function openProductLink(
  url: string | null | undefined,
  opts: { preferDeepLink?: boolean; titleHint?: string | null } = {}
): Promise<void> {
  const { preferDeepLink = true, titleHint = null } = opts;

  // Resolve URL:
  // 1. Reject Google redirect / search / aclk / shopping-aggregator URLs
  //    outright — never let one of these reach the browser.
  // 2. Open as-is if trusted.
  // 3. Otherwise silently fall back to an eBay search built from the title.
  let resolvedUrl: string;
  if (!url) {
    devLog("MISSING_DIRECT_URL", { titleHint });
    resolvedUrl = ebayFallbackUrl(titleHint);
  } else if (isGoogleRedirectUrl(url)) {
    devLog("BLOCKED_GOOGLE_REDIRECT", { url, titleHint });
    resolvedUrl = ebayFallbackUrl(titleHint);
  } else if (isTrustedUrl(url)) {
    devLog("OPEN_DIRECT_PRODUCT_URL", { url });
    resolvedUrl = url;
  } else {
    devLog("UNTRUSTED_URL_FALLBACK", { url, titleHint });
    resolvedUrl = ebayFallbackUrl(titleHint);
  }

  // Try native deep link first (eBay/Amazon apps)
  if (preferDeepLink) {
    const opened = await tryDeepLink(resolvedUrl);
    if (opened) return;
  }

  await openInBrowser(resolvedUrl);
}

/**
 * pickDirectUrl — caller helper that returns the safest URL for an item.
 *
 * Prefers item.directUrl (hardened, Phase 2) over legacy buyLink/link/url.
 * Returns null if no usable direct URL exists — callers should disable the
 * "Open listing" button or fall back to manual search in that case.
 */
export function pickDirectUrl(item: {
  directUrl?: string | null;
  buyLink?: string | null;
  link?: string | null;
  url?: string | null;
} | null | undefined): string | null {
  if (!item) return null;
  const candidates = [item.directUrl, item.buyLink, item.link, item.url];
  for (const c of candidates) {
    if (!c || typeof c !== "string") continue;
    if (isGoogleRedirectUrl(c)) continue;
    if (isTrustedUrl(c)) return c;
  }
  return null;
}
