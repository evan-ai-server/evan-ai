/**
 * PLTracker — Feature 1: Personal Resale P&L Tracker
 * Log every flip. Track profit, ROI, tax-year summary.
 * Pure local (AsyncStorage) — no server needed. Optional server backup via onSync.
 */
import React, { useState, useMemo, useEffect, memo, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Modal,
  Alert,
  LayoutAnimation,
  UIManager,
  Platform,
} from "react-native";
if (Platform.OS === "android") {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}
import { Ionicons } from "@expo/vector-icons";
import {
  Canvas, Path, Skia, vec,
  LinearGradient as SkiaGrad, BlurMask,
} from "@shopify/react-native-skia";
import {
  useSharedValue, withTiming, Easing,
  type SharedValue,
} from "react-native-reanimated";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { SP, R, TY, Feedback } from "../design/DS";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PLFlip {
  id: string;
  itemName: string;
  category: string;
  boughtPrice: number;
  soldPrice: number | null;   // null = still holding
  platform: string;
  date: string;               // ISO date string
  notes: string;
  status: "holding" | "sold";
}

interface PLTrackerProps {
  flips: PLFlip[];
  onAdd: (flip: PLFlip) => void;
  onDelete: (id: string) => void;
  onMarkSold: (id: string, soldPrice: number) => void;
  isNet?: boolean;
  onToggleNet?: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PLATFORMS = ["eBay", "Poshmark", "Mercari", "StockX", "Depop", "FB Marketplace", "OfferUp", "Other"];
const CATEGORIES = ["Sneakers", "Clothing", "Electronics", "Luxury", "Bags", "Watches", "Vintage", "Other"];

// ─── Profit Path Chart (Skia) ─────────────────────────────────────────────────

const PCHART_H        = 78;
const PCHART_PAD_T    = 10;
const PCHART_PAD_B    = 8;
const PCHART_CANVAS_H = PCHART_H + PCHART_PAD_T + PCHART_PAD_B;

interface ProfitPoint { x: number; y: number; cum: number; date: string }

function buildProfitPoints(flips: PLFlip[], width: number): ProfitPoint[] {
  if (width <= 0) return [];
  const sold = flips
    .filter((f) => f.status === "sold" && f.soldPrice != null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  if (sold.length < 2) return [];
  let running = 0;
  const raw = sold.map((f) => {
    running += f.soldPrice! - f.boughtPrice;
    return { cum: running, date: f.date };
  });
  const cums    = raw.map((r) => r.cum);
  const minC    = Math.min(0, ...cums);
  const maxC    = Math.max(...cums);
  const range   = maxC - minC || 1;
  const n       = raw.length;
  return raw.map((r, i) => ({
    x: (i / (n - 1)) * width,
    y: PCHART_PAD_T + PCHART_H - ((r.cum - minC) / range) * PCHART_H * 0.85,
    cum: r.cum,
    date: r.date,
  }));
}

/** Dashed ghost arc rendered when no sold flips exist yet — social proof "opportunity screen" */
function buildGhostPath(width: number): ReturnType<typeof Skia.Path.Make> | null {
  if (width <= 0) return null;
  const bottom = PCHART_PAD_T + PCHART_H;
  // Quadratic bezier: start 84% down, apex at 58% (control), end 70% (15% higher than start)
  const sY = bottom * 0.84, cY = bottom * 0.57, eY = bottom * 0.70;
  const steps = 22;
  const sk = Skia.Path.Make();
  for (let i = 0; i < steps; i++) {
    if (i % 2 === 1) continue;          // odd segments = gap
    const t0 = i / steps;
    const t1 = (i + 0.72) / steps;     // 72% filled, 28% gap → dash rhythm
    // Bezier Y: P(t) = (1-t)²·sY + 2t(1-t)·cY + t²·eY  (X(t) = t·width by symmetry)
    const y0 = (1-t0)**2 * sY + 2*t0*(1-t0) * cY + t0**2 * eY;
    const y1 = (1-t1)**2 * sY + 2*t1*(1-t1) * cY + t1**2 * eY;
    sk.moveTo(t0 * width, y0);
    sk.lineTo(t1 * width, y1);
  }
  return sk;
}

const ProfitPathChart = memo(function ProfitPathChart({
  pts, width, drawProg,
}: {
  pts: ProfitPoint[];
  width: number;
  drawProg: SharedValue<number>;
}) {
  const linePath = useMemo(() => {
    if (pts.length < 2) return null;
    const sk = Skia.Path.Make();
    sk.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1], curr = pts[i];
      const cpX = (prev.x + curr.x) / 2;
      sk.cubicTo(cpX, prev.y, cpX, curr.y, curr.x, curr.y);
    }
    return sk;
  }, [pts]);

  const areaPath = useMemo(() => {
    if (pts.length < 2) return null;
    const bottom = PCHART_PAD_T + PCHART_H;
    const sk = Skia.Path.Make();
    sk.moveTo(pts[0].x, bottom);
    sk.lineTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1], curr = pts[i];
      const cpX = (prev.x + curr.x) / 2;
      sk.cubicTo(cpX, prev.y, cpX, curr.y, curr.x, curr.y);
    }
    sk.lineTo(pts[pts.length - 1].x, bottom);
    sk.close();
    return sk;
  }, [pts]);

  if (!linePath || !areaPath) return null;

  return (
    <Canvas style={{ width, height: PCHART_CANVAS_H }}>
      {/* Area fill — static green gradient below curve */}
      <Path path={areaPath} opacity={0.16}>
        <SkiaGrad
          start={vec(0, PCHART_PAD_T)}
          end={vec(0, PCHART_PAD_T + PCHART_H)}
          colors={["rgba(80,255,150,0.9)", "rgba(80,255,150,0.0)"]}
        />
      </Path>
      {/* Soft glow stroke */}
      <Path
        path={linePath}
        style="stroke"
        strokeWidth={9}
        start={0}
        end={drawProg}
        opacity={0.28}
        color="rgba(80,255,150,0.55)"
        strokeCap="round"
        strokeJoin="round"
      >
        <BlurMask blur={9} style="normal" />
      </Path>
      {/* Sharp animated line */}
      <Path
        path={linePath}
        style="stroke"
        strokeWidth={1.8}
        start={0}
        end={drawProg}
        strokeCap="round"
        strokeJoin="round"
        antiAlias
      >
        <SkiaGrad
          start={vec(0, PCHART_CANVAS_H / 2)}
          end={vec(width, PCHART_CANVAS_H / 2)}
          colors={["rgba(80,255,150,0.96)", "rgba(150,255,200,0.65)"]}
        />
      </Path>
    </Canvas>
  );
});

