import { http, HttpResponse, delay } from "msw";
import { db, logAction } from "@/mocks/db";
import { authenticate, authenticateAs, errorResponse, isAuthResult, requireRole } from "@/mocks/helpers";
import { findUserByEmail } from "@/mocks/data/users";
import { randomToken, hashToken, CONFIRM_TOKEN_TTL_MS } from "@/mocks/engines/tokens";
import { canonicalStringify, nextHash, sha256Hex, GENESIS_HASH } from "@/mocks/engines/chain";
import { toPublicQuestionnaire } from "@/mocks/data/questionnaire";
import { MAX_ACCEPTABLE_LOSS_PCT } from "@/mocks/data/questionnaire";
import { scoreQuestionnaire, computeTier, tierLabel } from "@/mocks/engines/scoring";
import { checkContradictions } from "@/mocks/engines/contradictions";
import { REPLAY_EPISODES, findEpisode } from "@/mocks/data/replayEpisodes";
import { runReplay } from "@/mocks/engines/replay";
import { PRODUCTS, findProduct } from "@/mocks/data/products";
import { compareProducts } from "@/mocks/engines/fees";
import { createProposal, reviseProposal, toSummary } from "@/mocks/services/proposals";
import { buildQuiz, checkQuiz } from "@/mocks/engines/quiz";
import { DISCLOSURES } from "@/lib/disclosures";
import { BANNED_PHRASES, RULES } from "@/mocks/data/rules";
import { respondToChat } from "@/mocks/services/chat";
import { AI_CONTROL_LIST, FRAMEWORKS, REGULATIONS_NOTE, REGULATIONS_VERSION } from "@/mocks/data/regulations";
import { MODEL_PORTFOLIOS } from "@/mocks/data/modelPortfolios";
import { verifyChain } from "@/mocks/services/chain";
import { ASSUMPTIONS, DATA_AS_OF, SCENARIOS } from "@/mocks/data/scenarios";
import type {
  AdviceRecord,
  AgentTurn,
  ChatCard,
  ChatReply,
  ControlName,
  ControlStateValue,
  LogEntry,
  ModelCard,
  Order,
  Oversight,
  Profile,
  Proposal,
  ReplayReaction,
} from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

function age(iso: string) {
  return Date.now() - new Date(iso).getTime();
}

const REACTIONS: ReplayReaction[] = ["hold", "buy_more", "sell_some", "sell_all"];

/** T2 preconditions (Section 2.8.1): a complete profile, no open contradiction, under 365 days old. */
export function t2PreconditionError(profile: Profile | undefined): Response | null {
  if (!profile || age(profile.created_at) > 365 * DAY_MS) {
    return errorResponse(409, "PROFILE_REQUIRED", "You need a current risk profile first.");
  }
  if (profile.contradictions.length) {
    return errorResponse(
      409,
      "CONTRADICTIONS_OPEN",
      "Your risk profile has an answer that contradicts another. Fix it before requesting a proposal."
    );
  }
  return null;
}

/** Executed and superseded proposals are final (Section 2.3.2): nothing on them can change. */
function closedProposalError(proposal: Proposal): Response | null {
  if (proposal.status === "executed" || proposal.status === "superseded") {
    return errorResponse(409, "STATE_CONFLICT", `This proposal is ${proposal.status} and can no longer change.`);
  }
  return null;
}

function rejectedProposalError(proposal: Proposal): Response | null {
  if (proposal.status !== "rejected") return null;
  return errorResponse(409, "GATE_REJECTED", "This proposal was rejected by the compliance gate.", {
    rule_ids: proposal.gate.rules.filter((r) => r.result === "fail" && r.type === "hard").map((r) => r.id),
  });
}

/** Addition: while compliance has execution halted, no token is issued and no order is placed. */
function haltedError(userId: number, proposalId: number, action: string): Response | null {
  if (db.controlState("execution") !== "halted") return null;
  logAction({ userId, actor: "client", action, tier: "T3", decision: "denied", detail: { proposal_id: proposalId, reason: "EXECUTION_HALTED" } });
  return errorResponse(409, "EXECUTION_HALTED", "Order execution is paused by the compliance team. Your proposal is saved; try again later.");
}

const CONTROL_STATES: Record<ControlName, [ControlStateValue, ControlStateValue]> = {
  advisor: ["active", "suspended"],
  execution: ["open", "halted"],
};

const CONTROL_ACTIONS: Record<string, string> = {
  "advisor:suspended": "advisor_suspended",
  "advisor:active": "advisor_resumed",
  "execution:halted": "execution_halted",
  "execution:open": "execution_resumed",
};

function regulationsBody() {
  return { version: REGULATIONS_VERSION, note: REGULATIONS_NOTE, frameworks: FRAMEWORKS, ai_controls: AI_CONTROL_LIST };
}

