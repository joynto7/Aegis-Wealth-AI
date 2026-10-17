"use client";

import { useState } from "react";
import {
  ClipboardCheck,
  Cpu,
  Fingerprint,
  Flag,
  MessageSquareQuote,
  ShieldAlert,
  ShieldX,
  Timer,
  User as UserIcon,
  Workflow,
} from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/shared/status-badge";
import { AiLabel } from "@/components/shared/ai-label";
import { ErrorState } from "@/components/shared/error-state";
import { TraceWaterfall } from "@/components/charts/trace-waterfall";
import { TOOL_LABEL } from "@/components/chat/reply-text";
import { useDecideReview, useTurn } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReviewFlag, ReviewStatus, ThreatSignal } from "@/lib/types";

/**
 * One AI turn, reconstructed for a supervisor: what the client asked, what the AI replied and how it was
 * labelled, the threat signals on the message, every tool call with its tier and the broker's decision, and
 * the trace of the run (OpenTelemetry GenAI span names). A flagged turn is cleared or escalated here, with a
 * note; each decision is an append-only log entry.
 */
export const SEVERITY_CHIP: Record<"high" | "medium" | "low" | "info", string> = {
  high: "bg-(--text) text-(--surface)",
  medium: "bg-(--surface) text-(--text) ring-1 ring-(--border-strong)",
  low: "bg-(--muted) text-(--text-muted)",
  info: "bg-(--primary-soft) text-(--primary)",
};

export const STATUS_CHIP: Record<ReviewStatus, { label: string; tone: string }> = {
  open: { label: "Awaiting review", tone: "bg-(--surface) text-(--text) ring-1 ring-(--border-strong)" },
  cleared: { label: "Cleared", tone: "bg-(--primary-soft) text-(--primary)" },
  escalated: { label: "Escalated", tone: "bg-(--text) text-(--surface)" },
};

export function FlagList({ flags }: { flags: ReviewFlag[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {flags.map((f, i) => (
        <li key={`${f.kind}-${i}`} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", SEVERITY_CHIP[f.severity])}>
          <Flag className="size-3" aria-hidden />
          {f.text}
        </li>
      ))}
    </ul>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Cpu; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="flex items-center gap-2 text-body font-semibold text-(--text)">
        <Icon className="size-4 text-(--primary)" aria-hidden />
        {title}
      </h3>
      {children}
    </section>
  );
}

function SignalRow({ signal }: { signal: ThreatSignal }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-(--border) px-3 py-2.5">
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-(--text)" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-body">
          <span className="font-semibold text-(--text)">{signal.label}</span>
          <span className={cn("rounded-full px-1.5 text-[11px] font-semibold uppercase", SEVERITY_CHIP[signal.severity])}>{signal.severity}</span>
          <span className="font-mono text-caption text-(--text-muted)">OWASP {signal.owasp}</span>
        </p>
        <p className="mt-0.5 truncate font-mono text-caption text-(--text-muted)">&ldquo;{signal.evidence}&rdquo;</p>
      </div>
    </li>
  );
}

function Decision({ logId, status }: { logId: number; status: ReviewStatus | null }) {
  const decide = useDecideReview();
  const [note, setNote] = useState("");
  const valid = note.trim().length >= 5;
  async function send(decision: "cleared" | "escalated") {
    await decide.mutateAsync({ log_id: logId, decision, note: note.trim() });
    setNote("");
  }
  return (
    <div className="space-y-2.5 rounded-xl border border-(--border) bg-(--surface-2) p-4">
      <Label htmlFor={`note-${logId}`}>{status === "open" ? "Your decision (kept in the operation log)" : "Change the decision"}</Label>
      <Textarea
        id={`note-${logId}`}
        value={note}
        maxLength={300}
        onChange={(e) => setNote(e.target.value)}
        placeholder="For example: injection attempt, contained by the broker; no client harm"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-caption text-(--text-muted)">{valid ? `${note.trim().length} of 300 characters` : "At least 5 characters"}</span>
        <div className="flex gap-2">
          <Button variant="outline" disabled={!valid || decide.isPending} onClick={() => send("escalated")}>
            Escalate
          </Button>
          <Button disabled={!valid || decide.isPending} onClick={() => send("cleared")}>
            <ClipboardCheck className="size-4" /> Clear
          </Button>
        </div>
      </div>
      {decide.isError ? <ErrorState error={decide.error} compact /> : null}
    </div>
  );
}

