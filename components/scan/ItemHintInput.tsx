/**
 * ItemHintInput
 *
 * Optional "Add item name" expandable input shown on the photo review screen.
 * Collapsed state: a tappable "+ Add item name" chip.
 * Expanded state: a text input with randomized placeholder that disappears on focus (native iOS behavior).
 */

import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Animated,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const HINTS = [
  "e.g. Large-Sized Stanley Cup",
  "e.g. Nike Air Force 1, White",
  "e.g. Levi's 501 Jeans",
  "e.g. Apple AirPods Pro 2nd Gen",
  "e.g. Patagonia Nano Puff Jacket",
  "e.g. Ray-Ban Wayfarers",
  "e.g. Supreme Box Logo Hoodie",
  "e.g. Jordan 1 Retro High Chicago",
  "e.g. Canon EOS R5 Camera",
  "e.g. Louis Vuitton Neverfull MM",
  "e.g. Yeti Rambler 30oz",
  "e.g. PlayStation 5 Console",
  "e.g. North Face Nuptse Jacket",
  "e.g. Dyson Airwrap",
  "e.g. Stanford Cardinal Hat",
  "e.g. Vintage Levi's Denim Jacket",
  "e.g. Xbox Series X",
  "e.g. MacBook Pro 14-inch M3",
  "e.g. Birkenstock Arizona Sandals",
  "e.g. Carhartt WIP Work Jacket",
];

interface ItemHintInputProps {
  value: string;
  onChange: (text: string) => void;
  /** Reset signal — when this changes, collapse back to button */
  resetKey?: string | null;
}

export default function ItemHintInput({ value, onChange, resetKey }: ItemHintInputProps) {
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const expandAnim = useRef(new Animated.Value(0)).current;

  // Pick a random hint once per mount / reset
  const placeholder = useMemo(
    () => HINTS[Math.floor(Math.random() * HINTS.length)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resetKey]
  );

  // Collapse when resetKey changes (e.g. new photo taken)
  useEffect(() => {
    if (resetKey !== undefined) {
      setExpanded(false);
      onChange("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const expand = () => {
    setExpanded(true);
    Animated.spring(expandAnim, {
      toValue: 1,
      damping: 22,
      stiffness: 280,
      useNativeDriver: false,
    }).start(() => {
      inputRef.current?.focus();
    });
  };

  const collapse = () => {
    Keyboard.dismiss();
    if (!value.trim()) {
      setExpanded(false);
      Animated.spring(expandAnim, {
        toValue: 0,
        damping: 22,
        stiffness: 280,
        useNativeDriver: false,
      }).start();
    }
  };

  const clear = () => {
    onChange("");
    setExpanded(false);
    Animated.spring(expandAnim, {
      toValue: 0,
      damping: 22,
      stiffness: 280,
      useNativeDriver: false,
    }).start();
  };

  const inputHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 48],
  });

  const inputOpacity = expandAnim.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0, 0, 1],
  });

  if (!expanded && !value) {
    return (
      <Pressable onPress={expand} style={styles.chip} hitSlop={8}>
        <Ionicons name="add-circle-outline" size={15} color="rgba(255,255,255,0.55)" />
        <Text style={styles.chipText}>Add item name or brand</Text>
        <Text style={styles.chipOptional}>optional</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.expandedWrap}>
      <Animated.View style={[styles.inputWrap, { height: inputHeight, opacity: inputOpacity }]}>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="rgba(255,255,255,0.28)"
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={collapse}
          onBlur={collapse}
          autoCapitalize="words"
          maxLength={80}
        />
        {value.length > 0 && (
          <Pressable onPress={clear} style={styles.clearBtn} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.4)" />
          </Pressable>
        )}
      </Animated.View>

      {/* Show filled chip if value exists but collapsed */}
      {value.length > 0 && !expanded && (
        <Pressable onPress={expand} style={[styles.chip, styles.chipFilled]}>
          <Ionicons name="create-outline" size={13} color="rgba(255,255,255,0.7)" />
          <Text style={styles.chipFilledText} numberOfLines={1}>{value}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.06)",
    marginTop: 10,
  },
  chipFilled: {
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(255,255,255,0.10)",
    maxWidth: "90%",
  },
  chipText: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    fontWeight: "600",
  },
  chipFilledText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 1,
  },
  chipOptional: {
    color: "rgba(255,255,255,0.28)",
    fontSize: 11,
    fontWeight: "500",
    marginLeft: 2,
  },
  expandedWrap: {
    marginTop: 10,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.35)",
    overflow: "hidden",
  },
  input: {
    flex: 1,
    color: "white",
    paddingHorizontal: 12,
    fontSize: 14,
    height: "100%",
  },
  clearBtn: {
    paddingHorizontal: 10,
  },
});
