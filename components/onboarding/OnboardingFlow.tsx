/**
 * Evan AI — Onboarding Survey Flow
 * Premium pre-tutorial survey: 5 questions, glassmorphism cards,
 * ascending haptics, animated specular highlights, camera-bg (when granted).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated as RNAnimated,
  Dimensions,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing as REasing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, R, SP, TY, MO, SH } from "../design/DS";
import { useSpatialZone } from "../spatial/SpatialContext";

const IOS = Platform.OS === "ios";
const { width: PAGE_W } = Dimensions.get("window");

// ─── Types ────────────────────────────────────────────────────────────────────

// All fields required on completion — "not_specified" fills any gap from Skip.
export interface SurveyAnswers {
  motivation: string;
  intent: string;
  experience: string;
  riskLevel: string;
  goal: string;
}

// Safe defaults — ensures downstream agents never receive undefined/null.
const SAFE_DEFAULTS: SurveyAnswers = {
  motivation: "not_specified",
  intent:     "not_specified",
  experience: "not_specified",
  riskLevel:  "not_specified",
  goal:       "not_specified",
};

interface OptionDef {
  id: string;
  label: string;
}

interface QuestionDef {
  key: keyof SurveyAnswers;
  screenIndex: number; // 1–5
  title: string;
  subtitle: string;
  options: OptionDef[];
  hapticLevel: "light" | "medium";
}

interface OnboardingFlowProps {
  cameraPermissionGranted: boolean;
  onComplete: (answers: SurveyAnswers, goTutorial: boolean) => void;
}

// ─── Survey questions ─────────────────────────────────────────────────────────

const QUESTIONS: QuestionDef[] = [
  {
    key: "motivation",
    screenIndex: 1,
    title: "Why are you here?",
    subtitle: "Be honest — we calibrate everything to you.",
    options: [
      { id: "extra_cash", label: "I want to make some extra cash" },
      { id: "avoid_rip",  label: "I don't want to get ripped off" },
      { id: "serious",    label: "I'm serious about making real profit" },
      { id: "smarter",   label: "I want to make smarter decisions" },
      { id: "curious",   label: "Just curious how this works" },
    ],
    hapticLevel: "light",
  },
  {
    key: "intent",
    screenIndex: 2,
    title: "What do you want help with?",
    subtitle: "Pick whatever feels closest.",
    options: [
      { id: "find_deals",  label: "Finding great deals before I buy" },
      { id: "know_worth",  label: "Knowing what something is actually worth" },
      { id: "flip",        label: "Flipping items for profit" },
      { id: "never_over",  label: "Never overpaying for anything" },
      { id: "all",         label: "All of the above" },
    ],
    hapticLevel: "light",
  },
  {
    key: "experience",
    screenIndex: 3,
    title: "How experienced are you?",
    subtitle: "No judgment — we meet you where you are.",
    options: [
      { id: "beginner",    label: "Completely new to this" },
      { id: "some",        label: "Done it a handful of times" },
      { id: "experienced", label: "Fairly experienced" },
      { id: "pro",         label: "I do this regularly" },
    ],
    hapticLevel: "light",
  },
  {
    key: "riskLevel",
    screenIndex: 4,
    title: "How do you feel about risk?",
    subtitle: "This shapes your deal recommendations.",
    options: [
      { id: "safe",       label: "I play it safe — always" },
      { id: "small",      label: "Small risks are fine if the reward's clear" },
      { id: "calculated", label: "I'm comfortable with calculated risks" },
      { id: "bold",       label: "I go big when I see the upside" },
    ],
    hapticLevel: "medium",
  },
  {
    key: "goal",
    screenIndex: 5,
    title: "What matters most to you?",
    subtitle: "Pick your north star.",
    options: [
      { id: "consistent", label: "Making consistent profit" },
      { id: "no_loss",    label: "Never losing money" },
      { id: "gems",       label: "Finding hidden gems" },
      { id: "understand", label: "Understanding the market" },
      { id: "build",      label: "Building something serious" },
    ],
    hapticLevel: "medium",
  },
];

const TOTAL_SCREENS = 7; // 0=Entry, 1–5=Questions, 6=Final

// ─── Specular edge (animated top highlight on glass cards) ────────────────────

function SpecularEdge() {
  const op = useSharedValue(0.25);

  useEffect(() => {
    op.value = withRepeat(
      withSequence(
        withTiming(0.65, { duration: 3000, easing: REasing.inOut(REasing.sin) }),
        withTiming(0.25, { duration: 3000, easing: REasing.inOut(REasing.sin) }),
      ),
      -1,
      false,
    );
  }, []);

  const style = useAnimatedStyle(() => ({ opacity: op.value }));

  return <Animated.View pointerEvents="none" style={[s.specularEdge, style]} />;
}

// ─── Shimmer bar (moving specular diagonal strip) ─────────────────────────────

function ShimmerBar() {
  const tx = useSharedValue(-PAGE_W * 0.5);

  useEffect(() => {
    tx.value = withRepeat(
      withSequence(
        withTiming(PAGE_W * 0.8, { duration: 6500, easing: REasing.inOut(REasing.sin) }),
        withTiming(-PAGE_W * 0.5, { duration: 0 }),
      ),
      -1,
      false,
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { rotate: "20deg" }] as any,
  }));

  return <Animated.View pointerEvents="none" style={[s.shimmerBar, style]} />;
}

// ─── Option card ──────────────────────────────────────────────────────────────

interface OptionCardProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

function OptionCard({ label, selected, onPress }: OptionCardProps) {
  // Stability pass (2026-05-22): removed the scale 0.97 spring on press —
  // it caused visible pixelation on Android during the press window and
  // contributed to the "stuck button" feel when a quick double-tap aborted
  // the onPressOut. Press feedback is now an opacity dip via Pressable's
  // built-in style callback, which doesn't touch the GPU transform tree at
  // all. The selected-check still animates via Reanimated since that
  // animation is short, single-shot, and survives any tap timing.
  const prog = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    prog.value = withSpring(selected ? 1 : 0, MO.spring.snappy);
  }, [selected]);

  const cardStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(255,255,255,${interpolate(prog.value, [0, 1], [0.06, 0.15])})`,
    borderColor:     `rgba(255,255,255,${interpolate(prog.value, [0, 1], [0.10, 0.38])})`,
  }));

  const checkStyle = useAnimatedStyle(() => ({
    opacity:   prog.value,
    transform: [{ scale: interpolate(prog.value, [0, 1], [0.4, 1]) }],
  }));

  return (
    <Pressable
      onPress={onPress}
      // Built-in press opacity dip — no Reanimated, no transform, no pixelation.
      // hitSlop expands the touch target so quick taps don't miss.
      hitSlop={6}
      style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Animated.View style={[s.optionCard, cardStyle]}>
        <Text style={s.optionLabel} numberOfLines={2}>{label}</Text>
        <Animated.View style={[s.checkCircle, checkStyle]}>
          <Text style={s.checkMark}>✓</Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
// Uses pixel width (not %) — safe for Reanimated UI-thread worklets.

const PROGRESS_TRACK_W = 72; // matches s.progressTrack width

function ProgressBar({ step, total }: { step: number; total: number }) {
  const targetFrac = Math.max(0, Math.min(1, step / total));
  // Initialize to current value so first render is already correct — no 0→n flicker.
  const pct = useSharedValue(targetFrac);

  useEffect(() => {
    pct.value = withSpring(Math.max(0, Math.min(1, step / total)), MO.spring.gentle);
  }, [step, total]);

  const fillStyle = useAnimatedStyle(() => ({
    width: pct.value * PROGRESS_TRACK_W,
  }));

  return (
    <View style={s.progressTrack}>
      <Animated.View style={[s.progressFill, fillStyle]} />
    </View>
  );
}

// ─── Glow CTA button ──────────────────────────────────────────────────────────

interface GlowBtnProps {
  label: string;
  onPress: () => void;
  fullWidth?: boolean;
}

function GlowBtn({ label, onPress, fullWidth }: GlowBtnProps) {
  const scale    = useSharedValue(1);
  const glowPulse = useSharedValue(0.4);

  useEffect(() => {
    glowPulse.value = withRepeat(
      withSequence(
        withTiming(1,   { duration: 2200, easing: REasing.inOut(REasing.sin) }),
        withTiming(0.4, { duration: 2200, easing: REasing.inOut(REasing.sin) }),
      ),
      -1,
      false,
    );
  }, []);

  const btnStyle = useAnimatedStyle(() => ({
    transform:    [{ scale: scale.value }],
    shadowOpacity: IOS ? glowPulse.value * 0.50 : 0,
  }));

  return (
    <Pressable
      onPressIn={()  => { scale.value = withSpring(0.96, MO.spring.snappy); }}
      onPressOut={() => { scale.value = withSpring(1.0,  MO.spring.bouncy); }}
      onPress={onPress}
    >
      <Animated.View style={[s.glowBtn, fullWidth && s.glowBtnFull, btnStyle]}>
        <Text style={s.glowBtnText}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

// ─── Ghost button (secondary) ─────────────────────────────────────────────────

interface GhostBtnProps {
  label: string;
  onPress: () => void;
}

function GhostBtn({ label, onPress }: GhostBtnProps) {
  const scale      = useSharedValue(1);
  const ghostStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPressIn={() => { scale.value = withSpring(0.97, MO.spring.snappy); }}
      onPressOut={() => { scale.value = withSpring(1.0,  MO.spring.bouncy); }}
      onPress={onPress}
    >
      <Animated.View style={[s.ghostBtn, ghostStyle]}>
        <Text style={s.ghostBtnText}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

// ─── Entry screen ─────────────────────────────────────────────────────────────

function EntryScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <View style={s.entryWrap}>
      {/* Soft glow orb */}
      <View style={s.entryGlowOrb} pointerEvents="none" />

      {/* Glass card */}
      <View style={[s.glassCard, s.entryCard]}>
        <View style={[StyleSheet.absoluteFillObject, { overflow: "hidden", borderRadius: R.xxl }]} pointerEvents="none">
          <ShimmerBar />
        </View>
        <SpecularEdge />

        <Text style={s.eyebrow}>EVAN AI</Text>
        <Text style={s.entryTitle}>Welcome to{"\n"}Evan AI.</Text>
        <Text style={s.entrySub}>
          Before we begin, answer this quick set of questions.{"\n"}Takes about 30 seconds.
        </Text>
      </View>

      <View style={s.entryCta}>
        <GlowBtn label="Continue" onPress={onContinue} fullWidth />
      </View>
    </View>
  );
}

