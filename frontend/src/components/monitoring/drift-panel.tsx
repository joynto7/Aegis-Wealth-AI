"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Crosshair, OctagonX, Repeat, TriangleAlert } from "lucide-react";
import { Panel } from "@/components/shared/panel";
import { Money } from "@/components/shared/money";
import { ErrorState } from "@/components/shared/error-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DriftChart } from "@/components/monitoring/drift-chart";
import { TradesTable } from "@/components/monitoring/trades-table";
import { useMonitoring, useProposeRebalance } from "@/lib/queries";
import { ASSET_CLASS_LABEL } from "@/lib/labels";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MonitoringStatus } from "@/lib/types";

const g = (n: number) => String(Number(n.toPrecision(6)));
const signed = (n: number) => (n >= 0 ? `+${g(n)}` : g(n));

const STATUS: Record<Exclude<MonitoringStatus, "none">, { label: string; tone: string }> = {
  on_target: { label: "On target", tone: "bg-(--primary-soft) text-(--primary)" },
  drifted: { label: "Drifted", tone: "bg-(--text) text-(--surface)" },
  rule_breach: { label: "A rule fails", tone: "bg-(--reject-bg) text-(--reject)" },
};

export function MonitoringStatusChip({ status, className }: { status: Exclude<MonitoringStatus, "none">; className?: string }) {
  const meta = STATUS[status];
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-caption font-semibold", meta.tone, className)}>{meta.label}</span>;
}

/**
 * The client's live portfolio against the mix they agreed to (their latest executed proposal), at the simulated
 * market's prices: drift by class against the band, rules the holdings now fail, and the trades a rebalancing would
 * place. Proposing one saves a new version for the gate; nothing trades until the client's quiz and Confirm.
 */
export function DriftPanel() {
  const { data, isLoading, error, refetch } = useMonitoring();
  const propose = useProposeRebalance();
  const router = useRouter();

  if (isLoading) return <Skeleton className="h-72 w-full rounded-2xl" />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;

  const market = data.market;
  const asOf = `simulated prices of ${formatDate(market.as_of)}${market.month ? ` (month ${market.month}, replaying ${market.replayed})` : ""}`;

  if (data.status === "none" || !data.largest) {
    return (
      <Panel icon={Crosshair} title="Drift from your agreed mix" description={`Monitoring starts once you hold a portfolio. The market shows the ${asOf}.`}>
        <p className="text-body text-(--text-muted)">
          Confirm a proposal first. After that, every move of the simulated market is measured against the mix you agreed to, and you are
          told when an asset class drifts more than {g(data.band_pp)} points from its target.
        </p>
      </Panel>
    );
  }

  const largest = data.largest;
  const preview = data.rebalance;
  const open = data.open_rebalance;
  const needed = data.outside_band || data.rules_failing.some((f) => f.type === "hard");

  async function onPropose() {
    try {
      const proposal = await propose.mutateAsync();
      router.push(`/proposals/${proposal.id}`);
    } catch {
      // Shown below from propose.error.
    }
  }

  return (
    <Panel
      icon={Crosshair}
      title="Drift from your agreed mix"
      description={
        <>
          Proposal{" "}
          <Link href={`/proposals/${data.target_proposal_id}`} className="font-medium text-(--primary) hover:underline">
            #{data.target_proposal_id}
          </Link>{" "}
          is the mix you agreed to, measured at the {asOf}. {data.data_label}.
        </>
      }
      action={<MonitoringStatusChip status={data.status} />}
    >
      <div className="space-y-5">
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-(--border) bg-(--surface-2) px-4 py-3">
            <dt className="text-caption text-(--text-muted)">Largest drift</dt>
            <dd className="font-display text-section font-bold tabular-nums text-(--text)">{signed(largest.drift_pp)} pts</dd>
            <dd className="text-caption text-(--text-muted)">
              {ASSET_CLASS_LABEL[largest.asset_class]}; the band is ±{g(data.band_pp)} points
            </dd>
          </div>
          <div className="rounded-xl border border-(--border) bg-(--surface-2) px-4 py-3">
            <dt className="text-caption text-(--text-muted)">Portfolio drift</dt>
            <dd className="font-display text-section font-bold tabular-nums text-(--text)">{g(data.portfolio_drift_pct)}%</dd>
            <dd className="text-caption text-(--text-muted)">of the value sits in the wrong class</dd>
          </div>
          <div className="rounded-xl border border-(--border) bg-(--surface-2) px-4 py-3">
            <dt className="text-caption text-(--text-muted)">Rebalancing would sell</dt>
            <dd className="font-display text-section font-bold text-(--text)">
              <Money value={preview?.sell_total ?? 0} />
            </dd>
            <dd className="text-caption text-(--text-muted)">{g(preview?.turnover_pct ?? 0)}% of <Money value={data.total_value} /></dd>
          </div>
        </dl>

        <DriftChart classes={data.classes} band={data.band_pp} />

        {data.rules_failing.length ? (
          <div className="space-y-2">
            <h3 className="flex items-center gap-2 text-body font-semibold text-(--text)">
              Rules your holdings fail today{" "}
              {data.live_gate ? <StatusBadge decision={data.live_gate} className="px-2 py-0.5 text-caption [&_svg]:size-3.5" /> : null}
            </h3>
            <ul className="space-y-2">
              {data.rules_failing.map((f) => (
                <li
                  key={f.id}
                  className={cn(
                    "flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-body",
                    f.type === "hard" ? "border-(--reject)/40 bg-(--reject-bg)" : "border-(--warning)/40 bg-(--warning-bg)"
                  )}
                >
                  {f.type === "hard" ? (
                    <OctagonX className="mt-0.5 size-4 shrink-0 text-(--reject)" aria-hidden />
                  ) : (
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-(--warning)" aria-hidden />
                  )}
                  <span className="min-w-0">
                    <span className="font-semibold text-(--text)">
                      <span className="font-mono text-caption text-(--text-muted)">{f.id}</span> {f.name}
                    </span>
                    <span className="sr-only">{f.type === "hard" ? " (hard rule)" : " (warning)"}</span>
                    {f.new ? (
                      <span className="ml-2 rounded-full bg-(--surface) px-1.5 py-px text-[11px] font-semibold text-(--text)">new since you confirmed</span>
                    ) : null}
                    <span className="mt-0.5 block text-caption text-(--text-muted)">{f.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-body font-semibold text-(--text)">
            <Repeat className="size-4 text-(--primary)" aria-hidden /> What a rebalancing would trade today
          </h3>
          <TradesTable trades={preview?.trades ?? []} />
        </div>

        <div className="flex flex-col gap-3 border-t border-(--border) pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-caption text-(--text-muted)">
            {needed ? "Outside the band, a rebalancing restores your agreed mix. " : "Every class is inside the band, so there is nothing you need to do. "}
            Proposing one saves a new version that the compliance gate checks against your current tier. Nothing trades until you pass the quiz
            and press Confirm.
          </p>
          {open && !open.stale ? (
            <Button asChild variant={needed ? "default" : "outline"} className="shrink-0">
              <Link href={`/proposals/${open.proposal_id}`}>
                Open rebalancing #{open.proposal_id} <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : (
            <Button onClick={onPropose} disabled={propose.isPending || !preview?.trades.length} variant={needed ? "default" : "outline"} className="shrink-0">
              <Repeat className="size-4" />
              {propose.isPending ? "Preparing…" : "Propose rebalancing"}
            </Button>
          )}
        </div>
        {propose.error ? <ErrorState error={propose.error} /> : null}
      </div>
    </Panel>
  );
}
