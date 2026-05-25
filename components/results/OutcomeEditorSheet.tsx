/**
 * OutcomeEditorSheet — update the real-world outcome for a scan.
 * Tracks the lifecycle: holding → listed → sold.
 * POSTs to /api/outcomes/:scanId — merges with existing record server-side.
 */
import React, { useState, useCallback, useEffect } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, SP, R, TY, IOS } from "../design/DS";
import { PressableScale } from "../primitives/PressableScale";

const PLATFORMS = ["eBay", "Facebook", "Mercari", "Poshmark", "Amazon", "Other"];
type Status = "holding" | "listed" | "sold";

// ─── Props ────────────────────────────────────────────────────────────────────

interface OutcomeEditorSheetProps {
  visible: boolean;
  scanId: string | null;
  userId: string | null;
  itemName?: string | null;
  apiBase: string;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OutcomeEditorSheet({
  visible,
  scanId,
  userId,
  itemName,
  apiBase,
  onClose,
}: OutcomeEditorSheetProps) {
  const insets = useSafeAreaInsets();

  const [fetching, setFetching]             = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [status, setStatus]                 = useState<Status>("holding");
  const [listingPrice, setListingPrice]     = useState("");
  const [platform, setPlatform]             = useState("eBay");
  const [actualSellPrice, setActualSellPrice] = useState("");
  const [actualFees, setActualFees]         = useState("");
  const [shippingCost, setShippingCost]     = useState("");
  // Track whether timestamps already exist so we don't overwrite them
  const [hasListedAt, setHasListedAt]       = useState(false);
  const [hasSoldAt, setHasSoldAt]           = useState(false);

  // Load existing outcome when sheet opens
  useEffect(() => {
    if (!visible || !scanId) return;
    setFetching(true);
    setError(null);
    fetch(`${apiBase}/api/outcomes/${encodeURIComponent(scanId)}`)
      .then((r) => r.json())
      .then((data) => {
        const o = data?.outcome;
        if (o) {
          if (o.sold) setStatus("sold");
          else if (o.listed) setStatus("listed");
          else setStatus("holding");
          if (o.listingPrice) setListingPrice(String(o.listingPrice));
          if (o.salePlatform) setPlatform(o.salePlatform);
          if (o.actualSellPrice) setActualSellPrice(String(o.actualSellPrice));
          if (o.actualFees) setActualFees(String(o.actualFees));
          if (o.shippingCost) setShippingCost(String(o.shippingCost));
          setHasListedAt(!!o.listedAt);
          setHasSoldAt(!!o.soldAt);
        }
      })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [visible, scanId, apiBase]);

  const reset = useCallback(() => {
    setFetching(false);
    setSaving(false);
    setError(null);
    setStatus("holding");
    setListingPrice("");
    setPlatform("eBay");
    setActualSellPrice("");
    setActualFees("");
    setShippingCost("");
    setHasListedAt(false);
    setHasSoldAt(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleSave = useCallback(async () => {
    if (!scanId) return;
    setSaving(true);
    setError(null);

    try {
      const fields: Record<string, any> = {
        userId,
        listed: status === "listed" || status === "sold",
        sold: status === "sold",
        salePlatform: platform,
      };

      if (status === "listed" || status === "sold") {
        const lp = parseFloat(listingPrice);
        if (Number.isFinite(lp) && lp > 0) fields.listingPrice = lp;
        // Only set listedAt the first time
        if (!hasListedAt) fields.listedAt = new Date().toISOString();
      }

      if (status === "sold") {
        const sp = parseFloat(actualSellPrice);
        if (!Number.isFinite(sp) || sp <= 0) {
          setError("Enter the sell price");
          setSaving(false);
          return;
        }
        fields.actualSellPrice = sp;
        if (!hasSoldAt) fields.soldAt = new Date().toISOString();
        const fees = parseFloat(actualFees);
        if (Number.isFinite(fees) && fees >= 0) fields.actualFees = fees;
        const ship = parseFloat(shippingCost);
        if (Number.isFinite(ship) && ship >= 0) fields.shippingCost = ship;
      }

      const res = await fetch(`${apiBase}/api/outcomes/${encodeURIComponent(scanId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Server error ${res.status}`);
      }
      reset();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Couldn't save — try again");
      setSaving(false);
    }
  }, [
    scanId, userId, apiBase, status, platform,
    listingPrice, actualSellPrice, actualFees, shippingCost,
    hasListedAt, hasSoldAt, reset, onClose,
  ]);

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
          <View style={styles.handle} />

          {/* Item context */}
          {itemName ? (
            <Text numberOfLines={1} style={styles.contextName}>{itemName}</Text>
          ) : null}

          <Text style={styles.title}>Update outcome</Text>

          {fetching ? (
            <ActivityIndicator color={C.text3} style={{ marginVertical: SP.xl }} />
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Status chips */}
              <View style={styles.statusRow}>
                {(["holding", "listed", "sold"] as const).map((s) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => setStatus(s)}
                    style={[styles.statusChip, status === s && styles.statusChipActive]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.statusChipText, status === s && styles.statusChipTextActive]}>
                      {s === "holding" ? "Holding" : s === "listed" ? "Listed" : "Sold"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Platform */}
              <Text style={styles.fieldLabel}>Platform</Text>
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
                    style={[styles.chip, platform === p && styles.chipActive]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, platform === p && styles.chipTextActive]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* LISTED: listing price */}
              {(status === "listed" || status === "sold") ? (
                <>
                  <Text style={styles.fieldLabel}>Listing price</Text>
                  <View style={styles.inputField}>
                    <Text style={styles.dollarSign}>$</Text>
                    <TextInput
                      style={styles.priceInput}
                      value={listingPrice}
                      onChangeText={setListingPrice}
                      placeholder="0.00"
                      placeholderTextColor={C.text4}
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                      selectTextOnFocus
                    />
                  </View>
                </>
              ) : null}

              {/* SOLD: sell price + fees + shipping */}
              {status === "sold" ? (
                <>
                  <Text style={styles.fieldLabel}>Sold price</Text>
                  <View style={styles.inputField}>
                    <Text style={styles.dollarSign}>$</Text>
                    <TextInput
                      style={styles.priceInput}
                      value={actualSellPrice}
                      onChangeText={setActualSellPrice}
                      placeholder="0.00"
                      placeholderTextColor={C.text4}
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                      selectTextOnFocus
                    />
                  </View>

                  <View style={styles.feeRow}>
                    <View style={styles.feeField}>
                      <Text style={styles.fieldLabel}>Fees</Text>
                      <View style={styles.inputField}>
                        <Text style={styles.dollarSign}>$</Text>
                        <TextInput
                          style={styles.priceInput}
                          value={actualFees}
                          onChangeText={setActualFees}
                          placeholder="0.00"
                          placeholderTextColor={C.text4}
                          keyboardType="decimal-pad"
                          returnKeyType="done"
                          selectTextOnFocus
                        />
                      </View>
                    </View>
                    <View style={styles.feeField}>
                      <Text style={styles.fieldLabel}>Shipping</Text>
                      <View style={styles.inputField}>
                        <Text style={styles.dollarSign}>$</Text>
                        <TextInput
                          style={styles.priceInput}
                          value={shippingCost}
                          onChangeText={setShippingCost}
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

              <PressableScale
                onPress={handleSave}
                style={styles.saveBtn}
                scale={0.96}
                haptic
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </PressableScale>

              {/* Bottom breathing room */}
              <View style={{ height: SP.md }} />
            </ScrollView>
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
    maxHeight: "85%",
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
    marginBottom: SP.xs,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  title: {
    ...TY.h1,
    color: C.text,
    textAlign: "center",
    marginBottom: SP.lg,
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
    minHeight: 44,
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
    fontSize: 13,
  },
  statusChipTextActive: {
    color: C.text,
    fontWeight: "700" as const,
  },

  // Platform
  platformScroll: {
    marginHorizontal: -SP.xl,
    marginBottom: SP.lg,
  },
  platformRow: {
    paddingHorizontal: SP.xl,
    gap: SP.sm,
    flexDirection: "row",
  },
  chip: {
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm,
    borderRadius: R.pill,
    backgroundColor: C.s1,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipActive: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderColor: C.borderStrong,
  },
  chipText: {
    ...TY.label,
    color: C.text3,
  },
  chipTextActive: {
    color: C.text,
  },

  // Price fields
  fieldLabel: {
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
    marginBottom: SP.md,
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
  feeRow: {
    flexDirection: "row",
    gap: SP.sm,
  },
  feeField: {
    flex: 1,
  },

  // Save button + error
  saveBtn: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderRadius: R.lg,
    minHeight: 56,
    marginTop: SP.sm,
  },
  saveBtnText: {
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
