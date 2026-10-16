"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, History, Info } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { RoleGate } from "@/components/shared/role-gate";
import { TierBadge } from "@/components/shared/tier-badge";
import { Money } from "@/components/shared/money";
import { Percent } from "@/components/shared/percent";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { DataLabel } from "@/components/shared/data-label";
import { Stepper } from "@/components/shared/stepper";
import { ReplayPlayer, monthLabel, useReplayPlayback } from "@/components/charts/replay-player";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { usePageTitle } from "@/components/shell/page-title";
import { useCurrentProfile, useReplay, useReplayEpisodes, useReplayReaction } from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Profile, ReplayReaction, ReplayResult } from "@/lib/types";

const REACTIONS: { id: ReplayReaction; label: string }[] = [
  { id: "sell_all", label: "Sell everything" },
  { id: "sell_some", label: "Sell some" },
  { id: "hold", label: "Hold" },
  { id: "buy_more", label: "Buy more" },
];

/** Starting amounts for the replay (addition): the path scales with the amount, so the fall is the same in percent. */
const AMOUNTS = [100_000, 200_000, 500_000, 1_000_000];

/**
 * One episode at one amount, played month by month (addition: the "time
 * machine"). It pauses at the lowest month and asks what the client would do
 * then; after the answer it plays on, so the client also sees what came next.
 */
