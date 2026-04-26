/**
 * Evan AI — Finance Analytics
 *
 * Internal metrics layer for business visibility.
 *
 * Instruments the revenue funnel: scan → result view → paywall → purchase.
 * Produces session-level economic summaries readable by future dashboards.
 *
 * Safe: all persistence is non-blocking fire-and-forget.
 * Observable: structured events with stable keys.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SubscriptionTier } from "./FinanceEngine";

// ─── Revenue Funnel Events ─────────────────────────────────────────────────────

export type FunnelStep =
  | "scan_started"
  | "scan_completed"
  | "result_viewed"
  | "deal_alert_opened"
  | "paywall_shown"
  | "subscription_clicked"
  | "subscription_purchased"
  | "premium_feature_used"
  | "listing_clicked"
  | "watchlist_added"
  | "session_ended";

export interface FunnelEvent {
  step: FunnelStep;
  /** Revenue-relevant context */
  context: {
    userId:      string | null;
    scanId:      string | null;
    tier:        SubscriptionTier;
    itemName:    string | null;
    price:       number | null;
    savedAmount: number | null;
    flipProfit:  number | null;
    verdict:     string | null;
    /** Plan selected at paywall / purchase */
    plan:        string | null;
    /** Feature name for paywall/premium events */
    feature:     string | null;
  };
  ts: number;
}

// ─── Session Summary ───────────────────────────────────────────────────────────

export interface SessionSummary {
  sessionId: string;
  startTs:   number;
  endTs:     number | null;
  userId:    string | null;
  tier:      SubscriptionTier;
  scanCount:      number;
  totalSaved:     number;
  totalFlipValue: number;
  paywallShown:   boolean;
  purchased:      boolean;
  listingClicks:  number;
  funnelEvents:   FunnelStep[];
}

// ─── Business Metrics Snapshot ────────────────────────────────────────────────

/**
 * A periodic snapshot of app health metrics for operational dashboards.
 * Write to AsyncStorage; read externally by admin tooling or future analytics.
 */
export interface BusinessMetricsSnapshot {
  snapshotTs: number;
  /** Rolling 7-day scan count (from local events only) */
  scans7d:  number;
  /** Rolling 7-day savings total */
  saved7d:  number;
  /** Number of paywall impressions in last 7 days */
  paywall7d: number;
  /** Conversion events in last 7 days */
  conversions7d: number;
  /** Active alert opens in last 7 days */
  alertOpens7d: number;
  /** Listing clicks in last 7 days */
  clicks7d: number;
  /** Current tier (most recently observed) */
  tier: SubscriptionTier;
}

// ─── Storage keys ─────────────────────────────────────────────────────────────

const FUNNEL_EVENTS_KEY   = "EVAN_FUNNEL_EVENTS_V1";
const SESSION_SUMMARY_KEY = "EVAN_SESSION_SUMMARY_V1";
const METRICS_SNAPSHOT_KEY = "EVAN_METRICS_SNAPSHOT_V1";

const MAX_FUNNEL_EVENTS = 500; // cap to avoid storage bloat
const DAYS_7 = 7 * 24 * 60 * 60 * 1000;

// ─── FinanceAnalytics singleton ────────────────────────────────────────────────

class _FinanceAnalytics {
  private _session: SessionSummary | null = null;
  private _events: FunnelEvent[] = [];
  private _loaded = false;

  // ── Session lifecycle ────────────────────────────────────────────────────────

