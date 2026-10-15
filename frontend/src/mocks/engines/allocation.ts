import type { AssetClass, ProposalItem } from "@/lib/types";
import { MODEL_PORTFOLIOS } from "@/mocks/data/modelPortfolios";
import { PRODUCTS, isLiquid, type ProductRecord } from "@/mocks/data/products";
import { formatMoney, roundHalfUp } from "@/lib/format";

const CLASSES: AssetClass[] = ["cash", "bond", "gold", "equity"];
const NON_CASH: AssetClass[] = ["bond", "gold", "equity"];
const SPLIT_THRESHOLD = 40;
const SHORT_HORIZON_YEARS = 3;
const SHORT_HORIZON_CAP = 20;

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

function access(days: number): string {
  return days === 0 ? "same-day access" : `${days}-day access`;
}

/**
 * ceil(N / A x 100) without float noise: 7,000 / 100,000 x 100 is
 * 7.000000000000001 in floating point, which a plain Math.ceil turns into 8.
 */
function liquidityFloor(need: number, amount: number): number {
  return Math.ceil(Math.round(((need * 100) / amount) * 1e9) / 1e9);
}

/**
 * Allocation engine (Section 2.5.3), a port of backend/app/engines/allocation.py
 * so the mock returns the same items, weights and reasons as the real API.
 * Steps: base weights, horizon cap, liquidity floor, rounding, product
 * choice, split, empty-class fallback.
 */
