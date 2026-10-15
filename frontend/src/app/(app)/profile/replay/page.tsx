"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Info } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { RoleGate } from "@/components/shared/role-gate";
import { TierBadge } from "@/components/shared/tier-badge";
import { Money } from "@/components/shared/money";
import { Percent } from "@/components/shared/percent";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { ChartCard } from "@/components/shared/chart-card";
import { Stepper } from "@/components/shared/stepper";
import { ReplayLine } from "@/components/charts/replay-line";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { usePageTitle } from "@/components/shell/page-title";
import { useCurrentProfile, useReplay, useReplayEpisodes, useReplayReaction } from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import type { ReplayReaction } from "@/lib/types";

const REACTIONS: { id: ReplayReaction; label: string }[] = [
  { id: "sell_all", label: "Sell everything" },
  { id: "sell_some", label: "Sell some" },
  { id: "hold", label: "Hold" },
  { id: "buy_more", label: "Buy more" },
];

function ReplayContent() {
  usePageTitle("Historical Replay");
  const router = useRouter();
  const { data: profile, isLoading: profileLoading } = useCurrentProfile();
  const episodes = useReplayEpisodes();
  const [episodeId, setEpisodeId] = useState("E1");
  const replay = useReplay(profile ? episodeId : null);
  const reaction = useReplayReaction();
  // One reaction per episode (Section 2.7.5, S04). The server enforces it per
  // profile version; this remembers what was answered on this visit.
  const [answered, setAnswered] = useState<{ profileId: number; reactions: Record<string, ReplayReaction> } | null>(
    null
  );

  if (profileLoading) return <Skeleton className="h-96 w-full" />;
  if (!profile) {
    return (
      <div className="space-y-6">
        <Stepper current="Replay" />
        <PageHeader title="Historical Replay" />
        <EmptyState
          title="Complete your risk profile first"
          description="The replay plays your tier's model portfolio, so it needs your tier."
          actionLabel="Open Risk Profile"
          onAction={() => router.push("/profile")}
        />
      </div>
    );
  }

  const reactions: Record<string, ReplayReaction> = {
    ...(profile.replay ? { [profile.replay.episode_id]: profile.replay.reaction } : {}),
    ...(answered?.profileId === profile.id ? answered.reactions : {}),
  };
  const chosen = reactions[episodeId];

  async function react(value: ReplayReaction) {
    if (!profile) return;
    try {
      await reaction.mutateAsync({ episode_id: episodeId, reaction: value });
      setAnswered((prev) => ({
        profileId: profile.id,
        reactions: { ...(prev?.profileId === profile.id ? prev.reactions : {}), [episodeId]: value },
      }));
    } catch {
      // Shown below from reaction.error.
    }
  }

  const tierLowered = chosen === "sell_all" && profile.replay_adjustment > 0;

  return (
    <div className="space-y-6">
      <Stepper current="Replay" />
      <PageHeader
        title="Historical Replay"
        description="See how your tier's model portfolio behaved in a real market fall, then say what you would actually do."
        action={<TierBadge tier={profile.tier} />}
      />

      {profile.status !== "complete" ? (
        <Alert>
          <Info />
          <AlertTitle>Your risk profile needs a fix first</AlertTitle>
          <AlertDescription>
            One of your answers contradicts another, so your reaction can&apos;t be recorded yet.{" "}
            <Link href="/profile" className="font-medium text-(--primary) hover:underline">
              Fix your risk profile
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      {episodes.isLoading ? (
        <Skeleton className="h-9 w-96 max-w-full" />
      ) : episodes.error ? (
        <ErrorState error={episodes.error} onRetry={() => episodes.refetch()} />
      ) : (
        <Tabs value={episodeId} onValueChange={setEpisodeId}>
          <TabsList className="h-auto flex-wrap">
            {episodes.data?.episodes.map((e) => (
              <TabsTrigger key={e.id} value={e.id}>
                {e.start.slice(0, 4)} – {e.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {replay.isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : replay.error || !replay.data ? (
        <ErrorState error={replay.error} onRetry={() => replay.refetch()} />
      ) : (
        <div className="space-y-4">
          <ChartCard
            title={replay.data.episode.name}
            summary={`Starting from ${formatMoney(replay.data.start_value)}, this portfolio reached its lowest point in ${replay.data.lowest_month}, fell at most ${replay.data.max_drawdown_pct}% from a peak, and ended at ${formatMoney(replay.data.end_value)}.`}
            dataLabel={replay.data.data_label}
          >
            <ReplayLine series={replay.data.series} lowestMonth={replay.data.lowest_month} />
          </ChartCard>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-(--border) bg-(--surface) p-4">
              <p className="text-caption text-(--text-muted)">Maximum drawdown</p>
              <p className="text-key-figure text-(--text)">
                &minus;<Percent value={replay.data.max_drawdown_pct} />
              </p>
              <p className="text-caption text-(--text-muted)">The biggest fall from a peak during the episode.</p>
            </div>
            <div className="rounded-xl border border-(--border) bg-(--surface) p-4">
              <p className="text-caption text-(--text-muted)">Lowest month</p>
              <p className="text-key-figure text-(--text)">{replay.data.lowest_month}</p>
              <p className="text-caption text-(--text-muted)">When the portfolio was worth the least.</p>
            </div>
            <div className="rounded-xl border border-(--border) bg-(--surface) p-4">
              <p className="text-caption text-(--text-muted)">End value</p>
              <p className="text-key-figure text-(--text)">
                <Money value={replay.data.end_value} />
              </p>
              <p className="text-caption text-(--text-muted)">Value at the end of the episode.</p>
            </div>
          </div>

          <div className="rounded-xl border border-(--border) bg-(--surface) p-5">
            <p className="mb-3 text-form font-semibold text-(--text)">
              {chosen
                ? "You answered this episode. One reaction per episode is recorded."
                : "If your investment fell like this, what would you do?"}
            </p>
            <div className="flex flex-wrap gap-2">
              {REACTIONS.map((r) => (
                <Button
                  key={r.id}
                  variant={chosen === r.id ? "default" : "outline"}
                  onClick={() => react(r.id)}
                  disabled={!!chosen || reaction.isPending || profile.status !== "complete"}
                  aria-pressed={chosen === r.id}
                >
                  {r.label}
                </Button>
              ))}
            </div>

            {reaction.error ? (
              <div className="mt-4">
                <ErrorState error={reaction.error} />
              </div>
            ) : null}

            {chosen ? (
              <Alert className="mt-4">
                <Info />
                <AlertTitle>{tierLowered ? `Your tier is now ${profile.tier}` : `Your tier stays at ${profile.tier}`}</AlertTitle>
                <AlertDescription>
                  {tierLowered
                    ? "You chose “sell everything”, so your willingness tier was lowered by one. This happens only once."
                    : chosen === "sell_all"
                      ? "Your tier was already lowered once by a replay, and it never drops more than once."
                      : "Only “sell everything” changes your tier."}
                </AlertDescription>
              </Alert>
            ) : null}
          </div>

          <div className="flex justify-end">
            <Button onClick={() => router.push("/proposals/new")}>
              Continue to proposal <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReplayPage() {
  return (
    <RoleGate role="client">
      <ReplayContent />
    </RoleGate>
  );
}