/** The Control Room's counts and feed, from the mock operation log (port of backend services/oversight.py). */
function oversightBody(): Oversight {
  const count = (pred: (l: LogEntry) => boolean) => db.logs.filter(pred).length;
  const turns = db.logs.filter((l) => l.action === "agent_turn").reverse();
  const detail = (l: LogEntry) => l.detail as Record<string, unknown>;
  const made = turns.flatMap((t) => (detail(t).proposals as AgentTurn["proposals"]) ?? []);
  const mode = (m: string) => turns.filter((t) => detail(t).mode === m).length;
  return {
    llm: "fallback",
    model: "claude-opus-5-5",
    system_prompt_sha256: MOCK_PROMPT_SHA256,
    controls: db.controlsSnapshot(true),
    kpis: {
      agent_turns: turns.length,
      model_turns: mode("model"),
      template_turns: mode("fallback"),
      suspended_turns: mode("suspended"),
      tool_calls_t0: count((l) => l.actor === "agent" && l.action === "tool_call" && l.tier === "T0"),
      tool_calls_t1: count((l) => l.actor === "agent" && l.action === "tool_call" && l.tier === "T1"),
      tool_calls_t2: count((l) => l.actor === "agent" && l.action === "tool_call" && l.tier === "T2"),
      denied_tool_calls: count((l) => l.actor === "agent" && l.action === "permission_denied"),
      agent_proposals: made.length,
      agent_proposals_rejected: made.filter((p) => p.gate === "REJECT").length,
      grounding_rewrites: count((l) => l.action === "grounding_regenerated"),
      grounding_fallbacks: count((l) => l.action === "grounding_fallback"),
      figures_traced: turns.reduce((s, t) => s + Number(detail(t).figures_traced ?? 0), 0),
      orders_by_agent: count((l) => l.actor === "agent" && l.action === "orders_executed" && l.decision === "allowed"),
      orders_by_clients: count((l) => l.actor === "client" && l.action === "orders_executed" && l.decision === "allowed"),
    },
    turns: turns.slice(0, 30).map((t) => ({
      log_id: t.id,
      ts: t.ts,
      user_id: t.user_id,
      mode: (detail(t).mode as AgentTurn["mode"]) ?? "fallback",
      grounding: (detail(t).grounding as AgentTurn["grounding"]) ?? "fallback",
      tools: (detail(t).tools as AgentTurn["tools"]) ?? [],
      proposals: (detail(t).proposals as AgentTurn["proposals"]) ?? [],
      figures_traced: Number(detail(t).figures_traced ?? 0),
    })),
  };
}

// The mock has no model and no system prompt; a fixed placeholder stands in for the backend's fingerprint.
const MOCK_PROMPT_SHA256 = "0".repeat(64);

