/**
 * Explore tab — Deal Hunter Dashboard
 *
 * Replaced placeholder with the real deal hunter feed.
 * Uses watchlist queries from AsyncStorage to power autonomous sweeps.
 * API_BASE resolves the same way as app/index.tsx.
 */
import React from "react";
import { Platform } from "react-native";
import { DealHunterDashboard } from "../../components/dealhunter/DealHunterDashboard";
import { useAuth } from "../../components/auth/AuthContext";

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === "ios" ? "http://192.168.1.227:3001" : "http://10.0.2.2:3001");

export default function ExploreScreen() {
  const { userId } = useAuth();
  return <DealHunterDashboard apiBase={API_BASE} userId={userId} />;
}
