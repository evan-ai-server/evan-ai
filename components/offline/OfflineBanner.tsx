/**
 * components/offline/OfflineBanner.tsx
 *
 * Animated status banner. Three states:
 *  1. Offline — yellow: "Offline · N scans queued"
 *  2. Online, processing queue — green: "Back online · processing N scans…"
 *  3. Hidden
 */
import React, { useEffect } from 'react';
import { Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  withSpring,
  useAnimatedStyle,
} from 'react-native-reanimated';

interface OfflineBannerProps {
  isOnline: boolean;
  pendingCount: number;
  isFlushing: boolean;
  onPressDrain?: () => void;
}

export function OfflineBanner({ isOnline, pendingCount, isFlushing, onPressDrain }: OfflineBannerProps) {
  const translateY = useSharedValue(-52);

  const shouldShow = !isOnline || pendingCount > 0;

  useEffect(() => {
    translateY.value = withSpring(shouldShow ? 0 : -52, {
      damping: 22,
      stiffness: 280,
    });
  }, [shouldShow, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!shouldShow && translateY.value <= -51) return null;

  const isProcessing = isOnline && pendingCount > 0 && isFlushing;
  const isWaiting    = isOnline && pendingCount > 0 && !isFlushing;
  const isOffline    = !isOnline;

  const label = isOffline
    ? pendingCount > 0
      ? `Offline · ${pendingCount} scan${pendingCount !== 1 ? 's' : ''} queued`
      : 'Offline · scans will be queued'
    : isProcessing
    ? `Back online · processing ${pendingCount} scan${pendingCount !== 1 ? 's' : ''}…`
    : isWaiting
    ? `Back online · tap to process ${pendingCount} queued scan${pendingCount !== 1 ? 's' : ''}`
    : '';

  return (
    <Animated.View
      style={[
        styles.banner,
        animStyle,
        isOffline ? styles.offlineBanner : styles.onlineBanner,
      ]}
      pointerEvents={isWaiting ? 'auto' : 'none'}
    >
      <Pressable
        style={styles.inner}
        onPress={isWaiting ? onPressDrain : undefined}
        disabled={!isWaiting}
      >
        <Text style={[styles.text, isOffline ? styles.offlineText : styles.onlineText]}>
          {isProcessing ? '⟳  ' : isOffline ? '⚡  ' : '✓  '}{label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position:       'absolute',
    top:            0,
    left:           0,
    right:          0,
    zIndex:         9999,
    shadowColor:    '#000',
    shadowOffset:   { width: 0, height: 2 },
    shadowOpacity:  0.18,
    shadowRadius:   4,
    elevation:      6,
  },
  inner: {
    height:         44,
    alignItems:     'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  offlineBanner: {
    backgroundColor: 'rgba(255, 190, 40, 0.97)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(200, 140, 0, 0.3)',
  },
  onlineBanner: {
    backgroundColor: 'rgba(30, 200, 100, 0.97)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 160, 70, 0.3)',
  },
  text: {
    fontSize:   13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  offlineText: { color: '#1a1000' },
  onlineText:  { color: '#002b14' },
});
