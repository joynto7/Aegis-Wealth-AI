import type { AssetClass } from "@/lib/types";

/** model_portfolios.json — 5 tiers x 4 asset classes (Section 2.5.3). */
export const MODEL_PORTFOLIOS: Record<number, Record<AssetClass, number>> = {
  1: { cash: 100, bond: 0, gold: 0, equity: 0 },
  2: { cash: 30, bond: 70, gold: 0, equity: 0 },
  3: { cash: 15, bond: 50, gold: 10, equity: 25 },
  4: { cash: 10, bond: 30, gold: 10, equity: 50 },
  5: { cash: 5, bond: 15, gold: 10, equity: 70 },
};

export const TIER_LABELS: Record<number, string> = {
  1: "Conservative",
  2: "Moderately conservative",
  3: "Balanced",
  4: "Growth",
  5: "Aggressive",
};
