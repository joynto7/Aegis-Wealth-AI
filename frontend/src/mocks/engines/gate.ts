import type { AssetClass, GateResult, GateRule, ProposalItem, ProposalMetrics, StressResult } from "@/lib/types";
import { findProduct } from "@/mocks/data/products";

export interface GateInputs {
  items: ProposalItem[];
  classWeightsPct: Record<AssetClass, number>;
  metrics: ProposalMetrics;
  stress: StressResult[];
  tier: number;
  amount: number;
  horizonYears: number;
  nearTermNeed: number;
  maxAcceptableLossPct: number;
}

/** Compliance gate (Section 2.5.5): rules R-01 to R-09. */
export function evaluateGate(input: GateInputs): GateResult {
  const { items, classWeightsPct, metrics, stress, tier, horizonYears, nearTermNeed, amount, maxAcceptableLossPct } =
    input;

  const rules: GateRule[] = [];

  // R-01 Allocation total
  const total = Object.values(classWeightsPct).reduce((a, b) => a + b, 0);
  rules.push(
    rule("R-01", "hard", Math.abs(total - 100) <= 0.01, "Weights must add up to 100%.")
  );

  // R-02 Suitability
  const unsuitable = items.filter((i) => i.risk_level > tier);
  rules.push(
    rule(
      "R-02",
      "hard",
      unsuitable.length === 0,
      unsuitable.length
        ? unsuitable.map((i) => `${i.name} is risk level ${i.risk_level}, above your tier ${tier}.`).join(" ")
        : null
    )
  );

  // R-03 Concentration
  const overConcentrated = items.filter((i) => i.asset_class !== "cash" && i.weight_pct > 40);
  rules.push(
    rule(
      "R-03",
      "hard",
      overConcentrated.length === 0,
      overConcentrated.length
        ? overConcentrated
            .map((i) => `${i.name} is ${i.weight_pct}% of the portfolio; the limit is 40%.`)
            .join(" ")
        : null
    )
  );

  // R-04 Liquidity reserve
  const availableWithinOneDay = (metrics.liquid_share_pct / 100) * amount;
  rules.push(
    rule(
      "R-04",
      "hard",
      availableWithinOneDay >= nearTermNeed - 0.01,
      availableWithinOneDay < nearTermNeed
        ? `Only CNY ${availableWithinOneDay.toFixed(2)} is available within 1 day; you need CNY ${nearTermNeed.toFixed(2)}.`
        : null
    )
  );

  // R-05 Horizon
  const egWeight = classWeightsPct.equity + classWeightsPct.gold;
  const horizonOk = horizonYears >= 3 || egWeight <= 20;
  rules.push(rule("R-05", "hard", horizonOk, horizonOk ? null : "With under 3 years, equity and gold may be at most 20%."));

  // R-06 Lock-up
  const lockedBeyondHorizon = items.filter((i) => {
    const p = findProduct(i.product_code);
    return p ? p.lockup_months > horizonYears * 12 : false;
  });
  rules.push(
    rule(
      "R-06",
      "hard",
      lockedBeyondHorizon.length === 0,
      lockedBeyondHorizon.length
        ? lockedBeyondHorizon
            .map((i) => {
              const p = findProduct(i.product_code)!;
              return `${i.name} locks money for ${p.lockup_months} months, beyond your horizon.`;
            })
            .join(" ")
        : null
    )
  );

  // R-07 Fee level (soft)
  rules.push(
    rule(
      "R-07",
      "soft",
      metrics.weighted_fee_pct <= 1.0,
      metrics.weighted_fee_pct > 1.0
        ? `The average annual fee is ${metrics.weighted_fee_pct.toFixed(2)}%, above 1.00%.`
        : null
    )
  );

  // R-08 Drawdown tolerance (soft)
  rules.push(
    rule(
      "R-08",
      "soft",
      metrics.max_drawdown_pct <= maxAcceptableLossPct,
      metrics.max_drawdown_pct > maxAcceptableLossPct
        ? `This mix once fell ${metrics.max_drawdown_pct.toFixed(1)}%; you said you can accept ${maxAcceptableLossPct}%.`
        : null
    )
  );

  // R-09 Stress tolerance (soft)
  const worst = stress.reduce((min, s) => (s.loss_pct < min.loss_pct ? s : min), stress[0]);
  const worstLossAbs = Math.abs(worst?.loss_pct ?? 0);
  rules.push(
    rule(
      "R-09",
      "soft",
      worstLossAbs <= maxAcceptableLossPct,
      worstLossAbs > maxAcceptableLossPct
        ? `In ${worst.name} this mix could lose ${worstLossAbs.toFixed(1)}%, more than your ${maxAcceptableLossPct}%.`
        : null
    )
  );

  const hardFail = rules.some((r) => r.type === "hard" && r.result === "fail");
  const softFail = rules.some((r) => r.type === "soft" && r.result === "fail");
  const decision = hardFail ? "REJECT" : softFail ? "WARNING" : "PASS";

  return { decision, rules, acknowledged_rule_ids: [] };
}

function rule(id: string, type: "hard" | "soft", pass: boolean, message: string | null): GateRule {
  return { id, type, result: pass ? "pass" : "fail", message: pass ? null : message };
}
