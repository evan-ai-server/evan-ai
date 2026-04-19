/**
 * components/offline/QueueManager.ts
 *
 * Production offline scan queue manager.
 * - SQLite-backed persistence (survives app restarts)
 * - Priority ordering: high → normal → low, FIFO within each tier
 * - Exponential backoff: 2s, 5s, 10s, 20s...
 * - Max retries: configurable (default 3); manual retry resets count
 * - Deduplication: same payload_hash within 30s window is rejected
 * - Concurrency: max 2 simultaneous in-flight scans
 * - Listener/subscriber pattern for reactive UI updates
 */

import {
  Priority,
  ScanStatus,
  ScanQueueRow,
  uuidv4,
  hashPayload,
  insertScanQueueItem,
  getAllScanQueueItems,
  getPendingScanQueueItems,
  updateScanQueueStatus,
  incrementScanQueueRetry,
  deleteScanQueueItem,
  resetScanQueueItemForRetry,
  setScanQueueItemPriority,
  findRecentDuplicate,
} from './db';

export type { Priority, ScanStatus };

export interface ScanQueueItem {
  id: string;
  createdAt: number;
  updatedAt: number;
  photoUri: string;
  scannedPrice: number | null;
  cheapestAlt: number | null;
  itemHint: string | null;
  sizeHint: string | null;
  priority: Priority;
  status: ScanStatus;
  retryCount: number;
  lastAttemptAt: number | null;
  errorMessage: string | null;
}

export interface EnqueueParams {
  photoUri: string;
  scannedPrice?: number | null;
  cheapestAlt?: number | null;
  itemHint?: string | null;
  sizeHint?: string | null;
  priority?: Priority;
  /** Caller-supplied ID — if omitted, a uuid is generated */
  id?: string;
}

export type RunScanFn = (params: {
  photoUri: string;
  scannedPrice: number;
  cheapestAlt: number | null;
  itemHint: string | null;
  countScan: boolean;
}) => Promise<void>;

// ── Config ────────────────────────────────────────────────────────────────────

const MAX_RETRIES       = 3;
const MAX_CONCURRENT    = 2;
const DEDUP_WINDOW_MS   = 30_000;   // 30 seconds
const BACKOFF_MS        = [2_000, 5_000, 10_000, 20_000]; // indexed by retry_count

function backoffDelay(retryCount: number): number {
  return BACKOFF_MS[Math.min(retryCount, BACKOFF_MS.length - 1)] ?? 20_000;
}

// ── QueueManager ─────────────────────────────────────────────────────────────

class QueueManager {
  private _listeners: Set<() => void> = new Set();
  private _inFlight: Set<string> = new Set();
  private _flushing = false;
  private _initialized = false;

  // ── Initialization ──────────────────────────────────────────────────────────

  /** Call once on app start to warm the DB and reset any 'sending' items
   *  that were interrupted by a previous crash/kill. */
  async init(): Promise<void> {
    if (this._initialized) return;
    this._initialized = true;
    try {
      // Reset stuck 'sending' items back to 'queued' (crash recovery)
      const all = await getAllScanQueueItems();
      await Promise.all(
        all
          .filter(r => r.status === 'sending')
          .map(r => updateScanQueueStatus(r.id, 'queued'))
      );
    } catch { /* non-fatal */ }
    this._notify();
  }

  // ── Enqueue ─────────────────────────────────────────────────────────────────

  /**
   * Add a scan to the queue.
   * Returns { id, isDuplicate } — if isDuplicate is true, the scan was dropped.
   */
  async enqueue(params: EnqueueParams): Promise<{ id: string; isDuplicate: boolean }> {
    const id = params.id ?? uuidv4();
    const hash = hashPayload(params.photoUri, params.scannedPrice ?? null, params.itemHint ?? null);

    // Deduplication check
    const dup = await findRecentDuplicate(hash, DEDUP_WINDOW_MS);
    if (dup) return { id, isDuplicate: true };

    const now = Date.now();
    await insertScanQueueItem({
      id,
      created_at:    now,
      photo_uri:     params.photoUri,
      scanned_price: params.scannedPrice ?? null,
      cheapest_alt:  params.cheapestAlt ?? null,
      item_hint:     params.itemHint ?? null,
      size_hint:     params.sizeHint ?? null,
      priority:      params.priority ?? 'normal',
      status:        'queued',
      payload_hash:  hash,
    });

    this._notify();
    return { id, isDuplicate: false };
  }

  // ── Read ────────────────────────────────────────────────────────────────────

