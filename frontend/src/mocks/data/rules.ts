import type { Rule } from "@/lib/types";

/** rules.json — thresholds for the nine compliance-gate rules (Section 2.5.5). */
export const RULES: Rule[] = [
  {
    id: "R-01",
    type: "hard",
    name: "Allocation total",
    description: "The weights add up to 100% within 0.01.",
    threshold: "sum(weights) = 100 ± 0.01",
  },
  {
    id: "R-02",
    type: "hard",
    name: "Suitability",
    description: "Every product's risk level is at or below the client's tier.",
    threshold: "risk_level ≤ tier",
  },
  {
    id: "R-03",
    type: "hard",
    name: "Concentration",
    description: "Every non-cash product is at most 40% of the portfolio.",
    threshold: "weight_pct ≤ 40% per non-cash product",
  },
  {
    id: "R-04",
    type: "hard",
    name: "Liquidity reserve",
    description: "The liquid share of the portfolio covers the near-term need.",
    threshold: "liquid_share × amount ≥ near_term_need",
  },
  {
    id: "R-05",
    type: "hard",
    name: "Horizon",
    description: "Under a 3-year horizon, equity plus gold is at most 20%.",
    threshold: "equity% + gold% ≤ 20% when horizon < 3 years",
  },
  {
    id: "R-06",
    type: "hard",
    name: "Lock-up",
    description: "Every product's lock-up fits within the client's horizon.",
    threshold: "lockup_months ≤ horizon_years × 12",
  },
  {
    id: "R-07",
    type: "soft",
    name: "Fee level",
    description: "The weighted annual fee should not exceed 1.00%.",
    threshold: "weighted_fee_pct ≤ 1.00%",
  },
  {
    id: "R-08",
    type: "soft",
    name: "Drawdown tolerance",
    description: "The historical maximum drawdown should not exceed the client's maximum acceptable loss.",
    threshold: "max_drawdown_pct ≤ max_acceptable_loss_pct",
  },
  {
    id: "R-09",
    type: "soft",
    name: "Stress tolerance",
    description: "The worst stress-scenario loss should not exceed the client's maximum acceptable loss.",
    threshold: "worst stress loss_pct ≤ max_acceptable_loss_pct",
  },
];

export function findRule(id: string): Rule | undefined {
  return RULES.find((r) => r.id === id);
}

/** Banned phrases scanned for in the wording check (Section 2.5.7), case-insensitive. */
export const BANNED_PHRASES = [
  "guaranteed",
  "guarantee",
  "risk-free",
  "no risk",
  "can't lose",
  "cannot lose",
  "sure profit",
  "will definitely",
  "promise",
];
