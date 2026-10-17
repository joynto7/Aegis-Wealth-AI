import type { AssetClass } from "@/lib/types";
import { HISTORY_MONTHLY, type MonthlyRow } from "@/mocks/data/history";
import { round1, round2 } from "@/mocks/engines/numbers";

/**
 * Goal projection, a port of backend/app/engines/projection.py: block bootstrap over the monthly history
 * (12-month blocks), the weighted fee as a monthly drag, contributions paid in at each month's end, 1,000
 * paths, path p drawing its blocks from mulberry32 seeded with SEED + p. Same generator, same arithmetic in
 * the same order, so the mock gives the backend's numbers (scripts/verify.ts checks the worked example).
 */
export const SEED = 20_261_016;
export const PATHS = 1000;
export const BLOCK_MONTHS = 12;
const PERCENTILES = [10, 25, 50, 75, 90] as const;
const CONFIDENCE_LEVELS = [50, 75, 90] as const;
const CLASSES: AssetClass[] = ["cash", "bond", "gold", "equity"];

export const PROJECTION_LABEL = "Illustrative: resampled from synthetic history, not a forecast";
export const PROJECTION_METHOD =
  "1,000 paths, each year a run of 12 consecutive months drawn at random from the monthly history, net of the weighted annual fee; contributions paid in at the end of each month.";

/** The 32-bit generator with an exact twin in the backend (Mulberry32 in projection.py). */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function monthlyReturns(weights: Record<AssetClass, number>, feePct: number, history: MonthlyRow[]): number[] {
  const drag = feePct / 100 / 12;
  return history.map((row) => {
    let r = 0;
    for (const c of CLASSES) r += ((weights[c] ?? 0) / 100) * row[c];
    return r - drag;
  });
}

function blocks(returns: number[]): { growth: number[]; annuity: number[] } {
  const growth: number[] = [];
  const annuity: number[] = [];
  for (let start = 0; start <= returns.length - BLOCK_MONTHS; start++) {
    let g = 1;
    let s = 0;
    for (const r of returns.slice(start, start + BLOCK_MONTHS)) {
      g *= 1 + r;
      s = s * (1 + r) + 1;
    }
    growth.push(g);
    annuity.push(s);
  }
  return { growth, annuity };
}

export function percentile(sorted: number[], q: number): number {
  const n = sorted.length;
  if (!n) return 0;
  const pos = ((n - 1) * q) / 100;
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, n - 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function nearestRank(sorted: number[], q: number): number {
  const rank = Math.max(1, Math.ceil((q / 100) * sorted.length));
  return sorted[rank - 1];
}

const ascending = (a: number, b: number) => a - b;

export interface ProjectionCore {
  paths: number;
  block_months: number;
  seed: number;
  total_contributed: number;
  years: { year: number; p10: number; p25: number; p50: number; p75: number; p90: number }[];
  end: { p10: number; p25: number; p50: number; p75: number; p90: number };
  probability_target_pct: number | null;
  probability_loss_pct: number;
  median_shortfall: number | null;
  required_monthly: { confidence_pct: number; monthly: number }[] | null;
}

export function project(
  weights: Record<AssetClass, number>,
  feePct: number,
  opts: { amount: number; horizonYears: number; monthly: number; target: number | null; history?: MonthlyRow[]; paths?: number }
): ProjectionCore {
  const history = opts.history ?? HISTORY_MONTHLY;
  const paths = opts.paths ?? PATHS;
  const { growth, annuity } = blocks(monthlyReturns(weights, feePct, history));
  const nBlocks = growth.length;
  const years: number[][] = [new Array(paths).fill(opts.amount)];
  for (let y = 0; y < opts.horizonYears; y++) years.push(new Array(paths).fill(0));
  const base: number[] = new Array(paths).fill(0);
  const unit: number[] = new Array(paths).fill(0);
  for (let p = 0; p < paths; p++) {
    const rng = mulberry32(SEED + p);
    let value = opts.amount;
    let a = opts.amount;
    let b = 0;
    for (let y = 1; y <= opts.horizonYears; y++) {
      const k = Math.floor(rng() * nBlocks);
      const g = growth[k];
      const s = annuity[k];
      value = value * g + opts.monthly * s;
      a = a * g;
      b = b * g + s;
      years[y][p] = value;
    }
    base[p] = a;
    unit[p] = b;
  }
  const contributed = opts.amount + opts.monthly * 12 * opts.horizonYears;
  const band = years.map((values, year) => {
    const sorted = [...values].sort(ascending);
    const row = { year, p10: 0, p25: 0, p50: 0, p75: 0, p90: 0 };
    for (const q of PERCENTILES) row[`p${q}`] = round2(percentile(sorted, q));
    return row;
  });
  const final = [...years[years.length - 1]].sort(ascending);

  let probabilityTarget: number | null = null;
  let medianShortfall: number | null = null;
  let required: ProjectionCore["required_monthly"] = null;
  if (opts.target !== null) {
    const target = opts.target;
    const reached = final.filter((v) => v >= target).length;
    probabilityTarget = round1((reached / paths) * 100);
    const shortfalls = final.filter((v) => v < target).map((v) => target - v).sort(ascending);
    medianShortfall = shortfalls.length ? round2(percentile(shortfalls, 50)) : null;
    const needed = base.map((a, i) => (unit[i] > 0 ? Math.max(0, (target - a) / unit[i]) : Infinity)).sort(ascending);
    required = CONFIDENCE_LEVELS.filter((q) => Number.isFinite(nearestRank(needed, q))).map((q) => ({
      confidence_pct: q,
      monthly: Math.ceil(nearestRank(needed, q)),
    }));
  }
  const last = band[band.length - 1];
  return {
    paths,
    block_months: BLOCK_MONTHS,
    seed: SEED,
    total_contributed: round2(contributed),
    years: band,
    end: { p10: last.p10, p25: last.p25, p50: last.p50, p75: last.p75, p90: last.p90 },
    probability_target_pct: probabilityTarget,
    probability_loss_pct: round1((final.filter((v) => v < contributed).length / paths) * 100),
    median_shortfall: medianShortfall,
    required_monthly: required,
  };
}
