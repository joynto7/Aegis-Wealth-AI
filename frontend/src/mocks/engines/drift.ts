import type { AssetClass } from "@/lib/types";
import { round2 } from "@/mocks/engines/numbers";

/**
 * Portfolio drift, a port of backend/app/engines/drift.py: each asset class's live weight against the target of the
 * latest executed proposal, in percentage points. A class is outside its band when |drift| is more than the band,
 * compared on the rounded figure; portfolio drift is half the sum of |drift|.
 */

const CLASSES: AssetClass[] = ["cash", "bond", "gold", "equity"];

export interface Holding {
  product_code: string;
  name: string;
  asset_class: AssetClass;
  units: number;
  value: number;
}

export interface TargetItem {
  product_code: string;
  name: string;
  asset_class: AssetClass;
  weight_pct: number;
}

export interface DriftClassRow {
  asset_class: AssetClass;
  target_pct: number;
  current_pct: number;
  drift_pp: number;
  outside_band: boolean;
}

export interface DriftResult {
  total_value: number;
  band_pp: number;
  classes: DriftClassRow[];
  products: {
    product_code: string;
    name: string;
    asset_class: AssetClass;
    target_pct: number;
    current_pct: number;
    drift_pp: number;
    value: number;
  }[];
  largest: { asset_class: AssetClass; drift_pp: number };
  portfolio_drift_pct: number;
  outside_band: boolean;
}

export function measureDrift(holdings: Holding[], targetItems: TargetItem[], bandPp: number): DriftResult {
  const total = holdings.reduce((s, h) => s + h.value, 0);
  const target: Record<AssetClass, number> = { cash: 0, bond: 0, gold: 0, equity: 0 };
  for (const t of targetItems) target[t.asset_class] += t.weight_pct;
  const held: Record<AssetClass, number> = { cash: 0, bond: 0, gold: 0, equity: 0 };
  for (const h of holdings) held[h.asset_class] += h.value;
  const share = (value: number) => (total > 0 ? (value / total) * 100 : 0);
  const points = (value: number) => round2(value) + 0; // + 0 turns a rounded -0 into 0

  const classes = CLASSES.map((c) => {
    const drift = points(share(held[c]) - target[c]);
    return { asset_class: c, target_pct: round2(target[c]), current_pct: round2(share(held[c])), drift_pp: drift, outside_band: Math.abs(drift) > bandPp };
  });
  let largest = classes[0];
  for (const entry of classes.slice(1)) if (Math.abs(entry.drift_pp) > Math.abs(largest.drift_pp)) largest = entry;

  const byCode = new Map(holdings.map((h) => [h.product_code, h]));
  const inTarget = new Set(targetItems.map((t) => t.product_code));
  const rows: [TargetItem | Holding, number, number][] = [
    ...targetItems.map((t): [TargetItem, number, number] => [t, byCode.get(t.product_code)?.value ?? 0, t.weight_pct]),
    ...holdings.filter((h) => !inTarget.has(h.product_code)).map((h): [Holding, number, number] => [h, h.value, 0]),
  ];

  return {
    total_value: round2(total),
    band_pp: bandPp,
    classes,
    products: rows.map(([entry, value, weight]) => ({
      product_code: entry.product_code,
      name: entry.name,
      asset_class: entry.asset_class,
      target_pct: round2(weight),
      current_pct: round2(share(value)),
      drift_pp: points(share(value) - weight),
      value: round2(value),
    })),
    largest: { asset_class: largest.asset_class, drift_pp: largest.drift_pp },
    portfolio_drift_pct: round2(CLASSES.reduce((s, c) => s + Math.abs(share(held[c]) - target[c]), 0) / 2),
    outside_band: classes.some((c) => c.outside_band),
  };
}