export function TurnInspector({ logId, onOpenChange }: { logId: number | null; onOpenChange: (open: boolean) => void }) {
  const turn = useTurn(logId);
  const t = turn.data;
  const usage = t?.usage ?? {};
  const tokensIn = usage["gen_ai.usage.input_tokens"];
  const tokensOut = usage["gen_ai.usage.output_tokens"];
  return (
    <Sheet open={logId !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[680px]">
        <SheetHeader className="border-b border-(--border) px-6 py-4">
          <SheetTitle className="flex flex-wrap items-center gap-2 font-display text-[18px]">
            AI turn #{logId}
            {t?.status ? (
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_CHIP[t.status].tone)}>{STATUS_CHIP[t.status].label}</span>
            ) : null}
          </SheetTitle>
          <SheetDescription>
            {t ? (
              <>
                {formatDateTime(t.ts)} · {t.client ?? `Client #${t.user_id}`} · {t.mode === "model" ? "Claude" : t.mode === "fallback" ? "checked template" : "paused"}
                {t.latency_ms !== null ? ` · ${Math.round(t.latency_ms)} ms` : ""}
              </>
            ) : (
              "Loading the turn…"
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {turn.isLoading || !t ? (
            turn.isError ? <ErrorState error={turn.error} compact /> : <Skeleton className="h-96 w-full" />
          ) : (
            <>
              {t.flags.length ? (
                <Section icon={Flag} title="Why it was flagged">
                  <FlagList flags={t.flags} />
                  {t.status && t.status !== "open" ? (
                    <p className="text-caption text-(--text-muted)">
                      {STATUS_CHIP[t.status].label} by {t.decided_by ?? "compliance"} on {formatDateTime(t.decided_at)}
                      {t.note ? (
                        <>
                          : <span className="text-(--text)">{t.note}</span>
                        </>
                      ) : null}
                    </p>
                  ) : null}
                  <Decision logId={t.log_id} status={t.status} />
                </Section>
              ) : (
                <p className="rounded-xl bg-(--surface-2) px-4 py-3 text-caption text-(--text-muted)">
                  No review flag: no threat signal, no blocked call, no rejected AI proposal, no failed number check and no
                  thumbs-down.
                </p>
              )}

              <Section icon={MessageSquareQuote} title="Conversation">
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-(--primary)">
                      <UserIcon className="size-3.5 text-(--primary-foreground)" aria-hidden />
                    </span>
                    <p className="rounded-2xl rounded-tl-md bg-(--primary-soft) px-3.5 py-2.5 text-body text-(--text)">{t.message ?? "(message not found)"}</p>
                  </div>
                  <div className="space-y-1.5 pl-9">
                    {t.provenance ? <AiLabel provenance={t.provenance} /> : null}
                    <p className="rounded-2xl rounded-tl-md bg-(--muted) px-3.5 py-2.5 text-body text-(--text)">{t.reply ?? "(reply not found)"}</p>
                    {t.feedback ? (
                      <p className="text-caption text-(--text-muted)">
                        Client rated it {t.feedback.rating === "down" ? "not helpful" : "helpful"}
                        {t.feedback.reason ? `: ${t.feedback.reason}` : ""} ({formatDateTime(t.feedback.at)})
                      </p>
                    ) : null}
                  </div>
                </div>
              </Section>

              {t.signals.length ? (
                <Section icon={ShieldAlert} title="Threat signals on the message">
                  <ul className="space-y-2">
                    {t.signals.map((s) => (
                      <SignalRow key={s.id} signal={s} />
                    ))}
                  </ul>
                  <p className="text-caption text-(--text-muted)">
                    Signals make attempts visible; the permission broker and the gate are what stop them.
                  </p>
                </Section>
              ) : null}

              <Section icon={Cpu} title="Tool calls">
                {t.tools.length ? (
                  <ul className="space-y-1.5">
                    {t.tools.map((tool, i) => (
                      <li
                        key={i}
                        className={cn(
                          "flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-caption",
                          tool.decision === "denied" ? "border-dashed border-(--text-muted)" : "border-(--border)"
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {tool.decision === "denied" ? <ShieldX className="size-3.5 shrink-0" aria-hidden /> : null}
                          <span className="font-medium text-(--text)">{TOOL_LABEL[tool.tool] ?? tool.tool}</span>
                          <span className="truncate text-(--text-muted)">{tool.summary}</span>
                        </span>
                        <span className="shrink-0 font-mono text-(--text-muted)">
                          {tool.tier} · {tool.decision}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-caption text-(--text-muted)">No tools called.</p>
                )}
                {t.proposals.length ? (
                  <ul className="flex flex-wrap gap-2 text-caption text-(--text-muted)">
                    {t.proposals.map((p) => (
                      <li key={p.proposal_id} className="inline-flex items-center gap-1.5">
                        {p.tool === "create_proposal" ? "Created" : "Revised"} #{p.proposal_id}:
                        <StatusBadge decision={p.gate} className="px-2 py-0.5 text-caption [&_svg]:size-3.5" />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Section>

              <Section icon={Workflow} title="Trace">
                <TraceWaterfall spans={t.trace} />
              </Section>

              <Section icon={Fingerprint} title="Provenance">
                <dl className="grid gap-2 text-caption sm:grid-cols-2">
                  <div className="rounded-xl bg-(--surface-2) px-3 py-2">
                    <dt className="text-(--text-muted)">Configuration fingerprint</dt>
                    <dd className="mt-0.5 break-all font-mono text-(--text)">{t.config_fingerprint ?? "not recorded"}</dd>
                  </div>
                  <div className="rounded-xl bg-(--surface-2) px-3 py-2">
                    <dt className="text-(--text-muted)">Served by</dt>
                    <dd className="mt-0.5 font-mono text-(--text)">{t.served_model ?? (t.mode === "model" ? "the model" : "checked template")}</dd>
                  </div>
                  <div className="rounded-xl bg-(--surface-2) px-3 py-2">
                    <dt className="flex items-center gap-1 text-(--text-muted)">
                      <Timer className="size-3" aria-hidden /> Latency and tokens
                    </dt>
                    <dd className="mt-0.5 text-(--text)">
                      {t.latency_ms !== null ? `${Math.round(t.latency_ms)} ms` : "not recorded"}
                      {typeof tokensIn === "number" ? ` · ${tokensIn} in / ${tokensOut ?? 0} out` : " · no model tokens"}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-(--surface-2) px-3 py-2">
                    <dt className="text-(--text-muted)">Number check</dt>
                    <dd className="mt-0.5 text-(--text)">
                      {t.figures_traced} figure{t.figures_traced === 1 ? "" : "s"} traced · {t.grounding}
                      {t.fallback_reason ? ` · template because: ${t.fallback_reason}` : ""}
                    </dd>
                  </div>
                </dl>
              </Section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
