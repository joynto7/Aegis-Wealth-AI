import type { AssetClass, Goal, Insight, Insights, PortfolioAnalytics, Projection, ProjectionRequest, Proposal } from "@/lib/types";
import { db, logAction } from "@/mocks/db";
import { buildAllocation } from "@/mocks/engines/allocation";
import { computeMetrics } from "@/mocks/engines/metrics";
import { computeStress } from "@/mocks/engines/stress";
import { PROJECTION_LABEL, PROJECTION_METHOD, project } from "@/mocks/engines/projection";
import { round1, round2, roundHalf } from "@/mocks/engines/numbers";
import { findProduct } from "@/mocks/data/products";
import { findRule } from "@/mocks/data/rules";
import { findEpisode } from "@/mocks/data/replayEpisodes";
import { ASSUMPTIONS } from "@/mocks/data/scenarios";
import { HISTORY_DATA_AS_OF, HISTORY_DATA_LABEL } from "@/mocks/data/history";
import { tierLabel } from "@/lib/labels";

/**
 * Planning, a port of backend/app/services/planning.py: goal projections (of a proposal, the live portfolio or
 * a tier's mix, with every tier compared), the saved goal, the dashboard briefing and live-portfolio analytics.
 * Computed by code from the mock engines; nothing is written by a model.
 */
const MIX_REFERENCE_AMOUNT = 100_000;
const DEFAULT_AMOUNT = 100_000;
const DEFAULT_HORIZON = 10;
const CLASSES: AssetClass[] = ["cash", "bond", "gold", "equity"];
const REACTIONS: Record<string, string> = { hold: "Hold", buy_more: "Buy more", sell_some: "Sell some", sell_all: "Sell everything" };
export const INSIGHT_SOURCE = "Computed by code from your own data; not written by the AI.";

export class PlanningError extends Error {
  constructor(
    public status: number,
    public code: "PROFILE_REQUIRED" | "VALIDATION_ERROR" | "NOT_FOUND" | "FORBIDDEN",
    message: string,
    public fields?: { field: string; problem: string }[]
  ) {
    super(message);
  }
}

const g = (n: number) => String(Number(n.toPrecision(6)));
/** "CNY 1,234", rounded half away from zero, as the backend's format_money. */
const money = (v: number) => `CNY ${roundHalf(v, 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/** The latest proposal that is still open or executed (the backend's proposals.latest_open). */
export function latestOpen(userId: number): Proposal | undefined {
  return [...db.proposalsFor(userId)].reverse().find((p) => p.status !== "superseded");
}

export function tierMix(tier: number, amount: number, horizonYears: number): [Record<AssetClass, number>, number] {
  const alloc = buildAllocation(tier, Math.max(amount, MIX_REFERENCE_AMOUNT), horizonYears, 0);
  return [{ ...alloc.class_weights_pct }, computeMetrics(alloc.items).weighted_fee_pct];
}

export function accountMix(userId: number) {
  const sandbox = db.sandboxFor(userId);
  const positions = db.positionsFor(userId);
  const total = round2(sandbox.cash + positions.reduce((s, p) => s + p.value, 0));
  const values: Record<AssetClass, number> = { cash: sandbox.cash, bond: 0, gold: 0, equity: 0 };
  let fee = 0;
  for (const pos of positions) {
    values[pos.asset_class] += pos.value;
    fee += pos.value * (findProduct(pos.product_code)?.annual_fee_pct ?? 0);
  }
  if (total <= 0) return { weights: { cash: 100, bond: 0, gold: 0, equity: 0 }, fee: 0, total, cash: sandbox.cash, positions };
  const weights = Object.fromEntries(CLASSES.map((c) => [c, round2((values[c] / total) * 100)])) as Record<AssetClass, number>;
  return { weights, fee: round2(fee / total), total, cash: sandbox.cash, positions };
}

export function projectionFor(userId: number, body: Partial<ProjectionRequest>): Projection {
  const profile = db.currentProfile(userId);
  const clientTier = profile?.tier ?? null;
  const kind = body.basis ?? "tier";
  const monthly = Number(body.monthly_contribution ?? 0);
  const target = body.target_amount ?? null;
  let weights: Record<AssetClass, number>;
  let fee: number;
  let amount: number;
  let horizon: number;
  let label: string;
  let proposalId: number | null = null;
  let tier: number | null = null;

  if (kind === "proposal") {
    if (body.proposal_id === null || body.proposal_id === undefined) {
      throw new PlanningError(422, "VALIDATION_ERROR", "Choose a proposal.", [{ field: "proposal_id", problem: "required for basis proposal" }]);
    }
    const proposal = db.findProposal(userId, Number(body.proposal_id));
    if (!proposal) throw new PlanningError(404, "NOT_FOUND", "There is no proposal with this id.");
    weights = { ...proposal.class_weights_pct };
    fee = proposal.metrics.weighted_fee_pct;
    amount = body.amount ?? proposal.amount;
    horizon = body.horizon_years ?? proposal.horizon_years;
    proposalId = proposal.id;
    tier = proposal.tier;
    label = `Proposal #${proposal.id} (version ${proposal.version})`;
  } else if (kind === "account") {
    const mix = accountMix(userId);
    weights = mix.weights;
    fee = mix.fee;
    amount = body.amount ?? mix.total;
    horizon = body.horizon_years ?? DEFAULT_HORIZON;
    label = "Your sandbox portfolio";
  } else {
    tier = Number(body.tier ?? clientTier ?? 0);
    if (tier < 1) throw new PlanningError(409, "PROFILE_REQUIRED", "Complete your risk profile first, or choose a tier.");
    amount = body.amount ?? DEFAULT_AMOUNT;
    horizon = body.horizon_years ?? DEFAULT_HORIZON;
    [weights, fee] = tierMix(tier, amount, horizon);
    label = `Tier ${tier} (${tierLabel(tier)}) mix`;
  }
  if (amount + monthly <= 0) {
    throw new PlanningError(422, "VALIDATION_ERROR", "Enter a starting amount or a monthly contribution.", [
      { field: "amount", problem: "amount and monthly_contribution are both 0" },
    ]);
  }

  const core = project(weights, fee, { amount, horizonYears: horizon, monthly, target });
  const tiers =
    body.compare_tiers === false
      ? []
      : [1, 2, 3, 4, 5].map((t) => {
          const [tw, tf] = tierMix(t, amount, horizon);
          const r = project(tw, tf, { amount, horizonYears: horizon, monthly, target });
          return {
            tier: t,
            label: tierLabel(t),
            suitable: clientTier !== null && t <= clientTier,
            class_weights_pct: tw,
            weighted_fee_pct: tf,
            probability_target_pct: r.probability_target_pct,
            p10_end: r.end.p10,
            p50_end: r.end.p50,
            p90_end: r.end.p90,
          };
        });

  return {
    basis: { kind, label, proposal_id: proposalId, tier },
    amount: round2(amount),
    horizon_years: horizon,
    monthly_contribution: round2(monthly),
    target_amount: target !== null ? round2(target) : null,
    class_weights_pct: weights,
    weighted_fee_pct: fee,
    method: PROJECTION_METHOD,
    ...core,
    tiers,
    client_tier: clientTier,
    data_label: PROJECTION_LABEL,
    history_label: `${HISTORY_DATA_LABEL} monthly history, as of ${HISTORY_DATA_AS_OF}`,
  };
}

