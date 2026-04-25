/**
 * Evan AI — Subscription Economics
 *
 * Intelligence for subscription conversion, churn prevention,
 * user segmentation, and upgrade timing.
 *
 * Zero side effects — all functions are pure.
 * Wire these signals into the app's upgrade prompt logic.
 */

import {
  FREE_SCANS_PER_DAY,
  UPGRADE_SCAN_THRESHOLD_FIRST,
  UPGRADE_SAVINGS_THRESHOLD,
  UPGRADE_STREAK_THRESHOLD,
  CHURN_INACTIVITY_DAYS,
  CHURN_LOW_VALUE_SCAN_COUNT,
  PLAN_GO_MONTHLY,
  PLAN_PLUS_MONTHLY,
} from "./FinanceConfig";

// ─── User segment ─────────────────────────────────────────────────────────────

/**
 * User behavioral segment — informs paywall messaging and upgrade timing.
 *
 * low_value       → casual browsing, rarely saves money, low engagement
 * curious_shopper → moderate engagement, saves occasionally, not a flipper
 * deal_hunter     → actively finds deals, high scan count, responds to alerts
 * flipper         → high flip score, looks at resale margins, power user
 * power_user      → daily active, multiple categories, strong LTV signal
 * premium_intent  → hitting free limits regularly, requests premium features
 */
export type UserSegment =
  | "low_value"
  | "curious_shopper"
  | "deal_hunter"
  | "flipper"
  | "power_user"
  | "premium_intent";

// ─── Input types ─────────────────────────────────────────────────────────────

export interface UserEconomicsInput {
  /** Total scans all time */
  totalScans: number;
  /** Scans in the last 7 days */
  scansLast7Days: number;
  /** Scans today */
  scansToday: number;
  /** Total dollar savings delivered to user */
  totalSavings: number;
  /** Active usage streak in days */
  streakDays: number;
  /** Number of watchlist items */
  watchlistCount: number;
  /** Number of deal alerts clicked */
  dealAlertsClicked: number;
  /** Number of times the paywall was shown but not converted */
  paywallImpressions: number;
  /** Number of items where user viewed flip/resale data */
  flipViewCount: number;
  /** Whether user is currently on a paid tier */
  isPro: boolean;
  /** Days since last scan (0 = scanned today) */
  daysSinceLastScan: number;
  /** Whether user has hit the free scan limit today */
  hitFreeLimitToday: boolean;
  /** Number of premium feature views (gated content seen) */
  premiumFeatureViews: number;
}

// ─── User Segmentation ──────────────────────────────────────────────────────────

/**
 * Classify a user into a behavioral segment based on usage signals.
 * Designed for upgrade message targeting and paywall timing.
 */
export function classifyUser(input: UserEconomicsInput): UserSegment {
  const {
    totalScans,
    scansLast7Days,
    totalSavings,
    watchlistCount,
    dealAlertsClicked,
    flipViewCount,
    hitFreeLimitToday,
    premiumFeatureViews,
    streakDays,
  } = input;

  // Premium intent: hitting limits, viewing gated features
  if (hitFreeLimitToday || premiumFeatureViews >= 3 || watchlistCount >= 5) {
    return "premium_intent";
  }

  // Flipper: high flip view engagement
  if (flipViewCount >= 5 && totalScans >= 10) {
    return "flipper";
  }

  // Power user: daily active, high scan volume
  if (streakDays >= 5 && scansLast7Days >= 10) {
    return "power_user";
  }

  // Deal hunter: responds to alerts, moderate scan volume
  if (dealAlertsClicked >= 2 || (scansLast7Days >= 5 && totalSavings >= 20)) {
    return "deal_hunter";
  }

  // Curious shopper: scans regularly, saves occasionally
  if (totalScans >= UPGRADE_SCAN_THRESHOLD_FIRST) {
    return "curious_shopper";
  }

  return "low_value";
}

// ─── Upgrade Propensity ──────────────────────────────────────────────────────────

/**
 * Compute upgrade propensity score (0–1).
 * 1.0 = user is almost certain to convert if shown the right paywall.
 * 0.0 = this user is not ready and showing a paywall now would harm retention.
 */
export function computeUpgradePropensity(input: UserEconomicsInput): number {
  let score = 0;

  // Hard signals (each worth a lot)
  if (input.hitFreeLimitToday)          score += 0.35; // most reliable conversion trigger
  if (input.premiumFeatureViews >= 2)   score += 0.20;
  if (input.paywallImpressions >= 1 && input.paywallImpressions <= 3) score += 0.10; // seen it, not fatigued

  // Behavioral signals (engagement depth)
  if (input.flipViewCount >= 3)         score += 0.10;
  if (input.watchlistCount >= 3)        score += 0.08;
  if (input.dealAlertsClicked >= 2)     score += 0.08;
  if (input.streakDays >= UPGRADE_STREAK_THRESHOLD) score += 0.07;
  if (input.totalSavings >= UPGRADE_SAVINGS_THRESHOLD) score += 0.07;

  // Scan volume signals
  if (input.scansLast7Days >= 7)        score += 0.05;
  if (input.totalScans >= 20)           score += 0.05;

  // Paywall fatigue — decays score if overexposed
  if (input.paywallImpressions >= 5)   score -= 0.10;
  if (input.paywallImpressions >= 10)  score -= 0.20;

  return Math.max(0, Math.min(1, score));
}

// ─── Churn Risk ──────────────────────────────────────────────────────────────────

/**
 * Compute churn risk for a paid subscriber (0–1).
 * 1.0 = very likely to cancel. 0.0 = healthy subscriber.
 *
 * Only meaningful for paid users — free users don't churn.
 */
