"use client";

import { useState } from "react";
import Link from "next/link";
import { Bot, Cog, Download, FileJson, FileSpreadsheet, Scale, ShieldCheck, UserRound, type LucideIcon } from "lucide-react";
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
import { cn } from "@/lib/utils";
import type { LogEntry } from "@/lib/types";

const PAGE_SIZE = 20;

const ACTOR_ICON: Record<string, LucideIcon> = { client: UserRound, agent: Bot, system: Cog, compliance: Scale };

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
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-(--border) bg-(--surface) p-3 shadow-card">
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
        <Card className="py-0">
          <CardContent className="p-0">
            <table className="w-full text-left text-body">
              <thead className="border-b border-(--border) bg-(--surface-2) text-caption text-(--text-muted)">
                <tr>
                  <th className="px-5 py-3 font-medium">Time</th>
                  <th className="px-3 py-3 font-medium">Actor</th>
                  <th className="px-3 py-3 font-medium">Action</th>
                  <th className="px-3 py-3 font-medium">Tier</th>
                  <th className="px-5 py-3 font-medium">Decision</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((l) => {
                  const ActorIcon = ACTOR_ICON[l.actor] ?? Cog;
                  return (
                    <tr
                      key={l.id}
                      className={cn("cursor-pointer border-b border-(--border) last:border-0 hover:bg-(--surface-2)", l.decision === "denied" && "bg-(--reject-bg)/40")}
                      onClick={() => setDetail(l)}
                    >
                      <td className="whitespace-nowrap px-5 py-3 text-(--text-muted)">{formatDateTime(l.ts)}</td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-2 capitalize text-(--text)">
                          <span className="flex size-7 items-center justify-center rounded-full bg-(--primary-soft) text-(--primary)">
                            <ActorIcon className="size-3.5" aria-hidden />
                          </span>
                          {l.actor}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-(--text)">
                        {l.action.replace(/_/g, " ")}
                        {l.tool ? <span className="ml-1.5 font-mono text-caption text-(--text-muted)">{l.tool}</span> : null}
                      </td>
                      <td className="px-3 py-3">
                        {l.tier ? (
                          <span className="rounded-md bg-(--surface-2) px-1.5 py-0.5 font-mono text-caption text-(--text) ring-1 ring-(--border)">{l.tier}</span>
                        ) : (
                          <span className="text-(--text-muted)">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <DecisionLabel decision={l.decision} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-(--border) px-5 py-3 text-caption text-(--text-muted)">
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
    <div className="space-y-4">
      <p className="max-w-2xl text-body text-(--text-muted)">
        Export the whole operation log for the evidence pack. The export is itself logged, so the file you download contains its
        own entry.
      </p>
      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        {(
          [
            { format: "json", icon: FileJson, title: "JSON", text: "Every field, including each entry's detail, for tools and auditors." },
            { format: "csv", icon: FileSpreadsheet, title: "CSV", text: "One row per entry, for spreadsheets." },
          ] as const
        ).map(({ format, icon: Icon, title, text }) => (
          <button
            key={format}
            type="button"
            onClick={() => exportAs(format)}
            disabled={pending !== null}
            className="flex items-start gap-4 rounded-2xl border border-(--border) bg-(--surface) p-5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-(--primary)/40 hover:shadow-raised disabled:opacity-60"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-(--primary-soft) text-(--primary)">
              <Icon className="size-5" aria-hidden />
            </span>
            <span>
              <span className="flex items-center gap-2 font-display text-form font-bold text-(--text)">
                {pending === format ? "Exporting…" : `Export as ${title}`}
                <Download className="size-4 text-(--text-muted)" aria-hidden />
              </span>
              <span className="mt-1 block text-caption text-(--text-muted)">{text}</span>
            </span>
          </button>
        ))}
      </div>
      {failed ? <ErrorState error={failed.error} onRetry={() => exportAs(failed.format)} /> : null}
    </div>
  );
}

function ConsoleContent() {
  usePageTitle("Compliance Console");
  return (
    <div>
      <PageHeader
        eyebrow="Oversight"
        title="Compliance console"
        description="The append-only operation log, every advice record, the nine rules with their regulatory basis, and evidence export."
      />
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
