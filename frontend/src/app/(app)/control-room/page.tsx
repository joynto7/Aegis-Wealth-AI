"use client";

import { useState } from "react";
import {
  Activity,
  Bot,
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
import { PageHeader } from "@/components/shared/page-header";
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
import { downloadModelCard, useOversight, useRegulations, useSetControl } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AgentTurn, AiControl, ControlName, ControlState, ControlStateValue, Oversight } from "@/lib/types";

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

function Kpi({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="rounded-xl border border-(--border) bg-(--surface) p-4">
      <p className="text-caption text-(--text-muted)">{label}</p>
      <p className="text-key-figure tabular-nums text-(--text)">{value}</p>
      <p className="mt-1 text-caption text-(--text-muted)">{hint}</p>
    </div>
  );
}

function Kpis({ view }: { view: Oversight }) {
  const k = view.kpis;
  const tools = k.tool_calls_t0 + k.tool_calls_t1 + k.tool_calls_t2;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <Kpi
        label="AI turns"
        value={k.agent_turns}
        hint={`${k.model_turns} by Claude, ${k.template_turns} from checked templates, ${k.suspended_turns} while paused.`}
      />
      <Kpi label="Tool calls allowed" value={tools} hint={`T0 ${k.tool_calls_t0} · T1 ${k.tool_calls_t1} · T2 ${k.tool_calls_t2}. No T3 tool exists.`} />
      <Kpi label="Calls blocked by the broker" value={k.denied_tool_calls} hint="Refused for tier, data ownership, an unknown tool or a pause." />
      <Kpi
        label="AI proposals the gate rejected"
        value={`${k.agent_proposals_rejected} of ${k.agent_proposals}`}
        hint="The gate checks the AI's proposals exactly as it checks a client's."
      />
      <Kpi
        label="Figures traced to a source"
        value={k.figures_traced}
        hint={`${k.grounding_rewrites} replies rewritten and ${k.grounding_fallbacks} replaced for an unsupported figure or wording.`}
      />
      <Kpi label="Orders placed by the AI" value={k.orders_by_agent} hint={`It has no tool that can. Clients placed ${k.orders_by_clients} order sets themselves.`} />
    </div>
  );
}

const MODE_CHIP: Record<AgentTurn["mode"], { label: string; tone: string }> = {
  model: { label: "Claude", tone: "bg-(--primary-soft) text-(--primary)" },
  fallback: { label: "Template", tone: "bg-(--muted) text-(--text-muted)" },
  suspended: { label: "Paused", tone: "bg-(--text) text-(--surface)" },
};

function TurnRow({ turn }: { turn: AgentTurn }) {
  const mode = MODE_CHIP[turn.mode];
  return (
    <li className="space-y-1.5 border-b border-(--border) py-3 last:border-0">
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
    </li>
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
            <dt className="text-caption text-(--text-muted)">Tools</dt>
            <dd className="text-(--text)">7 tools: 3 read the shelf (T0), 2 read the client&apos;s own data (T1), 2 propose (T2). No tool can execute.</dd>
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
              {regs.data.ai_controls.map((c) => (
                <tr key={c.id} className="border-b border-(--border) align-top last:border-0">
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
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-caption text-(--text-muted)">{regs.data.note}</p>
      </CardContent>
    </Card>
  );
}

function ControlRoomContent() {
  usePageTitle("AI Control Room");
  const { data: view, isLoading, error, refetch, isFetching } = useOversight();
  const [target, setTarget] = useState<ControlName | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Control Room"
        description="Watch every action the AI advisor takes, stop it by hand, and export how it works."
        action={
          <span className="inline-flex items-center gap-2 rounded-full border border-(--border) bg-(--surface) px-3 py-1 text-caption text-(--text-muted)">
            <span className="relative flex size-2.5" aria-hidden>
              <span className={cn("absolute inline-flex size-full rounded-full bg-(--primary) opacity-60", isFetching && "animate-ping")} />
              <span className="relative inline-flex size-2.5 rounded-full bg-(--primary)" />
            </span>
            Live · refreshes every 3 seconds
          </span>
        }
      />

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : error || !view ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <SwitchCard name="advisor" state={view.controls.advisor} onChange={() => setTarget("advisor")} />
            <SwitchCard name="execution" state={view.controls.execution} onChange={() => setTarget("execution")} />
          </div>

          <Kpis view={view} />

          <div className="grid items-start gap-4 lg:grid-cols-[2fr_1fr]">
            <Card>
              <CardContent className="px-6 py-5">
                <h2 className="mb-1 flex items-center gap-2 text-form font-semibold text-(--text)">
                  <Activity className="size-5 text-(--primary)" aria-hidden />
                  Live feed
                </h2>
                <p className="text-body text-(--text-muted)">
                  Each advisor turn with its tools, their permission tier, the broker&apos;s decision and any gate result.
                </p>
                {view.turns.length ? (
                  <ul aria-live="polite">
                    {view.turns.map((turn) => (
                      <TurnRow key={turn.log_id} turn={turn} />
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="No AI turns yet" description="They appear here as soon as a client asks the advisor something." />
                )}
              </CardContent>
            </Card>
            <ModelCardPanel view={view} />
          </div>

          <RegulatoryChecklist view={view} />
          <SwitchDialog target={target} current={view.controls} onClose={() => setTarget(null)} />
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
