"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Droplets,
  Layers,
  PencilLine,
  PieChart,
  Receipt,
  Scale,
  TrendingDown,
  Waves,
  XCircle,
} from "lucide-react";
import { RoleGate } from "@/components/shared/role-gate";
import { StatusBadge } from "@/components/shared/status-badge";
import { TierBadge } from "@/components/shared/tier-badge";
import { Money } from "@/components/shared/money";
import { Percent } from "@/components/shared/percent";
import { ErrorState } from "@/components/shared/error-state";
import { Panel } from "@/components/shared/panel";
import { KpiTile } from "@/components/shared/kpi-tile";
import { RiskMeter } from "@/components/shared/risk-meter";
import { AllocationDonut, AllocationLegend } from "@/components/charts/allocation-donut";
import { StressBars } from "@/components/charts/stress-bars";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePageTitle } from "@/components/shell/page-title";
import { DockedChat } from "@/components/shell/chat-drawer";
import { Stepper } from "@/components/shared/stepper";
import { RegulationChips } from "@/components/shared/regulation-chips";
import { useComplianceRules, useProducts, useProposal, useProposals, useReviseProposal } from "@/lib/queries";
import { ASSET_CLASS_LABEL } from "@/lib/labels";
import { useAssetColors } from "@/lib/asset-colors";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AssetClass, GateRule, Proposal, ProposalItem } from "@/lib/types";

/**
 * The gate decision with every rule's reason: its name, its verdict, the measured value against its limit and
 * (addition) the regulatory requirement the rule is designed to meet.
 */
