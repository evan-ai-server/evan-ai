import React, { useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  withSpring,
  withSequence,
  useAnimatedStyle,
} from "react-native-reanimated";
import { useCodeScanner } from "react-native-vision-camera";
import { C, SP, R, TY, MO } from "../design/DS";

const { width: SCREEN_W, height: _SCREEN_H } = Dimensions.get("window");
const RETICLE_W = SCREEN_W * 0.65;
const RETICLE_H = RETICLE_W * 0.5;
const CORNER = 22;
const CORNER_THICK = 3;

// ─── Types ────────────────────────────────────────────────────────────────────

interface BarcodeResult {
  name: string;
  brand: string;
  category: string;
  avgPrice: number;
}

interface BarcodeScanOverlayProps {
  active: boolean;
  apiBase: string;
  onResult: (result: BarcodeResult) => void;
}

// ─── Corner bracket pieces ────────────────────────────────────────────────────

function CornerBrackets({ color }: { color: string }) {
  const cs = {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden" as const,
  };
  const h = { position: "absolute" as const, height: CORNER_THICK, width: CORNER, backgroundColor: color };
  const v = { position: "absolute" as const, width: CORNER_THICK, height: CORNER, backgroundColor: color };

  return (
    <View style={cs}>
      {/* Top-left */}
      <View style={[h, { top: 0, left: 0 }]} />
      <View style={[v, { top: 0, left: 0 }]} />
      {/* Top-right */}
      <View style={[h, { top: 0, right: 0 }]} />
      <View style={[v, { top: 0, right: 0 }]} />
      {/* Bottom-left */}
      <View style={[h, { bottom: 0, left: 0 }]} />
      <View style={[v, { bottom: 0, left: 0 }]} />
      {/* Bottom-right */}
      <View style={[h, { bottom: 0, right: 0 }]} />
      <View style={[v, { bottom: 0, right: 0 }]} />
    </View>
  );
}

// ─── Main overlay ─────────────────────────────────────────────────────────────

export default function BarcodeScanOverlay({
  active,
  apiBase,
  onResult,
}: BarcodeScanOverlayProps) {
  const [status, setStatus] = useState<"idle" | "scanning" | "success">("idle");
  const lastScanned = useRef<string | null>(null);
  const scanning = useRef(false);

  // 0 = idle white, 1 = success green
  const _colorProgress = useSharedValue(0);
  const reticleScale = useSharedValue(1);

  const _cornerColor = useAnimatedStyle(() => {
    // We use a static color string toggled by colorProgress
    return {};
  });

  // Derived corner color string — we track success state in React state
  const [cornerAccent, setCornerAccent] = useState<string>(C.text);

  const flashSuccess = useCallback(() => {
    setCornerAccent(C.good);
    reticleScale.value = withSequence(
      withSpring(1.06, MO.spring.snappy),
      withSpring(1.0, MO.spring.gentle)
    );
    setTimeout(() => {
      setCornerAccent(C.text);
      setStatus("idle");
    }, 1200);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBarcode = useCallback(
    async (upc: string) => {
      if (!active || scanning.current || lastScanned.current === upc) return;
      lastScanned.current = upc;
      scanning.current = true;
      setStatus("scanning");

      try {
        const res = await fetch(`${apiBase}/intel/barcode/${encodeURIComponent(upc)}`);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();
        if (data.ok) {
          setStatus("success");
          flashSuccess();
          onResult({
            name: data.name ?? "",
            brand: data.brand ?? "",
            category: data.category ?? "",
            avgPrice: Number(data.avgPrice ?? 0),
          });
        } else {
          setStatus("idle");
        }
      } catch {
        setStatus("idle");
      } finally {
        scanning.current = false;
        // Allow re-scanning same barcode after 3s
        setTimeout(() => {
          lastScanned.current = null;
        }, 3000);
      }
    },
    [active, apiBase, onResult, flashSuccess]
  );

  const _codeScanner = useCodeScanner({
    codeTypes: ["ean-13", "ean-8", "upc-a", "upc-e", "code-128", "code-39", "qr"],
    onCodeScanned: (codes) => {
      const first = codes[0];
      if (first?.value) {
        handleBarcode(first.value);
      }
    },
  });

  const reticleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reticleScale.value }],
  }));

  if (!active) return null;

  return (
    <View style={styles.overlay} pointerEvents="none">
      {/* Dark vignette around reticle */}
      <View style={styles.vignette} />

      {/* Reticle */}
      <Animated.View style={[styles.reticle, reticleStyle]}>
        <CornerBrackets color={cornerAccent} />

        {/* Scan line */}
        <View style={styles.scanLine} />
      </Animated.View>

      {/* Status label */}
      <View style={styles.labelWrap}>
        <Text style={styles.label}>
          {status === "scanning"
            ? "Scanning..."
            : status === "success"
            ? "Found it!"
            : "Point at barcode"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  reticle: {
    width: RETICLE_W,
    height: RETICLE_H,
    // Punch a transparent hole effect via the corner brackets only
    backgroundColor: "transparent",
    borderRadius: R.sm,
    position: "relative",
  },
  scanLine: {
    position: "absolute",
    left: CORNER + SP.sm,
    right: CORNER + SP.sm,
    top: "50%",
    height: 1,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  labelWrap: {
    marginTop: SP.xl,
    paddingHorizontal: SP.xl,
    paddingVertical: SP.sm,
    backgroundColor: C.dockBg,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.border,
  },
  label: {
    ...TY.label,
    color: C.text2,
  },
});
