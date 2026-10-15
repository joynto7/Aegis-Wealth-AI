import type { AssetClass, ProposalItem } from "@/lib/types";
import { MODEL_PORTFOLIOS } from "@/mocks/data/modelPortfolios";
import { PRODUCTS, isLiquid, type ProductRecord } from "@/mocks/data/products";
import { roundHalfUp } from "@/lib/format";

const CLASSES: AssetClass[] = ["cash", "bond", "gold", "equity"];

export interface AllocationResult {
  items: ProposalItem[];
  class_weights_pct: Record<AssetClass, number>;
  notes: string[];
}

function sortCandidates(a: ProductRecord, b: ProductRecord): number {
  if (a.annual_fee_pct !== b.annual_fee_pct) return a.annual_fee_pct - b.annual_fee_pct;
  if (a.liquidity_days !== b.liquidity_days) return a.liquidity_days - b.liquidity_days;
  return a.code.localeCompare(b.code);
}

/**
 * Allocation engine (Section 2.5.3). Pure, deterministic. Runs the seven
 * steps in order: base weights, horizon cap, liquidity floor, rounding,
 * product choice, split, empty-class fallback.
 */
export function buildAllocation(
  tier: number,
  amount: number,
  horizonYears: number,
  nearTermNeed: number
): AllocationResult {
  const notes: string[] = [];
  const weights: Record<AssetClass, number> = { ...MODEL_PORTFOLIOS[tier] ?? MODEL_PORTFOLIOS[3] };

  // 2. Horizon cap: if H < 3, equity + gold <= 20%.
  if (horizonYears < 3) {
    const cap = 20;
    const egTotal = weights.equity + weights.gold;
    if (egTotal > cap) {
      let excess = egTotal - cap;
      const fromEquity = Math.min(weights.equity, excess);
      weights.equity -= fromEquity;
      excess -= fromEquity;
      const fromGold = Math.min(weights.gold, excess);
      weights.gold -= fromGold;
      excess -= fromGold;
      const removed = egTotal - cap;
      if (tier === 1) weights.cash += removed;
      else weights.bond += removed;
      notes.push("Horizon under 3 years: equity and gold were capped at 20% combined.");
    }
  }

  // 3. Liquidity floor: cash weight >= ceil(N / A * 100)%.
  if (amount > 0) {
    const floor = Math.ceil((nearTermNeed / amount) * 100);
    if (floor > weights.cash) {
      const shortfall = floor - weights.cash;
      const others: AssetClass[] = ["bond", "gold", "equity"];
      const othersTotal = others.reduce((s, c) => s + weights[c], 0);
      if (othersTotal > 0) {
        for (const c of others) {
          const take = Math.min(weights[c], (weights[c] / othersTotal) * shortfall);
          weights[c] -= take;
        }
      }
      weights.cash = floor;
      notes.push(`Liquidity floor: at least ${floor}% was moved to cash to cover the near-term need.`);
    }
  }

  // 4. Rounding: round each class half up to a whole percent; remainder to cash.
  const rounded: Record<AssetClass, number> = {
    cash: roundHalfUp(weights.cash),
    bond: roundHalfUp(weights.bond),
    gold: roundHalfUp(weights.gold),
    equity: roundHalfUp(weights.equity),
  };
  const total = rounded.cash + rounded.bond + rounded.gold + rounded.equity;
  rounded.cash += 100 - total;

  // 5. Product choice per class.
  const qualifies = (p: ProductRecord, classAmount: number, classWeight: number) =>
    p.risk_level <= tier &&
    p.lockup_months <= horizonYears * 12 &&
    p.min_investment <= classAmount &&
    (p.asset_class !== "cash" || classWeight === 0 || nearTermNeed <= 0 || isLiquid(p));

  const itemsByClass: Record<AssetClass, ProposalItem[]> = { cash: [], bond: [], gold: [], equity: [] };
  const finalWeights: Record<AssetClass, number> = { ...rounded };

  const candidatesFor = (cls: AssetClass, weightPct: number) => {
    const classAmount = (weightPct / 100) * amount;
    let candidates = PRODUCTS.filter((p) => p.asset_class === cls && qualifies(p, classAmount, weightPct));
    // Cash class with a near-term need: only liquid products qualify.
    if (cls === "cash" && nearTermNeed > 0) {
      candidates = candidates.filter(isLiquid);
    }
    return [...candidates].sort(sortCandidates);
  };

  // Non-cash classes first, so an empty class (step 7) can still move its
  // weight into the cash slot before the cash product is chosen.
  for (const cls of CLASSES) {
    if (cls === "cash") continue;
    const weightPct = rounded[cls];
    if (weightPct <= 0) continue;
    const candidates = candidatesFor(cls, weightPct);

    if (candidates.length === 0) {
      // 7. Empty class: weight moves to cash.
      finalWeights.cash += weightPct;
      finalWeights[cls] = 0;
      notes.push(`No ${cls} product qualified for this amount and horizon; its weight moved to cash.`);
      continue;
    }

    if (weightPct > 40 && candidates.length >= 2) {
      // 6. Split between the two cheapest products.
      const [p1, p2] = candidates;
      const half = Math.floor(weightPct / 2);
      const w1 = half + (weightPct % 2); // first takes the odd 1%
      const w2 = half;
      itemsByClass[cls].push(itemFrom(p1, w1, amount), itemFrom(p2, w2, amount));
    } else {
      itemsByClass[cls].push(itemFrom(candidates[0], weightPct, amount));
    }
  }

  if (finalWeights.cash > 0) {
    const [cashProduct] = candidatesFor("cash", finalWeights.cash);
    if (cashProduct) itemsByClass.cash.push(itemFrom(cashProduct, finalWeights.cash, amount));
  }

  const items = CLASSES.flatMap((cls) => itemsByClass[cls]);
  return { items, class_weights_pct: finalWeights, notes };
}

function itemFrom(p: ProductRecord, weightPct: number, amount: number): ProposalItem {
  return {
    product_code: p.code,
    name: p.name,
    asset_class: p.asset_class,
    risk_level: p.risk_level,
    weight_pct: weightPct,
    amount: Math.round(((weightPct / 100) * amount) * 100) / 100,
  };
}
