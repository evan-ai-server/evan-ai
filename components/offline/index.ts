/**
 * components/offline/index.ts
 * Barrel export for the offline scan queue system.
 */
export { useNetworkStatus }    from './useNetworkStatus';
export type { NetworkStatus }  from './useNetworkStatus';

export { useOfflineQueue }     from './useOfflineQueue';
export type { UseOfflineQueueReturn } from './useOfflineQueue';

export { OfflineBanner }       from './OfflineBanner';
export { OfflineQueuePanel }   from './OfflineQueuePanel';

export { queueManager }        from './QueueManager';
export type { ScanQueueItem, EnqueueParams, Priority, ScanStatus, RunScanFn } from './QueueManager';
