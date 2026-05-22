/**
 * FlipCalculatorPanel — professional resale profit calculator.
 *
 * Features:
 *  - Platform selector: eBay · Poshmark · Mercari · StockX · Depop · FB Marketplace · OfferUp
 *  - Itemized fee breakdown: platform fee, payment processing, shipping, taxes
 *  - Net profit, ROI %, break-even price
 *  - Platform ranker: automatically ranks all platforms by net proceeds
 *  - Pre-fills buy price from scanned price; sell price from market best
 *
 * Fee structures (accurate as of 2025):
 *   eBay          13.25% + $0.30/order (most categories)
 *   Poshmark      <$15 → $2.95 flat; ≥$15 → 20%
 *   Mercari       10% + 2.9% payment processing
 *   StockX        9.5% + $13.95 authentication/shipping
 *   Depop         10% + 3.4% payment processing
 *   FB Marketplace 5% (min $0.40) shipped; 0% local
 *   OfferUp       12.9% shipped; 0% local
 */
import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  Switch,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { C, SP, R, TY, IOS, fmtMoney } from "../design/DS";

// ─── Platform definitions ─────────────────────────────────────────────────────

interface Platform {
  id: string;
  name: string;
  short: string;
  color: string;
  /** Compute net proceeds given sell price and shipping cost */
  netProceeds: (sellPrice: number, shippingCost: number, isLocal?: boolean) => number;
  /** Human-readable fee description */
  feeDesc: (sellPrice: number, isLocal?: boolean) => string;
  /** Best categories for this platform */
  bestFor: string;
  shippingTypical: number; // typical shipping cost seller pays
}

