import type { Question, Questionnaire } from "@/lib/types";

/** Internal shape: the public Question plus each option's points, which the API never exposes. */
export type ScoredQuestion = Omit<Question, "options"> & { options: { id: string; label: string; points: number }[] };

/**
 * The 10-question questionnaire (Section 2.5.2): 5 capacity (C1-C5),
 * 5 willingness (W1-W5). Points are internal only — the public endpoint
 * (GET /profile/questionnaire) strips them via toPublicQuestionnaire().
 */

export const QUESTIONNAIRE_VERSION = "q-2026-10";

export const QUESTIONS: ScoredQuestion[] = [
  {
    id: "C1",
    group: "capacity",
    text: "Your age",
    options: [
      { id: "a", label: "Under 30", points: 4 },
      { id: "b", label: "30–44", points: 3 },
      { id: "c", label: "45–59", points: 2 },
      { id: "d", label: "60 or over", points: 1 },
    ],
  },
  {
    id: "C2",
    group: "capacity",
    text: "How long can you leave this money invested?",
    options: [
      { id: "a", label: "Under 1 year", points: 0 },
      { id: "b", label: "1–3 years", points: 1 },
      { id: "c", label: "3–5 years", points: 2 },
      { id: "d", label: "5–10 years", points: 3 },
      { id: "e", label: "Over 10 years", points: 4 },
    ],
  },
  {
    id: "C3",
    group: "capacity",
    text: "Your income",
    options: [
      { id: "a", label: "No regular income", points: 0 },
      { id: "b", label: "Irregular", points: 1 },
      { id: "c", label: "Stable", points: 3 },
      { id: "d", label: "Stable and growing", points: 4 },
    ],
  },
  {
    id: "C4",
    group: "capacity",
    text: "Emergency savings outside this investment",
    options: [
      { id: "a", label: "Under 1 month of expenses", points: 0 },
      { id: "b", label: "1–3 months", points: 1 },
      { id: "c", label: "3–6 months", points: 3 },
      { id: "d", label: "Over 6 months", points: 4 },
    ],
  },
  {
    id: "C5",
    group: "capacity",
    text: "This investment as a share of all your financial assets",
    options: [
      { id: "a", label: "Over 75%", points: 0 },
      { id: "b", label: "50–75%", points: 1 },
      { id: "c", label: "25–50%", points: 3 },
      { id: "d", label: "Under 25%", points: 4 },
    ],
  },
  {
    id: "W1",
    group: "willingness",
    text: "If your investment fell 20% in one year, you would…",
    options: [
      { id: "a", label: "Sell everything", points: 0 },
      { id: "b", label: "Sell some", points: 1 },
      { id: "c", label: "Hold", points: 3 },
      { id: "d", label: "Buy more", points: 4 },
    ],
  },
  {
    id: "W2",
    group: "willingness",
    text: "Your investing experience",
    options: [
      { id: "a", label: "None", points: 0 },
      { id: "b", label: "Deposits only", points: 1 },
      { id: "c", label: "Funds", points: 3 },
      { id: "d", label: "Funds or stocks for 3+ years", points: 4 },
    ],
  },
  {
    id: "W3",
    group: "willingness",
    text: "Your main goal",
    options: [
      { id: "a", label: "Protect my money", points: 0 },
      { id: "b", label: "Steady income", points: 1 },
      { id: "c", label: "Balanced growth", points: 3 },
      { id: "d", label: "Maximum growth", points: 4 },
    ],
  },
  {
    id: "W4",
    group: "willingness",
    text: "The largest one-year loss you could accept",
    options: [
      { id: "a", label: "Up to 5%", points: 0 },
      { id: "b", label: "Up to 10%", points: 1 },
      { id: "c", label: "Up to 20%", points: 3 },
      { id: "d", label: "More than 20%", points: 4 },
    ],
  },
  {
    id: "W5",
    group: "willingness",
    text: "Which do you prefer?",
    options: [
      { id: "a", label: "Low but steady returns", points: 0 },
      { id: "b", label: "Mostly safe, a little growth", points: 1 },
      { id: "c", label: "Balanced", points: 3 },
      { id: "d", label: "High risk for high return", points: 4 },
    ],
  },
];

/** The answer to W4 sets the client's maximum acceptable loss (Section 2.5.2). */
export const MAX_ACCEPTABLE_LOSS_PCT: Record<string, number> = {
  a: 5,
  b: 10,
  c: 20,
  d: 30,
};

export function toPublicQuestionnaire(): Questionnaire {
  return {
    version: QUESTIONNAIRE_VERSION,
    questions: QUESTIONS.map((q) => ({
      ...q,
      options: q.options.map(({ id, label }) => ({ id, label })),
    })),
  };
}

export function findQuestion(id: string): ScoredQuestion | undefined {
  return QUESTIONS.find((q) => q.id === id);
}
