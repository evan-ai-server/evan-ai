import React from 'react';
import { Pressable, type GestureResponderEvent } from 'react-native';
import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';

// Bare Pressable instead of PlatformPressable. PlatformPressable runs its own
// animated press feedback (ripple on Android, subtle scale on iOS) which
// rasterized the 28pt tab icons at sub-pixel scales and produced the
// "icon pixelates when pressed" jank. A plain Pressable with opacity-only
// feedback fires the haptic and switches instantly — no transforms on the
// icon, no rasterization-at-scale, no flicker.
export function HapticTab(props: BottomTabBarButtonProps) {
  const handlePressIn = (ev: GestureResponderEvent) => {
    if (process.env.EXPO_OS === 'ios') {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    }
    props.onPressIn?.(ev as any);
  };

  return (
    <Pressable
      {...(props as any)}
      android_ripple={null}
      onPressIn={handlePressIn}
      style={({ pressed }) => {
        const inner = typeof props.style === 'function'
          ? (props.style as any)({ pressed })
          : props.style;
        return [
          inner,
          { opacity: pressed ? 0.72 : 1 },
        ];
      }}
    />
  );
}
