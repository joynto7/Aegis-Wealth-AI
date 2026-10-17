import type {
  AgentTurn,
  BlockedCard,
  ChatCard,
  ChatReply,
  Citation,
  CompareResult,
  Profile,
  Proposal,
  ToolCallSummary,
  TraceSpan,
} from "@/lib/types";
import { db, logAction } from "@/mocks/db";
import { PRODUCTS } from "@/mocks/data/products";
import { findRule } from "@/mocks/data/rules";
import { compareProducts } from "@/mocks/engines/fees";
import { numberSources } from "@/mocks/engines/grounding";
import { projectionFor } from "@/mocks/services/planning";
import { suggestFix, type RemedyResult } from "@/mocks/engines/remedy";
import { formatMoney } from "@/lib/format";
import { tierLabel } from "@/mocks/engines/scoring";
import { MonitoringError, clientView, present, proposeRebalance, reviseWithRebalance } from "@/mocks/services/monitoring";

/**
 * The AI advisor agent (Section 2.5.6/2.5.8). This build has no model
 * key configured, so every turn runs in fallback mode exactly as FR-6.4
 * specifies: a keyword match picks a template and tool results fill it.
 * Grounded by construction — every number already comes from a tool.
 *
 * Additions, as in the backend: each tool result becomes a card beside the
 * reply, each figure in the reply carries its source, and while compliance
 * has the advisor suspended no turn runs at all.
 */

type Intent =
  | "explain_proposal"
  | "explain_tier"
  | "compare"
  | "explain_rejection"
  | "next_step"
  | "override_attempt"
  | "fix_request"
  | "goal_projection"
  | "execution_request"
  | "drift_check"
  | "rebalance_request"
  | "other";

// Ported from backend/app/agent/fallback.py (v2 intents).
const FIX =
  /how (do|can|could|should) i (fix|pass|get (it|this) (to )?pass)|\bfix (it|this|that|my|the)\b|make (it|this) pass|what (should|do) i change|how to (fix|pass)|suggest a fix|smallest change/;
// Monitoring loop (port of the backend's REBALANCE_ASK, DRIFT and EXECUTION patterns).
const EXECUTION = /execut|place (the |an |my )?orders?|order placed|confirm and|confirm it|confirmation token|skip the (comprehension )?quiz/;
const REBALANCE_ASK =
  /(propose|prepare|create|make|draft|build|start|set up|do)( me| a| the| my)* rebalanc|\brebalance (it|my|the|me|now|please)\b|please rebalance|(can|could|would) you rebalance|(want|like|need) to rebalance|let'?s rebalance/;
const DRIFT = /\bdrift|rebalanc|off[- ]target|back to (the |my )?target|out of balance|still on target|on target\?/;
const GOAL = /\b(goal|reach|on track|chances?|probab\w*|likely|will i have|how much will|enough (money|to)|retire\w*|afford|target)\b/;
const MONTHLY = /(?:cny\s?)?([\d,]+(?:\.\d+)?)\s*(k)?\s*(?:a|per|each|every)\s*month/;
const MONEY = /cny\s?([\d,]+(?:\.\d+)?)\s*(k|m)?|\b([\d,]{5,}(?:\.\d+)?)\b|\b(\d+(?:\.\d+)?)\s*(k|m)\b/g;

export const SUSPENDED_REPLY =
  "The AI advisor is paused by the compliance team. Your profile and proposals are unchanged and every screen still works. Orders still need your own Confirm click.";

function detectIntent(message: string): Intent {
  const m = message.toLowerCase();
  if (/(ignore (your|all) rules|override|put everything|all[- ]in|sell everything and buy|max(imum|) out)/.test(m)) {
    return "override_attempt";
  }
  if (EXECUTION.test(m)) return "execution_request";
  if (FIX.test(m)) return "fix_request";
  if (REBALANCE_ASK.test(m)) return "rebalance_request";
  if (DRIFT.test(m)) return "drift_check";
  if (GOAL.test(m)) return "goal_projection";
  if (/(reject|failed|rule|why not)/.test(m)) return "explain_rejection";
  if (/(compare|cheaper|fee|cost)/.test(m)) return "compare";
  if (/(tier|risk level|profile|score)/.test(m)) return "explain_tier";
  if (/(why|explain|portfolio|allocation)/.test(m)) return "explain_proposal";
  if (/(next|how do i|confirm|what now)/.test(m)) return "next_step";
  return "other";
}

