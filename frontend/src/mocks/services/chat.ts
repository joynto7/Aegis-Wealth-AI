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
} from "@/lib/types";
import { db, logAction } from "@/mocks/db";
import { PRODUCTS } from "@/mocks/data/products";
import { findRule } from "@/mocks/data/rules";
import { compareProducts } from "@/mocks/engines/fees";
import { numberSources } from "@/mocks/engines/grounding";
import { reviseProposal } from "@/mocks/services/proposals";
import { formatMoney } from "@/lib/format";
import { tierLabel } from "@/mocks/engines/scoring";

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

type Intent = "explain_proposal" | "explain_tier" | "compare" | "explain_rejection" | "next_step" | "override_attempt" | "other";

export const SUSPENDED_REPLY =
  "The AI advisor is paused by the compliance team. Your profile and proposals are unchanged and every screen still works. Orders still need your own Confirm click.";

function detectIntent(message: string): Intent {
  const m = message.toLowerCase();
  if (/(ignore (your|all) rules|override|put everything|all[- ]in|sell everything and buy|max(imum|) out)/.test(m)) {
    return "override_attempt";
  }
  if (/(reject|failed|rule|why not)/.test(m)) return "explain_rejection";
  if (/(compare|cheaper|fee|cost)/.test(m)) return "compare";
  if (/(tier|risk level|profile|score)/.test(m)) return "explain_tier";
  if (/(why|explain|portfolio|allocation)/.test(m)) return "explain_proposal";
  if (/(next|how do i|confirm|what now)/.test(m)) return "next_step";
  return "other";
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
  reply: ChatReply;
  /** Proposals the agent created or revised, with the gate's decision (for the agent_turn log entry). */
  proposalsMade: { tool: string; proposal_id: number; gate: AgentTurn["proposals"][number]["gate"] }[];
  /** The card of each tool call, in call order, for the streamed tool events. */
  toolCards: (ChatCard | null)[];
}

export function respondToChat(userId: number, message: string, proposalId?: number): MockTurn {
  const base = { message_id: db.nextId("message"), created_at: new Date().toISOString() };
  if (db.controlState("advisor") === "suspended") {
    return {
      reply: { ...base, mode: "suspended", grounding: "fallback", reply: SUSPENDED_REPLY, tool_calls: [], citations: [], cards: [], number_sources: [] },
      proposalsMade: [],
      toolCards: [],
    };
  }

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

  if (intent === "override_attempt") {
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
      const result = reviseProposal(userId, proposal, profile!, rawItems);
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
      reply = `The gate rejected this version: ${failed.id}, ${failed.message} Change that item and the gate runs again.`;
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

  return {
    reply: {
      ...base,
      mode: "fallback",
      grounding: "fallback",
      reply,
      tool_calls: toolCalls,
      citations,
      cards: dedupe(cards),
      number_sources: numberSources(reply, results, message),
    },
    proposalsMade,
    toolCards,
  };
}
