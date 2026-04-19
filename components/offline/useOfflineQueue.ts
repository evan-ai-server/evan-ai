/**
 * components/offline/useOfflineQueue.ts
 *
 * React hook for consuming the QueueManager.
 * Provides reactive queue state, actions, and flush trigger.
 * Attach the runScan callback once the component has it.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { queueManager, ScanQueueItem, Priority, RunScanFn, EnqueueParams } from './QueueManager';

export interface UseOfflineQueueReturn {
  items: ScanQueueItem[];
  pendingCount: number;
  enqueue: (params: EnqueueParams) => Promise<{ id: string; isDuplicate: boolean }>;
  flush: (apiBase: string) => Promise<void>;
  retryItem: (id: string) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  setPriority: (id: string, priority: Priority) => Promise<void>;
  isFlushing: boolean;
}

export function useOfflineQueue(runScan: RunScanFn | null): UseOfflineQueueReturn {
  const [items, setItems]         = useState<ScanQueueItem[]>([]);
  const [isFlushing, setFlushing] = useState(false);
  const runScanRef                = useRef<RunScanFn | null>(runScan);

  // Keep ref current so flush always uses latest version
  useEffect(() => { runScanRef.current = runScan; }, [runScan]);

  // Subscribe to queue changes
  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const all = await queueManager.getAll();
        if (!cancelled) setItems(all);
      } catch { /* non-fatal */ }
    };

    const unsub = queueManager.subscribe(() => { refresh(); });
    // Initialize
    queueManager.init().then(refresh);

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const enqueue = useCallback((params: EnqueueParams) => {
    return queueManager.enqueue(params);
  }, []);

  const flush = useCallback(async (apiBase: string) => {
    if (!runScanRef.current) return;
    setFlushing(true);
    try {
      await queueManager.flush(apiBase, runScanRef.current);
    } finally {
      setFlushing(false);
      // Refresh after flush
      const all = await queueManager.getAll();
      setItems(all);
    }
  }, []);

  const retryItem = useCallback(async (id: string) => {
    await queueManager.retryItem(id);
  }, []);

  const deleteItem = useCallback(async (id: string) => {
    await queueManager.deleteItem(id);
  }, []);

  const setPriority = useCallback(async (id: string, priority: Priority) => {
    await queueManager.setPriority(id, priority);
  }, []);

  const pendingCount = items.filter(i => i.status === 'queued' || i.status === 'sending').length;

  return { items, pendingCount, enqueue, flush, retryItem, deleteItem, setPriority, isFlushing };
}
