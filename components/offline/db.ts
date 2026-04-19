/**
 * components/offline/db.ts
 * SQLite persistence layer for the offline scan queue.
 * Uses expo-sqlite v16 async API.
 */
import * as SQLite from 'expo-sqlite';

export type Priority = 'high' | 'normal' | 'low';
export type ScanStatus = 'queued' | 'sending' | 'complete' | 'failed';

export interface ScanQueueRow {
  id: string;
  created_at: number;
  updated_at: number;
  photo_uri: string;
  scanned_price: number | null;
  cheapest_alt: number | null;
  item_hint: string | null;
  size_hint: string | null;
  priority: Priority;
  status: ScanStatus;
  retry_count: number;
  last_attempt_at: number | null;
  error_message: string | null;
  payload_hash: string;
}

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('evan_offline.db');
  await initSchema(_db);
  return _db;
}

async function initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS scan_queue (
      id              TEXT PRIMARY KEY,
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL,
      photo_uri       TEXT NOT NULL,
      scanned_price   REAL,
      cheapest_alt    REAL,
      item_hint       TEXT,
      size_hint       TEXT,
      priority        TEXT NOT NULL DEFAULT 'normal',
      status          TEXT NOT NULL DEFAULT 'queued',
      retry_count     INTEGER NOT NULL DEFAULT 0,
      last_attempt_at INTEGER,
      error_message   TEXT,
      payload_hash    TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_queue_status   ON scan_queue(status);
    CREATE INDEX IF NOT EXISTS idx_queue_priority ON scan_queue(priority, created_at);
    CREATE INDEX IF NOT EXISTS idx_queue_hash     ON scan_queue(payload_hash, created_at);

    CREATE TABLE IF NOT EXISTS scan_cache (
      id          TEXT PRIMARY KEY,
      query       TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      synced      INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_scan_query ON scan_cache(query);

    CREATE TABLE IF NOT EXISTS sync_queue (
      id           TEXT PRIMARY KEY,
      endpoint     TEXT NOT NULL,
      method       TEXT NOT NULL DEFAULT 'POST',
      body_json    TEXT NOT NULL,
      created_at   INTEGER NOT NULL,
      retry_count  INTEGER DEFAULT 0,
      last_attempt INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_sync_created ON sync_queue(created_at);

    CREATE TABLE IF NOT EXISTS watchlist_cache (
      id            TEXT PRIMARY KEY,
      item_name     TEXT NOT NULL,
      query         TEXT NOT NULL,
      target_price  REAL,
      current_price REAL,
      last_checked  INTEGER,
      created_at    INTEGER NOT NULL
    );
  `);
}

// ── Scan Queue CRUD ───────────────────────────────────────────────────────────

export async function insertScanQueueItem(
  item: Pick<ScanQueueRow, 'id' | 'created_at' | 'photo_uri' | 'scanned_price' | 'cheapest_alt' | 'item_hint' | 'size_hint' | 'priority' | 'status' | 'payload_hash'>
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO scan_queue
       (id, created_at, updated_at, photo_uri, scanned_price, cheapest_alt, item_hint, size_hint, priority, status, retry_count, payload_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [item.id, item.created_at, item.created_at, item.photo_uri,
     item.scanned_price ?? null, item.cheapest_alt ?? null,
     item.item_hint ?? null, item.size_hint ?? null,
     item.priority, item.status, item.payload_hash]
  );
}

export async function getAllScanQueueItems(): Promise<ScanQueueRow[]> {
  const db = await getDb();
  return db.getAllAsync<ScanQueueRow>(
    `SELECT * FROM scan_queue
     ORDER BY
       CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
       created_at ASC`
  );
}

export async function getPendingScanQueueItems(maxRetries: number): Promise<ScanQueueRow[]> {
  const db = await getDb();
  return db.getAllAsync<ScanQueueRow>(
    `SELECT * FROM scan_queue
     WHERE status IN ('queued', 'failed') AND retry_count < ?
     ORDER BY
       CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
       created_at ASC`,
    [maxRetries]
  );
}

export async function updateScanQueueStatus(id: string, status: ScanStatus, errorMessage?: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE scan_queue SET status = ?, updated_at = ?, error_message = ? WHERE id = ?`,
    [status, Date.now(), errorMessage ?? null, id]
  );
}

export async function incrementScanQueueRetry(id: string, status: ScanStatus, errorMessage?: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE scan_queue SET retry_count = retry_count + 1, last_attempt_at = ?, updated_at = ?, status = ?, error_message = ? WHERE id = ?`,
    [Date.now(), Date.now(), status, errorMessage ?? null, id]
  );
}

export async function deleteScanQueueItem(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM scan_queue WHERE id = ?`, [id]);
}

