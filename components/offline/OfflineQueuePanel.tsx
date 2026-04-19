/**
 * components/offline/OfflineQueuePanel.tsx
 *
 * Full Offline Queue UI panel.
 * Shows all queued scans with status, retry count, priority controls, and actions.
 * Live-updates as queue changes via useOfflineQueue hook.
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { ScanQueueItem, Priority, ScanStatus } from './QueueManager';

interface OfflineQueuePanelProps {
  items: ScanQueueItem[];
  isFlushing: boolean;
  onRetry:       (id: string) => void;
  onDelete:      (id: string) => void;
  onSetPriority: (id: string, priority: Priority) => void;
  onFlushAll:    () => void;
}

export function OfflineQueuePanel({
  items,
  isFlushing,
  onRetry,
  onDelete,
  onSetPriority,
  onFlushAll,
}: OfflineQueuePanelProps) {
  if (items.length === 0) return null;

  const pending  = items.filter(i => i.status === 'queued' || i.status === 'sending').length;
  const failed   = items.filter(i => i.status === 'failed').length;
  const complete = items.filter(i => i.status === 'complete').length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Offline Queue</Text>
          <Text style={styles.headerMeta}>
            {pending > 0 ? `${pending} pending` : ''}
            {pending > 0 && failed > 0 ? ' · ' : ''}
            {failed > 0 ? `${failed} failed` : ''}
            {complete > 0 ? (pending || failed ? ' · ' : '') + `${complete} done` : ''}
          </Text>
        </View>
        {pending > 0 && (
          <Pressable
            style={[styles.flushBtn, isFlushing && styles.flushBtnActive]}
            onPress={onFlushAll}
            disabled={isFlushing}
          >
            {isFlushing
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.flushBtnText}>Process All</Text>
            }
          </Pressable>
        )}
      </View>

      {/* Queue items */}
      <FlatList
        data={items}
        keyExtractor={i => i.id}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <QueueItem
            item={item}
            onRetry={onRetry}
            onDelete={onDelete}
            onSetPriority={onSetPriority}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

// ── Individual Queue Item ─────────────────────────────────────────────────────

interface QueueItemProps {
  item: ScanQueueItem;
  onRetry:       (id: string) => void;
  onDelete:      (id: string) => void;
  onSetPriority: (id: string, priority: Priority) => void;
}

