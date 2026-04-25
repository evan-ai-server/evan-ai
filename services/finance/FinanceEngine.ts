/**
 * Evan AI — Finance Engine
 *
 * Core financial calculation functions. All math is deterministic
 * and isolated here — no components, no side effects, no async.
 *
 * Import from services/finance (barrel) not this file directly.
 */

import {
  COST_PER_FULL_SCAN,
  COST_PER_ALERT_SWEEP,
  COST_PER_PREMIUM_CALL,
  PLATFORM_FEES,
  getPlatformFee,
  PLAN_GO_MONTHLY,
  PLAN_PLUS_MONTHLY,
  NET_GO_MONTHLY,
  NET_PLUS_MONTHLY,
  AVG_SUBSCRIBER_MONTHS,
  MIN_FLIP_PROFIT,
  HIGH_VALUE_SCAN_THRESHOLD,
  PLATFORM_FEE_RATE,
} from "./FinanceConfig";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type SubscriptionTier = "free" | "go" | "plus";

export interface UnitEconomics {
  /** Total infrastructure cost for this scan (USD) */
  scanCost: number;
  /**
   * Estimated user-perceived value: savings + flip opportunity.
   * Conservative: only count confirmed savings or verified flip profit.
   */
  valueDelivered: number;
  /** value / cost ratio — > 1 means positive economic value for user */
  valueRatio: number;
  /** True if this scan delivered meaningful economic value */
  isHighValue: boolean;
}

export interface ProfitBreakdown {
  /** What the user paid / cost basis */
  costBasis: number;
  /** Estimated market resale value */
  estimatedResale: number;
  /** Platform fee rate (e.g., 0.1325) */
  platformFeeRate: number;
  /** Platform fee amount in dollars */
  platformFeeAmount: number;
  /** Shipping estimate (conservative flat rate) */
  shippingCost: number;
  /** Proceeds after platform fee and shipping */
  netProceeds: number;
  /** Gross profit (resale - cost) */
  grossProfit: number;
  /** Net profit (netProceeds - cost) */
  netProfit: number;
  /** ROI as a percentage */
  roi: number;
  /** Human-readable ROI label */
  roiLabel: string;
  /** True if net profit is positive */
  isProfit: boolean;
}

export interface SessionEconomics {
  /** Total scans in this session */
  scanCount: number;
  /** Total infra cost for this session */
  totalCost: number;
  /** Total value delivered (confirmed savings + flip value) */
  totalValue: number;
  /** Session-level value/cost ratio */
  valueRatio: number;
  /** Whether this was a monetizable session */
  isMonetizable: boolean;
  /** Revenue attributed if user is subscribed (MRR fraction) */
  revenueAttributed: number;
}

export interface LTVEstimate {
  tier: SubscriptionTier;
  /** Monthly net revenue */
  monthlyRevenue: number;
  /** Estimated months active */
  estimatedMonths: number;
  /** Estimated LTV */
  ltv: number;
  /** Monthly infra cost */
  monthlyCost: number;
  /** Net LTV after infra costs */
  netLtv: number;
}

// ─── Unit Economics ─────────────────────────────────────────────────────────────

/**
 * Compute unit economics for a single scan.
 *
 * @param savedAmount  - Dollars saved (scannedPrice − cheapestPrice). 0 if none.
 * @param flipProfit   - Expected flip profit in dollars. null if not a flip.
 * @param isPremium    - Whether premium AI enrichment was used.
 */
export function computeUnitEconomics(
  savedAmount: number,
  flipProfit: number | null,
  isPremium = false
): UnitEconomics {
  const premiumCost = isPremium ? COST_PER_PREMIUM_CALL : 0;
  const scanCost    = COST_PER_FULL_SCAN + premiumCost;

  // Value: sum of confirmed savings and any verified flip upside.
  // Capped: flip profit only counts at 50% certainty (conservative).
  const flipValue = flipProfit != null && flipProfit > MIN_FLIP_PROFIT
    ? flipProfit * 0.5
    : 0;
  const valueDelivered = Math.max(0, savedAmount) + flipValue;
  const valueRatio     = scanCost > 0 ? valueDelivered / scanCost : 0;
  const isHighValue    = valueDelivered >= HIGH_VALUE_SCAN_THRESHOLD ||
    (flipProfit != null && flipProfit > HIGH_VALUE_SCAN_THRESHOLD);

  return { scanCost, valueDelivered, valueRatio, isHighValue };
}

// ─── Profit Breakdown ─────────────────────────────────────────────────────────

/**
 * Compute fees-aware profit breakdown for a potential flip.
 *
 * @param costBasis       - What the user would pay (scanned price or ask)
 * @param estimatedResale - Market resale estimate
 * @param platform        - Target selling platform (for fee lookup)
 * @param shippingCost    - Flat shipping cost estimate (default $6)
 */
