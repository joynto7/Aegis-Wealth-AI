"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { RoleGate } from "@/components/shared/role-gate";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { DecisionLabel } from "@/components/shared/decision-label";
import { Money } from "@/components/shared/money";
import { RegulationChips } from "@/components/shared/regulation-chips";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { usePageTitle } from "@/components/shell/page-title";
import { useComplianceRules, useLogs, useRecords, useVerifyChain, downloadLogsExport } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";
import type { LogEntry } from "@/lib/types";

const PAGE_SIZE = 20;

function OperationLogTab() {
  const [actor, setActor] = useState("all");
  const [action, setAction] = useState("all");
  const [decision, setDecision] = useState("all");
  const [offset, setOffset] = useState(0);
  const [detail, setDetail] = useState<LogEntry | null>(null);

  const { data, isLoading, error, refetch } = useLogs({
    actor: actor === "all" ? undefined : actor,
    action: action === "all" ? undefined : action,
    decision: decision === "all" ? undefined : decision,
    limit: PAGE_SIZE,
    offset,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select value={actor} onValueChange={(v) => { setActor(v); setOffset(0); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Actor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actors</SelectItem>
            <SelectItem value="client">Client</SelectItem>
            <SelectItem value="agent">Agent</SelectItem>
            <SelectItem value="system">System</SelectItem>
            <SelectItem value="compliance">Compliance</SelectItem>
          </SelectContent>
        </Select>
        <Select value={decision} onValueChange={(v) => { setDecision(v); setOffset(0); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Decision" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All decisions</SelectItem>
            <SelectItem value="allowed">Allowed</SelectItem>
            <SelectItem value="denied">Denied</SelectItem>
          </SelectContent>
        </Select>
        <Select value={action} onValueChange={(v) => { setAction(v); setOffset(0); }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {[
              "login",
              "logout",
              "profile_submitted",
              "replay_reaction",
              "proposal_created",
              "proposal_revised",
              "gate_decided",
              "warnings_acknowledged",
              "quiz_attempted",
              "token_issued",
              "orders_executed",
              "record_created",
              "tool_call",
              "permission_denied",
              "chain_verified",
              "evidence_exported",
              "agent_turn",
              "grounding_regenerated",
              "grounding_fallback",
              "advisor_suspended",
              "advisor_resumed",
              "execution_halted",
              "execution_resumed",
              "model_card_exported",
            ].map((a) => (
              <SelectItem key={a} value={a}>
                {a.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data?.items.length ? (
        <EmptyState title="No matching log entries" description="Try different filters." />
      ) : (
        <Card>
          <CardContent className="px-6 py-5">
            <table className="w-full text-left text-body">
              <thead className="border-b border-(--border) text-caption text-(--text-muted)">
                <tr>
                  <th className="py-2">Time</th>
                  <th className="py-2">Actor</th>
                  <th className="py-2">Action</th>
                  <th className="py-2">Tier</th>
                  <th className="py-2">Decision</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((l) => (
                  <tr
                    key={l.id}
                    className="cursor-pointer border-b border-(--border) last:border-0 hover:bg-(--muted)"
                    onClick={() => setDetail(l)}
                  >
                    <td className="py-2 text-(--text-muted)">{formatDateTime(l.ts)}</td>
                    <td className="py-2 capitalize">{l.actor}</td>
                    <td className="py-2">{l.action.replace(/_/g, " ")}</td>
                    <td className="py-2">{l.tier ?? "—"}</td>
                    <td className="py-2">
                      <DecisionLabel decision={l.decision} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex items-center justify-between text-caption text-(--text-muted)">
              <span>
                {offset + 1}–{Math.min(offset + PAGE_SIZE, data.total)} of {data.total}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset + PAGE_SIZE >= data.total}
                  onClick={() => setOffset((o) => o + PAGE_SIZE)}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Sheet open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent>
          {detail ? (
            <>
              <SheetHeader className="border-b border-(--border)">
                <SheetTitle>Log entry #{detail.id}</SheetTitle>
                <SheetDescription>{formatDateTime(detail.ts)}</SheetDescription>
              </SheetHeader>
              <div className="space-y-2 p-4 text-body">
                <p>
                  <span className="text-(--text-muted)">Actor:</span> {detail.actor}
                </p>
                <p>
                  <span className="text-(--text-muted)">Action:</span> {detail.action}
                </p>
                <p>
                  <span className="text-(--text-muted)">Tool:</span> {detail.tool ?? "—"}
                </p>
                <p>
                  <span className="text-(--text-muted)">Tier:</span> {detail.tier ?? "—"}
                </p>
                <p>
                  <span className="text-(--text-muted)">Decision:</span> {detail.decision ?? "—"}
                </p>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-(--muted) p-3 text-caption">
                  {JSON.stringify(detail.detail, null, 2)}
                </pre>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function RecordsTab() {
  const { data, isLoading, error, refetch } = useRecords();
  const verify = useVerifyChain();
  const [result, setResult] = useState<{ valid: boolean; checked: number; broken_record_id: number | null } | null>(null);

  return (
    <div className="space-y-4">
      <Button
        variant="outline"
        onClick={async () => setResult(await verify.mutateAsync("all"))}
        disabled={verify.isPending}
      >
        <ShieldCheck className="size-4" />
        {verify.isPending ? "Verifying…" : "Verify all chains"}
      </Button>
      {result ? (
        <Alert className={result.valid ? "border-(--pass) bg-(--pass-bg)" : "border-(--reject) bg-(--reject-bg)"}>
          <AlertTitle className={result.valid ? "text-(--pass)" : "text-(--reject)"}>
            {result.valid ? "All chains valid" : "A chain is broken"}
          </AlertTitle>
          <AlertDescription className={result.valid ? "text-(--pass)" : "text-(--reject)"}>
            {result.valid ? `${result.checked} record(s) checked.` : `Record #${result.broken_record_id} does not match its stored hash.`}
          </AlertDescription>
        </Alert>
      ) : null}
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data?.items.length ? (
        <EmptyState title="No advice records yet" description="Records appear once a client confirms and executes a proposal." />
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
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id} className="border-b border-(--border) last:border-0">
                    <td className="py-2 text-(--text-muted)">{formatDateTime(r.date)}</td>
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

function RulesTab() {
  const { data, isLoading, error, refetch } = useComplianceRules();
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {data?.items.map((r) => (
        <Card key={r.id}>
          <CardContent className="space-y-1 px-6 py-5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-caption text-(--text-muted)">{r.id}</span>
              <span
                className={
                  r.type === "hard"
                    ? "rounded-full bg-(--reject-bg) px-2 py-0.5 text-caption text-(--reject)"
                    : "rounded-full bg-(--warning-bg) px-2 py-0.5 text-caption text-(--warning)"
                }
              >
                {r.type}
              </span>
            </div>
            <p className="font-semibold text-(--text)">{r.name}</p>
            <p className="text-body text-(--text-muted)">{r.description}</p>
            <p className="font-mono text-caption text-(--text-muted)">{r.threshold}</p>
            <RegulationChips basis={r.basis} className="pt-1" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ExportTab() {
  const [pending, setPending] = useState<"json" | "csv" | null>(null);
  const [failed, setFailed] = useState<{ format: "json" | "csv"; error: unknown } | null>(null);

  async function exportAs(format: "json" | "csv") {
    setPending(format);
    setFailed(null);
    try {
      await downloadLogsExport(format);
    } catch (error) {
      setFailed({ format, error });
    } finally {
      setPending(null);
    }
  }

  return (
    <Card className="max-w-md">
      <CardContent className="space-y-3 px-6 py-5">
        <p className="text-body text-(--text-muted)">Export the full operation log for the evidence pack.</p>
        <div className="flex gap-2">
          <Button onClick={() => exportAs("json")} disabled={pending !== null}>
            <Download className="size-4" /> {pending === "json" ? "Exporting…" : "JSON"}
          </Button>
          <Button variant="outline" onClick={() => exportAs("csv")} disabled={pending !== null}>
            <Download className="size-4" /> {pending === "csv" ? "Exporting…" : "CSV"}
          </Button>
        </div>
        {failed ? <ErrorState error={failed.error} onRetry={() => exportAs(failed.format)} /> : null}
      </CardContent>
    </Card>
  );
}

function ConsoleContent() {
  usePageTitle("Compliance Console");
  return (
    <div>
      <PageHeader title="Compliance Console" description="Read-only oversight: operation log, records, rules and evidence export." />
      <Tabs defaultValue="log">
        <TabsList className="mb-4">
          <TabsTrigger value="log">Operation log</TabsTrigger>
          <TabsTrigger value="records">Records</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
        </TabsList>
        <TabsContent value="log">
          <OperationLogTab />
        </TabsContent>
        <TabsContent value="records">
          <RecordsTab />
        </TabsContent>
        <TabsContent value="rules">
          <RulesTab />
        </TabsContent>
        <TabsContent value="export">
          <ExportTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function ConsolePage() {
  return (
    <RoleGate role="compliance">
      <ConsoleContent />
    </RoleGate>
  );
}
