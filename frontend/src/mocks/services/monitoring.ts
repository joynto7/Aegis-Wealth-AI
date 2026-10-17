import type {
  Alert,
  AssetClass,
  ClientMonitoring,
  GateResult,
  Insight,
  LiveRuleFailure,
  MarketState,
  MonitoringOverview,
  OpenRebalance,
  PortfolioMonitoring,
  Profile,
  Proposal,
  ProposalItem,
} from "@/lib/types";
import { db, logAction, type RebalanceRow } from "@/mocks/db";
import { findProduct } from "@/mocks/data/products";
import { findRule } from "@/mocks/data/rules";
import { SEED_USERS } from "@/mocks/data/users";
import { HISTORY_MONTHLY } from "@/mocks/data/history";
import { MARKET, appliedMonth, describe, marketDate, replayStart } from "@/mocks/engines/market";
import { measureDrift, type DriftResult, type Holding, type TargetItem } from "@/mocks/engines/drift";
import { planTrades, type RebalancePlanResult, type Trade } from "@/mocks/engines/rebalance";
import { computeMetrics } from "@/mocks/engines/metrics";
import { computeStress } from "@/mocks/engines/stress";
import { evaluateGate } from "@/mocks/engines/gate";
import { round2, round4, roundHalf } from "@/mocks/engines/numbers";
import { createVersion, reviseProposal } from "@/mocks/services/proposals";

/**
 * The monitoring loop, a port of backend/app/services/market.py and services/monitoring.py: the simulated market
 * clock (compliance only), drift of each client's live portfolio against their latest executed proposal, the
 * Control Room alerts and the briefing insight, and rebalancing proposals that go through the gate and the client's
 * own Confirm. A rebalancing is priced at one market month and one set of holdings; once either changes it can no
 * longer be revised, confirmed or executed.
 */

export const BAND_PP = 5; // backend/data/rules.json thresholds.drift_band_pp
const OPEN_STATUSES: Proposal["status"][] = ["rejected", "warning", "acknowledged", "passed"];
const DATA_LABEL = "Simulated prices from the illustrative history; gate and stress results are hypothetical";
export const STALE = "Prices or holdings have changed since this rebalancing was priced. Propose a fresh one from your account.";
const NOTHING_TO_TRADE = "Your holdings already match the mix you agreed to: there is nothing to trade.";
export const POLICY =
  "Aegis never rebalances on its own. Drift raises an alert here and a briefing for the client; the client, or the advisor at tier T2, proposes a rebalancing; the gate checks it against the client's current tier; and only the client's quiz, Confirm click and one-time token execute it.";

export class MonitoringError extends Error {
  constructor(
    public status: number,
    public code: "STATE_CONFLICT" | "VALIDATION_ERROR",
    message: string
  ) {
    super(message);
  }
}

