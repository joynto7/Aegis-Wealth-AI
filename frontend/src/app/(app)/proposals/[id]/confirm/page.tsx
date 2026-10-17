"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Check, CheckCircle2, FileCheck2, Lock, PauseCircle, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { RoleGate } from "@/components/shared/role-gate";
import { ErrorState } from "@/components/shared/error-state";
import { Stepper } from "@/components/shared/stepper";
import { Money } from "@/components/shared/money";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { usePageTitle } from "@/components/shell/page-title";
import { useAssetColors } from "@/lib/asset-colors";
import { cn } from "@/lib/utils";
import {
  useAcknowledgeWarnings,
  useConfirmProposal,
  useControls,
  useExecuteProposal,
  useProposal,
  useQuiz,
  useSubmitQuiz,
} from "@/lib/queries";
import { DISCLOSURES } from "@/lib/disclosures";
import { ApiError } from "@/lib/api-client";
import type { ExecuteResponse, Proposal } from "@/lib/types";
import { SideChip } from "@/components/monitoring/trades-table";
import { StaleRebalance } from "@/components/proposal/rebalance-panel";

function SuccessView({ result }: { result: ExecuteResponse }) {
  return (
    <div className="space-y-6">
      <Stepper current="Done" />
      <section className="bg-ink relative overflow-hidden rounded-2xl px-8 py-10 text-center shadow-raised">
        <div className="pointer-events-none absolute left-1/2 top-0 size-80 -translate-x-1/2 rounded-full bg-[#6366f1]/25 blur-3xl" aria-hidden />
        <div className="relative flex flex-col items-center gap-3">
          <span className="bg-ai flex size-14 items-center justify-center rounded-full shadow-glow">
            <Check className="size-7" aria-hidden />
          </span>
          <h1 className="font-display text-[28px] font-bold text-white">Orders filled</h1>
          <p className="max-w-md text-body text-(--ink-muted)">
            {result.orders.length} simulated orders filled in your sandbox account
            {result.orders.some((o) => o.side === "sell") ? `, sales first (${result.orders.filter((o) => o.side === "sell").length} sold)` : ""}, and advice
            record #{result.record_id} was sealed with SHA-256 and chained to your last one.
          </p>
          <p className="text-body text-(--ink-text)">
            Cash remaining: <Money value={result.cash_after} className="font-semibold text-white" />
          </p>
        </div>
      </section>
      <Card>
        <CardContent className="px-6 py-5">
          <h3 className="mb-3 font-display text-form font-bold text-(--text)">Your orders</h3>
          <table className="w-full text-left text-body">
            <thead className="border-b border-(--border) text-caption text-(--text-muted)">
              <tr>
                <th className="py-2 font-medium">Trade</th>
                <th className="py-2 font-medium">Product</th>
                <th className="py-2 text-right font-medium">Units</th>
                <th className="py-2 text-right font-medium">NAV</th>
                <th className="py-2 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {result.orders.map((o) => (
                <tr key={o.id} className="border-b border-(--border) last:border-0">
                  <td className="py-2.5">
                    <SideChip side={o.side} />
                  </td>
                  <td className="py-2.5 font-medium text-(--text)">{o.product_code}</td>
                  <td className="py-2.5 text-right tabular-nums">{o.units.toFixed(4)}</td>
                  <td className="py-2.5 text-right tabular-nums">{o.nav.toFixed(4)}</td>
                  <td className="py-2.5 text-right">
                    <Money value={o.cost} withCents />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="lg">
          <Link href={`/records/${result.record_id}`}>
            <FileCheck2 className="size-4" /> View the advice record
          </Link>
        </Button>
        <Button variant="outline" size="lg" asChild>
          <Link href="/account">Go to my sandbox account</Link>
        </Button>
      </div>
    </div>
  );
}

function StepCard({
  n,
  title,
  description,
  done,
  children,
}: {
  n: number;
  title: string;
  description: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-2xl border bg-(--surface) p-6 shadow-card", done ? "border-(--primary)/40" : "border-(--border)")}>
      <header className="mb-4 flex items-start gap-3">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full text-body font-bold",
            done ? "bg-(--primary) text-white" : "bg-(--muted) text-(--text-muted)"
          )}
          aria-hidden
        >
          {done ? <Check className="size-4" /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-form font-bold text-(--text)">
            {title}
            <span className="sr-only">{done ? " (done)" : " (to do)"}</span>
          </h2>
          <p className="text-caption text-(--text-muted)">{description}</p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-caption font-medium",
            done ? "bg-(--primary-soft) text-(--primary)" : "bg-(--muted) text-(--text-muted)"
          )}
          aria-hidden
        >
          {done ? "Done" : "To do"}
        </span>
      </header>
      {children}
    </section>
  );
}

