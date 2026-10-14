import { QUESTIONS } from "@/mocks/data/questionnaire";
import { TIER_LABELS } from "@/mocks/data/modelPortfolios";

/**
 * Risk-profile scoring (Section 2.5.2). Pure, deterministic, no randomness.
 */

export type Answers = Record<string, string>; // question id -> option id

function groupScore(answers: Answers, group: "capacity" | "willingness"): number {
  const questions = QUESTIONS.filter((q) => q.group === group);
  let points = 0;
  for (const q of questions) {
    const chosen = answers[q.id];
    const option = q.options.find((o) => o.id === chosen);
    points += option?.points ?? 0;
  }
  // score = points / 20 * 100, always a multiple of 5
  return (points / 20) * 100;
}

export function tierFromScore(score: number): number {
  if (score <= 20) return 1;
  if (score <= 40) return 2;
  if (score <= 60) return 3;
  if (score <= 80) return 4;
  return 5;
}

export function tierLabel(tier: number): string {
  return TIER_LABELS[tier] ?? "Unknown";
}

export interface ScoreResult {
  capacity_score: number;
  willingness_score: number;
  capacity_tier: number;
  willingness_tier: number;
}

export function scoreQuestionnaire(answers: Answers): ScoreResult {
  const capacity_score = groupScore(answers, "capacity");
  const willingness_score = groupScore(answers, "willingness");
  return {
    capacity_score,
    willingness_score,
    capacity_tier: tierFromScore(capacity_score),
    willingness_tier: tierFromScore(willingness_score),
  };
}

/** T = min(T_cap, max(1, T_will - replay_adjustment)) */
export function computeTier(capacityTier: number, willingnessTier: number, replayAdjustment: number): number {
  return Math.min(capacityTier, Math.max(1, willingnessTier - replayAdjustment));
}