async function modelCardBody(): Promise<ModelCard> {
  const weights = (w: Record<string, number>) => ({ cash: w.cash, bond: w.bond, gold: w.gold, equity: w.equity });
  const body: Omit<ModelCard, "content_sha256"> = {
    report: "Aegis Wealth AI: AI model and asset-allocation logic disclosure",
    generated_at: new Date().toISOString(),
    advisor: {
      provider: "Anthropic",
      model: "claude-opus-5-5",
      mode: "fallback",
      effort: "medium",
      max_tokens: 16000,
      timeout_seconds: 20,
      max_tool_rounds: 4,
      history_messages: 10,
      system_prompt_sha256: MOCK_PROMPT_SHA256,
      tools_sha256: MOCK_PROMPT_SHA256,
      data_sent:
        "Each turn: the client's tier, capacity and willingness scores, maximum acceptable loss, profile status, current proposal number and status, the last 10 chat messages, and the results of the tools it calls.",
      data_never_sent: "Names, email addresses, passwords, session or confirmation tokens, and other clients' data.",
    },
    tools: [
      { name: "search_products", tier: "T0", description: "Search the shelf of sample products." },
      { name: "compare_products", tier: "T0", description: "Compare 2 or 3 products' fees and end values." },
      { name: "explain_rule", tier: "T0", description: "Return one compliance rule and its regulatory basis." },
      { name: "get_profile_summary", tier: "T1", description: "Return the client's own risk profile." },
      { name: "get_proposal", tier: "T1", description: "Return one of the client's own proposals." },
      { name: "create_proposal", tier: "T2", description: "Create a proposal; the gate always runs." },
      { name: "revise_proposal", tier: "T2", description: "Save a new version; the gate always runs." },
    ],
    permission_tiers: [
      { tier: "T0", scope: "Read the product shelf and the compliance rules." },
      { tier: "T1", scope: "Read the client's own profile and proposals; the session's user id limits every query." },
      { tier: "T2", scope: "Create or revise a proposal; needs a complete, contradiction-free profile under 365 days old, and the gate always runs." },
      { tier: "T3", scope: "Execute orders. No tool exists: only the client's own Confirm click creates the single-use token." },
    ],
    grounding: {
      allowed_numbers:
        "Every number in a reply must match a value in that turn's tool results or the client's message, rounded the same way; whole numbers up to 10 and years 2000-2030 need no source.",
      banned_phrases: BANNED_PHRASES,
      on_failure: "The reply is rewritten once with a note naming the problem; if it fails again, a checked template answers.",
    },
    allocation: {
      tier_labels: Object.fromEntries([1, 2, 3, 4, 5].map((t) => [String(t), tierLabel(t)])),
      model_portfolios_pct: Object.fromEntries(Object.entries(MODEL_PORTFOLIOS).map(([t, w]) => [t, weights(w)])),
      steps: [
        "Start from the model portfolio for the client's tier (cash, bonds, gold, equities).",
        "Under a 3-year horizon, cap equities plus gold at 20%, equities first, and move the excess to bonds (cash for tier 1).",
        "Raise cash to cover the amount needed within 2 years (the liquidity floor), taking it pro rata from the other classes.",
        "Round each class to a whole percent, half away from zero; a remainder goes to cash, and an excess comes off the largest non-cash class.",
        "In each class, choose the lowest-fee eligible product, then the fastest to access.",
        "Split a class above 40% between its two lowest-fee eligible products, so no product exceeds 40%.",
        "If a class has no eligible product, move its weight to cash.",
      ],
      assumed_gross_return_pct: weights(Object.fromEntries(Object.entries(ASSUMPTIONS).map(([c, g]) => [c, Math.round(g * 10000) / 100]))),
      stress_scenarios: SCENARIOS.map((s) => ({
        id: s.id,
        name: s.name,
        shocks_pct: weights(Object.fromEntries(Object.entries(s.shocks).map(([c, v]) => [c, Math.round(v * 10000) / 100]))),
      })),
    },
    rules: RULES,
    controls: db.controlsSnapshot(true),
    regulations: regulationsBody(),
    data_versions: { rules: "rules-2026-10", regulations: REGULATIONS_VERSION, products_as_of: DATA_AS_OF, history: "Illustrative" },
  };
  return { ...body, content_sha256: await sha256Hex(canonicalStringify(body)) };
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const handlers = [
  // ---------------------------------------------------------------- auth
  http.post("/api/auth/login", async ({ request }) => {
    await delay(250);
    if (db.loginRateLimited()) {
      return errorResponse(429, "RATE_LIMITED", "Too many attempts; try again in a minute.");
    }
    db.recordLoginAttempt();
    const body = (await request.json()) as { email?: string; password?: string };
    const email = body.email?.trim();
    const user = email ? findUserByEmail(email) : undefined;
    if (!user || user.password !== body.password) {
      logAction({ userId: user?.id ?? null, actor: "system", action: "login", decision: "denied", detail: {} });
      return errorResponse(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }
    const token = randomToken();
    const expiresAt = db.createSession(user.id, token);
    logAction({ userId: user.id, actor: user.role === "compliance" ? "compliance" : "client", action: "login", decision: "allowed", detail: {} });
    // A real backend sets this via a Set-Cookie response header. MSW
    // responses are synthetic, so the browser never applies Set-Cookie on
    // them — the token travels in the body instead, and the page keeps it
    // and sends it back as a header (see src/lib/session-token.ts).
    return HttpResponse.json({
      user: { id: user.id, email: user.email, role: user.role, display_name: user.display_name },
      session_token: token,
      expires_at: new Date(expiresAt).toISOString(),
    });
  }),

  http.post("/api/auth/logout", async ({ request }) => {
    const auth = authenticate(request);
    if (isAuthResult(auth)) {
      db.deleteSession(auth.token);
      logAction({ userId: auth.user.id, actor: auth.user.role === "compliance" ? "compliance" : "client", action: "logout", decision: "allowed", detail: {} });
    }
    return new HttpResponse(null, { status: 204 });
  }),

  http.get("/api/auth/me", ({ request }) => {
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    const { user } = auth;
    return HttpResponse.json({ user: { id: user.id, email: user.email, role: user.role, display_name: user.display_name } });
  }),

  // ------------------------------------------------------------- profile
  http.get("/api/profile/questionnaire", ({ request }) => {
    const auth = authenticateAs(request, "client");
    if (!isAuthResult(auth)) return auth;
    return HttpResponse.json(toPublicQuestionnaire());
  }),

  http.post("/api/profile", async ({ request }) => {
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    const forbidden = requireRole(auth.user, "client");
    if (forbidden) return forbidden;
    const body = (await request.json()) as { answers?: Record<string, string> };
    const answers = body.answers ?? {};
    const required = ["C1", "C2", "C3", "C4", "C5", "W1", "W2", "W3", "W4", "W5"];
    const missing = required.filter((q) => !answers[q]);
    if (missing.length) {
      return errorResponse(422, "VALIDATION_ERROR", "Please answer every question.", {
        fields: missing.map((f) => ({ field: f, problem: "required" })),
      });
    }
    const scored = scoreQuestionnaire(answers);
    const contradictions = checkContradictions(answers);
    const tier = computeTier(scored.capacity_tier, scored.willingness_tier, 0);
    const previous = db.currentProfile(auth.user.id);
    const profile: Profile = {
      id: db.nextId("profile"),
      version: (previous?.version ?? 0) + 1,
      status: contradictions.length ? "needs_review" : "complete",
      capacity_score: scored.capacity_score,
      willingness_score: scored.willingness_score,
      capacity_tier: scored.capacity_tier,
      willingness_tier: scored.willingness_tier,
      replay_adjustment: 0,
      tier,
      tier_label: tierLabel(tier),
      max_acceptable_loss_pct: MAX_ACCEPTABLE_LOSS_PCT[answers.W4] ?? 5,
      contradictions,
      replay: null,
      created_at: new Date().toISOString(),
    };
    db.addProfile(auth.user.id, profile);
    logAction({ userId: auth.user.id, actor: "client", action: "profile_submitted", decision: "allowed", detail: { version: profile.version, status: profile.status } });
    return HttpResponse.json(profile, { status: 201 });
  }),

  http.get("/api/profile/current", ({ request }) => {
    const auth = authenticateAs(request, "client");
    if (!isAuthResult(auth)) return auth;
    const profile = db.currentProfile(auth.user.id);
    if (!profile) return errorResponse(404, "NOT_FOUND", "No risk profile yet.");
    return HttpResponse.json(profile);
  }),

  // -------------------------------------------------------------- replay
  http.get("/api/replay/episodes", ({ request }) => {
    const auth = authenticateAs(request, "client");
    if (!isAuthResult(auth)) return auth;
    return HttpResponse.json({ episodes: REPLAY_EPISODES });
  }),

  http.get("/api/replay/:episodeId", ({ request, params }) => {
    const auth = authenticateAs(request, "client");
    if (!isAuthResult(auth)) return auth;
    const profile = db.currentProfile(auth.user.id);
    if (!profile) return errorResponse(409, "PROFILE_REQUIRED", "Complete your risk profile first.");
    // Addition: the replay can start from the client's own amount (CNY 10,000 to 10,000,000).
    const amountParam = new URL(request.url).searchParams.get("amount");
    const amount = amountParam === null ? 100000 : Number(amountParam);
    if (!Number.isFinite(amount) || amount < 10000 || amount > 10000000) {
      return errorResponse(422, "VALIDATION_ERROR", "The amount must be CNY 10,000 to 10,000,000.", {
        fields: [{ field: "amount", problem: "out of range" }],
      });
    }
    try {
      const result = runReplay(String(params.episodeId), profile.tier, amount);
      return HttpResponse.json(result);
    } catch {
      return errorResponse(404, "NOT_FOUND", "Unknown episode.");
    }
  }),

  http.post("/api/profile/current/replay-reaction", async ({ request }) => {
    const auth = authenticateAs(request, "client");
    if (!isAuthResult(auth)) return auth;
    const profile = db.currentProfile(auth.user.id);
    if (!profile) return errorResponse(409, "PROFILE_REQUIRED", "Complete your risk profile first.");
    if (profile.status !== "complete") {
      return errorResponse(409, "CONTRADICTIONS_OPEN", "Fix the contradictions in your risk profile before the replay.");
    }
    const body = (await request.json()) as { episode_id?: string; reaction?: string };
    const fields = [
      ...(!body.episode_id || !findEpisode(body.episode_id) ? [{ field: "episode_id", problem: "unknown episode" }] : []),
      ...(!REACTIONS.includes(body.reaction as ReplayReaction) ? [{ field: "reaction", problem: `one of ${REACTIONS.join(", ")}` }] : []),
    ];
    if (fields.length) {
      return errorResponse(422, "VALIDATION_ERROR", "Choose an episode and one of the four reactions.", { fields });
    }
    const answered = db.replayReactions.get(profile.id) ?? new Set<string>();
    if (answered.has(body.episode_id!)) {
      return errorResponse(409, "STATE_CONFLICT", "You already answered this episode. Retake the profile to answer again.");
    }
    answered.add(body.episode_id!);
    db.replayReactions.set(profile.id, answered);
    profile.replay = { episode_id: body.episode_id!, reaction: body.reaction as ReplayReaction };
    if (body.reaction === "sell_all" && profile.replay_adjustment < 1) {
      profile.replay_adjustment = 1;
    }
    profile.tier = computeTier(profile.capacity_tier, profile.willingness_tier, profile.replay_adjustment);
    profile.tier_label = tierLabel(profile.tier);
    logAction({ userId: auth.user.id, actor: "client", action: "replay_reaction", decision: "allowed", detail: { episode_id: body.episode_id, reaction: body.reaction, tier: profile.tier } });
    return HttpResponse.json(profile);
  }),

  // ------------------------------------------------------------- products
  http.get("/api/products", ({ request }) => {
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    const url = new URL(request.url);
    const type = url.searchParams.get("type");
    const maxRisk = url.searchParams.get("max_risk");
    const q = url.searchParams.get("q")?.toLowerCase();
    const profile = auth.user.role === "client" ? db.currentProfile(auth.user.id) : undefined;

    let list = PRODUCTS.slice();
    if (type) list = list.filter((p) => p.type === type);
    if (maxRisk) list = list.filter((p) => p.risk_level <= Number(maxRisk));
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));

    const items = list.map((p) => ({ ...p, suitable: profile ? p.risk_level <= profile.tier : null }));
    return HttpResponse.json({ items });
  }),

  http.get("/api/products/:productId", ({ request, params }) => {
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    const product = findProduct(String(params.productId));
    if (!product) return errorResponse(404, "NOT_FOUND", "Unknown product.");
    const profile = auth.user.role === "client" ? db.currentProfile(auth.user.id) : undefined;
    return HttpResponse.json({ ...product, suitable: profile ? product.risk_level <= profile.tier : null });
  }),

  http.post("/api/products/compare", async ({ request }) => {
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    const forbidden = requireRole(auth.user, "client");
    if (forbidden) return forbidden;
    const body = (await request.json()) as { product_codes?: string[]; amount?: number; horizon_years?: number };
    const codes = body.product_codes ?? [];
    if (codes.length < 2 || codes.length > 3) {
      return errorResponse(422, "VALIDATION_ERROR", "Compare 2 or 3 products.", { fields: [{ field: "product_codes", problem: "must have 2 or 3 items" }] });
    }
    const amount = body.amount ?? 100000;
    const horizon = body.horizon_years ?? 5;
    if (amount < 10000 || amount > 10000000) {
      return errorResponse(422, "VALIDATION_ERROR", "Amount must be between CNY 10,000 and CNY 10,000,000.", { fields: [{ field: "amount", problem: "out of range" }] });
    }
    if (horizon < 1 || horizon > 30) {
      return errorResponse(422, "VALIDATION_ERROR", "Horizon must be between 1 and 30 years.", { fields: [{ field: "horizon_years", problem: "out of range" }] });
    }
    const unknown = codes.filter((c) => !findProduct(c));
    if (unknown.length) {
      return errorResponse(422, "VALIDATION_ERROR", `Unknown product code: ${unknown.join(", ")}.`, { fields: [{ field: "product_codes", problem: "unknown code" }] });
    }
    const profile = db.currentProfile(auth.user.id);
    const result = compareProducts(codes, amount, horizon);
    const items = result.items.map((i) => ({ ...i, suitable: profile ? i.risk_level <= profile.tier : null }));
    return HttpResponse.json({ ...result, items });
  }),

  // ------------------------------------------------------------ proposals
  http.post("/api/proposals", async ({ request }) => {
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    const forbidden = requireRole(auth.user, "client");
    if (forbidden) return forbidden;
    const profile = db.currentProfile(auth.user.id);
    const precondition = t2PreconditionError(profile);
    if (precondition) return precondition;
    const body = (await request.json()) as { amount?: number; horizon_years?: number; near_term_need?: number };
    const amount = body.amount ?? 0;
    const horizon = body.horizon_years ?? 0;
    const need = body.near_term_need ?? 0;
    if (amount < 10000) {
      return errorResponse(422, "VALIDATION_ERROR", "Amount must be at least CNY 10,000.", { fields: [{ field: "amount", problem: "too small" }] });
    }
    if (!Number.isInteger(horizon) || horizon < 1 || horizon > 30) {
      return errorResponse(422, "VALIDATION_ERROR", "Horizon must be a whole number of years from 1 to 30.", { fields: [{ field: "horizon_years", problem: "out of range" }] });
    }
    if (need < 0 || need > amount) {
      return errorResponse(422, "VALIDATION_ERROR", "Near-term need must be between CNY 0 and the amount.", { fields: [{ field: "near_term_need", problem: "out of range" }] });
    }
    const sandbox = db.sandboxFor(auth.user.id);
    if (amount > sandbox.cash) {
      return errorResponse(409, "INSUFFICIENT_CASH", `Your sandbox account only holds CNY ${sandbox.cash.toLocaleString()}.`);
    }
    const proposal = createProposal(auth.user.id, profile!, amount, horizon, need);
    logAction({ userId: auth.user.id, actor: "client", action: "proposal_created", decision: "allowed", detail: { proposal_id: proposal.id } });
    logAction({ userId: auth.user.id, actor: "system", action: "gate_decided", decision: "allowed", detail: { proposal_id: proposal.id, decision: proposal.gate.decision } });
    return HttpResponse.json(proposal, { status: 201 });
  }),

  http.get("/api/proposals", ({ request }) => {
    const auth = authenticateAs(request, "client");
    if (!isAuthResult(auth)) return auth;
    const list = [...db.proposalsFor(auth.user.id)].reverse().map(toSummary);
    return HttpResponse.json({ items: list });
  }),

  http.get("/api/proposals/:proposalId", ({ request, params }) => {
    const auth = authenticateAs(request, "client");
    if (!isAuthResult(auth)) return auth;
    const proposal = db.findProposal(auth.user.id, Number(params.proposalId));
    if (!proposal) return errorResponse(404, "NOT_FOUND", "Unknown proposal.");
    return HttpResponse.json(proposal);
  }),

  http.post("/api/proposals/:proposalId/revise", async ({ request, params }) => {
    const auth = authenticateAs(request, "client");
    if (!isAuthResult(auth)) return auth;
    const parent = db.findProposal(auth.user.id, Number(params.proposalId));
    if (!parent) return errorResponse(404, "NOT_FOUND", "Unknown proposal.");
    if (parent.status === "executed" || parent.status === "superseded") {
      return errorResponse(409, "STATE_CONFLICT", "This proposal can no longer be revised.");
    }
    const profile = db.currentProfile(auth.user.id);
    const precondition = t2PreconditionError(profile);
    if (precondition) return precondition;
    const body = (await request.json()) as { items?: { product_code: string; weight_pct: number }[] };
    const items = body.items ?? [];
    const codes = items.map((i) => i.product_code);
    if (items.length < 1 || items.length > 6 || new Set(codes).size !== codes.length) {
      return errorResponse(422, "VALIDATION_ERROR", "Use 1 to 6 different products.", { fields: [{ field: "items", problem: "1 to 6 unique products" }] });
    }
    if (items.some((i) => typeof i.weight_pct !== "number" || i.weight_pct < 0 || i.weight_pct > 100)) {
      return errorResponse(422, "VALIDATION_ERROR", "Each weight must be between 0 and 100.", { fields: [{ field: "items", problem: "weight out of range" }] });
    }
    const total = items.reduce((s, i) => s + i.weight_pct, 0);
    if (Math.abs(total - 100) > 0.01) {
      return errorResponse(422, "VALIDATION_ERROR", "Weights must add up to 100%.", { fields: [{ field: "items", problem: "weights must total 100" }] });
    }
    const result = reviseProposal(auth.user.id, parent, profile!, items);
    if (result.error || !result.proposal) {
      return errorResponse(422, "VALIDATION_ERROR", result.error ?? "Could not revise this proposal.");
    }
    logAction({ userId: auth.user.id, actor: "client", action: "proposal_revised", decision: "allowed", detail: { proposal_id: result.proposal.id, parent_id: parent.id } });
    logAction({ userId: auth.user.id, actor: "system", action: "gate_decided", decision: "allowed", detail: { proposal_id: result.proposal.id, decision: result.proposal.gate.decision } });
    return HttpResponse.json(result.proposal, { status: 201 });
  }),

  http.post("/api/proposals/:proposalId/acknowledge", async ({ request, params }) => {
    const auth = authenticateAs(request, "client");
    if (!isAuthResult(auth)) return auth;
    const proposal = db.findProposal(auth.user.id, Number(params.proposalId));
    if (!proposal) return errorResponse(404, "NOT_FOUND", "Unknown proposal.");
    const blocked = rejectedProposalError(proposal) ?? closedProposalError(proposal);
    if (blocked) return blocked;
    const body = (await request.json()) as { rule_ids?: string[] };
    const incoming = body.rule_ids ?? [];
    const set = new Set([...proposal.gate.acknowledged_rule_ids, ...incoming]);
    proposal.gate.acknowledged_rule_ids = Array.from(set);
    const softFailIds = proposal.gate.rules.filter((r) => r.type === "soft" && r.result === "fail").map((r) => r.id);
    const allAcknowledged = softFailIds.every((id) => set.has(id));
    if (proposal.status === "warning" && allAcknowledged) proposal.status = "acknowledged";
    logAction({ userId: auth.user.id, actor: "client", action: "warnings_acknowledged", decision: "allowed", detail: { proposal_id: proposal.id, rule_ids: incoming } });
    return HttpResponse.json(proposal);
  }),

  http.get("/api/proposals/:proposalId/quiz", ({ request, params }) => {
    const auth = authenticateAs(request, "client");
    if (!isAuthResult(auth)) return auth;
    const proposal = db.findProposal(auth.user.id, Number(params.proposalId));
    if (!proposal) return errorResponse(404, "NOT_FOUND", "Unknown proposal.");
    const blocked = rejectedProposalError(proposal) ?? closedProposalError(proposal);
    if (blocked) return blocked;
    return HttpResponse.json({ questions: buildQuiz(proposal) });
  }),

  http.post("/api/proposals/:proposalId/quiz", async ({ request, params }) => {
    const auth = authenticateAs(request, "client");
    if (!isAuthResult(auth)) return auth;
    const proposal = db.findProposal(auth.user.id, Number(params.proposalId));
    if (!proposal) return errorResponse(404, "NOT_FOUND", "Unknown proposal.");
    const blocked = rejectedProposalError(proposal) ?? closedProposalError(proposal);
    if (blocked) return blocked;
    const body = (await request.json()) as { answers?: Record<string, string> };
    const result = checkQuiz(proposal, body.answers ?? {});
    proposal.quiz_passed = result.passed;
    db.addQuizAttempt(proposal.id, { proposalId: proposal.id, answers: body.answers ?? {}, passed: result.passed, results: result.results, created_at: new Date().toISOString() });
    logAction({ userId: auth.user.id, actor: "client", action: "quiz_attempted", decision: result.passed ? "allowed" : "denied", detail: { proposal_id: proposal.id, passed: result.passed } });
    return HttpResponse.json(result);
  }),

  http.post("/api/proposals/:proposalId/confirm", async ({ request, params }) => {
    const auth = authenticateAs(request, "client");
    if (!isAuthResult(auth)) return auth;
    const proposal = db.findProposal(auth.user.id, Number(params.proposalId));
    if (!proposal) return errorResponse(404, "NOT_FOUND", "Unknown proposal.");
    const halted = haltedError(auth.user.id, proposal.id, "token_issued");
    if (halted) return halted;
    const rejected = rejectedProposalError(proposal);
    if (rejected) return rejected;
    if (proposal.status === "warning") return errorResponse(409, "WARNINGS_NOT_ACKNOWLEDGED", "Tick every warning before confirming.");
    if (proposal.status !== "passed" && proposal.status !== "acknowledged") {
      return errorResponse(409, "STATE_CONFLICT", "This proposal can no longer be confirmed.");
    }
    if (!proposal.quiz_passed) return errorResponse(409, "QUIZ_REQUIRED", "Pass the comprehension quiz first.");

    const itemsHash = await sha256Hex(canonicalStringify(proposal.items));
    const token = randomToken();
    const tokenHash = await hashToken(token);
    const expiresAt = Date.now() + CONFIRM_TOKEN_TTL_MS;
    db.storeConfirmToken({ tokenHash, proposalId: proposal.id, userId: auth.user.id, itemsHash, expiresAt, usedAt: null });
    logAction({ userId: auth.user.id, actor: "client", action: "token_issued", decision: "allowed", detail: { proposal_id: proposal.id } });
    return HttpResponse.json({ confirm_token: token, expires_at: new Date(expiresAt).toISOString() });
  }),

  http.post("/api/proposals/:proposalId/execute", async ({ request, params }) => {
    const auth = authenticateAs(request, "client");
    if (!isAuthResult(auth)) return auth;
    const proposal = db.findProposal(auth.user.id, Number(params.proposalId));
    if (!proposal) return errorResponse(404, "NOT_FOUND", "Unknown proposal.");
    const halted = haltedError(auth.user.id, proposal.id, "orders_executed");
    if (halted) return halted;
    const token = request.headers.get("X-Confirm-Token");
    if (!token) return errorResponse(403, "TOKEN_INVALID", "No confirmation token was supplied.");
    const tokenHash = await hashToken(token);
    const state = db.getConfirmToken(tokenHash);
    if (!state || state.proposalId !== proposal.id || state.userId !== auth.user.id) {
      return errorResponse(403, "TOKEN_INVALID", "This confirmation token is not valid for this proposal.");
    }
    if (Date.now() > state.expiresAt) return errorResponse(403, "TOKEN_EXPIRED", "This confirmation token has expired. Confirm again.");
    if (state.usedAt) return errorResponse(409, "TOKEN_USED", "This confirmation token was already used.");
    const currentItemsHash = await sha256Hex(canonicalStringify(proposal.items));
    if (currentItemsHash !== state.itemsHash) return errorResponse(409, "STATE_CONFLICT", "This proposal changed since you confirmed it.");
    if (proposal.status !== "passed" && proposal.status !== "acknowledged") {
      return errorResponse(409, "STATE_CONFLICT", `This proposal is ${proposal.status} and can no longer be executed.`);
    }

    const sandbox = db.sandboxFor(auth.user.id);
    if (sandbox.cash < proposal.amount) {
      return errorResponse(409, "INSUFFICIENT_CASH", "Your sandbox account no longer holds enough cash.");
    }

    const orders: Order[] = [];
    const nowIso = new Date().toISOString();
    for (const item of proposal.items) {
      const product = findProduct(item.product_code);
      if (!product) continue;
      const units = Math.floor((item.amount / product.nav) * 10000) / 10000;
      const cost = Math.round(units * product.nav * 100) / 100;
      const order: Order = {
        id: db.nextId("order"),
        product_code: item.product_code,
        amount: item.amount,
        units,
        nav: product.nav,
        cost,
        status: "filled",
        created_at: nowIso,
      };
      orders.push(order);
      db.addOrder(auth.user.id, order);
      db.applyOrder(auth.user.id, item.product_code, units, product.nav, cost);
    }
    state.usedAt = Date.now();
    proposal.status = "executed";

    const profile = db.currentProfile(auth.user.id)!;
    const quizAttempts = db.quizAttempts.get(proposal.id) ?? [];
    const lastQuiz = quizAttempts[quizAttempts.length - 1];
    const existingRecords = db.recordsFor(auth.user.id);
    const prevHash = existingRecords.length ? existingRecords[existingRecords.length - 1].hash : GENESIS_HASH;
    // Deep copies: advice records are never updated after insert (Section 3.5),
    // so later changes to the live proposal must not reach the hashed content.
    const content: AdviceRecord["content"] = structuredClone({
      profile: { version: profile.version, tier: profile.tier, capacity_score: profile.capacity_score, willingness_score: profile.willingness_score, replay_adjustment: profile.replay_adjustment },
      proposal,
      gate: proposal.gate,
      quiz: { passed: lastQuiz?.passed ?? false, results: lastQuiz?.results ?? [] },
      disclosures: DISCLOSURES.map((d) => ({ id: d.id, version: d.version })),
      consent_at: nowIso,
      orders,
    });
    const hash = await nextHash(prevHash, content);
    const record: AdviceRecord = {
      id: db.nextId("record"),
      user_id: auth.user.id,
      proposal_id: proposal.id,
      content,
      prev_hash: prevHash,
      hash,
      created_at: nowIso,
    };
    db.addRecord(auth.user.id, record);

    logAction({ userId: auth.user.id, actor: "client", action: "orders_executed", decision: "allowed", detail: { proposal_id: proposal.id, order_count: orders.length } });
    logAction({ userId: auth.user.id, actor: "system", action: "record_created", decision: "allowed", detail: { record_id: record.id } });

    return HttpResponse.json({
      proposal_id: proposal.id,
      status: "executed",
      orders,
      cash_after: sandbox.cash,
      record_id: record.id,
    });
  }),

  // ----------------------------------------------------------------- chat
  http.post("/api/chat", async ({ request }) => {
    const turn = await chatTurn(request);
    if (turn instanceof Response) return turn;
    const reply: Partial<typeof turn> = { ...turn };
    delete reply.toolCards; // stream-only
    return HttpResponse.json(reply);
  }),

  // P1 streaming chat: the same turn as server-sent events (status, each tool call, then the reply).
  http.post("/api/chat/stream", async ({ request }) => {
    const result = await chatTurn(request);
    if (result instanceof Response) return result;
    const { toolCards, ...turn } = result;
    // Each tool call travels with its card, so the drawer can show results while the turn runs.
    const toolFrames = turn.tool_calls.map((call, i): [string, unknown] => ["tool", { type: "tool", call, card: toolCards[i] ?? null }]);
    const frames: [string, unknown][] =
      turn.mode === "suspended"
        ? [["status", { type: "status", text: "The advisor is paused by compliance" }], ["reply", turn]]
        : [
            ["status", { type: "status", text: "Thinking" }],
            ...toolFrames,
            ["status", { type: "status", text: "Answering from a checked template" }],
            ["reply", turn],
          ];
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        for (const [event, data] of frames) {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          await delay(150);
        }
        controller.close();
      },
    });
    return new HttpResponse(stream, { headers: { "Content-Type": "text/event-stream" } });
  }),

  http.get("/api/chat/history", ({ request }) => {
    const auth = authenticateAs(request, "client");
    if (!isAuthResult(auth)) return auth;
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const list = db.chatFor(auth.user.id);
    return HttpResponse.json({ items: list.slice(-limit) });
  }),

  // -------------------------------------------------------------- sandbox
  http.get("/api/sandbox/account", ({ request }) => {
    const auth = authenticateAs(request, "client");
    if (!isAuthResult(auth)) return auth;
    const sandbox = db.sandboxFor(auth.user.id);
    const positions = db.positionsFor(auth.user.id);
    const totalValue = sandbox.cash + positions.reduce((s, p) => s + p.value, 0);
    return HttpResponse.json({ cash: sandbox.cash, positions, total_value: Math.round(totalValue * 100) / 100, data_label: "Simulated" });
  }),

  http.get("/api/sandbox/orders", ({ request }) => {
    const auth = authenticateAs(request, "client");
    if (!isAuthResult(auth)) return auth;
    return HttpResponse.json({ items: [...db.ordersFor(auth.user.id)].reverse() });
  }),

  // -------------------------------------------------------------- records
  http.get("/api/records", ({ request }) => {
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    const records = auth.user.role === "compliance" ? db.allRecords() : db.recordsFor(auth.user.id);
    const items = [...records]
      .sort((a, b) => b.id - a.id)
      .map((r) => ({
        id: r.id,
        proposal_id: r.proposal_id,
        date: r.created_at,
        decision: r.content.gate.decision,
        amount: r.content.proposal.amount,
        short_hash: r.hash.slice(0, 10),
      }));
    return HttpResponse.json({ items });
  }),

  http.get("/api/records/:recordId", ({ request, params }) => {
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    const id = Number(params.recordId);
    const pool = auth.user.role === "compliance" ? db.allRecords() : db.recordsFor(auth.user.id);
    const record = pool.find((r) => r.id === id);
    if (!record) return errorResponse(404, "NOT_FOUND", "Unknown advice record.");
    if (auth.user.role === "client" && record.user_id !== auth.user.id) {
      return errorResponse(403, "FORBIDDEN", "This record belongs to another client.");
    }
    return HttpResponse.json(record);
  }),

  http.post("/api/records/verify", async ({ request }) => {
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    const body = (await request.json().catch(() => ({}))) as { scope?: "mine" | "all" };
    const scope = body.scope === "all" && auth.user.role === "compliance" ? "all" : "mine";
    const result = await verifyChain(scope, auth.user.id, auth.user.role === "compliance");
    logAction({ userId: auth.user.id, actor: auth.user.role === "compliance" ? "compliance" : "client", action: "chain_verified", decision: "allowed", detail: { scope, valid: result.valid } });
    return HttpResponse.json(result);
  }),

  // ------------------------------------------------------------------ logs
  http.get("/api/logs", ({ request }) => {
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    const url = new URL(request.url);
    const actor = url.searchParams.get("actor");
    const action = url.searchParams.get("action");
    const decision = url.searchParams.get("decision");
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const offset = Number(url.searchParams.get("offset") ?? 0);

    let items: LogEntry[] = auth.user.role === "compliance" ? db.logs : db.logs.filter((l) => l.user_id === auth.user.id);
    if (actor) items = items.filter((l) => l.actor === actor);
    if (action) items = items.filter((l) => l.action === action);
    if (decision) items = items.filter((l) => l.decision === decision);
    items = [...items].reverse();
    const total = items.length;
    const page = items.slice(offset, offset + limit);
    return HttpResponse.json({ items: page, total });
  }),

  http.get("/api/logs/export", ({ request }) => {
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    const forbidden = requireRole(auth.user, "compliance");
    if (forbidden) return forbidden;
    const url = new URL(request.url);
    const format = url.searchParams.get("format") ?? "json";
    logAction({ userId: auth.user.id, actor: "compliance", action: "evidence_exported", decision: "allowed", detail: { format } });
    if (format === "csv") {
      const header = "id,ts,user_id,actor,action,tool,tier,decision,detail\n";
      const rows = db.logs
        .map((l) => [l.id, l.ts, l.user_id, l.actor, l.action, l.tool, l.tier, l.decision, l.detail].map(csvCell).join(","))
        .join("\n");
      return new HttpResponse(header + rows, {
        headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="operation_log.csv"' },
      });
    }
    return new HttpResponse(JSON.stringify(db.logs, null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="operation_log.json"' },
    });
  }),

  http.get("/api/compliance/rules", ({ request }) => {
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    return HttpResponse.json({ items: RULES });
  }),

  // ------------------------------------------------- compliance controls (additions)
  http.get("/api/controls", ({ request }) => {
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    return HttpResponse.json(db.controlsSnapshot(auth.user.role === "compliance"));
  }),

  http.post("/api/compliance/controls", async ({ request }) => {
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    const forbidden = requireRole(auth.user, "compliance");
    if (forbidden) return forbidden;
    const body = (await request.json().catch(() => ({}))) as { control?: ControlName; state?: ControlStateValue; reason?: string };
    const states = body.control ? CONTROL_STATES[body.control] : undefined;
    const reason = (body.reason ?? "").trim();
    if (!states || !body.state || !states.includes(body.state)) {
      return errorResponse(422, "VALIDATION_ERROR", "Choose a valid state for this switch.", { fields: [{ field: "state", problem: "not a state of this control" }] });
    }
    if (reason.length < 5 || reason.length > 300) {
      return errorResponse(422, "VALIDATION_ERROR", "Give a reason of 5 to 300 characters.", { fields: [{ field: "reason", problem: "length" }] });
    }
    if (db.controlState(body.control!) !== body.state) {
      db.setControl(body.control!, { state: body.state, reason, changedBy: auth.user.display_name, changedAt: new Date().toISOString() });
      logAction({
        userId: auth.user.id,
        actor: "compliance",
        action: CONTROL_ACTIONS[`${body.control}:${body.state}`],
        decision: "allowed",
        detail: { control: body.control, state: body.state, reason },
      });
    }
    return HttpResponse.json(db.controlsSnapshot(true));
  }),

  http.get("/api/compliance/overview", ({ request }) => {
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    const forbidden = requireRole(auth.user, "compliance");
    if (forbidden) return forbidden;
    return HttpResponse.json(oversightBody());
  }),

  http.get("/api/compliance/regulations", ({ request }) => {
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    return HttpResponse.json(regulationsBody());
  }),

  http.get("/api/compliance/model-card", async ({ request }) => {
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    const forbidden = requireRole(auth.user, "compliance");
    if (forbidden) return forbidden;
    const card = await modelCardBody();
    logAction({ userId: auth.user.id, actor: "compliance", action: "model_card_exported", decision: "allowed", detail: { content_sha256: card.content_sha256 } });
    return HttpResponse.json(card);
  }),

  http.get("/api/health", () => {
    return HttpResponse.json({ status: "ok", db: "ok", llm: "fallback", data_as_of: DATA_AS_OF });
  }),
];

