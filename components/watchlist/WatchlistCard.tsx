/**
 * WatchlistCard — Premium animated glass card with Skia price graph
 *
 * Features:
 *   - GPU-accelerated line graph via @shopify/react-native-skia
 *   - Draw-from-left animation on tab entry with stagger
 *   - Trailing glow + leading dot during draw
 *   - Pulse on draw completion, then idle breathing glow
 *   - Frosted glass card (expo-blur)
 *   - % change badge, "Visit Scan" CTA
 *   - Card press lift via Reanimated spring
 */
import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import {
  Canvas,
  Path,
  Skia,
  vec,
  LinearGradient as SkiaGrad,
  Circle,
  BlurMask,
} from "@shopify/react-native-skia";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  Easing,
  useDerivedValue,
  interpolate,
  Extrapolation,
  type SharedValue,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { SP, R } from "../design/DS";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WatchlistItem {
  id: string;
  query: string;
  lastBest?: number | null;
  lastCheckedMs?: number | null;
  history?: { best?: number | null; checkedMs?: number | null }[];
}

interface WatchlistCardProps {
  item: WatchlistItem;
  index: number;
  tabVisible: boolean;
  focused?: boolean;
  onRecheck: () => void;
  onRemove: () => void;
  onVisitScan: (item: WatchlistItem) => void;
  onClearFocus?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GRAPH_H = 86;
const GRAPH_PAD_T = 14;
const GRAPH_PAD_B = 10;
const GRAPH_CANVAS_H = GRAPH_H + GRAPH_PAD_T + GRAPH_PAD_B;
const CARD_PAD = 16;
const STAGGER_MS = 140;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toN(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmt$(n: number): string {
  if (!n) return "—";
  return `$${n >= 100 ? n.toFixed(0) : n.toFixed(2)}`;
}

function fmtTs(ms?: number | null): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Graph points builder ─────────────────────────────────────────────────────

interface GPoint { x: number; y: number; price: number; ts?: number }

function buildGraphPoints(
  history: WatchlistItem["history"],
  lastBest: number | null | undefined,
  lastCheckedMs: number | null | undefined,
  width: number
): GPoint[] {
  const raw: { price: number; ts?: number }[] = [];
  for (const h of history ?? []) {
    const p = toN(h.best);
    if (p > 0) raw.push({ price: p, ts: h.checkedMs ?? undefined });
  }
  if (raw.length === 0 && lastBest) {
    raw.push({ price: toN(lastBest), ts: lastCheckedMs ?? undefined });
  }
  if (raw.length < 2) return [];

  const prices = raw.map((r) => r.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const rangeP = maxP - minP || 1;
  const n = raw.length;

  return raw.map((r, i) => ({
    x: (i / (n - 1)) * width,
    y: GRAPH_PAD_T + GRAPH_H - ((r.price - minP) / rangeP) * GRAPH_H * 0.82,
    price: r.price,
    ts: r.ts,
  }));
}

// ─── PriceGraph (Skia) ────────────────────────────────────────────────────────

const PriceGraph = memo(function PriceGraph({
  pts,
  width,
  drawProg,
  glowAlpha,
  pulseProg,
}: {
  pts: GPoint[];
  width: number;
  drawProg: SharedValue<number>;
  glowAlpha: SharedValue<number>;
  pulseProg: SharedValue<number>;
}) {
  // Build smooth cubic-bezier path
  const linePath = useMemo(() => {
    if (pts.length < 2) return null;
    const sk = Skia.Path.Make();
    sk.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const cpX = (prev.x + curr.x) / 2;
      sk.cubicTo(cpX, prev.y, cpX, curr.y, curr.x, curr.y);
    }
    return sk;
  }, [pts]);

  // Precompute interpolation arrays (static)
  const progArr = useMemo(
    () => pts.map((_, i) => i / Math.max(pts.length - 1, 1)),
    [pts]
  );
  const xArr = useMemo(() => pts.map((p) => p.x), [pts]);
  const yArr = useMemo(() => pts.map((p) => p.y), [pts]);

  // Leading dot tracks the animated draw progress
  const dotX = useDerivedValue(() =>
    pts.length >= 2
      ? interpolate(Math.min(drawProg.value, 1), progArr, xArr, "clamp")
      : 0
  );
  const dotY = useDerivedValue(() =>
    pts.length >= 2
      ? interpolate(Math.min(drawProg.value, 1), progArr, yArr, "clamp")
      : GRAPH_CANVAS_H / 2
  );
  const dotAlpha = useDerivedValue(() =>
    interpolate(drawProg.value, [0, 0.06, 1], [0, 1, 1], "clamp")
  );
  // Pulse expands dot on draw completion
  const dotR = useDerivedValue(() => 3.2 + pulseProg.value * 2.8);
  const glowR = useDerivedValue(() => (3.2 + pulseProg.value * 2.8) * 3);

  if (!linePath) return null;

  return (
    <Canvas style={{ width, height: GRAPH_CANVAS_H }}>
      {/* Glow layer — wide blurry stroke, breathes via glowAlpha */}
      <Path
        path={linePath}
        style="stroke"
        strokeWidth={12}
        start={0}
        end={drawProg}
        opacity={glowAlpha}
        color="rgba(82,180,255,0.48)"
        strokeCap="round"
        strokeJoin="round"
      >
        <BlurMask blur={10} style="normal" />
      </Path>

      {/* Secondary softer glow */}
      <Path
        path={linePath}
        style="stroke"
        strokeWidth={5}
        start={0}
        end={drawProg}
        opacity={glowAlpha}
        color="rgba(160,220,255,0.35)"
        strokeCap="round"
        strokeJoin="round"
      >
        <BlurMask blur={4} style="normal" />
      </Path>

      {/* Main line — thin, sharp, white→soft blue gradient */}
      <Path
        path={linePath}
        style="stroke"
        strokeWidth={1.6}
        start={0}
        end={drawProg}
        strokeCap="round"
        strokeJoin="round"
        antiAlias
      >
        <SkiaGrad
          start={vec(0, GRAPH_CANVAS_H / 2)}
          end={vec(width, GRAPH_CANVAS_H / 2)}
          colors={["rgba(255,255,255,0.96)", "rgba(170,210,255,0.50)"]}
        />
      </Path>

      {/* Leading dot halo */}
      <Circle
        cx={dotX}
        cy={dotY}
        r={glowR}
        opacity={dotAlpha}
        color="rgba(130,200,255,0.55)"
      >
        <BlurMask blur={8} style="normal" />
      </Circle>

      {/* Leading dot (sharp) */}
      <Circle
        cx={dotX}
        cy={dotY}
        r={dotR}
        opacity={dotAlpha}
        color="rgba(255,255,255,0.96)"
      >
        <BlurMask blur={1} style="normal" />
      </Circle>
    </Canvas>
  );
});

// ─── WatchlistCard ────────────────────────────────────────────────────────────

export const WatchlistCard = memo(function WatchlistCard({
  item,
  index,
  tabVisible,
  focused = false,
  onRecheck,
  onRemove,
  onVisitScan,
  onClearFocus,
}: WatchlistCardProps) {
  const { width: screenW } = useWindowDimensions();
  // page paddingHorizontal: 18 each side, card padding: 16 each side
  const graphW = screenW - 18 * 2 - CARD_PAD * 2;

  // ── Build graph points ───────────────────────────────────────────────────────
  const graphPts = useMemo(
    () => buildGraphPoints(item.history, item.lastBest, item.lastCheckedMs, graphW),
    [item.history, item.lastBest, item.lastCheckedMs, graphW]
  );

  // ── Price stats ──────────────────────────────────────────────────────────────
  const currentPrice = toN(item.lastBest);
  const rawPrices = (item.history ?? []).map((h) => toN(h.best)).filter((n) => n > 0);
  const prevPrice = rawPrices.length >= 2 ? rawPrices[rawPrices.length - 2] : null;
  const delta = prevPrice ? ((currentPrice - prevPrice) / prevPrice) * 100 : null;
  const isRising = (delta ?? 0) > 0;

  // ── Animated values ──────────────────────────────────────────────────────────
  const drawProg    = useSharedValue(0);
  const glowAlpha   = useSharedValue(0.45);
  const pulseProg   = useSharedValue(0);
  const cardOpacity = useSharedValue(0);
  const cardScale   = useSharedValue(1);
  const focusProg   = useSharedValue(0);

  // ── Entry animation (fires when tab becomes visible) ─────────────────────────
  const prevVisRef = useRef(false);

  useEffect(() => {
    if (tabVisible && !prevVisRef.current) {
      prevVisRef.current = true;
      const delay = index * STAGGER_MS;

      // Fade card in
      cardOpacity.value = withDelay(delay, withTiming(1, { duration: 360 }));

      // Draw graph left → right
      drawProg.value = withDelay(
        delay + 180,
        withTiming(1, { duration: 1050, easing: Easing.out(Easing.cubic) }, (done) => {
          "worklet";
          if (done) {
            // Pulse the leading dot on completion
            pulseProg.value = withSequence(
              withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) }),
              withTiming(0, { duration: 420, easing: Easing.in(Easing.quad) })
            );
            // Idle breathing glow
            glowAlpha.value = withDelay(
              300,
              withRepeat(
                withSequence(
                  withTiming(0.88, { duration: 2800, easing: Easing.bezier(0.37, 0, 0.63, 1) }),
                  withTiming(0.22, { duration: 2800, easing: Easing.bezier(0.37, 0, 0.63, 1) })
                ),
                -1,
                false
              )
            );
          }
        })
      );
    }

    // Reset for re-entry animation when user leaves and returns
    if (!tabVisible) {
      prevVisRef.current = false;
      drawProg.value    = 0;
      glowAlpha.value   = 0.45;
      cardOpacity.value = 0;
      pulseProg.value   = 0;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabVisible, index]);

  // ── Focus glow (fires on Price Pulse notification deep-link) ─────────────────
  useEffect(() => {
    if (!focused) return;
    // Pulse in → hold → fade out over 1.5s
    focusProg.value = withSequence(
      withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }),
      withDelay(860, withTiming(0, { duration: 420, easing: Easing.in(Easing.quad) })),
    );
    const t = setTimeout(() => onClearFocus?.(), 1650);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);