export function computeChurnRisk(input: UserEconomicsInput): number {
  if (!input.isPro) return 0; // free users don't have a churn risk

  let risk = 0;

  // Inactivity is the #1 churn signal
  if (input.daysSinceLastScan >= CHURN_INACTIVITY_DAYS)  risk += 0.40;
  else if (input.daysSinceLastScan >= 3)                 risk += 0.15;

  // Low recent usage
  if (input.scansLast7Days === 0)  risk += 0.25;
  else if (input.scansLast7Days <= 2)  risk += 0.10;

  // Zero value delivered recently
  if (input.totalSavings === 0 && input.totalScans >= CHURN_LOW_VALUE_SCAN_COUNT) {
    risk += 0.15;
  }

  // Low engagement breadth
  if (input.watchlistCount === 0)       risk += 0.05;
  if (input.dealAlertsClicked === 0)    risk += 0.05;
  if (input.flipViewCount === 0)        risk += 0.05;

  return Math.max(0, Math.min(1, risk));
}

// ─── Upgrade timing logic ─────────────────────────────────────────────────────

export type UpgradePromptDecision =
  | { show: true;  plan: "go" | "plus"; reason: string; urgency: "high" | "medium" | "low" }
  | { show: false; reason: string };

/**
 * Decide whether to show an upgrade prompt, which plan to emphasize,
 * and the messaging urgency.
 *
 * Rules:
 * - Never show to already-Pro users.
 * - Never show on the user's first scan (let them see value first).
 * - Never show if paywallImpressions >= 12 (fatigue guard).
 * - High urgency when free limit is hit.
 * - Emphasize Plus for flippers/power users; Go for deal hunters.
 */
export function shouldShowUpgrade(
  input: UserEconomicsInput,
  segment: UserSegment
): UpgradePromptDecision {
  // Hard gates
  if (input.isPro) return { show: false, reason: "already_pro" };
  if (input.totalScans < 2) return { show: false, reason: "too_early" };
  if (input.paywallImpressions >= 12) return { show: false, reason: "fatigue_guard" };

  const propensity = computeUpgradePropensity(input);

  // High urgency: free limit hit right now
  if (input.hitFreeLimitToday) {
    const plan = segment === "flipper" || segment === "power_user" ? "plus" : "go";
    return { show: true, plan, reason: "free_limit_hit", urgency: "high" };
  }

  // Medium urgency: strong propensity signal
  if (propensity >= 0.45) {
    const plan = segment === "flipper" || segment === "power_user" ? "plus" : "go";
    const urgency = propensity >= 0.65 ? "high" : "medium";
    return { show: true, plan, reason: "high_propensity", urgency };
  }

  // Low urgency: after savings milestone
  if (input.totalSavings >= UPGRADE_SAVINGS_THRESHOLD && input.paywallImpressions < 3) {
    return { show: true, plan: "go", reason: "savings_milestone", urgency: "low" };
  }

  // Low urgency: streak milestone
  if (input.streakDays >= UPGRADE_STREAK_THRESHOLD && input.paywallImpressions === 0) {
    return { show: true, plan: "go", reason: "streak_milestone", urgency: "low" };
  }

  return { show: false, reason: "not_ready" };
}

// ─── Conversion message copy ──────────────────────────────────────────────────

/**
 * Return a value-prop headline appropriate for the user's segment.
 * Use these in upgrade UI to make the pitch feel personal, not generic.
 */
export function getUpgradeHeadline(segment: UserSegment, savings: number): string {
  const savingsStr = savings > 0 ? `$${Math.round(savings)} saved so far` : "";

  switch (segment) {
    case "premium_intent":
      return "You've maxed your free scans.";
    case "flipper":
      return "Your flip engine is capped.";
    case "power_user":
      return "You're a power user. Unlock everything.";
    case "deal_hunter":
      return savingsStr
        ? `${savingsStr} — unlock unlimited deals.`
        : "Unlimited deal alerts are waiting.";
    case "curious_shopper":
      return "You're getting the hang of it.";
    case "low_value":
    default:
      return "More scans, more savings.";
  }
}

/**
 * Return a value-prop sub-headline for the selected plan.
 */
export function getUpgradePlanTagline(plan: "go" | "plus"): string {
  if (plan === "plus") {
    return `Everything unlocked for $${PLAN_PLUS_MONTHLY}/mo — less than a cup of coffee.`;
  }
  return `Unlimited scans + alerts for $${PLAN_GO_MONTHLY}/mo. Cancel any time.`;
}

// ─── Renewal value ────────────────────────────────────────────────────────────

/**
 * Estimate the renewal value for a subscriber based on their usage pattern.
 * Used for retention-focused messaging when churn risk is elevated.
 */
export function computeRenewalValue(
  input: UserEconomicsInput,
  tier: "go" | "plus"
): { monthlyValue: number; yearlyValue: number; isWorthRenewing: boolean } {
  // User's average monthly savings × 12 = yearly savings they'd lose
  const weeksPerMonth = 52 / 12;
  const weeklySavings = input.scansLast7Days > 0
    ? (input.totalSavings / Math.max(1, input.totalScans)) * input.scansLast7Days
    : 0;
  const monthlyValue  = weeklySavings * weeksPerMonth;
  const yearlyValue   = monthlyValue * 12;

  const monthlyPrice  = tier === "plus" ? PLAN_PLUS_MONTHLY : PLAN_GO_MONTHLY;
  const isWorthRenewing = monthlyValue >= monthlyPrice * 1.5; // value at least 1.5× the price

  return {
    monthlyValue:    Math.round(monthlyValue  * 100) / 100,
    yearlyValue:     Math.round(yearlyValue   * 100) / 100,
    isWorthRenewing,
  };
}
