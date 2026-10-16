"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Calculator, CircleCheckBig, Cog, Hand, ListChecks, MousePointerClick } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { RoleGate } from "@/components/shared/role-gate";
import { ErrorState, FieldError } from "@/components/shared/error-state";
import { Stepper } from "@/components/shared/stepper";
import { EmptyState } from "@/components/shared/empty-state";
import { Panel } from "@/components/shared/panel";
import { Money } from "@/components/shared/money";
import { TierBadge } from "@/components/shared/tier-badge";
import { AllocationDonut, AllocationLegend } from "@/components/charts/allocation-donut";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageTitle } from "@/components/shell/page-title";
import { useCreateProposal, useCurrentProfile, useReplay, useSandboxAccount } from "@/lib/queries";
import { ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ErrorCode } from "@/lib/types";

type Field = "amount" | "horizon" | "need";

/** 409s from POST /proposals, each with the screen that fixes it (Section 2.7.5, S07). */
const CONFLICT_FIX: Partial<Record<ErrorCode, { href: string; label: string }>> = {
  PROFILE_REQUIRED: { href: "/profile", label: "Open Risk Profile" },
  CONTRADICTIONS_OPEN: { href: "/profile", label: "Fix your risk profile" },
  INSUFFICIENT_CASH: { href: "/account", label: "Check your sandbox account" },
};

const AMOUNT_PRESETS = [50_000, 100_000, 200_000, 500_000];
const HORIZON_PRESETS = [3, 5, 8, 10];

const NEXT_STEPS = [
  { icon: Cog, title: "The engine builds your mix", text: "Your tier's model portfolio, adjusted for your horizon and the cash you need soon." },
  { icon: ListChecks, title: "Nine rules check it", text: "Suitability, concentration, liquidity, horizon, lock-up, fees and loss tolerance." },
  { icon: Hand, title: "You review and question it", text: "Every product says why it was chosen; Ask Aegis explains anything else." },
  { icon: MousePointerClick, title: "Only you confirm", text: "Nothing is bought until you pass a short quiz and press Confirm." },
];

function PresetChips<T extends number>({
  values,
  current,
  format,
  onPick,
  label,
}: {
  values: T[];
  current: number;
  format: (v: T) => string;
  onPick: (v: T) => void;
  label: string;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={label}>
      {values.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onPick(v)}
          aria-pressed={current === v}
          className={cn(
            "rounded-full px-3 py-1 text-caption font-medium transition-colors",
            current === v ? "bg-(--primary) text-white" : "bg-(--surface-2) text-(--text-muted) ring-1 ring-(--border) hover:text-(--text)"
          )}
        >
          {format(v)}
        </button>
      ))}
    </div>
  );
}

function TierMix({ tier }: { tier: number }) {
  // The replay endpoint returns the tier's model portfolio, the engine's starting point (Section 2.5.3, step 1).
  const { data, isLoading } = useReplay("E1");
  return (
    <Panel
      icon={Calculator}
      title="Your tier's starting mix"
      description="The engine starts here, then adjusts for your horizon and near-term need."
      action={<TierBadge tier={tier} className="px-2 py-0.5 text-caption" />}
    >
      {isLoading || !data ? (
        <Skeleton className="h-56 w-full" />
      ) : (
        <div className="grid items-center gap-4 sm:grid-cols-[180px_1fr]">
          <AllocationDonut weights={data.weights_pct} height={180} centerValue={`Tier ${tier}`} centerLabel="model mix" />
          <AllocationLegend weights={data.weights_pct} columns />
        </div>
      )}
    </Panel>
  );
}

