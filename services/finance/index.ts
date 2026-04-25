/**
 * Evan AI — Finance Layer
 * Public surface — import from here, not from sub-files.
 *
 * Five layers:
 *   1. FinanceConfig    — centralized financial constants
 *   2. FinanceEngine    — unit economics, profit calculations
 *   3. SubscriptionEconomics — subscription intelligence
 *   4. RetentionFinance — value storytelling + FinanceState
 *   5. FinanceAnalytics — funnel events + session summaries
 *
 * React hooks:
 *   useFinanceState — persistent finance state for components
 */

// Config (all constants)
export * from "./FinanceConfig";

// Engine (all calculations)
export * from "./FinanceEngine";

// Subscription intelligence
export * from "./SubscriptionEconomics";

// Retention finance + FinanceState
export * from "./RetentionFinance";

// Analytics (singleton + types)
export { FinanceAnalytics } from "./FinanceAnalytics";
export type {
  FunnelStep,
  FunnelEvent,
  SessionSummary,
  BusinessMetricsSnapshot,
} from "./FinanceAnalytics";

// React hook
export { useFinanceState } from "./useFinanceState";
export type { UseFinanceStateResult } from "./useFinanceState";
