/**
 * Evan AI — EventTracker
 *
 * Client-side behavioral analytics singleton.
 *
 * Captures high-signal user events and fires them to /analytics/event.
 * Resilient: events are queued and flushed on interval.
 * Bounded: max 200 events in memory before oldest are dropped.
 * Privacy-respecting: no PII beyond userId, no device fingerprinting.
 *
 * Usage:
 *   EventTracker.init(apiBase, userId);
 *   EventTracker.track("scan_complete", { scanId, itemName, price: 49.99 });
 */

import type { BehaviorEvent, BehaviorEventType } from "./RevenueTypes";

const FLUSH_INTERVAL_MS = 30_000;  // flush every 30s
const MAX_QUEUE_SIZE    = 200;
const BATCH_SIZE        = 25;      // max events per POST
const FLUSH_TIMEOUT_MS  = 8_000;

class _EventTracker {
  private _apiBase: string = "";
  private _userId: string | null = null;
  private _queue: BehaviorEvent[] = [];
  private _flushTimer: ReturnType<typeof setInterval> | null = null;
  private _flushing = false;

  // ── Init / config ────────────────────────────────────────────────────────

  init(apiBase: string, userId: string | null): void {
    this._apiBase = apiBase;
    this._userId  = userId;
    if (!this._flushTimer) {
      this._flushTimer = setInterval(() => this._flush(), FLUSH_INTERVAL_MS);
    }
  }

  setUserId(userId: string | null): void {
    this._userId = userId;
  }

  setApiBase(apiBase: string): void {
    this._apiBase = apiBase;
  }

  // ── Track ────────────────────────────────────────────────────────────────

  track(
    type: BehaviorEventType,
    opts: {
      scanId?: string | null;
      itemName?: string | null;
      price?: number | null;
      metadata?: Record<string, string | number | boolean | null>;
    } = {}
  ): void {
    const event: BehaviorEvent = {
      type,
      userId: this._userId,
      scanId: opts.scanId ?? null,
      itemName: opts.itemName ?? null,
      price: opts.price ?? null,
      metadata: opts.metadata ?? {},
      ts: Date.now(),
    };

    this._queue.push(event);

    // Drop oldest if queue overflows
    if (this._queue.length > MAX_QUEUE_SIZE) {
      this._queue.splice(0, this._queue.length - MAX_QUEUE_SIZE);
    }
  }

  // ── Flush (fire and forget) ───────────────────────────────────────────────

  async flush(): Promise<void> {
    await this._flush();
  }

  private async _flush(): Promise<void> {
    if (this._flushing || !this._apiBase || !this._queue.length) return;
    this._flushing = true;
    try {
      while (this._queue.length > 0) {
        const batch = this._queue.splice(0, BATCH_SIZE);
        await this._postBatch(batch);
      }
    } finally {
      this._flushing = false;
    }
  }

  private async _postBatch(events: BehaviorEvent[]): Promise<void> {
    try {
      await fetch(`${this._apiBase}/analytics/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events }),
        signal: AbortSignal.timeout(FLUSH_TIMEOUT_MS),
      });
    } catch {
      // Non-critical — analytics loss is acceptable
    }
  }

  // ── Convenience helpers ───────────────────────────────────────────────────

  trackScanStart(scanId: string, itemHint?: string | null): void {
    this.track("scan_start", { scanId, itemName: itemHint });
  }

  trackScanComplete(
    scanId: string,
    itemName: string,
    price: number | null,
    verdict: string | null
  ): void {
    this.track("scan_complete", {
      scanId,
      itemName,
      price,
      metadata: { verdict: verdict ?? "" },
    });
  }

  trackResultView(
    scanId: string,
    itemName: string,
    price: number | null
  ): void {
    this.track("result_view", { scanId, itemName, price });
  }

  trackListingClick(
    scanId: string | null,
    itemName: string,
    price: number | null,
    source: string | null,
    cardRole: "hero" | "alt"
  ): void {
    this.track("listing_click", {
      scanId,
      itemName,
      price,
      metadata: { source: source ?? "", cardRole },
    });
  }

  trackWatchlistAdd(itemName: string, price: number | null): void {
    this.track("watchlist_add", { itemName, price });
  }

  trackDealAlertView(alertId: string, query: string, dealScore: number): void {
    this.track("deal_alert_view", {
      itemName: query,
      metadata: { alertId, dealScore },
    });
  }

  trackDealAlertClick(alertId: string, query: string, price: number | null): void {
    this.track("deal_alert_click", {
      itemName: query,
      price,
      metadata: { alertId },
    });
  }

  trackPaywallView(featureName: string): void {
    this.track("paywall_view", { metadata: { featureName } });
  }

  trackPurchaseComplete(plan: string): void {
    this.track("purchase_complete", { metadata: { plan } });
  }

  destroy(): void {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
    this._queue = [];
  }
}

// ── Export singleton ──────────────────────────────────────────────────────────
export const EventTracker = new _EventTracker();
