import type { AssetClass, ReplayPoint, ReplayResult } from "@/lib/types";
import { MODEL_PORTFOLIOS } from "@/mocks/data/modelPortfolios";
import { EPISODE_EVENTS, EVENTS_LABEL, findEpisode } from "@/mocks/data/replayEpisodes";
import { historySlice, HISTORY_DATA_LABEL, HISTORY_DATA_AS_OF } from "@/mocks/data/history";

const CLASSES: AssetClass[] = ["cash", "bond", "gold", "equity"];
const START_VALUE = 100000;

/**
 * Historical replay (Section 2.5.2): V_t = V_{t-1} (1 + sum_c w_c r_{c,t}).
 * Addition: it can start from the client's own amount, and it carries the
 * episode's real-world events for the animated replay.
 */
export function runReplay(episodeId: string, tier: number, startValue: number = START_VALUE): ReplayResult {
  const episode = findEpisode(episodeId);
  if (!episode) throw new Error("NOT_FOUND");
  const weights = MODEL_PORTFOLIOS[tier] ?? MODEL_PORTFOLIOS[3];
  const rows = historySlice(episode.start, episode.end);

  let value = startValue;
  let peak = startValue;
  let maxDrawdown = 0;
  let lowestMonth = episode.start;
  let lowestValue = startValue;
  const series: ReplayPoint[] = [];

  for (const row of rows) {
    const r = CLASSES.reduce((acc, c) => acc + (weights[c] / 100) * row[c], 0);
    value = value * (1 + r);
    series.push({ month: row.month, value: Math.round(value * 100) / 100 });
    peak = Math.max(peak, value);
    const dd = (peak - value) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
    if (value < lowestValue) {
      lowestValue = value;
      lowestMonth = row.month;
    }
  }

  return {
    episode,
    tier,
    weights_pct: { ...weights },
    start_value: Math.round(startValue * 100) / 100,
    series,
    max_drawdown_pct: Math.round(maxDrawdown * 1000) / 10,
    lowest_month: lowestMonth,
    end_value: Math.round(value * 100) / 100,
    data_label: HISTORY_DATA_LABEL,
    data_as_of: HISTORY_DATA_AS_OF,
    events: EPISODE_EVENTS[episode.id] ?? [],
    events_label: EVENTS_LABEL,
  };
}
