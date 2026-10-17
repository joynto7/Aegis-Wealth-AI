import type { AssetClass } from "@/lib/types";
import { HISTORY_MONTHLY, type MonthlyRow } from "@/mocks/data/history";
import { PRODUCTS } from "@/mocks/data/products";
import { round2, round4 } from "@/mocks/engines/numbers";

/**
 * The simulated market clock, a port of backend/app/engines/market.py. Month 0 is the data as of start_date; the
 * k-th advance replays the k-th month of the illustrative history counted from replay_from, wrapping to the first
 * month after the last. NAV after k months = round4(base NAV × Π(1 + r_class)), from the base NAV every time, so the
 * figures match the backend's exactly. Illustrative only: replayed synthetic history, not a forecast.
 */

/** backend/data/market.json */
export const MARKET = {
  version: "mk-2026-10",
  data_label: "Illustrative",
  start_date: "2026-09-30",
  replay_from: "2009-03",
  max_months_per_advance: 12,
  note:
    "A simulated market for the sandbox. Each simulated month replays one month of the illustrative monthly history, starting from March 2009 (the post-crisis rally) so a short demo shows drift, and moves every product's NAV by its asset class's return for that month. Not a forecast and not real prices.",
};

const CLASSES: AssetClass[] = ["cash", "bond", "gold", "equity"];

export function replayStart(history: MonthlyRow[] = HISTORY_MONTHLY, replayFrom: string = MARKET.replay_from): number {
  const index = history.findIndex((row) => row.month === replayFrom);
  if (index < 0) throw new Error(`replay_from ${replayFrom} is not in the history`);
  return index;
}

/** The history month the step-th advance applies (step 1 is the first). */
export function appliedMonth(history: MonthlyRow[], start: number, step: number): MonthlyRow {
  return history[(start + step - 1) % history.length];
}

/** Π(1 + r) per asset class over the first `months` advances, multiplied in order. */
export function growth(history: MonthlyRow[], start: number, months: number): Record<AssetClass, number> {
  const g: Record<AssetClass, number> = { cash: 1, bond: 1, gold: 1, equity: 1 };
  for (let step = 1; step <= months; step++) {
    const row = appliedMonth(history, start, step);
    for (const c of CLASSES) g[c] *= 1 + row[c];
  }
  return g;
}

/** Every product's NAV after `months` advances, to 4 decimals. */
export function navsAt(months: number): Record<string, number> {
  const g = growth(HISTORY_MONTHLY, replayStart(), months);
  return Object.fromEntries(PRODUCTS.map((p) => [p.code, round4(p.nav * g[p.asset_class])]));
}

/** The last day of the month `months` after start_date's month, as YYYY-MM-DD. */
export function marketDate(startDate: string, months: number): string {
  const [year, month] = startDate.split("-").map(Number);
  const total = year * 12 + (month - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

export interface MarketMoves {
  month: number;
  as_of: string;
  replayed: string | null;
  next_replay: string;
  last_returns_pct: Record<AssetClass, number> | null;
  since_start_pct: Record<AssetClass, number>;
}

/** The clock after `months` advances: its date, the month last replayed, and the moves by class in percent. */
export function describe(months: number): MarketMoves {
  const start = replayStart();
  const last = months > 0 ? appliedMonth(HISTORY_MONTHLY, start, months) : null;
  const g = growth(HISTORY_MONTHLY, start, months);
  const pct = (f: (c: AssetClass) => number) => Object.fromEntries(CLASSES.map((c) => [c, round2(f(c))])) as Record<AssetClass, number>;
  return {
    month: months,
    as_of: marketDate(MARKET.start_date, months),
    replayed: last ? last.month : null,
    next_replay: appliedMonth(HISTORY_MONTHLY, start, months + 1).month,
    last_returns_pct: last ? pct((c) => last[c] * 100) : null,
    since_start_pct: pct((c) => (g[c] - 1) * 100),
  };
}