  async getAll(): Promise<ScanQueueItem[]> {
    const rows = await getAllScanQueueItems();
    return rows.map(rowToItem);
  }

  async getPending(): Promise<ScanQueueItem[]> {
    const rows = await getPendingScanQueueItems(MAX_RETRIES);
    return rows.map(rowToItem);
  }

  // ── Mutations ───────────────────────────────────────────────────────────────

  async deleteItem(id: string): Promise<void> {
    await deleteScanQueueItem(id);
    this._inFlight.delete(id);
    this._notify();
  }

  async setPriority(id: string, priority: Priority): Promise<void> {
    await setScanQueueItemPriority(id, priority);
    this._notify();
  }

  /** Force-retry an item — resets retry count and status to 'queued'. */
  async retryItem(id: string): Promise<void> {
    await resetScanQueueItemForRetry(id);
    this._notify();
  }

  // ── Flush / Process ─────────────────────────────────────────────────────────

  /**
   * Process all pending queue items using the provided runScan callback.
   * Respects priority order, concurrency limit, and backoff.
   * Safe to call multiple times — subsequent calls are no-ops if already flushing.
   */
  async flush(apiBase: string, runScan: RunScanFn): Promise<{ processed: number; failed: number }> {
    if (this._flushing) return { processed: 0, failed: 0 };
    this._flushing = true;
    let processed = 0;
    let failed = 0;

    try {
      while (true) {
        const pending = await getPendingScanQueueItems(MAX_RETRIES);
        // Filter out items already in-flight or in backoff window
        const now = Date.now();
        const available = pending.filter(r => {
          if (this._inFlight.has(r.id)) return false;
          if (r.last_attempt_at && r.retry_count > 0) {
            const minNext = r.last_attempt_at + backoffDelay(r.retry_count - 1);
            if (now < minNext) return false;
          }
          return true;
        });

        if (available.length === 0) break;

        // Process up to MAX_CONCURRENT items in this batch
        const batch = available.slice(0, MAX_CONCURRENT - this._inFlight.size);
        if (batch.length === 0) {
          // All slots occupied — wait briefly before re-checking
          await sleep(500);
          continue;
        }

        const results = await Promise.allSettled(
          batch.map(row => this._processOne(row, runScan))
        );

        for (const r of results) {
          if (r.status === 'fulfilled') {
            if (r.value) processed++; else failed++;
          } else {
            failed++;
          }
        }

        this._notify();
      }
    } finally {
      this._flushing = false;
    }

    return { processed, failed };
  }

  private async _processOne(row: ScanQueueRow, runScan: RunScanFn): Promise<boolean> {
    const { id } = row;
    this._inFlight.add(id);

    try {
      await updateScanQueueStatus(id, 'sending');
      this._notify();

      await runScan({
        photoUri:     row.photo_uri,
        scannedPrice: row.scanned_price ?? 0,
        cheapestAlt:  row.cheapest_alt ?? null,
        itemHint:     row.item_hint ?? null,
        countScan:    true,
      });

      await updateScanQueueStatus(id, 'complete');
      this._notify();
      return true;

    } catch (err: any) {
      const errMsg = err?.message || String(err) || 'unknown_error';
      const nextRetry = row.retry_count + 1;

      if (nextRetry >= MAX_RETRIES) {
        await incrementScanQueueRetry(id, 'failed', errMsg);
      } else {
        await incrementScanQueueRetry(id, 'queued', errMsg);
      }
      this._notify();
      return false;

    } finally {
      this._inFlight.delete(id);
    }
  }

  // ── Subscriptions ───────────────────────────────────────────────────────────

  /** Subscribe to queue changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _notify(): void {
    this._listeners.forEach(fn => {
      try { fn(); } catch { /* non-fatal */ }
    });
  }
}

// Singleton — shared across the entire app
export const queueManager = new QueueManager();

// ── Helpers ───────────────────────────────────────────────────────────────────

function rowToItem(r: ScanQueueRow): ScanQueueItem {
  return {
    id:            r.id,
    createdAt:     r.created_at,
    updatedAt:     r.updated_at,
    photoUri:      r.photo_uri,
    scannedPrice:  r.scanned_price,
    cheapestAlt:   r.cheapest_alt,
    itemHint:      r.item_hint,
    sizeHint:      r.size_hint,
    priority:      r.priority,
    status:        r.status,
    retryCount:    r.retry_count,
    lastAttemptAt: r.last_attempt_at,
    errorMessage:  r.error_message,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
