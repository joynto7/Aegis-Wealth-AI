"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, HeartPulse, Info, RotateCcw, Wallet } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { RoleGate } from "@/components/shared/role-gate";
import { ErrorState } from "@/components/shared/error-state";
import { Stepper } from "@/components/shared/stepper";
import { Panel } from "@/components/shared/panel";
import { ProgressRing } from "@/components/shared/progress-ring";
import { Riskometer, ScoreMeter } from "@/components/charts/riskometer";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageTitle } from "@/components/shell/page-title";
import { useCurrentProfile, useQuestionnaire, useSubmitProfile } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";

type Question = { id: string; text: string; options: { id: string; label: string }[] };

function ResultView({ profile, onRetake }: { profile: Profile; onRetake: (ids?: string[]) => void }) {
  const router = useRouter();
  const lowerIsCapacity = profile.capacity_tier <= profile.willingness_tier;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <section className="flex flex-col items-center gap-4 rounded-2xl border border-(--border) bg-(--surface) p-8 text-center shadow-card">
        <p className="text-eyebrow text-(--primary)">Your risk tier</p>
        <Riskometer tier={profile.tier} size={300} />
        <p className="max-w-sm text-body text-(--text-muted)">
          Your tier decides which products the engine may use: only those at or below risk level R{profile.tier}.
        </p>
      </section>

      <div className="space-y-6">
        {profile.contradictions.length ? (
          <div className="space-y-3">
            {profile.contradictions.map((c) => (
              <Alert key={c.id} className="border-(--warning) bg-(--warning-bg)">
                <AlertTriangle className="size-4 text-(--warning)" />
                <AlertTitle className="text-(--warning)">Two answers contradict each other</AlertTitle>
                <AlertDescription className="text-(--text)">
                  {c.message}{" "}
                  <button type="button" className="font-medium text-(--primary) underline" onClick={() => onRetake(c.question_ids)}>
                    Review questions {c.question_ids.join(" and ")}
                  </button>
                </AlertDescription>
              </Alert>
            ))}
          </div>
        ) : null}

        <Panel icon={Info} title="How your tier was set" description="We score two things and use the lower one, so you're never put above what you can afford or stomach.">
          <div className="space-y-4">
            <div className={cn("rounded-xl border p-4", lowerIsCapacity ? "border-(--primary) bg-(--primary-soft)/50" : "border-(--border)")}>
              <div className="mb-2 flex items-center gap-2 text-body font-semibold text-(--text)">
                <Wallet className="size-4 text-(--primary)" aria-hidden /> Capacity: what you can afford
                {lowerIsCapacity ? <span className="ml-auto text-caption font-medium text-(--primary)">Sets your tier</span> : null}
              </div>
              <ScoreMeter label={`Tier ${profile.capacity_tier}`} score={profile.capacity_score} />
            </div>
            <div className={cn("rounded-xl border p-4", !lowerIsCapacity ? "border-(--primary) bg-(--primary-soft)/50" : "border-(--border)")}>
              <div className="mb-2 flex items-center gap-2 text-body font-semibold text-(--text)">
                <HeartPulse className="size-4 text-(--primary)" aria-hidden /> Willingness: how you feel about risk
                {!lowerIsCapacity ? <span className="ml-auto text-caption font-medium text-(--primary)">Sets your tier</span> : null}
              </div>
              <ScoreMeter label={`Tier ${profile.willingness_tier}`} score={profile.willingness_score} />
            </div>
            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-(--surface-2) p-3">
                <dt className="text-caption text-(--text-muted)">Largest fall you can accept</dt>
                <dd className="font-display text-section text-(--text)">{profile.max_acceptable_loss_pct}%</dd>
              </div>
              <div className="rounded-xl bg-(--surface-2) p-3">
                <dt className="text-caption text-(--text-muted)">Crisis replay adjustment</dt>
                <dd className="font-display text-section text-(--text)">{profile.replay_adjustment > 0 ? "−1 tier" : "None"}</dd>
              </div>
            </dl>
          </div>
        </Panel>

        {!profile.contradictions.length ? (
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => onRetake()}>
              <RotateCcw className="size-4" /> Retake
            </Button>
            <Button size="lg" onClick={() => router.push("/profile/replay")}>
              Next: live through a crash <ArrowRight className="size-4" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function QuestionCard({
  number,
  question,
  value,
  highlighted,
  onAnswer,
}: {
  number: number;
  question: Question;
  value: string | undefined;
  highlighted: boolean;
  onAnswer: (value: string) => void;
}) {
  return (
    <section
      id={`q-${question.id}`}
      className={cn(
        "scroll-mt-24 rounded-2xl border bg-(--surface) p-5 shadow-card transition-colors",
        highlighted ? "border-(--warning) ring-2 ring-(--warning)/25" : value ? "border-(--primary)/40" : "border-(--border)"
      )}
    >
      <div className="mb-4 flex items-start gap-3">
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full text-caption font-bold",
            value ? "bg-(--primary) text-white" : "bg-(--muted) text-(--text-muted)"
          )}
          aria-hidden
        >
          {value ? <Check className="size-3.5" /> : number}
        </span>
        <h3 className="pt-0.5 text-form font-semibold text-(--text)">{question.text}</h3>
      </div>
      <RadioGroup value={value ?? ""} onValueChange={onAnswer} className="grid gap-2 sm:grid-cols-2" aria-label={question.text}>
        {question.options.map((opt) => (
          <label
            key={opt.id}
            htmlFor={`${question.id}-${opt.id}`}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-body transition-colors",
              value === opt.id
                ? "border-(--primary) bg-(--primary-soft) font-medium text-(--text)"
                : "border-(--border) text-(--text) hover:border-(--border-strong) hover:bg-(--surface-2)"
            )}
          >
            <RadioGroupItem value={opt.id} id={`${question.id}-${opt.id}`} />
            {opt.label}
          </label>
        ))}
      </RadioGroup>
    </section>
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
  const [highlight, setHighlight] = useState<string[]>([]);

  const groups = useMemo(() => {
    if (!questionnaire) return { capacity: [] as Question[], willingness: [] as Question[] };
    return {
      capacity: questionnaire.questions.filter((q) => q.group === "capacity"),
      willingness: questionnaire.questions.filter((q) => q.group === "willingness"),
    };
  }, [questionnaire]);

  if (isLoading || profileLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-14 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }
  if (error || !questionnaire) return <ErrorState error={error} onRetry={() => refetch()} />;

  const total = questionnaire.questions.length;
  const answeredCount = Object.keys(answers).length;
  const capacityDone = groups.capacity.filter((q) => answers[q.id]).length;
  const willingnessDone = groups.willingness.filter((q) => answers[q.id]).length;
  const effectiveProfile = justSubmitted ?? currentProfile ?? null;
  const showResult = mode === "result" && effectiveProfile;

  async function onSubmit() {
    try {
      const profile = await submit.mutateAsync(answers);
      setJustSubmitted(profile);
      setHighlight([]);
      setMode("result");
      window.scrollTo({ top: 0 });
    } catch {
      // Shown next to the Submit button from submit.error.
    }
  }

  if (showResult && effectiveProfile) {
    return (
      <div className="space-y-6">
        <Stepper current="Profile" />
        <PageHeader eyebrow="Step 1 of 5" title="Your risk profile" description="Two scores, one tier: the lower of what you can afford and how you feel about risk." />
        <ResultView
          profile={effectiveProfile}
          onRetake={(ids) => {
            setMode("form");
            setJustSubmitted(null);
            setHighlight(ids ?? []);
            if (ids?.length) {
              setTimeout(() => document.getElementById(`q-${ids[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
            }
          }}
        />
      </div>
    );
  }

  const answer = (id: string, value: string) => {
    setAnswers((a) => ({ ...a, [id]: value }));
    setHighlight((h) => h.filter((x) => x !== id));
  };

  return (
    <div className="space-y-6">
      <Stepper current="Profile" />
      <PageHeader
        eyebrow="Step 1 of 5"
        title="Risk profile"
        description="Ten questions, about two minutes. Five are about what you can afford, five about how you feel when markets fall."
        action={
          currentProfile ? (
            <Button variant="outline" onClick={() => setMode("result")}>
              View current result
            </Button>
          ) : undefined
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          {[
            { key: "capacity", title: "Capacity", subtitle: "What you can afford to put at risk", icon: Wallet, questions: groups.capacity, offset: 0 },
            { key: "willingness", title: "Willingness", subtitle: "How you feel about risk and falls", icon: HeartPulse, questions: groups.willingness, offset: groups.capacity.length },
          ].map((group) => {
            const Icon = group.icon;
            return (
              <div key={group.key} className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-(--primary-soft) text-(--primary)">
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  <div>
                    <h2 className="font-display text-section text-(--text)">{group.title}</h2>
                    <p className="text-caption text-(--text-muted)">{group.subtitle}</p>
                  </div>
                </div>
                {group.questions.map((q, i) => (
                  <QuestionCard
                    key={q.id}
                    number={group.offset + i + 1}
                    question={q}
                    value={answers[q.id]}
                    highlighted={highlight.includes(q.id)}
                    onAnswer={(v) => answer(q.id, v)}
                  />
                ))}
              </div>
            );
          })}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <section className="rounded-2xl border border-(--border) bg-(--surface) p-5 shadow-card">
            <div className="flex items-center gap-4">
              <ProgressRing done={answeredCount} total={total} size={84} unit="answered" />
              <div>
                <p className="font-display text-form font-bold text-(--text)">
                  {answeredCount === total ? "All answered" : `${total - answeredCount} to go`}
                </p>
                <p className="text-caption text-(--text-muted)">Capacity {capacityDone}/5 · Willingness {willingnessDone}/5</p>
              </div>
            </div>
            {submit.isError ? (
              <div className="mt-4">
                <ErrorState error={submit.error} />
              </div>
            ) : null}
            <Button className="mt-5 w-full" size="lg" onClick={onSubmit} disabled={answeredCount < total || submit.isPending}>
              {submit.isPending ? "Scoring…" : "See my risk tier"}
              {submit.isPending ? null : <ArrowRight className="size-4" />}
            </Button>
          </section>
          <section className="rounded-2xl border border-(--border) bg-(--surface-2) p-5 text-caption leading-relaxed text-(--text-muted)">
            <p className="mb-2 flex items-center gap-1.5 font-semibold text-(--text)">
              <Info className="size-3.5 text-(--primary)" aria-hidden /> How we use your answers
            </p>
            Each group scores 0 to 100 and maps to a tier from 1 (conservative) to 5 (aggressive). Your tier is the lower of
            the two. If two answers contradict each other, we ask you to fix one before proposing anything.
          </section>
        </aside>
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
