import type { CompareItem, CompareResult } from "@/lib/types";
import { findProduct } from "@/mocks/data/products";
import { ASSUMPTIONS } from "@/mocks/data/scenarios";

/**
 * Fee comparison (Section 2.5.4):
 * fee_cost = A(1+g)^H - A(1+g-f)^H; end value after fees = A(1+g-f)^H.
 * g is the assumed gross return for illustration only, not a forecast.
 */
export function compareProducts(codes: string[], amount: number, horizonYears: number): CompareResult {
  const items: CompareItem[] = codes
    .map((code) => findProduct(code))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => {
      const g = ASSUMPTIONS[p.asset_class];
      const f = p.annual_fee_pct / 100;
      const grossEnd = amount * (1 + g) ** horizonYears;
      const netEnd = amount * (1 + g - f) ** horizonYears;
      return {
        code: p.code,
        name: p.name,
        risk_level: p.risk_level,
        suitable: null,
        annual_fee_pct: p.annual_fee_pct,
        assumed_return_pct: round1(g * 100),
        fee_cost: round2(grossEnd - netEnd),
        end_value_after_fees: round2(netEnd),
        liquidity_days: p.liquidity_days,
        lockup_months: p.lockup_months,
      };
    });

  const cheapest = items.reduce((min, item) => (item.fee_cost < min.fee_cost ? item : min), items[0]);

  return {
    amount,
    horizon_years: horizonYears,
    items,
    cheapest_code: cheapest?.code ?? "",
    data_label: "Sample data; returns are an assumption for illustration",
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
