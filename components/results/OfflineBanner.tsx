/**
 * OfflineBanner — shown when results are served from persistent cache.
 *
 * Displays:
 *  - Cloud-offline icon + staleness label (< 1h / Xh ago / Xd ago)
 *  - Color-coded freshness: green < 1h, yellow 1-24h, orange > 24h
 *  - Subtle animated pulse to draw the eye without being intrusive
 */
import React, { useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { SP, R, TY } from "../design/DS";

interface OfflineBannerProps {
  /** Unix ms timestamp when the cached data was saved */
  cachedAt: number;
  /** If true the user is genuinely offline; if false the server just failed */
  isOffline?: boolean;
  onRefresh?: () => void;
}

function staleness(ageMs: number): {
  label: string;
  color: string;
  dot: string;
} {
  const h = ageMs / 3_600_000;
  if (h < 1)
    return { label: "< 1h ago", color: "rgba(120,255,180,0.80)", dot: "#78ffb4" };
  if (h < 6)
    return {
      label: `${Math.floor(h)}h ago`,
      color: "rgba(255,210,80,0.85)",
      dot: "#ffd250",
    };
  if (h < 24)
    return {
      label: `${Math.floor(h)}h ago`,
      color: "rgba(255,165,60,0.85)",
      dot: "#ffa53c",
    };
  const d = Math.floor(h / 24);
  return {
    label: `${d}d ago`,
    color: "rgba(255,100,80,0.85)",
    dot: "#ff6450",
  };
}

export function OfflineBanner({ cachedAt, isOffline = false, onRefresh }: OfflineBannerProps) {
  const ageMs = Date.now() - cachedAt;
  const { label, color, dot } = staleness(ageMs);

  // subtle pulse on the dot
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.4, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.0, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <View style={styles.banner}>
      <Reanimated.View style={[styles.dot, { backgroundColor: dot }, dotStyle as any]} />
      <Ionicons
        name={isOffline ? "cloud-offline-outline" : "time-outline"}
        size={12}
        color={color}
        style={{ marginRight: 4 }}
      />
      <Text style={[styles.label, { color }]}>
        {isOffline ? "Offline" : "Cached"} · {label}
      </Text>
      {onRefresh ? (
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn} activeOpacity={0.7}>
          <Ionicons name="refresh-outline" size={11} color="rgba(255,255,255,0.4)" />
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginLeft: SP.lg,
    marginBottom: SP.sm,
    paddingHorizontal: SP.sm,
    paddingVertical: 5,
    borderRadius: R.xs,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 3,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 2,
  },
  label: {
    ...TY.cap,
    fontSize: 10,
    letterSpacing: 0.4,
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginLeft: SP.xs,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  refreshText: {
    ...TY.cap,
    fontSize: 9,
    color: "rgba(255,255,255,0.45)",
  },
});