const SCORE_COLOR = (roi: number) =>
  roi >= 50 ? "#50ff96" : roi >= 20 ? "#ffd060" : roi >= 0 ? "#82c8ff" : "#ff5050";

function fmt(n: number) {
  return `$${Math.abs(n).toFixed(0)}`;
}
function pct(roi: number) {
  return `${roi >= 0 ? "+" : ""}${roi.toFixed(0)}%`;
}
function isoToDisplay(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
  } catch { return iso; }
}

// ─── Stats computation ───────────────────────────────────────────────────────

const FEE = 0.85; // 15% platform fee for NET mode

function netSell(soldPrice: number, isNet: boolean) {
  return isNet ? soldPrice * FEE : soldPrice;
}

function computeStats(flips: PLFlip[], isNet = false) {
  const sold = flips.filter((f) => f.status === "sold" && f.soldPrice != null);
  const profits = sold.map((f) => netSell(f.soldPrice!, isNet) - f.boughtPrice);
  const totalProfit = profits.reduce((s, p) => s + p, 0);
  const totalInvested = sold.reduce((s, f) => s + f.boughtPrice, 0);
  const avgROI = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;
  const bestFlip = sold.reduce((best, f) => {
    const p = netSell(f.soldPrice!, isNet) - f.boughtPrice;
    const bp = best ? netSell(best.soldPrice!, isNet) - best.boughtPrice : -Infinity;
    return p > bp ? f : best;
  }, null as PLFlip | null);
  const thisYear = new Date().getFullYear();
  const yearProfit = sold
    .filter((f) => new Date(f.date).getFullYear() === thisYear)
    .reduce((s, f) => s + netSell(f.soldPrice!, isNet) - f.boughtPrice, 0);
  const holding = flips.filter((f) => f.status === "holding");
  const holdingValue = holding.reduce((s, f) => s + f.boughtPrice, 0);
  return { totalProfit, avgROI, bestFlip, yearProfit, flipCount: sold.length, holding: holding.length, holdingValue };
}

