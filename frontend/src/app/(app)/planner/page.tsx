"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Flag, GraduationCap, Home, Info, LifeBuoy, Scale, Sparkles, Sunset, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { RoleGate } from "@/components/shared/role-gate";
import { Panel } from "@/components/shared/panel";
import { Segmented } from "@/components/shared/segmented";
import { AnimatedMoney } from "@/components/shared/figure";
import { ErrorState } from "@/components/shared/error-state";
import { FanChart } from "@/components/charts/fan-chart";
import { ProbabilityRing } from "@/components/charts/probability-ring";
import { TierBars } from "@/components/charts/tier-bars";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { usePageTitle } from "@/components/shell/page-title";
import { useAskAegis } from "@/components/shell/app-shell";
import { ApiError } from "@/lib/api-client";
import { useCurrentProfile, useGoal, useProjection, useProposals, useSandboxAccount, useSetGoal } from "@/lib/queries";
import { useDebouncedValue } from "@/lib/use-debounced";
import { formatMoney } from "@/lib/format";
import { tierLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ProjectionRequest } from "@/lib/types";

/**
 * The goal planner (addition): "will I get there?" answered with a seeded Monte Carlo projection, the way the
 * leading robo-advisors frame it: the chance of reaching a target, the bad, typical and good cases, how far a
 * miss falls short, the contribution that would lift the chance, and the same goal under every tier's mix,
 * with tiers above the client's locked. Every figure comes from the engine; the AI can explain them.
 */
interface Preset {
  name: string;
  icon: LucideIcon;
  target: number;
  years: number;
}

const PRESETS: Preset[] = [
  { name: "Home deposit", icon: Home, target: 300_000, years: 8 },
  { name: "Child's education", icon: GraduationCap, target: 500_000, years: 15 },
  { name: "Retirement top-up", icon: Sunset, target: 1_000_000, years: 25 },
  { name: "Emergency fund", icon: LifeBuoy, target: 60_000, years: 2 },
];

type Basis = "tier" | "proposal" | "account";