export function buildAllocation(
  tier: number,
  amount: number,
  horizonYears: number,
  nearTermNeed: number
): AllocationResult {
  const notes: string[] = [];
  const weights: Record<AssetClass, number> = { ...(MODEL_PORTFOLIOS[tier] ?? MODEL_PORTFOLIOS[3]) };

  // 2. Horizon cap: under 3 years, equity + gold <= 20%; excess from equity first, then gold.
  if (horizonYears < SHORT_HORIZON_YEARS) {
    const egTotal = weights.equity + weights.gold;
    if (egTotal > SHORT_HORIZON_CAP) {
      const excess = egTotal - SHORT_HORIZON_CAP;
      const fromEquity = Math.min(weights.equity, excess);
      weights.equity -= fromEquity;
      weights.gold -= Math.min(weights.gold, excess - fromEquity);
      weights[tier === 1 ? "cash" : "bond"] += excess;
      notes.push(
        `Your horizon is under ${SHORT_HORIZON_YEARS} years, so equity and gold were capped at ${SHORT_HORIZON_CAP}% combined.`
      );
    }
  }

  // 3. Liquidity floor: cash >= ceil(N / A x 100)%, shortfall taken pro rata from the other classes.
  if (amount > 0 && nearTermNeed > 0) {
    const floor = liquidityFloor(nearTermNeed, amount);
    if (floor > weights.cash) {
      const shortfall = floor - weights.cash;
      const othersTotal = NON_CASH.reduce((s, c) => s + weights[c], 0);
      if (othersTotal > 0) {
        for (const c of NON_CASH) weights[c] -= Math.min(weights[c], (weights[c] / othersTotal) * shortfall);
      }
      weights.cash = floor;
      notes.push(
        `At least ${floor}% is kept in cash you can withdraw within 1 day, to cover your near-term need of ${formatMoney(nearTermNeed)}.`
      );
    }
  }

  // 4. Rounding to whole percents; a positive remainder goes to cash, a negative one comes out of
  //    the largest non-cash class, so rounding never undoes the liquidity floor or the horizon cap.
  const rounded: Record<AssetClass, number> = {
    cash: roundHalfUp(weights.cash),
    bond: roundHalfUp(weights.bond),
    gold: roundHalfUp(weights.gold),
    equity: roundHalfUp(weights.equity),
  };
  const remainder = 100 - CLASSES.reduce((s, c) => s + rounded[c], 0);
  if (remainder >= 0) {
    rounded.cash += remainder;
  } else {
    for (let i = 0; i < -remainder; i += 1) {
      const largest = NON_CASH.reduce((a, b) => (rounded[b] > rounded[a] ? b : a));
      rounded[largest] -= 1;
    }
  }
  if (horizonYears < SHORT_HORIZON_YEARS) {
    const overflow = rounded.equity + rounded.gold - SHORT_HORIZON_CAP;
    if (overflow > 0) {
      const fromEquity = Math.min(rounded.equity, overflow);
      rounded.equity -= fromEquity;
      rounded.gold -= overflow - fromEquity;
      rounded[tier === 1 ? "cash" : "bond"] += overflow;
    }
  }

  // 5. Product choice: risk <= T, lock-up <= H x 12, minimum <= slot; liquid-only cash when N > 0.
  const candidatesFor = (cls: AssetClass, weightPct: number) =>
    PRODUCTS.filter(
      (p) =>
        p.asset_class === cls &&
        p.risk_level <= tier &&
        p.lockup_months <= horizonYears * 12 &&
        p.min_investment <= (weightPct / 100) * amount &&
        (cls !== "cash" || nearTermNeed <= 0 || isLiquid(p))
    ).sort(sortCandidates);

  const final: Record<AssetClass, number> = { ...rounded };
  const byClass: Record<AssetClass, ProposalItem[]> = { cash: [], bond: [], gold: [], equity: [] };

  // 6-7. Non-cash classes first, so an empty class can move its weight into the cash slot.
  for (const cls of NON_CASH) {
    const weight = rounded[cls];
    if (weight <= 0) continue;
    const found = candidatesFor(cls, weight);
    if (found.length === 0) {
      final.cash += weight;
      final[cls] = 0;
      notes.push(`No ${cls} product suits tier ${tier} with this amount and horizon, so its ${weight}% moved to cash.`);
      continue;
    }
    if (weight > SPLIT_THRESHOLD && found.length >= 2) {
      const [p1, p2] = found;
      const half = Math.floor(weight / 2);
      const why =
        `${cls[0].toUpperCase()}${cls.slice(1)} is ${weight}% of this mix, above the ${SPLIT_THRESHOLD}% limit for one product, ` +
        `so it is split between the two lowest-fee ${cls} products that suit tier ${tier}.`;
      byClass[cls].push(itemFrom(p1, half + (weight % 2), amount, `${why} This one charges ${p1.annual_fee_pct.toFixed(2)}% a year.`));
      byClass[cls].push(itemFrom(p2, half, amount, `${why} This one charges ${p2.annual_fee_pct.toFixed(2)}% a year.`));
    } else {
      const p = found[0];
      const lockup = p.lockup_months ? `, locked for ${p.lockup_months} months` : "";
      byClass[cls].push(
        itemFrom(
          p,
          weight,
          amount,
          `Lowest-fee ${cls} product that suits tier ${tier}: ${p.annual_fee_pct.toFixed(2)}% a year, ` +
            `risk level R${p.risk_level}, ${access(p.liquidity_days)}${lockup}.`
        )
      );
    }
  }

  if (final.cash > 0) {
    const [p] = candidatesFor("cash", final.cash);
    if (p) {
      const why =
        nearTermNeed > 0
          ? `Cash you can withdraw within 1 day (${access(p.liquidity_days)}, ${p.annual_fee_pct.toFixed(2)}% a year), ` +
            `covering your near-term need of ${formatMoney(nearTermNeed)}.`
          : `Lowest-fee cash product: ${p.annual_fee_pct.toFixed(2)}% a year, risk level R${p.risk_level}, ${access(p.liquidity_days)}.`;
      byClass.cash.push(itemFrom(p, final.cash, amount, why));
    }
  }

  return { items: CLASSES.flatMap((c) => byClass[c]), class_weights_pct: final, notes };
}

function itemFrom(p: ProductRecord, weightPct: number, amount: number, rationale: string): ProposalItem {
  return {
    product_code: p.code,
    name: p.name,
    asset_class: p.asset_class,
    risk_level: p.risk_level,
    weight_pct: weightPct,
    amount: Math.round((weightPct / 100) * amount * 100) / 100,
    rationale,
  };
}