// ─── Add Flip Form ────────────────────────────────────────────────────────────

function AddFlipModal({ visible, onClose, onSave }: {
  visible: boolean;
  onClose: () => void;
  onSave: (flip: PLFlip) => void;
}) {
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState("Other");
  const [boughtPrice, setBoughtPrice] = useState("");
  const [soldPrice, setSoldPrice] = useState("");
  const [platform, setPlatform] = useState("eBay");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"holding" | "sold">("sold");

  const reset = () => {
    setItemName(""); setCategory("Other"); setBoughtPrice("");
    setSoldPrice(""); setPlatform("eBay"); setNotes(""); setStatus("sold");
  };

  const handleSave = () => {
    if (!itemName.trim()) { Alert.alert("Item name required"); return; }
    const bp = parseFloat(boughtPrice);
    if (!Number.isFinite(bp) || bp <= 0) { Alert.alert("Enter a valid buy price"); return; }
    const sp = status === "sold" ? parseFloat(soldPrice) : null;
    if (status === "sold" && (!Number.isFinite(sp!) || sp! <= 0)) {
      Alert.alert("Enter a valid sell price"); return;
    }
    const flip: PLFlip = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      itemName: itemName.trim(),
      category,
      boughtPrice: bp,
      soldPrice: sp,
      platform,
      date: new Date().toISOString(),
      notes: notes.trim(),
      status,
    };
    onSave(flip);
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" }}>
        <Pressable style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => { reset(); onClose(); }} />
        <View style={[modal.bg, { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "88%" }]}>
        <View style={modal.header}>
          <Text style={modal.title}>Log a Flip</Text>
          <Pressable onPress={() => { reset(); onClose(); }} hitSlop={12}>
            <Ionicons name="close" size={22} color="rgba(255,255,255,0.6)" />
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: SP.lg, gap: SP.md }} showsVerticalScrollIndicator={false}>

          {/* Status toggle */}
          <View style={modal.row}>
            {(["sold", "holding"] as const).map((s) => (
              <Pressable
                key={s}
                onPress={() => setStatus(s)}
                style={[modal.toggleBtn, status === s && modal.toggleActive]}
              >
                <Text style={[modal.toggleText, status === s && { color: "white" }]}>
                  {s === "sold" ? "✅ Sold" : "⏳ Still Holding"}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={modal.field}>
            <Text style={modal.label}>Item name</Text>
            <TextInput value={itemName} onChangeText={setItemName} placeholder="e.g. Jordan 4 Retro Black Cat" placeholderTextColor="rgba(255,255,255,0.3)" style={modal.input} />
          </View>

          <View style={modal.row}>
            <View style={[modal.field, { flex: 1 }]}>
              <Text style={modal.label}>Bought for</Text>
              <View style={modal.priceWrap}>
                <Text style={modal.prefix}>$</Text>
                <TextInput value={boughtPrice} onChangeText={setBoughtPrice} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="rgba(255,255,255,0.3)" style={modal.priceInput} />
              </View>
            </View>
            {status === "sold" && (
              <View style={[modal.field, { flex: 1 }]}>
                <Text style={modal.label}>Sold for</Text>
                <View style={modal.priceWrap}>
                  <Text style={modal.prefix}>$</Text>
                  <TextInput value={soldPrice} onChangeText={setSoldPrice} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="rgba(255,255,255,0.3)" style={modal.priceInput} />
                </View>
              </View>
            )}
          </View>

          <View style={modal.field}>
            <Text style={modal.label}>Platform</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {PLATFORMS.map((p) => (
                <Pressable key={p} onPress={() => setPlatform(p)} style={[modal.chip, platform === p && modal.chipActive]}>
                  <Text style={[modal.chipText, platform === p && { color: "white" }]}>{p}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={modal.field}>
            <Text style={modal.label}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {CATEGORIES.map((c) => (
                <Pressable key={c} onPress={() => setCategory(c)} style={[modal.chip, category === c && modal.chipActive]}>
                  <Text style={[modal.chipText, category === c && { color: "white" }]}>{c}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={modal.field}>
            <Text style={modal.label}>Notes <Text style={{ opacity: 0.4 }}>(optional)</Text></Text>
            <TextInput value={notes} onChangeText={setNotes} placeholder="Condition, where you found it..." placeholderTextColor="rgba(255,255,255,0.3)" style={[modal.input, { height: 60 }]} multiline />
          </View>

          {/* Profit preview */}
          {status === "sold" && boughtPrice && soldPrice ? (() => {
            const bp = parseFloat(boughtPrice), sp = parseFloat(soldPrice);
            if (!Number.isFinite(bp) || !Number.isFinite(sp)) return null;
            const profit = sp - bp;
            const roi = bp > 0 ? (profit / bp) * 100 : 0;
            return (
              <View style={[modal.profitPreview, { borderColor: SCORE_COLOR(roi) + "40" }]}>
                <Text style={[modal.profitAmt, { color: SCORE_COLOR(roi) }]}>
                  {profit >= 0 ? "+" : ""}{fmt(profit)} profit
                </Text>
                <Text style={modal.profitRoi}>{pct(roi)} ROI</Text>
              </View>
            );
          })() : null}

          <Pressable onPress={handleSave} style={modal.saveBtn}>
            <Text style={modal.saveBtnText}>Save Flip</Text>
          </Pressable>
        </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Mark Sold Modal ──────────────────────────────────────────────────────────

function MarkSoldModal({ flip, onClose, onSave }: {
  flip: PLFlip | null;
  onClose: () => void;
  onSave: (id: string, soldPrice: number) => void;
}) {
  const [price, setPrice] = useState("");
  if (!flip) return null;
  return (
    <Modal visible={!!flip} animationType="fade" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: SP.xl }}>
        <View style={{ backgroundColor: "#111", borderRadius: R.lg, padding: SP.lg, gap: SP.md, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}>
          <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>Mark as Sold</Text>
          <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{flip.itemName}</Text>
          <View style={modal.priceWrap}>
            <Text style={modal.prefix}>$</Text>
            <TextInput value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="Sold price" placeholderTextColor="rgba(255,255,255,0.3)" style={modal.priceInput} autoFocus />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={onClose} style={{ flex: 1, padding: 12, borderRadius: R.pill, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center" }}>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontWeight: "600" }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                const sp = parseFloat(price);
                if (!Number.isFinite(sp) || sp <= 0) { Alert.alert("Enter a valid price"); return; }
                onSave(flip.id, sp);
                onClose();
              }}
              style={{ flex: 1, padding: 12, borderRadius: R.pill, backgroundColor: "rgba(80,255,150,0.18)", alignItems: "center" }}
            >
              <Text style={{ color: "#50ff96", fontWeight: "700" }}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main PLTracker ───────────────────────────────────────────────────────────

export function PLTracker({ flips, onAdd, onDelete, onMarkSold, isNet = false, onToggleNet }: PLTrackerProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [markSoldFlip, setMarkSoldFlip] = useState<PLFlip | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [chartW, setChartW] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const chartShareRef = useRef<View>(null);

  const drawProg   = useSharedValue(0);
  const stats      = computeStats(flips, isNet);
  const displayFlips = showAll ? flips : flips.slice(0, 5);

  const handleSharePath = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    Feedback.save();
    try {
      const uri = await captureRef(chartShareRef, { format: "png", quality: 0.95 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          dialogTitle: "My Flip P&L Path — Evan AI",
          mimeType: "image/png",
        });
        Feedback.sold();
      }
    } catch {}
    setSharing(false);
  }, [sharing]);

  const profitPts  = useMemo(
    () => buildProfitPoints(flips, chartW),
    [flips, chartW],
  );

  const ghostPath = useMemo(() => buildGhostPath(chartW), [chartW]);

  useEffect(() => {
    if (profitPts.length >= 2 && chartW > 0) {
      drawProg.value = 0;
      drawProg.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profitPts.length, chartW]);

  const handleDelete = (id: string) => {
    Alert.alert("Delete flip?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        onDelete(id);
      }},
    ]);
  };

  // Haptic-wrapped callbacks
  const handleAdd = (flip: PLFlip) => {
    Feedback.save();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onAdd(flip);
  };

  const handleMarkSold = (id: string, soldPrice: number) => {
    Feedback.sold();
    onMarkSold(id, soldPrice);
  };

  const handleExportCSV = useCallback(async () => {
    if (exporting || flips.length === 0) return;
    setExporting(true);
    Feedback.save();
    try {
      const header = "Date,Item,Status,Buy Price,Sell Price,Net Profit,Platform,Category\n";
      const rows = flips.map((f) => {
        const sell = f.soldPrice != null ? f.soldPrice.toFixed(2) : "";
        const profit = f.soldPrice != null
          ? (netSell(f.soldPrice, isNet) - f.boughtPrice).toFixed(2)
          : "";
        return `"${isoToDisplay(f.date)}","${f.itemName.replace(/"/g, "'")}","${f.status}",${f.boughtPrice.toFixed(2)},${sell},${profit},"${f.platform}","${f.category}"`;
      }).join("\n");
      const csv = header + rows;
      const uri = `${FileSystem.documentDirectory}evan_flips_${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "text/csv",
          dialogTitle: "Export Flip P&L — Evan AI",
          UTI: "public.comma-separated-values-text",
        });
        Feedback.sold();
      }
    } catch {}
    setExporting(false);
  }, [flips, isNet, exporting]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerBadge}>
          <Ionicons name="trending-up" size={13} color="#ffd060" />
          <Text style={styles.headerBadgeText}>Flip P&amp;L</Text>
        </View>
        {/* NET toggle */}
        {onToggleNet ? (
          <Pressable
            onPress={onToggleNet}
            style={({ pressed }) => [styles.netToggle, isNet && styles.netToggleOn, pressed && { opacity: 0.7 }]}
          >
            <Text style={[styles.netToggleText, isNet && styles.netToggleTextOn]}>NET</Text>
          </Pressable>
        ) : null}
        {/* CSV Export */}
        {flips.length > 0 ? (
          <Pressable
            onPress={handleExportCSV}
            style={({ pressed }) => [styles.addBtn, { backgroundColor: "rgba(130,200,255,0.10)", borderColor: "rgba(130,200,255,0.25)" }, pressed && { opacity: 0.7 }, exporting && { opacity: 0.4 }]}
          >
            <Ionicons name="download-outline" size={13} color="#82c8ff" />
            <Text style={[styles.addBtnText, { color: "#82c8ff" }]}>CSV</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => setAddOpen(true)}
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="add" size={14} color="#50ff96" />
          <Text style={styles.addBtnText}>Log flip</Text>
        </Pressable>
      </View>

      {/* Stats row */}
      {flips.length > 0 && (
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={[styles.statVal, { color: stats.totalProfit >= 0 ? (isNet ? "#00d4a0" : "#50ff96") : "#ff5050" }]}>
              {stats.totalProfit >= 0 ? "+" : ""}{fmt(stats.totalProfit)}
            </Text>
            <Text style={styles.statLabel}>{isNet ? "Net Profit" : "Total Profit"}</Text>
            {isNet ? <Text style={styles.netCaption}>after fees</Text> : null}
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={[styles.statVal, { color: SCORE_COLOR(stats.avgROI) }]}>
              {pct(stats.avgROI)}
            </Text>
            <Text style={styles.statLabel}>Avg ROI</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={[styles.statVal, { color: "#82c8ff" }]}>{stats.flipCount}</Text>
            <Text style={styles.statLabel}>Flips</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={[styles.statVal, { color: "#ffd060" }]}>
              {stats.yearProfit >= 0 ? "+" : ""}{fmt(stats.yearProfit)}
            </Text>
            <Text style={styles.statLabel}>{new Date().getFullYear()}</Text>
          </View>
        </View>
      )}

      {/* Profit Path Chart */}
      <View
        ref={chartShareRef}
        collapsable={false}
        style={styles.chartShareWrap}
        onLayout={(e) => setChartW(e.nativeEvent.layout.width)}
      >
        {chartW > 0 && profitPts.length >= 2 ? (
          <>
            <View style={styles.profitChartHeader}>
              <Text style={styles.profitChartLabel}>PROFIT PATH</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={[styles.profitChartTotal, { color: stats.totalProfit >= 0 ? "#50ff96" : "#ff5050" }]}>
                  {stats.totalProfit >= 0 ? "+" : ""}{fmt(stats.totalProfit)} cumulative
                </Text>
                <Pressable
                  onPress={handleSharePath}
                  hitSlop={8}
                  style={({ pressed }) => [styles.chartShareBtn, pressed && { opacity: 0.6 }, sharing && { opacity: 0.4 }]}
                >
                  <Ionicons name="share-outline" size={12} color="rgba(80,255,150,0.7)" />
                </Pressable>
              </View>
            </View>
            <ProfitPathChart pts={profitPts} width={chartW} drawProg={drawProg} />
            <View style={styles.profitChartFooter}>
              <Text style={styles.profitChartDate}>{isoToDisplay(profitPts[0].date)}</Text>
              <Text style={styles.profitChartDate}>{isoToDisplay(profitPts[profitPts.length - 1].date)}</Text>
            </View>
            <Text style={styles.chartShareCredit}>Calculated by Evan AI · Total Flip Value {fmt(stats.totalProfit)}</Text>
          </>
        ) : chartW > 0 && ghostPath ? (
          /* Ghost Path — blank state becomes an opportunity screen */
          <View style={styles.ghostWrap}>
            <Canvas style={{ width: chartW, height: PCHART_CANVAS_H }}>
              <Path
                path={ghostPath}
                style="stroke"
                strokeWidth={1.8}
                strokeCap="round"
                opacity={0.30}
                color="rgba(255,255,255,0.65)"
              />
            </Canvas>
            <View style={styles.ghostPill}>
              <Text style={styles.ghostPillText}>AVG RESELLER ROI: 42% · READY TO START?</Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* Holding summary */}
      {stats.holding > 0 && (
        <View style={styles.holdingBanner}>
          <Ionicons name="time-outline" size={12} color="#ffd060" />
          <Text style={styles.holdingText}>
            {stats.holding} item{stats.holding !== 1 ? "s" : ""} in inventory · ${stats.holdingValue.toFixed(0)} invested
          </Text>
        </View>
      )}

      {/* Best flip callout */}
      {stats.bestFlip && (
        <View style={styles.bestFlipRow}>
          <Ionicons name="trophy-outline" size={12} color="#ffd060" />
          <Text style={styles.bestFlipText} numberOfLines={1}>
            Best: {stats.bestFlip.itemName} · +{fmt(stats.bestFlip.soldPrice! - stats.bestFlip.boughtPrice)}
          </Text>
        </View>
      )}

      {/* Empty state */}
      {flips.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No flips logged yet</Text>
          <Text style={styles.emptySub}>Tap &quot;Log flip&quot; after every sale. Track your real P&amp;L.</Text>
        </View>
      )}

      {/* Flip list */}
      {displayFlips.map((flip) => {
        const profit = flip.soldPrice != null ? netSell(flip.soldPrice, isNet) - flip.boughtPrice : null;
        const roi = profit != null && flip.boughtPrice > 0 ? (profit / flip.boughtPrice) * 100 : null;
        const color = roi != null ? SCORE_COLOR(roi) : "#82c8ff";
        return (
          <View key={flip.id} style={[styles.flipRow, { borderLeftColor: color }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.flipName} numberOfLines={1}>{flip.itemName}</Text>
              <Text style={styles.flipMeta}>
                {flip.platform} · {isoToDisplay(flip.date)}
                {flip.status === "holding" ? " · ⏳ holding" : ""}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 2 }}>
              {profit != null ? (
                <>
                  <Text style={[styles.flipProfit, { color }]}>
                    {profit >= 0 ? "+" : ""}{fmt(profit)}
                  </Text>
                  <Text style={[styles.flipRoi, { color }]}>{pct(roi!)}</Text>
                </>
              ) : (
                <Text style={styles.flipHolding}>${flip.boughtPrice.toFixed(0)} in</Text>
              )}
            </View>
            <View style={styles.flipActions}>
              {flip.status === "holding" && (
                <Pressable onPress={() => setMarkSoldFlip(flip)} hitSlop={8} style={styles.actionBtn}>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#50ff96" />
                </Pressable>
              )}
              <Pressable onPress={() => handleDelete(flip.id)} hitSlop={8} style={styles.actionBtn}>
                <Ionicons name="trash-outline" size={16} color="rgba(255,80,80,0.6)" />
              </Pressable>
            </View>
          </View>
        );
      })}

      {/* Show more */}
      {flips.length > 5 && (
        <Pressable onPress={() => setShowAll((v) => !v)} style={styles.showMoreBtn}>
          <Text style={styles.showMoreText}>
            {showAll ? "Show less" : `Show all ${flips.length} flips`}
          </Text>
          <Ionicons name={showAll ? "chevron-up" : "chevron-down"} size={12} color="rgba(255,255,255,0.4)" />
        </Pressable>
      )}

      <AddFlipModal visible={addOpen} onClose={() => setAddOpen(false)} onSave={handleAdd} />
      <MarkSoldModal flip={markSoldFlip} onClose={() => setMarkSoldFlip(null)} onSave={handleMarkSold} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginTop: SP.md,
    padding: SP.md,
    borderRadius: R.md,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,200,0,0.18)",
    gap: SP.sm,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: SP.sm },
  headerBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(255,200,0,0.10)",
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: R.pill,
  },
  headerBadgeText: { ...TY.label, fontSize: 11, fontWeight: "700", color: "#ffd060" },
  addBtn: {
    marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(80,255,150,0.10)", borderWidth: 1, borderColor: "rgba(80,255,150,0.22)",
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.pill,
  },
  addBtnText: { ...TY.label, fontSize: 11, fontWeight: "700", color: "#50ff96" },
  netToggle: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  netToggleOn: {
    backgroundColor: "rgba(0,212,160,0.14)", borderColor: "rgba(0,212,160,0.38)",
  },
  netToggleText: { fontSize: 10, fontWeight: "900", letterSpacing: 1.2, color: "rgba(255,255,255,0.45)" },
  netToggleTextOn: { color: "#00d4a0" },
  netCaption: { fontSize: 8, color: "#00d4a0", fontWeight: "600", letterSpacing: 0.3, marginTop: -1 },
  statsRow: { flexDirection: "row", alignItems: "center" },
  statBox: { flex: 1, alignItems: "center", gap: 2 },
  statVal: { fontSize: 16, fontWeight: "900" },
  statLabel: { ...TY.cap, color: "rgba(255,255,255,0.4)", fontSize: 9, textTransform: "uppercase" },
  statDivider: { width: 1, height: 28, backgroundColor: "rgba(255,255,255,0.08)" },
  holdingBanner: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(255,200,0,0.07)", borderRadius: R.sm,
    paddingHorizontal: 8, paddingVertical: 5,
  },
  holdingText: { ...TY.cap, color: "#ffd060", fontSize: 10 },
  bestFlipRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  bestFlipText: { ...TY.cap, color: "rgba(255,255,255,0.45)", fontSize: 10, flex: 1 },
  emptyState: { alignItems: "center", paddingVertical: SP.md, gap: 4 },
  emptyTitle: { ...TY.label, color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "700" },
  emptySub: { ...TY.cap, color: "rgba(255,255,255,0.3)", fontSize: 11, textAlign: "center" },
  flipRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderLeftWidth: 2, paddingLeft: 8,
    paddingVertical: 6,
  },
  flipName: { ...TY.label, color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "700" },
  flipMeta: { ...TY.cap, color: "rgba(255,255,255,0.35)", fontSize: 10, marginTop: 1 },
  flipProfit: { fontSize: 14, fontWeight: "900" },
  flipRoi: { ...TY.cap, fontSize: 9, fontWeight: "700" },
  flipHolding: { ...TY.cap, color: "#82c8ff", fontSize: 11, fontWeight: "700" },
  flipActions: { flexDirection: "row", gap: 2 },
  actionBtn: { padding: 4 },
  showMoreBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 4, paddingVertical: 4,
  },
  showMoreText: { ...TY.cap, color: "rgba(255,255,255,0.4)", fontSize: 10 },

  // ── Profit Path chart ────────────────────────────────────────────────────
  chartShareWrap: {
    minHeight: 4, // always renders so onLayout fires
    backgroundColor: "rgba(0,0,0,0.01)", // ensures captureRef sees the view
    borderRadius: R.sm,
    padding: 2,
  },
  chartShareBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(80,255,150,0.08)",
    borderWidth: 1,
    borderColor: "rgba(80,255,150,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  chartShareCredit: {
    ...TY.cap,
    fontSize: 8,
    color: "rgba(255,255,255,0.20)",
    textAlign: "center",
    marginTop: 2,
    letterSpacing: 0.4,
  },
  profitChartHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  profitChartLabel: {
    ...TY.cap,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: "rgba(80,255,150,0.45)",
    textTransform: "uppercase",
  },
  profitChartTotal: {
    ...TY.cap,
    fontSize: 10,
    fontWeight: "800",
  },
  profitChartFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
  },
  profitChartDate: {
    ...TY.cap,
    fontSize: 9,
    color: "rgba(255,255,255,0.25)",
  },

  // ── Ghost chart (empty state) ─────────────────────────────────────────────
  ghostWrap: {
    position: "relative",
    alignItems: "center",
  },
  ghostPill: {
    position: "absolute",
    top: "35%",
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: R.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  ghostPillText: {
    ...TY.cap,
    fontSize: 8.5,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: "rgba(255,255,255,0.55)",
    textTransform: "uppercase",
  },
});

const modal = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#0a0a0a" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: SP.lg, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  title: { color: "white", fontWeight: "900", fontSize: 18 },
  field: { gap: 6 },
  label: { ...TY.cap, color: "rgba(255,255,255,0.5)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 },
  row: { flexDirection: "row", gap: 10 },
  input: {
    backgroundColor: "rgba(255,255,255,0.06)", borderRadius: R.sm, borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)", color: "white", fontSize: 16,
    fontWeight: "600", padding: 12,
  },
  priceWrap: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)", borderRadius: R.sm, borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)", paddingHorizontal: 10,
  },
  prefix: { color: "rgba(255,255,255,0.4)", fontSize: 16, fontWeight: "700", marginRight: 4 },
  priceInput: { flex: 1, color: "white", fontSize: 20, fontWeight: "800", paddingVertical: 10 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
  },
  chipActive: { backgroundColor: "rgba(255,255,255,0.15)", borderColor: "rgba(255,255,255,0.25)" },
  chipText: { ...TY.label, color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: "600" },
  toggleBtn: {
    flex: 1, padding: 12, borderRadius: R.sm, alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  toggleActive: { backgroundColor: "rgba(80,255,150,0.14)", borderColor: "rgba(80,255,150,0.28)" },
  toggleText: { ...TY.label, color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "700" },
  profitPreview: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 12, borderRadius: R.sm, borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  profitAmt: { fontSize: 20, fontWeight: "900" },
  profitRoi: { ...TY.cap, color: "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: "700" },
  saveBtn: {
    backgroundColor: "rgba(80,255,150,0.18)", borderRadius: R.pill,
    borderWidth: 1, borderColor: "rgba(80,255,150,0.30)",
    padding: 16, alignItems: "center", marginTop: SP.sm,
  },
  saveBtnText: { color: "#50ff96", fontSize: 16, fontWeight: "900" },
});
