/**
 * Evan AI — Retention Finance
 *
 * Finance-aware retention logic: value storytelling, "money saved" moments,
 * usage reinforcement, and re-engagement signals.
 *
 * Provides the data scaffolding for retention surfaces.
 * Does NOT render anything — that's the component's job.
 */

import {
  MIN_SAVED_MOMENT,
  MIN_FLIP_PROFIT,
  CHURN_INACTIVITY_DAYS,
} from "./FinanceConfig";

// ─── Finance State (persisted) ────────────────────────────────────────────────

/**
 * The finance state persisted to AsyncStorage.
 * This is the single source of truth for cumulative user-facing financial metrics.
 *
 * Storage key: EVAN_FINANCE_STATE_V1
 */
export interface FinanceState {
  /** Schema version for forward-compatibility */
  version: 1;

  // ── Cumulative savings ─────────────────────────────────────────────────────
  /** Total dollars saved across all scans (scannedPrice − cheapestPrice) */
  totalSaved: number;
  /** Total dollars saved this calendar month */
  monthSaved: number;
  /** Best single-scan savings ever */
  bestSingleSave: number;
  /** ISO date of best single save */
  bestSingleSaveDate: string | null;

  // ── Flip intelligence ──────────────────────────────────────────────────────
  /** Total estimated flip profit identified (sum of expectedProfit on flip scans) */
  totalFlipOpportunity: number;
  /** Number of scans where a flip opportunity was identified */
  flipOpportunityCount: number;

  // ── Bad buys avoided ──────────────────────────────────────────────────────
  /** Number of scans where user was about to overpay (verdict: OVERPRICED) */
  badBuysAvoided: number;
  /** Estimated dollars avoided by not buying overpriced items */
  overpricedDollarsAvoided: number;

  // ── Value streaks ─────────────────────────────────────────────────────────
  /** Consecutive days with at least one money-saving scan */
  savingsStreak: number;
  /** Last day the savings streak was bumped (YYYY-MM-DD) */
  savingsStreakLastDay: string | null;

  // ── Scan history summary ──────────────────────────────────────────────────
  /** Total scans all time */
  totalScans: number;
  /** Total scans this month */
  monthScans: number;
  /** Unix timestamp of last scan */
  lastScanTs: number | null;

  // ── Monthly buckets (for "your best month was…") ──────────────────────────
  /** Map of YYYY-MM → { saved, scans } */
  monthlyBuckets: Record<string, { saved: number; scans: number }>;
}

/** Default empty finance state */
export function emptyFinanceState(): FinanceState {
  return {
    version: 1,
    totalSaved: 0,
    monthSaved: 0,
    bestSingleSave: 0,
    bestSingleSaveDate: null,
    totalFlipOpportunity: 0,
    flipOpportunityCount: 0,
    badBuysAvoided: 0,
    overpricedDollarsAvoided: 0,
    savingsStreak: 0,
    savingsStreakLastDay: null,
    totalScans: 0,
    monthScans: 0,
    lastScanTs: null,
    monthlyBuckets: {},
  };
}

// ─── State update helpers ─────────────────────────────────────────────────────

const dayKey  = (ts: number) => new Date(ts).toISOString().slice(0, 10);
const monthKey = (ts: number) => new Date(ts).toISOString().slice(0, 7);
const todayKey = () => dayKey(Date.now());
const curMonth = () => monthKey(Date.now());

/**
 * Record a completed scan into the finance state.
 * Returns a new FinanceState (immutable update).
 *
 * @param state       - Current state
 * @param savedAmount - Dollars saved (0 if none or N/A)
 * @param flipProfit  - Expected flip profit in dollars (null if not a flip)
 * @param verdict     - Scan verdict string ("GREAT FLIP", "RISKY", "OVERPRICED", etc.)
 * @param scannedPrice - What the seller was asking (for overpriced calculation)
 * @param now         - Timestamp override for testing
 */