export async function resetScanQueueItemForRetry(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE scan_queue SET status = 'queued', retry_count = 0, last_attempt_at = NULL, error_message = NULL, updated_at = ? WHERE id = ?`,
    [Date.now(), id]
  );
}

export async function setScanQueueItemPriority(id: string, priority: Priority): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE scan_queue SET priority = ?, updated_at = ? WHERE id = ?`,
    [priority, Date.now(), id]
  );
}

/** Returns true if an identical payload was queued within the dedup window. */
export async function findRecentDuplicate(payloadHash: string, windowMs: number): Promise<boolean> {
  const db = await getDb();
  const cutoff = Date.now() - windowMs;
  const row = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM scan_queue WHERE payload_hash = ? AND created_at > ? AND status NOT IN ('complete','failed') LIMIT 1`,
    [payloadHash, cutoff]
  );
  return row != null;
}

// ── Scan result cache ─────────────────────────────────────────────────────────

export async function cacheScanResult(scanId: string, query: string, result: object): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO scan_cache (id, query, result_json, created_at, synced) VALUES (?, ?, ?, ?, 1)',
    [scanId, query.toLowerCase().trim(), JSON.stringify(result), Date.now()]
  );
  await db.runAsync(
    'DELETE FROM scan_cache WHERE id NOT IN (SELECT id FROM scan_cache ORDER BY created_at DESC LIMIT 100)'
  );
}

export async function getCachedScan(query: string): Promise<object | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ result_json: string; created_at: number }>(
    'SELECT result_json, created_at FROM scan_cache WHERE query = ? ORDER BY created_at DESC LIMIT 1',
    [query.toLowerCase().trim()]
  );
  if (!row || Date.now() - row.created_at > 2 * 60 * 60 * 1000) return null;
  try { return JSON.parse(row.result_json); } catch { return null; }
}

// ── Generic sync queue ────────────────────────────────────────────────────────

export async function enqueueSync(endpoint: string, body: object, method = 'POST'): Promise<void> {
  const db = await getDb();
  const id = uuidv4();
  await db.runAsync(
    'INSERT INTO sync_queue (id, endpoint, method, body_json, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, endpoint, method, JSON.stringify(body), Date.now()]
  );
}

export async function getPendingSyncs(limit = 50): Promise<{ id: string; endpoint: string; method: string; body: object; retryCount: number }[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; endpoint: string; method: string; body_json: string; retry_count: number }>(
    'SELECT id, endpoint, method, body_json, retry_count FROM sync_queue WHERE retry_count < 5 ORDER BY created_at ASC LIMIT ?',
    [limit]
  );
  return rows.map(r => ({
    id: r.id, endpoint: r.endpoint, method: r.method,
    body: JSON.parse(r.body_json), retryCount: r.retry_count,
  }));
}

export async function markSyncDone(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM sync_queue WHERE id = ?', [id]);
}

export async function incrementRetry(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE sync_queue SET retry_count = retry_count + 1, last_attempt = ? WHERE id = ?',
    [Date.now(), id]
  );
}

// ── Watchlist cache ───────────────────────────────────────────────────────────

export async function cacheWatchlistItem(item: {
  id: string; itemName: string; query: string; targetPrice?: number; currentPrice?: number;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO watchlist_cache (id, item_name, query, target_price, current_price, last_checked, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [item.id, item.itemName, item.query, item.targetPrice ?? null, item.currentPrice ?? null, Date.now(), Date.now()]
  );
}

export async function getWatchlistOffline(): Promise<{
  id: string; itemName: string; query: string; targetPrice: number | null; currentPrice: number | null;
}[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; item_name: string; query: string; target_price: number | null; current_price: number | null }>(
    'SELECT id, item_name, query, target_price, current_price FROM watchlist_cache ORDER BY created_at DESC'
  );
  return rows.map(r => ({
    id: r.id, itemName: r.item_name, query: r.query,
    targetPrice: r.target_price, currentPrice: r.current_price,
  }));
}

// ── Utilities ─────────────────────────────────────────────────────────────────

export function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** FNV-1a hash of scan payload for deduplication — not cryptographic */
export function hashPayload(
  photoUri: string,
  scannedPrice: number | null,
  itemHint: string | null,
): string {
  const s = `${photoUri}|${scannedPrice ?? ''}|${(itemHint ?? '').toLowerCase().trim()}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (Math.imul(h, 0x01000193)) >>> 0;
  }
  return h.toString(16);
}
