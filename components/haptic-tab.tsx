import React from 'react';
import { Pressable } from 'react-native';
import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';

// Bare Pressable instead of PlatformPressable. PlatformPressable runs its own
// animated press feedback (ripple on Android, subtle scale on iOS) which
// rasterized the 28pt tab icons at sub-pixel scales and produced the
// "icon pixelates when pressed" jank.
//
// Haptics removed. Tab switching is passive navigation, not a confirmation
// event — the prior Light impact on every tab tap was arcade noise. Visual
// feedback (the opacity dip below, plus the tab-bar's own active-tint swap)
// already telegraphs "you moved tabs." Component name kept for callsite
// compatibility but the file no longer fires any haptic.
export function HapticTab(props: BottomTabBarButtonProps) {
  return (
    <Pressable
      {...(props as any)}
      android_ripple={null}
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
