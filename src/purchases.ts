/**
 * RevenueCat in-app purchases service.
 * Setup: app.revenuecat.com → add iOS/Android API keys below.
 */
import Purchases, { LOG_LEVEL } from "react-native-purchases";
import { Platform } from "react-native";

const RC_API_KEY_IOS     = process.env.EXPO_PUBLIC_RC_API_KEY_IOS     || "appl_REPLACE_WITH_YOUR_KEY";
const RC_API_KEY_ANDROID = process.env.EXPO_PUBLIC_RC_API_KEY_ANDROID || "goog_REPLACE_WITH_YOUR_KEY";

export const ENTITLEMENT_PRO = "pro";

let _configured = false;

export function configurePurchases(userId?: string | null) {
  if (_configured) return;
  try {
    const apiKey = Platform.OS === "ios" ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;
    if (!apiKey || apiKey.includes("REPLACE_WITH_YOUR_KEY")) return;
    Purchases.setLogLevel(LOG_LEVEL.ERROR);
    Purchases.configure({ apiKey, appUserID: userId ?? undefined });
    _configured = true;
  } catch {}
}

export async function identifyUser(userId: string) {
  if (!_configured) return;
  try { await Purchases.logIn(userId); } catch {}
}

export async function purchaseMonthly(): Promise<{ success: boolean; isPro: boolean; error?: string }> {
  if (!_configured) return { success: false, isPro: false, error: "not_configured" };
  try {
    const offerings = await Purchases.getOfferings();
    const pkg = offerings?.current?.monthly ?? offerings?.current?.availablePackages?.[0];
    if (!pkg) return { success: false, isPro: false, error: "product_not_found" };
    const result = await Purchases.purchasePackage(pkg);
    return { success: true, isPro: !!result.customerInfo.entitlements.active[ENTITLEMENT_PRO] };
  } catch (e: any) {
    if (e?.userCancelled) return { success: false, isPro: false, error: "cancelled" };
    return { success: false, isPro: false, error: e?.message || "purchase_failed" };
  }
}

export async function purchaseYearly(): Promise<{ success: boolean; isPro: boolean; error?: string }> {
  if (!_configured) return { success: false, isPro: false, error: "not_configured" };
  try {
    const offerings = await Purchases.getOfferings();
    const pkg = offerings?.current?.annual ?? offerings?.current?.availablePackages?.[1] ?? offerings?.current?.availablePackages?.[0];
    if (!pkg) return { success: false, isPro: false, error: "product_not_found" };
    const result = await Purchases.purchasePackage(pkg);
    return { success: true, isPro: !!result.customerInfo.entitlements.active[ENTITLEMENT_PRO] };
  } catch (e: any) {
    if (e?.userCancelled) return { success: false, isPro: false, error: "cancelled" };
    return { success: false, isPro: false, error: e?.message || "purchase_failed" };
  }
}

export async function restorePurchases(): Promise<{ isPro: boolean }> {
  if (!_configured) return { isPro: false };
  try {
    const info = await Purchases.restorePurchases();
    return { isPro: !!info.entitlements.active[ENTITLEMENT_PRO] };
  } catch { return { isPro: false }; }
}

export async function checkProStatus(): Promise<boolean> {
  if (!_configured) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return !!info.entitlements.active[ENTITLEMENT_PRO];
  } catch { return false; }
}
