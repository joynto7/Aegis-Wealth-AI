"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, PartyPopper } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { RoleGate } from "@/components/shared/role-gate";
import { ErrorState } from "@/components/shared/error-state";
import { Stepper } from "@/components/shared/stepper";
import { Money } from "@/components/shared/money";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { usePageTitle } from "@/components/shell/page-title";
import {
  useAcknowledgeWarnings,
  useConfirmProposal,
  useExecuteProposal,
  useProposal,
  useQuiz,
  useSubmitQuiz,
} from "@/lib/queries";
import { DISCLOSURES } from "@/lib/disclosures";
import { ApiError } from "@/lib/api-client";
import type { ExecuteResponse } from "@/lib/types";

function SuccessView({ result }: { result: ExecuteResponse }) {
  return (
    <div className="space-y-4">
      <Stepper current="Done" />
      <div className="flex flex-col items-center gap-3 rounded-xl border border-(--border) bg-(--surface) px-6 py-10 text-center">
        <PartyPopper className="size-8 text-(--primary)" aria-hidden />
        <p className="text-form font-semibold text-(--text)">Orders filled</p>
        <p className="text-body text-(--text-muted)">
          Cash remaining: <Money value={result.cash_after} />
        </p>
      </div>
      <Card>
        <CardContent className="px-6 py-5">
          <h3 className="mb-3 text-form font-semibold text-(--text)">Orders</h3>
          <table className="w-full text-left text-body">
            <thead className="border-b border-(--border) text-caption text-(--text-muted)">
              <tr>
                <th className="py-2">Product</th>
                <th className="py-2">Units</th>
                <th className="py-2">NAV</th>
                <th className="py-2">Cost</th>
              </tr>
            </thead>
            <tbody>
              {result.orders.map((o) => (
                <tr key={o.id} className="border-b border-(--border) last:border-0">
                  <td className="py-2 font-medium">{o.product_code}</td>
                  <td className="py-2 tabular-nums">{o.units.toFixed(4)}</td>
                  <td className="py-2 tabular-nums">{o.nav.toFixed(4)}</td>
                  <td className="py-2">
                    <Money value={o.cost} withCents />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href={`/records/${result.record_id}`}>View advice record</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/account">Go to sandbox account</Link>
        </Button>
      </div>
    </div>
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
  const canConfirm = effectiveAcknowledged && disclosuresRead && quizPassed;

  return (
    <div className="space-y-6">
      <Stepper current="Confirm" />
      <PageHeader title="Confirm and Execute" description="Four quick steps, then your sandbox orders fill." />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
          <div>
            <p className="text-caption text-(--text-muted)">Proposal #{proposal.id}</p>
            <p className="text-key-figure text-(--text)">
              <Money value={proposal.amount} />
            </p>
          </div>
          <StatusBadge decision={proposal.gate.decision} />
        </CardContent>
      </Card>

      {needsAck ? (
        <Card>
          <CardContent className="space-y-3 px-6 py-5">
            <h3 className="text-form font-semibold text-(--text)">1. Acknowledge warnings</h3>
            {softFailRules.map((r) => (
              <div key={r.id} className="flex items-start gap-2">
                <Checkbox
                  id={`ack-${r.id}`}
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
                <Label htmlFor={`ack-${r.id}`} className="font-normal">
                  <span className="font-mono text-caption">{r.id}</span> — {r.message}
                </Label>
              </div>
            ))}
            {proposal.status !== "acknowledged" ? (
              <Button size="sm" onClick={acknowledgeAll} disabled={!allAcked || acknowledge.isPending}>
                {acknowledge.isPending ? "Saving…" : "Confirm I've read these warnings"}
              </Button>
            ) : (
              <p className="flex items-center gap-1.5 text-caption text-(--text)">
                <CheckCircle2 className="size-4" /> Warnings acknowledged
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="space-y-3 px-6 py-5">
          <h3 className="text-form font-semibold text-(--text)">{needsAck ? "2." : "1."} Disclosures</h3>
          <div className="space-y-3">
            {DISCLOSURES.map((d) => (
              <div key={d.id}>
                <p className="font-medium text-(--text)">{d.title}</p>
                <p className="text-body text-(--text-muted)">{d.text}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 border-t border-(--border) pt-3">
            <Checkbox id="disclosures-read" checked={disclosuresRead} onCheckedChange={(v) => setDisclosuresRead(!!v)} />
            <Label htmlFor="disclosures-read" className="font-normal">
              I have read these disclosures
            </Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 px-6 py-5">
          <h3 className="text-form font-semibold text-(--text)">{needsAck ? "3." : "2."} Comprehension quiz</h3>
          {quizPassed ? (
            <p className="flex items-center gap-1.5 text-caption text-(--text)">
              <CheckCircle2 className="size-4" /> Quiz passed
            </p>
          ) : quiz.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : quiz.data ? (
            <div className="space-y-4">
              {quiz.data.questions.map((q) => (
                <div key={q.id}>
                  <p className="mb-2 font-medium text-(--text)">{q.text}</p>
                  <RadioGroup
                    value={quizAnswers[q.id] ?? ""}
                    onValueChange={(v) => setQuizAnswers((prev) => ({ ...prev, [q.id]: v }))}
                  >
                    {q.options.map((opt) => (
                      <div key={opt.id} className="flex items-center gap-2 py-0.5">
                        <RadioGroupItem value={opt.id} id={`${q.id}-${opt.id}`} />
                        <Label htmlFor={`${q.id}-${opt.id}`} className="font-normal">
                          {opt.label}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                  {quizResult && !quizResult.passed ? (
                    <p
                      className={
                        quizResult.results.find((r) => r.id === q.id)?.correct ? "mt-1 text-caption text-(--pass)" : "mt-1 text-caption text-(--reject)"
                      }
                    >
                      {quizResult.results.find((r) => r.id === q.id)?.explanation}
                    </p>
                  ) : null}
                </div>
              ))}
              <Button
                onClick={onSubmitQuiz}
                disabled={Object.keys(quizAnswers).length < quiz.data.questions.length || submitQuiz.isPending}
              >
                {submitQuiz.isPending ? "Checking…" : "Submit answers"}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {actionError ? (
        <Alert variant="destructive">
          <AlertTitle>Something needs your attention</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-end">
        <Button size="lg" onClick={onConfirmAndExecute} disabled={!canConfirm || executing}>
          {executing ? "Executing…" : "Confirm and execute"}
        </Button>
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