const PLATFORMS: Platform[] = [
  {
    id: "ebay",
    name: "eBay",
    short: "eBay",
    color: "#E53238",
    bestFor: "Electronics, collectibles, parts",
    shippingTypical: 8,
    netProceeds: (sell, ship) => {
      const platformFee = sell * 0.1325 + 0.30;
      return sell - platformFee - ship;
    },
    feeDesc: (sell) => {
      const fee = sell * 0.1325 + 0.30;
      return `13.25% + $0.30 = ${fmtMoney(fee)}`;
    },
  },
  {
    id: "poshmark",
    name: "Poshmark",
    short: "Posh",
    color: "#D3385C",
    bestFor: "Clothing, shoes, accessories",
    shippingTypical: 0, // seller doesn't pay shipping on Poshmark
    netProceeds: (sell) => {
      const fee = sell < 15 ? 2.95 : sell * 0.20;
      return sell - fee;
    },
    feeDesc: (sell) => {
      const fee = sell < 15 ? 2.95 : sell * 0.20;
      return sell < 15 ? `Flat $2.95 fee` : `20% = ${fmtMoney(fee)}`;
    },
  },
  {
    id: "mercari",
    name: "Mercari",
    short: "Merc",
    color: "#FF5851",
    bestFor: "General merchandise, toys, games",
    shippingTypical: 5,
    netProceeds: (sell, ship) => {
      const platformFee = sell * 0.10;
      const paymentFee  = sell * 0.029;
      return sell - platformFee - paymentFee - ship;
    },
    feeDesc: (sell) => {
      const fee = sell * 0.10 + sell * 0.029;
      return `10% + 2.9% processing = ${fmtMoney(fee)}`;
    },
  },
  {
    id: "stockx",
    name: "StockX",
    short: "StockX",
    color: "#18A84B",
    bestFor: "Sneakers, streetwear, luxury",
    shippingTypical: 0, // seller ships to StockX, StockX ships to buyer; fee covers it
    netProceeds: (sell) => {
      const sellerFee  = sell * 0.095;
      const authShip   = 13.95; // authentication + shipping flat
      return sell - sellerFee - authShip;
    },
    feeDesc: (sell) => {
      const fee = sell * 0.095 + 13.95;
      return `9.5% + $13.95 auth = ${fmtMoney(fee)}`;
    },
  },
  {
    id: "depop",
    name: "Depop",
    short: "Depop",
    color: "#FF4040",
    bestFor: "Vintage, streetwear, Gen-Z fashion",
    shippingTypical: 6,
    netProceeds: (sell, ship) => {
      const fee = sell * 0.10 + sell * 0.034;
      return sell - fee - ship;
    },
    feeDesc: (sell) => {
      const fee = sell * 0.10 + sell * 0.034;
      return `10% + 3.4% processing = ${fmtMoney(fee)}`;
    },
  },
  {
    id: "fbm",
    name: "FB Marketplace",
    short: "FB Mkt",
    color: "#1877F2",
    bestFor: "Furniture, appliances, local deals",
    shippingTypical: 0,
    netProceeds: (sell, _ship, isLocal) => {
      if (isLocal) return sell;
      const fee = Math.max(sell * 0.05, 0.40);
      return sell - fee;
    },
    feeDesc: (sell, isLocal) => {
      if (isLocal) return "0% for local pickup";
      const fee = Math.max(sell * 0.05, 0.40);
      return `5% (min $0.40) = ${fmtMoney(fee)}`;
    },
  },
  {
    id: "offerup",
    name: "OfferUp",
    short: "OfferUp",
    color: "#12B347",
    bestFor: "Local deals, electronics, cars",
    shippingTypical: 0,
    netProceeds: (sell, _ship, isLocal) => {
      if (isLocal) return sell;
      const fee = sell * 0.129;
      return sell - fee;
    },
    feeDesc: (sell, isLocal) => {
      if (isLocal) return "0% for local pickup";
      const fee = sell * 0.129;
      return `12.9% shipped = ${fmtMoney(fee)}`;
    },
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface FlipCalculatorPanelProps {
  visible: boolean;
  /** Pre-fill buy price from scanned price */
  buyPrice?: number | null;
  /** Pre-fill sell price from best market price */
  sellPrice?: number | null;
  /** Item category hint for default platform suggestion */
  category?: string | null;
  onClose: () => void;
  onSetPriceAlert?: (targetPrice: number) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function guessDefaultPlatform(category: string | null | undefined): string {
  const cat = (category || "").toLowerCase();
  if (cat.includes("sneak") || cat.includes("shoe"))  return "stockx";
  if (cat.includes("cloth") || cat.includes("apparel") || cat.includes("fashion")) return "poshmark";
  if (cat.includes("electron") || cat.includes("phone") || cat.includes("laptop")) return "ebay";
  if (cat.includes("vintage") || cat.includes("street")) return "depop";
  if (cat.includes("furni") || cat.includes("applian")) return "fbm";
  return "ebay";
}

function roiColor(roi: number): string {
  if (roi >= 40)  return "#60ff96";
  if (roi >= 20)  return "#a0f060";
  if (roi >= 5)   return "rgba(255,255,255,0.75)";
  if (roi >= 0)   return "rgba(255,200,80,0.85)";
  return "rgba(255,80,80,0.85)";
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FlipCalculatorPanel({
  visible,
  buyPrice,
  sellPrice,
  category,
  onClose,
  onSetPriceAlert,
}: FlipCalculatorPanelProps) {
  const [tab, setTab] = useState<"calc" | "platforms">("calc");
  const [buyStr,  setBuyStr]  = useState(buyPrice  != null ? String(buyPrice)  : "");
  const [sellStr, setSellStr] = useState(sellPrice != null ? String(sellPrice) : "");
  const [shipStr, setShipStr] = useState("8");
  const [platformId, setPlatformId] = useState(() => guessDefaultPlatform(category));
  const [isLocal, setIsLocal] = useState(false);

  const buy  = parseFloat(buyStr)  || 0;
  const sell = parseFloat(sellStr) || 0;
  const ship = parseFloat(shipStr) || 0;

  const platform = PLATFORMS.find((p) => p.id === platformId) ?? PLATFORMS[0];

  // ── Core calculations ─────────────────────────────────────────────────────
  const net        = sell > 0 ? platform.netProceeds(sell, isLocal ? 0 : ship, isLocal) : 0;
  const profit     = net - buy;
  const roi        = buy > 0 ? (profit / buy) * 100 : 0;
  const _breakEven  = buy > 0
    ? buy / (1 - (platform.id === "poshmark" && sell < 15 ? 2.95 / sell : 0.20))
    : 0;

  // More accurate break-even via binary search
  const breakEvenAccurate = useMemo(() => {
    if (buy <= 0) return 0;
    // Find sell price where net == buy
    let lo = buy, hi = buy * 4;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      const n = platform.netProceeds(mid, isLocal ? 0 : ship, isLocal);
      if (n < buy) lo = mid; else hi = mid;
    }
    return Math.round((lo + hi) / 2 * 100) / 100;
  }, [buy, ship, platform, isLocal]);

  // ── Platform ranker ───────────────────────────────────────────────────────
  const ranked = useMemo(() => {
    if (sell <= 0) return [];
    return PLATFORMS
      .map((p) => {
        const s = isLocal ? 0 : p.shippingTypical;
        const n = p.netProceeds(sell, s, isLocal);
        const pr = n - buy;
        const r = buy > 0 ? (pr / buy) * 100 : 0;
        return { platform: p, net: n, profit: pr, roi: r };
      })
      .sort((a, b) => b.net - a.net);
  }, [sell, buy, isLocal]);

  const handleSetAlert = useCallback(() => {
    if (sell > 0 && onSetPriceAlert) {
      onSetPriceAlert(sell);
      onClose();
    }
  }, [sell, onSetPriceAlert, onClose]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        {IOS ? (
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFillObject} />
        ) : null}

        <View style={styles.panel}>
          {/* ── Header ────────────────────────────────── */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Flip Calculator</Text>
              <Text style={styles.subtitle}>Net profit after all fees</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>

          {/* ── Tab bar ───────────────────────────────── */}
          <View style={styles.tabBar}>
            <Pressable
              style={[styles.tabBtn, tab === "calc" && styles.tabBtnActive]}
              onPress={() => setTab("calc")}
            >
              <Text style={[styles.tabText, tab === "calc" && styles.tabTextActive]}>
                Calculator
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tabBtn, tab === "platforms" && styles.tabBtnActive]}
              onPress={() => setTab("platforms")}
            >
              <Text style={[styles.tabText, tab === "platforms" && styles.tabTextActive]}>
                Best Platform
              </Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {tab === "calc" ? (
              <>
                {/* ── Inputs ───────────────────────────── */}
                <View style={styles.inputRow}>
                  <View style={styles.inputBlock}>
                    <Text style={styles.inputLabel}>BUY PRICE</Text>
                    <View style={styles.inputWrap}>
                      <Text style={styles.inputPrefix}>$</Text>
                      <TextInput
                        value={buyStr}
                        onChangeText={setBuyStr}
                        placeholder="0.00"
                        placeholderTextColor="rgba(255,255,255,0.25)"
                        style={styles.input}
                        keyboardType="decimal-pad"
                        selectTextOnFocus
                      />
                    </View>
                  </View>

                  <View style={styles.inputArrow}>
                    <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.3)" />
                  </View>

                  <View style={styles.inputBlock}>
                    <Text style={styles.inputLabel}>SELL PRICE</Text>
                    <View style={styles.inputWrap}>
                      <Text style={styles.inputPrefix}>$</Text>
                      <TextInput
                        value={sellStr}
                        onChangeText={setSellStr}
                        placeholder="0.00"
                        placeholderTextColor="rgba(255,255,255,0.25)"
                        style={styles.input}
                        keyboardType="decimal-pad"
                        selectTextOnFocus
                      />
                    </View>
                  </View>
                </View>

                {/* ── Platform selector ────────────────── */}
                <Text style={styles.sectionLabel}>PLATFORM</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.platformScroll}
                >
                  {PLATFORMS.map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => setPlatformId(p.id)}
                      style={[
                        styles.platformChip,
                        platformId === p.id && { backgroundColor: p.color + "22", borderColor: p.color + "88" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.platformChipText,
                          platformId === p.id && { color: p.color },
                        ]}
                      >
                        {p.short}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                {/* ── Local pickup toggle ──────────────── */}
                <View style={styles.localRow}>
                  <Text style={styles.localLabel}>Local pickup (no shipping)</Text>
                  <Switch
                    value={isLocal}
                    onValueChange={setIsLocal}
                    trackColor={{ false: "rgba(255,255,255,0.15)", true: "rgba(120,255,180,0.5)" }}
                    thumbColor={isLocal ? "#78ffb4" : "rgba(255,255,255,0.6)"}
                  />
                </View>

                {/* ── Shipping (if not local) ───────────── */}
                {!isLocal ? (
                  <View style={styles.inputRow}>
                    <View style={[styles.inputBlock, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>SHIPPING COST</Text>
                      <View style={styles.inputWrap}>
                        <Text style={styles.inputPrefix}>$</Text>
                        <TextInput
                          value={shipStr}
                          onChangeText={setShipStr}
                          placeholder="0.00"
                          placeholderTextColor="rgba(255,255,255,0.25)"
                          style={styles.input}
                          keyboardType="decimal-pad"
                          selectTextOnFocus
                        />
                      </View>
                    </View>
                  </View>
                ) : null}

                {/* ── Fee breakdown ────────────────────── */}
                {sell > 0 ? (
                  <View style={styles.feeBox}>
                    <Text style={styles.sectionLabel}>FEE BREAKDOWN · {platform.name}</Text>
                    <Text style={styles.feeNote}>{platform.bestFor}</Text>

                    <View style={styles.feeRow}>
                      <Text style={styles.feeLabel}>Sell price</Text>
                      <Text style={styles.feeValue}>{fmtMoney(sell)}</Text>
                    </View>
                    <View style={styles.feeRow}>
                      <Text style={styles.feeLabel}>{platform.name} fee</Text>
                      <Text style={[styles.feeValue, { color: "rgba(255,100,80,0.8)" }]}>
                        −{platform.feeDesc(sell, isLocal)}
                      </Text>
                    </View>
                    {!isLocal && ship > 0 ? (
                      <View style={styles.feeRow}>
                        <Text style={styles.feeLabel}>Shipping</Text>
                        <Text style={[styles.feeValue, { color: "rgba(255,100,80,0.8)" }]}>
                          −{fmtMoney(ship)}
                        </Text>
                      </View>
                    ) : null}
                    <View style={[styles.feeRow, styles.feeTotal]}>
                      <Text style={styles.feeTotalLabel}>Net proceeds</Text>
                      <Text style={styles.feeTotalValue}>{fmtMoney(Math.max(0, net))}</Text>
                    </View>
                  </View>
                ) : null}

                {/* ── Result box ───────────────────────── */}
                {sell > 0 && buy > 0 ? (
                  <View style={[
                    styles.resultBox,
                    { borderColor: profit >= 0 ? "rgba(120,255,180,0.25)" : "rgba(255,80,80,0.25)" },
                  ]}>
                    <View style={styles.resultRow}>
                      <View style={styles.resultBlock}>
                        <Text style={styles.resultBlockLabel}>NET PROFIT</Text>
                        <Text style={[
                          styles.resultBlockValue,
                          { color: profit >= 0 ? "#78ffb4" : "#ff6060" },
                        ]}>
                          {profit >= 0 ? "+" : ""}{fmtMoney(profit)}
                        </Text>
                      </View>

                      <View style={styles.resultDivider} />

                      <View style={styles.resultBlock}>
                        <Text style={styles.resultBlockLabel}>ROI</Text>
                        <Text style={[styles.resultBlockValue, { color: roiColor(roi) }]}>
                          {roi >= 0 ? "+" : ""}{Math.round(roi)}%
                        </Text>
                      </View>

                      <View style={styles.resultDivider} />

                      <View style={styles.resultBlock}>
                        <Text style={styles.resultBlockLabel}>BREAK-EVEN</Text>
                        <Text style={[styles.resultBlockValue, { color: C.text2 }]}>
                          {fmtMoney(breakEvenAccurate)}
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : null}

                {/* ── Set price alert CTA ───────────────── */}
                {sell > 0 && onSetPriceAlert ? (
                  <Pressable style={styles.alertCta} onPress={handleSetAlert}>
                    <Ionicons name="notifications-outline" size={16} color="rgba(120,180,255,0.9)" />
                    <Text style={styles.alertCtaText}>
                      Set alert when price hits {fmtMoney(sell)}
                    </Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              /* ── Platform ranking tab ─────────────────── */
              <>
                <View style={styles.inputRow}>
                  <View style={styles.inputBlock}>
                    <Text style={styles.inputLabel}>BUY PRICE</Text>
                    <View style={styles.inputWrap}>
                      <Text style={styles.inputPrefix}>$</Text>
                      <TextInput
                        value={buyStr}
                        onChangeText={setBuyStr}
                        placeholder="0.00"
                        placeholderTextColor="rgba(255,255,255,0.25)"
                        style={styles.input}
                        keyboardType="decimal-pad"
                        selectTextOnFocus
                      />
                    </View>
                  </View>
                  <View style={styles.inputArrow}>
                    <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.3)" />
                  </View>
                  <View style={styles.inputBlock}>
                    <Text style={styles.inputLabel}>SELL PRICE</Text>
                    <View style={styles.inputWrap}>
                      <Text style={styles.inputPrefix}>$</Text>
                      <TextInput
                        value={sellStr}
                        onChangeText={setSellStr}
                        placeholder="0.00"
                        placeholderTextColor="rgba(255,255,255,0.25)"
                        style={styles.input}
                        keyboardType="decimal-pad"
                        selectTextOnFocus
                      />
                    </View>
                  </View>
                </View>

                <View style={styles.localRow}>
                  <Text style={styles.localLabel}>Include local pickup options</Text>
                  <Switch
                    value={isLocal}
                    onValueChange={setIsLocal}
                    trackColor={{ false: "rgba(255,255,255,0.15)", true: "rgba(120,255,180,0.5)" }}
                    thumbColor={isLocal ? "#78ffb4" : "rgba(255,255,255,0.6)"}
                  />
                </View>

                {ranked.length > 0 ? (
                  <View style={styles.rankList}>
                    <Text style={styles.sectionLabel}>RANKED BY NET PROCEEDS</Text>
                    {ranked.map(({ platform: p, net: _n, profit: pr, roi: r }, i) => (
                      <Pressable
                        key={p.id}
                        onPress={() => { setPlatformId(p.id); setTab("calc"); }}
                        style={[
                          styles.rankRow,
                          i === 0 && styles.rankRowBest,
                          platformId === p.id && { borderColor: p.color + "55" },
                        ]}
                      >
                        <View style={[styles.rankBadge, { backgroundColor: p.color + "22" }]}>
                          <Text style={[styles.rankNum, { color: p.color }]}>#{i + 1}</Text>
                        </View>

                        <View style={{ flex: 1 }}>
                          <View style={styles.rankNameRow}>
                            <Text style={styles.rankName}>{p.name}</Text>
                            {i === 0 ? (
                              <View style={styles.bestPill}>
                                <Text style={styles.bestPillText}>BEST</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.rankBestFor} numberOfLines={1}>{p.bestFor}</Text>
                        </View>

                        <View style={styles.rankRight}>
                          <Text style={[
                            styles.rankNet,
                            { color: pr >= 0 ? "#78ffb4" : "rgba(255,80,80,0.85)" },
                          ]}>
                            {pr >= 0 ? "+" : ""}{fmtMoney(pr)}
                          </Text>
                          <Text style={[styles.rankRoi, { color: roiColor(r) }]}>
                            {r >= 0 ? "+" : ""}{Math.round(r)}% ROI
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyRank}>
                    <Ionicons name="calculator-outline" size={32} color="rgba(255,255,255,0.2)" />
                    <Text style={styles.emptyRankText}>Enter buy + sell prices{"\n"}to compare platforms</Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.82)",
    justifyContent: "flex-end",
  },
  panel: {
    backgroundColor: "#0e0e0e",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)",
    maxHeight: "92%",
    overflow: "hidden",
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: SP.lg,
    paddingBottom: SP.md,
  },
  title: {
    ...TY.h2,
    color: C.text,
    fontSize: 20,
    fontWeight: "800",
  },
  subtitle: {
    ...TY.cap,
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
  },

  // ── Tab bar ───────────────────────────────────────────────────────────────
  tabBar: {
    flexDirection: "row",
    marginHorizontal: SP.lg,
    marginBottom: SP.md,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: R.md,
    padding: 3,
    gap: 3,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: R.sm,
    alignItems: "center",
  },
  tabBtnActive: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  tabText: {
    ...TY.label,
    color: C.text4,
    fontSize: 12,
    fontWeight: "600",
  },
  tabTextActive: {
    color: C.text,
  },

  body: {
    paddingHorizontal: SP.lg,
  },

  // ── Inputs ────────────────────────────────────────────────────────────────
  sectionLabel: {
    ...TY.cap,
    color: C.text4,
    fontSize: 9,
    letterSpacing: 1.2,
    marginBottom: SP.xs,
    marginTop: SP.md,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: SP.sm,
  },
  inputBlock: {
    flex: 1,
  },
  inputLabel: {
    ...TY.cap,
    color: C.text4,
    fontSize: 9,
    letterSpacing: 1.2,
    marginBottom: 5,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    paddingHorizontal: SP.md,
    height: 48,
  },
  inputPrefix: {
    ...TY.label,
    color: C.text3,
    marginRight: 3,
    fontSize: 16,
  },
  input: {
    flex: 1,
    color: C.text,
    fontSize: 18,
    fontWeight: "700",
    paddingVertical: 0,
  },
  inputArrow: {
    paddingBottom: 14,
    alignItems: "center",
  },

  // ── Platform chips ────────────────────────────────────────────────────────
  platformScroll: {
    gap: SP.xs,
    paddingBottom: 2,
  },
  platformChip: {
    paddingHorizontal: SP.md,
    paddingVertical: 8,
    borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  platformChipText: {
    ...TY.label,
    color: C.text3,
    fontWeight: "600",
    fontSize: 12,
  },

  // ── Local toggle ──────────────────────────────────────────────────────────
  localRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: SP.md,
    marginBottom: SP.xs,
    paddingVertical: SP.xs,
  },
  localLabel: {
    ...TY.label,
    color: C.text3,
    fontSize: 13,
  },

  // ── Fee breakdown ─────────────────────────────────────────────────────────
  feeBox: {
    marginTop: SP.md,
    padding: SP.md,
    borderRadius: R.md,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.09)",
    gap: SP.xs,
  },
  feeNote: {
    ...TY.cap,
    color: C.text4,
    fontSize: 10,
    marginBottom: SP.sm,
    fontStyle: "italic",
  },
  feeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  feeLabel: {
    ...TY.label,
    color: C.text3,
    fontSize: 13,
  },
  feeValue: {
    ...TY.label,
    color: C.text2,
    fontSize: 13,
  },
  feeTotal: {
    marginTop: SP.sm,
    paddingTop: SP.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  feeTotalLabel: {
    ...TY.label,
    color: C.text,
    fontWeight: "700",
    fontSize: 14,
  },
  feeTotalValue: {
    ...TY.label,
    color: C.text,
    fontWeight: "700",
    fontSize: 16,
  },

  // ── Result box ────────────────────────────────────────────────────────────
  resultBox: {
    marginTop: SP.md,
    padding: SP.lg,
    borderRadius: R.lg,
    backgroundColor: "rgba(120,255,180,0.05)",
    borderWidth: 1,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  resultBlock: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  resultBlockLabel: {
    ...TY.cap,
    color: C.text4,
    fontSize: 9,
    letterSpacing: 1.0,
  },
  resultBlockValue: {
    ...TY.h2,
    fontWeight: "800",
    fontSize: 20,
  },
  resultDivider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255,255,255,0.08)",
  },

  // ── Alert CTA ─────────────────────────────────────────────────────────────
  alertCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
    marginTop: SP.lg,
    padding: SP.md,
    borderRadius: R.md,
    backgroundColor: "rgba(120,180,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(120,180,255,0.20)",
  },
  alertCtaText: {
    ...TY.label,
    color: "rgba(120,180,255,0.9)",
    fontWeight: "600",
    fontSize: 13,
  },

  // ── Platform ranking ──────────────────────────────────────────────────────
  rankList: {
    marginTop: SP.sm,
    gap: SP.sm,
  },
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.md,
    padding: SP.md,
    borderRadius: R.md,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  rankRowBest: {
    backgroundColor: "rgba(120,255,180,0.06)",
    borderColor: "rgba(120,255,180,0.20)",
  },
  rankBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rankNum: {
    fontWeight: "800",
    fontSize: 13,
  },
  rankNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.xs,
    marginBottom: 2,
  },
  rankName: {
    ...TY.label,
    color: C.text,
    fontWeight: "700",
    fontSize: 14,
  },
  bestPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: R.pill,
    backgroundColor: "rgba(120,255,180,0.15)",
    borderWidth: 1,
    borderColor: "rgba(120,255,180,0.35)",
  },
  bestPillText: {
    ...TY.cap,
    color: "#78ffb4",
    fontSize: 8,
    letterSpacing: 0.8,
    fontWeight: "700",
  },
  rankBestFor: {
    ...TY.cap,
    color: C.text4,
    fontSize: 10,
  },
  rankRight: {
    alignItems: "flex-end",
    gap: 2,
  },
  rankNet: {
    fontWeight: "800",
    fontSize: 16,
  },
  rankRoi: {
    ...TY.cap,
    fontSize: 11,
    fontWeight: "600",
  },
  emptyRank: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: SP.md,
  },
  emptyRankText: {
    ...TY.label,
    color: C.text4,
    textAlign: "center",
    lineHeight: 22,
  },
});
