import type { AssetClass, ProposalItem, ProposalMetrics } from "@/lib/types";
import { HISTORY_MONTHLY } from "@/mocks/data/history";
import { findProduct, isLiquid } from "@/mocks/data/products";

const CLASSES: AssetClass[] = ["cash", "bond", "gold", "equity"];

function classWeightFractions(items: ProposalItem[]): Record<AssetClass, number> {
  const w: Record<AssetClass, number> = { cash: 0, bond: 0, gold: 0, equity: 0 };
  for (const item of items) w[item.asset_class] += item.weight_pct / 100;
  return w;
}

/** Risk metrics (Section 2.5.4). Sample standard deviation (n-1) over the whole history file. */
export function computeMetrics(items: ProposalItem[]): ProposalMetrics {
  const w = classWeightFractions(items);

  const monthlyReturns = HISTORY_MONTHLY.map((row) => CLASSES.reduce((acc, c) => acc + w[c] * row[c], 0));
  const n = monthlyReturns.length;
  const mean = monthlyReturns.reduce((a, b) => a + b, 0) / n;
  const variance = monthlyReturns.reduce((a, r) => a + (r - mean) ** 2, 0) / (n - 1);
  const stdevAnnual = Math.sqrt(variance) * Math.sqrt(12);

  let value = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const r of monthlyReturns) {
    value *= 1 + r;
    peak = Math.max(peak, value);
    maxDrawdown = Math.max(maxDrawdown, (peak - value) / peak);
  }

  let weightedFee = 0;
  let liquidShare = 0;
  let largestNonCash = 0;
  for (const item of items) {
    const product = findProduct(item.product_code);
    if (!product) continue;
    weightedFee += (item.weight_pct / 100) * product.annual_fee_pct;
    if (isLiquid(product)) liquidShare += item.weight_pct / 100;
    if (item.asset_class !== "cash") largestNonCash = Math.max(largestNonCash, item.weight_pct);
  }

  return {
    volatility_pct: round1(stdevAnnual * 100),
    max_drawdown_pct: round1(maxDrawdown * 100),
    weighted_fee_pct: round2(weightedFee),
    liquid_share_pct: round1(liquidShare * 100),
    largest_weight_pct: round1(largestNonCash),
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
