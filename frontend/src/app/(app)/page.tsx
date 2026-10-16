"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  Check,
  FileSpreadsheet,
  Gauge,
  Lock,
  Scale,
  ShieldCheck,
  Sparkles,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { STEPPER_STEPS } from "@/components/shared/stepper";
import { ProposalStatusBadge, StatusBadge } from "@/components/shared/status-badge";
import { Money } from "@/components/shared/money";
import { Panel } from "@/components/shared/panel";
import { ProgressRing } from "@/components/shared/progress-ring";
import { AllocationBar } from "@/components/shared/allocation-bar";
import { Riskometer, ScoreMeter } from "@/components/charts/riskometer";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { usePageTitle } from "@/components/shell/page-title";
import { useAskAegis } from "@/components/shell/app-shell";
import { useCurrentProfile, useLogs, useMe, useProposal, useProposals, useSandboxAccount } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";
import { ACTIVITY, describeActivity } from "@/lib/activity";
import { cn } from "@/lib/utils";
import type { Profile, ProposalSummary } from "@/lib/types";

// ---------------------------------------------------------------------------
// Journey: where the client is, and the one next best action
// ---------------------------------------------------------------------------

interface NextAction {
  done: number;
  title: string;
  description: string;
  label: string;
  href: string;
}

function nextAction(profile: Profile | null | undefined, latest: ProposalSummary | undefined): NextAction {
  if (!profile) {
    return { done: 0, title: "Set your risk tier", description: "Ten short questions on what you can afford and how you feel about risk.", label: "Start the questionnaire", href: "/profile" };
  }
  if (profile.status !== "complete") {
    return { done: 0, title: "Fix two answers", description: "Two of your answers contradict each other. Change one to set your tier.", label: "Review my answers", href: "/profile" };
  }
  if (!profile.replay) {
    return { done: 1, title: "Live through a crash", description: "Watch 2008 month by month with your own money, then say what you would do.", label: "Open the crisis replay", href: "/profile/replay" };
  }
  if (!latest) {
    return { done: 2, title: "Build your first proposal", description: "Tell us an amount and a horizon; the engine builds a mix for your tier.", label: "Build a proposal", href: "/proposals/new" };
  }
  if (latest.status === "rejected") {
    return { done: 2, title: `Revise proposal #${latest.id}`, description: "The compliance gate rejected this version. See which rule failed and why.", label: "Open the proposal", href: `/proposals/${latest.id}` };
  }
  if (latest.status === "executed") {
    return { done: 5, title: "Your portfolio is live", description: "Orders filled in your sandbox and a hash-chained advice record was sealed.", label: "See my records", href: "/records" };
  }
  return { done: 3, title: `Confirm proposal #${latest.id}`, description: "Read the disclosures, pass a three-question quiz, then confirm with one click.", label: "Review and confirm", href: `/proposals/${latest.id}/confirm` };
}

