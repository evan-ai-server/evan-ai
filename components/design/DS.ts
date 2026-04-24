/**
 * Evan AI — Design System
 * Single source of truth for all design tokens, motion constants, and layout rules.
 */
import { Dimensions, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system/legacy";
import { Audio } from "expo-av";

const { width: W, height: H } = Dimensions.get("window");

// ─── PLATFORM ─────────────────────────────────────────────────────────────────
export const IOS = Platform.OS === "ios";

// ─── SCREEN ───────────────────────────────────────────────────────────────────
export const SCREEN = {
  width: W,
  height: H,
} as const;

// ─── COLOR TOKENS ─────────────────────────────────────────────────────────────
export const C = {
  // Core
  bg: "#000000",
  bgLayer: "#080808",

  // Surfaces (light on dark glass)
  s0: "rgba(255,255,255,0.03)",
  s1: "rgba(255,255,255,0.06)",
  s2: "rgba(255,255,255,0.10)",
  s3: "rgba(255,255,255,0.16)",

  // Glass layers
  glass: "rgba(255,255,255,0.08)",
  glassMid: "rgba(255,255,255,0.12)",
  glassStrong: "rgba(255,255,255,0.18)",

  // Dock / modal (dark glass with blur)
  dockBg: "rgba(8,8,8,0.82)",
  cardBg: "rgba(12,12,12,0.95)",

  // Borders
  border: "rgba(255,255,255,0.09)",
  borderMid: "rgba(255,255,255,0.15)",
  borderStrong: "rgba(255,255,255,0.24)",

  // Text
  text: "#ffffff",
  text2: "rgba(255,255,255,0.78)",
  text3: "rgba(255,255,255,0.52)",
  text4: "rgba(255,255,255,0.32)",

  // Accents — monochrome palette only
  silver: "rgba(255,255,255,0.88)",
  smoke: "rgba(255,255,255,0.40)",

  // Heart / watchlist
  heart: "#FF3B55",
  heartGlow: "rgba(255,59,85,0.28)",

  // Semantic (tinted but restrained)
  good: "rgba(180,255,200,0.92)",
  goodBg: "rgba(0,210,120,0.10)",
  goodBorder: "rgba(0,210,120,0.22)",

  warn: "rgba(255,210,100,0.92)",
  warnBg: "rgba(255,170,0,0.09)",
  warnBorder: "rgba(255,170,0,0.20)",

  danger: "rgba(255,110,90,0.92)",
  dangerBg: "rgba(255,70,50,0.09)",
  dangerBorder: "rgba(255,70,50,0.20)",

  // Glows
  glow: "rgba(255,255,255,0.05)",
  glowMid: "rgba(255,255,255,0.10)",
  glowStrong: "rgba(255,255,255,0.18)",

  // Liquid Glass surfaces
  liquidGlass: "rgba(255,255,255,0.06)",
  liquidGlassMid: "rgba(255,255,255,0.10)",
  liquidGlassStrong: "rgba(255,255,255,0.16)",
  liquidGlassBorder: "rgba(255,255,255,0.12)",
  liquidGlassBorderActive: "rgba(255,255,255,0.28)",
} as const;

// ─── SPACING ──────────────────────────────────────────────────────────────────
export const SP = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

// ─── RADII ────────────────────────────────────────────────────────────────────
export const R = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 26,
  xxl: 32,
  pill: 999,
} as const;

