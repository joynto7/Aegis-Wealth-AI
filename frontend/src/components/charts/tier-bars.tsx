"use client";

import { Lock } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { usePrivacy } from "@/lib/privacy";
import { cn } from "@/lib/utils";
import type { TierOutcome } from "@/lib/types";

/**
 * The chance of reaching the goal with each tier's mix, beside its bad case: the honest trade-off (a higher
 * tier lifts the typical outcome and deepens the bad one). Emphasis, not a ramp: the client's own tier is the
 * accent, the others recede, and a tier above the client's is locked and says so. Bars are thin, grow from
 * one baseline and carry their value at the tip; the bad case sits in its own column, in words and numbers.
 */
export function TierBars({ tiers, clientTier }: { tiers: TierOutcome[]; clientTier: number | null }) {
  const { hidden } = usePrivacy();
  const hasTarget = tiers.some((t) => t.probability_target_pct !== null);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[112px_minmax(0,1fr)_96px] gap-3 text-[11px] font-medium text-(--text-muted)">
        <span>Mix</span>
        <span>{hasTarget ? "Chance of reaching the target" : "Typical end value"}</span>
        <span className="text-right">Bad case (P10)</span>
      </div>
      {tiers.map((t) => {
        const own = t.tier === clientTier;
        const value = hasTarget ? (t.probability_target_pct ?? 0) : t.p50_end;
        const max = hasTarget ? 100 : Math.max(...tiers.map((x) => x.p50_end));
        return (
          <div key={t.tier} className="grid grid-cols-[112px_minmax(0,1fr)_96px] items-center gap-3">
            <div className="min-w-0">
              <p className={cn("flex items-center gap-1.5 text-body", own ? "font-semibold text-(--text)" : "text-(--text-muted)")}>
                Tier {t.tier}
                {!t.suitable ? <Lock className="size-3 shrink-0" aria-label="Above your tier" /> : null}
              </p>
              <p className="truncate text-[11px] text-(--text-muted)">
                {own ? "Your tier" : t.suitable ? t.label : "Above your tier"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative h-2.5 flex-1">
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-r-[4px] transition-[width] duration-500",
                    own ? "bg-(--primary)" : t.suitable ? "bg-(--border-strong)" : "bg-(--muted)"
                  )}
                  style={{ width: `${Math.max(2, (value / (max || 1)) * 100)}%` }}
                />
              </div>
              <span className={cn("w-14 shrink-0 text-right text-caption tabular-nums", own ? "font-semibold text-(--text)" : "text-(--text-muted)")}>
                {hasTarget ? `${t.probability_target_pct}%` : hidden ? "•••" : formatMoney(t.p50_end)}
              </span>
            </div>
            <span className="text-right text-caption tabular-nums text-(--text-muted)">{hidden ? "CNY •••" : formatMoney(t.p10_end)}</span>
          </div>
        );
      })}
      <p className="text-caption text-(--text-muted)">
        Each tier uses the mix the engine would build for it. Tiers above yours are shown to explain the trade-off, not
        offered: the gate would reject them for you.
      </p>
    </div>
  );
}
