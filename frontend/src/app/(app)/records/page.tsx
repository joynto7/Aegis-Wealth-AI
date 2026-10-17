"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Link2, ShieldAlert, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/error-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Money } from "@/components/shared/money";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageTitle } from "@/components/shell/page-title";
import { useMe, useRecords, useVerifyChain } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

function RecordsContent() {
  usePageTitle("Advice Records");
  const { data: me } = useMe();
  const { data, isLoading, error, refetch } = useRecords();
  const verify = useVerifyChain();
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; checked: number; broken_record_id: number | null } | null>(null);
  const scope = me?.role === "compliance" ? "all" : "mine";

  async function onVerify() {
    const result = await verify.mutateAsync(scope);
    setVerifyResult(result);
  }

  return (
    <div>
      <PageHeader
        eyebrow={me?.role === "compliance" ? "Oversight" : "Portfolio"}
        title="Advice records"
        description="Every executed proposal is sealed with SHA-256 and chained to the record before it, so any later edit breaks the chain from that point on."
        action={
          <Button onClick={onVerify} disabled={verify.isPending}>
            <ShieldCheck className="size-4" />
            {verify.isPending ? "Verifying…" : scope === "all" ? "Verify all chains" : "Verify my chain"}
          </Button>
        }
      />

      {verifyResult ? (
        <div
          role="status"
          className={cn(
            "mb-6 flex items-center gap-3 rounded-2xl border px-5 py-4",
            verifyResult.valid ? "border-(--pass)/40 bg-(--pass-bg)" : "border-(--reject)/40 bg-(--reject-bg)"
          )}
        >
          {verifyResult.valid ? (
            <ShieldCheck className="size-6 shrink-0 text-(--pass)" aria-hidden />
          ) : (
            <ShieldAlert className="size-6 shrink-0 text-(--reject)" aria-hidden />
          )}
          <div>
            <p className={cn("font-display text-form font-bold", verifyResult.valid ? "text-(--pass)" : "text-(--reject)")}>
              {verifyResult.valid ? "Chain intact" : "Chain broken"}
            </p>
            <p className="text-body text-(--text)">
              {verifyResult.valid
                ? `${verifyResult.checked} record${verifyResult.checked === 1 ? "" : "s"} recomputed from their contents; every hash matches.`
                : `Record #${verifyResult.broken_record_id} no longer matches its stored hash: it was changed after it was sealed.`}
            </p>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data?.items.length ? (
        <section className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-(--border-strong) bg-(--surface) px-6 py-14 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-(--primary-soft) text-(--primary)">
            <Link2 className="size-6" aria-hidden />
          </span>
          <h2 className="font-display text-section text-(--text)">No advice records yet</h2>
          <p className="max-w-md text-body text-(--text-muted)">
            The first time a proposal is confirmed and executed, its profile, gate result, quiz, disclosures and orders are sealed
            here as a tamper-evident record.
          </p>
          {me?.role === "client" ? (
            <Button asChild className="mt-1">
              <Link href="/proposals/new">Build a proposal</Link>
            </Button>
          ) : null}
        </section>
      ) : (
        <ol className="relative space-y-4 before:absolute before:bottom-6 before:left-[23px] before:top-6 before:w-0.5 before:bg-(--border)">
          {data.items.map((r) => (
            <li key={r.id} className="relative flex gap-4">
              <span className="relative z-10 mt-4 flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-(--primary)/30 bg-(--surface) text-(--primary) shadow-card">
                <Link2 className="size-5" aria-hidden />
              </span>
              <Link
                href={`/records/${r.id}`}
                className="group flex flex-1 flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-(--border) bg-(--surface) px-5 py-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-(--primary)/40 hover:shadow-raised"
              >
                <div className="min-w-40">
                  <p className="font-display text-form font-bold text-(--text)">Record #{r.id}</p>
                  <p className="text-caption text-(--text-muted)">{formatDateTime(r.date)}</p>
                </div>
                <div>
                  <p className="text-caption text-(--text-muted)">Proposal</p>
                  <p className="font-semibold text-(--text)">#{r.proposal_id}</p>
                </div>
                <div>
                  <p className="text-caption text-(--text-muted)">Amount</p>
                  <p className="font-semibold text-(--text)">
                    <Money value={r.amount} />
                  </p>
                </div>
                <StatusBadge decision={r.decision} className="px-2 py-0.5 text-caption [&_svg]:size-3.5" />
                <span className="rounded-lg bg-(--surface-2) px-2.5 py-1 font-mono text-caption text-(--text-muted) ring-1 ring-(--border)">
                  sha256 {r.short_hash}…
                </span>
                <ArrowRight className="ml-auto size-4 text-(--text-muted) transition-transform group-hover:translate-x-0.5 group-hover:text-(--primary)" aria-hidden />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function RecordsPage() {
  return <RecordsContent />;
}