export function computeProfitBreakdown(
  costBasis: number,
  estimatedResale: number,
  platform: string | null = null,
  shippingCost = 6
): ProfitBreakdown | null {
  if (!Number.isFinite(costBasis) || costBasis <= 0) return null;
  if (!Number.isFinite(estimatedResale) || estimatedResale <= 0) return null;

  const platformFeeRate   = getPlatformFee(platform);
  const platformFeeAmount = estimatedResale * platformFeeRate;
  const netProceeds       = estimatedResale - platformFeeAmount - shippingCost;
  const grossProfit       = estimatedResale - costBasis;
  const netProfit         = netProceeds - costBasis;
  const roi               = costBasis > 0 ? (netProfit / costBasis) * 100 : 0;

  const roiLabel = netProfit >= 0
    ? `+${Math.round(roi)}% ROI`
    : `−${Math.abs(Math.round(roi))}% (LOSS)`;

  return {
    costBasis,
    estimatedResale,
    platformFeeRate,
    platformFeeAmount: Math.round(platformFeeAmount * 100) / 100,
    shippingCost,
    netProceeds: Math.round(netProceeds * 100) / 100,
    grossProfit:  Math.round(grossProfit * 100) / 100,
    netProfit:    Math.round(netProfit   * 100) / 100,
    roi:          Math.round(roi),
    roiLabel,
    isProfit: netProfit > 0,
  };
}

// ─── Session Economics ─────────────────────────────────────────────────────────

/**
 * Aggregate economics across a single session (set of scans).
 *
 * @param scans        - Array of { savedAmount, flipProfit, isPremium }
 * @param tier         - User's current subscription tier
 * @param daysInMonth  - Used to compute revenue attribution fraction
 */
export function computeSessionEconomics(
  scans: { savedAmount: number; flipProfit: number | null; isPremium?: boolean }[],
  tier: SubscriptionTier = "free",
  daysInMonth = 30
): SessionEconomics {
  const unitResults = scans.map((s) =>
    computeUnitEconomics(s.savedAmount, s.flipProfit, s.isPremium)
  );

  const totalCost  = unitResults.reduce((acc, u) => acc + u.scanCost, 0);
  const totalValue = unitResults.reduce((acc, u) => acc + u.valueDelivered, 0);
  const valueRatio = totalCost > 0 ? totalValue / totalCost : 0;

  // Revenue attributed: 1/30th of monthly subscription (one day's worth)
  const dailyRevenue =
    tier === "plus" ? NET_PLUS_MONTHLY / daysInMonth :
    tier === "go"   ? NET_GO_MONTHLY   / daysInMonth : 0;

  return {
    scanCount:          scans.length,
    totalCost:          Math.round(totalCost  * 10000) / 10000,
    totalValue:         Math.round(totalValue * 100)   / 100,
    valueRatio:         Math.round(valueRatio * 100)   / 100,
    isMonetizable:      tier !== "free" || totalValue > 0,
    revenueAttributed:  Math.round(dailyRevenue * 100) / 100,
  };
}

// ─── LTV ───────────────────────────────────────────────────────────────────────

/**
 * Estimate LTV for a subscriber based on tier.
 *
 * @param tier             - Subscription tier
 * @param estimatedMonths  - Override lifespan estimate (optional)
 * @param avgScansPerDay   - Used for infra cost computation
 */
export function computeLTV(
  tier: SubscriptionTier,
  estimatedMonths?: number,
  avgScansPerDay = 5
): LTVEstimate {
  const months  = estimatedMonths ?? AVG_SUBSCRIBER_MONTHS;
  const monthly = tier === "plus" ? NET_PLUS_MONTHLY : tier === "go" ? NET_GO_MONTHLY : 0;
  const cost    = avgScansPerDay * 30 * COST_PER_FULL_SCAN;
  const ltv     = monthly * months;
  const netLtv  = (monthly - cost) * months;

  return {
    tier,
    monthlyRevenue:    Math.round(monthly * 100) / 100,
    estimatedMonths:   months,
    ltv:               Math.round(ltv    * 100) / 100,
    monthlyCost:       Math.round(cost   * 10000) / 10000,
    netLtv:            Math.round(netLtv * 100) / 100,
  };
}

// ─── Margin by tier ────────────────────────────────────────────────────────────

export interface TierMarginSummary {
  tier: SubscriptionTier;
  grossMarginPct: number;
  monthlyNetRevenue: number;
  monthlyInfraCost: number;
  monthlyNetMargin: number;
}

/**
 * Returns a margin summary for a given tier.
 * All dollar values are per-subscriber per-month.
 */
export function computeMarginByTier(
  tier: SubscriptionTier,
  avgScansPerDay = 5
): TierMarginSummary {
  const net   = tier === "plus" ? NET_PLUS_MONTHLY : tier === "go" ? NET_GO_MONTHLY : 0;
  const cost  = avgScansPerDay * 30 * COST_PER_FULL_SCAN;
  const gross = net - cost;
  const pct   = net > 0 ? (gross / net) * 100 : 0;

  return {
    tier,
    grossMarginPct:     Math.round(pct),
    monthlyNetRevenue:  Math.round(net   * 100) / 100,
    monthlyInfraCost:   Math.round(cost  * 10000) / 10000,
    monthlyNetMargin:   Math.round(gross * 100) / 100,
  };
}

// ─── Value format helpers ──────────────────────────────────────────────────────

/** Format a dollar amount for display: "$12.34" or "$1,234" */
export function fmtDollars(amount: number): string {
  if (!Number.isFinite(amount)) return "$0";
  if (amount >= 1000) return `$${Math.round(amount).toLocaleString()}`;
  return `$${amount.toFixed(2)}`;
}

/** Format a ROI percentage: "+23%" or "−8%" */
export function fmtRoi(roi: number): string {
  const rounded = Math.round(roi);
  return rounded >= 0 ? `+${rounded}%` : `−${Math.abs(rounded)}%`;
}
