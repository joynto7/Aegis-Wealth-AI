import type { AssetClass } from "@/lib/types";

/** scenarios.json — the three stress scenarios (Section 2.5.4). Hypothetical. */
export interface Scenario {
  id: "S1" | "S2" | "S3";
  name: string;
  shocks: Record<AssetClass, number>; // decimals, e.g. -0.30
}

export const SCENARIOS: Scenario[] = [
  {
    id: "S1",
    name: "Equity crash",
    shocks: { equity: -0.3, bond: 0.02, gold: 0.05, cash: 0 },
  },
  {
    id: "S2",
    name: "Rate rise of 2 points",
    shocks: { equity: -0.1, bond: -0.08, gold: -0.03, cash: 0.005 },
  },
  {
    id: "S3",
    name: "Combined crisis",
    shocks: { equity: -0.35, bond: -0.1, gold: 0.08, cash: 0 },
  },
];

/** assumptions.json — assumed gross annual return per asset class (Section 2.5.1). Hypothetical. */
export const ASSUMPTIONS: Record<AssetClass, number> = {
  cash: 0.015,
  bond: 0.03,
  gold: 0.04,
  equity: 0.06,
};

export const DATA_AS_OF = "2026-09-30";