function OrderSummary({
  proposal,
  checks,
  canConfirm,
  executing,
  halted,
  onConfirm,
}: {
  proposal: Proposal;
  checks: { label: string; done: boolean }[];
  canConfirm: boolean;
  executing: boolean;
  halted: boolean;
  onConfirm: () => void;
}) {
  const colors = useAssetColors();
  const rebalance = proposal.rebalance;
  return (
    <section className="overflow-hidden rounded-2xl border border-(--border) bg-(--surface) shadow-raised">
      <div className="bg-ink px-6 py-5">
        <p className="text-eyebrow text-[#c7d2fe]">
          {rebalance ? "Rebalancing" : "Order summary"} · proposal #{proposal.id}
        </p>
        <p className="mt-1.5 font-display text-[30px] font-bold leading-tight text-white">
          <Money value={proposal.amount} />
        </p>
        <div className="mt-2 flex items-center gap-2">
          <StatusBadge decision={proposal.gate.decision} className="px-2 py-0.5 text-caption [&_svg]:size-3.5" />
          <span className="text-caption text-(--ink-muted)">
            {rebalance ? `${rebalance.trades.length} trades` : `${proposal.items.length} products`} · tier {proposal.tier}
          </span>
        </div>
      </div>
      <div className="space-y-5 p-6">
        {rebalance ? (
          <div className="space-y-2.5">
            <ul className="space-y-2.5">
              {rebalance.trades.map((t) => (
                <li key={`${t.side}-${t.product_code}`} className="flex items-center gap-2.5 text-body">
                  <SideChip side={t.side} className="px-1.5" />
                  <span className="min-w-0 flex-1 truncate text-(--text)">{t.name}</span>
                  <span className="font-semibold text-(--text)">
                    <Money value={t.amount} />
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-caption text-(--text-muted)">
              Sales of <Money value={rebalance.sell_total} /> fund purchases of <Money value={rebalance.buy_total} />, back to the mix of
              proposal #{rebalance.source_proposal_id}.
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {proposal.items.map((item) => (
              <li key={item.product_code} className="flex items-center gap-2.5 text-body">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[item.asset_class] }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-(--text)">{item.name}</span>
                <span className="font-semibold tabular-nums text-(--text)">{item.weight_pct}%</span>
              </li>
            ))}
          </ul>
        )}
        <ul className="space-y-2 border-t border-(--border) pt-4">
          {checks.map((c) => (
            <li key={c.label} className={cn("flex items-center gap-2 text-body", c.done ? "text-(--text)" : "text-(--text-muted)")}>
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full",
                  c.done ? "bg-(--primary) text-white" : "border border-(--border-strong)"
                )}
                aria-hidden
              >
                {c.done ? <Check className="size-3" /> : null}
              </span>
              {c.label}
              <span className="sr-only">{c.done ? " done" : " not done yet"}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-start gap-2.5 rounded-xl bg-(--surface-2) p-3 text-caption leading-relaxed text-(--text-muted)">
          <Lock className="mt-0.5 size-4 shrink-0 text-(--primary)" aria-hidden />
          Your click creates a one-time token, valid for five minutes and bound to these exact items. The AI has no way to create
          one.
        </div>
        <Button size="lg" className="w-full" onClick={onConfirm} disabled={!canConfirm || executing || halted}>
          {executing ? "Executing…" : halted ? "Execution paused" : "Confirm and execute"}
          {executing || halted ? null : <ArrowRight className="size-4" />}
        </Button>
        <p className="flex items-center justify-center gap-1.5 text-caption text-(--text-muted)">
          <ShieldCheck className="size-3.5" aria-hidden /> Simulated orders · no real money moves
        </p>
      </div>
    </section>
  );
}

function ConfirmContent({ id }: { id: number }) {
  usePageTitle("Confirm and Execute");
  const router = useRouter();
  const { data: proposal, isLoading, error, refetch } = useProposal(id);
  const acknowledge = useAcknowledgeWarnings(id);
  const open = proposal?.status === "passed" || proposal?.status === "warning" || proposal?.status === "acknowledged";
  const quiz = useQuiz(open ? id : null);
  const submitQuiz = useSubmitQuiz(id);
  const confirm = useConfirmProposal(id);
  const execute = useExecuteProposal(id);
  const controls = useControls();
  const halted = controls.data?.execution.state === "halted";

  const [ackChecked, setAckChecked] = useState<Set<string>>(new Set());
  const [disclosuresRead, setDisclosuresRead] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [quizResult, setQuizResult] = useState<{ passed: boolean; results: { id: string; correct: boolean; explanation: string }[] } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [result, setResult] = useState<ExecuteResponse | null>(null);
  const [executing, setExecuting] = useState(false);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error || !proposal) return <ErrorState error={error} onRetry={() => refetch()} />;

  if (proposal.status === "rejected") {
    return (
      <div>
        <PageHeader title="Confirm and Execute" />
        <ErrorState
          error={new ApiError(409, "GATE_REJECTED", "This proposal was rejected by the compliance gate. Revise it before confirming.")}
        />
        <div className="mt-4">
          <Button onClick={() => router.push(`/proposals/${id}`)}>Back to proposal</Button>
        </div>
      </div>
    );
  }

  if (result) return <SuccessView result={result} />;

  if (proposal.status === "executed" || proposal.status === "superseded") {
    return (
      <div className="space-y-6">
        <Stepper current={proposal.status === "executed" ? "Done" : "Confirm"} />
        <PageHeader title="Confirm and Execute" />
        <ErrorState
          error={
            new ApiError(
              409,
              "STATE_CONFLICT",
              proposal.status === "executed"
                ? "This proposal was already executed."
                : "This version was superseded by a newer one. Confirm the latest version instead."
            )
          }
        />
        <div>
          <Button onClick={() => router.push(proposal.status === "executed" ? "/records" : `/proposals/${id}`)}>
            {proposal.status === "executed" ? "View advice records" : "Back to proposal"}
          </Button>
        </div>
      </div>
    );
  }

  const softFailRules = proposal.gate.rules.filter((r) => r.type === "soft" && r.result === "fail");
  const needsAck = proposal.status === "warning";
  const allAcked = softFailRules.every((r) => ackChecked.has(r.id));

  async function acknowledgeAll() {
    const ids = softFailRules.map((r) => r.id);
    setActionError(null);
    try {
      await acknowledge.mutateAsync(ids);
      setAckChecked(new Set(ids));
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "We couldn't save your acknowledgement. Please try again.");
    }
  }

  async function onSubmitQuiz() {
    setActionError(null);
    try {
      const res = await submitQuiz.mutateAsync(quizAnswers);
      setQuizResult(res);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "We couldn't check your answers. Please try again.");
    }
  }

  async function onConfirmAndExecute() {
    setActionError(null);
    setExecuting(true);
    try {
      const { confirm_token } = await confirm.mutateAsync();
      const res = await execute.mutateAsync(confirm_token);
      setResult(res);
    } catch (e) {
      if (e instanceof ApiError && e.code === "TOKEN_EXPIRED") {
        setActionError("Your confirmation token expired. Confirm again.");
      } else if (e instanceof ApiError) {
        setActionError(e.message);
      } else {
        setActionError("Something went wrong. Please try again.");
      }
    } finally {
      setExecuting(false);
    }
  }

  const effectiveAcknowledged = !needsAck || allAcked || proposal.status === "acknowledged";
  const quizPassed = quizResult?.passed ?? proposal.quiz_passed;
  const stale = proposal.rebalance?.stale ?? false;
  const canConfirm = effectiveAcknowledged && disclosuresRead && quizPassed && !stale;

  let n = 0;
  return (
    <div className="space-y-6">
      <Stepper current="Confirm" />
      <PageHeader
        eyebrow="Step 4 of 5"
        title="Review and confirm"
        description="Three short checks, then one click. Nothing is bought before it."
      />

      {stale ? <StaleRebalance /> : null}

      {halted ? (
        <Alert>
          <PauseCircle />
          <AlertTitle>Order execution is paused by the compliance team</AlertTitle>
          <AlertDescription>
            You can still read the disclosures and take the quiz. Confirm works again as soon as compliance resumes execution.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          {needsAck ? (
            <StepCard
              n={++n}
              title="Acknowledge the warnings"
              description="The gate passed every hard rule but flagged these. Tick each one to show you've read it."
              done={effectiveAcknowledged}
            >
              <div className="space-y-2">
                {softFailRules.map((r) => (
                  <label
                    key={r.id}
                    htmlFor={`ack-${r.id}`}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-(--warning)/40 bg-(--warning-bg) p-3.5"
                  >
                    <Checkbox
                      id={`ack-${r.id}`}
                      className="mt-0.5"
                      checked={ackChecked.has(r.id) || proposal.status === "acknowledged"}
                      onCheckedChange={(v) =>
                        setAckChecked((prev) => {
                          const next = new Set(prev);
                          if (v) next.add(r.id);
                          else next.delete(r.id);
                          return next;
                        })
                      }
                      disabled={proposal.status === "acknowledged"}
                    />
                    <span className="text-body text-(--text)">
                      <span className="font-mono text-caption text-(--text-muted)">{r.id}</span> {r.message}
                      <span className="block text-caption text-(--text-muted)">{r.detail}</span>
                    </span>
                  </label>
                ))}
              </div>
              {proposal.status !== "acknowledged" ? (
                <Button className="mt-4" onClick={acknowledgeAll} disabled={!allAcked || acknowledge.isPending}>
                  {acknowledge.isPending ? "Saving…" : "Confirm I've read these warnings"}
                </Button>
              ) : null}
            </StepCard>
          ) : null}

          <StepCard
            n={++n}
            title="Read the disclosures"
            description="What this is, what it isn't, and the limits of the AI that advised you."
            done={disclosuresRead}
          >
            <div className="grid gap-3 md:grid-cols-2">
              {DISCLOSURES.map((d) => (
                <div key={d.id} className="rounded-xl border border-(--border) bg-(--surface-2) p-4">
                  <p className="font-mono text-[11px] text-(--text-muted)">{d.id}</p>
                  <p className="font-semibold text-(--text)">{d.title}</p>
                  <p className="mt-1 text-caption leading-relaxed text-(--text-muted)">{d.text}</p>
                </div>
              ))}
            </div>
            <label htmlFor="disclosures-read" className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-(--border) px-4 py-3">
              <Checkbox id="disclosures-read" checked={disclosuresRead} onCheckedChange={(v) => setDisclosuresRead(!!v)} />
              <span className="text-body font-medium text-(--text)">I have read these disclosures</span>
            </label>
          </StepCard>

          <StepCard
            n={++n}
            title="Pass the comprehension quiz"
            description="Three questions about this proposal. A wrong answer explains why; you can try again."
            done={!!quizPassed}
          >
            {quizPassed ? (
              <p className="flex items-center gap-2 text-body font-medium text-(--text)">
                <CheckCircle2 className="size-5 text-(--primary)" /> Quiz passed. You understand what you&apos;re confirming.
              </p>
            ) : quiz.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : quiz.data ? (
              <div className="space-y-5">
                {quiz.data.questions.map((q, qi) => {
                  const res = quizResult && !quizResult.passed ? quizResult.results.find((r) => r.id === q.id) : undefined;
                  return (
                    <div key={q.id}>
                      <p className="mb-2.5 font-semibold text-(--text)">
                        <span className="mr-1.5 text-(--text-muted)">{qi + 1}.</span>
                        {q.text}
                      </p>
                      <RadioGroup
                        value={quizAnswers[q.id] ?? ""}
                        onValueChange={(v) => setQuizAnswers((prev) => ({ ...prev, [q.id]: v }))}
                        className="grid gap-2"
                      >
                        {q.options.map((opt) => (
                          <label
                            key={opt.id}
                            htmlFor={`${q.id}-${opt.id}`}
                            className={cn(
                              "flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-body",
                              quizAnswers[q.id] === opt.id ? "border-(--primary) bg-(--primary-soft)" : "border-(--border) hover:bg-(--surface-2)"
                            )}
                          >
                            <RadioGroupItem value={opt.id} id={`${q.id}-${opt.id}`} />
                            {opt.label}
                          </label>
                        ))}
                      </RadioGroup>
                      {res ? (
                        <p className={cn("mt-2 rounded-lg px-3 py-2 text-caption", res.correct ? "bg-(--pass-bg) text-(--pass)" : "bg-(--reject-bg) text-(--reject)")}>
                          {res.correct ? "Correct. " : "Not quite. "}
                          {res.explanation}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
                <Button onClick={onSubmitQuiz} disabled={Object.keys(quizAnswers).length < quiz.data.questions.length || submitQuiz.isPending}>
                  {submitQuiz.isPending ? "Checking…" : "Check my answers"}
                </Button>
              </div>
            ) : null}
          </StepCard>

          {actionError ? (
            <Alert variant="destructive">
              <AlertTitle>Something needs your attention</AlertTitle>
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-24">
          <OrderSummary
            proposal={proposal}
            checks={[
              ...(needsAck ? [{ label: "Warnings acknowledged", done: effectiveAcknowledged }] : []),
              { label: "Disclosures read", done: disclosuresRead },
              { label: "Quiz passed", done: !!quizPassed },
            ]}
            canConfirm={canConfirm}
            executing={executing}
            halted={halted}
            onConfirm={onConfirmAndExecute}
          />
        </aside>
      </div>
    </div>
  );
}

export default function ConfirmPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  return (
    <RoleGate role="client">
      <ConfirmContent id={id} />
    </RoleGate>
  );
}
