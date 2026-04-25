/**
 * Evan AI — Revenue Layer Type Contracts
 *
 * Stable interfaces for all five revenue layers:
 *   1. Transaction (smart buy routing)
 *   2. Premium Intelligence (gated analytics)
 *   3. Autonomous Deal Hunter (recurring alerts)
 *   4. Seller Side (listing optimization)
 *   5. Data Moat (behavioral signal capture)
 *
 * No runtime code here — types only.
 */

// ─── Layer 1: Transaction / Routing ──────────────────────────────────────────

/** How a product link should be opened */
export type LinkRouteMode = "direct" | "affiliate" | "partner";

/** Intent classification for what the user is about to do */
export type LinkIntent = "buy" | "research" | "compare" | "sell";

/** Metadata attached to every tracked outbound click */
export interface ClickEvent {
  /** Stable ID for the scan session this click came from */
  scanId: string | null;
  /** User identifier (anonymous or authenticated) */
  userId: string | null;
  /** Item name / product query */
  itemName: string;
  /** Price on the clicked listing */
  listingPrice: number | null;
  /** Marketplace / source (eBay, Amazon, etc.) */
  source: string | null;
  /** The resolved URL that was opened */
  resolvedUrl: string;
  /** How the URL was routed */
  routeMode: LinkRouteMode;
  /** User's inferred intent at click time */
  intent: LinkIntent;
  /** Hero card or alternative card */
  cardRole: "hero" | "alt";
  /** Timestamp ms */
  ts: number;
}

/** Result of resolving a listing URL through the router */
export interface RouteResult {
  /** Final URL to open */
  url: string;
  /** How it was routed */
  mode: LinkRouteMode;
  /** Whether UTM/affiliate params were appended */
  tracked: boolean;
}

// ─── Layer 2: Premium Intelligence ───────────────────────────────────────────

/** Access tier for feature gating */
export type PremiumTier = "free" | "go" | "plus";

/** Computed fees-aware profitability breakdown */
export interface ProfitBreakdown {
  costBasis: number;
  estimatedResale: number;
  platformFee: number;        // e.g., 0.15 for eBay
  platformFeeAmount: number;
  netProceeds: number;
  grossProfit: number;
  netProfit: number;
  roi: number;                // (netProfit / costBasis) * 100
  roiLabel: string;           // "23% ROI" or "LOSS"
  isProfit: boolean;
}

/** Deal quality signals for premium tier */
export interface DealQualitySignal {
  score: number;              // 0–1
  tier: "excellent" | "good" | "fair" | "weak";
  reasoning: string[];        // up to 3 human-readable bullets
  riskFlags: string[];        // authenticity, market trend, velocity
}

/** Full premium intel payload for a scan result */
export interface PremiumIntelPayload {
  profitBreakdown: ProfitBreakdown | null;
  dealQuality: DealQualitySignal | null;
  marketTrend: "rising" | "falling" | "stable" | null;
  sellWindowDays: number | null;
  platformRecommendation: string | null;
  confidenceExplanation: string | null;
}

// ─── Layer 3: Autonomous Deal Hunter ─────────────────────────────────────────

/** Enriched deal alert surfaced by the autonomous hunter */
export interface EnrichedDealAlert {
  id: string;
  query: string;
  verdict: string;
  bestPrice: number;
  dealScore: number;
  /** Dollar profit if bought at bestPrice and sold at estimatedResale */
  estimatedProfit: number | null;
  /** % ROI */
  estimatedRoi: number | null;
  /** Why this is a good deal (1-2 sentence reason) */
  reason: string;
  /** What to do next */
  action: string;
  /** Platform / marketplace of best listing */
  source: string | null;
  url: string | null;
  image: string | null;
  detectedAt: number;
  /** Whether user has already acted on this alert */
  dismissed: boolean;
}

/** Hunter sweep state for UI */
export type HunterSweepState = "idle" | "sweeping" | "done";

// ─── Layer 4: Seller Side ─────────────────────────────────────────────────────

/** Server response from /sell/estimate */
export interface SellEstimate {
  query: string | null;
  estimatedSellPrice: number | null;
  suggestedListPrice: number | null;
  quickSalePrice: number | null;
  bestMarketplace: string | null;
  expectedSellWindowDays: number | null;
  confidence: number;
}

/** Full seller intelligence for one item */
export interface SellerIntel {
  estimate: SellEstimate;
  titleSuggestions: string[];   // 1-3 optimized listing titles
  pricingTier: "quick" | "market" | "premium";
  pricingAdvice: string;
  platformRanking: { name: string; reason: string }[];
}

// ─── Layer 5: Data Moat / Learning ───────────────────────────────────────────

/** Behavioral event type */
export type BehaviorEventType =
  | "scan_start"
  | "scan_complete"
  | "result_view"
  | "listing_click"
  | "watchlist_add"
  | "watchlist_remove"
  | "deal_alert_view"
  | "deal_alert_click"
  | "deal_alert_dismiss"
  | "paywall_view"
  | "purchase_start"
  | "purchase_complete"
  | "decision_buy"
  | "decision_pass"
  | "seller_panel_open"
  | "premium_feature_view";

/** Single behavioral signal for the demand graph */
export interface BehaviorEvent {
  type: BehaviorEventType;
  userId: string | null;
  scanId: string | null;
  itemName: string | null;
  price: number | null;
  metadata: Record<string, string | number | boolean | null>;
  ts: number;
}