function QueueItem({ item, onRetry, onDelete, onSetPriority }: QueueItemProps) {
  const [showPriorityPicker, setPriorityPicker] = useState(false);

  const label = item.itemHint
    ? item.itemHint.slice(0, 48)
    : item.scannedPrice
    ? `Scan · $${item.scannedPrice.toFixed(2)}`
    : 'Untitled scan';

  const ts = formatRelative(item.createdAt);

  const confirmDelete = () => {
    if (Platform.OS === 'web') {
      onDelete(item.id);
      return;
    }
    Alert.alert('Remove scan?', 'This will permanently delete the queued scan.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(item.id) },
    ]);
  };

  const pickPriority = (p: Priority) => {
    onSetPriority(item.id, p);
    setPriorityPicker(false);
  };

  return (
    <View style={styles.item}>
      <View style={styles.itemLeft}>
        <StatusDot status={item.status} />
        <View style={styles.itemInfo}>
          <Text style={styles.itemLabel} numberOfLines={1}>{label}</Text>
          <Text style={styles.itemMeta}>
            {ts}
            {item.retryCount > 0 ? ` · ${item.retryCount} retr${item.retryCount === 1 ? 'y' : 'ies'}` : ''}
            {item.errorMessage ? ` · ${item.errorMessage.slice(0, 40)}` : ''}
          </Text>
          <Text style={styles.itemStatus}>
            {statusLabel(item.status)}
          </Text>
        </View>
      </View>

      <View style={styles.itemRight}>
        {/* Priority badge */}
        <Pressable
          style={[styles.priorityBadge, priorityStyle(item.priority)]}
          onPress={() => setPriorityPicker(v => !v)}
        >
          <Text style={styles.priorityText}>{item.priority}</Text>
        </Pressable>

        {/* Actions */}
        <View style={styles.actions}>
          {(item.status === 'failed' || item.status === 'queued') && (
            <Pressable style={styles.actionBtn} onPress={() => onRetry(item.id)}>
              <Text style={styles.actionRetry}>Retry</Text>
            </Pressable>
          )}
          <Pressable style={styles.actionBtn} onPress={confirmDelete}>
            <Text style={styles.actionDelete}>✕</Text>
          </Pressable>
        </View>
      </View>

      {/* Priority picker dropdown */}
      {showPriorityPicker && (
        <View style={styles.priorityPicker}>
          {(['high', 'normal', 'low'] as Priority[]).map(p => (
            <Pressable
              key={p}
              style={[styles.priorityOption, item.priority === p && styles.priorityOptionActive]}
              onPress={() => pickPriority(p)}
            >
              <Text style={styles.priorityOptionText}>{p}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Status Dot ────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: ScanStatus }) {
  if (status === 'sending') {
    return <ActivityIndicator size="small" color="#60c8ff" style={styles.dot} />;
  }
  const color = status === 'complete' ? '#3ae07a'
    : status === 'failed' ? '#ff5f5f'
    : status === 'queued' ? '#ffc94d'
    : '#888';
  return <View style={[styles.dot, { backgroundColor: color, borderRadius: 5 }]} />;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusLabel(s: ScanStatus): string {
  return s === 'queued' ? 'Waiting'
    : s === 'sending' ? 'Sending…'
    : s === 'complete' ? 'Complete'
    : 'Failed';
}

function priorityStyle(p: Priority) {
  if (p === 'high')   return styles.priorityHigh;
  if (p === 'low')    return styles.priorityLow;
  return styles.priorityNormal;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000)   return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginTop:      12,
    marginHorizontal: 0,
    borderRadius:   16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth:    1,
    borderColor:    'rgba(255,255,255,0.10)',
    overflow:       'hidden',
  },
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  headerTitle: {
    fontSize:   15,
    fontWeight: '700',
    color:      'rgba(255,255,255,0.92)',
  },
  headerMeta: {
    fontSize: 12,
    color:    'rgba(255,255,255,0.45)',
    marginTop: 2,
  },
  flushBtn: {
    paddingHorizontal: 14,
    paddingVertical:   7,
    backgroundColor:  'rgba(90,180,255,0.18)',
    borderRadius:     10,
    borderWidth:      1,
    borderColor:      'rgba(90,180,255,0.30)',
    minWidth:         90,
    alignItems:       'center',
  },
  flushBtnActive: {
    opacity: 0.6,
  },
  flushBtnText: {
    color:      'rgba(160,220,255,0.95)',
    fontSize:   13,
    fontWeight: '600',
  },
  separator: {
    height:          1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginHorizontal: 16,
  },
  item: {
    paddingHorizontal: 16,
    paddingVertical:   12,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    flex:          1,
  },
  dot: {
    width:      10,
    height:     10,
    marginTop:  4,
    marginRight: 10,
  },
  itemInfo: {
    flex: 1,
  },
  itemLabel: {
    fontSize:   14,
    fontWeight: '600',
    color:      'rgba(255,255,255,0.90)',
  },
  itemMeta: {
    fontSize:  12,
    color:     'rgba(255,255,255,0.40)',
    marginTop:  2,
  },
  itemStatus: {
    fontSize:   11,
    color:      'rgba(255,255,255,0.35)',
    marginTop:  2,
    fontStyle:  'italic',
  },
  itemRight: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            8,
    marginTop:      8,
    justifyContent: 'flex-end',
  },
  priorityBadge: {
    paddingHorizontal: 9,
    paddingVertical:   3,
    borderRadius:      6,
    borderWidth:       1,
  },
  priorityText: {
    fontSize:   11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  priorityHigh: {
    backgroundColor: 'rgba(255,80,80,0.15)',
    borderColor:     'rgba(255,80,80,0.30)',
  },
  priorityNormal: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor:     'rgba(255,255,255,0.18)',
  },
  priorityLow: {
    backgroundColor: 'rgba(120,120,120,0.12)',
    borderColor:     'rgba(120,120,120,0.22)',
  },
  actions: {
    flexDirection: 'row',
    gap:           6,
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical:    5,
    borderRadius:       8,
    backgroundColor:   'rgba(255,255,255,0.07)',
  },
  actionRetry: {
    fontSize:   12,
    fontWeight: '600',
    color:      'rgba(100,200,255,0.90)',
  },
  actionDelete: {
    fontSize: 12,
    color:    'rgba(255,90,90,0.80)',
  },
  priorityPicker: {
    flexDirection:    'row',
    gap:              6,
    marginTop:        8,
    paddingLeft:      20,
  },
  priorityOption: {
    paddingHorizontal: 10,
    paddingVertical:    5,
    borderRadius:       8,
    backgroundColor:   'rgba(255,255,255,0.06)',
    borderWidth:        1,
    borderColor:        'rgba(255,255,255,0.12)',
  },
  priorityOptionActive: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderColor:     'rgba(255,255,255,0.28)',
  },
  priorityOptionText: {
    fontSize:   12,
    fontWeight: '600',
    color:      'rgba(255,255,255,0.75)',
    textTransform: 'capitalize',
  },
});
