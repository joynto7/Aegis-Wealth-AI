"use client";

import { useTheme } from "next-themes";
import type { AssetClass } from "@/lib/types";

/**
 * Literal colour values for Recharts (SVG fill/stroke attributes need a literal
 * colour, not a CSS var() reference, for reliable cross-browser rendering). Keep
 * them in lockstep with --asset-* in globals.css. Both sets were validated
 * all-pairs for colour-blind separation (docs/ui-redesign.md, Part 2); the dark
 * set is its own steps for the dark surface, not an automatic flip.
 */
export const ASSET_COLORS_LIGHT: Record<AssetClass, string> = {
  cash: "#4a3aa7",
  bond: "#2a78d6",
  gold: "#eda100",
  equity: "#1baf7a",
};

export const ASSET_COLORS_DARK: Record<AssetClass, string> = {
  cash: "#5b4bc4",
  bond: "#3987e5",
  gold: "#c98500",
  equity: "#199e70",
};

/** Light-mode colours, for code outside React. Components use useAssetColors(). */
export const ASSET_COLORS = ASSET_COLORS_LIGHT;

export const ASSET_ORDER: AssetClass[] = ["cash", "bond", "gold", "equity"];

export function useAssetColors(): Record<AssetClass, string> {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "dark" ? ASSET_COLORS_DARK : ASSET_COLORS_LIGHT;
}

/** The chart surface colour, used for the 2px gaps between marks. */
export function useChartSurface(): string {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "dark" ? "#0e1528" : "#ffffff";
}
