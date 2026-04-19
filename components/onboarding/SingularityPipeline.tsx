/**
 * SingularityPipeline — "How Evan AI is Different"
 *
 * Technical pipeline schematic: Standard Marketplaces (dim/grey)
 * vs. Evan AI: The Singularity (violet, animated).
 *
 * Four stage-gates animate in staggered. Evan AI side populates
 * 3× faster than the standard side — visually communicating
 * "Low-Latency Priority."
 *
 * Motion:
 *   - Sheet: spring entrance from bottom
 *   - Stage nodes: fade-in + 10px slide-up, per-column stagger
 *   - Evan AI: stagger = idx * 70ms
 *   - Standard: stagger = idx * 220ms  (3.1× slower)
 */

import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  Platform,
  Dimensions,
} from "react-native";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

const { height: SCREEN_H } = Dimensions.get("window");
const IOS = Platform.OS === "ios";

// ─── Palette ──────────────────────────────────────────────────────────────────
const V    = "#A78BFA";
const V_BG = "rgba(167,139,250,0.11)";
const V_BD = "rgba(167,139,250,0.32)";
const S_TXT = "rgba(255,255,255,0.28)";
const S_BG  = "rgba(255,255,255,0.04)";
const S_BD  = "rgba(255,255,255,0.09)";

// ─── Pipeline data ────────────────────────────────────────────────────────────
interface Stage {
  num: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  std:  { title: string; sub: string; tag: string };
  evan: { title: string; sub: string; tag: string };
}

const STAGES: Stage[] = [
  {
    num: "01", label: "IDENTIFICATION", icon: "eye-outline",
    std:  { title: "Barcode / UPC Lookup",   sub: "Finds identical retail stock only",                           tag: "1 SOURCE"      },
    evan: { title: "Multi-Vector Analysis",  sub: "Makers' marks · fabric grain · vintage labels · condition",   tag: "GPT-4.1 VISION" },
  },
  {
    num: "02", label: "DATA HARVESTING", icon: "git-network-outline",
    std:  { title: "Retail API",             sub: "Amazon · Target MSRP only",                                   tag: "~3 SOURCES"    },
    evan: { title: "The Swarm™",             sub: "eBay Completed · Etsy · niche forums · local classifieds",    tag: "12+ SOURCES"   },
  },
  {
    num: "03", label: "RANKING LOGIC", icon: "analytics-outline",
    std:  { title: "Ad-Driven Algorithm",    sub: "Shows sponsored listings first",                              tag: "PAID FIRST"    },
    evan: { title: "Value-First Engine",     sub: "Price × Condition × Velocity · Game Theory Logic",            tag: "VALUE-FIRST"   },
  },
  {
    num: "04", label: "THE OUTCOME", icon: "flash-outline",
    std:  { title: "Buy Now",                sub: "Retail price · consumer mode",                                tag: "YOU PAY MORE"  },
    evan: { title: "Extract Profit",         sub: "The Invisible Army · 24 hours a day · working for you",       tag: "YOU WIN"       },
  },
];

// ─── StageNode ────────────────────────────────────────────────────────────────
function StageNode({
  title, sub, tag, isEvan, delay,
}: {
  title: string; sub: string; tag: string; isEvan: boolean; delay: number;
}) {
  const op = useSharedValue(0);
  const ty = useSharedValue(10);

  useEffect(() => {
    op.value = withDelay(delay, withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) }));
    ty.value = withDelay(delay, withSpring(0, { damping: 22, stiffness: 300 }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const anim = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ translateY: ty.value }],
  }));

  return (
    <Reanimated.View
      style={[
        P.node,
        isEvan
          ? { backgroundColor: V_BG, borderColor: V_BD }
          : { backgroundColor: S_BG, borderColor: S_BD },
        anim,
      ]}
    >
      {/* Tag chip */}
      <View style={[P.chip, isEvan ? P.chipEvan : P.chipStd]}>
        <Text style={[P.chipTxt, { color: isEvan ? V : S_TXT }]}>{tag}</Text>
      </View>

      <Text style={[P.nodeTitle, { color: isEvan ? "#FFF" : S_TXT }]}>
        {title}
      </Text>
      <Text style={[P.nodeSub, { color: isEvan ? "rgba(255,255,255,0.50)" : "rgba(255,255,255,0.15)" }]}>
        {sub}
      </Text>

      {/* Evan AI: subtle right-edge violet accent bar */}
      {isEvan ? <View style={P.evanAccent} /> : null}
    </Reanimated.View>
  );
}

