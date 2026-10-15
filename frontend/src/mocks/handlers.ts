import { http, HttpResponse, delay } from "msw";
import { db, logAction } from "@/mocks/db";
import { authenticate, errorResponse, isAuthResult, requireRole } from "@/mocks/helpers";
import { findUserByEmail } from "@/mocks/data/users";
import { randomToken, hashToken, CONFIRM_TOKEN_TTL_MS } from "@/mocks/engines/tokens";
import { canonicalStringify, nextHash, sha256Hex, GENESIS_HASH } from "@/mocks/engines/chain";
import { toPublicQuestionnaire } from "@/mocks/data/questionnaire";
import { MAX_ACCEPTABLE_LOSS_PCT } from "@/mocks/data/questionnaire";
import { scoreQuestionnaire, computeTier, tierLabel } from "@/mocks/engines/scoring";
import { checkContradictions } from "@/mocks/engines/contradictions";
import { REPLAY_EPISODES } from "@/mocks/data/replayEpisodes";
import { runReplay } from "@/mocks/engines/replay";
import { PRODUCTS, findProduct } from "@/mocks/data/products";
import { compareProducts } from "@/mocks/engines/fees";
import { createProposal, reviseProposal, toSummary } from "@/mocks/services/proposals";
import { buildQuiz, checkQuiz } from "@/mocks/engines/quiz";
import { DISCLOSURES } from "@/mocks/data/disclosures";
import { RULES } from "@/mocks/data/rules";
import { respondToChat } from "@/mocks/services/chat";
import { verifyChain } from "@/mocks/services/chain";
import { DATA_AS_OF } from "@/mocks/data/scenarios";
import type { AdviceRecord, LogEntry, Order, Profile } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

function age(iso: string) {
  return Date.now() - new Date(iso).getTime();
}

