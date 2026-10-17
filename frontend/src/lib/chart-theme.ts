"use client";

import { useTheme } from "next-themes";

/**
 * Literal mark colours for charts (SVG attributes need literal values for reliable rendering), kept in
 * lockstep with the v2 tokens in globals.css. Projection bands are one indigo hue as washes on the surface,
 * the median a 2px line of the same hue, references in ink and muted ink; never a status colour, which the
 * design keeps for PASS, WARNING and REJECT.
 */
export interface ChartTheme {
  surface: string;
  grid: string;
  ink: string;
  muted: string;
  bandOuter: string;
  bandInner: string;
  line: string;
  accent: string;
  track: string;
  deemphasis: string;
}

const LIGHT: ChartTheme = {
  surface: "#ffffff",
  grid: "#e3e8f1",
  ink: "#0b1220",
  muted: "#566079",
  bandOuter: "rgba(79, 70, 229, 0.12)",
  bandInner: "rgba(79, 70, 229, 0.26)",
  line: "#4f46e5",
  accent: "#4f46e5",
  track: "#e0e3ff",
  deemphasis: "#c3cad8",
};

const DARK: ChartTheme = {
  surface: "#0e1528",
  grid: "#1f2a44",
  ink: "#e7eaf3",
  muted: "#98a2bb",
  bandOuter: "rgba(139, 147, 255, 0.14)",
  bandInner: "rgba(139, 147, 255, 0.3)",
  line: "#a5b4fc",
  accent: "#8b93ff",
  track: "#1b2050",
  deemphasis: "#33405f",
};

export function useChartTheme(): ChartTheme {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "dark" ? DARK : LIGHT;
}

/** Axis ticks: compact and clean (250K, 1.2M), with the currency named once in the axis caption. */
export function compactAmount(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(Math.round(value));
}
