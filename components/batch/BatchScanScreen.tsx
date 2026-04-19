/**
 * BatchScanScreen — camera roll multi-item scanner.
 *
 * Flow:
 *   1. SELECT   — image picker grid (up to 10 photos)
 *   2. SCANNING — each item scanned with concurrency=3, results appear live
 *   3. RESULTS  — portfolio summary card + item grid
 *
 * Each scan fires:
 *   POST /api/batch/identify  → vision identity (query, category, confidence)
 *   POST /market/search        → prices, buyVerdict, ebaySoldComps, etc.
 * After all items complete:
 *   POST /api/batch/analyze   → portfolio tier, topFlips, sellSequence
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  interpolate,
  Extrapolation,
  Easing,
} from "react-native-reanimated";
import { C, SP, R, TY, fmtMoney } from "../design/DS";
import { PressableScale } from "../primitives/PressableScale";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_ITEMS = 10;
const CONCURRENCY = 3;

// ─── Types ────────────────────────────────────────────────────────────────────

type ScanStatus = "pending" | "identifying" | "pricing" | "done" | "error";

interface BatchItem {
  id: string;
  uri: string;
  status: ScanStatus;
  // results
  itemName?: string;
  query?: string;
  category?: string;
  confidence?: number;
  price?: number | null;
  buyVerdict?: string | null;
  buyScore?: number | null;
  ebaySoldComps?: {
    count: number;
    median: number;
    soldCount30d?: number;
    avgDaysToSell?: number | null;
    velocityTier?: string;
    velocityLabel?: string;
  } | null;
  flipProfit?: number | null;
  error?: string | null;
}

interface PortfolioAnalysis {
  totalValue: number;
  topFlips: { itemName: string; estimatedProfit: number; sellPlatform: string; daysToSell: number }[];
  portfolioTier: "strong" | "mixed" | "weak";
  summary: string | null;
  sellSequence: string[];
}

interface BatchScanScreenProps {
  visible: boolean;
  apiBase: string;
  zipCode?: string | null;
  onClose: () => void;
  /** Optional: called when user taps an item result to open full results */
  onOpenItem?: (itemName: string, query: string) => void;
}

// ─── Velocity colors ─────────────────────────────────────────────────────────

const TIER_COLOR: Record<string, string> = {
  hot:    "rgba(255,120,80,0.90)",
  active: "rgba(80,220,140,0.90)",
  steady: "rgba(100,180,255,0.90)",
  slow:   "rgba(255,200,80,0.85)",
  rare:   "rgba(180,180,180,0.70)",
};