export const handlers = [
  // ---------------------------------------------------------------- auth
  http.post("/api/auth/login", async ({ request }) => {
    await delay(250);
    if (db.loginRateLimited()) {
      return errorResponse(429, "RATE_LIMITED", "Too many attempts; try again in a minute.");
    }
    const body = (await request.json()) as { email?: string; password?: string };
    const user = body.email ? findUserByEmail(body.email) : undefined;
    if (!user || user.password !== body.password) {
      db.recordLoginFailure();
      logAction({ userId: user?.id ?? null, actor: "system", action: "login", decision: "denied", detail: {} });
      return errorResponse(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }
    const token = randomToken();
    const expiresAt = db.createSession(user.id, token);
    logAction({ userId: user.id, actor: user.role === "compliance" ? "compliance" : "client", action: "login", decision: "allowed", detail: {} });
    // A real backend sets this via a Set-Cookie response header. MSW
    // responses are synthetic, so the browser never applies Set-Cookie on
    // them — the token travels in the body instead, and the page itself
    // writes the cookie (see src/lib/session-cookie.ts).
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
    const auth = authenticate(request);
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
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    const profile = db.currentProfile(auth.user.id);
    if (!profile) return errorResponse(404, "NOT_FOUND", "No risk profile yet.");
    return HttpResponse.json(profile);
  }),

  // -------------------------------------------------------------- replay
  http.get("/api/replay/episodes", ({ request }) => {
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    return HttpResponse.json({ episodes: REPLAY_EPISODES });
  }),

  http.get("/api/replay/:episodeId", ({ request, params }) => {
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    const profile = db.currentProfile(auth.user.id);
    if (!profile) return errorResponse(409, "PROFILE_REQUIRED", "Complete your risk profile first.");
    try {
      const result = runReplay(String(params.episodeId), profile.tier);
      return HttpResponse.json(result);
    } catch {
      return errorResponse(404, "NOT_FOUND", "Unknown episode.");
    }
  }),

  http.post("/api/profile/current/replay-reaction", async ({ request }) => {
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    const profile = db.currentProfile(auth.user.id);
    if (!profile) return errorResponse(409, "PROFILE_REQUIRED", "Complete your risk profile first.");
    const body = (await request.json()) as { episode_id?: string; reaction?: string };
    if (!body.episode_id || !body.reaction) {
      return errorResponse(422, "VALIDATION_ERROR", "episode_id and reaction are required.");
    }
    profile.replay = { episode_id: body.episode_id, reaction: body.reaction as never };
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
    if (!profile || age(profile.created_at) > 365 * DAY_MS) {
      return errorResponse(409, "PROFILE_REQUIRED", "You need a current risk profile first.");
    }
    if (profile.contradictions.length) {
      return errorResponse(409, "CONTRADICTIONS_OPEN", "Your risk profile has an answer that contradicts another. Fix it before requesting a proposal.");
    }
    const body = (await request.json()) as { amount?: number; horizon_years?: number; near_term_need?: number };
    const amount = body.amount ?? 0;
    const horizon = body.horizon_years ?? 0;
    const need = body.near_term_need ?? 0;
    if (amount < 10000) {
      return errorResponse(422, "VALIDATION_ERROR", "Amount must be at least CNY 10,000.", { fields: [{ field: "amount", problem: "too small" }] });
    }
    if (horizon < 1 || horizon > 30) {
      return errorResponse(422, "VALIDATION_ERROR", "Horizon must be between 1 and 30 years.", { fields: [{ field: "horizon_years", problem: "out of range" }] });
    }
    const sandbox = db.sandboxFor(auth.user.id);
    if (amount > sandbox.cash) {
      return errorResponse(409, "INSUFFICIENT_CASH", `Your sandbox account only holds CNY ${sandbox.cash.toLocaleString()}.`);
    }
    const proposal = createProposal(auth.user.id, profile, amount, horizon, need);
    logAction({ userId: auth.user.id, actor: "client", action: "proposal_created", decision: "allowed", detail: { proposal_id: proposal.id } });
    logAction({ userId: auth.user.id, actor: "system", action: "gate_decided", decision: "allowed", detail: { proposal_id: proposal.id, decision: proposal.gate.decision } });
    return HttpResponse.json(proposal, { status: 201 });
  }),

  http.get("/api/proposals", ({ request }) => {
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    const list = [...db.proposalsFor(auth.user.id)].reverse().map(toSummary);
    return HttpResponse.json({ items: list });
  }),

  http.get("/api/proposals/:proposalId", ({ request, params }) => {
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    const proposal = db.findProposal(auth.user.id, Number(params.proposalId));
    if (!proposal) return errorResponse(404, "NOT_FOUND", "Unknown proposal.");
    return HttpResponse.json(proposal);
  }),

  http.post("/api/proposals/:proposalId/revise", async ({ request, params }) => {
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    const parent = db.findProposal(auth.user.id, Number(params.proposalId));
    if (!parent) return errorResponse(404, "NOT_FOUND", "Unknown proposal.");
    if (parent.status === "executed" || parent.status === "superseded") {
      return errorResponse(409, "STATE_CONFLICT", "This proposal can no longer be revised.");
    }
    const profile = db.currentProfile(auth.user.id);
    if (!profile) return errorResponse(409, "PROFILE_REQUIRED", "You need a current risk profile first.");
    const body = (await request.json()) as { items?: { product_code: string; weight_pct: number }[] };
    const items = body.items ?? [];
    const total = items.reduce((s, i) => s + i.weight_pct, 0);
    if (Math.abs(total - 100) > 0.01) {
      return errorResponse(422, "VALIDATION_ERROR", "Weights must add up to 100%.", { fields: [{ field: "items", problem: "weights must total 100" }] });
    }
    const result = reviseProposal(auth.user.id, parent, profile, items);
    if (result.error || !result.proposal) {
      return errorResponse(422, "VALIDATION_ERROR", result.error ?? "Could not revise this proposal.");
    }
    logAction({ userId: auth.user.id, actor: "client", action: "proposal_revised", decision: "allowed", detail: { proposal_id: result.proposal.id, parent_id: parent.id } });
    logAction({ userId: auth.user.id, actor: "system", action: "gate_decided", decision: "allowed", detail: { proposal_id: result.proposal.id, decision: result.proposal.gate.decision } });
    return HttpResponse.json(result.proposal, { status: 201 });
  }),

  http.post("/api/proposals/:proposalId/acknowledge", async ({ request, params }) => {
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    const proposal = db.findProposal(auth.user.id, Number(params.proposalId));
    if (!proposal) return errorResponse(404, "NOT_FOUND", "Unknown proposal.");
    if (proposal.status === "rejected") return errorResponse(409, "GATE_REJECTED", "This proposal was rejected by the compliance gate.", { rule_ids: proposal.gate.rules.filter((r) => r.result === "fail" && r.type === "hard").map((r) => r.id) });
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
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    const proposal = db.findProposal(auth.user.id, Number(params.proposalId));
    if (!proposal) return errorResponse(404, "NOT_FOUND", "Unknown proposal.");
    return HttpResponse.json({ questions: buildQuiz(proposal) });
  }),

  http.post("/api/proposals/:proposalId/quiz", async ({ request, params }) => {
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    const proposal = db.findProposal(auth.user.id, Number(params.proposalId));
    if (!proposal) return errorResponse(404, "NOT_FOUND", "Unknown proposal.");
    const body = (await request.json()) as { answers?: Record<string, string> };
    const result = checkQuiz(proposal, body.answers ?? {});
    proposal.quiz_passed = result.passed;
    db.addQuizAttempt(proposal.id, { proposalId: proposal.id, answers: body.answers ?? {}, passed: result.passed, created_at: new Date().toISOString() });
    logAction({ userId: auth.user.id, actor: "client", action: "quiz_attempted", decision: result.passed ? "allowed" : "denied", detail: { proposal_id: proposal.id, passed: result.passed } });
    return HttpResponse.json(result);
  }),

  http.post("/api/proposals/:proposalId/confirm", async ({ request, params }) => {
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    const proposal = db.findProposal(auth.user.id, Number(params.proposalId));
    if (!proposal) return errorResponse(404, "NOT_FOUND", "Unknown proposal.");
    if (proposal.status === "rejected") return errorResponse(409, "GATE_REJECTED", "This proposal was rejected by the compliance gate.");
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
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    const proposal = db.findProposal(auth.user.id, Number(params.proposalId));
    if (!proposal) return errorResponse(404, "NOT_FOUND", "Unknown proposal.");
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
    const content: AdviceRecord["content"] = {
      profile: { version: profile.version, tier: profile.tier, capacity_score: profile.capacity_score, willingness_score: profile.willingness_score, replay_adjustment: profile.replay_adjustment },
      proposal,
      gate: proposal.gate,
      quiz: { passed: lastQuiz?.passed ?? true, results: [] },
      disclosures: DISCLOSURES.map((d) => ({ id: d.id, version: d.version })),
      consent_at: nowIso,
      orders,
    };
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
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    const forbidden = requireRole(auth.user, "client");
    if (forbidden) return forbidden;
    if (db.chatRateLimited(auth.user.id)) {
      return errorResponse(429, "RATE_LIMITED", "Too many messages; wait a moment and try again.");
    }
    const body = (await request.json()) as { message?: string; proposal_id?: number };
    const message = (body.message ?? "").trim();
    if (!message || message.length > 1000) {
      return errorResponse(422, "VALIDATION_ERROR", "A message must be 1 to 1,000 characters.", { fields: [{ field: "message", problem: "length" }] });
    }
    db.recordChatMessage(auth.user.id);
    db.addChatMessage(auth.user.id, { message_id: db.nextId("message"), role: "user", content: message, created_at: new Date().toISOString() });
    await delay(350);
    const reply = respondToChat(auth.user.id, message, body.proposal_id);
    db.addChatMessage(auth.user.id, {
      message_id: reply.message_id,
      role: "assistant",
      content: reply.reply,
      mode: reply.mode,
      grounding: reply.grounding,
      tool_calls: reply.tool_calls,
      citations: reply.citations,
      created_at: reply.created_at,
    });
    return HttpResponse.json(reply);
  }),

  http.get("/api/chat/history", ({ request }) => {
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const list = db.chatFor(auth.user.id);
    return HttpResponse.json({ items: list.slice(-limit) });
  }),

  // -------------------------------------------------------------- sandbox
  http.get("/api/sandbox/account", ({ request }) => {
    const auth = authenticate(request);
    if (!isAuthResult(auth)) return auth;
    const sandbox = db.sandboxFor(auth.user.id);
    const positions = db.positionsFor(auth.user.id);
    const totalValue = sandbox.cash + positions.reduce((s, p) => s + p.value, 0);
    return HttpResponse.json({ cash: sandbox.cash, positions, total_value: Math.round(totalValue * 100) / 100, data_label: "Simulated" });
  }),

  http.get("/api/sandbox/orders", ({ request }) => {
    const auth = authenticate(request);
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
      const header = "id,ts,user_id,actor,action,tool,tier,decision\n";
      const rows = db.logs
        .map((l) => [l.id, l.ts, l.user_id ?? "", l.actor, l.action, l.tool ?? "", l.tier ?? "", l.decision ?? ""].join(","))
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

  http.get("/api/health", () => {
    return HttpResponse.json({ status: "ok", db: "ok", llm: "fallback", data_as_of: DATA_AS_OF });
  }),
];