const g = (n: number) => String(Number(n.toPrecision(6)));
const signed = (n: number) => (n > 0 ? `+${g(n)}` : g(n));
const money = (v: number) => `CNY ${roundHalf(v, 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const moneyCents = (v: number) =>
  `CNY ${roundHalf(v, 2).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// --- the clock -------------------------------------------------------------------------------
export function marketState(forCompliance: boolean): MarketState {
  const row = db.market;
  return {
    ...describe(row?.month ?? 0),
    start_date: MARKET.start_date,
    replay_from: MARKET.replay_from,
    max_months_per_advance: MARKET.max_months_per_advance,
    changed_at: row?.changedAt ?? null,
    changed_by: forCompliance && row ? row.changedBy : null,
    reason: forCompliance && row ? row.reason : null,
    data_label: `${MARKET.data_label}: replays the synthetic monthly history; not a forecast`,
    note: MARKET.note,
  };
}

export function advanceMarket(officer: { id: number; display_name: string }, months: number, reason: string): MarketState {
  const before = db.marketMonth();
  const after = before + months;
  db.market = { month: after, reason, changedBy: officer.display_name, changedAt: new Date().toISOString() };
  const start = replayStart();
  const replayed = Array.from({ length: months }, (_, i) => appliedMonth(HISTORY_MONTHLY, start, before + i + 1).month);
  const moved = describe(after);
  logAction({
    userId: officer.id,
    actor: "compliance",
    action: "market_advanced",
    decision: "allowed",
    detail: { from_month: before, to_month: after, as_of: moved.as_of, replayed, since_start_pct: moved.since_start_pct, reason },
  });
  return marketState(true);
}

// --- inputs ------------------------------------------------------------------------------------
/** The latest executed proposal: the mix the client last agreed to. */
export function targetProposal(userId: number): Proposal | undefined {
  return [...db.proposalsFor(userId)].reverse().find((p) => p.status === "executed");
}

export function holdingsFor(userId: number): { held: Holding[]; cash: number } {
  const sandbox = db.sandboxFor(userId);
  const navs = db.navs();
  const held: Holding[] = [];
  for (const [code, pos] of sandbox.positions.entries()) {
    const product = findProduct(code);
    if (!product || pos.units <= 0) continue;
    held.push({ product_code: code, name: product.name, asset_class: product.asset_class, units: round4(pos.units), value: round2(pos.units * navs[code]) });
  }
  return { held, cash: sandbox.cash };
}

function holdingsKey(held: Holding[]): string {
  return JSON.stringify(held.map((h) => [h.product_code, h.units]).sort());
}

function targetItems(proposal: Proposal): TargetItem[] {
  return proposal.items.map((i) => ({ product_code: i.product_code, name: i.name, asset_class: i.asset_class, weight_pct: i.weight_pct }));
}

/** The full gate on the live weights, with today's profile and the target's horizon and near-term need. */
function liveGate(held: Holding[], target: Proposal, profile: Profile): GateResult {
  const total = held.reduce((s, h) => s + h.value, 0);
  const items: ProposalItem[] = held.map((h) => ({
    product_code: h.product_code,
    name: h.name,
    asset_class: h.asset_class,
    risk_level: findProduct(h.product_code)!.risk_level,
    weight_pct: (h.value / total) * 100,
    amount: h.value,
    rationale: "",
  }));
  const weights: Record<AssetClass, number> = { cash: 0, bond: 0, gold: 0, equity: 0 };
  for (const i of items) weights[i.asset_class] += i.weight_pct;
  return evaluateGate({
    items,
    classWeightsPct: weights,
    metrics: computeMetrics(items),
    stress: computeStress(weights, total),
    tier: profile.tier,
    amount: total,
    horizonYears: target.horizon_years,
    nearTermNeed: target.near_term_need,
    maxAcceptableLossPct: profile.max_acceptable_loss_pct,
  });
}

interface Assessment {
  target: Proposal;
  held: Holding[];
  cash: number;
  drift: DriftResult;
  gate: GateResult | null;
  failing: LiveRuleFailure[];
  status: "on_target" | "drifted" | "rule_breach";
}

export function assess(userId: number): Assessment | null {
  const target = targetProposal(userId);
  const { held, cash } = holdingsFor(userId);
  if (!target || !held.length) return null;
  const drift = measureDrift(held, targetItems(target), BAND_PP);
  const profile = db.currentProfile(userId);
  const gate = profile ? liveGate(held, target, profile) : null;
  const atConfirm = new Set(target.gate.rules.filter((r) => r.result === "fail").map((r) => r.id));
  const failing: LiveRuleFailure[] = (gate?.rules ?? [])
    .filter((r) => r.result === "fail")
    .map((r) => ({ id: r.id, name: findRule(r.id)?.name ?? r.id, type: r.type, message: r.message, detail: r.detail, new: !atConfirm.has(r.id) }));
  const status = failing.some((f) => f.type === "hard")
    ? "rule_breach"
    : drift.outside_band || failing.some((f) => f.new)
      ? "drifted"
      : "on_target";
  return { target, held, cash, drift, gate, failing, status };
}

// --- rebalancing proposals ---------------------------------------------------------------------
export function isStale(row: RebalanceRow, userId: number): boolean {
  return row.market_month !== db.marketMonth() || row.holdings_key !== holdingsKey(holdingsFor(userId).held);
}

/** The client's latest rebalancing proposal that is still open. */
export function openRebalance(userId: number): Proposal | undefined {
  return [...db.proposalsFor(userId)].reverse().find((p) => OPEN_STATUSES.includes(p.status) && db.rebalances.has(p.id));
}

function openSummary(userId: number): OpenRebalance | null {
  const p = openRebalance(userId);
  if (!p) return null;
  return { proposal_id: p.id, version: p.version, status: p.status, gate_decision: p.gate.decision, stale: isStale(db.rebalances.get(p.id)!, userId) };
}

/** A proposal as the API returns it: with its rebalancing block, whose staleness is worked out now. */
export function present(proposal: Proposal, userId: number): Proposal {
  const row = db.rebalances.get(proposal.id);
  if (!row) return proposal;
  return {
    ...proposal,
    rebalance: {
      source_proposal_id: row.source_proposal_id,
      market_month: row.market_month,
      market_as_of: marketDate(MARKET.start_date, row.market_month),
      portfolio_value: row.portfolio_value,
      trades: row.trades,
      ...row.totals,
      drift_before: row.drift.classes,
      band_pp: row.drift.band_pp ?? BAND_PP,
      stale: OPEN_STATUSES.includes(proposal.status) && isStale(row, userId),
    },
  };
}

/** The STATE_CONFLICT message when a rebalancing was priced before the market moved or the holdings changed. */
export function staleError(proposal: Proposal, userId: number): string | null {
  const row = db.rebalances.get(proposal.id);
  return row && isStale(row, userId) ? STALE : null;
}

function tradeWords(trade: Trade | undefined): string {
  if (!trade) return "no trade needed";
  const units = trade.units.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return `${trade.side === "sell" ? "sells" : "buys"} ${units} units (${moneyCents(trade.amount)}) at NAV ${trade.nav.toFixed(4)}`;
}

function planRow(sourceId: number, held: Holding[], cash: number, items: TargetItem[]): { row: RebalanceRow; plan: RebalancePlanResult; drift: DriftResult } {
  const drift = measureDrift(held, items, BAND_PP);
  const plan = planTrades(held, items, { amount: drift.total_value, navs: db.navs(), cash });
  const row: RebalanceRow = {
    source_proposal_id: sourceId,
    market_month: db.marketMonth(),
    holdings_key: holdingsKey(held),
    portfolio_value: drift.total_value,
    trades: plan.trades,
    totals: { sell_total: plan.sell_total, buy_total: plan.buy_total, net_cash: plan.net_cash, turnover_pct: plan.turnover_pct },
    drift: { classes: drift.classes, largest: drift.largest, portfolio_drift_pct: drift.portfolio_drift_pct, outside_band: drift.outside_band, band_pp: drift.band_pp },
  };
  return { row, plan, drift };
}

/** Builds the trades back to target as the next version of the executed proposal; the gate runs on it. */
export function proposeRebalance(userId: number, profile: Profile, actor: "client" | "agent"): Proposal {
  const target = targetProposal(userId);
  const { held, cash } = holdingsFor(userId);
  if (!target || !held.length) throw new MonitoringError(409, "STATE_CONFLICT", "There is no executed portfolio to rebalance yet.");
  const existing = openRebalance(userId);
  if (existing && !isStale(db.rebalances.get(existing.id)!, userId)) return existing; // already priced at today's prices
  const { row, plan, drift } = planRow(target.id, held, cash, targetItems(target));
  if (!plan.trades.length) throw new MonitoringError(409, "STATE_CONFLICT", NOTHING_TO_TRADE);
  let replaced: number | null = null;
  if (existing) {
    existing.status = "superseded";
    replaced = existing.id;
  }
  const amount = drift.total_value;
  const byCode = new Map(plan.trades.map((t) => [t.product_code, t]));
  const items: ProposalItem[] = target.items.map((i) => ({
    product_code: i.product_code,
    name: i.name,
    asset_class: i.asset_class,
    risk_level: i.risk_level,
    weight_pct: i.weight_pct,
    amount: round2((i.weight_pct / 100) * amount),
    rationale: `Back to the ${g(i.weight_pct)}% you agreed to in proposal #${target.id}: ${tradeWords(byCode.get(i.product_code))}.`,
  }));
  const asOf = marketDate(MARKET.start_date, row.market_month);
  const proposal = createVersion({
    userId,
    profile,
    amount,
    horizonYears: target.horizon_years,
    nearTermNeed: target.near_term_need,
    items,
    notes: [
      `A rebalancing of proposal #${target.id} at the simulated prices of ${asOf}: it sells ${moneyCents(plan.sell_total)} and buys ${moneyCents(plan.buy_total)}. Nothing trades until you pass the quiz and confirm.`,
    ],
    parentId: target.id,
  });
  db.rebalances.set(proposal.id, row);
  logAction({
    userId,
    actor,
    action: "rebalance_proposed",
    tier: "T2",
    decision: "allowed",
    detail: {
      proposal_id: proposal.id,
      source_proposal_id: target.id,
      market_month: row.market_month,
      largest_drift: drift.largest,
      sell_total: plan.sell_total,
      buy_total: plan.buy_total,
      replaced,
    },
  });
  logAction({ userId, actor: "system", action: "gate_decided", decision: "allowed", detail: { proposal_id: proposal.id, decision: proposal.gate.decision } });
  return proposal;
}

/**
 * A revision, as reviseProposal does it, that keeps a rebalancing a rebalancing: refused once the rebalancing is
 * stale, and the new version gets trades for its own weights.
 */
export function reviseWithRebalance(
  userId: number,
  parent: Proposal,
  profile: Profile,
  rawItems: { product_code: string; weight_pct: number }[]
): { proposal?: Proposal; error?: string; stale?: boolean } {
  const stale = staleError(parent, userId);
  if (stale) return { error: stale, stale: true };
  const result = reviseProposal(userId, parent, profile, rawItems);
  const parentRow = db.rebalances.get(parent.id);
  if (!result.proposal || !parentRow) return result;
  const child = result.proposal;
  const { held, cash } = holdingsFor(userId);
  const { row, plan } = planRow(parentRow.source_proposal_id, held, cash, targetItems(child));
  db.rebalances.set(child.id, row);
  const byCode = new Map(plan.trades.map((t) => [t.product_code, t]));
  for (const item of child.items) {
    const change = /\s*Weight changed by (?:you|the advisor agent) from [\d.]+% to [\d.]+%\./.exec(item.rationale);
    item.rationale = `Rebalancing of proposal #${parentRow.source_proposal_id} to ${g(item.weight_pct)}%: ${tradeWords(byCode.get(item.product_code))}.${change ? change[0] : ""}`;
  }
  return result;
}

// --- views -------------------------------------------------------------------------------------
export function clientView(userId: number): PortfolioMonitoring {
  const view = assess(userId);
  const common = { market: marketState(false), band_pp: BAND_PP, data_label: DATA_LABEL };
  if (!view) {
    return {
      ...common,
      status: "none",
      target_proposal_id: null,
      target_version: null,
      total_value: 0,
      classes: [],
      products: [],
      largest: null,
      portfolio_drift_pct: 0,
      outside_band: false,
      live_gate: null,
      rules_failing: [],
      rebalance: null,
      open_rebalance: null,
    };
  }
  const { drift, target } = view;
  const preview = planTrades(view.held, targetItems(target), { amount: drift.total_value, navs: db.navs(), cash: view.cash });
  return {
    ...common,
    status: view.status,
    target_proposal_id: target.id,
    target_version: target.version,
    total_value: drift.total_value,
    classes: drift.classes,
    products: drift.products,
    largest: drift.largest,
    portfolio_drift_pct: drift.portfolio_drift_pct,
    outside_band: drift.outside_band,
    live_gate: view.gate?.decision ?? null,
    rules_failing: view.failing,
    rebalance: preview,
    open_rebalance: openSummary(userId),
  };
}

export function monitoringOverview(): MonitoringOverview {
  const clients: ClientMonitoring[] = [];
  for (const user of SEED_USERS.filter((u) => u.role === "client")) {
    const view = assess(user.id);
    if (!view) continue;
    clients.push({
      user_id: user.id,
      client: user.display_name,
      status: view.status,
      total_value: view.drift.total_value,
      target_proposal_id: view.target.id,
      largest: view.drift.largest,
      portfolio_drift_pct: view.drift.portfolio_drift_pct,
      outside_band: view.drift.outside_band,
      rules_failing: view.failing.map((f) => f.id),
      new_failures: view.failing.filter((f) => f.new).map((f) => f.id),
      open_rebalance: openSummary(user.id),
    });
  }
  const count = (status: string) => clients.filter((c) => c.status === status).length;
  return {
    market: marketState(true),
    band_pp: BAND_PP,
    clients,
    counts: { on_target: count("on_target"), drifted: count("drifted"), rule_breach: count("rule_breach") },
    policy: POLICY,
  };
}

/** One Control Room alert per client whose live portfolio broke a rule (high) or drifted beyond the band (medium). */
export function monitoringAlerts(): Alert[] {
  const out: Alert[] = [];
  for (const user of SEED_USERS.filter((u) => u.role === "client")) {
    const view = assess(user.id);
    if (!view || view.status === "on_target") continue;
    const state = marketState(false);
    const cls = view.drift.classes.find((c) => c.asset_class === view.drift.largest.asset_class)!;
    const moved = `${capitalize(cls.asset_class)} is ${g(cls.current_pct)}% against a ${g(cls.target_pct)}% target (${signed(cls.drift_pp)} points; the band is ${g(BAND_PP)}).`;
    const pending = openRebalance(user.id);
    const follow = pending ? ` Rebalancing proposal #${pending.id} is waiting for the client.` : " No rebalancing has been proposed yet.";
    const hard = view.failing.filter((f) => f.type === "hard");
    if (hard.length) {
      out.push({
        id: `drift-${user.id}`,
        severity: "high",
        title: "A live portfolio now breaks a rule",
        detail: `Client #${user.id}: ${hard.map((f) => `${f.id} (${f.name})`).join(" and ")} now fails on the holdings at the simulated prices of ${state.as_of}. ${moved}${follow}`,
        since: state.changed_at,
      });
    } else {
      out.push({ id: `drift-${user.id}`, severity: "medium", title: "Portfolio drift beyond the band", detail: `Client #${user.id}: ${moved}${follow}`, since: state.changed_at });
    }
  }
  return out;
}

/** The briefing's drift insight, once the simulated market has moved and the client holds a portfolio. */
export function driftInsight(userId: number): Insight | null {
  const month = db.marketMonth();
  if (month === 0) return null;
  const view = assess(userId);
  if (!view) return null;
  const { drift } = view;
  const cls = drift.classes.find((c) => c.asset_class === drift.largest.asset_class)!;
  const months = `${month} simulated month${month !== 1 ? "s" : ""}`;
  const base = { id: "drift", figure: `${signed(cls.drift_pp)} pts`, figure_label: `${cls.asset_class} against target`, href: "/account#risk", action: "Review the drift" };
  if (view.status === "rule_breach") {
    const listed = view.failing.filter((f) => f.type === "hard").map((f) => `${f.name} (${f.id})`).join(" and ");
    return {
      ...base,
      tone: "attention",
      title: "A rule now fails on what you hold",
      body: `After ${months}, your holdings fail ${listed} at the simulated prices. Rebalancing restores the mix you agreed to; the gate checks it first and nothing trades until you confirm.`,
    };
  }
  if (view.status === "drifted") {
    const sell = planTrades(view.held, targetItems(view.target), { amount: drift.total_value, navs: db.navs(), cash: view.cash }).sell_total;
    return {
      ...base,
      tone: "attention",
      title: "Your portfolio has drifted",
      body: `After ${months}, your ${cls.asset_class} share is ${g(cls.current_pct)}% against your ${g(cls.target_pct)}% target: ${g(Math.abs(cls.drift_pp))} points ${cls.drift_pp > 0 ? "over" : "under"}, beyond the ${g(BAND_PP)}-point band. Rebalancing would sell about ${money(sell)}; nothing trades until you confirm.`,
    };
  }
  return {
    ...base,
    tone: "positive",
    title: "Still on target",
    body: `After ${months}, every asset class is within ${g(BAND_PP)} points of your target; the largest gap is ${cls.asset_class} at ${signed(cls.drift_pp)} points.`,
  };
}
