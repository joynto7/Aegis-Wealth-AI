import type { AssetClass } from "@/lib/types";

/**
 * history_monthly.csv — monthly returns by asset class (Section 2.5.1).
 *
 * The real build sources this from licensed series (Decision D-1): the
 * Kenneth R. French Data Library, FRED, and World Bank commodity prices.
 * Until a licence is confirmed, this frontend ships a hand-authored,
 * clearly fictional series shaped like the three required episodes
 * (2007-11 to 2009-10, 2020, 2022) plus calm filler months either side,
 * so every chart and metric has consistent, deterministic data to work
 * from. Labelled "Illustrative" everywhere it is shown, per Section 2.5.1.
 */

export type MonthlyRow = Record<AssetClass, number> & { month: string };

const START_YEAR = 2006;
const START_MONTH = 1; // January
const END_YEAR = 2026;
const END_MONTH = 9; // September

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function addMonths(year: number, month: number, delta: number): [number, number] {
  const total = year * 12 + (month - 1) + delta;
  return [Math.floor(total / 12), (total % 12) + 1];
}

// Deterministic filler returns outside the hand-authored crisis windows.
// Pure functions of the month index — no randomness, no wall-clock reads.
function fillerReturn(assetClass: AssetClass, idx: number): number {
  switch (assetClass) {
    case "equity":
      return 0.004 + 0.035 * Math.sin(idx * 0.9);
    case "bond":
      return 0.0025 + 0.008 * Math.sin(idx * 0.5 + 1);
    case "gold":
      return 0.003 + 0.02 * Math.sin(idx * 0.35 + 2);
    case "cash":
    default:
      return 0.0012;
  }
}

// Hand-authored crisis windows: [equity, bond, gold, cash] per month.
const GFC_START = "2007-11";
const GFC: [number, number, number, number][] = [
  [-0.04, 0.003, 0.01, 0.004],
  [-0.01, 0.004, 0.02, 0.004],
  [-0.06, 0.002, 0.015, 0.0035],
  [-0.02, 0.003, 0.01, 0.0035],
  [-0.03, -0.01, 0.03, 0.003],
  [0.02, 0.0, 0.02, 0.003],
  [0.01, 0.002, -0.01, 0.0025],
  [-0.05, 0.003, 0.0, 0.0025],
  [-0.01, -0.02, -0.05, 0.002],
  [0.0, -0.03, -0.18, 0.002],
  [-0.12, -0.01, 0.05, 0.0015],
  [-0.17, 0.0, 0.08, 0.0015],
  [-0.08, 0.01, 0.06, 0.001],
  [0.01, 0.015, 0.05, 0.001],
  [-0.09, 0.01, 0.04, 0.0008],
  [-0.11, 0.008, 0.03, 0.0008],
  [0.09, 0.012, 0.05, 0.0007],
  [0.1, 0.009, 0.02, 0.0007],
  [0.05, 0.006, 0.01, 0.0006],
  [0.0, 0.004, 0.02, 0.0006],
  [0.07, 0.003, 0.03, 0.0005],
  [0.03, 0.004, 0.01, 0.0005],
  [0.04, 0.003, 0.02, 0.0005],
  [-0.02, 0.004, 0.01, 0.0005],
];

const PANDEMIC_START = "2020-01";
const PANDEMIC: [number, number, number, number][] = [
  [0.01, 0.005, 0.03, 0.001],
  [-0.01, 0.004, -0.01, 0.001],
  [-0.13, 0.01, 0.0, 0.001],
  [0.11, 0.005, 0.07, 0.0003],
  [0.05, 0.003, 0.03, 0.0002],
  [0.02, 0.002, 0.03, 0.0002],
  [0.02, 0.002, 0.08, 0.0002],
  [0.05, 0.001, -0.03, 0.0002],
  [-0.02, 0.001, 0.01, 0.0002],
  [-0.01, 0.001, 0.01, 0.0002],
  [0.08, -0.005, -0.04, 0.0002],
  [0.03, 0.002, 0.01, 0.0002],
];

const RATE_SHOCK_START = "2022-01";
const RATE_SHOCK: [number, number, number, number][] = [
  [-0.03, -0.02, -0.02, 0.0005],
  [-0.02, -0.015, 0.06, 0.0008],
  [0.03, -0.02, 0.02, 0.001],
  [-0.04, -0.025, 0.01, 0.0012],
  [-0.01, -0.005, -0.03, 0.0015],
  [-0.08, -0.02, -0.02, 0.002],
  [0.09, 0.02, -0.02, 0.0025],
  [-0.03, -0.03, -0.03, 0.003],
  [-0.09, -0.04, 0.02, 0.0032],
  [0.08, 0.02, 0.01, 0.0035],
  [0.05, 0.03, 0.08, 0.0038],
  [-0.04, -0.01, 0.03, 0.004],
];

function buildOverrideMap(): Map<string, [number, number, number, number]> {
  const map = new Map<string, [number, number, number, number]>();
  const apply = (startKey: string, rows: [number, number, number, number][]) => {
    const [sy, sm] = startKey.split("-").map(Number);
    rows.forEach((row, i) => {
      const [y, m] = addMonths(sy, sm, i);
      map.set(monthKey(y, m), row);
    });
  };
  apply(GFC_START, GFC);
  apply(PANDEMIC_START, PANDEMIC);
  apply(RATE_SHOCK_START, RATE_SHOCK);
  return map;
}

function buildHistory(): MonthlyRow[] {
  const overrides = buildOverrideMap();
  const rows: MonthlyRow[] = [];
  let [y, m] = [START_YEAR, START_MONTH];
  let idx = 0;
  while (y < END_YEAR || (y === END_YEAR && m <= END_MONTH)) {
    const key = monthKey(y, m);
    const override = overrides.get(key);
    const [equity, bond, gold, cash] = override ?? [
      fillerReturn("equity", idx),
      fillerReturn("bond", idx),
      fillerReturn("gold", idx),
      fillerReturn("cash", idx),
    ];
    rows.push({ month: key, equity, bond, gold, cash });
    idx += 1;
    [y, m] = addMonths(y, m, 1);
  }
  return rows;
}

export const HISTORY_MONTHLY: MonthlyRow[] = buildHistory();

export function historySlice(startKey: string, endKey: string): MonthlyRow[] {
  return HISTORY_MONTHLY.filter((r) => r.month >= startKey && r.month <= endKey);
}

export const HISTORY_DATA_LABEL = "Illustrative";
export const HISTORY_DATA_AS_OF = "2026-09-30";
