/**
 * DecisionSheet — Post-scan follow-up capture.
 * Two-step wizard:
 *   Step 1: Did you buy this? (BUY / PASS / UNDECIDED)
 *   Step 2: (BUY only) Where and how much did you pay?
 *
 * Calls:
 *   POST /scan/decision  — records decision + detects override server-side
 *   POST /scan/source    — records purchase details (BUY path only)
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, SP, R, TY, IOS } from "../design/DS";
import { PressableScale } from "../primitives/PressableScale";
import { EventTracker } from "../../services/revenue/EventTracker";

// ─── Source type config ───────────────────────────────────────────────────────

interface SourceType {
  value: string;
  label: string;
  physical: boolean; // physical = askPrice required
}

const SOURCE_TYPES: SourceType[] = [
  { value: "THRIFT",       label: "Thrift",      physical: true  },
  { value: "ESTATE",       label: "Estate Sale", physical: true  },
  { value: "GARAGE",       label: "Garage Sale", physical: true  },
  { value: "CONSIGNMENT",  label: "Consignment", physical: true  },
  { value: "AUCTION",      label: "Auction",     physical: true  },
  { value: "MARKETPLACE",  label: "Marketplace", physical: false },
  { value: "ONLINE_LOCAL", label: "FB / Craig",  physical: false },
  { value: "OTHER",        label: "Other",       physical: false },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface DecisionSheetProps {
  visible: boolean;
  scanId: string | null;
  userId: string | null;
  itemName?: string | null;
  apiBase: string;
  onClose: () => void;
  /** Called when decision (and optionally source) is successfully recorded */
  onComplete?: (decision: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DecisionSheet({
  visible,
  scanId,
  userId,
  itemName,
  apiBase,
  onClose,
  onComplete,
}: DecisionSheetProps) {
  const insets = useSafeAreaInsets();

  const [step, setStep]               = useState<1 | 2>(1);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [sourceType, setSourceType]   = useState("THRIFT");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [askPrice, setAskPrice]       = useState("");
  const [city, setCity]               = useState("");

  const selectedSource = SOURCE_TYPES.find((s) => s.value === sourceType) ?? SOURCE_TYPES[0];
  const requiresAskPrice = selectedSource.physical;

  const reset = useCallback(() => {
    setStep(1);
    setLoading(false);
    setError(null);
    setSourceType("THRIFT");
    setPurchasePrice("");
    setAskPrice("");
    setCity("");
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  // ── Post decision to server ────────────────────────────────────────────────

  async function postDecision(decision: string): Promise<boolean> {
    if (!scanId || !userId) return true; // no-op if no context
    try {
      await fetch(`${apiBase}/scan/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanId, userId, decision }),
      });
      return true;
    } catch {
      return false;
    }
  }

  // ── Record realized outcome (fire-and-forget) ─────────────────────────────

  function postOutcomeRecord(fields: Record<string, any>) {
    if (!scanId) return;
    fetch(`${apiBase}/api/outcomes/${encodeURIComponent(scanId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...fields }),
    }).catch(() => {});
  }

  // ── PASS / UNDECIDED ──────────────────────────────────────────────────────

  const handlePassOrUndecided = useCallback(async (decision: "PASS" | "UNDECIDED") => {
    setLoading(true);
    setError(null);
    await postDecision(decision);
    // Revenue: capture decision signal
    try {
      EventTracker.track("decision_pass", {
        scanId,
        itemName: itemName ?? null,
        metadata: { decision },
      });
    } catch {}
    onComplete?.(decision);
    reset();
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId, userId, apiBase, onComplete, reset, onClose]);

  // ── BUY → step 1 → submit decision, advance to step 2 ───────────────────

  const handleBuyTapped = useCallback(async () => {
    setLoading(true);
    setError(null);
    await postDecision("BUY"); // non-blocking — proceed even if it fails
    postOutcomeRecord({ bought: true, listed: false, sold: false });
    // Revenue: capture buy intent signal
    try {
      EventTracker.track("decision_buy", {
        scanId,
        itemName: itemName ?? null,
      });
    } catch {}
    setLoading(false);
    setStep(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId, userId, apiBase]);

  // ── Step 2: submit source details ────────────────────────────────────────

  const handleSourceSubmit = useCallback(async () => {
    const pp = parseFloat(purchasePrice);
    if (!Number.isFinite(pp) || pp <= 0) {
      setError("Enter the price you paid");
      return;
    }
    if (requiresAskPrice) {
      const ap = parseFloat(askPrice);
      if (!Number.isFinite(ap) || ap <= 0) {
        setError(`Enter the tag / ask price (required for ${selectedSource.label})`);
        return;
      }
    }
    if (!city.trim()) {
      setError("Enter your city");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, any> = {
        scanId,
        userId,
        sourceType,
        purchasePrice: pp,
        city: city.trim(),
      };
      const ap = parseFloat(askPrice);
      if (Number.isFinite(ap) && ap > 0) {
        body.askPrice = ap;
      }
      const res = await fetch(`${apiBase}/scan/source`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Server error ${res.status}`);
      }
      postOutcomeRecord({ bought: true, actualBuyPrice: pp, listed: false, sold: false });
      onComplete?.("BUY");
      reset();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Couldn't save — try again");
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId, userId, apiBase, sourceType, purchasePrice, askPrice, city, requiresAskPrice, selectedSource, onComplete, reset, onClose]);

  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={handleClose}
      presentationStyle="overFullScreen"
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Dim backdrop */}
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={handleClose}
        />

        {/* Sheet */}
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, SP.xl) + SP.md }]}>
          {IOS ? <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} /> : null}
          <View style={styles.sheetBg} />

          {/* Handle */}
          <View style={styles.handle} />

          {/* Item context */}
          {itemName ? (
            <Text numberOfLines={1} style={styles.contextName}>{itemName}</Text>
          ) : null}

          {step === 1 ? (
            // ── Step 1: Decision ─────────────────────────────────────────────
            <>
              <Text style={styles.question}>Did you buy this?</Text>

              <PressableScale
                onPress={handleBuyTapped}
                style={styles.buyBtn}
                scale={0.96}
                haptic
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#000" />
                    <Text style={styles.buyBtnText}>Yes, I bought it</Text>
                  </>
                )}
              </PressableScale>

              <View style={styles.altRow}>
                <PressableScale
                  onPress={() => handlePassOrUndecided("PASS")}
                  style={styles.altBtn}
                  scale={0.96}
                  haptic
                  disabled={loading}
                >
                  <Text style={styles.altBtnText}>Passed on it</Text>
                </PressableScale>
                <PressableScale
                  onPress={() => handlePassOrUndecided("UNDECIDED")}
                  style={styles.altBtn}
                  scale={0.96}
                  haptic
                  disabled={loading}
                >
                  <Text style={styles.altBtnText}>Not sure yet</Text>
                </PressableScale>
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </>
          ) : (
            // ── Step 2: Source details ────────────────────────────────────────
            <>
              <View style={styles.stepHeader}>
                <TouchableOpacity onPress={() => setStep(1)} hitSlop={12}>
                  <Ionicons name="chevron-back" size={18} color={C.text3} />
                </TouchableOpacity>
                <Text style={styles.question}>Where did you find it?</Text>
                <View style={{ width: 18 }} />
              </View>

              {/* Source type chips */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.sourcesRow}
                style={styles.sourceScroll}
              >
                {SOURCE_TYPES.map((s) => (
                  <TouchableOpacity
                    key={s.value}
                    onPress={() => setSourceType(s.value)}
                    style={[
                      styles.sourceChip,
                      sourceType === s.value && styles.sourceChipActive,
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.sourceChipText,
                      sourceType === s.value && styles.sourceChipTextActive,
                    ]}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Price inputs */}
              <View style={styles.priceRow}>
                <View style={styles.priceInputWrap}>
                  <Text style={styles.inputLabel}>YOU PAID</Text>
                  <View style={styles.inputField}>
                    <Text style={styles.dollarSign}>$</Text>
                    <TextInput
                      style={styles.priceInput}
                      value={purchasePrice}
                      onChangeText={setPurchasePrice}
                      placeholder="0.00"
                      placeholderTextColor={C.text4}
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                      selectTextOnFocus
                    />
                  </View>
                </View>

                <View style={styles.priceInputWrap}>
                  <Text style={styles.inputLabel}>
                    TAG PRICE{requiresAskPrice ? "" : " (OPT)"}
                  </Text>
                  <View style={styles.inputField}>
                    <Text style={styles.dollarSign}>$</Text>
                    <TextInput
                      style={styles.priceInput}
                      value={askPrice}
                      onChangeText={setAskPrice}
                      placeholder="0.00"
                      placeholderTextColor={C.text4}
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                      selectTextOnFocus
                    />
                  </View>
                </View>
              </View>

              {/* City */}
              <View style={styles.cityField}>
                <Ionicons name="location-outline" size={14} color={C.text4} style={{ marginRight: 6 }} />
                <TextInput
                  style={styles.cityInput}
                  value={city}
                  onChangeText={setCity}
                  placeholder="City"
                  placeholderTextColor={C.text4}
                  returnKeyType="done"
                  autoCorrect={false}
                />
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <PressableScale
                onPress={handleSourceSubmit}
                style={styles.submitBtn}
                scale={0.96}
                haptic
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <Text style={styles.submitText}>Save purchase</Text>
                )}
              </PressableScale>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
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
    backgroundColor: "rgba(8,8,8,0.88)",
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

  question: {
    ...TY.h1,
    color: C.text,
    textAlign: "center",
    marginBottom: SP.xl,
  },

  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SP.xl,
  },

  // ── Step 1 ──────────────────────────────────────────────────────────────────
  buyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SP.sm,
    backgroundColor: "#ffffff",
    borderRadius: R.lg,
    minHeight: 58,
    marginBottom: SP.sm,
  },
  buyBtnText: {
    ...TY.bodyBold,
    color: "#000",
    fontSize: 16,
  },
  altRow: {
    flexDirection: "row",
    gap: SP.sm,
    marginBottom: SP.md,
  },
  altBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    borderRadius: R.md,
    backgroundColor: C.s1,
    borderWidth: 1,
    borderColor: C.border,
  },
  altBtnText: {
    ...TY.label,
    color: C.text2,
  },

  // ── Step 2 ──────────────────────────────────────────────────────────────────
  sourceScroll: {
    marginHorizontal: -SP.xl,
    marginBottom: SP.lg,
  },
  sourcesRow: {
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

  priceRow: {
    flexDirection: "row",
    gap: SP.sm,
    marginBottom: SP.sm,
  },
  priceInputWrap: {
    flex: 1,
  },
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

  cityField: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.s1,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SP.md,
    height: 48,
    marginBottom: SP.md,
  },
  cityInput: {
    flex: 1,
    ...TY.body,
    color: C.text,
    padding: 0,
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

  errorText: {
    ...TY.label,
    color: C.danger,
    textAlign: "center",
    marginBottom: SP.sm,
  },
});
