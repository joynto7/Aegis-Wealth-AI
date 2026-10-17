"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { ArrowDown, CheckCircle2, Copy, FileText, Link2, ListChecks, Printer, ShieldCheck, Wallet, XCircle } from "lucide-react";
import { ErrorState } from "@/components/shared/error-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Money } from "@/components/shared/money";
import { Percent } from "@/components/shared/percent";
import { Panel } from "@/components/shared/panel";
import { SideChip } from "@/components/monitoring/trades-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageTitle } from "@/components/shell/page-title";
import { useRecord } from "@/lib/queries";
import { useAssetColors } from "@/lib/asset-colors";
import { DISCLOSURES } from "@/lib/disclosures";
import { formatDateTime } from "@/lib/format";
import { ASSET_CLASS_LABEL, tierLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

function HashBlock({ label, value, current }: { label: string; value: string; current?: boolean }) {
  const [copied, setCopied] = useState(false);
  const genesis = /^0+$/.test(value);
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border px-4 py-3", current ? "border-(--primary)/50 bg-(--primary-soft)/60" : "border-(--border) bg-(--surface-2)")}>
      <div className="min-w-0 flex-1">
        <p className="text-caption text-(--text-muted)">
          {label}
          {genesis ? " · first record, chained to the genesis value" : ""}
        </p>
        <p className="truncate font-mono text-caption text-(--text)">{value}</p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="no-print shrink-0"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        aria-label={`Copy ${label}`}
      >
        <Copy className="size-3.5" />
      </Button>
      {copied ? <span className="no-print text-caption text-(--text-muted)">Copied</span> : null}
    </div>
  );
}

