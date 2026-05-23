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
  Keyboard,
  Platform,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
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
  /**
   * Stable scan identifier — used to scope chat history per scan. Each scan
   * gets its own AsyncStorage bucket so reopening an old scan from history
   * restores its conversation, while a fresh scan starts empty. Falls back
   * to a content-derived key (itemName + scannedPrice) when scanId is null.
   */
  scanId?: string | null;
}

// Cap on the number of messages we persist per scan. Above this we drop
// the oldest turn pairs — keeps storage bounded and load times instant.
const MAX_PERSISTED_MESSAGES = 60;

// ─── Suggested prompts ────────────────────────────────────────────────────────

const PROMPTS = [
  "Is this a good deal?",
  "Should I buy this?",
  "What should I offer the seller?",
  "Will this flip well?",
  "What's a fair price to pay?",
];

// ─── Component ───────────────────────────────────────────────────────────────

export function AskAIDrawer({ visible, scanContext, apiBase, onClose, scanId }: AskAIDrawerProps) {
  const insets    = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef  = useRef<TextInput>(null);

  // Stable per-scan storage key. Prefer the server-side scanId when
  // available; fall back to a content hash built from itemName +
  // scannedPrice so two different scans of the same listing get the
  // same continuation while two scans of different items stay isolated.
  // If neither identifier is present, return null and skip persistence
  // entirely — better to lose chat than to leak someone else's reply.
  const storageKey: string | null = React.useMemo(() => {
    if (scanId) return `ask_ai_chat:${scanId}`;
    const name = (scanContext?.itemName || scanContext?.visionQuery || "").trim();
    const price = Number.isFinite(Number(scanContext?.scannedPrice))
      ? Math.round(Number(scanContext?.scannedPrice) * 100) : null;
    if (!name) return null;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48);
    return `ask_ai_chat:item:${slug}:${price ?? "x"}`;
  }, [scanId, scanContext?.itemName, scanContext?.visionQuery, scanContext?.scannedPrice]);

  // Opacity-only entrance. The prior version added a 4px translateY nudge
  // on top of the opacity tween; with the keyboard open that small lift
  // visibly shifted the input row and re-triggered the keyboard's avoid-
  // padding measurement, which read as a "drawer jumps when keyboard
  // appears" jitter. Pure opacity = no motion = no jitter.
  const drawerOpacity = useSharedValue(0);
  const backdropOp    = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      backdropOp.value    = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
      drawerOpacity.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) });
      setTimeout(() => inputRef.current?.focus(), 280);
    } else {
      backdropOp.value    = withTiming(0, { duration: 180 });
      drawerOpacity.value = withTiming(0, { duration: 180 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Per-scan hydration. When the drawer becomes visible OR the storageKey
  // changes (new scan, scan revisited from history), load that scan's
  // saved chat. When the key changes WHILE the drawer is closed we still
  // wipe the in-memory log so reopening doesn't briefly flash the prior
  // scan's transcript before the load resolves.
  const prevKeyRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!storageKey) {
        if (!cancelled) setMessages([]);
        prevKeyRef.current = null;
        return;
      }
      if (prevKeyRef.current === storageKey && !visible) return;
      prevKeyRef.current = storageKey;
      try {
        setHydrating(true);
        const raw = await AsyncStorage.getItem(storageKey);
        if (cancelled) return;
        if (!raw) {
          setMessages([]);
          console.log("ASK_AI_CHAT_LOAD", { key: storageKey, count: 0 });
        } else {
          const parsed = JSON.parse(raw);
          const list = Array.isArray(parsed?.messages) ? parsed.messages : [];
          const sanitized: Message[] = list
            .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
            .map((m: any) => ({ role: m.role, content: m.content }));
          setMessages(sanitized);
          console.log("ASK_AI_CHAT_LOAD", { key: storageKey, count: sanitized.length });
        }
      } catch (e: any) {
        console.log("ASK_AI_CHAT_LOAD_ERROR", { key: storageKey, error: e?.message || String(e) });
        if (!cancelled) setMessages([]);
      } finally {
        if (!cancelled) setHydrating(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [storageKey, visible]);

  // Persist on every change to messages. Debounced via a microtask so
  // back-to-back appends (user msg + assistant reply) coalesce into one
  // storage write. setItem failures log but never throw.
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!storageKey) return;
    if (hydrating) return; // don't overwrite during initial load
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(async () => {
      try {
        const trimmed = messages.slice(-MAX_PERSISTED_MESSAGES);
        await AsyncStorage.setItem(storageKey, JSON.stringify({ messages: trimmed, savedAt: Date.now() }));
        console.log("ASK_AI_CHAT_SAVE", { key: storageKey, count: trimmed.length });
      } catch (e: any) {
        console.log("ASK_AI_CHAT_SAVE_ERROR", { key: storageKey, error: e?.message || String(e) });
      }
    }, 220);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [messages, storageKey, hydrating]);

  const drawerStyle = useAnimatedStyle(() => ({
    opacity: drawerOpacity.value,
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOp.value,
  }));

  // Keyboard-only dismiss. Hitting Done collapses the keyboard but keeps
  // the drawer mounted. Closing the drawer is reserved for the X button.
  const dismissKeyboardOnly = useCallback(() => {
    try { Keyboard.dismiss(); } catch {}
  }, []);
  const [kbVisible, setKbVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setKbVisible(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKbVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

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
    const requestBody = { messages: nextMessages, scanContext };
    console.log("ASK_AI_SEND_START", {
      apiBase,
      messageCount: nextMessages.length,
      preview: trimmed.slice(0, 80),
      item: scanContext?.itemName || null,
    });
    console.log("ASK_AI_SEND_REQUEST_BODY", {
      url: `${apiBase}/api/ask`,
      bodyPreview: JSON.stringify(requestBody).slice(0, 280),
    });

    // Scroll to bottom after user message
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);

    // Multi-field reply extraction. Server canonical shape is {ok, reply},
    // but we accept every plausible alternate so a field-rename on the
    // backend can't render a blank bubble. Covers our own shapes
    // ({reply, answer, message, text, content}, data.* variants), the
    // OpenAI Chat shape (choices[0].message.content / choices[0].text), the
    // OpenAI Responses shape (output_text / output[0].content[0].text), and
    // Anthropic Messages (content[0].text). If nothing extracts cleanly we
    // surface the raw keys + status so the user (and logs) see what came
    // back instead of an empty assistant turn.
    // Reply extractor — every documented shape from every provider we (or
    // any future middleware) might route through. Order matches likelihood:
    // server's canonical {reply} first, then alias keys, then OpenAI Chat,
    // OpenAI Responses, Anthropic Messages, and a final defensive sweep
    // for `response/result/completion` keys some proxies wrap.
    const extractReply = (j: any): { text: string | null; source: string } => {
      if (!j || typeof j !== "object") return { text: null, source: "non_object" };
      const candidates: { value: any; src: string }[] = [
        // Server canonical
        { value: j.reply,                                              src: "reply" },
        { value: j.answer,                                             src: "answer" },
        { value: j.message,                                            src: "message" },
        { value: j.text,                                               src: "text" },
        { value: j.content,                                            src: "content" },
        // data.* wrappers
        { value: j.data?.reply,                                        src: "data.reply" },
        { value: j.data?.answer,                                       src: "data.answer" },
        { value: j.data?.message,                                      src: "data.message" },
        { value: j.data?.text,                                         src: "data.text" },
        { value: j.data?.content,                                      src: "data.content" },
        // Proxy / middleware wrappers
        { value: j.response,                                           src: "response" },
        { value: j.result,                                             src: "result" },
        { value: j.completion,                                         src: "completion" },
        // OpenAI Chat Completions
        { value: j.choices?.[0]?.message?.content,                     src: "choices[0].message.content" },
        { value: j.choices?.[0]?.text,                                 src: "choices[0].text" },
        // OpenAI Responses API
        { value: j.output_text,                                        src: "output_text" },
        { value: j.output?.[0]?.content?.[0]?.text,                    src: "output[0].content[0].text" },
        { value: j.output?.[0]?.content?.[0]?.content,                 src: "output[0].content[0].content" },
        // Anthropic Messages
        { value: Array.isArray(j.content) ? j.content?.[0]?.text    : null, src: "content[0].text" },
        { value: Array.isArray(j.content) ? j.content?.[0]?.content : null, src: "content[0].content" },
      ];
      for (const c of candidates) {
        if (typeof c.value === "string" && c.value.trim()) {
          return { text: c.value.trim(), source: c.src };
        }
      }
      return { text: null, source: "none" };
    };

    try {
      const resp = await fetch(`${apiBase}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(20000),
      });
      console.log("ASK_AI_SEND_HTTP_STATUS", { status: resp.status, ok: resp.ok });
      const rawText = await resp.text();
      // Spec-required raw log — before JSON.parse so we see exactly what
      // came over the wire even when the body isn't valid JSON. 500-char
      // preview matches the error-bubble truncation below so log + UI
      // stay in lockstep.
      console.log("ASK_AI_RAW_RESPONSE_TEXT", {
        status: resp.status, len: rawText.length, preview: rawText.slice(0, 500),
      });
      console.log("ASK_AI_SEND_RAW_RESPONSE", {
        len: rawText.length, preview: rawText.slice(0, 400),
      });
      let json: any = {};
      let parseError: string | null = null;
      try { json = rawText ? JSON.parse(rawText) : {}; }
      catch (e: any) { parseError = e?.message || "parse_error"; json = { _raw: rawText }; }
      const parsedKeys = json && typeof json === "object" ? Object.keys(json) : [];
      console.log("ASK_AI_PARSED_KEYS", { keys: parsedKeys, parseError });

      const { text: reply, source: replySource } = extractReply(json);
      // Trimmed-length check matches the render-time gate so we never
      // accept whitespace-only content into the message array.
      const replyTrimmed = typeof reply === "string" ? reply.trim() : "";
      if (!resp.ok || json?.ok === false || replyTrimmed.length === 0) {
        console.log("ASK_AI_EXTRACT_REPLY_EMPTY", {
          status: resp.status,
          keys: parsedKeys,
          replySource,
          rawPreview: rawText.slice(0, 500),
          parseError,
        });
        const errMsg =
          json?.error ||
          json?.message ||
          parseError ||
          (replyTrimmed
            ? null
            : `No reply field. Server keys: ${parsedKeys.join(", ") || "(none)"}`) ||
          `HTTP ${resp.status}`;
        console.log("ASK_AI_SEND_ERROR", { status: resp.status, error: errMsg, ms: Date.now() - startedAt });
        // Visible error bubble — surfaces the actual parsed keys + raw
        // preview so a backend rename gets diagnosed in-product instead
        // of from logs. Always non-empty so the render-time fallback
        // never has to fire.
        const errBody = [
          `I couldn't read a reply from the server.`,
          `Error: ${errMsg}`,
          parsedKeys.length ? `Keys: ${parsedKeys.join(", ")}` : null,
          rawText ? `Raw: ${rawText.slice(0, 500)}` : null,
        ].filter(Boolean).join("\n");
        setMessages((prev) => [...prev, { role: "assistant", content: errBody }]);
        return;
      }
      console.log("ASK_AI_EXTRACT_REPLY_SUCCESS", {
        replySource, replyLen: replyTrimmed.length, preview: replyTrimmed.slice(0, 120),
      });
      console.log("ASK_AI_SEND_PARSED_REPLY", {
        replyLen: replyTrimmed.length, preview: replyTrimmed.slice(0, 120), ms: Date.now() - startedAt,
      });
      // Final guard — never push an empty assistant turn.
      if (replyTrimmed.length === 0) return;
      setMessages((prev) => [...prev, { role: "assistant", content: replyTrimmed }]);
    } catch (e: any) {
      console.log("ASK_AI_SEND_ERROR", { error: e?.message || String(e), ms: Date.now() - startedAt });
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

      {/* Centered floating panel. KeyboardAvoidingView with behavior="padding"
          shrinks the available space from below when the keyboard appears,
          and `justifyContent: 'center'` re-centers the panel inside the
          remaining viewport — input + chat travel together as a single
          locked unit, no slide-up sheet, no drag, no re-measure flicker.
          marginHorizontal gives the panel a clear premium float against
          the dimmed backdrop. */}
      <KeyboardAvoidingView
        style={styles.kavWrap}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        // The KAV fills the entire window (parent is StyleSheet.absoluteFill)
        // so its top edge IS the device top — no offset needed. The earlier
        // insets.top offset over-corrected and pushed the centered panel
        // up too far when the keyboard opened, which read as a "drawer
        // jumps" jitter the moment the input focused.
        keyboardVerticalOffset={0}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.drawer, drawerStyle]}>
          {/* Glass backing */}
          {Platform.OS === "ios" ? (
            <BlurView intensity={78} tint="dark" style={StyleSheet.absoluteFillObject} />
          ) : null}
          <View style={styles.drawerOverlay} />

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
            {/* Done — keyboard-only dismiss. Only appears while the keyboard
                is up so the header doesn't feel cluttered when it's not
                needed. Tapping Done collapses the keyboard but keeps the
                drawer mounted. The X is still the only way to close. */}
            {kbVisible ? (
              <Pressable onPress={dismissKeyboardOnly} style={styles.doneBtn} hitSlop={10}>
                <Text style={styles.doneBtnText}>Done</Text>
              </Pressable>
            ) : null}
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
            {messages.length === 0 && !loading && !hydrating ? (
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

            {/* Message bubbles. Belt-and-suspenders: even though every
                code path that mutates `messages` already refuses to push
                an empty assistant turn, render-time still falls back to a
                visible retry string if some legacy persisted message
                somehow slipped in with whitespace-only content. The user
                must never see a stub bubble. */}
            {messages.map((m, i) => {
              const txt = typeof m.content === "string" ? m.content.trim() : "";
              if (m.role === "assistant") {
                const display = txt || "I couldn't generate an answer for this item. Tap send to retry.";
                return (
                  <View key={i} style={[styles.bubble, styles.bubbleAI]}>
                    <View style={styles.aiAvatarRow}>
                      <View style={styles.aiDot} />
                      <Text style={styles.bubbleTextAI}>{display}</Text>
                    </View>
                  </View>
                );
              }
              if (!txt) return null;
              return (
                <View key={i} style={[styles.bubble, styles.bubbleUser]}>
                  <Text style={styles.bubbleTextUser}>{txt}</Text>
                </View>
              );
            })}

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
          <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom * 0.4, SP.sm) }]}>
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
    justifyContent: "center",
    alignItems: "stretch",
    paddingHorizontal: SP.lg,
  },
  // Drawer sizes to its children — header (≈64px) + bounded message list
  // (maxHeight 320px, scrolls past that) + input row (≈64px). Hard pixel
  // cap of 520 means it never expands into the safe-area / dynamic-island
  // even on long conversations; the prior `maxHeight: "78%"` + `flex:1`
  // on the message list combined to force the drawer to fill 78% of the
  // available KAV space regardless of how little content was inside, which
  // is what produced the "panel pinned to the top of the screen" bug in
  // the field screenshots.
  drawer: {
    borderRadius: R.xxl,
    overflow: "hidden",
    maxHeight: 520,
    backgroundColor: "rgba(10,10,10,0.96)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(6,6,6,0.72)",
  },

  // ── Done button (keyboard-only dismiss) ────────────────────────────────────
  doneBtn: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: SP.xs,
  },
  doneBtnText: {
    ...TY.label,
    color: C.text2,
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 0.3,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SP.lg,
    paddingTop: SP.lg,
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

  // Messages — bounded scroll area instead of flex:1. With flex:1 the
  // ScrollView demanded all available drawer space, which forced the
  // drawer's `maxHeight: 78%` to actually materialize even when only the
  // suggested-questions strip was on screen. Hard 320px cap means the
  // panel stays compact when empty and only grows the visible chat
  // window once messages exist.
  messageList: {
    maxHeight: 320,
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
