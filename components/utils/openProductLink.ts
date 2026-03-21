/**
 * openProductLink — smart trusted product URL opener.
 *
 * - Only opens URLs from the trusted resale platform list
 * - Falls back to eBay search if URL is null or untrusted
 * - No warning dialogs, no "unverified link" UI — just opens cleanly
 * - Uses SFSafariViewController (iOS) / Chrome Custom Tabs (Android)
 * - Attempts native app deep link first for eBay and Amazon
 */
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";

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
  return TRUSTED_DOMAINS.some((trusted) => domain === trusted || domain.endsWith("." + trusted));
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

  // Resolve URL: use provided URL if trusted, otherwise build eBay fallback
  let resolvedUrl: string;
  if (url && isTrustedUrl(url)) {
    resolvedUrl = url;
  } else {
    // Silently fall back to eBay search — no warning shown to user
    resolvedUrl = ebayFallbackUrl(titleHint);
  }

  // Try native deep link first (eBay/Amazon apps)
  if (preferDeepLink) {
    const opened = await tryDeepLink(resolvedUrl);
    if (opened) return;
  }

  await openInBrowser(resolvedUrl);
}
