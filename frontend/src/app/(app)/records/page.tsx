"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Money } from "@/components/shared/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { usePageTitle } from "@/components/shell/page-title";
import { useRecords, useVerifyChain } from "@/lib/queries";
import { formatDate } from "@/lib/format";

function RecordsContent() {
  usePageTitle("Advice Records");
  const { data, isLoading, error, refetch } = useRecords();
  const verify = useVerifyChain();
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; checked: number; broken_record_id: number | null } | null>(null);

  async function onVerify() {
    const result = await verify.mutateAsync("mine");
    setVerifyResult(result);
  }

  return (
    <div>
      <PageHeader
        title="Advice Records"
        description="Every executed proposal, hash-chained to the one before it."
        action={
          <Button variant="outline" onClick={onVerify} disabled={verify.isPending}>
            <ShieldCheck className="size-4" />
            {verify.isPending ? "Verifying…" : "Verify my chain"}
          </Button>
        }
      />

      {verifyResult ? (
        <Alert className={verifyResult.valid ? "mb-4 border-(--pass) bg-(--pass-bg)" : "mb-4 border-(--reject) bg-(--reject-bg)"}>
          <AlertTitle className={verifyResult.valid ? "text-(--pass)" : "text-(--reject)"}>
            {verifyResult.valid ? "Chain valid" : "Chain broken"}
          </AlertTitle>
          <AlertDescription className={verifyResult.valid ? "text-(--pass)" : "text-(--reject)"}>
            {verifyResult.valid
              ? `${verifyResult.checked} record(s) checked, all consistent.`
              : `Record #${verifyResult.broken_record_id} does not match its stored hash.`}
          </AlertDescription>
        </Alert>
      ) : null}

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data?.items.length ? (
        <EmptyState title="No advice records yet" description="A record is created the first time you confirm and execute a proposal." />
      ) : (
        <Card>
          <CardContent className="px-6 py-5">
            <table className="w-full text-left text-body">
              <thead className="border-b border-(--border) text-caption text-(--text-muted)">
                <tr>
                  <th className="py-2">Date</th>
                  <th className="py-2">Proposal</th>
                  <th className="py-2">Decision</th>
                  <th className="py-2">Amount</th>
                  <th className="py-2">Hash</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id} className="border-b border-(--border) last:border-0">
                    <td className="py-2 text-(--text-muted)">{formatDate(r.date)}</td>
                    <td className="py-2">
                      <Link href={`/records/${r.id}`} className="font-medium text-(--primary) hover:underline">
                        #{r.proposal_id}
                      </Link>
                    </td>
                    <td className="py-2">
                      <StatusBadge decision={r.decision} />
                    </td>
                    <td className="py-2">
                      <Money value={r.amount} />
                    </td>
                    <td className="py-2 font-mono text-caption text-(--text-muted)">{r.short_hash}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function RecordsPage() {
  return <RecordsContent />;
}