// ─── Question screen ──────────────────────────────────────────────────────────

interface QuestionScreenProps {
  question: QuestionDef;
  answers: Partial<SurveyAnswers>;
  onAnswer: (question: QuestionDef, optionId: string) => void;
}

function QuestionScreen({ question, answers, onAnswer }: QuestionScreenProps) {
  const selectedId = answers[question.key];

  return (
    <View style={s.questionWrap}>
      <View style={s.questionHeader}>
        <Text style={s.questionTitle}>{question.title}</Text>
        <Text style={s.questionSub}>{question.subtitle}</Text>
      </View>

      <View style={s.optionList}>
        {question.options.map((opt) => (
          <OptionCard
            key={opt.id}
            label={opt.label}
            selected={selectedId === opt.id}
            onPress={() => onAnswer(question, opt.id)}
          />
        ))}
      </View>
    </View>
  );
}

// ─── Final screen ─────────────────────────────────────────────────────────────

interface FinalScreenProps {
  onStartScanning: () => void;
  onExploreTutorial: () => void;
  cameraGranted: boolean;
  onRequestCamera: () => void;
}

function FinalScreen({ onStartScanning, onExploreTutorial, cameraGranted, onRequestCamera }: FinalScreenProps) {
  return (
    <View style={s.finalWrap}>
      {/* Glow orb */}
      <View style={s.finalGlowOrb} pointerEvents="none" />

      {/* Glass card */}
      <View style={[s.glassCard, s.finalCard]}>
        <View style={[StyleSheet.absoluteFillObject, { overflow: "hidden", borderRadius: R.xxl }]} pointerEvents="none">
          <ShimmerBar />
        </View>
        <SpecularEdge />

        <Text style={s.eyebrow}>YOU'RE ALL SET</Text>
        <Text style={s.finalTitle}>You're ready.</Text>
        <Text style={s.finalSub}>
          Evan AI is calibrated to you. Start scanning anything around you.
        </Text>
      </View>

      {/* CTAs */}
      <View style={s.finalCtas}>
        <GlowBtn label="Start Scanning" onPress={onStartScanning} fullWidth />

        <View style={s.secondaryBlock}>
          <Text style={s.recommendLabel}>HIGHLY RECOMMENDED</Text>
          <GhostBtn label="Explore Evan AI  →" onPress={onExploreTutorial} />
        </View>

        {/* Camera permission re-entry — only shown when denied + can still ask */}
        {!cameraGranted && (
          <Pressable onPress={onRequestCamera} style={s.cameraPromptRow}>
            <Text style={s.cameraPromptText}>📷  Enable Camera for Full Experience</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ─── OnboardingFlow (root orchestrator) ──────────────────────────────────────

export function OnboardingFlow({ cameraPermissionGranted, onComplete }: OnboardingFlowProps) {
  const insets = useSafeAreaInsets();
  const { triggerWarp } = useSpatialZone();

  // Camera permission — owned here so FinalScreen can re-request without prop drilling
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const camGranted = camPermission?.granted ?? cameraPermissionGranted;
  const canAskCam  = camPermission?.canAskAgain !== false;

  // ── State ──────────────────────────────────────────────────────────────────
  const [screenIndex, setScreenIndex] = useState(0);
  const [answers, setAnswers] = useState<Partial<SurveyAnswers>>({});
  const isTransitioning = useRef(false);

  // ── Transition animations (RNAnimated for reliability) ────────────────────
  const contentOpacity = useRef(new RNAnimated.Value(0)).current;
  const contentX       = useRef(new RNAnimated.Value(20)).current;
  const flowOpacity    = useRef(new RNAnimated.Value(0)).current;

  // ── Entrance ───────────────────────────────────────────────────────────────
  useEffect(() => {
    RNAnimated.parallel([
      RNAnimated.timing(flowOpacity,    { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      RNAnimated.timing(contentOpacity, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      RNAnimated.spring(contentX,       { toValue: 0, damping: 26, stiffness: 250, mass: 1, useNativeDriver: true }),
    ]).start();
  }, []);

  // ── Screen transition ──────────────────────────────────────────────────────
  // Queue any tap that lands during the ~420 ms transition. The prior version
  // early-returned on isTransitioning which silently dropped the second tap
  // and produced the "double tap required" UX — the user's tap registered
  // (setAnswers fired) but the advance was eaten. With the queue, taps fire
  // immediately at the end of the in-flight transition.
  const queuedTargetRef = useRef<{ targetIndex: number; dir: "fwd" | "back" } | null>(null);
  const navigateTo = useCallback((targetIndex: number, dir: "fwd" | "back" = "fwd") => {
    if (isTransitioning.current) {
      // Stash only the LATEST tap — earlier queued taps are stale by the
      // time the transition ends (user could re-tap multiple times).
      queuedTargetRef.current = { targetIndex, dir };
      return;
    }
    isTransitioning.current = true;

    const exitX  = dir === "fwd" ? -28 : 28;
    const enterX = dir === "fwd" ?  28 : -28;

    RNAnimated.parallel([
      RNAnimated.timing(contentOpacity, {
        toValue: 0, duration: 140,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
      RNAnimated.timing(contentX, {
        toValue: exitX, duration: 140,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setScreenIndex(targetIndex);
      contentX.setValue(enterX);
      contentOpacity.setValue(0);

      // One frame delay — lets React render the new screen content first
      requestAnimationFrame(() => {
        RNAnimated.parallel([
          RNAnimated.timing(contentOpacity, {
            toValue: 1, duration: 280,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          RNAnimated.spring(contentX, {
            toValue: 0,
            damping: 26, stiffness: 250, mass: 1,
            useNativeDriver: true,
          }),
        ]).start(() => {
          isTransitioning.current = false;
          // Drain any queued navigation that landed during the transition.
          // Defer by one frame so React commits the final screen state before
          // we kick off the next transition — otherwise we re-enter
          // navigateTo with stale isTransitioning=false but the previous
          // animation's listeners haven't all cleared.
          const queued = queuedTargetRef.current;
          if (queued) {
            queuedTargetRef.current = null;
            requestAnimationFrame(() => {
              navigateTo(queued.targetIndex, queued.dir);
            });
          }
        });
      });
    });
  }, [contentOpacity, contentX]);

  // ── Answer handler ─────────────────────────────────────────────────────────
  // Stability fix (2026-05-22): the prior version scheduled an UNCANCELLABLE
  // setTimeout(navigateTo, 300). If the user changed their mind within the
  // 300ms window, setAnswers reflected the new choice but the navigation
  // had already been queued against the OLD selection (or worse, the second
  // navigation was eaten by isTransitioning). Symptom: tap A → tap B → screen
  // advances showing answer A; or "press does nothing until pressing again".
  //
  // Fix: track the pending advance in a ref. Each tap clears the prior timer
  // and schedules a fresh one. Selection updates immediately so the check
  // mark visibly follows every tap. The advance fires 220ms after the LAST
  // tap, not the first — re-taps within the window simply restart the timer.
  const pendingAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // Cleanup on unmount so a queued setTimeout can't navigate a dead tree.
    return () => {
      if (pendingAdvanceRef.current) {
        clearTimeout(pendingAdvanceRef.current);
        pendingAdvanceRef.current = null;
      }
    };
  }, []);

  const handleAnswer = useCallback((question: QuestionDef, optionId: string) => {
    console.log("SURVEY_OPTION_TAP", { key: question.key, optionId, screenIndex: question.screenIndex });

    // Ascending haptic rhythm. Wrap so a missing haptic permission never
    // blocks the selection update below — historically the first tap on a
    // fresh install hit a haptic error and the catch swallowed the
    // selection write, causing the "double tap to select" symptom.
    try {
      if (question.hapticLevel === "medium") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
    } catch {}

    // Selection always updates synchronously — never gated on the timer.
    // setAnswers is a state setter; React schedules the render but the
    // OptionCard's `selected` prop comparison fires this frame.
    setAnswers(prev => ({ ...prev, [question.key]: optionId }));
    console.log("SURVEY_OPTION_SELECTED", { key: question.key, optionId });

    // Cancel any pending advance and schedule a new one. 220ms is short
    // enough that the user perceives the navigation as immediate, but long
    // enough to see the check land + correct a misclick.
    if (pendingAdvanceRef.current) {
      clearTimeout(pendingAdvanceRef.current);
      console.log("SURVEY_ADVANCE_CANCELLED", { reason: "re_tap_within_window" });
    }
    console.log("SURVEY_ADVANCE_SCHEDULED", { delayMs: 220, next: question.screenIndex + 1 });
    pendingAdvanceRef.current = setTimeout(() => {
      pendingAdvanceRef.current = null;
      console.log("SURVEY_ADVANCE_FIRE", { next: question.screenIndex + 1 });
      navigateTo(question.screenIndex + 1, "fwd");
    }, 220);
  }, [navigateTo]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const handleBack = useCallback(() => {
    if (screenIndex > 0 && !isTransitioning.current) {
      Haptics.selectionAsync().catch(() => {});
      navigateTo(screenIndex - 1, "back");
    }
  }, [screenIndex, navigateTo]);

  const handleSkip = useCallback(() => {
    if (!isTransitioning.current) {
      Haptics.selectionAsync().catch(() => {});
      navigateTo(TOTAL_SCREENS - 1, "fwd");
    }
  }, [navigateTo]);

  // ── Completion ─────────────────────────────────────────────────────────────
  const handleComplete = useCallback((goTutorial: boolean) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    // Kick off hyper-warp in the 3D layer — visible as this UI fades out
    triggerWarp();

    // Merge partial answers with safe defaults — downstream agents never see undefined.
    const safeAnswers: SurveyAnswers = { ...SAFE_DEFAULTS, ...answers };

    // Extended to 520ms so the warp effect is visible through the fading layer
    RNAnimated.timing(flowOpacity, {
      toValue: 0, duration: 520,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      onComplete(safeAnswers, goTutorial);
    });
  }, [answers, flowOpacity, onComplete, triggerWarp]);

  // ── Camera re-request (Final screen) ───────────────────────────────────────
  const handleRequestCamera = useCallback(async () => {
    if (canAskCam) {
      await requestCamPermission().catch(() => {});
    } else {
      // Permanently denied — send user to Settings
      Linking.openSettings().catch(() => {});
    }
  }, [canAskCam, requestCamPermission]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const currentQuestion = (screenIndex >= 1 && screenIndex <= 5)
    ? QUESTIONS[screenIndex - 1]
    : null;

  const showBack = screenIndex > 0 && screenIndex < TOTAL_SCREENS - 1;
  const showSkip = screenIndex < TOTAL_SCREENS - 1;
  const showProgress = screenIndex >= 1 && screenIndex <= 5;

  return (
    <RNAnimated.View style={[s.root, { opacity: flowOpacity }]}>

      {/* ── Background ────────────────────────────────────────────────────── */}
      {camGranted ? (
        <>
          <CameraView style={StyleSheet.absoluteFillObject} facing="back" />
          <BlurView intensity={90} style={StyleSheet.absoluteFillObject} />
          <View style={[StyleSheet.absoluteFillObject, s.camDark]} />
        </>
      ) : (
        <>
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: C.bg }]} />
          {/* Subtle ambient light */}
          <View style={[StyleSheet.absoluteFillObject, s.bgAmbient]} pointerEvents="none" />
        </>
      )}

      {/* ── Top nav bar ───────────────────────────────────────────────────── */}
      <View style={[s.topBar, { paddingTop: insets.top + 6 }]}>
        {/* Back */}
        <Pressable
          onPress={handleBack}
          style={[s.navBtn, !showBack && s.navBtnInvisible]}
          disabled={!showBack}
          hitSlop={12}
        >
          <Text style={s.navBtnText}>‹ Back</Text>
        </Pressable>

        {/* Center: progress or spacer */}
        {showProgress ? (
          <View style={s.progressCenter}>
            <Text style={s.progressCountText}>{screenIndex} of 5</Text>
            <ProgressBar step={screenIndex} total={5} />
          </View>
        ) : (
          <View style={s.progressCenter} />
        )}

        {/* Skip */}
        <Pressable
          onPress={handleSkip}
          style={[s.navBtn, s.navBtnRight, !showSkip && s.navBtnInvisible]}
          disabled={!showSkip}
          hitSlop={12}
        >
          <Text style={s.navBtnText}>Skip</Text>
        </Pressable>
      </View>

      {/* ── Animated content area ─────────────────────────────────────────── */}
      <RNAnimated.View
        style={[
          s.contentArea,
          { opacity: contentOpacity, transform: [{ translateX: contentX }] },
        ]}
      >
        {screenIndex === 0 && (
          <EntryScreen onContinue={() => navigateTo(1)} />
        )}

        {currentQuestion && (
          <QuestionScreen
            question={currentQuestion}
            answers={answers}
            onAnswer={handleAnswer}
          />
        )}

        {screenIndex === TOTAL_SCREENS - 1 && (
          <FinalScreen
            onStartScanning={() => handleComplete(false)}
            onExploreTutorial={() => handleComplete(true)}
            cameraGranted={camGranted}
            onRequestCamera={handleRequestCamera}
          />
        )}
      </RNAnimated.View>
    </RNAnimated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // zIndex is set by the parent wrapper in index.tsx — keeping it here would
  // create a stacking context that blocks tutorial gestures during the fade-out.
  root: {
    ...StyleSheet.absoluteFillObject,
  },

  // Backgrounds
  camDark: {
    backgroundColor: "rgba(0,0,0,0.80)",
  },
  bgAmbient: {
    position: "absolute",
    top: -120,
    alignSelf: "center",
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: "rgba(255,255,255,0.025)",
  },

  // Navigation bar
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SP.lg,
    paddingBottom: SP.sm,
    zIndex: 10,
  },
  navBtn: {
    minWidth: 60,
    paddingVertical: SP.xs,
  },
  navBtnRight: {
    alignItems: "flex-end",
  },
  navBtnInvisible: {
    opacity: 0,
    pointerEvents: "none",
  } as any,
  navBtnText: {
    ...TY.label,
    color: C.text3,
  },

  // Progress
  progressCenter: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  progressCountText: {
    ...TY.cap,
    color: C.text4,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  progressTrack: {
    width: 72,
    height: 2,
    backgroundColor: C.s1,
    borderRadius: R.pill,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: C.text,
    borderRadius: R.pill,
  },

  // Content area
  contentArea: {
    flex: 1,
  },

  // Glass card base
  glassCard: {
    backgroundColor: C.glass,
    borderRadius: R.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.borderMid,
    padding: SP.xxl,
    ...SH.card,
  },

  // Specular top edge highlight
  specularEdge: {
    position: "absolute",
    top: 0,
    left: SP.xl,
    right: SP.xl,
    height: 1,
    borderRadius: R.pill,
    backgroundColor: "rgba(255,255,255,0.60)",
  },

  // Shimmer diagonal bar
  shimmerBar: {
    position: "absolute",
    top: -80,
    left: -60,
    width: 70,
    height: 600,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderRadius: 35,
  },

  // ── Entry screen ───────────────────────────────────────────────────────────
  entryWrap: {
    flex: 1,
    paddingHorizontal: SP.xl,
    paddingBottom: SP.xxl,
    justifyContent: "flex-end",
    gap: SP.xl,
  },
  entryGlowOrb: {
    position: "absolute",
    top: "10%",
    alignSelf: "center",
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: "rgba(255,255,255,0.025)",
  },
  entryCard: {
    gap: SP.md,
  },
  eyebrow: {
    ...TY.cap,
    color: C.text4,
    letterSpacing: 2.8,
    textTransform: "uppercase",
  },
  entryTitle: {
    ...TY.displayLg,
    color: C.text,
    marginTop: SP.xs,
  },
  entrySub: {
    ...TY.body,
    color: C.text3,
    lineHeight: 24,
    marginTop: SP.xs,
  },
  entryCta: {
    paddingHorizontal: 0,
  },

  // ── Question screen ────────────────────────────────────────────────────────
  questionWrap: {
    flex: 1,
    paddingHorizontal: SP.xl,
    paddingTop: SP.xl,
    paddingBottom: SP.xxl,
  },
  questionHeader: {
    marginBottom: SP.xxl,
    gap: SP.sm,
  },
  questionTitle: {
    ...TY.display,
    color: C.text,
  },
  questionSub: {
    ...TY.body,
    color: C.text3,
  },
  optionList: {
    gap: SP.sm,
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SP.md,
    paddingHorizontal: SP.lg,
    borderRadius: R.xl,
    borderWidth: 1,
    minHeight: 50,
  },
  optionLabel: {
    ...TY.body,
    color: C.text,
    flex: 1,
    paddingRight: SP.sm,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  checkMark: {
    ...TY.label,
    color: C.text,
    lineHeight: 16,
  },

  // ── Glow button ────────────────────────────────────────────────────────────
  glowBtn: {
    backgroundColor: C.text,
    borderRadius: R.pill,
    paddingVertical: 16,
    paddingHorizontal: SP.xxl,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#ffffff",
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 22,
    shadowOpacity: 0.30,
    elevation: 6,
  },
  glowBtnFull: {
    alignSelf: "stretch",
  },
  glowBtnText: {
    ...TY.h2,
    color: C.bg,
    letterSpacing: -0.2,
  },

  // ── Ghost button ───────────────────────────────────────────────────────────
  ghostBtn: {
    paddingVertical: SP.md,
    paddingHorizontal: SP.xl,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  ghostBtnText: {
    ...TY.body,
    color: C.text2,
    letterSpacing: -0.1,
  },

  // ── Final screen ───────────────────────────────────────────────────────────
  finalWrap: {
    flex: 1,
    paddingHorizontal: SP.xl,
    paddingBottom: SP.xxl,
    justifyContent: "flex-end",
    gap: SP.xl,
  },
  finalGlowOrb: {
    position: "absolute",
    top: "8%",
    alignSelf: "center",
    width: 440,
    height: 440,
    borderRadius: 220,
    backgroundColor: "rgba(255,255,255,0.030)",
  },
  finalCard: {
    gap: SP.md,
  },
  finalTitle: {
    ...TY.displayLg,
    color: C.text,
    marginTop: SP.xs,
  },
  finalSub: {
    ...TY.body,
    color: C.text3,
    lineHeight: 24,
    marginTop: SP.xs,
  },
  finalCtas: {
    gap: SP.lg,
  },
  secondaryBlock: {
    alignItems: "center",
    gap: SP.sm,
  },
  recommendLabel: {
    ...TY.cap,
    color: C.text4,
    letterSpacing: 2.0,
    textTransform: "uppercase",
    textAlign: "center",
  },

  // Camera permission re-entry prompt (Final screen)
  cameraPromptRow: {
    alignSelf: "center",
    paddingVertical: SP.sm,
    paddingHorizontal: SP.lg,
  },
  cameraPromptText: {
    ...TY.label,
    color: C.text4,
    textAlign: "center",
    letterSpacing: 0.2,
  },
});
