"use client";

import { useState } from "react";
import {
  Activity,
  AlertOctagon,
  Ban,
  Bell,
  Bot,
  ChevronRight,
  ClipboardList,
  Gavel,
  Hash,
  Info,
  ShieldAlert,
  ShoppingCart,
  Wrench,
  CheckCircle2,
  Download,
  FileText,
  Fingerprint,
  Landmark,
  PauseCircle,
  PlayCircle,
  ShieldCheck,
  ShieldX,
  SlidersHorizontal,
} from "lucide-react";
import { KpiTile } from "@/components/shared/kpi-tile";
import { RoleGate } from "@/components/shared/role-gate";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePageTitle } from "@/components/shell/page-title";
import { Segmented } from "@/components/shared/segmented";
import { FlagList, SEVERITY_CHIP, STATUS_CHIP, TurnInspector } from "@/components/oversight/turn-inspector";
import { MonitoringRoom } from "@/components/monitoring/monitoring-room";
import { downloadModelCard, useOversight, useRegulations, useReviews, useSetControl } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AgentTurn, AiControl, Alert, ControlName, ControlState, ControlStateValue, Oversight, ReviewItem } from "@/lib/types";

/**
 * AI Control Room (addition): the compliance view of the AI advisor while it
 * works. Two switches stop it by hand, a live feed shows every turn with each
 * tool's permission tier and the broker's decision, the counts show what the
 * guardrails caught, and the model disclosure can be exported for a
 * regulator. Designed to the AI requirements of Art. 23 of China's 2018
 * Guiding Opinions on asset management (see the checklist at the bottom).
 */

const SWITCHES: Record<
  ControlName,
  {
    title: string;
    icon: typeof Bot;
    on: ControlStateValue;
    off: ControlStateValue;
    label: Record<string, string>;
    effect: string;
    stopLabel: string;
    resumeLabel: string;
  }
> = {
  advisor: {
    title: "AI advisor",
    icon: Bot,
    on: "active",
    off: "suspended",
    label: { active: "Active", suspended: "Suspended" },
    effect:
      "Suspending stops every chat turn at once, and the permission broker refuses any tool call still under way. Clients keep every other screen.",
    stopLabel: "Suspend AI advisor",
    resumeLabel: "Resume AI advisor",
  },
  execution: {
    title: "Order execution",
    icon: SlidersHorizontal,
    on: "open",
    off: "halted",
    label: { open: "Open", halted: "Halted" },
    effect:
      "Halting stops every new confirmation token and every order, including tokens issued before the halt. Proposals stay as they are.",
    stopLabel: "Halt execution",
    resumeLabel: "Resume execution",
  },
};

function SwitchCard({ name, state, onChange }: { name: ControlName; state: ControlState; onChange: () => void }) {
  const meta = SWITCHES[name];
  const stopped = state.state === meta.off;
  const Icon = meta.icon;
  return (
    <Card className={cn(stopped && "border-(--text) border-2")}>
      <CardContent className="space-y-3 px-6 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon className="size-5 text-(--primary)" aria-hidden />
            <h2 className="text-form font-semibold text-(--text)">{meta.title}</h2>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-body font-semibold leading-none",
              stopped ? "bg-(--text) text-(--surface)" : "bg-(--primary-soft) text-(--primary)"
            )}
          >
            {stopped ? <PauseCircle className="size-4" aria-hidden /> : <PlayCircle className="size-4" aria-hidden />}
            {meta.label[state.state]}
          </span>
        </div>
        <p className="text-body text-(--text-muted)">{meta.effect}</p>
        {state.changed_at ? (
          <p className="text-caption text-(--text-muted)">
            {meta.label[state.state]} by {state.changed_by ?? "compliance"} on {formatDateTime(state.changed_at)}
            {state.reason ? (
              <>
                {" "}
                · Reason: <span className="text-(--text)">{state.reason}</span>
              </>
            ) : null}
          </p>
        ) : (
          <p className="text-caption text-(--text-muted)">Never changed: running in its default state.</p>
        )}
        <Button variant={stopped ? "default" : "outline"} onClick={onChange}>
          {stopped ? <PlayCircle className="size-4" /> : <PauseCircle className="size-4" />}
          {stopped ? meta.resumeLabel : meta.stopLabel}
        </Button>
      </CardContent>
    </Card>
  );
}

