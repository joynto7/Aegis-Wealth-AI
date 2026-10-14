"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { RoleGate } from "@/components/shared/role-gate";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageTitle } from "@/components/shell/page-title";
import { useCreateProposal, useCurrentProfile, useSandboxAccount } from "@/lib/queries";
import { ApiError } from "@/lib/api-client";

function NewProposalContent() {
  usePageTitle("Proposal Workspace");
  const router = useRouter();
  const { data: profile, isLoading: profileLoading } = useCurrentProfile();
  const { data: sandbox } = useSandboxAccount();
  const create = useCreateProposal();

  const [amount, setAmount] = useState(200000);
  const [horizon, setHorizon] = useState(8);
  const [need, setNeed] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);

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
    setFormError(null);
    if (amount < 10000) {
      setFormError("Amount must be at least CNY 10,000.");
      return;
    }
    if (horizon < 1 || horizon > 30) {
      setFormError("Horizon must be between 1 and 30 years.");
      return;
    }
    if (need > amount) {
      setFormError("Near-term need cannot be more than the amount invested.");
      return;
    }
    try {
      const proposal = await create.mutateAsync({ amount, horizon_years: horizon, near_term_need: need });
      router.push(`/proposals/${proposal.id}`);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <div>
      <PageHeader
        title="New Proposal"
        description="Tell us an amount, a horizon and how much you need soon, and we'll build a suitable allocation."
      />
      <Card className="max-w-lg">
        <CardContent className="space-y-4 px-6 py-5">
          <div>
            <Label htmlFor="amount">Amount to invest (CNY)</Label>
            <Input id="amount" type="number" className="mt-1.5" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            {sandbox ? (
              <p className="mt-1 text-caption text-(--text-muted)">Sandbox cash available: CNY {sandbox.cash.toLocaleString()}</p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="horizon">Horizon (years)</Label>
            <Input id="horizon" type="number" className="mt-1.5" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="need">Needed within 2 years (CNY)</Label>
            <Input id="need" type="number" className="mt-1.5" value={need} onChange={(e) => setNeed(Number(e.target.value))} />
            <p className="mt-1 text-caption text-(--text-muted)">Leave at 0 if you don&apos;t need any of it soon.</p>
          </div>

          {formError ? <ErrorState error={new ApiError(422, "VALIDATION_ERROR", formError)} /> : null}
          {create.isError && !formError ? <ErrorState error={create.error} /> : null}

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
