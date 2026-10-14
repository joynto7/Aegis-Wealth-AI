"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Copy, Printer } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/error-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Money } from "@/components/shared/money";
import { Percent } from "@/components/shared/percent";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageTitle } from "@/components/shell/page-title";
import { useRecord } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";
import { ASSET_CLASS_LABEL } from "@/mocks/data/products";

function HashRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-(--muted) px-3 py-2">
      <div className="min-w-0">
        <p className="text-caption text-(--text-muted)">{label}</p>
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
      {copied ? <span className="no-print text-caption text-(--pass)">Copied</span> : null}
    </div>
  );
}

function RecordDetail({ id }: { id: number }) {
  usePageTitle("Advice Record");
  const { data: record, isLoading, error, refetch } = useRecord(id);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error || !record) return <ErrorState error={error} onRetry={() => refetch()} />;

  const { content } = record;

  return (
    <div className="space-y-6">
      <div className="no-print">
        <PageHeader
          title={`Advice Record #${record.id}`}
          description={`Created ${formatDateTime(record.created_at)}`}
          action={
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" /> Print / Save as PDF
            </Button>
          }
        />
      </div>

      <Card>
        <CardContent className="space-y-3 px-6 py-5">
          <div className="flex items-center justify-between">
            <h3 className="text-form font-semibold text-(--text)">Decision</h3>
            <StatusBadge decision={content.gate.decision} />
          </div>
          <dl className="grid grid-cols-2 gap-y-1.5 text-body">
            <dt className="text-(--text-muted)">Proposal</dt>
            <dd className="text-right">#{record.proposal_id}</dd>
            <dt className="text-(--text-muted)">Amount</dt>
            <dd className="text-right">
              <Money value={content.proposal.amount} />
            </dd>
            <dt className="text-(--text-muted)">Horizon</dt>
            <dd className="text-right">{content.proposal.horizon_years} years</dd>
            <dt className="text-(--text-muted)">Tier at the time</dt>
            <dd className="text-right">{content.profile.tier}</dd>
            <dt className="text-(--text-muted)">Consent given</dt>
            <dd className="text-right">{formatDateTime(content.consent_at)}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="px-6 py-5">
          <h3 className="mb-3 text-form font-semibold text-(--text)">Holdings executed</h3>
          <table className="w-full text-left text-body">
            <thead className="border-b border-(--border) text-caption text-(--text-muted)">
              <tr>
                <th className="py-2">Product</th>
                <th className="py-2">Class</th>
                <th className="py-2">Weight</th>
                <th className="py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {content.proposal.items.map((item) => (
                <tr key={item.product_code} className="border-b border-(--border) last:border-0">
                  <td className="py-2 font-medium">{item.name}</td>
                  <td className="py-2 text-(--text-muted)">{ASSET_CLASS_LABEL[item.asset_class]}</td>
                  <td className="py-2">
                    <Percent value={item.weight_pct} />
                  </td>
                  <td className="py-2">
                    <Money value={item.amount} withCents />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="px-6 py-5">
          <h3 className="mb-3 text-form font-semibold text-(--text)">Gate rules</h3>
          <ul className="space-y-1 text-body">
            {content.gate.rules.map((r) => (
              <li key={r.id}>
                <span className="font-mono text-caption">{r.id}</span> — {r.result === "pass" ? "Passed" : r.message}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="px-6 py-5">
          <h3 className="mb-3 text-form font-semibold text-(--text)">Disclosures shown</h3>
          <ul className="space-y-1 text-body text-(--text-muted)">
            {content.disclosures.map((d) => (
              <li key={d.id}>
                {d.id} (version {d.version})
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 px-6 py-5">
          <h3 className="mb-1 text-form font-semibold text-(--text)">Chain integrity</h3>
          <HashRow label="Previous hash" value={record.prev_hash} />
          <HashRow label="This record's hash" value={record.hash} />
        </CardContent>
      </Card>
    </div>
  );
}

export default function RecordDetailPage() {
  const params = useParams<{ id: string }>();
  return <RecordDetail id={Number(params.id)} />;
}
