/**
 * LiquidTransition — spring-physics enter/exit wrapper.
 * Uses the "Liquid Glass" spring (damping: 20, stiffness: 90) for all transitions.
 * Everything should feel like it's floating in liquid — no linear or janky movements.
 */
import React, { useEffect } from "react";
import { StyleProp, ViewStyle, Platform } from "react-native";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { MO } from "../design/DS";

const IS_ANDROID = Platform.OS === "android";

interface LiquidTransitionProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Delay before entrance begins (ms, default 0) */
  delay?: number;
  /** Starting scale (default 0.96) */
  fromScale?: number;
  /** Starting vertical offset (default 18) */
  fromY?: number;
  /** Spring config override (default MO.spring.liquid) */
  spring?: { damping: number; stiffness: number; mass?: number };
  /** Restart entrance when this key changes */
  resetKey?: any;
  /** Whether the component is visible (animates in/out) */
  visible?: boolean;
}

export const LiquidTransition = React.memo(function LiquidTransition({
  children,
  style,
  delay = 0,
  fromScale = 0.96,
  fromY = 18,
  spring = MO.spring.liquid,
  resetKey,
  visible = true,
}: LiquidTransitionProps) {
  const progress = useSharedValue(visible ? 0 : 0);

  useEffect(() => {
    if (visible) {
      progress.value = 0;
      progress.value = withDelay(delay, withSpring(1, spring));
    } else {
      progress.value = withSpring(0, { ...spring, stiffness: spring.stiffness * 1.5 });
    }
  }, [visible, resetKey]);

  const animStyle = useAnimatedStyle(() => {
    const opacity = interpolate(progress.value, [0, 1], [0, 1], Extrapolation.CLAMP);
    const scale = interpolate(progress.value, [0, 1], [fromScale, 1], Extrapolation.CLAMP);
    const translateY = interpolate(progress.value, [0, 1], [fromY, 0], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ scale }, { translateY }] as any,
    };
  });

  return (
    <Reanimated.View
      style={[style, animStyle]}
      renderToHardwareTextureAndroid={IS_ANDROID}
      shouldRasterizeIOS={!IS_ANDROID}
      needsOffscreenAlphaCompositing={IS_ANDROID}
    >
      {children}
    </Reanimated.View>
  );
});
