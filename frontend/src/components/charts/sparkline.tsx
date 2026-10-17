"use client";

import { useChartTheme } from "@/lib/chart-theme";

/**
 * A stat tile's trend: a 2px line in the de-emphasis hue with the latest point in the accent, ringed in the
 * surface colour. Decorative next to the figure it supports (aria-hidden); the figure carries the value.
 */
export function Sparkline({ values, width = 96, height = 28 }: { values: number[]; width?: number; height?: number }) {
  const theme = useChartTheme();
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 4;
  const pts = values.map((v, i) => [
    pad + (i / (values.length - 1)) * (width - pad * 2),
    pad + (1 - (v - min) / span) * (height - pad * 2),
  ]);
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="overflow-visible">
      <polyline
        points={pts.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke={theme.deemphasis}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lx} cy={ly} r={3.5} fill={theme.accent} stroke={theme.surface} strokeWidth={2} />
    </svg>
  );
}
