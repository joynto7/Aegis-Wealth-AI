"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { RoleGate } from "@/components/shared/role-gate";
import { TierBadge } from "@/components/shared/tier-badge";
import { ErrorState } from "@/components/shared/error-state";
import { Stepper } from "@/components/shared/stepper";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageTitle } from "@/components/shell/page-title";
import { useCurrentProfile, useQuestionnaire, useSubmitProfile } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";

function ScoreBar({ label, score, isLower }: { label: string; score: number; isLower: boolean }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-caption text-(--text-muted)">
        <span className={cn(isLower && "font-semibold text-(--text)")}>
          {label} {isLower ? "· used for your tier" : ""}
        </span>
        <span className="tabular-nums">{score}</span>
      </div>
      <Progress value={score} className={cn(isLower ? "h-2.5" : "h-2 opacity-70")} />
    </div>
  );
}

function ResultPanel({ profile, onRetake }: { profile: Profile; onRetake: (ids?: string[]) => void }) {
  const router = useRouter();
  const lowerIsCapacity = profile.capacity_tier <= profile.willingness_tier;
  return (
    <Card>
      <CardHeader className="px-6">
        <h3 className="text-form font-semibold text-(--text)">Your result</h3>
      </CardHeader>
      <CardContent className="space-y-5 px-6">
        <div className="flex flex-wrap items-center gap-3">
          <TierBadge tier={profile.tier} />
          <span className="text-caption text-(--text-muted)">
            Maximum acceptable loss: {profile.max_acceptable_loss_pct}%
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ScoreBar label="Capacity" score={profile.capacity_score} isLower={lowerIsCapacity} />
          <ScoreBar label="Willingness" score={profile.willingness_score} isLower={!lowerIsCapacity} />
        </div>
        {profile.replay_adjustment > 0 ? (
          <p className="text-caption text-(--text-muted)">
            Your historical replay reaction lowered your willingness tier by one.
          </p>
        ) : null}

        {profile.contradictions.length ? (
          <div className="space-y-2">
            {profile.contradictions.map((c) => (
              <Alert key={c.id} variant="destructive" className="border-(--warning) bg-(--warning-bg) text-(--warning)">
                <AlertTriangle className="size-4" />
                <AlertTitle>Please fix an answer</AlertTitle>
                <AlertDescription className="text-(--warning)">
                  {c.message}{" "}
                  <button type="button" className="underline" onClick={() => onRetake(c.question_ids)}>
                    Review questions {c.question_ids.join(", ")}
                  </button>
                </AlertDescription>
              </Alert>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => onRetake()}>
              Retake
            </Button>
            <Button onClick={() => router.push("/profile/replay")}>
              Continue to historical replay <ArrowRight className="size-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RiskProfileForm() {
  usePageTitle("Risk Profile");
  const { data: questionnaire, isLoading, error, refetch } = useQuestionnaire();
  const { data: currentProfile, isLoading: profileLoading } = useCurrentProfile();
  const submit = useSubmitProfile();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"form" | "result">("form");
  const [justSubmitted, setJustSubmitted] = useState<Profile | null>(null);

  const total = questionnaire?.questions.length ?? 10;
  const answeredCount = Object.keys(answers).length;

  const groups = useMemo(() => {
    if (!questionnaire) return { capacity: [], willingness: [] };
    return {
      capacity: questionnaire.questions.filter((q) => q.group === "capacity"),
      willingness: questionnaire.questions.filter((q) => q.group === "willingness"),
    };
  }, [questionnaire]);

  if (isLoading || profileLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (error || !questionnaire) return <ErrorState error={error} onRetry={() => refetch()} />;

  const effectiveProfile = justSubmitted ?? currentProfile ?? null;
  const showResult = mode === "result" && effectiveProfile;

  async function onSubmit() {
    try {
      const profile = await submit.mutateAsync(answers);
      setJustSubmitted(profile);
      setMode("result");
    } catch {
      // Shown next to the Submit button from submit.error.
    }
  }

  if (showResult && effectiveProfile) {
    return (
      <div className="space-y-6">
        <Stepper current="Profile" />
        <PageHeader title="Risk Profile" description="Your capacity and willingness scores set a suitable risk tier." />
        <ResultPanel
          profile={effectiveProfile}
          onRetake={(ids) => {
            setMode("form");
            setJustSubmitted(null);
            if (ids?.length) {
              setTimeout(() => {
                document.getElementById(`q-${ids[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
              }, 50);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <Stepper current="Profile" className="mb-6" />
      <PageHeader
        title="Risk Profile"
        description="Answer all 10 questions. Five are about your capacity for risk, five about your willingness to take it."
        action={
          currentProfile ? (
            <Button variant="outline" onClick={() => setMode("result")}>
              View current result
            </Button>
          ) : undefined
        }
      />

      <div className="sticky top-0 z-10 mb-4 rounded-xl border border-(--border) bg-(--surface) p-3">
        <div className="mb-1 flex items-center justify-between text-caption text-(--text-muted)">
          <span>
            {answeredCount} of {total} answered
          </span>
        </div>
        <Progress value={(answeredCount / total) * 100} />
      </div>

      <div className="space-y-6">
        <QuestionGroup
          title="Capacity — what you can afford"
          questions={groups.capacity}
          answers={answers}
          onAnswer={(id, value) => setAnswers((a) => ({ ...a, [id]: value }))}
        />
        <QuestionGroup
          title="Willingness — what you're comfortable with"
          questions={groups.willingness}
          answers={answers}
          onAnswer={(id, value) => setAnswers((a) => ({ ...a, [id]: value }))}
        />
      </div>

      {submit.isError ? (
        <div className="mt-4">
          <ErrorState error={submit.error} />
        </div>
      ) : null}

      <div className="mt-6 flex justify-end">
        <Button onClick={onSubmit} disabled={answeredCount < total || submit.isPending}>
          {submit.isPending ? "Scoring…" : "Submit"}
        </Button>
      </div>
    </div>
  );
}

function QuestionGroup({
  title,
  questions,
  answers,
  onAnswer,
}: {
  title: string;
  questions: { id: string; text: string; options: { id: string; label: string }[] }[];
  answers: Record<string, string>;
  onAnswer: (id: string, value: string) => void;
}) {
  return (
    <div>
      <h3 className="mb-3 text-section text-(--text)">{title}</h3>
      <div className="grid gap-4 md:grid-cols-2">
        {questions.map((q) => (
          <Card key={q.id} id={`q-${q.id}`}>
            <CardContent className="px-6 py-5">
              <p className="mb-3 text-form font-medium text-(--text)">{q.text}</p>
              <RadioGroup value={answers[q.id] ?? ""} onValueChange={(v) => onAnswer(q.id, v)}>
                {q.options.map((opt) => (
                  <div key={opt.id} className="flex items-center gap-2 py-1">
                    <RadioGroupItem value={opt.id} id={`${q.id}-${opt.id}`} />
                    <Label htmlFor={`${q.id}-${opt.id}`} className="font-normal">
                      {opt.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function RiskProfilePage() {
  return (
    <RoleGate role="client">
      <RiskProfileForm />
    </RoleGate>
  );
}