function JourneyCard({ action }: { action: NextAction }) {
  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-(--border) bg-(--surface) p-6 shadow-card">
      <div className="flex items-center gap-5">
        <ProgressRing done={action.done} total={STEPPER_STEPS.length} />
        <div className="min-w-0">
          <p className="text-eyebrow text-(--primary)">Next best step</p>
          <h2 className="mt-1 font-display text-section text-(--text)">{action.title}</h2>
          <p className="mt-1 text-body text-(--text-muted)">{action.description}</p>
        </div>
      </div>
      <ol className="grid grid-cols-5 gap-1.5" aria-label="Advisory run">
        {STEPPER_STEPS.map((step, i) => {
          const done = i < action.done;
          const current = i === action.done;
          return (
            <li key={step} className="flex flex-col items-center gap-1.5 text-center">
              <span
                className={cn(
                  "h-1.5 w-full rounded-full",
                  done ? "bg-(--primary)" : current ? "bg-(--primary)/40" : "bg-(--muted)"
                )}
                aria-hidden
              />
              <span className={cn("flex items-center gap-1 text-caption", done || current ? "text-(--text)" : "text-(--text-muted)")}>
                {done ? <Check className="size-3 text-(--primary)" aria-hidden /> : null}
                {step}
                <span className="sr-only">{done ? " (done)" : current ? " (current)" : ""}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <Button asChild size="lg" className="w-full">
        <Link href={action.href}>
          {action.label} <ArrowRight className="size-4" />
        </Link>
      </Button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Portfolio hero
// ---------------------------------------------------------------------------

function PortfolioHero() {
  const { data: sandbox, isLoading } = useSandboxAccount();
  const invested = sandbox ? sandbox.total_value - sandbox.cash : 0;
  const investedShare = sandbox && sandbox.total_value > 0 ? (invested / sandbox.total_value) * 100 : 0;
  return (
    <section className="bg-ink relative overflow-hidden rounded-2xl p-7 shadow-raised">
      <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[#6366f1]/25 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-32 right-24 size-64 rounded-full bg-[#a855f7]/20 blur-3xl" aria-hidden />
      <div className="relative flex h-full flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-body text-(--ink-muted)">
            <Wallet className="size-4" aria-hidden /> Sandbox portfolio value
          </p>
          <span className="rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-caption text-(--ink-text)">
            Simulated · CNY
          </span>
        </div>
        {isLoading || !sandbox ? (
          <Skeleton className="h-14 w-64 bg-white/10" />
        ) : (
          <p className="text-hero-figure text-white">
            <Money value={sandbox.total_value} />
          </p>
        )}
        <div className="mt-auto space-y-3">
          <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-white/10" aria-hidden>
            <span className="h-full rounded-full bg-[#a5b4fc]" style={{ width: `${investedShare}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="flex items-center gap-1.5 text-caption text-(--ink-muted)">
                <span className="size-2 rounded-full bg-[#a5b4fc]" aria-hidden /> Invested
              </p>
              <p className="mt-0.5 font-display text-form font-bold text-white">{sandbox ? <Money value={invested} /> : "—"}</p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-caption text-(--ink-muted)">
                <span className="size-2 rounded-full bg-white/30" aria-hidden /> Cash available
              </p>
              <p className="mt-0.5 font-display text-form font-bold text-white">{sandbox ? <Money value={sandbox.cash} /> : "—"}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Risk, proposal, AI
// ---------------------------------------------------------------------------

function RiskCard({ profile, loading }: { profile: Profile | null | undefined; loading: boolean }) {
  return (
    <Panel
      icon={Gauge}
      title="Your risk tier"
      description="The lower of what you can afford and how you feel about risk."
      action={
        profile ? (
          <Link href="/profile" className="text-body font-medium text-(--primary) hover:underline">
            Retake
          </Link>
        ) : null
      }
    >
      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : profile ? (
        <div className="space-y-5">
          <Riskometer tier={profile.tier} size={210} />
          <div className="space-y-3">
            <ScoreMeter label="Capacity" score={profile.capacity_score} />
            <ScoreMeter label="Willingness" score={profile.willingness_score} />
          </div>
          <p className="rounded-xl bg-(--surface-2) px-3 py-2.5 text-caption text-(--text-muted)">
            Largest fall you said you could accept:{" "}
            <span className="font-semibold text-(--text)">{profile.max_acceptable_loss_pct}%</span>
            {profile.replay_adjustment > 0 ? " · lowered once by the crisis replay" : ""}
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Riskometer tier={1} size={170} showLabel={false} />
          <p className="text-body text-(--text-muted)">No tier yet. Ten questions set it.</p>
          <Button asChild variant="outline">
            <Link href="/profile">Start</Link>
          </Button>
        </div>
      )}
    </Panel>
  );
}

function LatestProposalCard({ latest, loading }: { latest: ProposalSummary | undefined; loading: boolean }) {
  const { data: proposal } = useProposal(latest?.id ?? null);
  return (
    <Panel
      icon={FileSpreadsheet}
      title="Latest proposal"
      description="Built by the engine for your tier, checked against nine rules."
      action={latest ? <ProposalStatusBadge status={latest.status} className="px-2 py-0.5 text-caption" /> : null}
    >
      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : latest ? (
        <div className="flex h-full flex-col gap-5">
          <div>
            <p className="text-caption text-(--text-muted)">
              Proposal #{latest.id} · version {latest.version}
            </p>
            <p className="text-key-figure text-(--text)">
              <Money value={latest.amount} />
            </p>
            {proposal ? (
              <p className="text-caption text-(--text-muted)">
                {proposal.horizon_years} years · tier {proposal.tier}
              </p>
            ) : null}
          </div>
          {proposal ? <AllocationBar weights={proposal.class_weights_pct} /> : <Skeleton className="h-8 w-full" />}
          <div className="flex items-center justify-between rounded-xl bg-(--surface-2) px-3 py-2.5">
            <span className="flex items-center gap-2 text-caption text-(--text-muted)">
              <Scale className="size-4" aria-hidden /> Compliance gate
            </span>
            <StatusBadge decision={latest.gate_decision} className="px-2 py-0.5 text-caption [&_svg]:size-3.5" />
          </div>
          <Button asChild variant="outline" className="mt-auto w-full">
            <Link href={`/proposals/${latest.id}`}>
              Open proposal <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-(--primary-soft) text-(--primary)">
            <FileSpreadsheet className="size-6" aria-hidden />
          </span>
          <p className="text-body text-(--text-muted)">Your proposals appear here, each with its compliance verdict.</p>
          <Button asChild>
            <Link href="/proposals/new">Build a proposal</Link>
          </Button>
        </div>
      )}
    </Panel>
  );
}

const SUGGESTIONS = ["Why this proposal?", "What's my risk tier?", "Which product costs me least?"];

function AskAegisCard() {
  const ask = useAskAegis();
  return (
    <section className="relative flex flex-col overflow-hidden rounded-2xl p-6 text-white shadow-raised" style={{ background: "var(--ai-gradient)" }}>
      <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-white/15 blur-2xl" aria-hidden />
      <div className="relative flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
          <Sparkles className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-form font-bold">Ask Aegis</h2>
          <p className="text-caption text-white/80">Your AI advisor. Every figure traced to a tool.</p>
        </div>
      </div>
      <p className="relative mt-5 text-body text-white/90">
        It explains, compares and drafts. It can&apos;t place an order, and it can&apos;t bend a rule.
      </p>
      <div className="relative mt-5 flex flex-col gap-2">
        {SUGGESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => ask(q)}
            className="flex items-center justify-between rounded-xl border border-white/25 bg-white/10 px-3.5 py-2.5 text-left text-body font-medium backdrop-blur transition-colors hover:bg-white/20"
          >
            {q}
            <ArrowRight className="size-4 opacity-80" aria-hidden />
          </button>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Activity and safeguards
// ---------------------------------------------------------------------------

function ActivityTimeline() {
  const { data, isLoading } = useLogs({ limit: 8, offset: 0 });
  const items = (data?.items ?? []).filter((e) => e.action !== "tool_call");
  return (
    <Panel
      icon={Activity}
      title="Your activity"
      description="Every action is logged; this is your own log, newest first."
      action={
        <Link href="/records" className="text-body font-medium text-(--primary) hover:underline">
          Records
        </Link>
      }
    >
      {isLoading ? (
        <Skeleton className="h-56 w-full" />
      ) : items.length ? (
        <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-(--border)">
          {items.map((entry) => {
            const Icon = ACTIVITY[entry.action]?.icon ?? Activity;
            const denied = entry.decision === "denied";
            return (
              <li key={entry.id} className="relative flex items-start gap-3">
                <span
                  className={cn(
                    "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border bg-(--surface)",
                    denied ? "border-(--text) text-(--text)" : "border-(--border) text-(--primary)"
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                </span>
                <div className="min-w-0 pt-1">
                  <p className="text-body font-medium text-(--text)">
                    {describeActivity(entry)}
                    {denied ? <span className="ml-1.5 text-caption font-normal text-(--text-muted)">· denied</span> : null}
                  </p>
                  <p className="text-caption text-(--text-muted)">{formatDateTime(entry.ts)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="py-8 text-center text-body text-(--text-muted)">Your actions will appear here as you go.</p>
      )}
    </Panel>
  );
}

const SAFEGUARDS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Scale, title: "Tested code computes every number", text: "The AI never invents a figure: each one is checked against a tool result before you see it." },
  { icon: Lock, title: "The AI cannot place orders", text: "It has no tool that can. Only your own Confirm click creates a one-time, five-minute token." },
  { icon: ShieldCheck, title: "Every recommendation is sealed", text: "Each execution writes an advice record hash-chained to the last, so any later edit shows." },
];

function SafeguardsCard() {
  return (
    <Panel icon={ShieldCheck} title="Your safeguards" description="Three promises the system keeps by construction, not by policy.">
      <ul className="space-y-4">
        {SAFEGUARDS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-(--surface-2) text-(--primary) ring-1 ring-(--border)">
              <Icon className="size-4" aria-hidden />
            </span>
            <div>
              <p className="text-body font-semibold text-(--text)">{title}</p>
              <p className="text-caption leading-relaxed text-(--text-muted)">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ---------------------------------------------------------------------------

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function DashboardPage() {
  usePageTitle("Dashboard");
  const router = useRouter();
  const { data: user } = useMe();
  const { data: profile, isLoading: profileLoading } = useCurrentProfile();
  const { data: proposalsData, isLoading: proposalsLoading } = useProposals();

  useEffect(() => {
    if (user?.role === "compliance") router.replace("/control-room");
  }, [user, router]);

  const latest = proposalsData?.items?.[0];
  const action = nextAction(profile, latest);
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={today}
        title={`${greeting()}${user ? `, ${user.display_name}` : ""}`}
        description="Here is your sandbox portfolio, your risk tier and the next step of your advisory run."
        className="mb-2"
      />

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <PortfolioHero />
        {profileLoading || proposalsLoading ? <Skeleton className="h-full min-h-64 rounded-2xl" /> : <JourneyCard action={action} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <RiskCard profile={profile} loading={profileLoading} />
        <LatestProposalCard latest={latest} loading={proposalsLoading} />
        <AskAegisCard />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <ActivityTimeline />
        <SafeguardsCard />
      </div>
    </div>
  );
}
