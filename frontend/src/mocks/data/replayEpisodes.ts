import type { ReplayEpisodeSummary, ReplayEvent } from "@/lib/types";

/** Three historical episodes (Section 2.5.2), with the real-world events shown during the replay (addition). */
export const REPLAY_EPISODES: ReplayEpisodeSummary[] = [
  { id: "E1", name: "Global financial crisis", start: "2007-11", end: "2009-10" },
  { id: "E2", name: "Pandemic crash", start: "2020-01", end: "2020-12" },
  { id: "E3", name: "Rate shock", start: "2022-01", end: "2022-12" },
];

export const EPISODE_EVENTS: Record<string, ReplayEvent[]> = {
  E1: [
    {
      month: "2007-11",
      text: "Big banks report heavy losses on US sub-prime mortgages.",
    },
    {
      month: "2008-03",
      text: "Bear Stearns is rescued in a deal with JPMorgan.",
    },
    {
      month: "2008-09",
      text: "Lehman Brothers files for bankruptcy.",
    },
    {
      month: "2009-04",
      text: "G20 leaders agree a USD 1.1 trillion package to support the world economy.",
    },
  ],
  E2: [
    {
      month: "2020-02",
      text: "COVID-19 spreads beyond China and markets start to fall.",
    },
    {
      month: "2020-03",
      text: "The WHO declares a pandemic.",
    },
    {
      month: "2020-04",
      text: "Markets rebound after large central-bank and government support.",
    },
    {
      month: "2020-11",
      text: "The first successful vaccine trial results lift markets.",
    },
  ],
  E3: [
    {
      month: "2022-03",
      text: "The US Federal Reserve starts raising interest rates.",
    },
    {
      month: "2022-06",
      text: "The Fed raises rates by 0.75 points, its largest rise since 1994.",
    },
    {
      month: "2022-12",
      text: "Stocks and bonds both end the year sharply down.",
    },
  ],
};

export const EVENTS_LABEL = "Real events; the portfolio path is illustrative.";

export function findEpisode(id: string): ReplayEpisodeSummary | undefined {
  return REPLAY_EPISODES.find((e) => e.id === id);
}