function moneyValue(number: string, suffix?: string): number {
  return Number(number.replace(/,/g, "")) * ({ k: 1_000, m: 1_000_000 }[suffix ?? ""] ?? 1);
}

/** Target, monthly contribution and years from a goal question (port of the backend's _parse_goal). */
function parseGoal(m: string): { target: number | null; monthly: number | null; years: number | null } {
  const monthlyMatch = MONTHLY.exec(m);
  const monthly = monthlyMatch ? moneyValue(monthlyMatch[1], monthlyMatch[2]) : null;
  const rest = monthlyMatch ? m.replace(monthlyMatch[0], " ") : m;
  const amounts: number[] = [];
  for (const match of rest.matchAll(MONEY)) {
    if (match[1]) amounts.push(moneyValue(match[1], match[2]));
    else if (match[3]) amounts.push(moneyValue(match[3]));
    else if (match[4]) amounts.push(moneyValue(match[4], match[5]));
  }
  const years = /(\d{1,2})\s*(?:years?|yrs?)/.exec(rest);
  return { target: amounts.length ? Math.max(...amounts) : null, monthly, years: years ? Number(years[1]) : null };
}

function currentProposal(userId: number, proposalId?: number): Proposal | undefined {
  const list = db.proposalsFor(userId);
  if (proposalId) return list.find((p) => p.id === proposalId);
  // latest non-superseded version, else the latest overall
  return [...list].reverse().find((p) => p.status !== "superseded") ?? list[list.length - 1];
}

/**
 * The permission broker's T2 check (Section 2.8.1): the agent may create or
 * revise a proposal only for a complete, contradiction-free profile under
 * 365 days old. Returns the denial reason, or null when allowed.
 */
function t2DenialReason(profile: Profile | undefined): string | null {
  if (!profile) return "PROFILE_REQUIRED";
  if (Date.now() - new Date(profile.created_at).getTime() > 365 * 24 * 60 * 60 * 1000) return "PROFILE_REQUIRED";
  if (profile.contradictions.length) return "CONTRADICTIONS_OPEN";
  return null;
}

function nextStepFor(status: Proposal["status"]): string {
  switch (status) {
    case "rejected":
      return "revise the proposal so it passes the compliance gate.";
    case "warning":
      return "review and tick each warning, then continue to Confirm.";
    case "acknowledged":
    case "passed":
      return "open Confirm and Execute to take the comprehension quiz.";
    case "executed":
      return "check your sandbox account and advice record.";
    default:
      return "open the Proposal Workspace to generate a proposal.";
  }
}

// --- cards (port of backend app/agent/cards.py) ------------------------------------------
function proposalCard(p: Proposal): ChatCard {
  return {
    type: "proposal",
    proposal_id: p.id,
    version: p.version,
    status: p.status,
    amount: p.amount,
    horizon_years: p.horizon_years,
    tier: p.tier,
    class_weights_pct: p.class_weights_pct,
    gate_decision: p.gate.decision,
    failed_rules: p.gate.rules
      .filter((r) => r.result === "fail")
      .map((r) => ({ id: r.id, name: findRule(r.id)?.name ?? r.id, type: r.type, detail: r.detail })),
    data_label: p.data_label,
    kind: db.rebalances.has(p.id) ? "rebalance" : "new",
  };
}

function comparisonCard(r: CompareResult): ChatCard {
  return { type: "comparison", ...r };
}

function profileCard(p: Profile): ChatCard {
  return {
    type: "profile",
    tier: p.tier,
    tier_label: p.tier_label,
    capacity_score: p.capacity_score,
    willingness_score: p.willingness_score,
    max_acceptable_loss_pct: p.max_acceptable_loss_pct,
    status: p.status,
  };
}

function remedyCard(proposal: Proposal, r: RemedyResult): ChatCard {
  return {
    type: "remedy",
    proposal_id: proposal.id,
    version: proposal.version,
    gate_before: r.gate_before,
    gate_after: r.gate_after,
    failed_before: r.failed_before,
    failed_after: r.failed_after,
    fixed_rule_ids: r.fixed_rule_ids,
    items: r.items,
    summary: r.summary,
    data_label: proposal.data_label,
    changes: r.changes.map((c) => ({
      product_code: c.product_code,
      name: c.name,
      asset_class: c.asset_class,
      from_pct: c.from_pct,
      to_pct: c.to_pct,
      rule_ids: c.rule_ids,
    })),
  };
}

