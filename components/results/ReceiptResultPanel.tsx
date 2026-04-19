/**
 * ReceiptResultPanel — full-screen receipt scan results overlay.
 *
 * Layout:
 *   Header: store name + date + total paid
 *   Per item: thumbnail emoji/icon | name | paid | market | delta pill
 *   Footer summary: "Paid $X · Market $Y · You overpaid/saved $Z"
 *   Action: "Add to history" / "Done"
 *
 * Each delta pill:
 *   Red   = you overpaid vs market
 *   Green = you got a deal
 *   Grey  = no market data
 */
import React, { useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { C, SP, R, TY, IOS, fmtMoney } from "../design/DS";

export interface ReceiptItem {
  name: string;
  qty: number;
  paid: number;
  category: string;
  marketPrice: number | null;
  /** paid - marketPrice  (positive = overpaid, negative = deal) */
  delta: number | null;
  overpaid: boolean;
}

export interface ReceiptData {
  store: string | null;
  date: string | null;
  items: ReceiptItem[];
  subtotal: number | null;
  tax: number | null;
  total: number | null;
}

interface ReceiptResultPanelProps {
  visible: boolean;
  loading: boolean;
  data: ReceiptData | null;
  error: string | null;
  onDone: () => void;
  onAddToHistory?: (items: ReceiptItem[]) => void;
}

function DeltaPill({ delta, paid }: { delta: number | null; paid: number }) {
  if (delta === null)
    return <Text style={styles.noDataText}>No market data</Text>;

  const pct = paid > 0 ? Math.abs(delta / paid) * 100 : 0;
  const isOver = delta > 1; // overpaid by more than $1

  return (
    <View
      style={[
        styles.deltaPill,
        {
          backgroundColor: isOver ? "rgba(255,80,80,0.12)" : "rgba(80,255,150,0.12)",
          borderColor: isOver ? "rgba(255,80,80,0.30)" : "rgba(80,255,150,0.30)",
        },
      ]}
    >
      <Ionicons
        name={isOver ? "trending-up" : "trending-down"}
        size={10}
        color={isOver ? "#ff5050" : "#50ff96"}
      />
      <Text
        style={[
          styles.deltaPillText,
          { color: isOver ? "#ff6060" : "#60ffa0" },
        ]}
      >
        {isOver ? "+" : "-"}
        {fmtMoney(Math.abs(delta))} ({Math.round(pct)}%{" "}
        {isOver ? "over" : "below"})
      </Text>
    </View>
  );
}

export function ReceiptResultPanel({
  visible,
  loading,
  data,
  error,
  onDone,
  onAddToHistory,
}: ReceiptResultPanelProps) {
  const totalPaid = data?.items.reduce((s, i) => s + (i.paid ?? 0), 0) ?? 0;
  const totalMarket = data?.items.reduce(
    (s, i) => s + (i.marketPrice ?? i.paid ?? 0),
    0,
  ) ?? 0;
  const netDelta = totalPaid - totalMarket;
  const hasMarketData = data?.items.some((i) => i.marketPrice !== null) ?? false;

  const handleAddToHistory = useCallback(() => {
    if (data?.items) onAddToHistory?.(data.items);
    onDone();
  }, [data, onAddToHistory, onDone]);

  return (
    <Modal
      visible={visible}
      animationType={IOS ? "slide" : "fade"}
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={onDone}
    >
      <View style={styles.backdrop}>
        {IOS ? <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFillObject} /> : null}
        <View style={styles.panel}>

          {/* ── Header ─────────────────────────────────────── */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.storeName} numberOfLines={1}>
                {data?.store ?? "Receipt Scan"}
              </Text>
              {data?.date ? (
                <Text style={styles.dateText}>{data.date}</Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={onDone} style={styles.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* ── Body ─────────────────────────────────────── */}
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={C.text3} />
              <Text style={styles.loadingText}>Analyzing receipt…</Text>
              <Text style={styles.loadingSub}>Looking up market prices for each item</Text>
            </View>
          ) : error ? (
            <View style={styles.loadingWrap}>
              <Ionicons name="alert-circle-outline" size={40} color="rgba(255,100,80,0.7)" />
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={onDone} style={styles.doneBtn}>
                <Text style={styles.doneBtnText}>Close</Text>
              </Pressable>
            </View>
          ) : data ? (
            <>
              <ScrollView
                style={styles.itemList}
                contentContainerStyle={{ paddingBottom: SP.xl }}
                showsVerticalScrollIndicator={false}
              >
                {data.items.map((item, i) => (
                  <View key={i} style={styles.itemRow}>
                    {/* Category icon */}
                    <View style={styles.categoryIcon}>
                      <Ionicons
                        name={categoryIcon(item.category)}
                        size={16}
                        color="rgba(255,255,255,0.35)"
                      />
                    </View>

                    {/* Item info */}
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={styles.itemName} numberOfLines={2}>
                        {item.qty > 1 ? `${item.qty}× ` : ""}
                        {item.name}
                      </Text>

                      {/* Price comparison row */}
                      <View style={styles.priceCompRow}>
                        <View style={styles.priceBlock}>
                          <Text style={styles.priceBlockLabel}>Paid</Text>
                          <Text style={styles.priceBlockValue}>
                            {fmtMoney(item.paid)}
                          </Text>
                        </View>
                        {item.marketPrice !== null ? (
                          <>
                            <Ionicons
                              name="arrow-forward"
                              size={10}
                              color="rgba(255,255,255,0.25)"
                            />
                            <View style={styles.priceBlock}>
                              <Text style={styles.priceBlockLabel}>Market</Text>
                              <Text style={[styles.priceBlockValue, { color: C.text2 }]}>
                                {fmtMoney(item.marketPrice)}
                              </Text>
                            </View>
                          </>
                        ) : null}
                      </View>

                      <DeltaPill delta={item.delta} paid={item.paid} />
                    </View>
                  </View>
                ))}
              </ScrollView>

              {/* ── Summary footer ─────────────────────────── */}
              {hasMarketData ? (
                <View style={styles.summaryBox}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Total paid</Text>
                    <Text style={styles.summaryValue}>{fmtMoney(totalPaid)}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Market value</Text>
                    <Text style={styles.summaryValue}>{fmtMoney(totalMarket)}</Text>
                  </View>
                  <View style={[styles.summaryRow, styles.summaryNetRow]}>
                    <Text style={styles.summaryNetLabel}>
                      {netDelta > 1 ? "Overpaid" : netDelta < -1 ? "Saved" : "Fair price"}
                    </Text>
                    <Text
                      style={[
                        styles.summaryNetValue,
                        {
                          color:
                            netDelta > 1
                              ? "#ff6060"
                              : netDelta < -1
                              ? "#60ffa0"
                              : C.text3,
                        },
                      ]}
                    >
                      {netDelta > 1 ? "+" : ""}
                      {fmtMoney(Math.abs(netDelta))}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* ── Actions ─────────────────────────────────── */}
              <View style={styles.actions}>
                {onAddToHistory ? (
                  <Pressable style={styles.addBtn} onPress={handleAddToHistory}>
                    <Ionicons name="bookmark-outline" size={15} color={C.text} />
                    <Text style={styles.addBtnText}>Add to history</Text>
                  </Pressable>
                ) : null}
                <Pressable style={styles.doneBtn} onPress={onDone}>
                  <Text style={styles.doneBtnText}>Done</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function categoryIcon(cat: string): any {
  switch ((cat || "").toLowerCase()) {
    case "electronics":  return "phone-portrait-outline";
    case "sneakers":
    case "clothing":
    case "shoes":        return "shirt-outline";
    case "food":         return "fast-food-outline";
    case "books":        return "book-outline";
    case "toys":         return "game-controller-outline";
    case "home":         return "home-outline";
    case "sports":       return "barbell-outline";
    default:             return "pricetag-outline";
  }
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.82)",
    justifyContent: "flex-end",
  },
  panel: {
    backgroundColor: "#111",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)",
    maxHeight: "92%",
    overflow: "hidden",
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: SP.lg,
    paddingBottom: SP.md,
    gap: SP.md,
  },
  storeName: {
    ...TY.h2,
    color: C.text,
    fontSize: 18,
  },
  dateText: {
    ...TY.label,
    color: C.text4,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginHorizontal: SP.lg,
  },

  // ── Loading / error ──────────────────────────────────────────────────────────
  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: SP.md,
  },
  loadingText: {
    ...TY.h2,
    color: C.text2,
    marginTop: SP.sm,
  },
  loadingSub: {
    ...TY.label,
    color: C.text4,
    textAlign: "center",
    paddingHorizontal: SP.xl,
  },
  errorText: {
    ...TY.label,
    color: "rgba(255,100,80,0.85)",
    textAlign: "center",
    paddingHorizontal: SP.xl,
  },

  // ── Item list ────────────────────────────────────────────────────────────────
  itemList: {
    marginTop: SP.md,
  },
  itemRow: {
    flexDirection: "row",
    gap: SP.md,
    paddingHorizontal: SP.lg,
    paddingVertical: SP.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  categoryIcon: {
    width: 36,
    height: 36,
    borderRadius: R.sm,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 2,
  },
  itemName: {
    ...TY.label,
    color: C.text,
    fontSize: 13,
    lineHeight: 18,
  },
  priceCompRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
  },
  priceBlock: {
    gap: 1,
  },
  priceBlockLabel: {
    ...TY.cap,
    color: C.text4,
    fontSize: 9,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  priceBlockValue: {
    ...TY.label,
    color: C.text,
    fontSize: 13,
  },
  deltaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: R.pill,
    borderWidth: 1,
  },
  deltaPillText: {
    ...TY.cap,
    fontSize: 9,
  },
  noDataText: {
    ...TY.cap,
    color: C.text4,
    fontSize: 9,
  },

  // ── Summary box ─────────────────────────────────────────────────────────────
  summaryBox: {
    marginHorizontal: SP.lg,
    marginTop: SP.md,
    padding: SP.md,
    borderRadius: R.md,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.09)",
    gap: SP.xs,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryNetRow: {
    marginTop: SP.xs,
    paddingTop: SP.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  summaryLabel: {
    ...TY.label,
    color: C.text3,
  },
  summaryValue: {
    ...TY.label,
    color: C.text2,
  },
  summaryNetLabel: {
    ...TY.label,
    color: C.text,
    fontWeight: "600",
  },
  summaryNetValue: {
    ...TY.label,
    fontWeight: "700",
    fontSize: 16,
  },

  // ── Actions ──────────────────────────────────────────────────────────────────
  actions: {
    flexDirection: "row",
    gap: SP.sm,
    padding: SP.lg,
    paddingBottom: SP.xl,
  },
  addBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SP.xs,
    paddingVertical: 13,
    borderRadius: R.md,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
  },
  addBtnText: {
    ...TY.label,
    color: C.text,
    fontWeight: "600",
  },
  doneBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: R.md,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.20)",
  },
  doneBtnText: {
    ...TY.label,
    color: C.text,
    fontWeight: "600",
  },
});
