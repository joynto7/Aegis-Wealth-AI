"use client";

import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Table2 } from "lucide-react";
import { compactAmount, useChartTheme } from "@/lib/chart-theme";
import { formatMoney } from "@/lib/format";
import { usePrivacy } from "@/lib/privacy";
import { cn } from "@/lib/utils";

/**
 * The goal projection as a fan chart: P10-P90 as the outer band, P25-P75 as the inner band, the median as a
 * 2px line, the money paid in as a thin reference and the target as a labelled ink line. One hue throughout
 * (sequential), a legend because there are several marks, a crosshair tooltip that lists every value at the
 * year, and a table twin so no value depends on hovering. While new inputs compute, the previous fan stays
 * at reduced opacity rather than flashing a skeleton.
 */
export interface FanBand {
  year: number;
  p10: number;
  p25?: number;
  p50: number;
  p75?: number;
  p90: number;
}

interface Row {
  year: number;
  outer: [number, number];
  inner: [number, number] | null;
  p10: number;
  p25: number | null;
  p50: number;
  p75: number | null;
  p90: number;
  paid: number;
}

/** A clean axis: round step (1, 2, 2.5 or 5 x 10^n), at most about six ticks, with headroom above and below. */
function niceScale(min: number, max: number, maxTicks = 6): { domain: [number, number]; ticks: number[] } {
  const span = Math.max(max - min, 1);
  const raw = span / (maxTicks - 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((u) => u >= raw) ?? magnitude * 10);
  const lo = Math.max(0, Math.floor((min - span * 0.04) / step) * step);
  const hi = Math.ceil((max + span * 0.06) / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t));
  return { domain: [lo, hi], ticks };
}

function yearLabel(year: number) {
  return year === 0 ? "Now" : `Year ${year}`;
}