const g = (n: number) => String(Number(n.toPrecision(6)));
const signed = (n: number) => (n >= 0 ? `+${g(n)}` : g(n));

/** The check_drift tool's result, as the backend's tool returns it. */
function driftResult(userId: number) {
  const view = clientView(userId);
  const preview = view.rebalance;
  return {
    status: view.status,
    market_month: view.market.month,
    market_as_of: view.market.as_of,
    target_proposal_id: view.target_proposal_id,
    total_value: view.total_value,
    band_pp: view.band_pp,
    classes: view.classes,
    largest: view.largest,
    portfolio_drift_pct: view.portfolio_drift_pct,
    outside_band: view.outside_band,
    rules_failing: view.rules_failing.map((f) => ({ id: f.id, name: f.name, type: f.type, detail: f.detail, new: f.new })),
    trades: preview ? preview.trades.map((t) => ({ product_code: t.product_code, side: t.side, amount: t.amount })) : [],
    sell_total: preview?.sell_total ?? null,
    buy_total: preview?.buy_total ?? null,
    turnover_pct: preview?.turnover_pct ?? null,
    open_rebalance: view.open_rebalance,
    data_label: view.data_label,
  };
}

function driftCard(r: ReturnType<typeof driftResult>): ChatCard {
  return {
    type: "drift",
    status: r.status,
    market_month: r.market_month,
    market_as_of: r.market_as_of,
    target_proposal_id: r.target_proposal_id,
    total_value: r.total_value,
    band_pp: r.band_pp,
    classes: r.classes,
    largest: r.largest,
    portfolio_drift_pct: r.portfolio_drift_pct,
    outside_band: r.outside_band,
    sell_total: r.sell_total,
    turnover_pct: r.turnover_pct,
    data_label: r.data_label,
    rules_failing: r.rules_failing.map((f) => f.id),
    open_rebalance_id: r.open_rebalance?.proposal_id ?? null,
  };
}

function driftReply(r: ReturnType<typeof driftResult>): string {
  if (r.status === "none" || !r.largest) {
    return "You don't hold an invested portfolio yet, so there is no drift to check. Next step: confirm a proposal; after that, every simulated market move is measured against its mix.";
  }
  const cls = r.classes.find((c) => c.asset_class === r.largest!.asset_class)!;
  let head = `At the simulated prices of ${r.market_as_of}, your ${cls.asset_class} share is ${g(cls.current_pct)}% against your ${g(cls.target_pct)}% target (${signed(cls.drift_pp)} points; the band is ${g(r.band_pp)}).`;
  const hard = r.rules_failing.filter((f) => f.type === "hard");
  if (hard.length) head += ` ${hard.map((f) => f.id).join(" and ")} now fail${hard.length === 1 ? "s" : ""} on what you hold.`;
  if (r.outside_band || hard.length) {
    return `${head} Rebalancing would sell about ${formatMoney(r.sell_total ?? 0)}. Ask me to propose it, or press Propose rebalancing on the card; the gate checks it and nothing trades until you confirm.`;
  }
  return `${head} That is within the band, so there is nothing to rebalance yet.`;
}

function cardKey(card: ChatCard): string {
  switch (card.type) {
    case "proposal":
      return `proposal:${card.proposal_id}`;
    case "comparison":
      return `comparison:${card.items.map((i) => i.code).join(",")}`;
    case "rule":
      return `rule:${card.id}`;
    case "blocked":
      return `blocked:${card.tool}:${card.reason}`;
    case "projection":
      return `projection:${card.proposal_id}:${card.target_amount}:${card.horizon_years}:${card.monthly_contribution}`;
    case "remedy":
      return `remedy:${card.proposal_id}`;
    default:
      return card.type;
  }
}

/** One card per distinct result, in the order the tools ran; a repeat replaces the earlier card. At most 4. */
function dedupe(cards: ChatCard[]): ChatCard[] {
  const byKey = new Map<string, ChatCard>();
  for (const card of cards) {
    const key = cardKey(card);
    byKey.delete(key);
    byKey.set(key, card);
  }
  return [...byKey.values()].slice(-4);
}

