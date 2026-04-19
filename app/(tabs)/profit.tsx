import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ProfitDashboard from "../../components/profit/ProfitDashboard";
import { useAuth } from "../../components/auth/AuthContext";
import { C, SP, TY } from "../../components/design/DS";

const API_BASE = "http://192.168.1.227:3001";

export default function ProfitTab() {
  const { userId } = useAuth();
  const insets = useSafeAreaInsets();

  if (!userId) {
    return (
      <View style={[styles.signInWrap, { paddingTop: insets.top + SP.xxxl }]}>
        <Text style={styles.lockEmoji}>📊</Text>
        <Text style={styles.signInTitle}>Sign in to see your profits</Text>
        <Text style={styles.signInSub}>
          Track your flip history and total savings here.
        </Text>
      </View>
    );
  }

  // Render dashboard fullscreen (always visible in tab context — not as a modal sheet)
  return (
    <ProfitDashboard
      visible={true}
      userId={userId}
      apiBase={API_BASE}
      onClose={() => {}}
    />
  );
}

const styles = StyleSheet.create({
  signInWrap: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: SP.xxxl,
  },
  lockEmoji: {
    fontSize: 48,
    marginBottom: SP.lg,
  },
  signInTitle: {
    ...TY.h2,
    color: C.text2,
    marginBottom: SP.sm,
    textAlign: "center",
  },
  signInSub: {
    ...TY.body,
    color: C.text4,
    textAlign: "center",
  },
});