export function recordScan(
  state: FinanceState,
  savedAmount: number,
  flipProfit: number | null,
  verdict: string | null,
  scannedPrice: number | null,
  now = Date.now()
): FinanceState {
  const safe = (n: any) => (Number.isFinite(n) ? Number(n) : 0);
  const saved = safe(savedAmount);
  const flip  = flipProfit != null && Number.isFinite(flipProfit) ? flipProfit : null;
  const mo    = curMonth();
  const today = dayKey(now);

  // Monthly bucket
  const bucket = state.monthlyBuckets[mo] ?? { saved: 0, scans: 0 };
  const newBuckets = {
    ...state.monthlyBuckets,
    [mo]: { saved: bucket.saved + saved, scans: bucket.scans + 1 },
  };

  // Best single save
  let bestSave     = state.bestSingleSave;
  let bestSaveDate = state.bestSingleSaveDate;
  if (saved > bestSave) {
    bestSave     = saved;
    bestSaveDate = today;
  }

  // Month rollover: reset monthSaved and monthScans if month changed
  const lastScanMonth = state.lastScanTs ? monthKey(state.lastScanTs) : null;
  const monthSaved    = lastScanMonth !== mo ? saved : state.monthSaved + saved;
  const monthScans    = lastScanMonth !== mo ? 1    : state.monthScans + 1;

  // Savings streak
  let streak = state.savingsStreak;
  let streakDay = state.savingsStreakLastDay;
  if (saved >= MIN_SAVED_MOMENT) {
    const yesterday = dayKey(now - 86_400_000);
    if (streakDay === today) {
      // already counted today — no change
    } else if (streakDay === yesterday) {
      streak++;
      streakDay = today;
    } else {
      streak = 1;
      streakDay = today;
    }
  }

  // Overpriced avoidance
  const isOverpriced = String(verdict || "").toUpperCase() === "OVERPRICED" ||
    String(verdict || "").toUpperCase() === "RISKY";
  const avoided    = isOverpriced ? state.badBuysAvoided + 1 : state.badBuysAvoided;
  const avoidedDollars = isOverpriced && scannedPrice
    ? state.overpricedDollarsAvoided + safe(scannedPrice)
    : state.overpricedDollarsAvoided;

  // Flip opportunity tracking
  const isFlipScan = flip != null && flip >= MIN_FLIP_PROFIT;
  const flipOpCount = isFlipScan ? state.flipOpportunityCount + 1 : state.flipOpportunityCount;
  const flipOpTotal = isFlipScan ? state.totalFlipOpportunity + flip! : state.totalFlipOpportunity;

  return {
    ...state,
    totalSaved:              state.totalSaved + saved,
    monthSaved,
    monthScans,
    bestSingleSave:          bestSave,
    bestSingleSaveDate:      bestSaveDate,
    totalFlipOpportunity:    flipOpTotal,
    flipOpportunityCount:    flipOpCount,
    badBuysAvoided:          avoided,
    overpricedDollarsAvoided: avoidedDollars,
    savingsStreak:           streak,
    savingsStreakLastDay:     streakDay,
    totalScans:              state.totalScans + 1,
    lastScanTs:              now,
    monthlyBuckets:          newBuckets,
  };
}

// ─── Value Moments ────────────────────────────────────────────────────────────

export interface ValueMoment {
  type:
    | "savings_total"
    | "savings_milestone"
    | "flip_opportunity"
    | "bad_buy_avoided"
    | "streak"
    | "best_month"
    | "big_save";
  headline: string;
  subline: string | null;
  /** Dollar amount associated with this moment */
  amount: number | null;
  /** Whether this is a high-impact surface (show prominently) */
  isPrimary: boolean;
}

/**
 * Compute human-readable value moments from the finance state.
 * Returns an ordered list (highest impact first) suitable for UI rendering.
 *
 * Call this to power the "Evan saved you $X" surfaces.
 */
export function computeValueMoments(state: FinanceState): ValueMoment[] {
  const moments: ValueMoment[] = [];
  const fmt = (n: number) => `$${n.toFixed(2).replace(/\.00$/, "")}`;

  // Total savings (always show if > threshold)
  if (state.totalSaved >= MIN_SAVED_MOMENT) {
    const isMilestone = state.totalSaved >= 100 || state.totalSaved >= 50 || state.totalSaved >= 25;
    moments.push({
      type: "savings_total",
      headline: `You've saved ${fmt(state.totalSaved)} with Evan AI`,
      subline: `Across ${state.totalScans} scans`,
      amount: state.totalSaved,
      isPrimary: true,
    });
    if (isMilestone) {
      moments.push({
        type: "savings_milestone",
        headline: _savingsMilestoneLabel(state.totalSaved),
        subline: null,
        amount: state.totalSaved,
        isPrimary: false,
      });
    }
  }

  // Best single save
  if (state.bestSingleSave >= MIN_SAVED_MOMENT) {
    moments.push({
      type: "big_save",
      headline: `Your best single save: ${fmt(state.bestSingleSave)}`,
      subline: state.bestSingleSaveDate
        ? `on ${state.bestSingleSaveDate}`
        : null,
      amount: state.bestSingleSave,
      isPrimary: false,
    });
  }

  // Flip opportunities surfaced
  if (state.flipOpportunityCount >= 1 && state.totalFlipOpportunity >= MIN_FLIP_PROFIT) {
    moments.push({
      type: "flip_opportunity",
      headline: `${state.flipOpportunityCount} flip ${state.flipOpportunityCount === 1 ? "opportunity" : "opportunities"} found`,
      subline: `Up to ${fmt(state.totalFlipOpportunity)} in estimated profit`,
      amount: state.totalFlipOpportunity,
      isPrimary: state.flipOpportunityCount >= 3,
    });
  }

  // Bad buys avoided
  if (state.badBuysAvoided >= 1) {
    moments.push({
      type: "bad_buy_avoided",
      headline: `Avoided ${state.badBuysAvoided} bad ${state.badBuysAvoided === 1 ? "buy" : "buys"}`,
      subline: state.overpricedDollarsAvoided > 0
        ? `Didn't overpay ${fmt(state.overpricedDollarsAvoided)}`
        : null,
      amount: state.overpricedDollarsAvoided || null,
      isPrimary: state.badBuysAvoided >= 3,
    });
  }

  // Savings streak
  if (state.savingsStreak >= 2) {
    moments.push({
      type: "streak",
      headline: `${state.savingsStreak}-day savings streak`,
      subline: "Keep scanning to maintain it",
      amount: null,
      isPrimary: state.savingsStreak >= 5,
    });
  }

  // Best month
  const bestMonth = _computeBestMonth(state.monthlyBuckets);
  if (bestMonth && bestMonth.saved >= MIN_SAVED_MOMENT) {
    moments.push({
      type: "best_month",
      headline: `Your best month: ${fmt(bestMonth.saved)} saved`,
      subline: bestMonth.label,
      amount: bestMonth.saved,
      isPrimary: false,
    });
  }

  // Sort: primary first, then by amount descending
  moments.sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return (b.amount ?? 0) - (a.amount ?? 0);
  });

  return moments;
}

