/**
 * ScanHistoryScreen — closed-loop scan history.
 * Shows each scan's decision, source, and outcome status.
 * Allows recording a sale outcome directly from the list.
 *
 * Connects to GET /scan/history/:userId (Phase 1 closed-loop engine).
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated as RNAnimated,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, SP, R, TY, IOS, verdictStyle, fmtMoney } from "../design/DS";
import { PressableScale } from "../primitives/PressableScale";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LoopDecision {
  decision: "BUY" | "PASS" | "UNDECIDED";
  wasOverride: boolean;
  decidedAt: number;
}

interface LoopSource {
  purchasePrice: number;
  askPrice: number | null;
  sourceType: string;
  city: string;
  capturedAt: number;
}

interface LoopOutcome {
  soldPrice: number | null;
  platform: string | null;
  netProfit: number | null;
  timeToSale: number | null;
  outcomeStatus: "SOLD" | "UNSOLD" | "RETURNED";
  updatedAt: number;
}

interface ScanRecord {
  scanId: string;
  itemName: string | null;
  category: string | null;
  signal: string | null;
  trustScore: number | null;
  ts: number | null;
  decision: LoopDecision | null;
  source: LoopSource | null;
  outcome: LoopOutcome | null;
}

interface ScanHistoryScreenProps {
  visible: boolean;
  userId: string | null;
  apiBase: string;
  onClose: () => void;
}

// ─── Platforms for outcome recording ──────────────────────────────────────────

const PLATFORMS = ["eBay", "Poshmark", "Mercari", "Facebook", "Depop", "Craigslist", "In Person", "Other"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAge(ts: number | null): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  < 7)  return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function decisionLabel(decision: LoopDecision | null): { text: string; color: string } {
  if (!decision) return { text: "PENDING", color: C.text4 };
  if (decision.decision === "BUY")       return { text: "BOUGHT", color: C.good };
  if (decision.decision === "PASS")      return { text: "PASSED", color: C.text3 };
  return { text: "UNDECIDED", color: C.warn };
}

function outcomeLabel(outcome: LoopOutcome | null): { text: string; color: string } | null {
  if (!outcome) return null;
  if (outcome.outcomeStatus === "SOLD")     return { text: "SOLD", color: C.good };
  if (outcome.outcomeStatus === "RETURNED") return { text: "RETURNED", color: C.warn };
  return { text: "UNSOLD", color: C.danger };
}

// ─── Outcome sheet ────────────────────────────────────────────────────────────

function OutcomeSheet({
  visible,
  scanId,
  userId,
  itemName,
  apiBase,
  onClose,
  onComplete,
}: {
  visible: boolean;
  scanId: string;
  userId: string;
  itemName: string | null;
  apiBase: string;
  onClose: () => void;
  onComplete: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [status, setStatus]         = useState<"SOLD" | "UNSOLD" | "RETURNED">("SOLD");
  const [soldPrice, setSoldPrice]   = useState("");
  const [platform, setPlatform]     = useState("eBay");
  const [fees, setFees]             = useState("");
  const [shipping, setShipping]     = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (status === "SOLD") {
      const sp = parseFloat(soldPrice);
      if (!Number.isFinite(sp) || sp <= 0) {
        setError("Enter the price you sold it for");
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, any> = { scanId, userId, outcomeStatus: status };
      if (status === "SOLD") {
        body.soldPrice    = parseFloat(soldPrice);
        body.platform     = platform;
        const f = parseFloat(fees);
        const s = parseFloat(shipping);
        if (Number.isFinite(f) && f >= 0) body.fees = f;
        if (Number.isFinite(s) && s >= 0) body.shippingCost = s;
      }
      const res = await fetch(`${apiBase}/scan/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Server error ${res.status}`);
      }
      onComplete();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Couldn't save — try again");
      setLoading(false);
    }
  }, [scanId, userId, apiBase, status, soldPrice, platform, fees, shipping, onComplete, onClose]);

  if (!visible) return null;

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose} presentationStyle="overFullScreen">
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, SP.xl) + SP.md }]}>
          {IOS ? <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} /> : null}
          <View style={styles.sheetBg} />
          <View style={styles.handle} />

          {itemName ? (
            <Text numberOfLines={1} style={styles.contextName}>{itemName}</Text>
          ) : null}
          <Text style={styles.sheetTitle}>Record sale outcome</Text>

          {/* Status */}
          <View style={styles.statusRow}>
            {(["SOLD", "UNSOLD", "RETURNED"] as const).map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => setStatus(s)}
                style={[styles.statusChip, status === s && styles.statusChipActive]}
                activeOpacity={0.7}
              >
                <Text style={[styles.statusChipText, status === s && styles.statusChipTextActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {status === "SOLD" ? (
            <>
              {/* Sold price */}
              <Text style={styles.inputLabel}>SOLD FOR</Text>
              <View style={styles.inputField}>
                <Text style={styles.dollarSign}>$</Text>
                <TextInput
                  style={styles.priceInput}
                  value={soldPrice}
                  onChangeText={setSoldPrice}
                  placeholder="0.00"
                  placeholderTextColor={C.text4}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  selectTextOnFocus
                />
              </View>

              {/* Platform */}
              <Text style={[styles.inputLabel, { marginTop: SP.sm }]}>PLATFORM</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.platformRow}
                style={styles.platformScroll}
              >
                {PLATFORMS.map((p) => (
                  <TouchableOpacity
                    key={p}
                    onPress={() => setPlatform(p)}
                    style={[styles.sourceChip, platform === p && styles.sourceChipActive]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.sourceChipText, platform === p && styles.sourceChipTextActive]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Fees + Shipping */}
              <View style={styles.priceRow}>
                <View style={styles.priceHalf}>
                  <Text style={styles.inputLabel}>FEES (OPT)</Text>
                  <View style={styles.inputField}>
                    <Text style={styles.dollarSign}>$</Text>
                    <TextInput
                      style={styles.priceInput}
                      value={fees}
                      onChangeText={setFees}
                      placeholder="0.00"
                      placeholderTextColor={C.text4}
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                      selectTextOnFocus
                    />
                  </View>
                </View>
                <View style={styles.priceHalf}>
                  <Text style={styles.inputLabel}>SHIPPING (OPT)</Text>
                  <View style={styles.inputField}>
                    <Text style={styles.dollarSign}>$</Text>
                    <TextInput
                      style={styles.priceInput}
                      value={shipping}
                      onChangeText={setShipping}
                      placeholder="0.00"
                      placeholderTextColor={C.text4}
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                      selectTextOnFocus
                    />
                  </View>
                </View>
              </View>
            </>
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <PressableScale onPress={handleSubmit} style={styles.submitBtn} scale={0.96} haptic disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Text style={styles.submitText}>Save outcome</Text>
            )}
          </PressableScale>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  const opacity = React.useRef(new RNAnimated.Value(0.4)).current;
  React.useEffect(() => {
    RNAnimated.loop(RNAnimated.sequence([
      RNAnimated.timing(opacity, { toValue: 0.85, duration: 700, useNativeDriver: true }),
      RNAnimated.timing(opacity, { toValue: 0.4,  duration: 700, useNativeDriver: true }),
    ])).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <RNAnimated.View style={[styles.card, { opacity }]}>
      <View style={styles.cardBody}>
        <View style={[styles.skel, { width: "55%", marginBottom: SP.xs }]} />
        <View style={[styles.skel, { width: "35%", height: 10 }]} />
      </View>
      <View style={[styles.skel, { width: 52, height: 22, borderRadius: R.pill }]} />
    </RNAnimated.View>
  );
}

// ─── Scan card ────────────────────────────────────────────────────────────────

function ScanCard({
  item,
  userId,
  apiBase,
  onOutcomeRecorded,
}: {
  item: ScanRecord;
  userId: string;
  apiBase: string;
  onOutcomeRecorded: () => void;
}) {
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const dl = decisionLabel(item.decision);
  const ol = outcomeLabel(item.outcome);
  const vs = item.signal ? verdictStyle(item.signal) : null;
  const canRecordOutcome = item.decision?.decision === "BUY" && !item.outcome;

  return (
    <>
      <View style={styles.card}>
        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={1}>
            {item.itemName || item.category || "Scan"}
          </Text>
          <View style={styles.cardMetaRow}>
            {/* Signal badge */}
            {vs && item.signal ? (
              <View style={[styles.signalBadge, { backgroundColor: vs.bg, borderColor: vs.border }]}>
                <Text style={[styles.signalText, { color: vs.text }]} numberOfLines={1}>
                  {item.signal.replace("STRONG ", "★ ")}
                </Text>
              </View>
            ) : null}
            <Text style={styles.cardMeta}>{formatAge(item.ts)}</Text>
          </View>
          {/* Source info if bought */}
          {item.source ? (
            <Text style={styles.sourceInfo}>
              {item.source.sourceType} · {item.source.city} · {fmtMoney(item.source.purchasePrice)} paid
            </Text>
          ) : null}
          {/* Outcome profit if sold */}
          {item.outcome?.outcomeStatus === "SOLD" && item.outcome.netProfit != null ? (
            <Text style={[
              styles.profitLine,
              { color: item.outcome.netProfit >= 0 ? C.good : C.danger },
            ]}>
              {item.outcome.netProfit >= 0 ? "+" : ""}{fmtMoney(item.outcome.netProfit)} profit
            </Text>
          ) : null}
        </View>

        <View style={styles.cardRight}>
          {/* Decision badge */}
          <View style={[styles.decisionBadge, { borderColor: dl.color + "44" }]}>
            <Text style={[styles.decisionText, { color: dl.color }]}>{dl.text}</Text>
          </View>
          {/* Outcome badge or CTA */}
          {ol ? (
            <View style={[styles.outcomeBadge, { borderColor: ol.color + "44" }]}>
              <Text style={[styles.outcomeText, { color: ol.color }]}>{ol.text}</Text>
            </View>
          ) : canRecordOutcome ? (
            <TouchableOpacity
              onPress={() => setOutcomeOpen(true)}
              style={styles.recordOutcomeBtn}
              activeOpacity={0.75}
            >
              <Text style={styles.recordOutcomeText}>Record sale</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {outcomeOpen ? (
        <OutcomeSheet
          visible={outcomeOpen}
          scanId={item.scanId}
          userId={userId}
          itemName={item.itemName}
          apiBase={apiBase}
          onClose={() => setOutcomeOpen(false)}
          onComplete={() => { setOutcomeOpen(false); onOutcomeRecorded(); }}
        />
      ) : null}
    </>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ScanHistoryScreen({
  visible,
  userId,
  apiBase,
  onClose,
}: ScanHistoryScreenProps) {
  const insets = useSafeAreaInsets();
  const [scans, setScans]       = useState<ScanRecord[]>([]);
  const [loading, setLoading]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const fetchHistory = useCallback(async (isRefresh = false) => {
    if (!userId) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/scan/history/${encodeURIComponent(userId)}?limit=50`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setScans(Array.isArray(data.scans) ? data.scans : []);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load history");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, apiBase]);

  useEffect(() => {
    if (visible && userId) fetchHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, userId]);

  if (!visible) return null;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {IOS ? <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} /> : null}
      <View style={styles.bg} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + SP.lg }]}>
        <Text style={styles.headerTitle}>Scan History</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>Done</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.listContent}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>⚠️</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity onPress={() => fetchHistory()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : scans.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>📷</Text>
          <Text style={styles.emptyTitle}>No decisions yet</Text>
          <Text style={styles.emptyText}>
            After scanning, tap &quot;Bought it&quot; in the dock to start tracking.
          </Text>
        </View>
      ) : (
        <FlatList
          data={scans}
          keyExtractor={(item) => item.scanId}
          renderItem={({ item }) => (
            <ScanCard
              item={item}
              userId={userId!}
              apiBase={apiBase}
              onOutcomeRecorded={() => fetchHistory(true)}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchHistory(true)}
              tintColor={C.text3}
            />
          }
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    overflow: "hidden",
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(6,6,6,0.96)",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SP.xl,
    paddingBottom: SP.lg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: {
    ...TY.h2,
    color: C.text,
  },
  closeBtn: {
    paddingVertical: SP.xs,
    paddingHorizontal: SP.md,
    backgroundColor: C.s2,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.border,
  },
  closeBtnText: {
    ...TY.label,
    color: C.text2,
  },

  listContent: {
    padding: SP.lg,
    gap: SP.sm,
  },

  // ── Card ───────────────────────────────────────────────────────────────────
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: C.s1,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: SP.md,
    gap: SP.sm,
  },
  cardBody: {
    flex: 1,
  },
  cardName: {
    ...TY.bodyBold,
    color: C.text,
    marginBottom: SP.xs,
  },
  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
    flexWrap: "wrap",
  },
  cardMeta: {
    ...TY.cap,
    color: C.text4,
  },
  signalBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: R.xs,
    borderWidth: 1,
  },
  signalText: {
    ...TY.cap,
    fontSize: 9,
  },
  sourceInfo: {
    ...TY.cap,
    color: C.text4,
    marginTop: SP.xs,
    textTransform: "uppercase",
  },
  profitLine: {
    ...TY.label,
    marginTop: SP.xs,
    fontWeight: "900",
  },

  cardRight: {
    alignItems: "flex-end",
    gap: SP.xs,
    flexShrink: 0,
  },
  decisionBadge: {
    paddingHorizontal: SP.sm,
    paddingVertical: 3,
    borderRadius: R.pill,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  decisionText: {
    ...TY.cap,
    fontSize: 9,
    fontWeight: "900",
  },
  outcomeBadge: {
    paddingHorizontal: SP.sm,
    paddingVertical: 3,
    borderRadius: R.pill,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  outcomeText: {
    ...TY.cap,
    fontSize: 9,
    fontWeight: "900",
  },
  recordOutcomeBtn: {
    paddingHorizontal: SP.sm,
    paddingVertical: 3,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: "rgba(0,210,120,0.30)",
    backgroundColor: "rgba(0,210,120,0.08)",
  },
  recordOutcomeText: {
    ...TY.cap,
    fontSize: 9,
    color: "rgba(120,255,160,0.85)",
    fontWeight: "900",
  },

  // ── Skeleton ───────────────────────────────────────────────────────────────
  skel: {
    height: 13,
    backgroundColor: C.s3,
    borderRadius: R.xs,
  },

  // ── Empty ──────────────────────────────────────────────────────────────────
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SP.xxxl,
  },
  emptyEmoji: {
    fontSize: 44,
    marginBottom: SP.lg,
    textAlign: "center",
  },
  emptyTitle: {
    ...TY.h2,
    color: C.text2,
    marginBottom: SP.sm,
    textAlign: "center",
  },
  emptyText: {
    ...TY.body,
    color: C.text3,
    textAlign: "center",
    lineHeight: 22,
  },
  retryBtn: {
    marginTop: SP.lg,
    paddingVertical: SP.sm,
    paddingHorizontal: SP.xl,
    backgroundColor: C.s2,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.border,
  },
  retryText: {
    ...TY.label,
    color: C.text2,
  },

  // ── OutcomeSheet ───────────────────────────────────────────────────────────
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    borderTopLeftRadius: R.xxl,
    borderTopRightRadius: R.xxl,
    paddingTop: SP.md,
    paddingHorizontal: SP.xl,
    overflow: "hidden",
    backgroundColor: IOS ? "transparent" : "rgba(10,10,10,0.98)",
  },
  sheetBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(8,8,8,0.92)",
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: R.pill,
    backgroundColor: C.s3,
    alignSelf: "center",
    marginBottom: SP.lg,
  },
  contextName: {
    ...TY.cap,
    color: C.text4,
    textAlign: "center",
    marginBottom: SP.sm,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  sheetTitle: {
    ...TY.h1,
    color: C.text,
    textAlign: "center",
    marginBottom: SP.xl,
  },

  // Status chips
  statusRow: {
    flexDirection: "row",
    gap: SP.sm,
    marginBottom: SP.lg,
  },
  statusChip: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SP.md,
    borderRadius: R.md,
    backgroundColor: C.s1,
    borderWidth: 1,
    borderColor: C.border,
  },
  statusChipActive: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderColor: C.borderStrong,
  },
  statusChipText: {
    ...TY.label,
    color: C.text3,
  },
  statusChipTextActive: {
    color: C.text,
  },

  // Price inputs
  inputLabel: {
    ...TY.cap,
    color: C.text4,
    marginBottom: SP.xs,
  },
  inputField: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.s1,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SP.md,
    height: 52,
    marginBottom: SP.sm,
  },
  dollarSign: {
    ...TY.h2,
    color: C.text3,
    marginRight: 4,
  },
  priceInput: {
    flex: 1,
    ...TY.h2,
    color: C.text,
    padding: 0,
  },
  priceRow: {
    flexDirection: "row",
    gap: SP.sm,
    marginBottom: SP.sm,
  },
  priceHalf: {
    flex: 1,
  },

  platformScroll: {
    marginHorizontal: -SP.xl,
    marginBottom: SP.lg,
  },
  platformRow: {
    paddingHorizontal: SP.xl,
    gap: SP.sm,
    flexDirection: "row",
  },
  sourceChip: {
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm,
    borderRadius: R.pill,
    backgroundColor: C.s1,
    borderWidth: 1,
    borderColor: C.border,
  },
  sourceChipActive: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderColor: C.borderStrong,
  },
  sourceChipText: {
    ...TY.label,
    color: C.text3,
  },
  sourceChipTextActive: {
    color: C.text,
  },

  errorText: {
    ...TY.label,
    color: C.danger,
    textAlign: "center",
    marginBottom: SP.sm,
  },
  submitBtn: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderRadius: R.lg,
    minHeight: 56,
  },
  submitText: {
    ...TY.bodyBold,
    color: "#000",
    fontSize: 16,
  },
});