function SwitchDialog({
  target,
  current,
  onClose,
}: {
  target: ControlName | null;
  current: Oversight["controls"] | undefined;
  onClose: () => void;
}) {
  const setControl = useSetControl();
  const [reason, setReason] = useState("");
  if (!target || !current) return null;
  const meta = SWITCHES[target];
  const stopping = current[target].state === meta.on;
  const next = stopping ? meta.off : meta.on;
  const valid = reason.trim().length >= 5;

  async function apply() {
    if (!target || !valid) return;
    try {
      await setControl.mutateAsync({ control: target, state: next, reason: reason.trim() });
      setReason("");
      onClose();
    } catch {
      // Shown below from setControl.error.
    }
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          setReason("");
          onClose();
        }
      }}
      title={stopping ? `${meta.stopLabel}?` : `${meta.resumeLabel}?`}
      description={stopping ? meta.effect : "Clients can use it again as soon as you confirm."}
      confirmLabel={stopping ? meta.stopLabel : meta.resumeLabel}
      loading={setControl.isPending}
      confirmDisabled={!valid}
      onConfirm={apply}
    >
      <div className="space-y-2">
        <Label htmlFor="control-reason">Reason (kept in the operation log)</Label>
        <Textarea
          id="control-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
          placeholder={stopping ? "For example: replies on bond funds are under review" : "For example: review finished"}
        />
        <p className="text-caption text-(--text-muted)">
          {valid ? `${reason.trim().length} of 300 characters.` : "At least 5 characters."}
        </p>
        {setControl.error ? <ErrorState error={setControl.error} /> : null}
      </div>
    </ConfirmDialog>
  );
}

function Kpis({ view }: { view: Oversight }) {
  const k = view.kpis;
  const tools = k.tool_calls_t0 + k.tool_calls_t1 + k.tool_calls_t2;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiTile
        icon={Bot}
        label="AI turns"
        value={k.agent_turns}
        hint={`${k.model_turns} by Claude, ${k.template_turns} from checked templates, ${k.suspended_turns} while paused.`}
      />
      <KpiTile icon={Wrench} label="Tool calls allowed" value={tools} hint={`T0 ${k.tool_calls_t0} · T1 ${k.tool_calls_t1} · T2 ${k.tool_calls_t2}. No T3 tool exists.`} />
      <KpiTile icon={Ban} label="Calls blocked by the broker" value={k.denied_tool_calls} hint="Refused for tier, data ownership, an unknown tool or a pause." />
      <KpiTile
        icon={Gavel}
        label="AI proposals the gate rejected"
        value={`${k.agent_proposals_rejected} of ${k.agent_proposals}`}
        hint="The gate checks the AI's proposals exactly as it checks a client's."
      />
      <KpiTile
        icon={Hash}
        label="Figures traced to a source"
        value={k.figures_traced}
        hint={`${k.grounding_rewrites} replies rewritten and ${k.grounding_fallbacks} replaced for an unsupported figure or wording.`}
      />
      <KpiTile
        icon={ShieldAlert}
        label="Messages with threat signals"
        value={k.threat_turns}
        hint="Pattern rules tag attempts (OWASP Agentic Top 10); the broker and the gate are what stop them."
      />
      <KpiTile
        icon={ClipboardList}
        label="AI turns awaiting review"
        value={k.reviews_open}
        hint={`${k.reviews_escalated} escalated so far · ${k.feedback_down} replies rated unhelpful by clients.`}
      />
      <KpiTile
        icon={ShoppingCart}
        label="Orders placed by the AI"
        value={k.orders_by_agent}
        hint={`It has no tool that can. Clients placed ${k.orders_by_clients} order sets themselves.`}
        emphasis
      />
    </div>
  );
}

const MODE_CHIP: Record<AgentTurn["mode"], { label: string; tone: string }> = {
  model: { label: "Claude", tone: "bg-(--primary-soft) text-(--primary)" },
  fallback: { label: "Template", tone: "bg-(--muted) text-(--text-muted)" },
  suspended: { label: "Paused", tone: "bg-(--text) text-(--surface)" },
};