export function FanChart({
  years,
  amount,
  monthly = 0,
  target,
  height = 280,
  stale = false,
  compact = false,
}: {
  years: FanBand[];
  amount: number;
  monthly?: number;
  target?: number | null;
  height?: number;
  stale?: boolean;
  compact?: boolean;
}) {
  const theme = useChartTheme();
  const { hidden } = usePrivacy();
  const [showTable, setShowTable] = useState(false);
  const hasInner = years.every((y) => y.p25 !== undefined && y.p75 !== undefined);

  const rows: Row[] = useMemo(
    () =>
      years.map((y) => ({
        year: y.year,
        outer: [y.p10, y.p90],
        inner: hasInner ? [y.p25 as number, y.p75 as number] : null,
        p10: y.p10,
        p25: y.p25 ?? null,
        p50: y.p50,
        p75: y.p75 ?? null,
        p90: y.p90,
        paid: amount + monthly * 12 * y.year,
      })),
    [years, amount, monthly, hasInner]
  );

  const { domain, ticks } = useMemo(() => {
    const lows = rows.map((r) => Math.min(r.p10, r.paid));
    const highs = rows.map((r) => Math.max(r.p90, r.paid));
    return niceScale(Math.min(...lows, target ?? Infinity), Math.max(...highs, target ?? -Infinity), compact ? 4 : 6);
  }, [rows, target, compact]);

  const last = rows[rows.length - 1];
  const money = (v: number) => (hidden ? "CNY ••••••" : formatMoney(v));

  return (
    <figure className="w-full">
      <div className={cn("relative transition-opacity duration-200", stale && "opacity-55")} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 12, right: compact ? 8 : 88, left: 0, bottom: 4 }}>
            <CartesianGrid stroke={theme.grid} vertical={false} />
            <XAxis
              dataKey="year"
              tickFormatter={(y: number) => (y === 0 ? "Now" : `Y${y}`)}
              tick={{ fontSize: 11, fill: theme.muted }}
              tickLine={false}
              axisLine={{ stroke: theme.grid }}
              interval="preserveStartEnd"
              minTickGap={16}
            />
            <YAxis
              domain={domain}
              ticks={ticks}
              interval={0}
              tickFormatter={(v: number) => (hidden ? "•••" : compactAmount(v))}
              tick={{ fontSize: 11, fill: theme.muted }}
              tickLine={false}
              axisLine={false}
              width={compact ? 40 : 48}
            />
            <Tooltip
              cursor={{ stroke: theme.muted, strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload as Row;
                const lines: [string, number, string, boolean][] = [
                  ["Good case (P90)", r.p90, theme.line, false],
                  ["Typical (P50)", r.p50, theme.line, true],
                  ["Bad case (P10)", r.p10, theme.line, false],
                  ["Paid in", r.paid, theme.muted, false],
                ];
                return (
                  <div className="min-w-48 rounded-xl border border-(--border) bg-(--surface) px-3 py-2.5 text-caption shadow-float">
                    <p className="mb-1.5 font-medium text-(--text-muted)">{yearLabel(r.year)}</p>
                    <ul className="space-y-1">
                      {lines.map(([label, value, color, strong]) => (
                        <li key={label} className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-2 text-(--text-muted)">
                            <span className="h-0.5 w-3 rounded-full" style={{ background: color, opacity: strong ? 1 : 0.55 }} />
                            {label}
                          </span>
                          <span className={cn("tabular-nums text-(--text)", strong && "font-semibold")}>{money(value)}</span>
                        </li>
                      ))}
                      {target ? (
                        <li className="flex items-center justify-between gap-4 border-t border-(--border) pt-1">
                          <span className="flex items-center gap-2 text-(--text-muted)">
                            <span className="h-0.5 w-3 rounded-full" style={{ background: theme.ink }} />
                            Target
                          </span>
                          <span className="tabular-nums font-medium text-(--text)">{money(target)}</span>
                        </li>
                      ) : null}
                    </ul>
                  </div>
                );
              }}
            />
            <Area type="monotone" dataKey="outer" stroke="none" fill={theme.bandOuter} fillOpacity={1} isAnimationActive={!stale} />
            {hasInner ? (
              <Area type="monotone" dataKey="inner" stroke="none" fill={theme.bandInner} fillOpacity={1} isAnimationActive={!stale} />
            ) : null}
            <Line
              type="monotone"
              dataKey="paid"
              stroke={theme.muted}
              strokeWidth={1}
              strokeDasharray="3 4"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="p50"
              stroke={theme.line}
              strokeWidth={2}
              strokeLinecap="round"
              dot={false}
              activeDot={{ r: 4.5, fill: theme.line, stroke: theme.surface, strokeWidth: 2 }}
              isAnimationActive={!stale}
            />
            {!compact && last ? (
              <ReferenceDot
                x={last.year}
                y={last.p50}
                r={4.5}
                fill={theme.line}
                stroke={theme.surface}
                strokeWidth={2}
                ifOverflow="extendDomain"
                label={{
                  value: `${hidden ? "•••" : compactAmount(last.p50)} typical`,
                  position: "right",
                  fill: theme.ink,
                  fontSize: 11,
                  fontWeight: 600,
                  offset: 8,
                }}
              />
            ) : null}
            {target ? (
              <ReferenceLine
                y={target}
                stroke={theme.ink}
                strokeWidth={1.25}
                ifOverflow="extendDomain"
                label={
                  compact
                    ? undefined
                    : { value: "Target", position: "right", fill: theme.ink, fontSize: 11, fontWeight: 600 }
                }
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <figcaption className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-caption text-(--text-muted)">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-4 rounded-sm" style={{ background: theme.bandOuter }} aria-hidden />8 in 10 paths
        </span>
        {hasInner ? (
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-4 rounded-sm" style={{ background: theme.bandInner }} aria-hidden />
            Middle half
          </span>
        ) : null}
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: theme.line }} aria-hidden />
          Typical (median)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t border-dashed" style={{ borderColor: theme.muted }} aria-hidden />
          Paid in
        </span>
        {target ? (
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full" style={{ background: theme.ink }} aria-hidden />
            Target
          </span>
        ) : null}
        {!compact ? (
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium text-(--primary) hover:bg-(--primary-soft)"
            aria-expanded={showTable}
          >
            <Table2 className="size-3.5" aria-hidden />
            {showTable ? "Hide table" : "Show table"}
          </button>
        ) : null}
      </figcaption>

      {showTable || compact ? (
        <table className={cn("mt-3 w-full text-left text-caption", compact && "sr-only")}>
          <caption className="sr-only">Projected value by year: bad case, typical and good case, and the money paid in.</caption>
          <thead className="border-b border-(--border) text-(--text-muted)">
            <tr>
              <th className="py-1.5 font-medium">Year</th>
              <th className="py-1.5 text-right font-medium">Bad (P10)</th>
              <th className="py-1.5 text-right font-medium">Typical (P50)</th>
              <th className="py-1.5 text-right font-medium">Good (P90)</th>
              <th className="py-1.5 text-right font-medium">Paid in</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.year} className="border-b border-(--border) last:border-0">
                <td className="py-1.5">{yearLabel(r.year)}</td>
                <td className="py-1.5 text-right tabular-nums">{money(r.p10)}</td>
                <td className="py-1.5 text-right font-medium tabular-nums">{money(r.p50)}</td>
                <td className="py-1.5 text-right tabular-nums">{money(r.p90)}</td>
                <td className="py-1.5 text-right tabular-nums text-(--text-muted)">{money(r.paid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </figure>
  );
}