  startSession(userId: string | null, tier: SubscriptionTier): void {
    this._session = {
      sessionId:  `s_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      startTs:    Date.now(),
      endTs:      null,
      userId,
      tier,
      scanCount:      0,
      totalSaved:     0,
      totalFlipValue: 0,
      paywallShown:   false,
      purchased:      false,
      listingClicks:  0,
      funnelEvents:   [],
    };
  }

  endSession(): void {
    if (!this._session) return;
    this._session.endTs = Date.now();
    this._persistSession(this._session).catch(() => {});
  }

  // ── Event recording ───────────────────────────────────────────────────────────

  record(
    step: FunnelStep,
    ctx: Partial<FunnelEvent["context"]> & { tier: SubscriptionTier }
  ): void {
    const event: FunnelEvent = {
      step,
      context: {
        userId:      ctx.userId      ?? null,
        scanId:      ctx.scanId      ?? null,
        tier:        ctx.tier,
        itemName:    ctx.itemName    ?? null,
        price:       ctx.price       ?? null,
        savedAmount: ctx.savedAmount ?? null,
        flipProfit:  ctx.flipProfit  ?? null,
        verdict:     ctx.verdict     ?? null,
        plan:        ctx.plan        ?? null,
        feature:     ctx.feature     ?? null,
      },
      ts: Date.now(),
    };

    // Update in-memory event log (bounded)
    this._events.push(event);
    if (this._events.length > MAX_FUNNEL_EVENTS) {
      this._events.splice(0, this._events.length - MAX_FUNNEL_EVENTS);
    }

    // Update session
    if (this._session) {
      this._session.funnelEvents.push(step);
      if (step === "scan_completed") this._session.scanCount++;
      if (step === "paywall_shown")  this._session.paywallShown = true;
      if (step === "subscription_purchased") this._session.purchased = true;
      if (step === "listing_clicked") this._session.listingClicks++;
      if (ctx.savedAmount && ctx.savedAmount > 0) {
        this._session.totalSaved += ctx.savedAmount;
      }
      if (ctx.flipProfit && ctx.flipProfit > 0) {
        this._session.totalFlipValue += ctx.flipProfit;
      }
    }

    // Async persist (fire-and-forget, never blocks render)
    this._persistEvents().catch(() => {});
  }

  // ── Convenience recorders ─────────────────────────────────────────────────────

  recordScanStarted(
    userId: string | null,
    scanId: string,
    tier: SubscriptionTier
  ): void {
    this.record("scan_started", { userId, scanId, tier });
  }

  recordScanCompleted(
    userId: string | null,
    scanId: string,
    tier: SubscriptionTier,
    itemName: string,
    price: number | null,
    savedAmount: number,
    flipProfit: number | null,
    verdict: string | null
  ): void {
    this.record("scan_completed", {
      userId, scanId, tier, itemName, price, savedAmount, flipProfit, verdict,
    });
  }

  recordPaywallShown(userId: string | null, tier: SubscriptionTier, feature: string): void {
    this.record("paywall_shown", { userId, tier, feature });
  }

  recordSubscriptionClicked(userId: string | null, tier: SubscriptionTier, plan: string): void {
    this.record("subscription_clicked", { userId, tier, plan });
  }

  recordPurchased(userId: string | null, plan: string): void {
    this.record("subscription_purchased", {
      userId,
      tier: plan === "plus" ? "plus" : "go",
      plan,
    });
  }

  recordPremiumFeatureUsed(
    userId: string | null,
    tier: SubscriptionTier,
    feature: string
  ): void {
    this.record("premium_feature_used", { userId, tier, feature });
  }

  recordAlertOpened(userId: string | null, tier: SubscriptionTier, itemName: string): void {
    this.record("deal_alert_opened", { userId, tier, itemName });
  }

  recordListingClicked(
    userId: string | null,
    tier: SubscriptionTier,
    itemName: string,
    price: number | null
  ): void {
    this.record("listing_clicked", { userId, tier, itemName, price });
  }

  /**
   * Record Deal Engine _meta for monetization tracking.
   * Fire-and-forget — persists to AsyncStorage for dashboard reads.
   */
  recordDealMeta(
    scanId: string,
    potentialCommission: number,
    roiPercentage: number,
    processingMs: number
  ): void {
    AsyncStorage.getItem("EVAN_DEAL_META_V1")
      .then((raw) => {
        const entries: any[] = raw ? JSON.parse(raw) : [];
        entries.unshift({
          scanId,
          potentialCommission,
          roiPercentage,
          processingMs,
          ts: Date.now(),
        });
        // Keep last 200 entries
        return AsyncStorage.setItem(
          "EVAN_DEAL_META_V1",
          JSON.stringify(entries.slice(0, 200))
        );
      })
      .catch(() => {});
  }

  // ── Metrics computation ──────────────────────────────────────────────────────

  /**
   * Compute a 7-day rolling metrics snapshot from locally cached events.
   * Suitable for client-side observability or background sync to a dashboard.
   */
  computeSnapshot(tier: SubscriptionTier): BusinessMetricsSnapshot {
    const cutoff = Date.now() - DAYS_7;
    const recent = this._events.filter((e) => e.ts >= cutoff);

    return {
      snapshotTs:     Date.now(),
      scans7d:        recent.filter((e) => e.step === "scan_completed").length,
      saved7d:        recent
        .filter((e) => e.step === "scan_completed")
        .reduce((s, e) => s + (e.context.savedAmount ?? 0), 0),
      paywall7d:      recent.filter((e) => e.step === "paywall_shown").length,
      conversions7d:  recent.filter((e) => e.step === "subscription_purchased").length,
      alertOpens7d:   recent.filter((e) => e.step === "deal_alert_opened").length,
      clicks7d:       recent.filter((e) => e.step === "listing_clicked").length,
      tier,
    };
  }

  /**
   * Compute simple funnel conversion stats from cached events.
   * Returns step counts for scan → result → paywall → purchase.
   */
  computeFunnelStats(): {
    scans:     number;
    results:   number;
    paywalls:  number;
    purchases: number;
    scanToResult:   number;   // %
    resultToPaywall: number;  // %
    paywallToConvert: number; // %
  } {
    const scans     = this._events.filter((e) => e.step === "scan_started").length;
    const results   = this._events.filter((e) => e.step === "result_viewed").length;
    const paywalls  = this._events.filter((e) => e.step === "paywall_shown").length;
    const purchases = this._events.filter((e) => e.step === "subscription_purchased").length;

    const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

    return {
      scans,
      results,
      paywalls,
      purchases,
      scanToResult:     pct(results,   scans),
      resultToPaywall:  pct(paywalls,  results),
      paywallToConvert: pct(purchases, paywalls),
    };
  }

  // ── Session getter ────────────────────────────────────────────────────────────

  get currentSession(): SessionSummary | null {
    return this._session ? { ...this._session } : null;
  }

  // ── Load from storage (call once at app init) ─────────────────────────────────

  async load(): Promise<void> {
    if (this._loaded) return;
    try {
      const raw = await AsyncStorage.getItem(FUNNEL_EVENTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this._events = parsed.slice(-MAX_FUNNEL_EVENTS);
        }
      }
    } catch {}
    this._loaded = true;
  }

  // ── Persistence ───────────────────────────────────────────────────────────────

  private async _persistEvents(): Promise<void> {
    try {
      await AsyncStorage.setItem(
        FUNNEL_EVENTS_KEY,
        JSON.stringify(this._events)
      );
    } catch {}
  }

  private async _persistSession(session: SessionSummary): Promise<void> {
    try {
      // Read last N sessions and prepend current
      const raw = await AsyncStorage.getItem(SESSION_SUMMARY_KEY);
      const sessions: SessionSummary[] = raw ? JSON.parse(raw) : [];
      sessions.unshift(session);
      // Keep last 50 sessions
      await AsyncStorage.setItem(
        SESSION_SUMMARY_KEY,
        JSON.stringify(sessions.slice(0, 50))
      );
    } catch {}
  }

  async persistSnapshot(tier: SubscriptionTier): Promise<void> {
    try {
      const snap = this.computeSnapshot(tier);
      await AsyncStorage.setItem(METRICS_SNAPSHOT_KEY, JSON.stringify(snap));
    } catch {}
  }
}

// ── Export singleton ────────────────────────────────────────────────────────────
export const FinanceAnalytics = new _FinanceAnalytics();
