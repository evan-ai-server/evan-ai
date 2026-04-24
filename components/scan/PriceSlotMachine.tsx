/**
 * PriceSlotMachine — Jackpot-style digit spinner for price reveal.
 *
 * Each digit column spins independently through 0-9, settling on the final
 * value with a spring. Columns resolve left-to-right with staggered timing
 * for a dramatic slot-machine lock-in effect.
 *
 * Rendered with Reanimated for 120fps ProMotion on supported devices.
 */
import React, { useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
} from "react-native";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  withSequence,
  withRepeat,
  interpolate,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import { C, TY, SP, R, MO, EASE_PANTHERE, Feedback } from "../design/DS";

const IS_ANDROID = Platform.OS === "android";

// Each digit occupies this height in the scroll column
const DIGIT_H = 44;
// Full strip: 0-9 repeated 3x + final digit = 31 positions
const STRIP_REPEATS = 3;
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const STRIP_LENGTH = DIGITS.length * STRIP_REPEATS;

interface PriceSlotMachineProps {
  /** The final price to reveal (e.g. 249.99) */
  targetPrice: number;
  /** When true, triggers the spin-to-reveal sequence */
  revealed: boolean;
}

interface DigitColumnProps {
  digit: string;
  index: number;
  totalColumns: number;
  revealed: boolean;
}

// ─── SINGLE DIGIT COLUMN ────────────────────────────────────────────────────

const DigitColumn = React.memo(function DigitColumn({
  digit,
  index,
  totalColumns,
  revealed,
}: DigitColumnProps) {
  const scrollY = useSharedValue(0);
  const glowOpacity = useSharedValue(0);

  // Non-numeric characters ($ , .) don't spin
  const isNumeric = /\d/.test(digit);
  const targetDigit = isNumeric ? parseInt(digit, 10) : 0;

  useEffect(() => {
    if (!revealed || !isNumeric) return;

    // Cancel any previous animation
    cancelAnimation(scrollY);

    // Starting position: random offset in the strip
    const startOffset = (Math.random() * 10 + 5) * DIGIT_H;
    scrollY.value = -startOffset;

    // Target: land on the final digit after spinning through the full strip
    const targetY = -(STRIP_LENGTH * DIGIT_H + targetDigit * DIGIT_H);

    // Stagger: each column locks in 80ms after the previous
    const staggerDelay = index * 80;

    // Spin phase: fast constant scroll, then spring settle
    scrollY.value = withDelay(
      staggerDelay,
      withSequence(
        // Fast spin through the strip
        withTiming(targetY + DIGIT_H * 5, {
          duration: 600 + index * 60,
          easing: Easing.in(Easing.cubic),
        }),
        // Spring settle onto the final digit
        withSpring(targetY, {
          damping: 14,
          stiffness: 280,
          mass: 0.7,
        })
      )
    );

    // Glow flash when digit locks in
    glowOpacity.value = withDelay(
      staggerDelay + 600 + index * 60,
      withSequence(
        withTiming(1, { duration: 80 }),
        withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) })
      )
    );
  }, [revealed, digit, index]);

  const stripStyle = useAnimatedStyle(() => {
    if (!isNumeric) return {};
    return {
      transform: [{ translateY: scrollY.value }] as any,
    };
  });

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  // Static character ($ , .)
  if (!isNumeric) {
    return (
      <View style={styles.digitSlot}>
        <Text style={styles.digitText} allowFontScaling={false}>
          {digit}
        </Text>
      </View>
    );
  }

  // Scrolling digit column
  return (
    <View style={styles.digitSlot}>
      {/* Mask: only show one digit height */}
      <View style={styles.digitMask}>
        <Reanimated.View style={[styles.digitStrip, stripStyle]}>
          {/* 3 full cycles + enough to land on any digit */}
          {Array.from({ length: STRIP_LENGTH + 10 }, (_, i) => (
            <View key={i} style={styles.digitCell}>
              <Text style={styles.digitText} allowFontScaling={false}>
                {DIGITS[i % 10]}
              </Text>
            </View>
          ))}
        </Reanimated.View>
      </View>

      {/* Lock-in glow */}
      <Reanimated.View
        style={[styles.digitGlow, glowStyle]}
        pointerEvents="none"
      />
    </View>
  );
});

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────

export const PriceSlotMachine = React.memo(function PriceSlotMachine({
  targetPrice,
  revealed,
}: PriceSlotMachineProps) {
  // Format price to string with $ and 2 decimal places
  const priceStr = useMemo(() => {
    const formatted = `$${targetPrice.toFixed(2)}`;
    return formatted;
  }, [targetPrice]);

  // Split into individual characters
  const chars = useMemo(() => priceStr.split(""), [priceStr]);

  // Container scale animation
  const containerScale = useSharedValue(0.9);
  const containerOpacity = useSharedValue(0);

  useEffect(() => {
    if (!revealed) {
      containerScale.value = 0.9;
      containerOpacity.value = 0;
      return;
    }
    containerOpacity.value = withTiming(1, { duration: 200 });
    containerScale.value = withSpring(1, {
      damping: 18,
      stiffness: 220,
      mass: 0.8,
    });
  }, [revealed]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
    transform: [{ scale: containerScale.value }] as any,
  }));

  return (
    <Reanimated.View style={[styles.container, containerStyle]}>
      {chars.map((char, i) => (
        <DigitColumn
          key={`${i}-${char}`}
          digit={char}
          index={i}
          totalColumns={chars.length}
          revealed={revealed}
        />
      ))}
    </Reanimated.View>
  );
});

// ─── STYLES ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  digitSlot: {
    width: 28,
    height: DIGIT_H,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  digitMask: {
    width: 28,
    height: DIGIT_H,
    overflow: "hidden",
  },

  digitStrip: {
    // Vertical strip of digits that scrolls
  },

  digitCell: {
    width: 28,
    height: DIGIT_H,
    alignItems: "center",
    justifyContent: "center",
  },

  digitText: {
    fontSize: 36,
    fontWeight: "900",
    color: C.text,
    letterSpacing: -1,
    lineHeight: DIGIT_H,
    textShadowColor: C.electricCyanGlow,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },

  digitGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.electricCyanDim,
    borderRadius: R.xs,
  },
});
