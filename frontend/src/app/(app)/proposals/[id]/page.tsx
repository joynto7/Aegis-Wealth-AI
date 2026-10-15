"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, XCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { RoleGate } from "@/components/shared/role-gate";
import { StatusBadge } from "@/components/shared/status-badge";
import { TierBadge } from "@/components/shared/tier-badge";
import { Money } from "@/components/shared/money";
import { Percent } from "@/components/shared/percent";
import { ErrorState } from "@/components/shared/error-state";
import { ChartCard } from "@/components/shared/chart-card";
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
import { useComplianceRules, useProducts, useProposal, useProposals, useReviseProposal } from "@/lib/queries";
import { ASSET_CLASS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { AssetClass, GateRule, Proposal, ProposalItem } from "@/lib/types";

/** The gate decision with every rule's reason: its name, its verdict and the measured value against its limit. */
function GatePanel({ gate }: { gate: Proposal["gate"] }) {
  const rules = useComplianceRules();
  const names = new Map((rules.data?.items ?? []).map((r) => [r.id, r.name]));
  return (
    <Card>
      <CardContent className="space-y-3 px-6 py-5">
        <div className="flex items-center justify-between">
          <h3 className="text-form font-semibold text-(--text)">Compliance gate</h3>
          <StatusBadge decision={gate.decision} />
        </div>
        <ul className="space-y-2">
          {gate.rules.map((r: GateRule) => (
            <li key={r.id} className="flex items-start gap-2 text-body">
              {r.result === "pass" ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-(--pass)" aria-hidden />
              ) : (
                <XCircle
                  className={cn("mt-0.5 size-4 shrink-0", r.type === "hard" ? "text-(--reject)" : "text-(--warning)")}
                  aria-hidden
                />
              )}
              <span className="min-w-0">
                <span className={r.result === "fail" ? "font-medium text-(--text)" : "text-(--text)"}>
                  <span className="font-mono text-caption">{r.id}</span> {names.get(r.id) ?? ""}
                  <span className="sr-only">{r.result === "pass" ? " passed" : r.type === "hard" ? " failed" : " warning"}</span>
                  {r.result === "fail" ? <span className="text-caption text-(--text-muted)"> · {r.type === "hard" ? "hard rule" : "warning"}</span> : null}
                </span>
                {r.message ? <span className="block text-(--text)">{r.message}</span> : null}
                <span className="block text-caption text-(--text-muted)">{r.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
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
  const cards = [
    { label: "Annual volatility", value: <Percent value={m.volatility_pct} />, hint: "How much this mix's value has typically swung in a year." },
    { label: "Historical max drawdown", value: <Percent value={m.max_drawdown_pct} />, hint: "The biggest fall from a peak in the history data." },
    { label: "Weighted annual fee", value: <Percent value={m.weighted_fee_pct} decimals={2} />, hint: "What the products charge per year, on average." },
    { label: "Available within 1 day", value: <Percent value={m.liquid_share_pct} />, hint: "The share you could withdraw by tomorrow." },
    { label: "Largest single product", value: <Percent value={m.largest_weight_pct} />, hint: "No product other than cash may exceed 40%." },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-(--border) bg-(--surface) p-4">
          <p className="text-caption text-(--text-muted)">{c.label}</p>
          <p className="text-form font-semibold text-(--text)">{c.value}</p>
          <p className="mt-1 text-caption text-(--text-muted)">{c.hint}</p>
        </div>
      ))}
    </div>
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
    <Card>
      <CardContent className="space-y-4 px-6 py-5">
        <div className="flex items-center justify-between">
          <h3 className="text-form font-semibold text-(--text)">Revise allocation</h3>
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
        <PageHeader
          title={`Proposal #${proposal.id} · v${proposal.version}`}
          description={`CNY ${proposal.amount.toLocaleString()} over ${proposal.horizon_years} years for tier ${proposal.tier}.`}
          action={
            <div className="flex items-center gap-2">
              <TierBadge tier={proposal.tier} />
              <StatusBadge decision={proposal.gate.decision} />
            </div>
          }
        />

        <p className="text-caption text-(--text-muted)">
          Version {proposal.version}
          {proposal.parent_id ? (
            <>
              {" "}· revised from{" "}
              <Link href={`/proposals/${proposal.parent_id}`} className="text-(--primary) hover:underline">
                #{proposal.parent_id}
              </Link>
            </>
          ) : (
            " · first version"
          )}
        </p>

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

        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="Allocation" summary="Allocation by asset class." dataLabel={proposal.data_label}>
            <AllocationDonut weights={classWeights} />
            <AllocationLegend weights={classWeights} />
          </ChartCard>
          <GatePanel gate={proposal.gate} />
        </div>

        <MetricCards proposal={proposal} />

        <Card>
          <CardContent className="px-6 py-5">
            <h3 className="mb-3 text-form font-semibold text-(--text)">Holdings</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body">
                <thead className="border-b border-(--border) text-caption text-(--text-muted)">
                  <tr>
                    <th className="py-2">Product and why it was chosen</th>
                    <th className="whitespace-nowrap px-3 py-2">Asset class</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">Risk</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">Weight</th>
                    <th className="whitespace-nowrap py-2 pl-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {proposal.items.map((item: ProposalItem) => (
                    <tr key={item.product_code} className="border-b border-(--border) align-top last:border-0">
                      <td className="max-w-md py-2 pr-4">
                        <span className="font-medium text-(--text)">{item.name}</span>
                        <span className="block text-caption text-(--text-muted)">
                          <span className="sr-only">Why: </span>
                          {item.rationale}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-(--text-muted)">{ASSET_CLASS_LABEL[item.asset_class]}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">R{item.risk_level}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <Percent value={item.weight_pct} />
                      </td>
                      <td className="whitespace-nowrap py-2 pl-3 text-right">
                        <Money value={item.amount} withCents />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <ChartCard
          title="Stress tests"
          summary="Hypothetical instant shocks and the resulting loss."
          dataLabel="Hypothetical"
        >
          <StressBars stress={proposal.stress} />
        </ChartCard>

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
