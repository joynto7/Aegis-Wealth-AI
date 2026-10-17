import type { AssetClass, StressResult } from "@/lib/types";
import { SCENARIOS } from "@/mocks/data/scenarios";

/** Stress tests (Section 2.5.4): hypothetical instant shocks per asset class. */
export function computeStress(classWeightsPct: Record<AssetClass, number>, amount: number): StressResult[] {
  const weights: Record<AssetClass, number> = {
    cash: classWeightsPct.cash / 100,
    bond: classWeightsPct.bond / 100,
    gold: classWeightsPct.gold / 100,
    equity: classWeightsPct.equity / 100,
  };

  return SCENARIOS.map((s) => {
    const contributions: Record<AssetClass, number> = {
      cash: round2(amount * weights.cash * s.shocks.cash),
      bond: round2(amount * weights.bond * s.shocks.bond),
      gold: round2(amount * weights.gold * s.shocks.gold),
      equity: round2(amount * weights.equity * s.shocks.equity),
    };
    const lossPct =
      weights.cash * s.shocks.cash +
      weights.bond * s.shocks.bond +
      weights.gold * s.shocks.gold +
      weights.equity * s.shocks.equity;
    return {
      scenario: s.id,
      name: s.name,
      loss_pct: round2(lossPct * 100),
      loss_cny: round2(amount * lossPct),
      contributions,
    };
  });
}

// Half away from zero, as the worked example in Section 2.6.5 expects
// (S2: -6.725% -> -6.73%). Math.round alone rounds -x.5 towards zero.
function round2(n: number) {
  return (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;
}
