"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { RoleGate } from "@/components/shared/role-gate";
import { ErrorState, FieldError } from "@/components/shared/error-state";
import { Stepper } from "@/components/shared/stepper";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageTitle } from "@/components/shell/page-title";
import { useCreateProposal, useCurrentProfile, useSandboxAccount } from "@/lib/queries";
import { ApiError } from "@/lib/api-client";
import type { ErrorCode } from "@/lib/types";

type Field = "amount" | "horizon" | "need";

/** 409s from POST /proposals, each with the screen that fixes it (Section 2.7.5, S07). */
const CONFLICT_FIX: Partial<Record<ErrorCode, { href: string; label: string }>> = {
  PROFILE_REQUIRED: { href: "/profile", label: "Open Risk Profile" },
  CONTRADICTIONS_OPEN: { href: "/profile", label: "Fix your risk profile" },
  INSUFFICIENT_CASH: { href: "/account", label: "Check your sandbox account" },
};

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

  if (profileLoading) return <Skeleton className="h-64 w-full" />;

  if (!profile) {
    return (
      <div>
        <PageHeader title="Proposal Workspace" />
        <EmptyState
          title="Complete your risk profile first"
          description="A proposal is built from your risk tier, so we need that before anything else."
          actionLabel="Open Risk Profile"
          onAction={() => router.push("/profile")}
        />
      </div>
    );
  }

  if (profile.contradictions.length) {
    return (
      <div>
        <PageHeader title="Proposal Workspace" />
        <EmptyState
          title="Fix your risk profile first"
          description="One of your answers contradicts another. Resolve it before requesting a proposal."
          actionLabel="Review Risk Profile"
          onAction={() => router.push("/profile")}
        />
      </div>
    );
  }

  async function onSubmit() {
    // Section 2.5.3 inputs: 10,000 <= A <= sandbox cash, H a whole number of years from 1 to 30, 0 <= N <= A.
    const errors: Partial<Record<Field, string>> = {};
    if (!(amount >= 10000)) errors.amount = "Enter at least CNY 10,000.";
    else if (sandbox && amount > sandbox.cash) errors.amount = `Your sandbox account holds CNY ${sandbox.cash.toLocaleString()}.`;
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
        title="New Proposal"
        description="Tell us an amount, a horizon and how much you need soon, and we'll build a suitable allocation."
      />
      <Card className="max-w-lg">
        <CardContent className="space-y-4 px-6 py-5">
          <div>
            <Label htmlFor="amount">Amount to invest (CNY)</Label>
            <Input
              id="amount"
              type="number"
              className="mt-1.5"
              value={amount}
              aria-invalid={!!fieldErrors.amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
            <FieldError message={fieldErrors.amount} />
            {sandbox ? (
              <p className="mt-1 text-caption text-(--text-muted)">Sandbox cash available: CNY {sandbox.cash.toLocaleString()}</p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="horizon">Horizon (years)</Label>
            <Input
              id="horizon"
              type="number"
              className="mt-1.5"
              value={horizon}
              aria-invalid={!!fieldErrors.horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
            />
            <FieldError message={fieldErrors.horizon} />
          </div>
          <div>
            <Label htmlFor="need">Needed within 2 years (CNY)</Label>
            <Input
              id="need"
              type="number"
              className="mt-1.5"
              value={need}
              aria-invalid={!!fieldErrors.need}
              onChange={(e) => setNeed(Number(e.target.value))}
            />
            <FieldError message={fieldErrors.need} />
            <p className="mt-1 text-caption text-(--text-muted)">Leave at 0 if you don&apos;t need any of it soon.</p>
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

          <Button className="w-full" onClick={onSubmit} disabled={create.isPending}>
            {create.isPending ? "Building…" : "Generate proposal"}
          </Button>
        </CardContent>
      </Card>
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