function GatePanel({ gate }: { gate: Proposal["gate"] }) {
  const rules = useComplianceRules();
  const byId = new Map((rules.data?.items ?? []).map((r) => [r.id, r]));
  const failedHard = gate.rules.filter((r) => r.result === "fail" && r.type === "hard").length;
  const warnings = gate.rules.filter((r) => r.result === "fail" && r.type === "soft").length;
  const passed = gate.rules.length - failedHard - warnings;
  return (
    <Panel
      icon={Scale}
      title="Compliance verdict"
      description={`${gate.rules.length} rules checked in code: ${passed} passed${failedHard ? `, ${failedHard} failed` : ""}${warnings ? `, ${warnings} warning${warnings === 1 ? "" : "s"}` : ""}.`}
      action={<StatusBadge decision={gate.decision} />}
    >
      <ul className="space-y-2">
        {gate.rules.map((r: GateRule) => {
          const fail = r.result === "fail";
          return (
            <li
              key={r.id}
              className={cn(
                "flex items-start gap-3 rounded-xl border px-3.5 py-3 text-body",
                !fail && "border-(--border)",
                fail && r.type === "hard" && "border-(--reject)/40 bg-(--reject-bg)",
                fail && r.type === "soft" && "border-(--warning)/40 bg-(--warning-bg)"
              )}
            >
              {fail ? (
                <XCircle className={cn("mt-0.5 size-[18px] shrink-0", r.type === "hard" ? "text-(--reject)" : "text-(--warning)")} aria-hidden />
              ) : (
                <CheckCircle2 className="mt-0.5 size-[18px] shrink-0 text-(--pass)" aria-hidden />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2">
                  <span className="font-mono text-caption text-(--text-muted)">{r.id}</span>
                  <span className="font-semibold text-(--text)">{byId.get(r.id)?.name ?? ""}</span>
                  <span className="sr-only">{fail ? (r.type === "hard" ? " failed" : " warning") : " passed"}</span>
                  {fail ? (
                    <span className={cn("text-caption font-medium", r.type === "hard" ? "text-(--reject)" : "text-(--warning)")}>
                      {r.type === "hard" ? "Hard rule failed" : "Warning"}
                    </span>
                  ) : null}
                </span>
                {r.message ? <span className="mt-0.5 block text-(--text)">{r.message}</span> : null}
                <span className="mt-0.5 block text-caption text-(--text-muted)">{r.detail}</span>
                <RegulationChips basis={byId.get(r.id)?.basis} className="mt-2" />
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/** FR-4.5 (P1): this version beside the one it replaced, with every change highlighted. */
function VersionCompare({ current, parentId }: { current: Proposal; parentId: number }) {
  const [open, setOpen] = useState(false);
  const parent = useProposal(open ? parentId : null);
  const before = parent.data;
  const codes = before
    ? Array.from(new Set([...before.items.map((i) => i.product_code), ...current.items.map((i) => i.product_code)]))
    : [];
  const weightOf = (p: Proposal, code: string) => p.items.find((i) => i.product_code === code)?.weight_pct ?? 0;
  const nameOf = (code: string) =>
    current.items.find((i) => i.product_code === code)?.name ?? before?.items.find((i) => i.product_code === code)?.name ?? code;
  const metrics: { label: string; key: keyof Proposal["metrics"]; decimals?: number }[] = [
    { label: "Weighted annual fee", key: "weighted_fee_pct", decimals: 2 },
    { label: "Historical max drawdown", key: "max_drawdown_pct" },
    { label: "Available within 1 day", key: "liquid_share_pct" },
    { label: "Largest single product", key: "largest_weight_pct" },
  ];
  return (
    <Card>
      <CardContent className="space-y-3 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-body text-(--text)">
            Compare with version {current.version - 1} <span className="text-(--text-muted)">(#{parentId})</span>
          </p>
          <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? "Hide changes" : "Show changes"}
          </Button>
        </div>
        {open ? (
          parent.isLoading || !before ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body">
                <caption className="sr-only">Weights and metrics before and after this revision</caption>
                <thead className="border-b border-(--border) text-caption text-(--text-muted)">
                  <tr>
                    <th className="py-2">Product</th>
                    <th className="py-2 text-right">Version {before.version}</th>
                    <th className="py-2 text-right">Version {current.version}</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.map((code) => {
                    const a = weightOf(before, code);
                    const b = weightOf(current, code);
                    const changed = a !== b;
                    return (
                      <tr key={code} className={cn("border-b border-(--border)", changed && "bg-(--primary-soft) font-medium")}>
                        <td className="py-1.5">
                          {nameOf(code)} {changed ? <span className="sr-only">(changed)</span> : null}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{a.toFixed(1)}%</td>
                        <td className="py-1.5 text-right tabular-nums">{b.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                  {metrics.map((m) => {
                    const a = before.metrics[m.key];
                    const b = current.metrics[m.key];
                    return (
                      <tr key={m.key} className={cn("border-b border-(--border) text-(--text-muted)", a !== b && "bg-(--primary-soft) text-(--text)")}>
                        <td className="py-1.5">{m.label}</td>
                        <td className="py-1.5 text-right tabular-nums">{a.toFixed(m.decimals ?? 1)}%</td>
                        <td className="py-1.5 text-right tabular-nums">{b.toFixed(m.decimals ?? 1)}%</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td className="py-2">Gate decision</td>
                    <td className="py-2 text-right">
                      <StatusBadge decision={before.gate.decision} />
                    </td>
                    <td className="py-2 text-right">
                      <StatusBadge decision={current.gate.decision} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

function MetricCards({ proposal }: { proposal: Proposal }) {
  const m = proposal.metrics;
  // NFR-4.3: every number has a unit and a one-line meaning.
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-5">
      <KpiTile icon={Waves} label="Annual volatility" value={<Percent value={m.volatility_pct} />} hint="How much this mix's value has typically swung in a year." />
      <KpiTile icon={TrendingDown} label="Historical max drawdown" value={<Percent value={m.max_drawdown_pct} />} hint="The biggest fall from a peak in the history data." />
      <KpiTile icon={Receipt} label="Weighted annual fee" value={<Percent value={m.weighted_fee_pct} decimals={2} />} hint="What the products charge per year, on average." />
      <KpiTile icon={Droplets} label="Available within 1 day" value={<Percent value={m.liquid_share_pct} />} hint="The share you could withdraw by tomorrow." />
      <KpiTile icon={Layers} label="Largest single product" value={<Percent value={m.largest_weight_pct} />} hint="No product other than cash may exceed 40%." />
    </div>
  );
}

function Holdings({ items, dataLabel }: { items: ProposalItem[]; dataLabel: string }) {
  const colors = useAssetColors();
  return (
    <Panel icon={PieChart} title="Holdings" description={`Each product with the engine's reason for choosing it. ${dataLabel}.`}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-body">
          <thead className="text-caption text-(--text-muted)">
            <tr className="border-b border-(--border)">
              <th className="py-2.5 pr-4 font-medium">Product and why it was chosen</th>
              <th className="whitespace-nowrap px-3 py-2.5 font-medium">Risk</th>
              <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">Weight</th>
              <th className="whitespace-nowrap py-2.5 pl-3 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.product_code} className="border-b border-(--border) align-top last:border-0">
                <td className="max-w-lg py-3.5 pr-4">
                  <span className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[item.asset_class] }} aria-hidden />
                    <span className="font-semibold text-(--text)">{item.name}</span>
                    <span className="text-caption text-(--text-muted)">{ASSET_CLASS_LABEL[item.asset_class]}</span>
                  </span>
                  <span className="mt-1 block pl-[18px] text-caption leading-relaxed text-(--text-muted)">
                    <span className="sr-only">Why: </span>
                    {item.rationale}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-3.5">
                  <RiskMeter level={item.risk_level} showWords={false} />
                </td>
                <td className="whitespace-nowrap px-3 py-3.5 text-right font-display font-bold text-(--text)">
                  <Percent value={item.weight_pct} />
                </td>
                <td className="whitespace-nowrap py-3.5 pl-3 text-right text-(--text)">
                  <Money value={item.amount} withCents />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function ReviseForm({ proposal, onCancel }: { proposal: Proposal; onCancel: () => void }) {
  const revise = useReviseProposal(proposal.id);
  const products = useProducts({});
  const router = useRouter();
  const [rows, setRows] = useState(() => proposal.items.map((i) => ({ product_code: i.product_code, weight_pct: i.weight_pct })));
  const total = rows.reduce((s, r) => s + (Number(r.weight_pct) || 0), 0);

  function updateWeight(index: number, value: number) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, weight_pct: value } : r)));
  }
  function updateProduct(index: number, code: string) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, product_code: code } : r)));
  }

  async function save() {
    const newProposal = await revise.mutateAsync(rows);
    router.push(`/proposals/${newProposal.id}`);
  }

  return (
    <Card className="ring-2 ring-(--primary)/25">
      <CardContent className="space-y-4 px-6 py-5">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-form font-bold text-(--text)">
            <PencilLine className="size-4 text-(--primary)" aria-hidden /> Revise allocation
          </h3>
          <span className="text-body font-semibold tabular-nums text-(--text)" aria-live="polite">
            {total.toFixed(0)}% of 100%
            {Math.abs(total - 100) > 0.01 ? (
              <span className="ml-2 font-normal text-(--text-muted)">
                ({total > 100 ? `${(total - 100).toFixed(0)}% over` : `${(100 - total).toFixed(0)}% short`}; Save needs exactly 100%)
              </span>
            ) : null}
          </span>
        </div>
        <div className="space-y-2">
          {rows.map((row, i) => {
            const original = proposal.items[i];
            const candidates = (products.data?.items ?? []).filter((p) => p.asset_class === original.asset_class);
            return (
              <div key={i} className="grid grid-cols-[1fr_auto] items-center gap-3 sm:grid-cols-[2fr_1fr_auto]">
                <Select value={row.product_code} onValueChange={(v) => updateProduct(i, v)}>
                  <SelectTrigger aria-label={`Product for ${ASSET_CLASS_LABEL[original.asset_class]} slot ${i + 1}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((p) => (
                      <SelectItem key={p.code} value={p.code}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="hidden text-caption text-(--text-muted) sm:block">{ASSET_CLASS_LABEL[original.asset_class]}</span>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    aria-label={`Weight of slot ${i + 1} in percent`}
                    className="w-20"
                    value={row.weight_pct}
                    onChange={(e) => updateWeight(i, Number(e.target.value))}
                  />
                  <span className="text-body text-(--text-muted)">%</span>
                </div>
              </div>
            );
          })}
        </div>
        {revise.isError ? <ErrorState error={revise.error} /> : null}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={revise.isPending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={Math.abs(total - 100) > 0.01 || revise.isPending}>
            {revise.isPending ? "Saving…" : "Save revision"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProposalDetail({ id }: { id: number }) {
  const { data: proposal, isLoading, error, refetch } = useProposal(id);
  const proposals = useProposals();
  const router = useRouter();
  const [revising, setRevising] = useState(false);

  usePageTitle("Proposal Workspace");

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error || !proposal) return <ErrorState error={error} onRetry={() => refetch()} />;

  const classWeights: Record<AssetClass, number> = proposal.class_weights_pct;
  const latest =
    proposal.status === "superseded"
      ? proposals.data?.items.find((p) => p.id > proposal.id && p.status !== "superseded")
      : undefined;
  const canContinue = proposal.status === "passed" || proposal.status === "warning" || proposal.status === "acknowledged";

  return (
    <div className="flex items-start gap-6">
      <div className="min-w-0 flex-1 space-y-6">
        <Stepper current={proposal.status === "executed" ? "Done" : "Proposal"} />
        <section className="bg-ink relative overflow-hidden rounded-2xl p-6 shadow-raised md:p-7">
          <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-[#6366f1]/25 blur-3xl" aria-hidden />
          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0">
              <p className="text-eyebrow text-[#c7d2fe]">
                Proposal #{proposal.id} · version {proposal.version}
                {proposal.parent_id ? (
                  <>
                    {" "}· revised from{" "}
                    <Link href={`/proposals/${proposal.parent_id}`} className="underline underline-offset-2 hover:text-white">
                      #{proposal.parent_id}
                    </Link>
                  </>
                ) : null}
              </p>
              <h1 className="mt-2 text-hero-figure text-white">
                <Money value={proposal.amount} />
              </h1>
              <p className="mt-1 text-body text-(--ink-muted)">
                Over {proposal.horizon_years} years
                {proposal.near_term_need > 0 ? `, with ${formatMoney(proposal.near_term_need)} needed within 2 years` : ""} · built for tier {proposal.tier}
              </p>
            </div>
            <div className="flex flex-col items-start gap-3 sm:items-end">
              <div className="flex flex-wrap items-center gap-2">
                <TierBadge tier={proposal.tier} className="bg-white/10 text-white" />
                <StatusBadge decision={proposal.gate.decision} />
              </div>
              {!revising ? (
                <div className="flex flex-wrap gap-2">
                  {proposal.status !== "executed" && proposal.status !== "superseded" ? (
                    <Button variant="outline" onClick={() => setRevising(true)} className="border-white/20 bg-white/5 text-white hover:bg-white/15 hover:text-white">
                      <PencilLine className="size-4" /> Revise
                    </Button>
                  ) : null}
                  {canContinue ? (
                    <Button onClick={() => router.push(`/proposals/${proposal.id}/confirm`)} className="bg-white text-(--ink) hover:bg-white/90">
                      Continue to confirm <ArrowRight className="size-4" />
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {proposal.parent_id ? <VersionCompare current={proposal} parentId={proposal.parent_id} /> : null}

      {proposal.status === "superseded" ? (
          <Alert>
            <AlertTitle>This version was superseded</AlertTitle>
            <AlertDescription>
              A newer version replaced it. It is kept for the record only and cannot be changed.
              {latest ? (
                <>
                  {" "}
                  <Link href={`/proposals/${latest.id}`} className="font-medium text-(--primary) hover:underline">
                    Open the latest version (#{latest.id})
                  </Link>
                </>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        {proposal.notes.length ? (
          <Alert>
            <AlertTitle>Notes</AlertTitle>
            <AlertDescription>{proposal.notes.join(" ")}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid items-start gap-6 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <Panel icon={PieChart} title="Allocation" description="By asset class. The colours are the same in every chart.">
            <p className="sr-only">Allocation by asset class.</p>
            <AllocationDonut weights={classWeights} height={220} centerValue={`${proposal.items.length}`} centerLabel="products" />
            <div className="mt-4">
              <AllocationLegend weights={classWeights} columns />
            </div>
          </Panel>
          <GatePanel gate={proposal.gate} />
        </div>

        <MetricCards proposal={proposal} />

        <Holdings items={proposal.items} dataLabel={proposal.data_label} />

        <Panel icon={Activity} title="Stress tests" description="Hypothetical instant shocks, and what each asset class would contribute to the loss.">
          <StressBars stress={proposal.stress} />
        </Panel>

        {revising ? (
          <ReviseForm proposal={proposal} onCancel={() => setRevising(false)} />
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            {proposal.status !== "executed" && proposal.status !== "superseded" ? (
              <Button variant="outline" onClick={() => setRevising(true)}>
                Revise
              </Button>
            ) : null}
            {canContinue || proposal.status === "rejected" ? (
              <Button disabled={!canContinue} onClick={() => router.push(`/proposals/${proposal.id}/confirm`)}>
                Continue to confirm <ArrowRight className="size-4" />
              </Button>
            ) : null}
          </div>
        )}
        {proposal.status === "rejected" && !revising ? (
          <p className="text-right text-caption text-(--text-muted)">
            The gate rejected this version. Revise it so every hard rule passes to continue.
          </p>
        ) : null}
      </div>
      <DockedChat proposalId={proposal.id} className="hidden xl:flex" />
    </div>
  );
}

export default function ProposalDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  return (
    <RoleGate role="client">
      <ProposalDetail id={id} />
    </RoleGate>
  );
}