function ReplayStage({
  data,
  profile,
  chosen,
  pending,
  error,
  onReact,
}: {
  data: ReplayResult;
  profile: Profile;
  chosen: ReplayReaction | undefined;
  pending: boolean;
  error: unknown;
  onReact: (value: ReplayReaction) => Promise<boolean>;
}) {
  const lowestIndex = Math.max(
    0,
    data.series.findIndex((p) => p.month === data.lowest_month)
  );
  const playback = useReplayPlayback(data.series.length, lowestIndex, !chosen);
  const questionRef = useRef<HTMLDivElement>(null);
  const lowestValue = data.series[lowestIndex]?.value ?? data.start_value;
  const finished = playback.shown >= data.series.length;
  const askingNow = playback.atLowest && !chosen;

  useEffect(() => {
    if (askingNow) questionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [askingNow]);

  async function answer(value: ReplayReaction) {
    const saved = await onReact(value);
    if (saved && playback.atLowest) playback.resume();
  }

  const tierLowered = chosen === "sell_all" && profile.replay_adjustment > 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 px-6">
          <h3 className="flex items-center gap-2 text-form font-semibold text-(--text)">
            <History className="size-5 text-(--primary)" aria-hidden />
            {data.episode.name}: {monthLabel(data.episode.start)} to {monthLabel(data.episode.end)}
          </h3>
          <DataLabel label={data.data_label} />
        </CardHeader>
        <CardContent className="px-6">
          <p className="sr-only">
            Starting from {formatMoney(data.start_value)}, this portfolio reached its lowest point in {data.lowest_month}, fell
            at most {data.max_drawdown_pct}% from a peak, and ended at {formatMoney(data.end_value)}.
          </p>
          <ReplayPlayer
            series={data.series}
            startValue={data.start_value}
            lowestMonth={data.lowest_month}
            events={data.events}
            eventsLabel={data.events_label}
            playback={playback}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-(--border) bg-(--surface) p-4">
          <p className="text-caption text-(--text-muted)">Maximum drawdown</p>
          <p className="text-key-figure text-(--text)">
            &minus;<Percent value={data.max_drawdown_pct} />
          </p>
          <p className="text-caption text-(--text-muted)">The biggest fall from a peak during the episode.</p>
        </div>
        <div className="rounded-xl border border-(--border) bg-(--surface) p-4">
          <p className="text-caption text-(--text-muted)">Lowest point</p>
          <p className="text-key-figure text-(--text)">
            <Money value={lowestValue} />
          </p>
          <p className="text-caption text-(--text-muted)">In {monthLabel(data.lowest_month)}, when the portfolio was worth the least.</p>
        </div>
        <div className="rounded-xl border border-(--border) bg-(--surface) p-4">
          <p className="text-caption text-(--text-muted)">End value</p>
          <p className="text-key-figure text-(--text)">
            <Money value={data.end_value} />
          </p>
          <p className="text-caption text-(--text-muted)">Value at the end of the episode.</p>
        </div>
      </div>

      <div
        ref={questionRef}
        className={cn(
          "rounded-xl border bg-(--surface) p-5 transition-shadow",
          askingNow ? "border-(--primary) ring-4 ring-(--primary-soft)" : "border-(--border)"
        )}
        aria-live="polite"
      >
        <p className="mb-3 text-form font-semibold text-(--text)">
          {chosen
            ? "You answered this episode. One reaction per episode is recorded."
            : askingNow
              ? `This is the lowest point. Your ${formatMoney(data.start_value)} is now ${formatMoney(lowestValue)}. What do you do?`
              : "If your investment fell like this, what would you do?"}
        </p>
        <div className="flex flex-wrap gap-2">
          {REACTIONS.map((r) => (
            <Button
              key={r.id}
              variant={chosen === r.id ? "default" : "outline"}
              onClick={() => answer(r.id)}
              disabled={!!chosen || pending || profile.status !== "complete"}
              aria-pressed={chosen === r.id}
            >
              {r.label}
            </Button>
          ))}
        </div>

        {error ? (
          <div className="mt-4">
            <ErrorState error={error} />
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

        {chosen && finished && data.end_value > lowestValue ? (
          <p className="mt-4 rounded-lg bg-(--muted) p-3 text-body text-(--text)">
            Selling everything at the lowest point would have kept {formatMoney(lowestValue)}. Holding to{" "}
            {monthLabel(data.episode.end)}, this portfolio was worth {formatMoney(data.end_value)}.{" "}
            <span className="text-(--text-muted)">Past episodes do not predict future ones.</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ReplayContent() {
  usePageTitle("Historical Replay");
  const router = useRouter();
  const { data: profile, isLoading: profileLoading } = useCurrentProfile();
  const episodes = useReplayEpisodes();
  const [episodeId, setEpisodeId] = useState("E1");
  const [amount, setAmount] = useState(AMOUNTS[0]);
  const replay = useReplay(profile ? episodeId : null, amount);
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
        <PageHeader eyebrow="Step 2 of 5 · Crisis replay" title="Live through a crash" />
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

  async function react(value: ReplayReaction): Promise<boolean> {
    if (!profile) return false;
    try {
      await reaction.mutateAsync({ episode_id: episodeId, reaction: value });
      setAnswered((prev) => ({
        profileId: profile.id,
        reactions: { ...(prev?.profileId === profile.id ? prev.reactions : {}), [episodeId]: value },
      }));
      return true;
    } catch {
      return false; // Shown from reaction.error.
    }
  }

  return (
    <div className="space-y-6">
      <Stepper current="Replay" />
      <PageHeader
        eyebrow="Step 2 of 5 · Crisis replay"
        title="Live through a crash"
        description="Your tier's model portfolio, played month by month through a real market fall. When it hits bottom, we ask what you would actually do."
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

      <div className="flex flex-wrap items-center justify-between gap-3">
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
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-(--border) bg-(--surface) p-1.5 shadow-card" role="group" aria-label="Amount to start with">
          <span className="px-2 text-caption font-medium text-(--text-muted)">Start with</span>
          {AMOUNTS.map((a) => (
            <Button key={a} size="sm" variant={a === amount ? "default" : "ghost"} aria-pressed={a === amount} onClick={() => setAmount(a)}>
              {formatMoney(a)}
            </Button>
          ))}
        </div>
      </div>

      {replay.isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : replay.error || !replay.data ? (
        <ErrorState error={replay.error} onRetry={() => replay.refetch()} />
      ) : (
        <ReplayStage
          key={`${replay.data.episode.id}-${replay.data.start_value}`}
          data={replay.data}
          profile={profile}
          chosen={chosen}
          pending={reaction.isPending}
          error={reaction.error}
          onReact={react}
        />
      )}

      <div className="flex justify-end">
        <Button onClick={() => router.push("/proposals/new")}>
          Continue to proposal <ArrowRight className="size-4" />
        </Button>
      </div>
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
