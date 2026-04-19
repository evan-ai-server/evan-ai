import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function ExploreScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Explore</Text>
      <Text style={styles.sub}>
        Coming soon: trending items, recent scans, and “flip potential.”
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#07070a", padding: 18, justifyContent: "center" },
  title: { color: "#fff", fontSize: 34, fontWeight: "900" },
  sub: { marginTop: 10, color: "rgba(255,255,255,0.7)", fontSize: 15, lineHeight: 20 },
});
