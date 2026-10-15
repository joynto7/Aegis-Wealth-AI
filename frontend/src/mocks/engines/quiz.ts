import type { Proposal, QuizQuestion, QuizResult } from "@/lib/types";
import { formatMoney } from "@/lib/format";

/**
 * Comprehension quiz (Section 2.5.9). Three questions built from the
 * proposal itself; option order rotates by proposal_id mod 3 so it stays
 * deterministic but isn't always in the same place.
 */

interface BuiltOption {
  label: string;
  correct: boolean;
  /** Why this option is right or wrong, shown after a failed attempt. */
  why: string;
}

function rotate<T>(arr: T[], by: number): T[] {
  const n = arr.length;
  const shift = ((by % n) + n) % n;
  return [...arr.slice(shift), ...arr.slice(0, shift)];
}

function buildCanonical(proposal: Proposal): Record<"Q1" | "Q2" | "Q3", BuiltOption[]> {
  const worst = proposal.stress.reduce((min, s) => (s.loss_cny < min.loss_cny ? s : min), proposal.stress[0]);
  const worstLossAbs = Math.abs(worst?.loss_cny ?? 0);
  const withdrawable = (proposal.metrics.liquid_share_pct / 100) * proposal.amount;

  return {
    Q1: [
      {
        label: formatMoney(worstLossAbs),
        correct: true,
        why: `${formatMoney(worstLossAbs)} is the worst loss across the three stress scenarios (${worst?.name ?? "worst case"}).`,
      },
      {
        label: "CNY 0, losses are not possible",
        correct: false,
        why: "Losses are possible: every stress scenario shows this mix losing value.",
      },
      {
        label: formatMoney(worstLossAbs / 2),
        correct: false,
        why: "That is only half of the worst stress-scenario loss.",
      },
    ],
    Q2: [
      {
        label: "The value can go down as well as up.",
        correct: true,
        why: "Investments can fall as well as rise; nothing here is guaranteed.",
      },
      {
        label: "Returns are fixed in advance.",
        correct: false,
        why: "No return is fixed: the figures shown are history or hypothetical scenarios, not promises.",
      },
      {
        label: "The sandbox cannot lose value.",
        correct: false,
        why: "Sandbox positions are valued at NAV, so they can lose value like real ones.",
      },
    ],
    Q3: [
      {
        label: formatMoney(withdrawable),
        correct: true,
        why: `Only the liquid share (${proposal.metrics.liquid_share_pct}% of the amount) can be withdrawn within 1 day.`,
      },
      {
        label: formatMoney(proposal.amount),
        correct: false,
        why: "Not all of it: some products take more than 1 day to sell or are locked up.",
      },
      {
        label: "CNY 0",
        correct: false,
        why: `The liquid share (${proposal.metrics.liquid_share_pct}% of the amount) can be withdrawn within 1 day.`,
      },
    ],
  };
}

const QUESTION_TEXT: Record<"Q1" | "Q2" | "Q3", string> = {
  Q1: "What is the largest hypothetical loss in the stress tests?",
  Q2: "Which statement is true?",
  Q3: "How much can you withdraw within 1 day?",
};

function optionsForProposal(proposal: Proposal) {
  const canonical = buildCanonical(proposal);
  const rotation = proposal.id % 3;
  const built: Record<"Q1" | "Q2" | "Q3", { id: string; label: string; correct: boolean; why: string }[]> =
    {} as never;
  (Object.keys(canonical) as ("Q1" | "Q2" | "Q3")[]).forEach((qid) => {
    const rotated = rotate(canonical[qid], rotation);
    built[qid] = rotated.map((opt, idx) => ({ id: String(idx + 1), ...opt }));
  });
  return built;
}

export function buildQuiz(proposal: Proposal): QuizQuestion[] {
  const built = optionsForProposal(proposal);
  return (["Q1", "Q2", "Q3"] as const).map((qid) => ({
    id: qid,
    text: QUESTION_TEXT[qid],
    options: built[qid].map(({ id, label }) => ({ id, label })),
  }));
}

export function checkQuiz(proposal: Proposal, answers: Record<string, string>): QuizResult {
  const built = optionsForProposal(proposal);
  const results = (["Q1", "Q2", "Q3"] as const).map((qid) => {
    const chosen = answers[qid];
    const option = built[qid].find((o) => o.id === chosen);
    const correctOption = built[qid].find((o) => o.correct)!;
    const correct = !!option?.correct;
    const explanation = correct
      ? "Correct."
      : `${option ? `Not quite: ${option.why} ` : "No answer chosen. "}The right answer is ${correctOption.label}: ${correctOption.why}`;
    return { id: qid, correct, explanation };
  });
  return { passed: results.every((r) => r.correct), results };
}
