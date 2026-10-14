import type { AssetClass } from "@/lib/types";

/**
 * Literal colour values for Recharts (SVG fill/stroke attributes need a
 * literal colour, not a CSS var() reference, for reliable cross-browser
 * rendering). Keep these in lockstep with --asset-* in globals.css.
 */
export const ASSET_COLORS: Record<AssetClass, string> = {
  cash: "#64748b",
  bond: "#2563eb",
  gold: "#b7791f",
  equity: "#0f766e",
};

export const ASSET_ORDER: AssetClass[] = ["cash", "bond", "gold", "equity"];
