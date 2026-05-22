/**
 * NegotiationCoach — real-time streaming negotiation chat drawer.
 *
 * Slide-up drawer powered by GPT-4.1-mini streaming SSE.
 * Pre-seeded with deal context (listing price, market median, verdict).
 * Suggested openers auto-populate based on deal type.
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

const IS_ANDROID = Platform.OS === "android";

export interface NegotiationContext {
  itemName?: string | null;
  listingPrice?: number | null;
  marketMedian?: number | null;
  dealVerdict?: string | null;
  itemCategory?: string | null;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

interface NegotiationCoachProps {
  visible: boolean;
  context: NegotiationContext;
  apiBase: string;
  onClose: () => void;
}

const hapticLight = () => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} };

function buildOpeners(ctx: NegotiationContext): string[] {
  const price = ctx.listingPrice;
  const median = ctx.marketMedian;
  const item = ctx.itemName || "this item";

  const openers: string[] = [];
  if (price && median && price > median * 1.1) {
    openers.push(`They're asking $${price}, market says $${Math.round(median)}. What should I offer?`);
  }
  openers.push(`What's the best opening offer for ${item}?`);
  openers.push(`They said no to my first offer. What do I say next?`);
  openers.push(`How do I walk away without looking desperate?`);
  if (price) openers.push(`How low can I realistically go from $${price}?`);
  return openers.slice(0, 4);
}

export function NegotiationCoach({ visible, context, apiBase, onClose }: NegotiationCoachProps) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const abortRef = useRef<(() => void) | null>(null);

  // Fade-only to prevent overlay bleed/pixelation.
  // Was translateY 600→0 spring; now opacity + 4-px nudge so the dark
  // background underneath doesn't drag upward during entry.
  const sheetOpacity = useSharedValue(0);
  const sheetNudge   = useSharedValue(4);
  const animStyle = useAnimatedStyle(() => ({
    opacity: sheetOpacity.value,
    transform: [{ translateY: sheetNudge.value }],
  }));

  useEffect(() => {
    if (visible) {
      sheetOpacity.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) });
      sheetNudge.value   = withTiming(0, { duration: 240, easing: Easing.out(Easing.cubic) });
    } else {
      sheetOpacity.value = withTiming(0, { duration: 180 });
      sheetNudge.value   = withTiming(4, { duration: 180 });
      abortRef.current?.();
      setMessages([]);
      setInput("");
      setStreaming(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;
    hapticLight();

    const userMsg: Message = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages([...newMessages, { role: "assistant", content: "", streaming: true }]);
    setInput("");
    setStreaming(true);

    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);

    try {
      const controller = new AbortController();
      abortRef.current = () => controller.abort();

      const res = await fetch(`${apiBase}/api/negotiate/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          context: {
            itemName:    context.itemName,
            listingPrice: context.listingPrice,
            marketMedian: context.marketMedian,
            dealVerdict:  context.dealVerdict,
            itemCategory: context.itemCategory,
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: "assistant", content: "Server error — try again." },
        ]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value, { stream: true }).split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const json = JSON.parse(line.slice(6));
            if (json.done) break;
            if (json.chunk) {
              accumulated += json.chunk;
              setMessages((prev) => [
                ...prev.slice(0, -1),
                { role: "assistant", content: accumulated, streaming: true },
              ]);
              scrollRef.current?.scrollToEnd({ animated: false });
            }
          } catch {}
        }
      }

      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: "assistant", content: accumulated },
      ]);
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: "assistant", content: "Could not reach server — check your connection." },
        ]);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages, streaming, context, apiBase]);

  const openers = buildOpeners(context);

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      {/* Backdrop */}
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose}>
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.45)" }]} />
      </Pressable>

      <Animated.View
        style={[styles.sheet, { paddingBottom: insets.bottom + 12 }, animStyle]}
        renderToHardwareTextureAndroid={IS_ANDROID}
        shouldRasterizeIOS={!IS_ANDROID}
      >
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.iconBadge}>
              <Ionicons name="chatbubble-ellipses" size={18} color="rgba(0,200,120,0.95)" />
            </View>
            <View>
              <Text style={styles.headerTitle} allowFontScaling={false} numberOfLines={1}>
                Negotiation Coach
              </Text>
              <Text style={styles.headerSub} allowFontScaling={false} numberOfLines={1}>
                {context.listingPrice && context.marketMedian
                  ? `Listed $${context.listingPrice} · Market $${Math.round(context.marketMedian)}`
                  : context.itemName || "AI-powered haggling"}
              </Text>
            </View>
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color="rgba(255,255,255,0.5)" />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={0}
        >
          {/* Messages */}
          <ScrollView
            ref={scrollRef}
            style={styles.messages}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="interactive"
          >
            {messages.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>What&apos;s your situation?</Text>
                <Text style={styles.emptySub}>Tap a prompt or type your own</Text>
                <View style={styles.openers}>
                  {openers.map((o, i) => (
                    <Pressable key={i} onPress={() => sendMessage(o)} style={styles.openerChip}>
                      <Text style={styles.openerText}>{o}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : (
              messages.map((msg, i) => (
                <View key={i} style={[styles.bubble, msg.role === "user" ? styles.userBubble : styles.aiBubble]}>
                  <Text style={[styles.bubbleText, msg.role === "user" ? styles.userText : styles.aiText]}>
                    {msg.content}
                    {msg.streaming ? <Text style={{ opacity: 0.5 }}>▋</Text> : null}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>

          {/* Input */}
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              value={input}
              onChangeText={setInput}
              placeholder="What's your move?"
              placeholderTextColor="rgba(255,255,255,0.3)"
              style={styles.textInput}
              multiline
              returnKeyType="send"
              onSubmitEditing={() => sendMessage(input)}
              editable={!streaming}
            />
            <Pressable
              onPress={() => sendMessage(input)}
              disabled={!input.trim() || streaming}
              style={[styles.sendBtn, (!input.trim() || streaming) && { opacity: 0.35 }]}
            >
              <Ionicons name={streaming ? "ellipsis-horizontal" : "arrow-up"} size={18} color="black" />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "80%",
    backgroundColor: "rgba(10,10,10,0.97)",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    shadowColor: "#000",
    shadowOpacity: 0.7,
    shadowRadius: 50,
    shadowOffset: { width: 0, height: -10 },
    overflow: "hidden",
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SP.lg,
    paddingVertical: SP.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: R.md,
    backgroundColor: "rgba(0,200,120,0.12)",
    borderWidth: 1,
    borderColor: "rgba(0,200,120,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...TY.label,
    color: "white",
    fontSize: 15,
  },
  headerSub: {
    ...TY.cap,
    color: C.text3,
    marginTop: 1,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    padding: SP.lg,
    paddingBottom: SP.sm,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    paddingTop: SP.xl,
  },
  emptyTitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 4,
  },
  emptySub: {
    ...TY.cap,
    color: C.text3,
    marginBottom: SP.lg,
  },
  openers: {
    gap: SP.sm,
  },
  openerChip: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    paddingHorizontal: SP.md,
    paddingVertical: 12,
  },
  openerText: {
    color: "rgba(255,255,255,0.80)",
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },
  bubble: {
    maxWidth: "88%",
    borderRadius: R.lg,
    paddingHorizontal: SP.md,
    paddingVertical: 10,
    marginBottom: SP.sm,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  aiBubble: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,200,120,0.10)",
    borderWidth: 1,
    borderColor: "rgba(0,200,120,0.20)",
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "500",
  },
  userText: {
    color: "rgba(255,255,255,0.92)",
  },
  aiText: {
    color: "rgba(200,255,230,0.95)",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: SP.sm,
    paddingHorizontal: SP.lg,
    paddingTop: SP.sm,
    paddingBottom: SP.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  textInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    color: "white",
    fontSize: 15,
    paddingHorizontal: SP.md,
    paddingTop: 12,
    paddingBottom: 12,
    maxHeight: 120,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
  },
});