/** One chat turn for both chat endpoints: checks, saves both messages, returns the reply or an error response. */
async function chatTurn(request: Request): Promise<(ChatReply & { toolCards: (ChatCard | null)[] }) | Response> {
  const auth = authenticateAs(request, "client");
  if (!isAuthResult(auth)) return auth;
  if (db.chatRateLimited(auth.user.id)) {
    return errorResponse(429, "RATE_LIMITED", "Too many messages. Wait a minute and try again.");
  }
  const body = (await request.json()) as { message?: string; proposal_id?: number };
  const message = (body.message ?? "").trim();
  if (!message || message.length > 1000) {
    return errorResponse(422, "VALIDATION_ERROR", "A message must be 1 to 1,000 characters.", { fields: [{ field: "message", problem: "length" }] });
  }
  db.recordChatMessage(auth.user.id);
  db.addChatMessage(auth.user.id, { message_id: db.nextId("message"), role: "user", content: message, created_at: new Date().toISOString() });
  await delay(350);
  const { reply, proposalsMade, toolCards } = respondToChat(auth.user.id, message, body.proposal_id);
  db.addChatMessage(auth.user.id, {
    message_id: reply.message_id,
    role: "assistant",
    content: reply.reply,
    mode: reply.mode,
    grounding: reply.grounding,
    tool_calls: reply.tool_calls,
    citations: reply.citations,
    cards: reply.cards,
    number_sources: reply.number_sources,
    created_at: reply.created_at,
  });
  // Addition: one entry per turn for the compliance Control Room.
  logAction({
    userId: auth.user.id,
    actor: "agent",
    action: "agent_turn",
    detail: {
      message_id: reply.message_id,
      mode: reply.mode,
      grounding: reply.grounding,
      tools: reply.tool_calls.map((t) => ({ tool: t.tool, tier: t.tier, decision: t.decision })),
      proposals: proposalsMade,
      figures_traced: reply.number_sources.length,
      cards: reply.cards.map((c) => c.type),
    },
  });
  return { ...reply, toolCards };
}
