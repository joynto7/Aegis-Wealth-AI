import type { AssetClass, ProductType } from "@/lib/types";

/**
 * Display labels for the fixed values in Section 2.6.3. Shared by the
 * screens and the mock API, and kept outside src/mocks so the screens keep
 * working once the mocks are switched off (Section 2.10.3).
 */

export const PRODUCT_TYPE_LABEL: Record<ProductType, string> = {
  deposit: "Bank deposit",
  money_market_fund: "Money market fund",
  short_term_bond_fund: "Short-term bond fund",
  bond_fund: "Bond fund",
  gold_etf: "Gold ETF",
  index_etf: "Broad index ETF",
  active_equity_fund: "Active equity fund",
  thematic_equity_fund: "High-growth thematic fund",
};

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  cash: "Cash",
  bond: "Bond",
  gold: "Gold",
  equity: "Equity",
};

/** Tier labels (Section 2.5.2). */
export const TIER_LABELS: Record<number, string> = {
  1: "Conservative",
  2: "Moderately conservative",
  3: "Balanced",
  4: "Growth",
  5: "Aggressive",
};

export function tierLabel(tier: number): string {
  return TIER_LABELS[tier] ?? "Unknown";
}
