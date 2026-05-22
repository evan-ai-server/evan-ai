/**
 * AskAIDrawer — slide-up conversational AI panel for scan results.
 *
 * Slides up from the bottom with a spring entrance. User types a question,
 * gets a grounded answer using the full scan context. Multi-turn history
 * maintained in local state (stateless server endpoint).
 *
 * Suggested opening prompts shown when conversation is empty.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { C, SP, R, TY } from "../design/DS";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScanContext {
  itemName?: string | null;
  store?: string | null;
  price?: number | null;
  scannedPrice?: number | null;
  savedAmount?: number | null;
  cheaperPct?: number | null;
  buyVerdict?: string | null;
  buyScore?: number | null;
  visionConfidence?: number | null;
  visionQuery?: string | null;
  category?: string | null;
  historicalLow?: number | null;
  historicalHigh?: number | null;
  avgMarket?: number | null;
  totalMatches?: number | null;
  ebaySoldComps?: {
    low: number; median: number; high: number; count: number;
    soldCount30d?: number;
    avgDaysToSell?: number | null;
    velocityTier?: "hot" | "active" | "steady" | "slow" | "rare";
    velocityLabel?: string;
    hasDates?: boolean;
  } | null;
  localComps?: { low: number; median: number; high: number; count: number; location: string } | null;
  trendIntel?: { buyAdvice?: string } | null;
  seasonalFlip?: { topSignal?: string } | null;
  authenticityIntel?: { topSignal?: string; tier?: string } | null;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AskAIDrawerProps {
  visible: boolean;
  scanContext: ScanContext;
  apiBase: string;
  onClose: () => void;
}

// ─── Suggested prompts ────────────────────────────────────────────────────────

const PROMPTS = [
  "Is this a good deal?",
  "Should I buy this?",
  "What should I offer the seller?",
  "Will this flip well?",
  "What's a fair price to pay?",
];

// ─── Component ───────────────────────────────────────────────────────────────

export function AskAIDrawer({ visible, scanContext, apiBase, onClose }: AskAIDrawerProps) {
  const insets    = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef  = useRef<TextInput>(null);

  // ── Fade-in animation (no slide).
  // Replaced the prior translateY 600→0 spring with a fade-only entrance so
  // the dark background underneath doesn't appear to "drag upward" as the
  // drawer enters — the bleeding-overlay complaint from the screenshots.
  // Tiny 4-px nudge is OK to give the eye a hint of motion; anything more
  // and the parent screen visibly shifts. drawerOpacity drives both the
  // drawer and the input lock-up — they share one source of truth.
  const drawerOpacity = useSharedValue(0);
  const drawerNudge   = useSharedValue(4);
  const backdropOp    = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      backdropOp.value    = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
      drawerOpacity.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) });
      drawerNudge.value   = withTiming(0, { duration: 240, easing: Easing.out(Easing.cubic) });
      // Focus input after entrance settles. Slight extra delay vs the 380ms
      // we used during the slide entrance, since fade is shorter.
      setTimeout(() => inputRef.current?.focus(), 280);
    } else {
      backdropOp.value    = withTiming(0, { duration: 180 });
      drawerOpacity.value = withTiming(0, { duration: 180 });
      drawerNudge.value   = withTiming(4, { duration: 180 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Reset messages when a new scan context arrives (itemName changed)
  const prevItem = useRef<string | null>(null);
  useEffect(() => {
    const name = scanContext?.itemName ?? null;
    if (name && name !== prevItem.current) {
      prevItem.current = name;
      setMessages([]);
    }
  }, [scanContext?.itemName]);

  const drawerStyle = useAnimatedStyle(() => ({
    opacity: drawerOpacity.value,
    transform: [{ translateY: drawerNudge.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOp.value,
  }));

  // ── Send message ─────────────────────────────────────────────────────────────
  // Lifecycle logs (ASK_AI_SEND_{START,SUCCESS,ERROR}) mirror the
  // WATCH_PRICE_MANUAL_REFRESH_* shape so a single grep covers both manual
  // user-triggered AI endpoints. Server replies with {ok, reply} for
  // success and {ok:false, error} on failure — both branches surface the
  // server's actual error string instead of a generic "Network error".
  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    try { Haptics.selectionAsync(); } catch {}

    const userMsg: Message = { role: "user", content: trimmed };
    const nextMessages     = [...messages, userMsg];

    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    const startedAt = Date.now();
    console.log("ASK_AI_SEND_START", {
      apiBase,
      messageCount: nextMessages.length,
      preview: trimmed.slice(0, 80),
      item: scanContext?.itemName || null,
    });

    // Scroll to bottom after user message
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);

    try {
      const resp = await fetch(`${apiBase}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, scanContext }),
        signal: AbortSignal.timeout(20000),
      });
      const json = await resp.json().catch(() => ({} as any));
      if (!resp.ok || json?.ok === false || !json?.reply) {
        const errMsg = json?.error || `HTTP ${resp.status}`;
        console.log("ASK_AI_SEND_ERROR", { apiBase, status: resp.status, error: errMsg, ms: Date.now() - startedAt });
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Sorry, I couldn't get a response (${errMsg}). Tap to retry.` },
        ]);
        return;
      }
      console.log("ASK_AI_SEND_SUCCESS", {
        apiBase, replyLen: String(json.reply).length, ms: Date.now() - startedAt,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: String(json.reply) }]);
    } catch (e: any) {
      console.log("ASK_AI_SEND_ERROR", { apiBase, error: e?.message || String(e), ms: Date.now() - startedAt });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Network error — check your connection and try again." },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages, loading, apiBase, scanContext]);

  // ─────────────────────────────────────────────────────────────────────────────

  // Unmount fully once the fade-out finishes so the drawer can't intercept
  // taps invisibly. drawerOpacity threshold mirrors the prior translateY
  // sentinel — 0.02 ≈ "no longer visible to the eye".
  if (!visible && drawerOpacity.value < 0.02) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? "auto" : "none"}>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Drawer.
          KeyboardAvoidingView with behavior="padding" + a proper iOS offset
          keeps the input row pinned directly above the keyboard. The prior
          offset of 0 left a visible gap on iPhones with home-indicator and
          made the panel feel detached/draggable. 12 is a calibrated value
          that hugs the keyboard without overlapping it. */}
      <KeyboardAvoidingView
        style={styles.kavWrap}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.drawer, drawerStyle, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {/* Glass backing */}
          {Platform.OS === "ios" ? (
            <BlurView intensity={78} tint="dark" style={StyleSheet.absoluteFillObject} />
          ) : null}
          <View style={styles.drawerOverlay} />

          {/* Handle bar */}
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.aiBadge}>
                <Ionicons name="sparkles" size={12} color="rgba(255,255,255,0.9)" />
              </View>
              <Text style={styles.headerTitle}>Ask AI</Text>
              {scanContext?.itemName ? (
                <Text style={styles.headerSub} numberOfLines={1}>
                  · {scanContext.itemName}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={10}>
              <Ionicons name="close" size={18} color={C.text3} />
            </Pressable>
          </View>

          {/* Messages */}
          <ScrollView
            ref={scrollRef}
            style={styles.messageList}
            contentContainerStyle={styles.messageContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Suggested prompts (shown when empty) */}
            {messages.length === 0 && !loading ? (
              <View style={styles.suggestionsWrap}>
                <Text style={styles.suggestionsLabel}>Suggested questions</Text>
                <View style={styles.chips}>
                  {PROMPTS.map((p) => (
                    <Pressable
                      key={p}
                      onPress={() => send(p)}
                      style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                    >
                      <Text style={styles.chipText}>{p}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Message bubbles */}
            {messages.map((m, i) => (
              <View
                key={i}
                style={[
                  styles.bubble,
                  m.role === "user" ? styles.bubbleUser : styles.bubbleAI,
                ]}
              >
                {m.role === "assistant" ? (
                  <View style={styles.aiAvatarRow}>
                    <View style={styles.aiDot} />
                    <Text style={styles.bubbleTextAI}>{m.content}</Text>
                  </View>
                ) : (
                  <Text style={styles.bubbleTextUser}>{m.content}</Text>
                )}
              </View>
            ))}

            {/* Loading indicator */}
            {loading ? (
              <View style={[styles.bubble, styles.bubbleAI]}>
                <View style={styles.aiAvatarRow}>
                  <View style={styles.aiDot} />
                  <ActivityIndicator size="small" color={C.text3} />
                </View>
              </View>
            ) : null}
          </ScrollView>

          {/* Input bar */}
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ask about this item…"
              placeholderTextColor={C.text4}
              returnKeyType="send"
              onSubmitEditing={() => send(input)}
              multiline
              maxLength={500}
              blurOnSubmit={false}
            />
            <Pressable
              onPress={() => send(input)}
              disabled={!input.trim() || loading}
              style={({ pressed }) => [
                styles.sendBtn,
                (!input.trim() || loading) && styles.sendBtnDisabled,
                pressed && styles.sendBtnPressed,
              ]}
            >
              <Ionicons
                name="arrow-up"
                size={16}
                color={input.trim() && !loading ? "#000" : C.text4}
              />
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  kavWrap: {
    flex: 1,
    justifyContent: "flex-end",
  },
  drawer: {
    borderTopLeftRadius: R.xxl,
    borderTopRightRadius: R.xxl,
    overflow: "hidden",
    maxHeight: "82%",
    minHeight: 320,
    backgroundColor: "rgba(10,10,10,0.96)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(6,6,6,0.72)",
  },

  // Handle
  handleRow: {
    alignItems: "center",
    paddingTop: SP.md,
    paddingBottom: SP.sm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.18)",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SP.lg,
    paddingBottom: SP.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
    minWidth: 0,
  },
  aiBadge: {
    width: 24,
    height: 24,
    borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.20)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...TY.h3,
    color: C.text,
  },
  headerSub: {
    ...TY.label,
    color: C.text4,
    flex: 1,
    fontSize: 11,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Messages
  messageList: {
    flex: 1,
  },
  messageContent: {
    padding: SP.lg,
    gap: SP.sm,
    paddingBottom: SP.md,
  },

  // Suggested prompts
  suggestionsWrap: {
    marginBottom: SP.md,
  },
  suggestionsLabel: {
    ...TY.cap,
    color: C.text4,
    letterSpacing: 0.8,
    marginBottom: SP.sm,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SP.sm,
  },
  chip: {
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm,
    borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  chipPressed: {
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  chipText: {
    ...TY.label,
    color: C.text2,
    fontSize: 12,
  },

  // Bubbles
  bubble: {
    maxWidth: "88%",
  },
  bubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: R.lg,
    borderBottomRightRadius: R.xs,
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm + 2,
  },
  bubbleAI: {
    alignSelf: "flex-start",
  },
  aiAvatarRow: {
    flexDirection: "row",
    gap: SP.sm,
    alignItems: "flex-start",
  },
  aiDot: {
    width: 6,
    height: 6,
    borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.45)",
    marginTop: 5,
    flexShrink: 0,
  },
  bubbleTextUser: {
    ...TY.body,
    color: C.text,
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleTextAI: {
    ...TY.body,
    color: C.text2,
    fontSize: 14,
    lineHeight: 21,
    flex: 1,
  },

  // Input
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: SP.sm,
    paddingHorizontal: SP.lg,
    paddingTop: SP.sm,
    paddingBottom: SP.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.07)",
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: R.lg,
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm + 2,
    color: C.text,
    fontSize: 14,
    fontWeight: "500",
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: R.pill,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  sendBtnPressed: {
    transform: [{ scale: 0.93 }],
  },
});
