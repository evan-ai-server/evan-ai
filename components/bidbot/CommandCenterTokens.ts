/**
 * CommandCenterTokens — Bid-Bot / Command Center color + type extensions.
 * Layered on top of DS.ts — do not duplicate tokens that exist there.
 *
 * Palette: "Cyber-Financial"
 *   Mint   — profit, success, positive ROI
 *   Amber  — risk, caution, pending bids
 *   Slate  — neutral data, secondary labels
 *   Crimson — abort, loss, danger
 */

// ─── Cyber-Financial Palette ──────────────────────────────────────────────────
export const CC = {
  // Profit mint
  mint:        "#00FF41",
  mintDim:     "rgba(0,255,65,0.75)",
  mintBg:      "rgba(0,255,65,0.08)",
  mintBorder:  "rgba(0,255,65,0.20)",
  mintGlow:    "rgba(0,255,65,0.14)",

  // Risk amber
  amber:       "#FFB300",
  amberDim:    "rgba(255,179,0,0.75)",
  amberBg:     "rgba(255,179,0,0.09)",
  amberBorder: "rgba(255,179,0,0.22)",

  // Abort / loss crimson
  crimson:     "#FF3B55",
  crimsonBg:   "rgba(255,59,85,0.09)",
  crimsonBorder:"rgba(255,59,85,0.22)",

  // Terminal surfaces
  termBg:      "rgba(0,10,4,0.96)",       // near-black with faint green tint
  termBorder:  "rgba(0,255,65,0.08)",
  termRow:     "rgba(0,255,65,0.04)",

  // HUD panels
  hudBg:       "rgba(8,8,8,0.92)",
  hudBorder:   "rgba(255,255,255,0.08)",

  // Score gradient stops (Sniper → Aggressor)
  riskLow:     "#00FF41",   // mint
  riskMid:     "#FFB300",   // amber
  riskHigh:    "#FF3B55",   // crimson
} as const;

// ─── Monospace font ───────────────────────────────────────────────────────────
export const MONO = {
  fontFamily: "Courier",   // System monospace — no extra font loading needed
} as const;

// ─── Ticker entry types ───────────────────────────────────────────────────────
export type TickerLevel = "scout" | "engine" | "shield" | "dispatch" | "result";

export interface TickerEntry {
  id: string;
  ts: string;           // "08:42:01"
  agent: string;        // "Scout-04"
  level: TickerLevel;
  message: string;
}

// ─── Bid opportunity card data ────────────────────────────────────────────────
export interface BidOpportunityCard {
  listingId: string;
  name: string;
  store: string;
  platform: "ebay" | "poshmark";
  image?: string | null;
  askingPrice: number;
  bidPrice: number;
  fees: number;
  projectedSellPrice: number;
  projectedROI: number;     // decimal e.g. 0.23 = 23%
  projectedProfit: number;  // net USD after fees
  evanScore: number;        // 0–10
  acceptancePct: number;    // 0–100
  str30d: number;           // 0–1
  priorityScore: number;    // 0–100+
  daysListed: number;
  tokenRef: string;
}

// ─── Strategy modes ───────────────────────────────────────────────────────────
export type StrategyMode = "sniper" | "standard" | "aggressor";

export interface StrategyConfig {
  mode: StrategyMode;
  aggressiveness: number;     // 1–10
  minSTR: number;             // 0–1
  minAcceptanceProb: number;  // 0–1
  targetROIFloor: number;     // 0–1
  maxCapitalExposure: number; // USD
  maxDailyBids: number;
}

export const STRATEGY_PRESETS: Record<StrategyMode, StrategyConfig> = {
  sniper: {
    mode: "sniper",
    aggressiveness: 2,
    minSTR: 0.55,
    minAcceptanceProb: 0.45,
    targetROIFloor: 0.28,
    maxCapitalExposure: 300,
    maxDailyBids: 5,
  },
  standard: {
    mode: "standard",
    aggressiveness: 5,
    minSTR: 0.35,
    minAcceptanceProb: 0.22,
    targetROIFloor: 0.15,
    maxCapitalExposure: 600,
    maxDailyBids: 15,
  },
  aggressor: {
    mode: "aggressor",
    aggressiveness: 9,
    minSTR: 0.20,
    minAcceptanceProb: 0.12,
    targetROIFloor: 0.08,
    maxCapitalExposure: 1500,
    maxDailyBids: 30,
  },
};