function RecordDetail({ id }: { id: number }) {
  usePageTitle("Advice Record");
  const { data: record, isLoading, error, refetch } = useRecord(id);
  const colors = useAssetColors();

  if (isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (error || !record) return <ErrorState error={error} onRetry={() => refetch()} />;

  const { content } = record;
  const titles = new Map(DISCLOSURES.map((d) => [d.id, d.title]));

  return (
    <div className="space-y-6">
      <section className="bg-ink relative overflow-hidden rounded-2xl p-7 shadow-raised print:bg-none print:text-black print:shadow-none">
        <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-[#6366f1]/25 blur-3xl print:hidden" aria-hidden />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-eyebrow flex items-center gap-1.5 text-[#c7d2fe]">
              <ShieldCheck className="size-3.5" aria-hidden /> Sealed advice record
            </p>
            <h1 className="mt-2 font-display text-[30px] font-bold text-white">Record #{record.id}</h1>
            <p className="mt-1 text-body text-(--ink-muted)">
              Proposal #{record.proposal_id} · sealed {formatDateTime(record.created_at)} · consent {formatDateTime(content.consent_at)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <StatusBadge decision={content.gate.decision} />
            <Button variant="outline" onClick={() => window.print()} className="no-print border-white/20 bg-white/5 text-white hover:bg-white/15 hover:text-white">
              <Printer className="size-4" /> Print or save as PDF
            </Button>
          </div>
        </div>
        <dl className="relative mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-5 md:grid-cols-4">
          {[
            ["Amount", <Money key="a" value={content.proposal.amount} />],
            ["Horizon", `${content.proposal.horizon_years} years`],
            ["Risk tier at the time", `${content.profile.tier} · ${tierLabel(content.profile.tier)}`],
            ["Scores", `Capacity ${content.profile.capacity_score} · Willingness ${content.profile.willingness_score}`],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <dt className="text-caption text-(--ink-muted)">{label}</dt>
              <dd className="font-semibold text-white">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Panel icon={Link2} title="Chain integrity" description="This record's hash covers everything below. Change one character and verification fails from here on.">
        <div className="space-y-2">
          <HashBlock label="Previous record's hash" value={record.prev_hash} />
          <div className="flex justify-center text-(--text-muted)" aria-hidden>
            <ArrowDown className="size-4" />
          </div>
          <HashBlock label="This record's hash: SHA-256(previous hash + canonical content)" value={record.hash} current />
        </div>
      </Panel>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Panel
          icon={Wallet}
          title={content.proposal.rebalance ? "Mix restored" : "Holdings executed"}
          description={
            content.proposal.rebalance
              ? `A rebalancing back to the mix of proposal #${content.proposal.rebalance.source_proposal_id}: ${content.orders.filter((o) => o.side === "sell").length} sales and ${content.orders.filter((o) => o.side !== "sell").length} purchases filled in the sandbox.`
              : `${content.orders.length} orders filled in the sandbox.`
          }
        >
          <table className="w-full text-left text-body">
            <tbody>
              {content.proposal.items.map((item) => (
                <tr key={item.product_code} className="border-b border-(--border) last:border-0">
                  <td className="py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: colors[item.asset_class] }} aria-hidden />
                      <span className="font-medium text-(--text)">{item.name}</span>
                    </span>
                    <span className="block pl-[18px] text-caption text-(--text-muted)">{ASSET_CLASS_LABEL[item.asset_class]}</span>
                  </td>
                  <td className="py-2.5 text-right font-semibold">
                    <Percent value={item.weight_pct} />
                  </td>
                  <td className="py-2.5 pl-4 text-right">
                    <Money value={item.amount} withCents />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {content.proposal.rebalance ? (
            <ul className="mt-4 space-y-2 border-t border-(--border) pt-4">
              {content.orders.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-2 text-body">
                  <SideChip side={o.side} />
                  <span className="font-medium text-(--text)">{o.product_code}</span>
                  <span className="text-caption text-(--text-muted)">
                    {o.units.toFixed(4)} units at {o.nav.toFixed(4)}
                  </span>
                  <span className="ml-auto font-semibold text-(--text)">
                    <Money value={o.cost} withCents />
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>

        <Panel icon={ListChecks} title="Compliance gate at execution" description="The verdict on the exact version that was executed.">
          <ul className="space-y-1.5">
            {content.gate.rules.map((r) => (
              <li key={r.id} className="flex items-start gap-2 text-body">
                {r.result === "pass" ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-(--pass)" aria-hidden />
                ) : (
                  <XCircle className={cn("mt-0.5 size-4 shrink-0", r.type === "hard" ? "text-(--reject)" : "text-(--warning)")} aria-hidden />
                )}
                <span>
                  <span className="font-mono text-caption text-(--text-muted)">{r.id}</span>{" "}
                  <span className="text-(--text)">{r.result === "pass" ? r.detail : r.message}</span>
                  {content.gate.acknowledged_rule_ids.includes(r.id) ? <span className="text-caption text-(--text-muted)"> · acknowledged</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel icon={FileText} title="What the client saw and understood" description="The disclosures shown before consent, and the comprehension quiz.">
        <div className="grid gap-4 md:grid-cols-2">
          <ul className="space-y-2">
            {content.disclosures.map((d) => (
              <li key={d.id} className="flex items-center gap-2 rounded-xl border border-(--border) px-3 py-2.5 text-body">
                <span className="font-mono text-caption text-(--text-muted)">{d.id}</span>
                <span className="flex-1 text-(--text)">{titles.get(d.id) ?? d.id}</span>
                <span className="text-caption text-(--text-muted)">v{d.version}</span>
              </li>
            ))}
          </ul>
          <div className="rounded-xl bg-(--surface-2) p-4">
            <p className="flex items-center gap-2 font-semibold text-(--text)">
              {content.quiz.passed ? <CheckCircle2 className="size-4 text-(--pass)" aria-hidden /> : <XCircle className="size-4 text-(--reject)" aria-hidden />}
              Comprehension quiz {content.quiz.passed ? "passed" : "not passed"}
            </p>
            <ul className="mt-2 space-y-1.5 text-caption text-(--text-muted)">
              {content.quiz.results.map((q) => (
                <li key={q.id}>
                  <span className="font-semibold text-(--text)">{q.id}</span> {q.correct ? "correct" : "wrong"} · {q.explanation}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Panel>
    </div>
  );
}

export default function RecordDetailPage() {
  const params = useParams<{ id: string }>();
  return <RecordDetail id={Number(params.id)} />;
}