export interface MockTurn {
  /** The reply before the handler adds its provenance (label, fingerprints). */
  reply: Omit<ChatReply, "provenance">;
  /** Proposals the agent created or revised, with the gate's decision (for the agent_turn log entry). */
  proposalsMade: { tool: string; proposal_id: number; gate: AgentTurn["proposals"][number]["gate"] }[];
  /** The card of each tool call, in call order, for the streamed tool events. */
  toolCards: (ChatCard | null)[];
  /** The turn's steps, shaped like the backend's OpenTelemetry GenAI spans (addition). */
  trace: TraceSpan[];
}

export function respondToChat(userId: number, message: string, proposalId?: number): MockTurn {
  const base = { message_id: db.nextId("message"), created_at: new Date().toISOString() };
  if (db.controlState("advisor") === "suspended") {
    return {
      reply: { ...base, mode: "suspended", grounding: "fallback", reply: SUSPENDED_REPLY, tool_calls: [], citations: [], cards: [], number_sources: [] },
      proposalsMade: [],
      toolCards: [],
      trace: [{ span_id: 1, parent_id: null, name: "invoke_agent aegis-advisor", start_ms: 0, duration_ms: 0.1, status: "ok", attributes: { "gen_ai.operation.name": "invoke_agent", "gen_ai.agent.name": "aegis-advisor", "aegis.mode": "suspended" } }],
    };
  }
  const started = performance.now();
  const spans: TraceSpan[] = [];
  let mark = started;

  const intent = detectIntent(message);
  const profile = db.currentProfile(userId);
  const proposal = currentProposal(userId, proposalId);
  const toolCalls: ToolCallSummary[] = [];
  const citations: Citation[] = [];
  const cards: ChatCard[] = [];
  const toolCards: (ChatCard | null)[] = [];
  const results: [string, unknown][] = [];
  const proposalsMade: MockTurn["proposalsMade"] = [];
  let reply = "I can explain your proposal, your risk tier, product fees or a gate result.";

  const addTool = (
    tool: string,
    tier: "T0" | "T1" | "T2",
    decision: "allowed" | "denied",
    summary: string,
    result?: { value: unknown; card: ChatCard }
  ) => {
    const now = performance.now();
    const gate =
      result?.card.type === "proposal" ? result.card.gate_decision : result?.card.type === "remedy" ? result.card.gate_after : undefined;
    spans.push({
      span_id: spans.length + 3,
      parent_id: 2,
      name: `execute_tool ${tool}`,
      start_ms: Math.round((mark - started) * 100) / 100,
      duration_ms: Math.round(Math.max(now - mark, 0.05) * 100) / 100,
      status: decision === "denied" ? "error" : "ok",
      attributes: {
        "gen_ai.operation.name": "execute_tool",
        "gen_ai.tool.name": tool,
        "aegis.tier": tier,
        "aegis.decision": decision,
        ...(gate ? { "aegis.gate.decision": gate } : {}),
      },
    });
    mark = now;
    toolCalls.push({ tool, tier, decision, summary });
    if (decision === "denied") {
      const blocked: BlockedCard = { type: "blocked", tool, tier, reason: summary };
      cards.push(blocked);
      toolCards.push(blocked);
    } else if (result) {
      results.push([tool, result.value]);
      cards.push(result.card);
      toolCards.push(result.card);
    } else {
      toolCards.push(null);
    }
    logAction({
      userId,
      actor: "agent",
      action: decision === "denied" ? "permission_denied" : "tool_call",
      tool,
      tier,
      decision,
      detail: decision === "denied" ? { reason: summary } : { summary },
    });
  };

  const t2Denial = t2DenialReason(profile);

  /** How to fix (T1, read-only): the smallest change that passes; the client applies it with the card's button. */
  const fixReply = (target: Proposal): string => {
    if (target.status === "executed" || target.status === "superseded") {
      addTool("suggest_fix", "T1", "allowed", `suggest_fix failed: INVALID_INPUT`);
      return `I couldn't work out a fix: proposal #${target.id} is ${target.status} and can no longer change. Your latest open proposal is the one a fix can change.`;
    }
    if (t2Denial || !profile) {
      addTool("suggest_fix", "T1", "allowed", `suggest_fix failed: ${t2Denial ?? "PROFILE_REQUIRED"}`);
      return "I couldn't work out a fix: your risk profile needs attention first. Your latest open proposal is the one a fix can change.";
    }
    const fix = suggestFix(target.items, {
      tier: profile.tier,
      amount: target.amount,
      horizonYears: target.horizon_years,
      nearTermNeed: target.near_term_need,
      maxAcceptableLossPct: profile.max_acceptable_loss_pct,
    });
    addTool("suggest_fix", "T1", "allowed", `How to fix #${target.id}: ${fix.gate_before} to ${fix.gate_after}`, {
      value: { proposal_id: target.id, version: target.version, ...fix },
      card: remedyCard(target, fix),
    });
    if (!fix.changes.length) return `Proposal #${target.id} already passes every rule a fix can address. Open Confirm and Execute to continue.`;
    const biggest = fix.changes.reduce((b, c) => (Math.abs(c.to_pct - c.from_pct) > Math.abs(b.to_pct - b.from_pct) ? c : b), fix.changes[0]);
    const others = fix.changes.length - 1;
    const rules = fix.fixed_rule_ids.length ? fix.fixed_rule_ids.join(", ") : "no rule";
    const fmt = (n: number) => String(Number(n.toPrecision(6)));
    return (
      `The smallest change that passes moves ${biggest.name} (${biggest.product_code}) from ${fmt(biggest.from_pct)}% to ${fmt(biggest.to_pct)}%` +
      (others ? `, with ${others} other adjustment${others !== 1 ? "s" : ""}` : "") +
      `. It fixes ${rules}, and the gate's verdict goes from ${fix.gate_before} to ${fix.gate_after}. ` +
      "Press Apply on the card to save it as a new version; the gate checks it again."
    );
  };

  if (intent === "execution_request") {
    reply =
      "I can't place orders, issue a confirmation token or skip the quiz: I have no tool that can. Only your own click on Confirm and Execute places orders, after the quiz." +
      (proposal ? ` Your proposal is ${proposal.status}. Next step: ${nextStepFor(proposal.status)}` : "");
  } else if (intent === "drift_check") {
    const r = driftResult(userId);
    const summary = r.largest ? `Checked drift: ${r.largest.asset_class} ${signed(r.largest.drift_pp)} points from target` : "Checked drift: no invested portfolio yet";
    addTool("check_drift", "T1", "allowed", summary, { value: r, card: driftCard(r) });
    reply = driftReply(r);
  } else if (intent === "rebalance_request") {
    if (t2Denial || !profile) {
      addTool("propose_rebalance", "T2", "denied", t2Denial ?? "PROFILE_REQUIRED");
      reply = "I can't prepare a rebalancing until your risk profile is current. Next step: retake the risk profile.";
    } else {
      try {
        const made = present(proposeRebalance(userId, profile, "agent"), userId);
        const reb = made.rebalance!;
        addTool("propose_rebalance", "T2", "allowed", `Proposed rebalancing #${made.id}: gate ${made.gate.decision}`, {
          value: { ...made, rebalance: reb },
          card: proposalCard(made),
        });
        proposalsMade.push({ tool: "propose_rebalance", proposal_id: made.id, gate: made.gate.decision });
        reply = `I prepared rebalancing proposal #${made.id} (version ${made.version}), back to the mix of proposal #${reb.source_proposal_id}: it sells ${formatMoney(reb.sell_total)} and buys ${formatMoney(reb.buy_total)}, and the gate's verdict is ${made.gate.decision}. I can't place it: open it, pass the quiz and press Confirm.`;
      } catch (e) {
        if (!(e instanceof MonitoringError)) throw e;
        addTool("propose_rebalance", "T2", "allowed", `propose_rebalance failed: ${e.code}`);
        const problem = e.message.replace(/\.$/, "");
        reply = `I couldn't prepare a rebalancing: ${problem.charAt(0).toLowerCase()}${problem.slice(1)}.`;
      }
    }
  } else if (intent === "override_attempt") {
    if (t2Denial) {
      addTool("revise_proposal", "T2", "denied", t2Denial);
      reply =
        t2Denial === "CONTRADICTIONS_OPEN"
          ? "I can't change your proposal while your risk profile has an open contradiction. Fix it in Risk Profile first. I also have no execution tool: only your own click on Confirm can place orders."
          : "I can't change a proposal until you have a current risk profile. I also have no execution tool: only your own click on Confirm can place orders.";
    } else if (!proposal || proposal.status === "executed" || proposal.status === "superseded") {
      reply =
        "I can't place or change any order myself — I have no execution tool. Generate a current proposal first, then review it and press Confirm for any real change.";
      addTool("create_proposal", "T2", "denied", "No actionable proposal to revise");
    } else {
      // Mirrors Scenario 4: the agent can only call revise_proposal (T2); the gate decides.
      addTool("get_proposal", "T1", "allowed", `Loaded proposal #${proposal.id}`, { value: proposal, card: proposalCard(proposal) });
      const thematic = [...PRODUCTS]
        .filter((p) => p.asset_class === "equity" && p.risk_level === 5)
        .sort((a, b) => a.annual_fee_pct - b.annual_fee_pct)[0];
      const others = proposal.items.filter((i) => i.product_code !== thematic.code);
      const remaining = 100 - 60;
      const scale = others.reduce((s, i) => s + i.weight_pct, 0) || 1;
      const rawItems = [
        { product_code: thematic.code, weight_pct: 60 },
        ...others.map((i) => ({ product_code: i.product_code, weight_pct: Math.round((i.weight_pct / scale) * remaining) })),
      ];
      const result = reviseWithRebalance(userId, proposal, profile!, rawItems);
      if (result.proposal) {
        addTool("revise_proposal", "T2", "allowed", `Saved version ${result.proposal.version} as #${result.proposal.id}: gate ${result.proposal.gate.decision}`, {
          value: result.proposal,
          card: proposalCard(result.proposal),
        });
        proposalsMade.push({ tool: "revise_proposal", proposal_id: result.proposal.id, gate: result.proposal.gate.decision });
        logAction({
          userId,
          actor: "agent",
          action: "proposal_revised",
          decision: "allowed",
          detail: { proposal_id: result.proposal.id, parent_id: proposal.id },
        });
        const failed = result.proposal.gate.rules.filter((r) => r.result === "fail" && r.type === "hard");
        logAction({
          userId,
          actor: "system",
          action: "gate_decided",
          detail: { decision: result.proposal.gate.decision, rule_ids: failed.map((r) => r.id) },
        });
        if (result.proposal.gate.decision === "REJECT" && failed.length) {
          const ruleText = failed.map((r) => `${r.id} (${findRule(r.id)?.name ?? r.id})`).join(" and ");
          reply = `I can't do that. The gate rejected this version: ${ruleText}. No order was placed. To act on this yourself, review the proposal and press Confirm.`;
          citations.push({ tool: "revise_proposal", path: "gate.decision", value: result.proposal.gate.decision });
        } else {
          reply =
            "That change passed the compliance gate, but I still can't place an order — only your own click on Confirm can do that.";
        }
      } else {
        addTool("revise_proposal", "T2", "allowed", "Rejected input for revise_proposal");
        reply = "I couldn't make that change. I have no tool that places orders; to act, review the proposal and press Confirm.";
      }
    }
  } else if (intent === "fix_request") {
    if (!proposal) {
      reply = "You don't have a proposal yet. Next step: open Proposals and enter an amount and a horizon.";
    } else {
      reply = fixReply(proposal);
    }
  } else if (intent === "goal_projection") {
    if (!proposal) {
      reply = "Build a proposal first, then I can project it. Or open the Goal Planner to try any amount and horizon.";
    } else {
      const { target, monthly, years } = parseGoal(message.toLowerCase());
      const projection = projectionFor(userId, {
        basis: "proposal",
        proposal_id: proposal.id,
        horizon_years: years && years >= 1 && years <= 30 ? years : undefined,
        monthly_contribution: monthly !== null && monthly <= 1_000_000 ? monthly : 0,
        target_amount: target !== null && target >= 1_000 && target <= 100_000_000 ? target : null,
        compare_tiers: false,
      });
      const value = {
        basis: projection.basis,
        amount: projection.amount,
        horizon_years: projection.horizon_years,
        monthly_contribution: projection.monthly_contribution,
        target_amount: projection.target_amount,
        total_contributed: projection.total_contributed,
        weighted_fee_pct: projection.weighted_fee_pct,
        paths: projection.paths,
        probability_target_pct: projection.probability_target_pct,
        probability_loss_pct: projection.probability_loss_pct,
        median_shortfall: projection.median_shortfall,
        end: projection.end,
        required_monthly: projection.required_monthly,
        years: projection.years.map((b) => ({ year: b.year, p10: b.p10, p50: b.p50, p90: b.p90 })),
        data_label: projection.data_label,
      };
      const chance = projection.probability_target_pct;
      addTool(
        "project_goal",
        "T1",
        "allowed",
        `Projected ${projection.horizon_years} years${chance !== null ? `: ${chance}% chance of the target` : ""}`,
        {
          value,
          card: {
            type: "projection",
            basis_label: projection.basis.label,
            proposal_id: projection.basis.proposal_id,
            amount: value.amount,
            horizon_years: value.horizon_years,
            monthly_contribution: value.monthly_contribution,
            target_amount: value.target_amount,
            total_contributed: value.total_contributed,
            probability_target_pct: value.probability_target_pct,
            probability_loss_pct: value.probability_loss_pct,
            median_shortfall: value.median_shortfall,
            end: value.end,
            required_monthly: value.required_monthly,
            years: value.years,
            data_label: value.data_label,
          },
        }
      );
      const end = projection.end;
      const paths = projection.paths.toLocaleString("en-US");
      const tail = "These come from resampled history, not a forecast. Next step: open the Goal Planner to try other amounts.";
      if (chance === null) {
        reply = `In ${paths} illustrative paths, proposal #${proposal.id} ends after ${projection.horizon_years} years near ${formatMoney(end.p50)} in a typical case and ${formatMoney(end.p10)} in a bad case (1 in 10). ${tail}`;
      } else {
        const need = chance < 75 ? projection.required_monthly?.find((r) => r.confidence_pct === 75) : undefined;
        const lift = need && need.monthly > 0 ? `Adding about ${formatMoney(need.monthly)} a month would lift the chance to 75%. ` : "";
        reply = `In ${paths} illustrative paths, proposal #${proposal.id} has a ${chance}% chance of reaching ${formatMoney(projection.target_amount ?? 0)} in ${projection.horizon_years} years. A bad case (1 in 10) ends near ${formatMoney(end.p10)}, a typical one near ${formatMoney(end.p50)}. ${lift}${tail}`;
      }
    }
  } else if (intent === "explain_proposal" && proposal) {
    addTool("get_proposal", "T1", "allowed", `Loaded proposal #${proposal.id}`, { value: proposal, card: proposalCard(proposal) });
    const w = proposal.class_weights_pct;
    const worst = proposal.stress.reduce((min, s) => (s.loss_cny < min.loss_cny ? s : min), proposal.stress[0]);
    reply = `Your proposal holds ${w.cash}% cash, ${w.bond}% bonds, ${w.equity}% equities and ${w.gold}% gold, suited to tier ${proposal.tier}. Its worst hypothetical loss is ${formatMoney(Math.abs(worst.loss_cny))} in ${worst.name}. Next step: ${nextStepFor(proposal.status)}`;
    citations.push(
      { tool: "get_proposal", path: "class_weights_pct.cash", value: w.cash },
      { tool: "get_proposal", path: "stress.loss_cny", value: worst.loss_cny }
    );
  } else if (intent === "explain_tier" && profile) {
    addTool("get_profile_summary", "T1", "allowed", "Loaded your profile summary", { value: profile, card: profileCard(profile) });
    reply = `Your capacity score is ${profile.capacity_score} and your willingness score is ${profile.willingness_score}; your tier is the lower one, ${profile.tier} (${tierLabel(profile.tier)}).`;
    citations.push(
      { tool: "get_profile_summary", path: "capacity_score", value: profile.capacity_score },
      { tool: "get_profile_summary", path: "willingness_score", value: profile.willingness_score }
    );
  } else if (intent === "compare") {
    const candidates = proposal
      ? proposal.items.map((i) => i.product_code)
      : [...PRODUCTS].filter((p) => p.asset_class === "bond").slice(0, 2).map((p) => p.code);
    const codes = candidates.slice(0, 3);
    if (codes.length >= 2) {
      const raw = compareProducts(codes, proposal?.amount ?? 100000, proposal?.horizon_years ?? 5);
      const result: CompareResult = {
        ...raw,
        items: raw.items.map((i) => ({ ...i, suitable: profile ? i.risk_level <= profile.tier : null })),
      };
      addTool("compare_products", "T0", "allowed", `Compared ${codes.join(", ")}`, { value: result, card: comparisonCard(result) });
      const [p1, p2] = result.items;
      // Products in different asset classes use different assumed returns; say so instead of quoting one.
      const growth =
        p1.assumed_return_pct === p2.assumed_return_pct
          ? `${p1.assumed_return_pct}% a year`
          : `${p1.assumed_return_pct}% and ${p2.assumed_return_pct}% a year respectively`;
      const cheapest = result.items.find((i) => i.code === result.cheapest_code)?.name ?? p1.name;
      reply = `Over ${result.horizon_years} years on ${formatMoney(result.amount)}, fees would cost about ${formatMoney(p1.fee_cost)} for ${p1.name} and ${formatMoney(p2.fee_cost)} for ${p2.name}, assuming growth of ${growth} before fees. ${cheapest} costs the least in fees.`;
      citations.push(
        { tool: "compare_products", path: "items[0].fee_cost", value: p1.fee_cost },
        { tool: "compare_products", path: "items[1].fee_cost", value: p2.fee_cost }
      );
    } else {
      reply = "I need at least two products to compare — open the Product Shelf and select a few.";
    }
  } else if (intent === "explain_rejection" && proposal) {
    addTool("get_proposal", "T1", "allowed", `Loaded proposal #${proposal.id}`, { value: proposal, card: proposalCard(proposal) });
    const failed = proposal.gate.rules.find((r) => r.result === "fail" && r.type === "hard");
    const warned = proposal.gate.rules.filter((r) => r.result === "fail" && r.type === "soft");
    if (failed) {
      reply = `The gate rejected this version: ${failed.id}, ${failed.message} ${fixReply(proposal)}`;
      citations.push({ tool: "get_proposal", path: "gate.rules", value: failed.id });
    } else if (warned.length) {
      reply = `The gate did not reject this version, but it raised a warning: ${warned[0].id}, ${warned[0].message} Tick each warning on the Confirm screen to continue.`;
      citations.push({ tool: "get_proposal", path: "gate.rules", value: warned[0].id });
    } else {
      reply = `Your latest version passed the gate with no rejected rules. Its status is ${proposal.status}.`;
    }
  } else if (intent === "next_step") {
    if (proposal) {
      addTool("get_proposal", "T1", "allowed", `Loaded proposal #${proposal.id}`, { value: proposal, card: proposalCard(proposal) });
      reply = `Your proposal is ${proposal.status}. Next step: ${nextStepFor(proposal.status)}`;
      citations.push({ tool: "get_proposal", path: "status", value: proposal.status });
    } else if (profile) {
      addTool("get_profile_summary", "T1", "allowed", "Loaded your profile summary", { value: profile, card: profileCard(profile) });
      reply = `Your risk tier is set at ${profile.tier}. Next step: open Products or request a proposal.`;
    } else {
      reply = "Next step: complete your Risk Profile so we can suggest a suitable portfolio.";
    }
  } else if ((intent === "explain_proposal" || intent === "explain_rejection") && !proposal) {
    reply = "You don't have a proposal yet. Open Proposal Workspace and request one with an amount and horizon.";
  }

  const sources = numberSources(reply, results, message);
  const total = Math.round(Math.max(performance.now() - started, 0.1) * 100) / 100;
  const trace: TraceSpan[] = [
    {
      span_id: 1,
      parent_id: null,
      name: "invoke_agent aegis-advisor",
      start_ms: 0,
      duration_ms: total,
      status: "ok",
      attributes: { "gen_ai.operation.name": "invoke_agent", "gen_ai.agent.name": "aegis-advisor", "aegis.mode": "fallback", "aegis.grounding": "fallback" },
    },
    {
      span_id: 2,
      parent_id: 1,
      name: "aegis.template",
      start_ms: 0,
      duration_ms: total,
      status: "ok",
      attributes: { "aegis.fallback.reason": "no_model", "aegis.grounding.figures_traced": sources.length },
    },
    ...spans,
  ];
  return {
    reply: {
      ...base,
      mode: "fallback",
      grounding: "fallback",
      reply,
      tool_calls: toolCalls,
      citations,
      cards: dedupe(cards),
      number_sources: sources,
    },
    proposalsMade,
    toolCards,
    trace,
  };
}
