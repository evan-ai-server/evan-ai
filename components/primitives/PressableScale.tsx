/**
 * PressableScale — premium button primitive with opacity-only press feedback.
 *
 * Previously did a spring-physics scale transform on every tap (1.0 → 0.955 →
 * 1.0 bounce). At small chip sizes the scaled-and-back rasterization produced
 * visible icon pixelation on press — most obvious on the bottom-dock action
 * chips and the results-card buttons. Switched to opacity-only feedback,
 * which is the Apple-system feel: instant, no jitter, no scale artifacts.
 * The `scale` prop is accepted but ignored so existing callers type-check
 * unchanged.
 *
 * Haptics: SILENT BY DEFAULT. The prior default of `haptic = true` fired
 * a Light impact on every press across every dock chip, every modal
 * button, every primary CTA — arcade noise that taught users to tune the
 * device out. Callers that need a confirmation buzz (Bought, Track, etc.)
 * should fire it explicitly via `triggerHaptic("save" | …)` from
 * components/design/haptics so the intent stays in the call site, not
 * blanketed across every press in the app.
 */
import React, { useCallback } from "react";
import { Pressable, StyleProp, ViewStyle } from "react-native";
import { triggerHaptic } from "../design/haptics";

interface PressableScaleProps {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Retained for backwards compat; no longer used. */
  scale?: number;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  /** Opt-in haptic. Default false so the app isn't a vibrating arcade.
   *  When true, fires a single "save" pulse routed through the central
   *  helper (which has cooldown), so even haptic-enabled chips can't
   *  spam-trigger on rapid taps. */
  haptic?: boolean;
  hitSlop?: number;
}

export const PressableScale = React.memo(function PressableScale({
  children,
  onPress,
  onLongPress,
  style,
  disabled = false,
  haptic = false,
  hitSlop,
}: PressableScaleProps) {
  const firePress = useCallback(() => {
    if (haptic) triggerHaptic("save");
    onPress?.();
  }, [haptic, onPress]);

  const fireLong = useCallback(() => {
    if (haptic) triggerHaptic("save");
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
