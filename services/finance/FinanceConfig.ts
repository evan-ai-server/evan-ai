/**
 * Evan AI — Finance Configuration
 *
 * Single source of truth for all financial constants.
 * No cost or pricing logic should be scattered across files.
 * Update values here — nowhere else.
 */

// ─── Subscription pricing ─────────────────────────────────────────────────────

/** Monthly Go plan price (USD) */
export const PLAN_GO_MONTHLY   = 7.77;
/** Plus plan price (USD/mo) */
export const PLAN_PLUS_MONTHLY = 22.22;

/** Annual effective monthly for Plus (if offered later) */
export const PLAN_PLUS_ANNUAL_MONTHLY = 14.99;

// ─── Free tier limits ─────────────────────────────────────────────────────────

/** Free scans per day (server-side enforced, mirrored here for local UX) */
export const FREE_SCANS_PER_DAY = 2;
/** Free deal alerts per day for Go tier */
export const GO_ALERTS_PER_DAY  = 3;

// ─── Cost basis (internal — estimated infra + AI cost) ───────────────────────
//     These are estimates. Replace with actual numbers from your AI/cloud bills.

/** Estimated cost per vision scan (OpenAI vision call) in USD */
export const COST_PER_VISION_SCAN    = 0.012;
/** Estimated cost per market search (API calls) in USD */
export const COST_PER_MARKET_SEARCH  = 0.004;
/** Estimated cost per deal alert sweep in USD */
export const COST_PER_ALERT_SWEEP    = 0.003;
/** Estimated cost per premium feature call (AI enrichment) in USD */
export const COST_PER_PREMIUM_CALL   = 0.008;

/** Full cost per scan (vision + market) */
export const COST_PER_FULL_SCAN = COST_PER_VISION_SCAN + COST_PER_MARKET_SEARCH;

// ─── Revenue basis ────────────────────────────────────────────────────────────

/** RevenueCat platform fee (Apple/Google take 30%, or 15% for small biz) */
export const PLATFORM_FEE_RATE = 0.30;

/** Net monthly revenue per Go subscriber after platform fee */
export const NET_GO_MONTHLY    = PLAN_GO_MONTHLY    * (1 - PLATFORM_FEE_RATE);
/** Net monthly revenue per Plus subscriber after platform fee */
export const NET_PLUS_MONTHLY  = PLAN_PLUS_MONTHLY  * (1 - PLATFORM_FEE_RATE);

// ─── LTV estimates ────────────────────────────────────────────────────────────

/** Estimated average subscriber lifespan in months (conservative) */
export const AVG_SUBSCRIBER_MONTHS = 4.5;

/** LTV estimate: Go subscriber */
export const LTV_GO   = NET_GO_MONTHLY   * AVG_SUBSCRIBER_MONTHS;
/** LTV estimate: Plus subscriber */
export const LTV_PLUS = NET_PLUS_MONTHLY * AVG_SUBSCRIBER_MONTHS;

// ─── Margin by tier ───────────────────────────────────────────────────────────

/**
 * Scans per active user per day (average across paid subscribers).
 * Used to estimate monthly infra cost per subscriber.
 */
export const AVG_SCANS_PER_DAY_PRO = 5;
/** Days per month */
export const DAYS_PER_MONTH = 30;

/** Monthly infra cost estimate per Pro subscriber */
export const MONTHLY_COST_PER_PRO_SUBSCRIBER =
  AVG_SCANS_PER_DAY_PRO * DAYS_PER_MONTH * COST_PER_FULL_SCAN;

/** Gross margin per Go subscriber/month (%) */
export const MARGIN_GO_PCT =
  NET_GO_MONTHLY > 0
    ? ((NET_GO_MONTHLY - MONTHLY_COST_PER_PRO_SUBSCRIBER) / NET_GO_MONTHLY) * 100
    : 0;

/** Gross margin per Plus subscriber/month (%) */
export const MARGIN_PLUS_PCT =
  NET_PLUS_MONTHLY > 0
    ? ((NET_PLUS_MONTHLY - MONTHLY_COST_PER_PRO_SUBSCRIBER) / NET_PLUS_MONTHLY) * 100
    : 0;

// ─── Platform resale fee schedules ────────────────────────────────────────────
//     Used for profit breakdown in premium intel

export const PLATFORM_FEES: Record<string, number> = {
  ebay:     0.1325,  // 13.25% final value fee (avg)
  mercari:  0.10,    // 10%
  poshmark: 0.20,    // 20% on items >$15
  depop:    0.10,    // 10%
  stockx:   0.095,   // 9.5% transaction fee
  goat:     0.099,   // ~9.9%
  facebook: 0.05,    // 5%
  amazon:   0.15,    // ~15%
  default:  0.13,    // conservative estimate
};

/**
 * Look up platform fee for a given source/marketplace string.
 * Case-insensitive, partial-match friendly.
 */
export function getPlatformFee(source: string | null | undefined): number {
  if (!source) return PLATFORM_FEES.default;
  const s = source.toLowerCase();
  for (const [key, fee] of Object.entries(PLATFORM_FEES)) {
    if (key === "default") continue;
    if (s.includes(key)) return fee;
  }
  return PLATFORM_FEES.default;
}

// ─── Value-delivery benchmarks ────────────────────────────────────────────────

/** Minimum "money saved" to count as a value moment (below this = noise) */
export const MIN_SAVED_MOMENT = 5;

/** Minimum estimated profit to label a scan a "flip opportunity" */
export const MIN_FLIP_PROFIT = 10;

/** High-value scan threshold — shows "premium" deal badge */
export const HIGH_VALUE_SCAN_THRESHOLD = 50;

// ─── Upgrade trigger thresholds ──────────────────────────────────────────────

/** Scan count at which to consider an upgrade prompt for the first time */
export const UPGRADE_SCAN_THRESHOLD_FIRST = 4;
/** Total savings at which value-driven upgrade is justified */
export const UPGRADE_SAVINGS_THRESHOLD    = 20;
/** Streak days at which habit-reinforced upgrade makes sense */
export const UPGRADE_STREAK_THRESHOLD     = 3;

// ─── Churn risk factors ───────────────────────────────────────────────────────

/** If last scan was more than this many days ago → churn risk flag */
export const CHURN_INACTIVITY_DAYS = 7;
/** If user saved nothing in last 10 scans → low-value signal */
export const CHURN_LOW_VALUE_SCAN_COUNT = 10;
