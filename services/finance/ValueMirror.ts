/**
 * Evan AI — Value Mirror
 *
 * Computes the "Economic Opportunity Gap" — how much value
 * a free user is leaving on the table by not upgrading.
 *
 * Core psychology: people don't pay for features.
 * They pay to remove uncertainty about missed money.
 *
 * Pure functions, no I/O, no side effects. <1ms compute.
 */

import type { HotDealTier } from "../dealEngine";

// ── Types ────────────────────────────────────────────────────────────────────

export type AspirationTrigger = "HOT_DEAL" | "VIRAL" | "HIGH_PROFIT" | "NONE";

export interface ValueMirrorResult {
  /** What this scan just found */
  profitUnlocked: number;
  /** Estimated value the user is missing today by staying free */
  missedValueEstimate: number;
  /** "Estimated missed profit today: $64" */
  lossFrameText: string;
  /** "You just found a $42 flip in under 2s." */
  winFrameText: string;
  /** "Today's hidden opportunities: ~$87–$214" */
  gapFrameText: string;
  /** What triggered this aspiration surface */
  trigger: AspirationTrigger;
  /** Should the aspiration paywall fire? */
  shouldTrigger: boolean;
}

export interface SessionMomentum {
  /** Hot deals seen this session */
  hotDealsThisSession: number;
  /** Total profit surfaced this session */
  sessionProfitSurfaced: number;
  /** Highest single profit this session */
  sessionBestProfit: number;
  /** Running estimate of missed value */
  cumulativeMissedValue: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Average HOT deals a pro user sees per day (conservative) */
const AVG_HOT_DEALS_PER_DAY = 4;
/** Average profit per hot deal (conservative estimate) */
const AVG_PROFIT_PER_HOT_DEAL = 28;
/** Multiplier for category-level opportunity range (low end) */
const CATEGORY_OPP_LOW = 0.7;
/** Multiplier for category-level opportunity range (high end) */
const CATEGORY_OPP_HIGH = 1.8;

// ── Session Momentum Tracking ────────────────────────────────────────────────

/** Empty session momentum state */
export function emptySessionMomentum(): SessionMomentum {
  return {
    hotDealsThisSession: 0,
    sessionProfitSurfaced: 0,
    sessionBestProfit: 0,
    cumulativeMissedValue: 0,
  };
}

/**
 * Update session momentum after a scan completes.
 * Returns a new SessionMomentum (immutable).
 */
export function updateSessionMomentum(
  current: SessionMomentum,
  hotDealTier: HotDealTier,
  expectedProfit: number,
  remainingFreeScans: number,
): SessionMomentum {
  const isHotPlus = hotDealTier === "HOT" || hotDealTier === "VIRAL";
  const profit = Math.max(0, expectedProfit);

  // Missed value: project remaining scans at this session's average rate
  const totalScans = current.hotDealsThisSession + (isHotPlus ? 1 : 0);
  const avgProfit = totalScans > 0
    ? (current.sessionProfitSurfaced + profit) / (totalScans + 1)
    : AVG_PROFIT_PER_HOT_DEAL;

  // Conservative: assume user would find ~2-3 more hot deals with unlimited scans
  const projectedMissed = avgProfit * Math.max(2, AVG_HOT_DEALS_PER_DAY - totalScans);

  return {
    hotDealsThisSession: current.hotDealsThisSession + (isHotPlus ? 1 : 0),
    sessionProfitSurfaced: current.sessionProfitSurfaced + profit,
    sessionBestProfit: Math.max(current.sessionBestProfit, profit),
    cumulativeMissedValue: Math.round(projectedMissed),
  };
}

// ── Value Mirror Computation ─────────────────────────────────────────────────

/**
 * Compute the Value Mirror for a completed scan.
 *
 * Called after deal engine returns. Determines whether to show
 * the aspiration paywall and what copy to use.
 *
 * @param hotDealTier    - Tier from Hot Deal Layer
 * @param expectedProfit - Expected profit from deep analysis
 * @param momentum       - Current session momentum
 * @param isPro          - Whether user is already subscribed
 * @param scansUsed      - Free scans used today
 * @param freeLimit      - Daily free scan limit
 */
export function computeValueMirror(
  hotDealTier: HotDealTier,
  expectedProfit: number,
  momentum: SessionMomentum,
  isPro: boolean,
  scansUsed: number,
  freeLimit: number,
): ValueMirrorResult {
  const profit = Math.max(0, expectedProfit);

  // ── Trigger classification ────────────────────────────────────────────
  let trigger: AspirationTrigger = "NONE";
  if (hotDealTier === "VIRAL") trigger = "VIRAL";
  else if (hotDealTier === "HOT") trigger = "HOT_DEAL";
  else if (profit >= 20) trigger = "HIGH_PROFIT";

  // ── Should trigger? ───────────────────────────────────────────────────
  // Only trigger for free users on high-momentum moments
  const shouldTrigger = !isPro && trigger !== "NONE";

  // ── Missed value estimate ─────────────────────────────────────────────
  const remaining = Math.max(0, freeLimit - scansUsed);
  const baseEstimate = momentum.cumulativeMissedValue > 0
    ? momentum.cumulativeMissedValue
    : AVG_HOT_DEALS_PER_DAY * AVG_PROFIT_PER_HOT_DEAL;

  const missedValueEstimate = Math.round(baseEstimate);

  // ── Category opportunity range ────────────────────────────────────────
  const oppLow = Math.round(baseEstimate * CATEGORY_OPP_LOW);
  const oppHigh = Math.round(baseEstimate * CATEGORY_OPP_HIGH);

  // ── Copy generation ───────────────────────────────────────────────────
  const profitStr = `$${Math.round(profit)}`;
  const missedStr = `$${missedValueEstimate}`;

  const winFrameText = profit > 0
    ? `You just found a ${profitStr} flip in under 2 seconds.`
    : "You just uncovered a deal opportunity.";

  const gapFrameText = `Today's hidden opportunities: ~$${oppLow}\u2013$${oppHigh}`;

  const lossFrameText = missedValueEstimate > 0
    ? `Free users missed an estimated ${missedStr} in profit today.`
    : "Unlock unlimited scans to find more deals like this.";

  return {
    profitUnlocked: profit,
    missedValueEstimate,
    lossFrameText,
    winFrameText,
    gapFrameText,
    trigger,
    shouldTrigger,
  };
}
