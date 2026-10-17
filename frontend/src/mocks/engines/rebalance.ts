import type { AssetClass } from "@/lib/types";
import type { Holding, TargetItem } from "@/mocks/engines/drift";
import { round2, unitsFor } from "@/mocks/engines/numbers";

/**
 * Rebalancing trades, a port of backend/app/engines/rebalance.py. A product above its goal (target weight × live
 * value) sells the excess, one below buys the gap, one the target no longer holds sells every unit. Units are floored
 * to 4 decimals at the current NAV; gaps under CNY 1 are left alone. Sales come first and fund the purchases; the
 * account's cash covers what rounding leaves, and if even that falls short the largest purchase shrinks to fit.
 */

export const MIN_TRADE = 1;

export interface Trade {
  product_code: string;
  name: string;
  asset_class: AssetClass;
  nav: number;
  from_pct: number;
  to_pct: number;
  side: "buy" | "sell";
  units: number;
  amount: number;
}

export interface RebalancePlanResult {
  trades: Trade[];
  sell_total: number;
  buy_total: number;
  net_cash: number;
  turnover_pct: number;
}

export function planTrades(
  holdings: Holding[],
  targetItems: TargetItem[],
  opts: { amount: number; navs: Record<string, number>; cash: number; minTrade?: number }
): RebalancePlanResult {
  const { amount, navs, cash } = opts;
  const minTrade = opts.minTrade ?? MIN_TRADE;
  const held = new Map(holdings.map((h) => [h.product_code, h]));
  const target = new Map(targetItems.map((t) => [t.product_code, t]));
  const codes = [...targetItems.map((t) => t.product_code), ...holdings.filter((h) => !target.has(h.product_code)).map((h) => h.product_code)];
  const sells: Trade[] = [];
  const buys: Trade[] = [];
  for (const code of codes) {
    const entry = target.get(code) ?? held.get(code)!;
    const nav = navs[code];
    const unitsHeld = held.get(code)?.units ?? 0;
    const current = held.get(code)?.value ?? 0;
    const weight = target.get(code)?.weight_pct ?? 0;
    const gap = round2(round2((weight / 100) * amount) - current);
    const base = {
      product_code: code,
      name: entry.name,
      asset_class: entry.asset_class,
      nav,
      from_pct: amount > 0 ? round2((current / amount) * 100) : 0,
      to_pct: round2(weight),
    };
    if (weight <= 0 && unitsHeld > 0) {
      sells.push({ ...base, side: "sell", units: unitsHeld, amount: round2(unitsHeld * nav) });
    } else if (gap <= -minTrade && unitsHeld > 0) {
      const units = Math.min(unitsHeld, unitsFor(-gap, nav));
      if (units > 0) sells.push({ ...base, side: "sell", units, amount: round2(units * nav) });
    } else if (gap >= minTrade) {
      const units = unitsFor(gap, nav);
      if (units > 0) buys.push({ ...base, side: "buy", units, amount: round2(units * nav) });
    }
  }

  const available = round2(cash + sells.reduce((s, t) => s + t.amount, 0));
  let shortfall = round2(buys.reduce((s, t) => s + t.amount, 0) - available);
  for (const buy of [...buys].sort((a, b) => b.amount - a.amount)) {
    if (shortfall <= 0) break;
    const units = unitsFor(Math.max(0, round2(buy.amount - shortfall)), buy.nav);
    const cost = round2(units * buy.nav);
    shortfall = round2(shortfall - (buy.amount - cost));
    buy.units = units;
    buy.amount = cost;
  }
  const kept = buys.filter((b) => b.units > 0);

  const sellTotal = round2(sells.reduce((s, t) => s + t.amount, 0));
  const buyTotal = round2(kept.reduce((s, t) => s + t.amount, 0));
  return {
    trades: [...sells, ...kept],
    sell_total: sellTotal,
    buy_total: buyTotal,
    net_cash: round2(sellTotal - buyTotal),
    turnover_pct: amount > 0 ? round2((sellTotal / amount) * 100) : 0,
  };
}
