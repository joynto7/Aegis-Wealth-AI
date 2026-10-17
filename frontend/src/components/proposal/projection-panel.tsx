"use client";

import { useState } from "react";
import { Flag, Target, TrendingUp } from "lucide-react";
import { FanChart } from "@/components/charts/fan-chart";
import { ProbabilityRing } from "@/components/charts/probability-ring";
import { AnimatedMoney } from "@/components/shared/figure";
import { AskAbout } from "@/components/shared/ask-about";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useGoal, useProjection, useSetGoal } from "@/lib/queries";
import { useDebouncedValue } from "@/lib/use-debounced";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProjectionRequest } from "@/lib/types";

/**
 * Will it reach the goal? A seeded Monte Carlo projection of a proposal (or the live portfolio): the chance
 * of reaching a target, the bad, typical and good cases, how far a miss falls short, and the monthly
 * contribution that would lift the chance. Illustrative, resampled from synthetic history: it says so.
 */
export function ProjectionPanel({
  basis,
  defaultHorizon,
  defaultAmount,
  title = "Will it reach your goal?",
}: {
  basis: { kind: "proposal"; proposalId: number } | { kind: "account" };
  defaultHorizon: number;
  defaultAmount: number;
  title?: string;
}) {
  const goal = useGoal();
  const setGoal = useSetGoal();
  const saved = goal.data;
  const [target, setTarget] = useState<number | null>(null);
  const [monthly, setMonthly] = useState<number | null>(null);
  const [horizon, setHorizon] = useState<number | null>(null);
  const effTarget = target ?? saved?.target_amount ?? Math.round((defaultAmount * 1.3) / 1000) * 1000;
  const effMonthly = monthly ?? saved?.monthly_contribution ?? 0;
  const effHorizon = horizon ?? saved?.horizon_years ?? defaultHorizon;

  const body: ProjectionRequest = {
    basis: basis.kind,
    proposal_id: basis.kind === "proposal" ? basis.proposalId : null,
    horizon_years: effHorizon,
    monthly_contribution: effMonthly,
    target_amount: effTarget >= 1000 ? effTarget : null,
    compare_tiers: false,
  };
  const settled = useDebouncedValue(body, 250);
  const projection = useProjection(settled);
  const p = projection.data;
  const stale = projection.isFetching || JSON.stringify(settled) !== JSON.stringify(body);
  const chance = p?.probability_target_pct ?? null;

  return (
    <section className="rounded-2xl border border-(--border) bg-(--surface) shadow-card">
      <header className="flex flex-wrap items-start justify-between gap-3 px-6 pt-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 items-center justify-center rounded-lg bg-(--primary-soft) text-(--primary)">
            <Target className="size-4" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-form font-bold text-(--text)">{title}</h2>
            <p className="text-caption text-(--text-muted)">
              1,000 illustrative paths resampled from history, net of fees. Not a forecast.
            </p>
          </div>
        </div>
        <AskAbout question={`What does the projection for ${basis.kind === "proposal" ? `proposal #${basis.proposalId}` : "my portfolio"} mean for a target of ${formatMoney(effTarget)} in ${effHorizon} years?`} />
      </header>

      <div className="grid gap-6 px-6 pb-6 pt-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="proj-target">Target (CNY)</Label>
            <Input
              id="proj-target"
              type="number"
              inputMode="numeric"
              min={1000}
              step={1000}
              value={effTarget}
              onChange={(e) => setTarget(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="proj-monthly">Added each month (CNY)</Label>
            <Input
              id="proj-monthly"
              type="number"
              inputMode="numeric"
              min={0}
              step={100}
              value={effMonthly}
              onChange={(e) => setMonthly(Math.max(0, Number(e.target.value)))}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Horizon</Label>
              <span className="text-body font-semibold tabular-nums text-(--text)">{effHorizon} years</span>
            </div>
            <Slider value={[effHorizon]} min={1} max={30} step={1} onValueChange={([v]) => setHorizon(v)} aria-label="Horizon in years" />
          </div>

          <div className="flex items-center gap-4 rounded-xl bg-(--surface-2) p-4">
            <ProbabilityRing value={chance} size={104} stroke={10} label="reach it" />
            <div className="min-w-0 text-caption leading-relaxed text-(--text-muted)">
              {p && chance !== null ? (
                <>
                  <span className="font-semibold text-(--text)">{chance}%</span> of paths reach {formatMoney(effTarget)} by year{" "}
                  {effHorizon}.
                  {p.median_shortfall ? (
                    <>
                      {" "}
                      A miss falls short by about <span className="font-semibold text-(--text)">{formatMoney(p.median_shortfall)}</span>.
                    </>
                  ) : null}
                </>
              ) : (
                "Enter a target to see the chance of reaching it."
              )}
            </div>
          </div>

          {p?.required_monthly?.length ? (
            <div>
              <p className="text-caption font-medium text-(--text-muted)">To lift the chance, add each month</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {p.required_monthly.map((r) => (
                  <button
                    key={r.confidence_pct}
                    type="button"
                    onClick={() => setMonthly(r.monthly)}
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5 text-left text-caption transition-colors hover:border-(--primary)/50",
                      effMonthly === r.monthly ? "border-(--primary) bg-(--primary-soft)" : "border-(--border)"
                    )}
                  >
                    <span className="block font-semibold tabular-nums text-(--text)">{formatMoney(r.monthly)}</span>
                    <span className="text-(--text-muted)">for {r.confidence_pct}%</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <Button
            variant="outline"
            className="w-full"
            disabled={setGoal.isPending || effTarget < 1000}
            onClick={() =>
              setGoal.mutate({
                name: saved?.name ?? "My goal",
                target_amount: effTarget,
                horizon_years: effHorizon,
                monthly_contribution: effMonthly,
              })
            }
          >
            <Flag className="size-4" />
            {saved ? "Update my saved goal" : "Save as my goal"}
          </Button>
        </div>

        <div className="min-w-0">
          {projection.isError ? (
            <ErrorState error={projection.error} compact />
          ) : p ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                {(
                  [
                    ["Bad case", "1 in 10 ends below", p.end.p10],
                    ["Typical", "the median path", p.end.p50],
                    ["Good case", "1 in 10 ends above", p.end.p90],
                  ] as const
                ).map(([label, hint, value], i) => (
                  <div key={label} className={cn("rounded-xl border border-(--border) p-3", i === 1 && "bg-(--surface-2)")}>
                    <p className="flex items-center gap-1.5 text-caption text-(--text-muted)">
                      {i === 1 ? <TrendingUp className="size-3.5" aria-hidden /> : null}
                      {label}
                    </p>
                    <p className="mt-1 font-display text-form font-bold text-(--text)">
                      <AnimatedMoney value={value} />
                    </p>
                    <p className="text-[11px] text-(--text-muted)">{hint}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5">
                <FanChart years={p.years} amount={p.amount} monthly={p.monthly_contribution} target={p.target_amount} stale={stale} />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-(--text-muted)">
                {p.data_label}. {p.method} {p.probability_loss_pct}% of paths end below the {formatMoney(p.total_contributed)} paid in.
                Weighted fee {p.weighted_fee_pct.toFixed(2)}% a year. Same inputs, same answer (seed {p.seed}).
              </p>
            </>
          ) : (
            <div className="space-y-3">
              <span className="shimmer block h-16 w-full rounded-xl" />
              <span className="shimmer block h-64 w-full rounded-xl" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