function TurnRow({ turn, onOpen }: { turn: AgentTurn; onOpen: (logId: number) => void }) {
  const mode = MODE_CHIP[turn.mode];
  return (
    <li className="border-b border-(--border) last:border-0">
      <button
        type="button"
        onClick={() => onOpen(turn.log_id)}
        className="group -mx-2 block w-[calc(100%+1rem)] space-y-1.5 rounded-xl px-2 py-3 text-left transition-colors hover:bg-(--surface-2)"
        aria-label={`Open AI turn ${turn.log_id}`}
      >
        <div className="flex flex-wrap items-center gap-2 text-caption">
          <span className="tabular-nums text-(--text-muted)">{formatDateTime(turn.ts)}</span>
          <span className="font-medium text-(--text)">Client #{turn.user_id ?? "?"}</span>
          <span className={cn("rounded-full px-2 py-0.5 font-medium", mode.tone)}>{mode.label}</span>
          {turn.grounding === "regenerated" ? (
            <span className="rounded-full bg-(--muted) px-2 py-0.5 text-(--text-muted)">rewritten once</span>
          ) : null}
          {turn.figures_traced ? (
            <span className="inline-flex items-center gap-1 text-(--primary)">
              <ShieldCheck className="size-3.5" aria-hidden />
              {turn.figures_traced} figure{turn.figures_traced === 1 ? "" : "s"} traced
            </span>
          ) : null}
          {turn.signals?.length ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-(--text) px-2 py-0.5 font-medium text-(--surface)">
              <ShieldAlert className="size-3" aria-hidden />
              {turn.signals.length} threat signal{turn.signals.length === 1 ? "" : "s"}
            </span>
          ) : null}
          {turn.review_status ? (
            <span className={cn("rounded-full px-2 py-0.5 font-medium", STATUS_CHIP[turn.review_status].tone)}>
              {STATUS_CHIP[turn.review_status].label}
            </span>
          ) : null}
          <span className="ml-auto inline-flex items-center gap-1 text-(--text-muted) group-hover:text-(--primary)">
            {turn.latency_ms !== null && turn.latency_ms !== undefined ? `${Math.round(turn.latency_ms)} ms` : null}
            <ChevronRight className="size-4" aria-hidden />
          </span>
        </div>
        {turn.tools.length ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Tool calls">
            {turn.tools.map((t, i) => (
              <li
                key={i}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption",
                  t.decision === "denied"
                    ? "border-dashed border-(--text) font-medium text-(--text)"
                    : "border-(--border) bg-(--surface) text-(--text-muted)"
                )}
              >
                {t.decision === "denied" ? <ShieldX className="size-3.5" aria-hidden /> : null}
                <span className="font-mono">{t.tool}</span> · {t.tier} · {t.decision}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-caption text-(--text-muted)">No tools called.</p>
        )}
        {turn.proposals.length ? (
          <ul className="flex flex-wrap items-center gap-2 text-caption text-(--text-muted)">
            {turn.proposals.map((p) => (
              <li key={p.proposal_id} className="inline-flex items-center gap-1.5">
                {p.tool === "create_proposal" ? "Created" : "Revised"} #{p.proposal_id}:
                <StatusBadge decision={p.gate} className="px-2 py-0.5 text-caption [&_svg]:size-3.5" />
              </li>
            ))}
          </ul>
        ) : null}
      </button>
    </li>
  );
}

const ALERT_ICON: Record<Alert["severity"], typeof Info> = { high: AlertOctagon, medium: ShieldAlert, info: Info };

