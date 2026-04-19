/**
 * LiveTickerFeed — Real-time Swarm activity log.
 *
 * Terminal aesthetic: monospace, green-on-black, entries ghost as they age.
 * New entries slide in from the bottom; old entries fade to 12% opacity.
 *
 * Parent feeds `entries` array — this component handles display only.
 * Connect to your WebSocket / polling layer externally.
 */

import React, { useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Platform,
  ListRenderItemInfo,
} from "react-native";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { C, SP, R, TY } from "../design/DS";
import { CC, MONO, type TickerEntry, type TickerLevel } from "./CommandCenterTokens";

// ─── Level Colors ─────────────────────────────────────────────────────────────
const LEVEL_COLOR: Record<TickerLevel, string> = {
  scout:    CC.mintDim,
  engine:   CC.amberDim,
  shield:   "rgba(150,180,255,0.75)",
  dispatch: CC.mint,
  result:   CC.mint,
};

const LEVEL_PREFIX: Record<TickerLevel, string> = {
  scout:    "SCOUT  ",
  engine:   "ENGINE ",
  shield:   "SHIELD ",
  dispatch: "FIRE   ",
  result:   "RESULT ",
};

// ─── Single ticker row ────────────────────────────────────────────────────────
interface TickerRowProps {
  entry: TickerEntry;
  index: number;
  total: number;
}

const TickerRow = React.memo(({ entry, index, total }: TickerRowProps) => {
  const age = total - 1 - index; // 0 = newest
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(
      index === total - 1 ? 0 : 0,
      withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) })
    );
  }, []);

  // Ghost older entries: newest = full opacity, progressively dim
  const targetOpacity =
    age === 0 ? 1.0 :
    age === 1 ? 0.62 :
    age === 2 ? 0.38 :
    age === 3 ? 0.22 :
    0.12;

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value * targetOpacity,
  }));

  const levelColor = LEVEL_COLOR[entry.level];
  const prefix     = LEVEL_PREFIX[entry.level];

  return (
    <Reanimated.View style={[styles.row, animStyle]}>
      {/* Timestamp */}
      <Text style={styles.ts}>[{entry.ts}]</Text>

      {/* Level tag */}
      <Text style={[styles.level, { color: levelColor }]}>{prefix}</Text>

      {/* Agent */}
      <Text style={styles.agent}>{entry.agent.padEnd(10)}</Text>

      {/* Message */}
      <Text style={[styles.msg, age === 0 && styles.msgFresh]} numberOfLines={1}>
        {entry.message}
      </Text>
    </Reanimated.View>
  );
});

// ─── LiveTickerFeed ────────────────────────────────────────────────────────────
interface LiveTickerFeedProps {
  entries: TickerEntry[];
  maxVisible?: number;
  style?: object;
}

export function LiveTickerFeed({
  entries,
  maxVisible = 18,
  style,
}: LiveTickerFeedProps) {
  const listRef = useRef<FlatList>(null);
  const visible = entries.slice(-maxVisible);

  // Auto-scroll to bottom on new entries
  const onContentSizeChange = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<TickerEntry>) => (
      <TickerRow entry={item} index={index} total={visible.length} />
    ),
    [visible.length]
  );

  return (
    <View style={[styles.container, style]}>
      {/* Header bar */}
      <View style={styles.header}>
        <View style={styles.headerDot} />
        <Text style={styles.headerTitle}>SWARM ACTIVITY</Text>
        <Text style={styles.headerCount}>{entries.length} events</Text>
      </View>

      {/* Terminal body */}
      <View style={styles.terminal}>
        <FlatList
          ref={listRef}
          data={visible}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          onContentSizeChange={onContentSizeChange}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
          contentContainerStyle={styles.listContent}
        />

        {/* Bottom gradient ghost */}
        <View style={styles.ghostGradient} pointerEvents="none" />
      </View>

      {/* Live indicator */}
      <LivePulse />
    </View>
  );
}

// ─── Live pulse dot ───────────────────────────────────────────────────────────
function LivePulse() {
  const opacity = useSharedValue(1);

  useEffect(() => {
    const pulse = () => {
      opacity.value = withTiming(0.2, { duration: 600 }, () => {
        opacity.value = withTiming(1.0, { duration: 600 }, pulse);
      });
    };
    pulse();
  }, []);

  const dotStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={styles.liveRow}>
      <Reanimated.View style={[styles.liveDot, dotStyle]} />
      <Text style={styles.liveText}>LIVE</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    backgroundColor: CC.termBg,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: CC.termBorder,
    overflow: "hidden",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SP.md,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: CC.termBorder,
    gap: 8,
  },
  headerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CC.mint,
  },
  headerTitle: {
    ...MONO,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
    color: CC.mintDim,
    flex: 1,
  },
  headerCount: {
    ...MONO,
    fontSize: 9,
    color: "rgba(0,255,65,0.35)",
    letterSpacing: 0.5,
  },

  terminal: {
    minHeight: 180,
    maxHeight: 240,
    position: "relative",
  },
  listContent: {
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm,
    gap: 2,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
  },
  ts: {
    ...MONO,
    fontSize: 9,
    color: "rgba(0,255,65,0.40)",
    width: 72,
  },
  level: {
    ...MONO,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
    width: 54,
  },
  agent: {
    ...MONO,
    fontSize: 9,
    color: "rgba(255,255,255,0.55)",
    width: 72,
  },
  msg: {
    ...MONO,
    fontSize: 9,
    color: "rgba(0,255,65,0.65)",
    flex: 1,
  },
  msgFresh: {
    color: CC.mint,
  },

  ghostGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 28,
    backgroundColor: "transparent",
    // Simulated gradient via layered opacity — no linear-gradient dep
    borderBottomLeftRadius: R.lg,
    borderBottomRightRadius: R.lg,
  },

  liveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: SP.md,
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: CC.termBorder,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: CC.mint,
  },
  liveText: {
    ...MONO,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 2.5,
    color: CC.mintDim,
  },
});
