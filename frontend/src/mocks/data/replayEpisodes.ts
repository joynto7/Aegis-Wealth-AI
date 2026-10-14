import type { ReplayEpisodeSummary } from "@/lib/types";

/** Three historical episodes (Section 2.5.2). */
export const REPLAY_EPISODES: ReplayEpisodeSummary[] = [
  { id: "E1", name: "Global financial crisis", start: "2007-11", end: "2009-10" },
  { id: "E2", name: "Pandemic crash", start: "2020-01", end: "2020-12" },
  { id: "E3", name: "Rate shock", start: "2022-01", end: "2022-12" },
];

export function findEpisode(id: string): ReplayEpisodeSummary | undefined {
  return REPLAY_EPISODES.find((e) => e.id === id);
}