export function setGoal(userId: number, body: { name: string; target_amount: number; horizon_years: number; monthly_contribution?: number }): Goal {
  const goal: Goal = {
    id: db.nextId("goal"),
    name: body.name.trim(),
    target_amount: round2(body.target_amount),
    horizon_years: body.horizon_years,
    monthly_contribution: round2(body.monthly_contribution ?? 0),
    created_at: new Date().toISOString(),
  };
  db.addGoal(userId, goal);
  logAction({
    userId,
    actor: "client",
    action: "goal_set",
    decision: "allowed",
    detail: { goal_id: goal.id, target_amount: goal.target_amount, horizon_years: goal.horizon_years },
  });
  return goal;
}

export function analyticsFor(userId: number): PortfolioAnalytics {
  const mix = accountMix(userId);
  const largest = Math.max(0, ...mix.positions.map((p) => p.value));
  return {
    total_value: mix.total,
    cash: round2(mix.cash),
    invested: round2(mix.total - mix.cash),
    class_weights_pct: mix.weights,
    weighted_fee_pct: mix.fee,
    largest_position_pct: mix.total > 0 ? round1((largest / mix.total) * 100) : 0,
    positions: mix.positions.length,
    stress: computeStress(mix.weights, mix.total),
    data_label: "Simulated; stress results are hypothetical",
  };
}

function insight(
  id: string,
  tone: Insight["tone"],
  title: string,
  body: string,
  figure: string | null = null,
  figure_label: string | null = null,
  href: string | null = null,
  action: string | null = null
): Insight {
  return { id, tone, title, body, figure, figure_label, href, action };
}