// ─── StageSection ─────────────────────────────────────────────────────────────
function StageSection({ stage, index }: { stage: Stage; index: number }) {
  // Evan AI fires 3× faster
  const evanDelay = 180 + index * 70;
  const stdDelay  = 180 + index * 220;

  const headerOp = useSharedValue(0);
  useEffect(() => {
    headerOp.value = withDelay(
      evanDelay - 60,
      withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const headerStyle = useAnimatedStyle(() => ({ opacity: headerOp.value }));

  return (
    <Reanimated.View style={[P.section, headerStyle]}>
      {/* Stage gate bar */}
      <View style={P.stageBar}>
        <View style={P.stageNumBadge}>
          <Text style={P.stageNum}>{stage.num}</Text>
        </View>
        <Ionicons name={stage.icon} size={13} color="rgba(255,255,255,0.40)" style={{ marginRight: 5 }} />
        <Text style={P.stageLabel}>{stage.label}</Text>
        {/* Horizontal rule extending to edge */}
        <View style={P.stageRule} />
      </View>

      {/* Two-column nodes */}
      <View style={P.nodeRow}>
        <View style={P.nodeCol}>
          <StageNode
            title={stage.std.title}
            sub={stage.std.sub}
            tag={stage.std.tag}
            isEvan={false}
            delay={stdDelay}
          />
        </View>

        {/* Central spine */}
        <View style={P.spine} />

        <View style={P.nodeCol}>
          <StageNode
            title={stage.evan.title}
            sub={stage.evan.sub}
            tag={stage.evan.tag}
            isEvan
            delay={evanDelay}
          />
        </View>
      </View>
    </Reanimated.View>
  );
}

// ─── Connector between stages ─────────────────────────────────────────────────
function Connector() {
  return (
    <View style={P.connector}>
      {/* Standard arrow: dim */}
      <View style={P.arrowSide}>
        <View style={[P.arrowLine, { backgroundColor: "rgba(255,255,255,0.09)" }]} />
        <Ionicons name="chevron-down" size={11} color="rgba(255,255,255,0.16)" />
      </View>

      {/* Central spine gap */}
      <View style={[P.spine, { marginHorizontal: 12 }]} />

      {/* Evan AI arrow: violet */}
      <View style={P.arrowSide}>
        <View style={[P.arrowLine, { backgroundColor: V_BD }]} />
        <Ionicons name="chevron-down" size={11} color={V} />
      </View>
    </View>
  );
}

// ─── SingularityPipelineModal ─────────────────────────────────────────────────
export interface SingularityPipelineModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SingularityPipelineModal({
  visible,
  onClose,
}: SingularityPipelineModalProps) {
  const insets = useSafeAreaInsets();

  const sheetY    = useSharedValue(SCREEN_H);
  const backdropOp = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      sheetY.value    = SCREEN_H;
      backdropOp.value = 0;
      sheetY.value    = withSpring(0, { damping: 26, stiffness: 180, mass: 1.1 });
      backdropOp.value = withTiming(1, { duration: 300 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const dismiss = () => {
    Haptics.selectionAsync();
    sheetY.value    = withSpring(SCREEN_H, { damping: 26, stiffness: 200, velocity: 8 });
    backdropOp.value = withTiming(0, { duration: 200 });
    setTimeout(onClose, 240);
  };

  const sheetStyle    = useAnimatedStyle(() => ({ transform: [{ translateY: sheetY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOp.value }));

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      {/* Backdrop */}
      <Reanimated.View style={[StyleSheet.absoluteFill, backdropStyle]} pointerEvents="none">
        <BlurView intensity={IOS ? 24 : 14} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.70)" }]} />
      </Reanimated.View>

      {/* Tap outside to dismiss */}
      <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />

      {/* Sheet — full screen */}
      <Reanimated.View
        style={[
          P.sheet,
          { paddingTop: insets.top + 12 },
          sheetStyle,
        ]}
      >

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <View style={P.header}>
          <View style={P.headerLeft}>
            <View style={P.terminalIcon}>
              <Ionicons name="hardware-chip-outline" size={15} color={V} />
            </View>
            <View>
              <Text style={P.headerEyebrow}>PIPELINE ANALYSIS</Text>
              <Text style={P.headerTitle}>How Evan AI is Different</Text>
            </View>
          </View>
          <Pressable onPress={dismiss} style={P.closeBtn} hitSlop={12}>
            <Ionicons name="close" size={16} color="rgba(255,255,255,0.55)" />
          </Pressable>
        </View>

        {/* ── Column headers ──────────────────────────────────────────────────── */}
        <View style={P.colHeaders}>
          <View style={P.colHeaderStd}>
            <Text style={P.colLabelStd}>STANDARD</Text>
            <Text style={P.colSubStd}>Marketplaces</Text>
          </View>

          <View style={[P.spine, { height: 36 }]} />

          <View style={P.colHeaderEvan}>
            <View style={P.evanBadge}>
              <Ionicons name="sparkles" size={9} color={V} style={{ marginRight: 4 }} />
              <Text style={P.evanBadgeTxt}>EVAN AI</Text>
            </View>
            <Text style={P.colSubEvan}>The Singularity</Text>
          </View>
        </View>

        {/* ── Pipeline (scrollable) ────────────────────────────────────────────── */}
        <ScrollView
          style={P.scroll}
          contentContainerStyle={P.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces
          alwaysBounceVertical
        >
          {STAGES.map((stage, idx) => (
            <React.Fragment key={stage.num}>
              <StageSection stage={stage} index={idx} />
              {idx < STAGES.length - 1 ? <Connector /> : null}
            </React.Fragment>
          ))}

          {/* Rubber-band footer — prevents gap on overscroll */}
          <View style={P.scrollFooter} />
        </ScrollView>

        {/* ── Done CTA (fixed) ─────────────────────────────────────────────────── */}
        <View style={[P.ctaArea, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
          <Pressable
            style={({ pressed }) => [P.doneBtn, pressed && { opacity: 0.88, transform: [{ scale: 0.985 }] }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              dismiss();
            }}
          >
            <Text style={P.doneTxt}>Done</Text>
          </Pressable>
        </View>

      </Reanimated.View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const P = StyleSheet.create({

  // ── Sheet
  sheet: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000000",
  },

  // ── Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  terminalIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: V_BG,
    borderWidth: 0.5,
    borderColor: V_BD,
    alignItems: "center",
    justifyContent: "center",
  },
  headerEyebrow: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 2.2,
    color: V,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.11)",
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Column headers
  colHeaders: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  colHeaderStd: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  colHeaderEvan: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  colLabelStd: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
    color: S_TXT,
  },
  colSubStd: {
    fontSize: 11,
    fontWeight: "500",
    color: "rgba(255,255,255,0.18)",
  },
  evanBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: V_BG,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: V_BD,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  evanBadgeTxt: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    color: V,
  },
  colSubEvan: {
    fontSize: 11,
    fontWeight: "500",
    color: "rgba(255,255,255,0.35)",
  },

  // ── Central spine (vertical divider)
  spine: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.07)",
    marginHorizontal: 10,
    alignSelf: "stretch",
  },

  // ── Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
  },
  scrollFooter: {
    // Rubber-band extension: same bg so overscroll never reveals black behind sheet
    height: 220,
    backgroundColor: "#000000",
  },

  // ── Stage section
  section: {
    marginBottom: 2,
  },
  stageBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 2,
    marginBottom: 8,
    gap: 6,
  },
  stageNumBadge: {
    width: 22,
    height: 17,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  stageNum: {
    fontSize: 8,
    fontWeight: "900",
    color: "rgba(255,255,255,0.35)",
    letterSpacing: 0.5,
  },
  stageLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 2.2,
    color: "rgba(255,255,255,0.35)",
  },
  stageRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginLeft: 4,
  },

  // ── Two-column row
  nodeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  nodeCol: {
    flex: 1,
  },

  // ── Node card
  node: {
    borderRadius: 11,
    borderWidth: 0.5,
    padding: 11,
    minHeight: 92,
    overflow: "hidden",
    position: "relative",
  },
  evanAccent: {
    // Violet right-edge glow bar — telegraphs "premium" vs standard
    position: "absolute",
    right: 0,
    top: 8,
    bottom: 8,
    width: 2,
    borderRadius: 1,
    backgroundColor: V_BD,
  },

  // ── Tag chip
  chip: {
    alignSelf: "flex-start",
    borderRadius: 4,
    borderWidth: 0.5,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginBottom: 7,
  },
  chipStd: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.09)",
  },
  chipEvan: {
    backgroundColor: V_BG,
    borderColor: V_BD,
  },
  chipTxt: {
    fontSize: 7.5,
    fontWeight: "800",
    letterSpacing: 1.3,
  },

  // ── Node text
  nodeTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: -0.1,
    lineHeight: 16,
    marginBottom: 5,
  },
  nodeSub: {
    fontSize: 10.5,
    fontWeight: "500",
    lineHeight: 15,
  },

  // ── Connector
  connector: {
    flexDirection: "row",
    alignItems: "center",
    height: 26,
    paddingHorizontal: 2,
    marginVertical: 1,
  },
  arrowSide: {
    flex: 1,
    alignItems: "center",
  },
  arrowLine: {
    width: 1,
    height: 12,
    marginBottom: 0,
  },

  // ── CTA
  ctaArea: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.07)",
    backgroundColor: "#000000",
  },
  doneBtn: {
    backgroundColor: "#FFFFFF",
    borderRadius: 100,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.50)",
    // Hardware glow
    ...(IOS ? {
      shadowColor:   "#FFFFFF",
      shadowOffset:  { width: 0, height: 0 },
      shadowOpacity: 0.40,
      shadowRadius:  10,
    } : { elevation: 6 }),
  },
  doneTxt: {
    fontSize: 16,
    fontWeight: "800",
    color: "#000000",
    letterSpacing: -0.2,
  },
});
