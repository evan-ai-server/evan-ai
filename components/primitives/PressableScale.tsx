/**
 * PressableScale — premium animated button primitive.
 * Spring-physics press with bounce release. Plug in anywhere Pressable would go.
 */
import React, { useCallback } from "react";
import { StyleProp, ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { MO } from "../design/DS";

interface PressableScaleProps {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  scale?: number;           // pressed scale (default 0.96)
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
  scale = 0.955,
  style,
  disabled = false,
  haptic = true,
}: PressableScaleProps) {
  const scaleVal = useSharedValue(1);

  const firePress = useCallback(() => {
    if (haptic) fireHaptic();
    onPress?.();
  }, [haptic, onPress]);

  const fireLong = useCallback(() => {
    if (haptic) fireHaptic();
    onLongPress?.();
  }, [haptic, onLongPress]);

  const tap = Gesture.Tap()
    .enabled(!disabled)
    .maxDuration(800)
    .onBegin(() => {
      scaleVal.value = withSpring(scale, MO.spring.snappy);
    })
    .onFinalize((_, success) => {
      scaleVal.value = withSpring(1, MO.spring.bouncy);
      if (success) runOnJS(firePress)();
    });

  const longPress = Gesture.LongPress()
    .enabled(!disabled && !!onLongPress)
    .minDuration(420)
    .onStart(() => {
      runOnJS(fireLong)();
    });

  const composed = Gesture.Exclusive(longPress, tap);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleVal.value }],
    opacity: disabled ? 0.38 : 1,
  }));

  return (
    <GestureDetector gesture={composed}>
      <Reanimated.View style={[animStyle, style]}>
        {children}
      </Reanimated.View>
    </GestureDetector>
  );
});