export function insightsFor(userId: number): Insights {
  const profile = db.currentProfile(userId);
  const proposal = latestOpen(userId);
  const mix = accountMix(userId);
  const goal = db.currentGoal(userId);
  const items: Insight[] = [];

  if (goal && (proposal || mix.positions.length)) {
    const result = projectionFor(userId, {
      ...(proposal && proposal.status !== "executed" ? { basis: "proposal", proposal_id: proposal.id } : { basis: "account" }),
      horizon_years: goal.horizon_years,
      monthly_contribution: goal.monthly_contribution,
      target_amount: goal.target_amount,
      compare_tiers: false,
    });
    const p = result.probability_target_pct ?? 0;
    const tone = p >= 75 ? "positive" : p >= 50 ? "info" : "attention";
    const monthly = goal.monthly_contribution ? ` and ${money(goal.monthly_contribution)} a month` : "";
    items.push(
      insight(
        "goal",
        tone,
        `Goal: ${goal.name}`,
        `A ${g(p)}% chance of reaching ${money(goal.target_amount)} in ${goal.horizon_years} years with ${result.basis.label.toLowerCase()}${monthly}, in 1,000 illustrative paths.`,
        `${g(p)}%`,
        "chance of reaching it",
        "/planner",
        "Open the planner"
      )
    );
  }

  if (proposal) {
    const { amount, horizon_years: horizon, metrics } = proposal;
    const w = proposal.class_weights_pct;
    const gross = CLASSES.reduce((s, c) => s + (w[c] / 100) * ASSUMPTIONS[c], 0);
    const f = metrics.weighted_fee_pct / 100;
    const cost = round2(amount * (1 + gross) ** horizon - amount * (1 + gross - f) ** horizon);
    const href = `/proposals/${proposal.id}`;
    items.push(
      insight(
        "fees",
        metrics.weighted_fee_pct <= 0.5 ? "positive" : "info",
        `Fees over ${horizon} years`,
        `At ${metrics.weighted_fee_pct.toFixed(2)}% a year, fees take about ${money(cost)} from proposal #${proposal.id} over ${horizon} years, at the illustrative returns.`,
        money(cost),
        "total fees",
        href,
        "See the proposal"
      )
    );
    const need = proposal.near_term_need;
    if (need > 0) {
      const available = round2((metrics.liquid_share_pct / 100) * amount);
      const cover = available / need;
      items.push(
        insight(
          "liquidity",
          cover >= 1 ? "positive" : "attention",
          "Cash for your near-term need",
          `${money(available)} can be withdrawn within a day: ${cover.toFixed(1)} times the ${money(need)} you need within 2 years.`,
          `${cover.toFixed(1)}×`,
          "need covered",
          href,
          "See the proposal"
        )
      );
    }
    if (profile) {
      const worst = proposal.stress.reduce((m, s) => (s.loss_pct < m.loss_pct ? s : m), proposal.stress[0]);
      const loss = Math.abs(worst.loss_pct);
      const limit = profile.max_acceptable_loss_pct;
      const within = loss <= limit;
      items.push(
        insight(
          "stress",
          within ? "positive" : "attention",
          `In a ${worst.name.toLowerCase()}`,
          `This hypothetical scenario would cost ${money(Math.abs(worst.loss_cny))} (${loss.toFixed(2)}%), ${within ? "within" : "beyond"} the ${g(limit)}% fall you said you could accept.`,
          `−${loss.toFixed(2)}%`,
          "worst hypothetical loss",
          href,
          "See the stress test"
        )
      );
      const used: [string, number, string][] = [
        ["R-03", metrics.largest_weight_pct / 40, `${g(metrics.largest_weight_pct)}% in one product against a limit of 40%`],
        ["R-07", metrics.weighted_fee_pct / 1, `a ${metrics.weighted_fee_pct.toFixed(2)}% fee against a limit of 1.00%`],
        ["R-08", limit ? metrics.max_drawdown_pct / limit : 0, `a ${g(metrics.max_drawdown_pct)}% historical fall against your ${g(limit)}%`],
        ["R-09", limit ? loss / limit : 0, `a ${loss.toFixed(2)}% stress loss against your ${g(limit)}%`],
      ];
      const [ruleId, ratio, words] = used.reduce((best, u) => (u[1] > best[1] ? u : best), used[0]);
      const over = ratio > 1;
      items.push(
        insight(
          "margin",
          ratio >= 0.8 ? "attention" : "positive",
          over ? "Over a rule's limit" : ratio >= 0.8 ? "Closest rule to its limit" : "Every rule has room",
          `${findRule(ruleId)?.name ?? ruleId} (${ruleId}) is ${over ? "over its limit" : "the closest"}: ${words}.`,
          `${g(round1(ratio * 100))}%`,
          `of the ${ruleId} limit used`,
          href,
          "See the gate"
        )
      );
    }
  }

  if (profile?.replay) {
    const episode = findEpisode(profile.replay.episode_id);
    items.push(
      insight(
        "replay",
        "info",
        "What the crisis replay taught",
        `In ${episode?.name ?? profile.replay.episode_id} you chose '${REACTIONS[profile.replay.reaction] ?? profile.replay.reaction}'. ` +
          (profile.replay_adjustment > 0
            ? "Selling at the bottom lowered your tier by one, so your mix takes less risk."
            : "Your tier stayed where the questionnaire set it."),
        null,
        null,
        "/profile/replay",
        "Replay another crisis"
      )
    );
  }

  const executed = proposal?.status === "executed";
  if (mix.total > 0 && mix.cash / mix.total >= 0.5 && !executed) {
    items.push(
      insight(
        "cash",
        "info",
        "Cash not yet invested",
        `${money(mix.cash)} of your sandbox is cash. A proposal shows how the engine would invest it for your tier; nothing is bought until you confirm.`,
        money(mix.cash),
        "uninvested cash",
        "/proposals/new",
        "Build a proposal"
      )
    );
  }
  return { items, source: INSIGHT_SOURCE, generated_at: new Date().toISOString() };
}