  const focusGlowStyle = useAnimatedStyle(() => ({
    shadowColor: "rgb(100,180,255)",
    shadowOpacity: interpolate(focusProg.value, [0, 1], [0.38, 0.82], Extrapolation.CLAMP),
    shadowRadius: interpolate(focusProg.value, [0, 1], [14, 32], Extrapolation.CLAMP),
    shadowOffset: { width: 0, height: 0 },
    elevation: interpolate(focusProg.value, [0, 1], [7, 26], Extrapolation.CLAMP),
  }));

  // ── Card press lift ──────────────────────────────────────────────────────────
  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
    opacity: cardOpacity.value,
  }));

  const handlePressIn = useCallback(() => {
    cardScale.value = withSpring(0.982, { stiffness: 480, damping: 26 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePressOut = useCallback(() => {
    cardScale.value = withSpring(1, { stiffness: 480, damping: 26 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[styles.cardWrap, animatedCardStyle, focusGlowStyle]}>
      <BlurView intensity={20} tint="dark" style={styles.blurContainer}>
        <View style={styles.card}>

          {/* ── Header ─────────────────────────────────────────────────── */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1, gap: 3, paddingRight: 10 }}>
              <Text style={styles.queryText} numberOfLines={2}>
                {item.query}
              </Text>
              {item.lastCheckedMs ? (
                <Text style={styles.metaText}>
                  Updated {fmtTs(item.lastCheckedMs)}
                </Text>
              ) : null}
            </View>

            <View style={{ alignItems: "flex-end", gap: 5 }}>
              <Text style={styles.priceText}>{fmt$(currentPrice)}</Text>
              {delta != null && (
                <View
                  style={[
                    styles.deltaBadge,
                    {
                      backgroundColor: isRising
                        ? "rgba(255,80,80,0.11)"
                        : "rgba(80,255,150,0.10)",
                      borderColor: isRising
                        ? "rgba(255,80,80,0.22)"
                        : "rgba(80,255,150,0.22)",
                    },
                  ]}
                >
                  <Ionicons
                    name={isRising ? "trending-up" : "trending-down"}
                    size={9}
                    color={isRising ? "#ff6b6b" : "#50ff96"}
                  />
                  <Text
                    style={[
                      styles.deltaText,
                      { color: isRising ? "#ff6b6b" : "#50ff96" },
                    ]}
                  >
                    {isRising ? "+" : ""}
                    {delta.toFixed(1)}%
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* ── Graph ──────────────────────────────────────────────────── */}
          {graphPts.length >= 2 ? (
            <View style={styles.graphWrap}>
              <PriceGraph
                pts={graphPts}
                width={graphW}
                drawProg={drawProg}
                glowAlpha={glowAlpha}
                pulseProg={pulseProg}
              />
            </View>
          ) : (
            <View style={styles.noGraphPlaceholder}>
              <Text style={styles.noGraphText}>
                Scan a few more times to build price history
              </Text>
            </View>
          )}

          {/* ── Divider ─────────────────────────────────────────────────── */}
          <View style={styles.divider} />

          {/* ── Actions ─────────────────────────────────────────────────── */}
          <View style={styles.actionsRow}>

            {/* Visit Scan — primary CTA */}
            <Pressable
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              onPress={() => onVisitScan(item)}
              style={({ pressed }) => [
                styles.visitBtn,
                pressed && styles.visitBtnActive,
              ]}
            >
              <Ionicons name="scan-outline" size={12} color="#82c8ff" />
              <Text style={styles.visitBtnText}>Visit Scan</Text>
            </Pressable>

            {/* Re-check */}
            <Pressable
              onPress={onRecheck}
              style={({ pressed }) => [
                styles.iconBtn,
                pressed && { opacity: 0.65, transform: [{ scale: 0.94 }] },
              ]}
              hitSlop={6}
            >
              <Ionicons name="refresh-outline" size={15} color="rgba(255,255,255,0.65)" />
            </Pressable>

            {/* Remove */}
            <Pressable
              onPress={onRemove}
              style={({ pressed }) => [
                styles.iconBtn,
                pressed && { opacity: 0.65, transform: [{ scale: 0.94 }] },
              ]}
              hitSlop={6}
            >
              <Ionicons name="trash-outline" size={15} color="rgba(255,80,80,0.65)" />
            </Pressable>

          </View>
        </View>
      </BlurView>
    </Animated.View>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  cardWrap: {
    marginBottom: 14,
    borderRadius: R.lg,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.38,
    shadowRadius: 14,
    elevation: 7,
  },
  blurContainer: {
    borderRadius: R.lg,
    overflow: "hidden",
  },
  card: {
    padding: CARD_PAD,
    borderRadius: R.lg,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.13)",
    gap: SP.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  queryText: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: -0.1,
    lineHeight: 20,
    color: "rgba(255,255,255,0.92)",
  },
  metaText: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.4,
    color: "rgba(255,255,255,0.28)",
    textTransform: "uppercase",
  },
  priceText: {
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: -0.4,
    color: "rgba(255,255,255,0.96)",
  },
  deltaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: R.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  deltaText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  graphWrap: {
    marginHorizontal: -4,
    marginTop: 2,
    marginBottom: -2,
  },
  noGraphPlaceholder: {
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.025)",
    borderRadius: R.sm,
  },
  noGraphText: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.22)",
    textAlign: "center",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.07)",
    marginHorizontal: -2,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
    marginTop: 2,
  },
  visitBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: R.pill,
    backgroundColor: "rgba(82,150,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(130,200,255,0.28)",
  },
  visitBtnActive: {
    backgroundColor: "rgba(130,200,255,0.16)",
    transform: [{ scale: 0.97 }],
  },
  visitBtnText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
    color: "#82c8ff",
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: R.sm,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
  },
});