// ─── TYPOGRAPHY ───────────────────────────────────────────────────────────────
export const TY = {
  displayLg: { fontSize: 32, fontWeight: "900" as const, letterSpacing: -0.8, lineHeight: 38 },
  display:   { fontSize: 26, fontWeight: "900" as const, letterSpacing: -0.5, lineHeight: 32 },
  h1:        { fontSize: 21, fontWeight: "900" as const, letterSpacing: -0.3, lineHeight: 27 },
  h2:        { fontSize: 17, fontWeight: "900" as const, letterSpacing: -0.2, lineHeight: 23 },
  h3:        { fontSize: 14, fontWeight: "800" as const, letterSpacing: -0.1, lineHeight: 20 },
  body:      { fontSize: 15, fontWeight: "600" as const, lineHeight: 22 },
  bodyBold:  { fontSize: 15, fontWeight: "800" as const, lineHeight: 22 },
  label:     { fontSize: 12, fontWeight: "800" as const, letterSpacing: 0.3, lineHeight: 17 },
  cap:       { fontSize: 10, fontWeight: "900" as const, letterSpacing: 0.9, lineHeight: 15 },
  price:     { fontSize: 28, fontWeight: "900" as const, letterSpacing: -0.5, lineHeight: 34 },
  priceSm:   { fontSize: 20, fontWeight: "900" as const, letterSpacing: -0.3, lineHeight: 26 },
} as const;

// ─── MOTION ───────────────────────────────────────────────────────────────────
// "Panthere" curve: heavy luxurious start, silk-smooth finish.
// Used with Easing.bezier(...EASE_PANTHERE) from react-native-reanimated or react-native.
export const EASE_PANTHERE = [0.33, 1, 0.68, 1] as const;

// Singularity transition: the one-true entrance for major screens & deck content.
// Duration tuned for "weighted" feel; matches hardware rasterization on the target View.
export const SINGULARITY = {
  duration: 420,
  fromScale: 0.98,
  fromTranslateY: 15,
} as const;

export const MO = {
  spring: {
    gentle:  { damping: 22, stiffness: 220, mass: 1.0 },
    snappy:  { damping: 18, stiffness: 280, mass: 0.8 },
    bouncy:  { damping: 14, stiffness: 300, mass: 0.9 },
    card:    { damping: 26, stiffness: 250, mass: 1.0 },
    dock:    { damping: 30, stiffness: 200, mass: 1.0 },
    entrance:{ damping: 20, stiffness: 180, mass: 1.1 },
    /** Liquid Glass master spring — floating-in-liquid feel */
    liquid:  { damping: 20, stiffness: 90, mass: 1.0 },
    /** Tab switch spring — fast settle, no bounce */
    tabSwitch: { damping: 28, stiffness: 260, mass: 0.7 },
  },
  dur: {
    micro:   70,
    fast:   140,
    normal: 220,
    slow:   360,
    cinema: 520,
    singularity: SINGULARITY.duration,
  },
  ease: {
    out: "cubic-bezier(0.16, 1, 0.3, 1)",
    panthere: EASE_PANTHERE,
  },
} as const;

// ─── CARD DIMENSIONS ─────────────────────────────────────────────────────────
// PEEK: amount of the neighboring card visible on screen edge
const CARD_SIDE_MARGIN = 28;   // horizontal margin for active card (each side)
const CARD_GAP = 14;           // gap between cards

export const CARD = {
  width:     W - CARD_SIDE_MARGIN * 2,      // active card width
  height:    Math.min(H * 0.52, 480),       // cap at 480 for large phones
  slotWidth: W - CARD_SIDE_MARGIN * 2 + CARD_GAP,  // spacing between card centers
  leftInset: CARD_SIDE_MARGIN,              // left position of active card
  peek:      CARD_SIDE_MARGIN - CARD_GAP,  // how much neighbor card peeks
  radius:    R.xxl,
} as const;

// ─── SHADOWS ──────────────────────────────────────────────────────────────────
export const SH = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: IOS ? 0.60 : 0,
    shadowRadius: 40,
    elevation: 18,
  },
  cardActive: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: IOS ? 0.70 : 0,
    shadowRadius: 50,
    elevation: 22,
  },
  dock: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: IOS ? 0.40 : 0,
    shadowRadius: 24,
    elevation: 14,
  },
  soft: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: IOS ? 0.28 : 0,
    shadowRadius: 18,
    elevation: 8,
  },
} as const;