function NewProposalContent() {
  usePageTitle("Proposal Workspace");
  const router = useRouter();
  const { data: profile, isLoading: profileLoading } = useCurrentProfile();
  const { data: sandbox } = useSandboxAccount();
  const create = useCreateProposal();

  const [amount, setAmount] = useState(200000);
  const [horizon, setHorizon] = useState(8);
  const [need, setNeed] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});

  if (profileLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;

  if (!profile || profile.contradictions.length) {
    return (
      <div className="space-y-6">
        <Stepper current="Proposal" />
        <PageHeader eyebrow="Step 3 of 5" title="New proposal" />
        <EmptyState
          title={profile ? "Fix your risk profile first" : "Complete your risk profile first"}
          description={
            profile
              ? "Two of your answers contradict each other. Resolve them before requesting a proposal."
              : "A proposal is built from your risk tier, so we need that before anything else."
          }
          actionLabel={profile ? "Review Risk Profile" : "Open Risk Profile"}
          onAction={() => router.push("/profile")}
        />
      </div>
    );
  }

  async function onSubmit() {
    // Section 2.5.3 inputs: 10,000 <= A <= sandbox cash, H a whole number of years from 1 to 30, 0 <= N <= A.
    const errors: Partial<Record<Field, string>> = {};
    if (!(amount >= 10000)) errors.amount = "Enter at least CNY 10,000.";
    else if (sandbox && amount > sandbox.cash) errors.amount = `Your sandbox account holds ${formatMoney(sandbox.cash)}.`;
    if (!Number.isInteger(horizon) || horizon < 1 || horizon > 30) errors.horizon = "Enter a whole number of years from 1 to 30.";
    if (!(need >= 0)) errors.need = "Enter CNY 0 or more.";
    else if (need > amount) errors.need = "This can't be more than the amount you invest.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    try {
      const proposal = await create.mutateAsync({ amount, horizon_years: horizon, near_term_need: need });
      router.push(`/proposals/${proposal.id}`);
    } catch {
      // Shown below from create.error.
    }
  }

  const apiError = create.error instanceof ApiError ? create.error : null;
  const fix = apiError ? CONFLICT_FIX[apiError.code] : undefined;

  return (
    <div className="space-y-6">
      <Stepper current="Proposal" />
      <PageHeader
        eyebrow="Step 3 of 5"
        title="Build a proposal"
        description="Three inputs. The engine does the rest, and the compliance gate checks the result before you see it."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_1fr]">
        <section className="rounded-2xl border border-(--border) bg-(--surface) p-6 shadow-card">
          <div className="space-y-6">
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor="amount" className="text-form font-semibold">
                  How much to invest
                </Label>
                {sandbox ? (
                  <span className="text-caption text-(--text-muted)">
                    Available: <Money value={sandbox.cash} className="font-semibold text-(--text)" />
                  </span>
                ) : null}
              </div>
              <div className="relative mt-2">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body font-semibold text-(--text-muted)">CNY</span>
                <Input
                  id="amount"
                  type="number"
                  inputMode="numeric"
                  className="h-12 pl-14 font-display text-[20px] font-bold"
                  value={amount}
                  aria-invalid={!!fieldErrors.amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                />
              </div>
              <PresetChips values={AMOUNT_PRESETS} current={amount} format={(v) => formatMoney(v).replace("CNY ", "")} onPick={setAmount} label="Amount presets" />
              <FieldError message={fieldErrors.amount} />
            </div>

            <div>
              <Label htmlFor="horizon" className="text-form font-semibold">
                For how many years
              </Label>
              <div className="relative mt-2">
                <Input
                  id="horizon"
                  type="number"
                  inputMode="numeric"
                  className="h-12 pr-16 font-display text-[20px] font-bold"
                  value={horizon}
                  aria-invalid={!!fieldErrors.horizon}
                  onChange={(e) => setHorizon(Number(e.target.value))}
                />
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-body font-semibold text-(--text-muted)">years</span>
              </div>
              <PresetChips values={HORIZON_PRESETS} current={horizon} format={(v) => `${v} years`} onPick={setHorizon} label="Horizon presets" />
              <FieldError message={fieldErrors.horizon} />
              {horizon < 3 ? (
                <p className="mt-2 text-caption text-(--text-muted)">Under 3 years, equities and gold are capped at 20% together.</p>
              ) : null}
            </div>

            <div>
              <Label htmlFor="need" className="text-form font-semibold">
                Needed within 2 years
              </Label>
              <div className="relative mt-2">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body font-semibold text-(--text-muted)">CNY</span>
                <Input
                  id="need"
                  type="number"
                  inputMode="numeric"
                  className="h-12 pl-14 font-display text-[20px] font-bold"
                  value={need}
                  aria-invalid={!!fieldErrors.need}
                  onChange={(e) => setNeed(Number(e.target.value))}
                />
              </div>
              <FieldError message={fieldErrors.need} />
              <p className="mt-2 text-caption text-(--text-muted)">
                Money you&apos;ll want back soon, like a deposit or school fees. We keep at least that much in cash you can withdraw within
                a day. Leave at 0 if none.
              </p>
            </div>

            {apiError && apiError.status === 409 ? (
              <Alert variant="destructive">
                <AlertTitle>We couldn&apos;t build this proposal</AlertTitle>
                <AlertDescription>
                  <p>{apiError.message}</p>
                  {fix ? (
                    <Link href={fix.href} className="font-medium text-(--primary) underline-offset-2 hover:underline">
                      {fix.label}
                    </Link>
                  ) : null}
                  <p className="text-caption text-(--text-muted)">Error code: {apiError.code}</p>
                </AlertDescription>
              </Alert>
            ) : create.isError ? (
              <ErrorState error={create.error} onRetry={onSubmit} />
            ) : null}

            <Button size="lg" className="w-full" onClick={onSubmit} disabled={create.isPending}>
              {create.isPending ? "Building and checking…" : "Build my proposal"}
              {create.isPending ? null : <ArrowRight className="size-4" />}
            </Button>
          </div>
        </section>

        <div className="space-y-6">
          <TierMix tier={profile.tier} />
          <Panel icon={CircleCheckBig} title="What happens next" description="Four steps, and nothing is bought until the last one.">
            <ol className="relative space-y-5 before:absolute before:bottom-3 before:left-[17px] before:top-3 before:w-px before:bg-(--border)">
              {NEXT_STEPS.map(({ icon: Icon, title, text }, i) => (
                <li key={title} className="relative flex gap-3">
                  <span className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border border-(--border) bg-(--surface) text-(--primary)">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <div className="pt-1">
                    <p className="text-body font-semibold text-(--text)">
                      <span className="mr-1.5 text-(--text-muted)">{i + 1}.</span>
                      {title}
                    </p>
                    <p className="text-caption leading-relaxed text-(--text-muted)">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </div>
  );
}

export default function NewProposalPage() {
  return (
    <RoleGate role="client">
      <NewProposalContent />
    </RoleGate>
  );
}
