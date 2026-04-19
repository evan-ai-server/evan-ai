import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { BlurView } from "expo-blur";
import Animated, {
  useSharedValue,
  withSpring,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, SP, R, TY, MO } from "../design/DS";
import { useAuth } from "./AuthContext";

const { height: SCREEN_H } = Dimensions.get("window");

interface AuthScreenProps {
  visible: boolean;
  onDismiss: () => void;
}

type Tab = "login" | "register";

export default function AuthScreen({ visible, onDismiss }: AuthScreenProps) {
  const insets = useSafeAreaInsets();
  const { login, register } = useAuth();

  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const translateY = useSharedValue(SCREEN_H);

  // Animate in/out when visible changes
  React.useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, MO.spring.entrance);
    } else {
      translateY.value = withTiming(SCREEN_H, { duration: MO.dur.normal });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setDisplayName("");
    setError(null);
  };

  const handleTabChange = (next: Tab) => {
    setTab(next);
    setError(null);
  };

  const handleSubmit = useCallback(async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = displayName.trim().slice(0, 64);

    if (!cleanEmail || !password) {
      setError("Email and password are required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (tab === "register" && !cleanName) {
      setError("Display name is required.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (tab === "login") {
        await login(cleanEmail, password);
      } else {
        await register(cleanEmail, password, cleanName);
      }
      resetForm();
      onDismiss();
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }, [tab, email, password, displayName, login, register, onDismiss]);

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onDismiss} />
        <Animated.View style={[styles.sheet, sheetStyle, { paddingBottom: insets.bottom + SP.xl }]}>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />

          {/* Handle bar */}
          <View style={styles.handle} />

          {/* Header */}
          <Text style={styles.title}>Evan AI</Text>
          <Text style={styles.subtitle}>
            {tab === "login" ? "Sign in to your account" : "Create a free account"}
          </Text>

          {/* Tab row */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, tab === "login" && styles.tabBtnActive]}
              onPress={() => handleTabChange("login")}
            >
              <Text style={[styles.tabText, tab === "login" && styles.tabTextActive]}>
                Sign In
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, tab === "register" && styles.tabBtnActive]}
              onPress={() => handleTabChange("register")}
            >
              <Text style={[styles.tabText, tab === "register" && styles.tabTextActive]}>
                Create Account
              </Text>
            </TouchableOpacity>
          </View>

          {/* Inputs */}
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.form}
          >
            {tab === "register" && (
              <TextInput
                style={styles.input}
                placeholder="Display name"
                placeholderTextColor={C.text4}
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
                returnKeyType="next"
              />
            )}

            <TextInput
              style={styles.input}
              placeholder="Email address"
              placeholderTextColor={C.text4}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />

            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={C.text4}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />

            {/* Error */}
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Submit button */}
            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={C.text} size="small" />
              ) : (
                <Text style={styles.submitText}>
                  {tab === "login" ? "Sign In" : "Create Account"}
                </Text>
              )}
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.60)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "rgba(11,11,15,0.96)",
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
    paddingHorizontal: SP.xl,
    paddingTop: SP.lg,
    overflow: "hidden",
    borderTopWidth: 1,
    borderColor: C.border,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: R.pill,
    backgroundColor: C.smoke,
    marginBottom: SP.xl,
  },
  title: {
    ...TY.h1,
    color: C.text,
    textAlign: "center",
    marginBottom: SP.xs,
  },
  subtitle: {
    ...TY.body,
    color: C.text3,
    textAlign: "center",
    marginBottom: SP.xl,
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: C.s1,
    borderRadius: R.md,
    padding: 3,
    marginBottom: SP.xl,
    borderWidth: 1,
    borderColor: C.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: SP.sm + 2,
    alignItems: "center",
    borderRadius: R.sm,
  },
  tabBtnActive: {
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.borderMid,
  },
  tabText: {
    ...TY.label,
    color: C.text4,
  },
  tabTextActive: {
    color: C.text,
  },
  form: {
    gap: SP.md,
  },
  input: {
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    paddingHorizontal: SP.lg,
    paddingVertical: SP.md + 2,
    color: C.text,
    ...TY.body,
  },
  errorBox: {
    backgroundColor: C.dangerBg,
    borderWidth: 1,
    borderColor: C.dangerBorder,
    borderRadius: R.sm,
    padding: SP.md,
  },
  errorText: {
    ...TY.label,
    color: C.danger,
  },
  submitBtn: {
    backgroundColor: C.glassStrong,
    borderWidth: 1,
    borderColor: C.borderStrong,
    borderRadius: R.md,
    paddingVertical: SP.md + 4,
    alignItems: "center",
    marginTop: SP.sm,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitText: {
    ...TY.bodyBold,
    color: C.text,
  },
});