// ─── VERDICT COLORS ───────────────────────────────────────────────────────────
export function verdictStyle(verdict: string): {
  bg: string;
  border: string;
  text: string;
} {
  const v = String(verdict || "").toUpperCase();
  if (v.includes("GREAT") || v.includes("FLIP"))
    return { bg: C.goodBg, border: C.goodBorder, text: C.good };
  if (v.includes("GOOD"))
    return { bg: "rgba(255,255,255,0.08)", border: "rgba(255,255,255,0.16)", text: C.text };
  if (v.includes("MEH"))
    return { bg: C.warnBg, border: C.warnBorder, text: C.warn };
  if (v.includes("RISKY"))
    return { bg: C.dangerBg, border: C.dangerBorder, text: C.danger };
  return { bg: C.glass, border: C.border, text: C.text2 };
}

// ─── CONFIDENCE → TEXT ────────────────────────────────────────────────────────
export function confidenceLabel(c: number): string {
  if (c >= 0.88) return "High confidence";
  if (c >= 0.70) return "Good match";
  if (c >= 0.50) return "Likely match";
  return "Low signal";
}

// ─── MONEY FORMAT ─────────────────────────────────────────────────────────────
export const fmtMoney = (n: any): string => {
  const num = Number(n);
  return Number.isFinite(num) ? `$${num.toFixed(2)}` : "—";
};

export const fmtPct = (n: any): string => {
  const num = Number(n);
  return Number.isFinite(num) ? `${Math.round(num)}%` : "—";
};

// ─── HAPTIC FEEDBACK ─────────────────────────────────────────────────────────
// Single source of truth for all haptic cues.
// Import `Feedback` and call the named method — never call expo-haptics directly.
export const Feedback = {
  /** Soft click — any save/confirm action */
  save:   () => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);  } catch {} },
  /** Win burst — flip marked as sold */
  sold:   () => { try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {} },
  /** Mechanical lock-on — vision results land */
  scan:   () => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);  } catch {} },
  /** Micro-snap — card swipe, chip select */
  select: () => { try { Haptics.selectionAsync(); } catch {} },
  /** Error pulse — auth fail, no results */
  error:  () => { try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {} },
} as const;

// ─── SOUND EFFECTS ────────────────────────────────────────────────────────────
// Programmatically generates an 880Hz chime WAV (no external assets needed).
// Written to cache on first call; reused thereafter.

let _chimeUri: string | null = null;
let _audioReady = false;

async function _buildChimeWav(): Promise<string> {
  const SR = 8000;
  const N  = 1440; // 180ms @ 8kHz
  const total = 44 + N;
  const arr = new Uint8Array(total);
  const dv  = new DataView(arr.buffer);

  // RIFF/WAVE header
  [0x52,0x49,0x46,0x46].forEach((b, i) => arr[i] = b);
  dv.setUint32(4, 36 + N, true);
  [0x57,0x41,0x56,0x45].forEach((b, i) => arr[8 + i] = b);
  [0x66,0x6D,0x74,0x20].forEach((b, i) => arr[12 + i] = b);
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, SR, true); dv.setUint32(28, SR, true);
  dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
  [0x64,0x61,0x74,0x61].forEach((b, i) => arr[36 + i] = b);
  dv.setUint32(40, N, true);

  // 880Hz sine with exponential decay envelope
  for (let i = 0; i < N; i++) {
    const t   = i / SR;
    const env = Math.exp(-t * 18);
    const v   = Math.sin(2 * Math.PI * 880 * t) * env;
    arr[44 + i] = Math.round((v * 0.48 + 0.5) * 255);
  }

  // Encode to base64 (btoa available in React Native 0.64+)
  let bin = "";
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  const b64 = btoa(bin);

  const uri = `${FileSystem.cacheDirectory}evan_chime.wav`;
  await FileSystem.writeAsStringAsync(uri, b64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uri;
}

export const SoundEffect = {
  /** Crisp 880Hz chime — synchronized with Feedback.sold() on vault save */
  chime: async () => {
    try {
      if (!_audioReady) {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        _audioReady = true;
      }
      if (!_chimeUri) _chimeUri = await _buildChimeWav();
      const { sound } = await Audio.Sound.createAsync({ uri: _chimeUri });
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate((s: any) => {
        if (s.didJustFinish) sound.unloadAsync().catch(() => {});
      });
    } catch {}
  },
} as const;
