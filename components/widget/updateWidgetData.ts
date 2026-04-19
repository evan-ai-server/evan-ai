/**
 * updateWidgetData — writes scan results into the shared App Group container
 * so the iOS home screen widget picks them up immediately.
 *
 * Only runs on iOS — no-ops silently on Android or Expo Go.
 * Call this after every successful scan and after watchlist price-drop detection.
 *
 * Usage:
 *   import { updateWidgetData, clearWidgetData } from '../widget/updateWidgetData';
 *
 *   // After a scan:
 *   updateWidgetData({
 *     todaySavings: totalSavedToday,
 *     bestDealName: activeResult.itemName,
 *     bestDealPrice: activeResult.price,
 *     scanCount: scanHistory.length,
 *   });
 *
 *   // When a watchlist item drops in price:
 *   updateWidgetData({ priceDropAlert: `${item} dropped $${delta}` });
 */

import { NativeModules, Platform } from "react-native";

export interface WidgetPayload {
  /** Total amount saved across all scans today (USD) */
  todaySavings?: number;
  /** Lifetime total savings (USD) */
  totalSavings?: number;
  /** Name of the best deal found in the most recent scan */
  bestDealName?: string;
  /** Price of the best deal found (USD) */
  bestDealPrice?: number;
  /** Total number of scans the user has done */
  scanCount?: number;
  /** Human-readable price drop alert string, e.g. "Air Jordan 1 dropped $15" */
  priceDropAlert?: string | null;
  /** Item name that dropped */
  priceDropItem?: string | null;
  /** Amount of drop in USD */
  priceDropDelta?: number | null;
}

const bridge = NativeModules.EvanWidgetBridge as
  | { updateData: (data: Record<string, unknown>) => Promise<boolean>;
      clearData:  () => Promise<boolean> }
  | undefined;

let _cached: WidgetPayload = {};

/**
 * Merge new data into cached widget payload and push to native bridge.
 * Safe to call from any screen — silently no-ops on Android or Expo Go.
 */
export async function updateWidgetData(partial: WidgetPayload): Promise<void> {
  if (Platform.OS !== "ios" || !bridge) return;

  // Merge with cached state so each call doesn't wipe unrelated fields
  _cached = { ..._cached, ...partial };

  const payload: Record<string, unknown> = {
    todaySavings:   _cached.todaySavings   ?? 0,
    totalSavings:   _cached.totalSavings   ?? 0,
    bestDealName:   _cached.bestDealName   ?? "",
    bestDealPrice:  _cached.bestDealPrice  ?? 0,
    scanCount:      _cached.scanCount      ?? 0,
    priceDropAlert: _cached.priceDropAlert ?? "",
    priceDropItem:  _cached.priceDropItem  ?? "",
    priceDropDelta: _cached.priceDropDelta ?? 0,
    lastUpdated:    Date.now() / 1000,
  };

  try {
    await bridge.updateData(payload);
  } catch {
    // Widget bridge unavailable (Expo Go, Android, or widget not installed)
  }
}

/** Remove all widget data (call on sign-out or reset). */
export async function clearWidgetData(): Promise<void> {
  if (Platform.OS !== "ios" || !bridge) return;
  _cached = {};
  try {
    await bridge.clearData();
  } catch {}
}
