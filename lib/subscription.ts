/**
 * Subscription / Pro access handling (iOS only)
 *
 * Features:
 * - Monthly subscription only ($1.49)
 * - No free trial
 * - Restore Purchases button
 * - Dev vs Prod API key separation
 * - Safe across sign-out / sign-in
 * - Ready for server-side receipt validation + webhooks
 */

import Purchases, {
  CustomerInfo,
  LOG_LEVEL,
} from "react-native-purchases";
import { Platform } from "react-native";

// -----------------------------------------------------------------------------
// CONFIG
// -----------------------------------------------------------------------------

const IS_DEV = __DEV__;

// RevenueCat API keys (iOS only)
const IOS_API_KEY_DEV = "test_EASINNgJDSQcrXCMpSwiNCSdpnW";
const IOS_API_KEY_PROD = "live_REPLACEME";

// Your product identifier in App Store Connect / RevenueCat
export const PRO_ENTITLEMENT_ID = "pro";
export const PRO_PRODUCT_ID = "monthly_pro_149";

// Internal state
let configured = false;
let cachedCustomerInfo: CustomerInfo | null = null;

// -----------------------------------------------------------------------------
// INIT
// -----------------------------------------------------------------------------

export async function initRevenueCat() {
  if (configured) return;

  if (Platform.OS !== "ios") {
    console.warn("RevenueCat initialized on non-iOS platform (ignored)");
    return;
  }

  try {
    Purchases.setLogLevel(
      IS_DEV ? LOG_LEVEL.VERBOSE : LOG_LEVEL.ERROR
    );

    const apiKey = IS_DEV
      ? IOS_API_KEY_DEV
      : IOS_API_KEY_PROD;

    await Purchases.configure({
      apiKey,
      appUserID: undefined, // anonymous by default
    });

    // Cache updates so Pro survives reloads / sign-out / sign-in
    Purchases.addCustomerInfoUpdateListener((info) => {
      cachedCustomerInfo = info;
    });

    cachedCustomerInfo = await Purchases.getCustomerInfo();
    configured = true;
  } catch (e) {
    console.warn("RevenueCat init failed", e);
  }
}

// -----------------------------------------------------------------------------
// PRO STATE
// -----------------------------------------------------------------------------

export function hasProAccess(): boolean {
  const info = cachedCustomerInfo;
  if (!info) return false;

  return (
    info.entitlements.active[PRO_ENTITLEMENT_ID] != null
  );
}

export async function refreshProStatus(): Promise<boolean> {
  try {
    const info = await Purchases.getCustomerInfo();
    cachedCustomerInfo = info;
    return hasProAccess();
  } catch {
    return false;
  }
}

// -----------------------------------------------------------------------------
// PURCHASE
// -----------------------------------------------------------------------------

export async function purchasePro(): Promise<{
  success: boolean;
  cancelled?: boolean;
  error?: string;
}> {
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;

    if (!current) {
      return { success: false, error: "No offerings found" };
    }

    const pkg = current.availablePackages.find(
      (p) => p.product.identifier === PRO_PRODUCT_ID
    );

    if (!pkg) {
      return { success: false, error: "Product not found" };
    }

const purchaseResult =
  await Purchases.purchasePackage(pkg);

cachedCustomerInfo = purchaseResult.customerInfo;

    return {
      success: hasProAccess(),
    };
  } catch (e: any) {
    if (e?.userCancelled) {
      return { success: false, cancelled: true };
    }

    return {
      success: false,
      error: e?.message ?? "Purchase failed",
    };
  }
}

// -----------------------------------------------------------------------------
// RESTORE PURCHASES
// -----------------------------------------------------------------------------

export async function restorePurchases(): Promise<boolean> {
  try {
    const info = await Purchases.restorePurchases();
    cachedCustomerInfo = info;
    return hasProAccess();
  } catch {
    return false;
  }
}

// -----------------------------------------------------------------------------
// SIGN IN / SIGN OUT SAFETY
// -----------------------------------------------------------------------------

/**
 * Call this AFTER your own sign-in (email / Apple / etc)
 * Ensures Pro follows the user across devices.
 */
export async function identifyUser(userId: string) {
  try {

    const { customerInfo } =
      await Purchases.logIn(userId);
    cachedCustomerInfo = customerInfo;
  } catch (e) {
    console.warn("RevenueCat identify failed", e);
  }
}

/**
 * Call this on explicit sign-out.
 * Pro will still be recoverable via Restore Purchases.
 */

export async function resetUser() {
  try {
    const customerInfo =
      await Purchases.logOut();
    cachedCustomerInfo = customerInfo;
  } catch (e) {
    console.warn("RevenueCat logout failed", e);
  }
}

// -----------------------------------------------------------------------------
// NOTES FOR BACKEND (IMPORTANT)
// -----------------------------------------------------------------------------

/**
 * SERVER-SIDE RECEIPT VALIDATION
 * --------------------------------
 * - Use RevenueCat webhooks (not client checks) for truth
 * - Webhook events to listen for:
 *   • INITIAL_PURCHASE
 *   • RENEWAL
 *   • CANCELLATION
 *   • EXPIRATION
 *
 * - Store:
 *   user_id
 *   entitlement_active (boolean)
 *   expiration_date
 *
 * The app should NEVER decide Pro status on its own.
 * This file is only for UX gating.
 */

