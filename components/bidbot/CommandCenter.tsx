/**
 * CommandCenter — The "Self-Driving Fund" screen.
 *
 * Assembly order (top → bottom):
 *   1. SuccessHUD      — portfolio snapshot (always pinned at top)
 *   2. LiveTickerFeed  — Swarm activity log
 *   3. BidQueueCard    — current bid opportunity (swipeable queue)
 *   4. StrategySlider  — Orchestrator mode control
 *
 * Demo mode: ships with mock data generators so the screen is live
 * out of the box. Replace with real WebSocket / API calls in production.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { C, SP, R, TY, SH, IOS } from "../design/DS";
import { CC, MONO, type StrategyMode, STRATEGY_PRESETS, type TickerEntry, type BidOpportunityCard } from "./CommandCenterTokens";
import { SuccessHUD, type HUDData } from "./SuccessHUD";
import { LiveTickerFeed } from "./LiveTickerFeed";
import { BidQueueCard } from "./BidQueueCard";
import { StrategySlider } from "./StrategySlider";

// ─── Demo data generators ─────────────────────────────────────────────────────
let _tickerSeq = 1;
function makeTickerId() { return `t-${_tickerSeq++}`; }

function fmtTs(d: Date) {
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;
}

const DEMO_ENTRIES: TickerEntry[] = [
  { id: makeTickerId(), ts: "08:41:58", agent: "Scout-01",  level: "scout",    message: "Initializing scan — eBay · Poshmark · Mercari" },
  { id: makeTickerId(), ts: "08:41:59", agent: "Scout-03",  level: "scout",    message: "Nike SB Dunk Low detected · eBay #2847391" },
  { id: makeTickerId(), ts: "08:42:01", agent: "Scout-04",  level: "scout",    message: "Adidas Yeezy 350 V2 Bone · Poshmark #pm-yz9" },
  { id: makeTickerId(), ts: "08:42:02", agent: "Engine",    level: "engine",   message: "STR 30d → 0.72 · velocity +23.4% vs last 14d" },
  { id: makeTickerId(), ts: "08:42:03", agent: "Engine",    level: "engine",   message: "P(Accept) 0.64 · offer ratio 0.89 · days listed 18" },
  { id: makeTickerId(), ts: "08:42:04", agent: "Shield",    level: "shield",   message: "Humanoid delay active · 3.2s Gaussian sample" },
  { id: makeTickerId(), ts: "08:42:07", agent: "Dispatch",  level: "dispatch", message: "FIRE → Nike SB Dunk Low · bid $67.00 → eBay API" },
  { id: makeTickerId(), ts: "08:42:09", agent: "Result",    level: "result",   message: "ACCEPTED · seller responded in 1m 42s · profit $18.40" },
];

const LIVE_TICKER_TEMPLATES: Array<Omit<TickerEntry, "id" | "ts">> = [
  { agent: "Scout-07",  level: "scout",    message: "New listing detected · Jordan 1 Retro High · eBay" },
  { agent: "Scout-09",  level: "scout",    message: "Watchlist alert · Off-White Nike Dunk · Poshmark" },
  { agent: "Engine",    level: "engine",   message: "Price bracket computed · comp median $124.00" },
  { agent: "Engine",    level: "engine",   message: "Flip score: 8.2 · STR 0.68 · margin delta +$22.10" },
  { agent: "Shield",    level: "shield",   message: "Rate limit check · PASS · 4/8 hr limit used" },
  { agent: "Shield",    level: "shield",   message: "Humanoid delay active · 4.7s" },
  { agent: "Dispatch",  level: "dispatch", message: "FIRE → Jordan 1 High OG · bid $104.00" },
  { agent: "Engine",    level: "engine",   message: "Capital exposure: $312 / $600 · OK" },
  { agent: "Scout-11",  level: "scout",    message: "Deduplication: listing seen 2d ago · SKIP" },
  { agent: "Result",    level: "result",   message: "COUNTER RECEIVED · seller at $115 · holding" },
];

const DEMO_OPPORTUNITY: BidOpportunityCard = {
  listingId: "ebay-2847391",
  name: "Nike SB Dunk Low Pro · Fog",
  store: "Private Seller",
  platform: "ebay",
  image: null,
  askingPrice: 89.99,
  bidPrice: 67.00,
  fees: 4.10,
  projectedSellPrice: 94.00,
  projectedROI: 0.34,
  projectedProfit: 22.90,
  evanScore: 8.4,
  acceptancePct: 64,
  str30d: 0.68,
  priorityScore: 87,
  daysListed: 18,
  tokenRef: "demo-ref-abc123",
};

const DEMO_HUD: HUDData = {
  totalExposure: 312.00,
  openPositions: 4,
  capitalReserved: 210.00,
  dailyProfit: 41.80,
  streak: ["win", "win", "loss", "win", "pending"],
  totalBidsToday: 7,
  acceptedToday: 5,
};

// ─── CommandCenter ────────────────────────────────────────────────────────────
export function CommandCenter() {
  const insets = useSafeAreaInsets();
  const [entries, setEntries]   = useState<TickerEntry[]>(DEMO_ENTRIES);
  const [hud, setHud]           = useState<HUDData>(DEMO_HUD);
  const [strategy, setStrategy] = useState<StrategyMode>("standard");
  const [opportunity, setOpportunity] = useState<BidOpportunityCard | null>(DEMO_OPPORTUNITY);
  const [bidMode, setBidMode]   = useState<"auto" | "confirm">("auto");
  const [showStrategy, setShowStrategy] = useState(false);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Simulate live ticker feed
  useEffect(() => {
    let i = 0;
    tickerRef.current = setInterval(() => {
      const template = LIVE_TICKER_TEMPLATES[i % LIVE_TICKER_TEMPLATES.length];
      const entry: TickerEntry = {
        id: makeTickerId(),
        ts: fmtTs(new Date()),
        ...template,
      };
      setEntries((prev) => [...prev, entry]);
      i++;
    }, 2800);

    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
  }, []);

  const handleBid = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEntries((prev) => [
      ...prev,
      {
        id: makeTickerId(),
        ts: fmtTs(new Date()),
        agent: "Dispatch",
        level: "dispatch",
        message: `FIRE → ${opportunity?.name} · bid ${opportunity?.bidPrice}`,
      },
    ]);
    setOpportunity(null);
    setHud((prev) => ({
      ...prev,
      openPositions: prev.openPositions + 1,
      totalExposure: prev.totalExposure + (opportunity?.bidPrice ?? 0),
      totalBidsToday: prev.totalBidsToday + 1,
    }));
  }, [opportunity]);

  const handleAbort = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEntries((prev) => [
      ...prev,
      {
        id: makeTickerId(),
        ts: fmtTs(new Date()),
        agent: "User",
        level: "shield",
        message: `ABORTED · ${opportunity?.name}`,
      },
    ]);
    setOpportunity(null);
  }, [opportunity]);

  const handleDismiss = useCallback(() => {
    setOpportunity(null);
  }, []);

  const handleStrategyChange = useCallback((mode: StrategyMode) => {
    setStrategy(mode);
  }, []);

  const strategySlideStyle = useAnimatedStyle(() => ({
    // Can add entrance animation here
  }));

  return (
    <SafeAreaView style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header bar */}
      <View style={styles.headerBar}>
        <View style={styles.headerLeft}>
          <View style={styles.headerDot} />
          <Text style={styles.headerTitle}>EVAN AI</Text>
          <Text style={styles.headerSub}>COMMAND CENTER</Text>
        </View>
        <TouchableOpacity
          style={[styles.modeToggle, bidMode === "auto" && styles.modeToggleActive]}
          onPress={() => {
            setBidMode((prev) => prev === "auto" ? "confirm" : "auto");
            Haptics.selectionAsync();
          }}
        >
          <Text style={styles.modeToggleText}>
            {bidMode === "auto" ? "AUTO" : "MANUAL"}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ─ HUD ─────────────────────────────────────────────────────── */}
        <SuccessHUD data={hud} />

        {/* ─ Live Ticker ─────────────────────────────────────────────── */}
        <LiveTickerFeed entries={entries} style={styles.section} />

        {/* ─ Bid Queue ───────────────────────────────────────────────── */}
        {opportunity ? (
          <BidQueueCard
            item={opportunity}
            mode={bidMode}
            countdownSecs={8}
            onBid={handleBid}
            onAbort={handleAbort}
            onDismiss={handleDismiss}
            style={styles.section}
          />
        ) : (
          <View style={[styles.emptyQueue, styles.section]}>
            <Text style={styles.emptyIcon}>◎</Text>
            <Text style={styles.emptyTitle}>QUEUE CLEAR</Text>
            <Text style={styles.emptySub}>Swarm scanning for opportunities…</Text>
          </View>
        )}

        {/* ─ Strategy Slider ─────────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.strategyToggle, styles.section]}
          onPress={() => {
            setShowStrategy((v) => !v);
            Haptics.selectionAsync();
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.strategyToggleLabel}>ORCHESTRATOR · {strategy.toUpperCase()}</Text>
          <Text style={styles.strategyToggleArrow}>{showStrategy ? "▲" : "▼"}</Text>
        </TouchableOpacity>

        {showStrategy && (
          <StrategySlider
            value={strategy}
            onChange={handleStrategyChange}
            style={styles.sectionLast}
          />
        )}

        <View style={{ height: insets.bottom + SP.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },

  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SP.lg,
    paddingVertical: SP.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,255,65,0.08)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
  },
  headerDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: CC.mint,
  },
  headerTitle: {
    ...MONO,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 3,
    color: CC.mint,
  },
  headerSub: {
    ...MONO,
    fontSize: 8,
    letterSpacing: 2,
    color: C.text4,
  },
  modeToggle: {
    paddingHorizontal: SP.md,
    paddingVertical: 6,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  modeToggleActive: {
    backgroundColor: CC.mintBg,
    borderColor: CC.mintBorder,
  },
  modeToggleText: {
    ...MONO,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
    color: C.text3,
  },

  scroll: {
    paddingHorizontal: SP.lg,
    paddingTop: SP.md,
    gap: SP.md,
  },
  section: {
    // no extra margin — gap handles it
  },
  sectionLast: {
    // last item in scroll
  },

  // Empty queue state
  emptyQueue: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SP.xxxl,
    backgroundColor: CC.hudBg,
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: "rgba(0,255,65,0.08)",
    gap: SP.sm,
  },
  emptyIcon: {
    fontSize: 28,
    color: "rgba(0,255,65,0.30)",
  },
  emptyTitle: {
    ...MONO,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 3,
    color: "rgba(0,255,65,0.50)",
  },
  emptySub: {
    ...MONO,
    fontSize: 8,
    letterSpacing: 0.8,
    color: C.text4,
  },

  // Strategy accordion toggle
  strategyToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SP.lg,
    paddingVertical: SP.md,
    backgroundColor: CC.hudBg,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: CC.hudBorder,
  },
  strategyToggleLabel: {
    ...MONO,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
    color: C.text3,
  },
  strategyToggleArrow: {
    ...MONO,
    fontSize: 9,
    color: C.text4,
  },
});
