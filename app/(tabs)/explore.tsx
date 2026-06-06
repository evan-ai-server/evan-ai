/**
 * Explore tab — Deal Hunter Dashboard
 *
 * Replaced placeholder with the real deal hunter feed.
 * Uses watchlist queries from AsyncStorage to power autonomous sweeps.
 * API_BASE resolves the same way as app/index.tsx.
 */
import React from "react";
import { DealHunterDashboard } from "../../components/dealhunter/DealHunterDashboard";
import { useAuth } from "../../components/auth/AuthContext";
import { getApiBase } from "../../utils/apiBase";

const API_BASE = getApiBase();

export default function ExploreScreen() {
  const { userId } = useAuth();
  return <DealHunterDashboard apiBase={API_BASE} userId={userId} />;
}
