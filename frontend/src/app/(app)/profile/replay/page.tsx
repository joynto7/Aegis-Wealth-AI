"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, TrendingDown, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { RoleGate } from "@/components/shared/role-gate";
import { TierBadge } from "@/components/shared/tier-badge";
import { Money } from "@/components/shared/money";
import { Percent } from "@/components/shared/percent";
import { ErrorState } from "@/components/shared/error-state";
import { ChartCard } from "@/components/shared/chart-card";
import { ReplayLine } from "@/components/charts/replay-line";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { usePageTitle } from "@/components/shell/page-title";
import { useCurrentProfile, useReplay, useReplayReaction } from "@/lib/queries";
import { formatDate } from "@/lib/format";
import type { ReplayReaction } from "@/lib/types";

const EPISODES = [
  { id: "E1", label: "2007 – Global financial crisis" },
  { id: "E2", label: "2020 – Pandemic crash" },
  { id: "E3", label: "2022 – Rate shock" },
];

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
  const [episodeId, setEpisodeId] = useState("E1");
  const replay = useReplay(profile ? episodeId : null);
  const reaction = useReplayReaction();

  if (profileLoading) return <Skeleton className="h-96 w-full" />;
  if (!profile) {
    return (
      <div>
        <PageHeader title="Historical Replay" description="Complete your risk profile first." />
        <Button onClick={() => router.push("/profile")}>Open Risk Profile</Button>
      </div>
    );
  }

  async function react(value: ReplayReaction) {
    await reaction.mutateAsync({ episode_id: episodeId, reaction: value });
  }

  // The replay adjustment only ever moves 0 -> 1, so a non-zero adjustment
  // always means "sell everything" has lowered the willingness tier by one.
  const tierChanged = profile.replay_adjustment > 0 && profile.replay?.episode_id === episodeId && profile.replay?.reaction === "sell_all";

  return (
    <div>
      <PageHeader
        title="Historical Replay"
        description="See how your tier's model portfolio behaved in a real market fall, then say what you would actually do."
        action={<TierBadge tier={profile.tier} />}
      />

      <Tabs value={episodeId} onValueChange={setEpisodeId} className="mb-4">
        <TabsList>
          {EPISODES.map((e) => (
            <TabsTrigger key={e.id} value={e.id}>
              {e.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {replay.isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : replay.error || !replay.data ? (
        <ErrorState error={replay.error} onRetry={() => replay.refetch()} />
      ) : (
        <div className="space-y-4">
          <ChartCard
            title={replay.data.episode.name}
            summary={`From CNY 100,000, this portfolio fell to a low of ${formatDate(replay.data.lowest_month)} and ended at the value shown, a maximum drawdown of ${replay.data.max_drawdown_pct}%.`}
            dataLabel={replay.data.data_label}
          >
            <ReplayLine series={replay.data.series} lowestMonth={replay.data.lowest_month} />
          </ChartCard>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-(--border) bg-(--surface) p-4">
              <p className="text-caption text-(--text-muted)">Maximum drawdown</p>
              <p className="flex items-center gap-1 text-key-figure text-(--reject)">
                <TrendingDown className="size-5" />
                <Percent value={replay.data.max_drawdown_pct} />
              </p>
            </div>
            <div className="rounded-xl border border-(--border) bg-(--surface) p-4">
              <p className="text-caption text-(--text-muted)">Lowest month</p>
              <p className="text-key-figure text-(--text)">{replay.data.lowest_month}</p>
            </div>
            <div className="rounded-xl border border-(--border) bg-(--surface) p-4">
              <p className="text-caption text-(--text-muted)">End value</p>
              <p className="text-key-figure text-(--text)">
                <Money value={replay.data.end_value} />
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-(--border) bg-(--surface) p-5">
            <p className="mb-3 text-form font-semibold text-(--text)">
              {profile.replay?.episode_id === episodeId
                ? "You told us what you would do. You can change your answer:"
                : "If your investment fell like this, what would you do?"}
            </p>
            <div className="flex flex-wrap gap-2">
              {REACTIONS.map((r) => (
                <Button
                  key={r.id}
                  variant={profile.replay?.episode_id === episodeId && profile.replay?.reaction === r.id ? "default" : "outline"}
                  onClick={() => react(r.id)}
                  disabled={reaction.isPending}
                >
                  {r.label}
                </Button>
              ))}
            </div>

            {tierChanged ? (
              <Alert className="mt-4 border-(--warning) bg-(--warning-bg)">
                <AlertTriangle />
                <AlertTitle className="text-(--warning)">Your tier changed</AlertTitle>
                <AlertDescription className="text-(--warning)">
                  Choosing &quot;sell everything&quot; lowered your willingness tier by one. Your tier is now {profile.tier}.
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
