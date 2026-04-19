import { getPendingSyncs, markSyncDone, incrementRetry } from './db';

let _syncing = false;

export async function runSyncQueue(apiBase: string): Promise<{ flushed: number; failed: number }> {
  if (_syncing) return { flushed: 0, failed: 0 };
  _syncing = true;

  let flushed = 0;
  let failed = 0;

  try {
    const pending = await getPendingSyncs(50);
    for (const item of pending) {
      try {
        const res = await fetch(`${apiBase}${item.endpoint}`, {
          method: item.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.body),
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok || res.status < 500) {
          await markSyncDone(item.id);
          flushed++;
        } else {
          await incrementRetry(item.id);
          failed++;
        }
      } catch {
        await incrementRetry(item.id);
        failed++;
      }
    }
  } finally {
    _syncing = false;
  }

  return { flushed, failed };
}