const TIER_BG: Record<string, string> = {
  hot:    "rgba(255,80,50,0.14)",
  active: "rgba(0,200,110,0.12)",
  steady: "rgba(80,160,255,0.10)",
  slow:   "rgba(255,190,40,0.10)",
  rare:   "rgba(255,255,255,0.06)",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function BatchScanScreen({ visible, apiBase, zipCode, onClose, onOpenItem }: BatchScanScreenProps) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<"select" | "scanning" | "results">("select");
  const [items, setItems] = useState<BatchItem[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioAnalysis | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const scanningRef = useRef(false);

  // ── Slide animation ──────────────────────────────────────────────────────
  const slideY = useSharedValue(800);
  const backdropOp = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      backdropOp.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
      slideY.value = withSpring(0, { damping: 28, stiffness: 220, mass: 1 });
    } else {
      backdropOp.value = withTiming(0, { duration: 200 });
      slideY.value = withSpring(800, { damping: 28, stiffness: 220, mass: 1 });
      // Reset on close
      setTimeout(() => {
        setPhase("select");
        setItems([]);
        setPortfolio(null);
        scanningRef.current = false;
      }, 350);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const screenStyle  = useAnimatedStyle(() => ({ transform: [{ translateY: slideY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOp.value }));

  // ── Image picker ─────────────────────────────────────────────────────────
  const pickImages = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: MAX_ITEMS,
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.length) return;
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
      const newItems: BatchItem[] = result.assets.map((a) => ({
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        uri: a.uri,
        status: "pending",
      }));
      setItems((prev) => [...prev, ...newItems].slice(0, MAX_ITEMS));
    } catch (e) {
      console.warn("BatchScan: pickImages error", e);
    }
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  // ── Scan orchestration ───────────────────────────────────────────────────
  const scanItem = useCallback(async (item: BatchItem): Promise<BatchItem> => {
    const updateStatus = (status: ScanStatus) => {
      setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, status } : it));
    };

    try {
      // Compress image
      const compressed = await ImageManipulator.manipulateAsync(
        item.uri,
        [{ resize: { width: 800 } }],
        { compress: 0.78, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      const b64 = compressed.base64;
      if (!b64) throw new Error("compression_failed");

      // Step 1: Vision identify
      updateStatus("identifying");
      const visionResp = await fetch(`${apiBase}/api/batch/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: b64 }),
        signal: AbortSignal.timeout(28000),
      });
      const vision = await visionResp.json();
      if (!vision?.ok || !vision?.query) {
        throw new Error(vision?.error || "vision_failed");
      }

      // Step 2: Market search
      updateStatus("pricing");
      const marketResp = await fetch(`${apiBase}/market/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: vision.query,
          variants: vision.variants || [],
          visionConfidence: vision.confidence || 0.5,
          visionIdentity: vision.identity || null,
          category: vision.category || "",
          zipCode: zipCode || null,
        }),
        signal: AbortSignal.timeout(30000),
      });
      const market = await marketResp.json();

      const price = Number.isFinite(Number(market?.best?.price))
        ? Number(market.best.price)
        : Number.isFinite(Number(market?.items?.[0]?.price))
          ? Number(market.items[0].price)
          : null;

      const result: BatchItem = {
        ...item,
        status: "done",
        itemName: market?.activeResult?.itemName || vision.query,
        query:    vision.query,
        category: vision.category || market?.activeResult?.category || null,
        confidence: vision.confidence,
        price,
        buyVerdict:   market?.activeResult?.buyVerdict  ?? market?.consensus?.verdict ?? null,
        buyScore:     market?.activeResult?.buyScore    ?? market?.consensus?.buyScore ?? null,
        ebaySoldComps: market?.ebaySoldComps ?? null,
        flipProfit: (() => {
          const p = price;
          if (!p) return null;
          const med = market?.ebaySoldComps?.median;
          if (!med) return null;
          return Math.round((med - p) * 0.87 * 100) / 100; // 13% platform fees
        })(),
      };

      setItems((prev) => prev.map((it) => it.id === item.id ? result : it));
      return result;
    } catch (e: any) {
      const failed: BatchItem = { ...item, status: "error", error: e?.message || "scan_failed" };
      setItems((prev) => prev.map((it) => it.id === item.id ? failed : it));
      return failed;
    }
  }, [apiBase, zipCode]);

  const runBatchScan = useCallback(async () => {
    if (scanningRef.current || items.length === 0) return;
    scanningRef.current = true;
    setPhase("scanning");
    setPortfolio(null);
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}

    // Concurrency pool
    const queue = [...items];
    const results: BatchItem[] = [];
    const pool: Promise<void>[] = [];

    const runNext = async () => {
      while (queue.length > 0) {
        const item = queue.shift()!;
        const r = await scanItem(item);
        results.push(r);
      }
    };

    for (let i = 0; i < Math.min(CONCURRENCY, queue.length); i++) {
      pool.push(runNext());
    }
    await Promise.all(pool);

    setPhase("results");

    // Portfolio analysis
    const doneItems = results.filter((r) => r.status === "done");
    if (doneItems.length > 0) {
      setPortfolioLoading(true);
      try {
        const analyzeResp = await fetch(`${apiBase}/api/batch/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: doneItems.map((it) => ({
              itemName:     it.itemName,
              price:        it.price,
              buyScore:     it.buyScore,
              buyVerdict:   it.buyVerdict,
              category:     it.category,
              ebaySoldComps: it.ebaySoldComps,
            })),
          }),
          signal: AbortSignal.timeout(20000),
        });
        const pa = await analyzeResp.json();
        if (pa?.ok) setPortfolio(pa as PortfolioAnalysis);
      } catch {}
      finally { setPortfolioLoading(false); }
    }

    scanningRef.current = false;
  }, [items, scanItem, apiBase]);

  // ─────────────────────────────────────────────────────────────────────────

  if (!visible && slideY.value >= 799) return null;

  const doneCount  = items.filter((it) => it.status === "done").length;
  const totalCount = items.length;
  const scanProgress = totalCount > 0 ? doneCount / totalCount : 0;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? "auto" : "none"}>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={phase === "select" ? onClose : undefined} />
      </Animated.View>

      {/* Main drawer */}
      <Animated.View style={[styles.screen, screenStyle, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {Platform.OS === "ios" ? (
          <BlurView intensity={72} tint="dark" style={StyleSheet.absoluteFillObject} />
        ) : null}
        <View style={styles.screenOverlay} />

        {/* Handle */}
        <View style={styles.handleRow}><View style={styles.handle} /></View>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.batchBadge}>
              <Ionicons name="layers" size={13} color="rgba(255,255,255,0.9)" />
            </View>
            <View>
              <Text style={styles.headerTitle}>Batch Scan</Text>
              {phase !== "select" ? (
                <Text style={styles.headerSub}>
                  {phase === "scanning"
                    ? `${doneCount} / ${totalCount} scanned`
                    : `${doneCount} items · ${portfolio ? portfolio.portfolioTier.toUpperCase() + " portfolio" : "complete"}`}
                </Text>
              ) : (
                <Text style={styles.headerSub}>Up to {MAX_ITEMS} items from camera roll</Text>
              )}
            </View>
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={10}>
            <Ionicons name="close" size={18} color={C.text3} />
          </Pressable>
        </View>

        {/* Progress bar (scanning phase) */}
        {phase === "scanning" ? (
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: `${Math.round(scanProgress * 100)}%` as any }]} />
          </View>
        ) : null}

        {/* ── SELECT PHASE ───────────────────────────────────────────────── */}
        {phase === "select" ? (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Add photos grid */}
            <View style={styles.imageGrid}>
              {items.map((item) => (
                <SelectThumbnail key={item.id} item={item} onRemove={() => removeItem(item.id)} />
              ))}
              {items.length < MAX_ITEMS ? (
                <Pressable onPress={pickImages} style={styles.addCell}>
                  <Ionicons name="add" size={28} color={C.text3} />
                  <Text style={styles.addCellText}>
                    {items.length === 0 ? "Add photos" : `+ ${MAX_ITEMS - items.length} more`}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {items.length === 0 ? (
              <View style={styles.emptyHint}>
                <Ionicons name="images-outline" size={40} color="rgba(255,255,255,0.15)" />
                <Text style={styles.emptyHintTitle}>Pick items to scan</Text>
                <Text style={styles.emptyHintSub}>
                  Select up to {MAX_ITEMS} photos from your camera roll. Evan identifies each item and estimates its market value.
                </Text>
              </View>
            ) : null}
          </ScrollView>
        ) : null}

        {/* ── SCANNING / RESULTS PHASE ────────────────────────────────────── */}
        {(phase === "scanning" || phase === "results") ? (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Portfolio summary (results phase) */}
            {phase === "results" ? (
              <PortfolioCard portfolio={portfolio} loading={portfolioLoading} items={items} />
            ) : null}

            {/* Item results */}
            <View style={styles.itemGrid}>
              {items.map((item, idx) => (
                <BatchItemCard
                  key={item.id}
                  item={item}
                  index={idx}
                  onPress={item.status === "done" && onOpenItem
                    ? () => onOpenItem(item.itemName!, item.query!)
                    : undefined}
                />
              ))}
            </View>
          </ScrollView>
        ) : null}

        {/* CTA footer */}
        <View style={styles.footer}>
          {phase === "select" ? (
            <>
              {items.length > 0 ? (
                <PressableScale
                  onPress={runBatchScan}
                  style={styles.scanBtn}
                  scale={0.97}
                  haptic
                >
                  <Ionicons name="scan" size={17} color="#000" />
                  <Text style={styles.scanBtnText}>
                    Scan {items.length} item{items.length !== 1 ? "s" : ""}
                  </Text>
                </PressableScale>
              ) : (
                <PressableScale onPress={pickImages} style={styles.scanBtn} scale={0.97} haptic>
                  <Ionicons name="images-outline" size={17} color="#000" />
                  <Text style={styles.scanBtnText}>Choose photos</Text>
                </PressableScale>
              )}
            </>
          ) : phase === "scanning" ? (
            <View style={styles.scanningFooter}>
              <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
              <Text style={styles.scanningText}>
                Scanning {totalCount - doneCount} remaining…
              </Text>
            </View>
          ) : (
            <PressableScale
              onPress={() => { setPhase("select"); setItems([]); setPortfolio(null); scanningRef.current = false; }}
              style={styles.scanAgainBtn}
              scale={0.97}
              haptic
            >
              <Ionicons name="refresh" size={16} color={C.text} />
              <Text style={styles.scanAgainText}>Scan new batch</Text>
            </PressableScale>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

// ─── SelectThumbnail ─────────────────────────────────────────────────────────

function SelectThumbnail({ item, onRemove }: { item: BatchItem; onRemove: () => void }) {
  return (
    <View style={styles.thumbCell}>
      <Image source={{ uri: item.uri }} style={styles.thumbImg} resizeMode="cover" />
      <Pressable onPress={onRemove} style={styles.thumbRemove} hitSlop={6}>
        <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.9)" />
      </Pressable>
    </View>
  );
}

// ─── BatchItemCard ────────────────────────────────────────────────────────────

function BatchItemCard({ item, index, onPress }: {
  item: BatchItem;
  index: number;
  onPress?: () => void;
}) {
  const entrance = useSharedValue(0);

  useEffect(() => {
    if (item.status === "done" || item.status === "error") {
      entrance.value = withDelay(
        index * 60,
        withSpring(1, { damping: 22, stiffness: 260, mass: 0.8 })
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.status]);

  const animStyle = useAnimatedStyle(() => ({
    opacity:   interpolate(entrance.value, [0, 0.5, 1], [0.4, 0.8, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(entrance.value, [0, 1], [0.95, 1], Extrapolation.CLAMP) }],
  }));

  const vel     = item.ebaySoldComps?.velocityTier || null;
  const velLabel = item.ebaySoldComps?.velocityLabel || vel || null;
  const vel30   = item.ebaySoldComps?.soldCount30d ?? item.ebaySoldComps?.count ?? null;

  return (
    <Animated.View style={animStyle as any}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.itemCard, pressed && { opacity: 0.85 }]}
        disabled={!onPress}
      >
        {/* Thumbnail */}
        <View style={styles.itemThumbWrap}>
          <Image source={{ uri: item.uri }} style={styles.itemThumb} resizeMode="cover" />
          {/* Status overlay */}
          {item.status !== "done" ? (
            <View style={styles.itemStatusOverlay}>
              {item.status === "error" ? (
                <Ionicons name="warning-outline" size={20} color="rgba(255,100,80,0.9)" />
              ) : (
                <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
              )}
              <Text style={styles.itemStatusText}>
                {item.status === "identifying" ? "Identifying…"
                  : item.status === "pricing"  ? "Pricing…"
                  : item.status === "error"    ? "Failed"
                  : "Pending…"}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Info */}
        <View style={styles.itemInfo}>
          <Text style={styles.itemName} numberOfLines={2}>
            {item.itemName || item.query || "Unknown item"}
          </Text>

          {item.status === "done" ? (
            <>
              <Text style={styles.itemPrice}>
                {item.price != null ? fmtMoney(item.price) : "—"}
              </Text>

              {/* Velocity pill */}
              {vel && velLabel ? (
                <View style={[styles.velPill, { backgroundColor: TIER_BG[vel] ?? TIER_BG.steady, borderColor: "rgba(255,255,255,0.12)" }]}>
                  <Text style={[styles.velText, { color: TIER_COLOR[vel] ?? TIER_COLOR.steady }]}>
                    {vel30 ? `${vel30} sold · ` : ""}{velLabel}
                  </Text>
                </View>
              ) : null}

              {/* Flip profit */}
              {item.flipProfit != null && item.flipProfit > 0 ? (
                <View style={styles.profitRow}>
                  <Ionicons name="trending-up" size={11} color="rgba(80,220,140,0.85)" />
                  <Text style={styles.profitText}>+{fmtMoney(item.flipProfit)} est.</Text>
                </View>
              ) : null}

              {/* Verdict */}
              {item.buyVerdict ? (
                <Text style={styles.verdictText} numberOfLines={1}>{item.buyVerdict}</Text>
              ) : null}
            </>
          ) : item.status === "error" ? (
            <Text style={styles.itemError}>{item.error || "Scan failed"}</Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── PortfolioCard ────────────────────────────────────────────────────────────

const TIER_BADGE = {
  strong: { bg: "rgba(0,210,120,0.14)", border: "rgba(0,210,120,0.30)", color: "rgba(80,255,160,0.95)", icon: "trending-up" as const },
  mixed:  { bg: "rgba(255,200,60,0.12)", border: "rgba(255,200,60,0.28)", color: "rgba(255,215,100,0.95)", icon: "swap-horizontal" as const },
  weak:   { bg: "rgba(255,80,60,0.12)", border: "rgba(255,80,60,0.26)", color: "rgba(255,120,100,0.90)", icon: "trending-down" as const },
};

function PortfolioCard({ portfolio, loading, items }: {
  portfolio: PortfolioAnalysis | null;
  loading: boolean;
  items: BatchItem[];
}) {
  const doneItems = items.filter((it) => it.status === "done");
  const totalEst  = doneItems.reduce((s, it) => s + (it.price || 0), 0);
  const totalFlip = doneItems.reduce((s, it) => s + (it.flipProfit && it.flipProfit > 0 ? it.flipProfit : 0), 0);

  const tierKey  = (portfolio?.portfolioTier || "mixed") as keyof typeof TIER_BADGE;
  const tierInfo = TIER_BADGE[tierKey];

  return (
    <View style={styles.portfolioCard}>
      {Platform.OS === "ios" ? (
        <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFillObject} />
      ) : null}
      <View style={styles.portfolioOverlay} />

      {/* Stats row */}
      <View style={styles.portfolioStats}>
        <PortfolioStat label="Est. value" value={fmtMoney(portfolio?.totalValue ?? totalEst)} />
        <View style={styles.portfolioStatDivider} />
        <PortfolioStat label="Flip upside" value={totalFlip > 0 ? `+${fmtMoney(totalFlip)}` : "—"} highlight={totalFlip > 0} />
        <View style={styles.portfolioStatDivider} />
        <PortfolioStat label="Items" value={String(doneItems.length)} />
      </View>

      {/* Tier badge */}
      {portfolio ? (
        <View style={[styles.tierBadge, { backgroundColor: tierInfo.bg, borderColor: tierInfo.border }]}>
          <Ionicons name={tierInfo.icon} size={12} color={tierInfo.color} />
          <Text style={[styles.tierText, { color: tierInfo.color }]}>
            {tierKey.toUpperCase()} PORTFOLIO
          </Text>
        </View>
      ) : loading ? (
        <View style={styles.portfolioLoading}>
          <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
          <Text style={styles.portfolioLoadingText}>Analyzing portfolio…</Text>
        </View>
      ) : null}

      {/* Summary */}
      {portfolio?.summary ? (
        <Text style={styles.portfolioSummary}>{portfolio.summary}</Text>
      ) : null}

      {/* Top flips */}
      {portfolio?.topFlips && portfolio.topFlips.length > 0 ? (
        <View style={styles.topFlipsWrap}>
          <Text style={styles.topFlipsLabel}>TOP FLIPS</Text>
          {portfolio.topFlips.map((f, i) => (
            <View key={i} style={styles.topFlipRow}>
              <View style={styles.topFlipRank}>
                <Text style={styles.topFlipRankText}>{i + 1}</Text>
              </View>
              <View style={styles.topFlipInfo}>
                <Text style={styles.topFlipName} numberOfLines={1}>{f.itemName}</Text>
                <Text style={styles.topFlipMeta}>
                  {f.sellPlatform}{f.daysToSell ? ` · ~${f.daysToSell}d to sell` : ""}
                </Text>
              </View>
              <Text style={styles.topFlipProfit}>
                {f.estimatedProfit > 0 ? `+${fmtMoney(f.estimatedProfit)}` : fmtMoney(f.estimatedProfit)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PortfolioStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.portfolioStatItem}>
      <Text style={styles.portfolioStatLabel}>{label}</Text>
      <Text style={[styles.portfolioStatValue, highlight && styles.portfolioStatValueGreen]}>{value}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const THUMB_SIZE = 88;
const ITEM_CARD_W = "48%" as any;

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.60)",
  },
  screen: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    maxHeight: "96%",
    minHeight: 400,
    borderTopLeftRadius: R.xxl,
    borderTopRightRadius: R.xxl,
    overflow: "hidden",
    backgroundColor: "rgba(8,8,8,0.97)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  screenOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4,4,4,0.65)",
  },

  handleRow: { alignItems: "center", paddingTop: SP.md, paddingBottom: SP.sm },
  handle:    { width: 36, height: 4, borderRadius: R.pill, backgroundColor: "rgba(255,255,255,0.18)" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SP.lg,
    paddingBottom: SP.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  headerLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: SP.sm },
  batchBadge: {
    width: 28, height: 28, borderRadius: R.md,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { ...TY.h3, color: C.text, fontSize: 16 },
  headerSub:   { ...TY.cap, color: C.text4, fontSize: 11, marginTop: 1 },
  closeBtn: {
    width: 32, height: 32, borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center", justifyContent: "center",
  },

  progressTrack: { height: 2, backgroundColor: "rgba(255,255,255,0.07)", marginHorizontal: SP.lg, borderRadius: 1 },
  progressFill:  { height: 2, backgroundColor: "rgba(255,255,255,0.55)", borderRadius: 1 },

  scroll: { flex: 1 },
  scrollContent: { padding: SP.lg, paddingBottom: SP.sm },

  // Select phase grid
  imageGrid: { flexDirection: "row", flexWrap: "wrap", gap: SP.sm },
  thumbCell: { width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: R.md, overflow: "hidden", position: "relative" },
  thumbImg:  { width: "100%", height: "100%" },
  thumbRemove: {
    position: "absolute", top: 4, right: 4,
    backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 10,
  },
  addCell: {
    width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: R.md,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
    borderStyle: "dashed",
    alignItems: "center", justifyContent: "center", gap: 4,
  },
  addCellText: { ...TY.cap, color: C.text4, fontSize: 10 },

  emptyHint: { alignItems: "center", paddingVertical: SP.xxxl, gap: SP.md },
  emptyHintTitle: { ...TY.h2, color: C.text2, fontSize: 17 },
  emptyHintSub: { ...TY.body, color: C.text4, fontSize: 13, textAlign: "center", lineHeight: 19, paddingHorizontal: SP.lg },

  // Item grid
  itemGrid: { flexDirection: "row", flexWrap: "wrap", gap: SP.sm },
  itemCard: {
    width: ITEM_CARD_W,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: R.lg,
    overflow: "hidden",
  },
  itemThumbWrap: { width: "100%", aspectRatio: 1, backgroundColor: "#111" },
  itemThumb:     { width: "100%", height: "100%" },
  itemStatusOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.62)",
    alignItems: "center", justifyContent: "center", gap: 4,
  },
  itemStatusText: { ...TY.cap, color: "rgba(255,255,255,0.75)", fontSize: 11 },
  itemInfo: { padding: SP.sm + 2, gap: 3 },
  itemName: { ...TY.bodyBold, color: C.text, fontSize: 12, lineHeight: 16 },
  itemPrice: { ...TY.price, color: C.text, fontSize: 18, marginTop: 2 },
  velPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: R.pill,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 2,
  },
  velText: { ...TY.cap, fontSize: 10, fontWeight: "600" },
  profitRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 1 },
  profitText: { ...TY.cap, color: "rgba(80,220,140,0.85)", fontSize: 11 },
  verdictText: { ...TY.cap, color: C.text4, fontSize: 10, marginTop: 1 },
  itemError: { ...TY.cap, color: "rgba(255,100,80,0.8)", fontSize: 11 },

  // Portfolio card
  portfolioCard: {
    borderRadius: R.xl,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)",
    marginBottom: SP.lg,
    padding: SP.lg,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  portfolioOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(6,6,6,0.60)",
  },
  portfolioStats: { flexDirection: "row", alignItems: "center", marginBottom: SP.md },
  portfolioStatItem: { flex: 1, alignItems: "center" },
  portfolioStatLabel: { ...TY.cap, color: C.text4, fontSize: 10, letterSpacing: 0.8 },
  portfolioStatValue: { ...TY.h2, color: C.text, fontSize: 20, marginTop: 2 },
  portfolioStatValueGreen: { color: "rgba(80,220,140,0.95)" },
  portfolioStatDivider: { width: StyleSheet.hairlineWidth, height: 32, backgroundColor: "rgba(255,255,255,0.10)" },
  tierBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    alignSelf: "flex-start",
    paddingHorizontal: SP.md, paddingVertical: 4,
    borderRadius: R.pill, borderWidth: StyleSheet.hairlineWidth,
    marginBottom: SP.sm,
  },
  tierText: { ...TY.cap, fontSize: 10, fontWeight: "700", letterSpacing: 1.0 },
  portfolioLoading: { flexDirection: "row", alignItems: "center", gap: SP.sm, marginBottom: SP.sm },
  portfolioLoadingText: { ...TY.cap, color: C.text4, fontSize: 12 },
  portfolioSummary: { ...TY.body, color: C.text2, fontSize: 13, lineHeight: 19, marginBottom: SP.md },
  topFlipsWrap: { gap: SP.sm },
  topFlipsLabel: { ...TY.cap, color: C.text4, letterSpacing: 1.0, fontSize: 10 },
  topFlipRow: { flexDirection: "row", alignItems: "center", gap: SP.sm },
  topFlipRank: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center", justifyContent: "center",
  },
  topFlipRankText: { ...TY.cap, color: C.text3, fontSize: 11, fontWeight: "700" },
  topFlipInfo: { flex: 1 },
  topFlipName: { ...TY.bodyBold, color: C.text, fontSize: 13 },
  topFlipMeta: { ...TY.cap, color: C.text4, fontSize: 11 },
  topFlipProfit: { ...TY.bodyBold, color: "rgba(80,220,140,0.95)", fontSize: 14 },

  // Footer
  footer: {
    paddingHorizontal: SP.lg,
    paddingTop: SP.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.07)",
  },
  scanBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: SP.sm, minHeight: 52, borderRadius: R.lg,
    backgroundColor: "#ffffff",
    borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.55)",
  },
  scanBtnText: { ...TY.bodyBold, color: "#000", fontSize: 15, fontWeight: "900" },
  scanningFooter: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SP.sm, minHeight: 52 },
  scanningText: { ...TY.body, color: C.text3, fontSize: 14 },
  scanAgainBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: SP.sm, minHeight: 52, borderRadius: R.lg,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.14)",
  },
  scanAgainText: { ...TY.bodyBold, color: C.text, fontSize: 14 },
});