function Planner() {
  usePageTitle("Goal Planner");
  const ask = useAskAegis();
  const profile = useCurrentProfile();
  const proposals = useProposals();
  const account = useSandboxAccount();
  const goal = useGoal();
  const setGoal = useSetGoal();

  const latestOpen = proposals.data?.items.find((p) => p.status !== "superseded");
  const [name, setName] = useState("My goal");
  const [target, setTarget] = useState(300_000);
  const [years, setYears] = useState(8);
  const [amount, setAmount] = useState(100_000);
  const [monthly, setMonthly] = useState(1_000);
  const [basis, setBasis] = useState<Basis>("tier");
  const [seeded, setSeeded] = useState(false);

  // Start from the saved goal once it loads (a convenience; the inputs stay the client's to change).
  useEffect(() => {
    if (seeded || goal.isLoading) return;
    if (goal.data) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(goal.data.name);
      setTarget(goal.data.target_amount);
      setYears(goal.data.horizon_years);
      setMonthly(goal.data.monthly_contribution);
    }
    setSeeded(true);
  }, [goal.data, goal.isLoading, seeded]);

  const body: ProjectionRequest | null = useMemo(() => {
    if (basis === "proposal" && !latestOpen) return null;
    return {
      basis,
      proposal_id: basis === "proposal" ? latestOpen?.id ?? null : null,
      amount: basis === "account" ? null : amount,
      horizon_years: years,
      monthly_contribution: monthly,
      target_amount: target >= 1000 ? target : null,
      compare_tiers: true,
    };
  }, [basis, latestOpen, amount, years, monthly, target]);
  const settled = useDebouncedValue(body, 250);
  const projection = useProjection(settled);
  const p = projection.data;
  const stale = projection.isFetching || JSON.stringify(settled) !== JSON.stringify(body);
  const needsProfile = projection.error instanceof ApiError && projection.error.code === "PROFILE_REQUIRED";
  const chance = p?.probability_target_pct ?? null;
  const verdict =
    chance === null ? "" : chance >= 75 ? "On track" : chance >= 50 ? "More likely than not" : chance >= 25 ? "A stretch" : "Unlikely as planned";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Plan"
        title="Goal planner"
        description="Set a goal and see the chance of reaching it, across 1,000 paths resampled from history. Illustrative, not a forecast."
        action={
          <Button variant="outline" onClick={() => ask(`I want ${formatMoney(target)} in ${years} years. Is my plan realistic?`)}>
            <Sparkles className="size-4 text-(--primary)" /> Ask Aegis about this goal
          </Button>
        }
      />

      <ul className="flex flex-wrap gap-2" aria-label="Goal presets">
        {PRESETS.map((preset) => {
          const Icon = preset.icon;
          const active = name === preset.name && target === preset.target && years === preset.years;
          return (
            <li key={preset.name} className="w-full sm:w-auto">
              <button
                type="button"
                onClick={() => {
                  setName(preset.name);
                  setTarget(preset.target);
                  setYears(preset.years);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left transition-[border-color,background-color] duration-150",
                  active ? "border-(--primary) bg-(--primary-soft)" : "border-(--border) bg-(--surface) hover:border-(--border-strong)"
                )}
                aria-pressed={active}
              >
                <span className={cn("flex size-8 items-center justify-center rounded-lg", active ? "bg-(--primary) text-white" : "bg-(--surface-2) text-(--text-muted)")}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <span>
                  <span className="block text-body font-semibold text-(--text)">{preset.name}</span>
                  <span className="block text-caption text-(--text-muted)">
                    {formatMoney(preset.target)} in {preset.years} years
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="grid items-start gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <section className="space-y-5 rounded-2xl border border-(--border) bg-(--surface) p-6 shadow-card xl:sticky xl:top-4">
          <div className="space-y-1.5">
            <Label htmlFor="goal-name">Goal</Label>
            <Input id="goal-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="goal-target">Target (CNY)</Label>
            <Input id="goal-target" type="number" min={1000} step={1000} value={target} onChange={(e) => setTarget(Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>In</Label>
              <span className="text-body font-semibold tabular-nums text-(--text)">{years} years</span>
            </div>
            <Slider value={[years]} min={1} max={30} step={1} onValueChange={([v]) => setYears(v)} aria-label="Years to the goal" />
          </div>

          <div className="space-y-2">
            <Label>Invested as</Label>
            <Segmented<Basis>
              size="sm"
              value={basis}
              onChange={setBasis}
              label="Which mix to project"
              options={[
                { value: "tier", label: "My tier's mix" },
                { value: "proposal", label: "My proposal" },
                { value: "account", label: "My portfolio" },
              ]}
            />
            <p className="text-caption text-(--text-muted)">
              {basis === "tier"
                ? `The mix the engine builds for tier ${profile.data?.tier ?? "…"}${profile.data ? ` (${tierLabel(profile.data.tier)})` : ""}.`
                : basis === "proposal"
                  ? latestOpen
                    ? `Proposal #${latestOpen.id}, version ${latestOpen.version}.`
                    : "You have no open proposal yet."
                  : `What your sandbox holds now: ${account.data ? formatMoney(account.data.total_value) : "…"}.`}
            </p>
          </div>

          {basis !== "account" ? (
            <div className="space-y-1.5">
              <Label htmlFor="goal-amount">Starting amount (CNY)</Label>
              <Input id="goal-amount" type="number" min={0} step={1000} value={amount} onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="goal-monthly">Added each month (CNY)</Label>
            <Input id="goal-monthly" type="number" min={0} step={100} value={monthly} onChange={(e) => setMonthly(Math.max(0, Number(e.target.value)))} />
          </div>

          <Button
            className="w-full"
            disabled={setGoal.isPending || target < 1000 || !name.trim()}
            onClick={() => setGoal.mutate({ name: name.trim(), target_amount: target, horizon_years: years, monthly_contribution: monthly })}
          >
            <Flag className="size-4" />
            {goal.data ? "Update my goal" : "Save this goal"}
          </Button>
          <p className="text-[11px] leading-relaxed text-(--text-muted)">
            Saving puts the goal on your dashboard and in the briefing. The save is logged.
          </p>
        </section>

        <div className="min-w-0 space-y-6">
          {needsProfile ? (
            <div className="rounded-2xl border border-dashed border-(--border) bg-(--surface) px-6 py-12 text-center">
              <p className="text-form font-semibold text-(--text)">Set your risk tier first</p>
              <p className="mx-auto mt-1 max-w-md text-body text-(--text-muted)">
                The planner projects the mix the engine builds for your tier. Ten questions set it.
              </p>
              <Button asChild className="mt-4">
                <Link href="/profile">Start the questionnaire</Link>
              </Button>
            </div>
          ) : projection.isError ? (
            <ErrorState error={projection.error} />
          ) : basis === "proposal" && !latestOpen ? (
            <div className="rounded-2xl border border-dashed border-(--border) bg-(--surface) px-6 py-12 text-center">
              <p className="text-form font-semibold text-(--text)">No proposal to project yet</p>
              <p className="mx-auto mt-1 max-w-md text-body text-(--text-muted)">Build one, or project your tier&apos;s mix instead.</p>
              <Button asChild className="mt-4">
                <Link href="/proposals/new">Build a proposal</Link>
              </Button>
            </div>
          ) : (
            <>
              <section className="relative overflow-hidden rounded-2xl border border-(--border) bg-(--surface) p-6 shadow-card">
                <div className="flex flex-wrap items-center gap-6">
                  <ProbabilityRing value={chance} size={148} stroke={13} label="chance" />
                  <div className="min-w-0 flex-1">
                    <p className="text-eyebrow text-(--primary)">{p ? p.basis.label : "Projecting…"}</p>
                    <h2 className="mt-1 font-display text-[26px] font-bold leading-tight text-(--text)">
                      {chance === null ? name : `${verdict}: ${chance}% chance`}
                    </h2>
                    <p className="mt-1.5 max-w-xl text-body text-(--text-muted)">
                      {p && chance !== null ? (
                        <>
                          Of 1,000 illustrative paths, {Math.round(chance * 10)} reach {formatMoney(target)} within {years} years.
                          {p.median_shortfall ? ` The ones that miss fall short by about ${formatMoney(p.median_shortfall)}.` : ""}{" "}
                          {p.probability_loss_pct > 0
                            ? `${p.probability_loss_pct}% end below the ${formatMoney(p.total_contributed)} paid in.`
                            : "None end below the money paid in."}
                        </>
                      ) : (
                        "Working out 1,000 paths…"
                      )}
                    </p>
                  </div>
                </div>

                {p ? (
                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    {(
                      [
                        ["Bad case", "1 in 10 ends below", p.end.p10],
                        ["Typical", "the median path", p.end.p50],
                        ["Good case", "1 in 10 ends above", p.end.p90],
                      ] as const
                    ).map(([label, hint, value], i) => (
                      <div key={label} className={cn("rounded-xl border border-(--border) p-4", i === 1 && "bg-(--surface-2)")}>
                        <p className="text-caption text-(--text-muted)">{label}</p>
                        <p className="mt-1 font-display text-[22px] font-bold leading-tight text-(--text)">
                          <AnimatedMoney value={value} />
                        </p>
                        <p className="text-[11px] text-(--text-muted)">{hint}</p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {p?.required_monthly?.length ? (
                  <div className="mt-6 rounded-xl bg-(--surface-2) p-4">
                    <p className="text-body font-semibold text-(--text)">What would lift the chance</p>
                    <p className="mt-0.5 text-caption text-(--text-muted)">The monthly amount the same 1,000 paths need. Tap one to try it.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {p.required_monthly.map((r) => (
                        <button
                          key={r.confidence_pct}
                          type="button"
                          onClick={() => setMonthly(r.monthly)}
                          className={cn(
                            "rounded-xl border bg-(--surface) px-3.5 py-2 text-left transition-colors hover:border-(--primary)/50",
                            monthly === r.monthly ? "border-(--primary)" : "border-(--border)"
                          )}
                        >
                          <span className="block font-display text-form font-bold tabular-nums text-(--text)">{formatMoney(r.monthly)}</span>
                          <span className="text-caption text-(--text-muted)">a month for a {r.confidence_pct}% chance</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>

              <Panel icon={BookOpen} title="The range of outcomes" description="Each year's spread across the 1,000 paths. The darker band holds the middle half.">
                {p ? (
                  <FanChart years={p.years} amount={p.amount} monthly={p.monthly_contribution} target={p.target_amount} stale={stale} height={300} />
                ) : (
                  <span className="shimmer block h-72 w-full rounded-xl" />
                )}
              </Panel>

              <Panel
                icon={Scale}
                title="The same goal at every tier"
                description="More risk can raise the typical outcome and deepen the bad one. The gate still decides what you can hold."
              >
                {p?.tiers.length ? <TierBars tiers={p.tiers} clientTier={p.client_tier} /> : <span className="shimmer block h-48 w-full rounded-xl" />}
              </Panel>

              <section className="flex items-start gap-3 rounded-2xl border border-(--border) bg-(--surface-2) p-5">
                <Info className="mt-0.5 size-4 shrink-0 text-(--text-muted)" aria-hidden />
                <p className="text-caption leading-relaxed text-(--text-muted)">
                  {p ? `${p.data_label}. ${p.method} Source: ${p.history_label}. ` : ""}
                  The history is synthetic and shaped like 2008, 2020 and 2022, so crisis years appear more often than in real
                  markets. The same inputs always give the same answer.
                </p>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PlannerPage() {
  return (
    <RoleGate role="client">
      <Planner />
    </RoleGate>
  );
}
