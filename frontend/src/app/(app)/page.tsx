"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Stepper, type StepperStepName } from "@/components/shared/stepper";
import { TierBadge } from "@/components/shared/tier-badge";
import { ProposalStatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { usePageTitle } from "@/components/shell/page-title";
import { useMe, useCurrentProfile, useProposals, useSandboxAccount } from "@/lib/queries";

function nextStep(hasProfile: boolean, hasReplay: boolean, proposalStatus?: string): StepperStepName {
  if (!hasProfile) return "Profile";
  if (!hasReplay) return "Replay";
  if (!proposalStatus) return "Proposal";
  if (proposalStatus === "executed") return "Done";
  return "Confirm";
}

export default function DashboardPage() {
  usePageTitle("Dashboard");
  const router = useRouter();
  const { data: user } = useMe();
  const { data: profile, isLoading: profileLoading } = useCurrentProfile();
  const { data: proposalsData, isLoading: proposalsLoading } = useProposals();
  const { data: sandbox, isLoading: sandboxLoading } = useSandboxAccount();

  useEffect(() => {
    if (user?.role === "compliance") router.replace("/console");
  }, [user, router]);

  const latestProposal = proposalsData?.items?.[0];
  const loading = profileLoading || proposalsLoading || sandboxLoading;

  return (
    <div>
      <PageHeader title={`Welcome back${user ? `, ${user.display_name}` : ""}`} description="Here's where you left off." />

      {loading ? (
        <Skeleton className="h-8 w-80" />
      ) : (
        <Stepper
          current={nextStep(!!profile, !!profile?.replay, latestProposal?.status)}
          className="mb-8 flex-wrap"
        />
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="px-6">
            <h3 className="text-caption font-medium uppercase tracking-wide text-(--text-muted)">Risk tier</h3>
          </CardHeader>
          <CardContent className="px-6">
            {profileLoading ? (
              <Skeleton className="h-9 w-32" />
            ) : profile ? (
              <div className="space-y-2">
                <TierBadge tier={profile.tier} />
                <p className="text-caption text-(--text-muted)">
                  Capacity {profile.capacity_score} · Willingness {profile.willingness_score}
                </p>
              </div>
            ) : (
              <p className="text-body text-(--text-muted)">Not set yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="px-6">
            <h3 className="text-caption font-medium uppercase tracking-wide text-(--text-muted)">Latest proposal</h3>
          </CardHeader>
          <CardContent className="px-6">
            {proposalsLoading ? (
              <Skeleton className="h-9 w-32" />
            ) : latestProposal ? (
              <div className="space-y-2">
                <ProposalStatusBadge status={latestProposal.status} />
                <p className="text-key-figure text-(--text)">
                  <Money value={latestProposal.amount} />
                </p>
              </div>
            ) : (
              <p className="text-body text-(--text-muted)">No proposal yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="px-6">
            <h3 className="text-caption font-medium uppercase tracking-wide text-(--text-muted)">Sandbox value</h3>
          </CardHeader>
          <CardContent className="px-6">
            {sandboxLoading ? (
              <Skeleton className="h-9 w-32" />
            ) : sandbox ? (
              <p className="text-key-figure text-(--text)">
                <Money value={sandbox.total_value} />
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {!loading && !profile ? (
        <div className="mt-6">
          <EmptyState
            title="Start with your risk profile"
            description="Answer 10 short questions so we can set a suitable risk tier before proposing anything."
            actionLabel="Open Risk Profile"
            onAction={() => router.push("/profile")}
          />
        </div>
      ) : null}

      {!loading && profile && !latestProposal ? (
        <div className="mt-6 flex items-center justify-between rounded-xl border border-(--border) bg-(--surface) p-5">
          <div>
            <p className="text-form font-semibold text-(--text)">Ready for a proposal</p>
            <p className="text-body text-(--text-muted)">Tell us an amount and horizon and we&apos;ll build an allocation.</p>
          </div>
          <Button asChild>
            <Link href="/proposals/new">
              Request a proposal <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