function Alerts({ alerts, onOpenReviews, onOpenMonitoring }: { alerts: Alert[]; onOpenReviews: () => void; onOpenMonitoring: () => void }) {
  if (!alerts.length) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-(--border) bg-(--surface) px-5 py-3.5 shadow-card">
        <Bell className="size-4 text-(--text-muted)" aria-hidden />
        <p className="text-body text-(--text-muted)">No alerts. The log shows nothing that needs attention right now.</p>
      </div>
    );
  }
  return (
    <section aria-label="Alerts" className="grid gap-3 lg:grid-cols-2">
      {alerts.map((a) => {
        const Icon = ALERT_ICON[a.severity];
        return (
          <div
            key={a.id}
            role={a.severity === "high" ? "alert" : undefined}
            className={cn(
              "flex items-start gap-3 rounded-2xl border bg-(--surface) px-4 py-3.5 shadow-card",
              a.severity === "high" ? "border-(--text)/60" : "border-(--border)"
            )}
          >
            <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", SEVERITY_CHIP[a.severity])}>
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-body font-semibold text-(--text)">
                {a.title}
                <span className={cn("rounded-full px-1.5 text-[11px] font-semibold uppercase", SEVERITY_CHIP[a.severity])}>{a.severity}</span>
              </p>
              <p className="mt-0.5 text-caption text-(--text-muted)">
                {a.detail}
                {a.since ? ` Since ${formatDateTime(a.since)}.` : ""}
              </p>
            </div>
            {a.id === "reviews" || a.id === "threats" ? (
              <Button variant="outline" size="sm" onClick={onOpenReviews}>
                Review
              </Button>
            ) : a.id.startsWith("drift-") ? (
              <Button variant="outline" size="sm" onClick={onOpenMonitoring}>
                Monitoring
              </Button>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

function ReviewRow({ item, onOpen }: { item: ReviewItem; onOpen: (logId: number) => void }) {
  return (
    <li className="border-b border-(--border) last:border-0">
      <button
        type="button"
        onClick={() => onOpen(item.log_id)}
        className="group -mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-xl px-2 py-3.5 text-left transition-colors hover:bg-(--surface-2)"
      >
        <span className={cn("mt-0.5 rounded-full px-1.5 text-[11px] font-semibold uppercase", SEVERITY_CHIP[item.severity])}>{item.severity}</span>
        <span className="min-w-0 flex-1 space-y-1.5">
          <span className="flex flex-wrap items-center gap-2 text-caption">
            <span className="font-medium text-(--text)">{item.client ?? `Client #${item.user_id}`}</span>
            <span className="tabular-nums text-(--text-muted)">{formatDateTime(item.ts)}</span>
            <span className={cn("rounded-full px-2 py-0.5 font-medium", STATUS_CHIP[item.status].tone)}>{STATUS_CHIP[item.status].label}</span>
          </span>
          <span className="block truncate text-body text-(--text)">&ldquo;{item.message_preview}&rdquo;</span>
          <FlagList flags={item.flags} />
          {item.note ? (
            <span className="block text-caption text-(--text-muted)">
              {item.decided_by}: {item.note}
            </span>
          ) : null}
        </span>
        <ChevronRight className="mt-1 size-4 shrink-0 text-(--text-muted) group-hover:text-(--primary)" aria-hidden />
      </button>
    </li>
  );
}

function ReviewQueue({ onOpen }: { onOpen: (logId: number) => void }) {
  const [status, setStatus] = useState<"open" | "resolved" | "all">("open");
  const queue = useReviews(status);
  const counts = queue.data?.counts;
  return (
    <Card>
      <CardContent className="space-y-4 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-form font-semibold text-(--text)">
              <ClipboardList className="size-5 text-(--primary)" aria-hidden />
              Supervisory review
            </h2>
            <p className="mt-0.5 max-w-2xl text-body text-(--text-muted)">
              AI turns flagged by code for a person to check: threat signals, blocked tool calls, AI proposals the gate
              rejected, failed number checks and client thumbs-downs. The SFC treats AI investment advice as a high-risk use
              that needs human review.
            </p>
          </div>
          <Segmented
            size="sm"
            value={status}
            onChange={setStatus}
            label="Which reviews to show"
            options={[
              { value: "open", label: "Open", count: counts?.open },
              { value: "resolved", label: "Decided", count: counts ? counts.cleared + counts.escalated : undefined },
              { value: "all", label: "All" },
            ]}
          />
        </div>
        {queue.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : queue.isError ? (
          <ErrorState error={queue.error} onRetry={() => queue.refetch()} />
        ) : queue.data?.items.length ? (
          <ul>
            {queue.data.items.map((item) => (
              <ReviewRow key={item.log_id} item={item} onOpen={onOpen} />
            ))}
          </ul>
        ) : (
          <EmptyState
            title={status === "open" ? "Nothing to review" : "No decisions yet"}
            description={status === "open" ? "Flagged AI turns appear here as soon as they happen." : "Cleared and escalated turns appear here."}
          />
        )}
      </CardContent>
    </Card>
  );
}

function ModelCardPanel({ view }: { view: Oversight }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<unknown>(null);
  async function download() {
    setPending(true);
    setFailed(null);
    try {
      await downloadModelCard();
    } catch (error) {
      setFailed(error);
    } finally {
      setPending(false);
    }
  }
  return (
    <Card>
      <CardContent className="space-y-3 px-6 py-5">
        <h2 className="flex items-center gap-2 text-form font-semibold text-(--text)">
          <FileText className="size-5 text-(--primary)" aria-hidden />
          Model disclosure
        </h2>
        <dl className="space-y-2 text-body">
          <div>
            <dt className="text-caption text-(--text-muted)">Model</dt>
            <dd className="text-(--text)">
              {view.model} · {view.llm === "ok" ? "connected" : "template mode (no API key)"}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-caption text-(--text-muted)">
              <Fingerprint className="size-3.5" aria-hidden /> System prompt fingerprint (SHA-256)
            </dt>
            <dd className="break-all font-mono text-caption text-(--text)">{view.system_prompt_sha256.slice(0, 32)}…</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-caption text-(--text-muted)">
              <Fingerprint className="size-3.5" aria-hidden /> Configuration fingerprint (on every reply)
            </dt>
            <dd className="break-all font-mono text-caption text-(--text)">{view.config_fingerprint.slice(0, 32)}…</dd>
          </div>
          <div>
            <dt className="text-caption text-(--text-muted)">Tools</dt>
            <dd className="text-(--text)">
              11 tools: 3 read the shelf (T0), 5 read the client&apos;s own data (T1: profile, proposal, goal projection, how to
              fix, drift), 3 propose (T2: a proposal, a revision, a rebalancing). No tool can execute.
            </dd>
          </div>
        </dl>
        <Button onClick={download} disabled={pending} className="w-full">
          <Download className="size-4" />
          {pending ? "Preparing…" : "Download disclosure (JSON)"}
        </Button>
        <p className="text-caption text-(--text-muted)">
          The model&apos;s main parameters and the allocation logic, as Art. 23 of the 2018 Guiding Opinions asks a firm to report.
          The file carries its own SHA-256 fingerprint, and each download is logged.
        </p>
        {failed ? <ErrorState error={failed} onRetry={download} /> : null}
      </CardContent>
    </Card>
  );
}

function ControlStatus({ control, view }: { control: AiControl; view: Oversight }) {
  if (control.check === "controls") {
    const advisor = SWITCHES.advisor.label[view.controls.advisor.state];
    const execution = SWITCHES.execution.label[view.controls.execution.state];
    return (
      <span className="inline-flex items-center gap-1 text-(--primary)">
        <SlidersHorizontal className="size-3.5" aria-hidden />
        Advisor {advisor.toLowerCase()} · execution {execution.toLowerCase()}
      </span>
    );
  }
  if (control.check === "reviews") {
    return (
      <span className="inline-flex items-center gap-1 text-(--primary)">
        <ClipboardList className="size-3.5" aria-hidden />
        {view.kpis.reviews_open} awaiting review
      </span>
    );
  }
  if (control.check === "report") {
    return (
      <span className="inline-flex items-center gap-1 text-(--primary)">
        <Download className="size-3.5" aria-hidden />
        Report ready
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-(--primary)">
      <CheckCircle2 className="size-3.5" aria-hidden />
      Built in
    </span>
  );
}

function FrameworkRows({
  first,
  framework,
  title,
  children,
}: {
  first: boolean;
  framework: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <>
      {first ? (
        <tr>
          <th colSpan={3} className="bg-(--surface-2) px-2 py-1.5 text-left text-caption font-semibold text-(--text)">
            {framework} <span className="font-normal text-(--text-muted)">· {title}</span>
          </th>
        </tr>
      ) : null}
      {children}
    </>
  );
}

function RegulatoryChecklist({ view }: { view: Oversight }) {
  const regs = useRegulations();
  if (regs.isLoading) return <Skeleton className="h-64 w-full" />;
  if (regs.error || !regs.data) return <ErrorState error={regs.error} onRetry={() => regs.refetch()} />;
  return (
    <Card>
      <CardContent className="px-6 py-5">
        <h2 className="mb-1 flex items-center gap-2 text-form font-semibold text-(--text)">
          <Landmark className="size-5 text-(--primary)" aria-hidden />
          Regulatory checklist
        </h2>
        <p className="mb-3 text-body text-(--text-muted)">
          What the rules for AI in wealth management ask for, and the Aegis control that meets each one.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body">
            <thead className="border-b border-(--border) text-caption text-(--text-muted)">
              <tr>
                <th className="py-2 pr-4">Requirement</th>
                <th className="py-2 pr-4">How Aegis meets it</th>
                <th className="whitespace-nowrap py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {regs.data.ai_controls.map((c, i, all) => (
                <FrameworkRows
                  key={c.id}
                  first={i === 0 || all[i - 1].framework !== c.framework}
                  framework={c.framework}
                  title={c.title}
                >
                  <tr className="border-b border-(--border) align-top last:border-0">
                    <td className="max-w-md py-2.5 pr-4">
                      <span className="text-(--text)">{c.requirement}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="mt-1 flex items-center gap-1 text-caption text-(--text-muted) hover:text-(--primary)"
                          >
                            <Landmark className="size-3" aria-hidden />
                            {c.framework} · {c.ref}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-72">
                          {c.title}
                        </TooltipContent>
                      </Tooltip>
                      {c.note ? <span className="mt-0.5 block text-caption text-(--text-muted)">{c.note}</span> : null}
                    </td>
                    <td className="max-w-md py-2.5 pr-4 text-(--text-muted)">{c.control}</td>
                    <td className="whitespace-nowrap py-2.5 text-caption">
                      <ControlStatus control={c} view={view} />
                    </td>
                  </tr>
                </FrameworkRows>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-caption text-(--text-muted)">{regs.data.note}</p>
      </CardContent>
    </Card>
  );
}

type RoomTab = "live" | "reviews" | "monitoring" | "governance";

function ControlRoomContent() {
  usePageTitle("AI Control Room");
  const { data: view, isLoading, error, refetch, isFetching } = useOversight();
  const [target, setTarget] = useState<ControlName | null>(null);
  const [tab, setTab] = useState<RoomTab>("live");
  const [inspect, setInspect] = useState<number | null>(null);

  return (
    <div className="space-y-6">
      <section className="bg-ink relative overflow-hidden rounded-2xl p-7 shadow-raised">
        <div className="pointer-events-none absolute -right-24 -top-28 size-80 rounded-full bg-[#6366f1]/25 blur-3xl" aria-hidden />
        <div className="grid-faint pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-eyebrow text-[#c7d2fe]">Oversight · human review of AI advice</p>
            <h1 className="mt-2 font-display text-[30px] font-bold text-white">AI Control Room</h1>
            <p className="mt-1.5 text-body text-(--ink-muted)">
              Watch every action the AI advisor takes, review what code flags, stop it by hand, and export how it works for a
              regulator.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-caption text-(--ink-text)">
              <span className="relative flex size-2.5" aria-hidden>
                <span className={cn("absolute inline-flex size-full rounded-full bg-[#a5b4fc] opacity-60", isFetching && "animate-ping")} />
                <span className="relative inline-flex size-2.5 rounded-full bg-[#a5b4fc]" />
              </span>
              Live · refreshes every 3 seconds
            </span>
            {view ? (
              <>
                <span className="text-caption text-(--ink-muted)">
                  Advisor {view.controls.advisor.state} · execution {view.controls.execution.state} ·{" "}
                  {view.llm === "ok" ? "Claude connected" : "template mode"}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.06] px-2 py-1 font-mono text-[11px] text-(--ink-muted)">
                  <Fingerprint className="size-3" aria-hidden /> config {view.config_fingerprint.slice(0, 12)}
                </span>
              </>
            ) : null}
          </div>
        </div>
      </section>

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : error || !view ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <>
          <Segmented
            value={tab}
            onChange={setTab}
            label="Control Room view"
            options={[
              { value: "live", label: "Live" },
              { value: "reviews", label: "Review queue", count: view.kpis.reviews_open },
              { value: "monitoring", label: "Monitoring", count: view.alerts.filter((a) => a.id.startsWith("drift-")).length },
              { value: "governance", label: "Governance" },
            ]}
          />

          {tab === "live" ? (
            <div className="space-y-6">
              <Alerts alerts={view.alerts} onOpenReviews={() => setTab("reviews")} onOpenMonitoring={() => setTab("monitoring")} />
              <div className="grid gap-4 lg:grid-cols-2">
                <SwitchCard name="advisor" state={view.controls.advisor} onChange={() => setTarget("advisor")} />
                <SwitchCard name="execution" state={view.controls.execution} onChange={() => setTarget("execution")} />
              </div>
              <Kpis view={view} />
              <Card>
                <CardContent className="px-6 py-5">
                  <h2 className="mb-1 flex items-center gap-2 text-form font-semibold text-(--text)">
                    <Activity className="size-5 text-(--primary)" aria-hidden />
                    Live feed
                  </h2>
                  <p className="text-body text-(--text-muted)">
                    Each advisor turn with its tools, their permission tier, the broker&apos;s decision, threat signals and any
                    gate result. Open a turn to see its trace.
                  </p>
                  {view.turns.length ? (
                    <ul aria-live="polite" className="mt-2">
                      {view.turns.map((turn) => (
                        <TurnRow key={turn.log_id} turn={turn} onOpen={setInspect} />
                      ))}
                    </ul>
                  ) : (
                    <EmptyState title="No AI turns yet" description="They appear here as soon as a client asks the advisor something." />
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}

          {tab === "reviews" ? <ReviewQueue onOpen={setInspect} /> : null}

          {tab === "monitoring" ? <MonitoringRoom /> : null}

          {tab === "governance" ? (
            <div className="space-y-6">
              <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.4fr]">
                <ModelCardPanel view={view} />
                <Card>
                  <CardContent className="space-y-3 px-6 py-5">
                    <h2 className="flex items-center gap-2 text-form font-semibold text-(--text)">
                      <ShieldCheck className="size-5 text-(--primary)" aria-hidden />
                      How the AI&apos;s output is governed
                    </h2>
                    <ul className="space-y-2.5 text-body">
                      {[
                        ["Labelled", "Every reply carries a visible label and machine-readable provenance (China's AI-content labelling measures, EU AI Act Art. 50)."],
                        ["Fingerprinted", "Every reply records the configuration that produced it, so a filing can be matched to the answers."],
                        ["Screened", "Each client message is checked for threat signals mapped to the OWASP Agentic Top 10."],
                        ["Traced", "Every turn keeps its steps as OpenTelemetry GenAI spans: model calls, tool calls, the number check."],
                        ["Reviewed", "Code flags turns for a person; each clear or escalate decision is an append-only log entry."],
                        ["Stoppable", "Two switches suspend the advisor or halt execution at once, each with a logged reason."],
                      ].map(([title, text]) => (
                        <li key={title} className="flex gap-3">
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-(--primary)" aria-hidden />
                          <span>
                            <span className="font-semibold text-(--text)">{title}.</span>{" "}
                            <span className="text-(--text-muted)">{text}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
              <RegulatoryChecklist view={view} />
            </div>
          ) : null}

          <SwitchDialog target={target} current={view.controls} onClose={() => setTarget(null)} />
          <TurnInspector logId={inspect} onOpenChange={(open) => !open && setInspect(null)} />
        </>
      )}
    </div>
  );
}

export default function ControlRoomPage() {
  return (
    <RoleGate role="compliance">
      <ControlRoomContent />
    </RoleGate>
  );
}