// ─── Re-engagement signals ─────────────────────────────────────────────────────

export interface ReengagementSignal {
  type: "missed_savings" | "trending_up" | "trending_down" | "inactive";
  message: string;
  /** Estimated value at stake */
  valueAtStake: number | null;
}

/**
 * Compute re-engagement signals to drive return visits.
 * These power push notifications, deal alert banners, and "come back" moments.
 */
export function computeReengagementSignals(
  state: FinanceState,
  daysSinceLastScan: number
): ReengagementSignal[] {
  const signals: ReengagementSignal[] = [];
  const fmt = (n: number) => `$${Math.round(n)}`;

  // Inactive user
  if (daysSinceLastScan >= CHURN_INACTIVITY_DAYS) {
    signals.push({
      type: "inactive",
      message: `You haven't scanned in ${daysSinceLastScan} days — deals don't wait.`,
      valueAtStake: null,
    });
  }

  // Month trending down
  const mo = curMonth();
  const lastMo = _prevMonthKey();
  const thisBucket = state.monthlyBuckets[mo];
  const lastBucket = state.monthlyBuckets[lastMo];
  if (thisBucket && lastBucket && thisBucket.saved < lastBucket.saved * 0.5) {
    const missed = lastBucket.saved - thisBucket.saved;
    signals.push({
      type: "trending_down",
      message: `Savings are down this month. Last month you saved ${fmt(lastBucket.saved)}.`,
      valueAtStake: missed,
    });
  }

  // Month trending up
  if (thisBucket && lastBucket && thisBucket.saved > lastBucket.saved * 1.2) {
    signals.push({
      type: "trending_up",
      message: `You're saving more this month than last — keep the streak going.`,
      valueAtStake: thisBucket.saved,
    });
  }

  return signals;
}

// ─── Persistence helpers ───────────────────────────────────────────────────────

export const FINANCE_STATE_KEY = "EVAN_FINANCE_STATE_V1";

/**
 * Parse raw AsyncStorage string to FinanceState.
 * Falls back to emptyFinanceState() on any error or schema mismatch.
 */
export function parseFinanceState(raw: string | null): FinanceState {
  if (!raw) return emptyFinanceState();
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1) return emptyFinanceState();
    // Merge with empty so new fields are always present
    return { ...emptyFinanceState(), ...parsed, version: 1 };
  } catch {
    return emptyFinanceState();
  }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function _savingsMilestoneLabel(total: number): string {
  if (total >= 1000) return "You've saved over $1,000 with Evan AI!";
  if (total >= 500)  return "You've crossed $500 saved — impressive.";
  if (total >= 100)  return "First $100 saved. That's a habit now.";
  if (total >= 50)   return "You've saved $50+ — Evan's paying for itself.";
  return "You're on a roll.";
}

function _computeBestMonth(
  buckets: Record<string, { saved: number; scans: number }>
): { label: string; saved: number; scans: number } | null {
  const entries = Object.entries(buckets);
  if (!entries.length) return null;
  const best = entries.reduce((a, b) => (b[1].saved > a[1].saved ? b : a));
  const [key, data] = best;
  const [year, month] = key.split("-");
  const label = new Date(Number(year), Number(month) - 1, 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
  return { label, ...data };
}

function _prevMonthKey(): string {
  const now = new Date();
  now.setMonth(now.getMonth() - 1);
  return now.toISOString().slice(0, 7);
}
