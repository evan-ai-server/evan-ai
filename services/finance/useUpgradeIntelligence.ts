/**
 * Evan AI — useUpgradeIntelligence
 *
 * React hook that computes the right upgrade prompt decision from live app state.
 *
 * Reads from: FinanceState, scan state, subscription state.
 * Returns: UpgradePromptDecision + user segment + conversion copy.
 *
 * Safe defaults: returns show: false until sufficient signal exists.
 * Zero external calls — pure local computation.
 *
 * Usage in AppInner:
 *   const upgrade = useUpgradeIntelligence({ ... });
 *   if (upgrade.decision.show) showPaywall(upgrade.decision.plan);
 */

import { useMemo } from "react";
import type { FinanceState } from "./RetentionFinance";
import {
  classifyUser,
  computeUpgradePropensity,
  computeChurnRisk,
  shouldShowUpgrade,
  getUpgradeHeadline,
  getUpgradePlanTagline,
  type UserEconomicsInput,
  type UserSegment,
  type UpgradePromptDecision,
} from "./SubscriptionEconomics";

export interface UpgradeIntelligenceInput {
  /** Persistent finance state */
  financeState: FinanceState;
  /** Current subscription state */
  isPro: boolean;
  /** Scans used today */
  scansToday: number;
  /** Free scan limit per day */
  freeScanLimit: number;
  /** Whether user has hit free limit today */
  hitFreeLimitToday: boolean;
  /** Watchlist item count */
  watchlistCount: number;
  /** Number of deal alerts clicked (from analytics) */
  dealAlertsClicked?: number;
  /** Number of paywall impressions so far (from analytics) */
  paywallImpressions?: number;
  /** Number of premium feature views */
  premiumFeatureViews?: number;
  /** Days since last scan (0 = scanned today) */
  daysSinceLastScan?: number;
}

export interface UpgradeIntelligenceResult {
  segment:    UserSegment;
  propensity: number;
  churnRisk:  number;
  decision:   UpgradePromptDecision;
  headline:   string;
  tagline:    string;
}

/**
 * Compute upgrade intelligence from live app state.
 * Memoized — only recomputes when inputs change.
 */
export function useUpgradeIntelligence(
  input: UpgradeIntelligenceInput
): UpgradeIntelligenceResult {
  return useMemo(() => {
    const {
      financeState,
      isPro,
      scansToday,
      freeScanLimit,
      hitFreeLimitToday,
      watchlistCount,
      dealAlertsClicked  = 0,
      paywallImpressions = 0,
      premiumFeatureViews = 0,
      daysSinceLastScan  = 0,
    } = input;

    const economics: UserEconomicsInput = {
      totalScans:          financeState.totalScans,
      scansLast7Days:      _estimateWeeklyScans(financeState),
      scansToday,
      totalSavings:        financeState.totalSaved,
      streakDays:          financeState.savingsStreak,
      watchlistCount,
      dealAlertsClicked,
      paywallImpressions,
      flipViewCount:       financeState.flipOpportunityCount,
      isPro,
      daysSinceLastScan,
      hitFreeLimitToday,
      premiumFeatureViews,
    };

    const segment    = classifyUser(economics);
    const propensity = computeUpgradePropensity(economics);
    const churnRisk  = computeChurnRisk(economics);
    const decision   = shouldShowUpgrade(economics, segment);

    const plan = decision.show ? decision.plan : "go";
    const headline = getUpgradeHeadline(segment, financeState.totalSaved);
    const tagline  = getUpgradePlanTagline(plan);

    return { segment, propensity, churnRisk, decision, headline, tagline };
  }, [input]);
}

// ─── Private ─────────────────────────────────────────────────────────────────

function _estimateWeeklyScans(state: FinanceState): number {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  // Estimate from monthly bucket: use current month's scan count
  const mo  = new Date().toISOString().slice(0, 7);
  const bkt = state.monthlyBuckets[mo];
  if (!bkt) return 0;
  // Pro-rate to 7 days
  const dayOfMonth = new Date().getDate();
  if (dayOfMonth <= 0) return 0;
  return Math.round((bkt.scans / dayOfMonth) * 7);
}
