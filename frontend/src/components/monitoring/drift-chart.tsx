"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ASSET_ORDER, useAssetColors } from "@/lib/asset-colors";
import { ASSET_CLASS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { DriftClass } from "@/lib/types";

const g = (n: number) => String(Number(n.toPrecision(6)));
const signed = (n: number) => (n >= 0 ? `+${g(n)}` : g(n));

/**
 * Drift by asset class: on one shared scale, each class's tolerance band around its target (shaded), the target (a
 * tick) and today's weight (a dot in the class's colour), joined like a dumbbell. The figures are written beside each
 * row, so nothing depends on colour; a class outside the band says so in words.
 */
export function DriftChart({ classes, band, compact = false }: { classes: DriftClass[]; band: number; compact?: boolean }) {
  const colors = useAssetColors();
  const rows = ASSET_ORDER.map((c) => classes.find((row) => row.asset_class === c)).filter((row): row is DriftClass => !!row);
  const reach = Math.max(...rows.map((r) => Math.max(r.current_pct, r.target_pct + band)), 10);
  const top = Math.min(100, Math.ceil((reach + 5) / 10) * 10);
  const at = (value: number) => `${Math.max(0, Math.min(100, (value / top) * 100))}%`;

  return (
    <div className="space-y-1">
      <ul className={cn("space-y-3", compact && "space-y-2")}>
        {rows.map((row) => {
          const low = Math.max(0, row.target_pct - band);
          const high = Math.min(top, row.target_pct + band);
          const from = Math.min(row.target_pct, row.current_pct);
          const to = Math.max(row.target_pct, row.current_pct);
          const words = `${ASSET_CLASS_LABEL[row.asset_class]}: ${g(row.current_pct)}% now against a ${g(row.target_pct)}% target, ${signed(row.drift_pp)} points; the band is ${g(low)}% to ${g(row.target_pct + band)}%${row.outside_band ? ", outside it" : ""}.`;
          return (
            <li key={row.asset_class} className="grid grid-cols-[4.5rem_1fr] items-center gap-x-3 gap-y-1 sm:grid-cols-[5rem_1fr_13.5rem]">
              <span className="flex items-center gap-1.5 text-body font-medium text-(--text)">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[row.asset_class] }} aria-hidden />
                {ASSET_CLASS_LABEL[row.asset_class]}
              </span>
              <div className="relative h-6" aria-hidden>
                <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-(--text-muted)/20" />
                <span
                  className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-(--text-muted)/15 ring-1 ring-(--text-muted)/25"
                  style={{ left: at(low), width: `calc(${at(high)} - ${at(low)})` }}
                />
                <span
                  className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-(--text-muted)"
                  style={{ left: at(from), width: `calc(${at(to)} - ${at(from)})` }}
                />
                <span className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--text)" style={{ left: at(row.target_pct) }} />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 cursor-default rounded-full ring-2 ring-(--surface) before:absolute before:-inset-2 before:content-['']"
                      style={{ left: at(row.current_pct), backgroundColor: colors[row.asset_class] }}
                    />
                  </TooltipTrigger>
                  <TooltipContent>{words}</TooltipContent>
                </Tooltip>
              </div>
              <p className="col-span-2 flex flex-wrap items-baseline gap-x-2 text-caption text-(--text-muted) sm:col-span-1 sm:justify-end">
                <span className="sr-only">{words}</span>
                <span aria-hidden className="tabular-nums">
                  <span className="font-semibold text-(--text)">{g(row.current_pct)}%</span> of {g(row.target_pct)}%
                </span>
                <span aria-hidden className={cn("tabular-nums", row.outside_band ? "font-bold text-(--text)" : "")}>
                  {signed(row.drift_pp)} pts
                </span>
                {row.outside_band ? (
                  <span aria-hidden className="rounded-full bg-(--text) px-1.5 py-px text-[11px] font-semibold text-(--surface)">
                    outside band
                  </span>
                ) : null}
              </p>
            </li>
          );
        })}
      </ul>
      <div className="grid grid-cols-[4.5rem_1fr] gap-x-3 sm:grid-cols-[5rem_1fr_13.5rem]" aria-hidden>
        <span />
        <div className="flex justify-between text-[11px] tabular-nums text-(--text-muted)">
          <span>0%</span>
          <span>{top / 2}%</span>
          <span>{top}%</span>
        </div>
      </div>
      {compact ? null : (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 text-caption text-(--text-muted)">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-(--text-muted)" aria-hidden /> Today
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-0.5 rounded-full bg-(--text)" aria-hidden /> Target
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-5 rounded-full bg-(--text-muted)/15 ring-1 ring-(--text-muted)/25" aria-hidden /> ±{g(band)}-point band
          </span>
        </p>
      )}
    </div>
  );
}
