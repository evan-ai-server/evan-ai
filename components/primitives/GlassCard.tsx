/**
 * GlassCard — Liquid Glass surface primitive.
 * Frosted glass with specular edge highlight, border glow, and optional blur backdrop.
 * Uses expo-blur for the frosted effect and Reanimated for the specular pulse.
 */
import React, { useEffect } from "react";
import { StyleProp, StyleSheet, ViewStyle, Platform } from "react-native";
import Reanimated, {
  Easing as REasing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  interpolate,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { C, R, SP, SH } from "../design/DS";

const IOS = Platform.OS === "ios";

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Blur intensity (0 = no blur, default 28) */
  blur?: number;
  /** Border radius (default R.xxl = 32) */
  radius?: number;
  /** Show animated specular top edge (default true) */
  specular?: boolean;
  /** Shadow depth preset: "soft" | "card" | "none" (default "card") */
  shadow?: "soft" | "card" | "none";
  /** Override surface background */
  surface?: string;
}

export const GlassCard = React.memo(function GlassCard({
  children,
  style,
  blur = 28,
  radius = R.xxl,
  specular = true,
  shadow = "card",
  surface,
}: GlassCardProps) {
  const specularOp = useSharedValue(0.20);

  useEffect(() => {
    if (!specular) return;
    specularOp.value = withRepeat(
      withSequence(
        withTiming(0.55, { duration: 3200, easing: REasing.inOut(REasing.sin) }),
        withTiming(0.20, { duration: 3200, easing: REasing.inOut(REasing.sin) }),
      ),
      -1,
      false,
    );
  }, [specular]);

  const specularStyle = useAnimatedStyle(() => ({
    opacity: specularOp.value,
  }));

  const shadowStyle = shadow === "none" ? {} : shadow === "soft" ? SH.soft : SH.card;

  return (
    <Reanimated.View
      style={[
        {
          borderRadius: radius,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: C.liquidGlassBorder,
          backgroundColor: surface ?? C.liquidGlass,
          overflow: "hidden",
          ...shadowStyle,
        },
        style,
      ]}
    >
      {/* Frosted blur backdrop */}
      {blur > 0 && IOS ? (
        <BlurView
          intensity={blur}
          tint="dark"
          style={StyleSheet.absoluteFillObject}
        />
      ) : null}

      {/* Specular top edge highlight */}
      {specular ? (
        <Reanimated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: 0,
              left: SP.xl,
              right: SP.xl,
              height: 1,
              borderRadius: R.pill,
              backgroundColor: "rgba(255,255,255,0.55)",
              zIndex: 10,
            },
            specularStyle,
          ]}
        />
      ) : null}

      {children}
    </Reanimated.View>
  );
});
