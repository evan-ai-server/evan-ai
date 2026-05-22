/**
 * PressableScale — premium button primitive with opacity-only press feedback.
 *
 * Previously did a spring-physics scale transform on every tap (1.0 → 0.955 →
 * 1.0 bounce). At small chip sizes the scaled-and-back rasterization produced
 * visible icon pixelation on press — most obvious on the bottom-dock action
 * chips and the results-card buttons. Switched to opacity-only feedback +
 * haptic, which is the Apple-system feel: instant, no jitter, no scale
 * artifacts. The `scale` prop is accepted but ignored so existing callers
 * type-check unchanged.
 */
import React, { useCallback } from "react";
import { Pressable, StyleProp, ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";

interface PressableScaleProps {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Retained for backwards compat; no longer used. */
  scale?: number;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  haptic?: boolean;
  hitSlop?: number;
}

const fireHaptic = () => {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {}
};

export const PressableScale = React.memo(function PressableScale({
  children,
  onPress,
  onLongPress,
  style,
  disabled = false,
  haptic = true,
  hitSlop,
}: PressableScaleProps) {
  const firePress = useCallback(() => {
    if (haptic) fireHaptic();
    onPress?.();
  }, [haptic, onPress]);

  const fireLong = useCallback(() => {
    if (haptic) fireHaptic();
    onLongPress?.();
  }, [haptic, onLongPress]);

  return (
    <Pressable
      onPress={firePress}
      onLongPress={onLongPress ? fireLong : undefined}
      disabled={disabled}
      android_ripple={null}
      hitSlop={hitSlop}
      style={({ pressed }) => [
        style,
        { opacity: disabled ? 0.38 : pressed ? 0.78 : 1 },
      ]}
    >
      {children}
    </Pressable>
  );
});
