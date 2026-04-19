/**
 * SingularityTransition — the one-true "Crystal" entrance wrapper.
 * Opacity 0→1 · Scale 0.98→1 · translateY 15→0, 420ms Panthere curve.
 * Locks to a hardware layer during entrance so the GPU owns the pixels.
 */
import React, { useEffect } from "react";
import { StyleProp, ViewStyle, Platform } from "react-native";
import Reanimated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { EASE_PANTHERE, SINGULARITY } from "../design/DS";

interface SingularityTransitionProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** ms — default 0 */
  delay?: number;
  /** Override duration (default 420) */
  duration?: number;
  /** Restart entrance when this key changes */
  resetKey?: any;
}

const panthere = Easing.bezier(EASE_PANTHERE[0], EASE_PANTHERE[1], EASE_PANTHERE[2], EASE_PANTHERE[3]);
const IS_ANDROID = Platform.OS === "android";

export const SingularityTransition = React.memo(function SingularityTransition({
  children,
  style,
  delay = 0,
  duration = SINGULARITY.duration,
  resetKey,
}: SingularityTransitionProps) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = 0;
    t.value = withDelay(delay, withTiming(1, { duration, easing: panthere }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const animStyle = useAnimatedStyle(() => {
    const opacity    = t.value;
    const scale      = interpolate(t.value, [0, 1], [SINGULARITY.fromScale, 1], Extrapolation.CLAMP);
    const translateY = interpolate(t.value, [0, 1], [SINGULARITY.fromTranslateY, 0], Extrapolation.CLAMP);
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
