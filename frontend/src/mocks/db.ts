import type {
  AdviceRecord,
  LogActor,
  LogDecision,
  LogEntry,
  Order,
  Position,
  Profile,
  Proposal,
  ChatMessage,
  QuizResult,
} from "@/lib/types";
import { SEED_USERS } from "@/mocks/data/users";
import { findProduct } from "@/mocks/data/products";

/**
 * Mock "database" — there is no real backend in this build, so this stands
 * in for Section 1.3.1's SQLite store. Seeded with two clients and one
 * compliance officer per FR-1.4, each client's sandbox account starting
 * with CNY 500,000 cash.
 *
 * It lives in page memory and is snapshotted to this tab's sessionStorage
 * after every mocked response (see src/mocks/browser.ts), so a refresh or a
 * typed URL keeps the session and the data. Closing the tab, or opening a
 * new one, starts a fresh demo.
 */

const SNAPSHOT_KEY = "aegis_mock_db_v1";

interface Session {
  token: string;
  userId: number;
  expiresAt: number;
}

interface SandboxState {
  cash: number;
  positions: Map<string, { units: number; avg_nav: number }>;
}

interface ConfirmTokenState {
  tokenHash: string;
  proposalId: number;
  userId: number;
  itemsHash: string;
  expiresAt: number;
  usedAt: number | null;
}

interface QuizAttemptState {
  proposalId: number;
  answers: Record<string, string>;
  passed: boolean;
  results: QuizResult["results"];
  created_at: string;
}

class MockDb {
  sessions = new Map<string, Session>();
  profiles = new Map<number, Profile[]>();
  proposals = new Map<number, Proposal[]>();
  chat = new Map<number, ChatMessage[]>();
  sandbox = new Map<number, SandboxState>();
  orders = new Map<number, Order[]>();
  records = new Map<number, AdviceRecord[]>();
  logs: LogEntry[] = [];
  confirmTokens = new Map<string, ConfirmTokenState>();
  quizAttempts = new Map<number, QuizAttemptState[]>();
  loginAttempts: number[] = []; // timestamps within the last minute
  /** episode ids already answered, per profile id ("unique per profile and episode", Section 3.5). */
  replayReactions = new Map<number, Set<string>>();
  chatTimestamps = new Map<number, number[]>();

  private ids = { proposal: 100, log: 1, message: 1, order: 1, record: 1, session: 1, profile: 1 };

  nextId(key: keyof MockDb["ids"]) {
    return this.ids[key]++;
  }

  // --- persistence ------------------------------------------------------
  /** Saves the whole store to this tab's sessionStorage. Never throws. */
  persist() {
    try {
      const snapshot = {
        ids: this.ids,
        sessions: [...this.sessions],
        profiles: [...this.profiles],
        proposals: [...this.proposals],
        chat: [...this.chat],
        sandbox: [...this.sandbox].map(([id, s]) => [id, { cash: s.cash, positions: [...s.positions] }]),
        orders: [...this.orders],
        records: [...this.records],
        logs: this.logs,
        confirmTokens: [...this.confirmTokens],
        quizAttempts: [...this.quizAttempts],
        replayReactions: [...this.replayReactions].map(([id, episodes]) => [id, [...episodes]]),
      };
      window.sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
    } catch {
      // Storage full, blocked or unavailable: the demo still works in memory.
    }
  }

  /** Loads the store saved by persist(), if this tab has one. Never throws. */
  restore() {
    try {
      const raw = typeof window === "undefined" ? null : window.sessionStorage.getItem(SNAPSHOT_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      this.ids = s.ids;
      this.sessions = new Map(s.sessions);
      this.profiles = new Map(s.profiles);
      this.proposals = new Map(s.proposals);
      this.chat = new Map(s.chat);
      this.sandbox = new Map(
        (s.sandbox as [number, { cash: number; positions: [string, { units: number; avg_nav: number }][] }][]).map(
          ([id, state]) => [id, { cash: state.cash, positions: new Map(state.positions) }]
        )
      );
      this.orders = new Map(s.orders);
      this.records = new Map(s.records);
      this.logs = s.logs;
      this.confirmTokens = new Map(s.confirmTokens);
      this.quizAttempts = new Map(s.quizAttempts);
      this.replayReactions = new Map(
        (s.replayReactions as [number, string[]][]).map(([id, episodes]) => [id, new Set(episodes)])
      );
    } catch {
      // A snapshot from an older build or a corrupt one: start fresh.
      window.sessionStorage.removeItem(SNAPSHOT_KEY);
    }
  }

  seed() {
    for (const user of SEED_USERS) {
      if (user.role === "client") {
        this.sandbox.set(user.id, { cash: 500000, positions: new Map() });
      }
      this.profiles.set(user.id, []);
      this.proposals.set(user.id, []);
      this.chat.set(user.id, []);
      this.orders.set(user.id, []);
      this.records.set(user.id, []);
    }
  }

  // --- sessions -------------------------------------------------------
  createSession(userId: number, token: string) {
    const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
    this.sessions.set(token, { token, userId, expiresAt });
    return expiresAt;
  }

  getSession(token: string | null | undefined): Session | null {
    if (!token) return null;
    const session = this.sessions.get(token);
    if (!session) return null;
    if (session.expiresAt < Date.now()) {
      this.sessions.delete(token);
      return null;
    }
    return session;
  }

  deleteSession(token: string | null | undefined) {
    if (token) this.sessions.delete(token);
  }

  // --- profiles ---------------------------------------------------------
  currentProfile(userId: number): Profile | undefined {
    const list = this.profiles.get(userId) ?? [];
    return list[list.length - 1];
  }

  addProfile(userId: number, profile: Profile) {
    const list = this.profiles.get(userId) ?? [];
    list.push(profile);
    this.profiles.set(userId, list);
  }

  // --- proposals ----------------------------------------------------------
  proposalsFor(userId: number): Proposal[] {
    return this.proposals.get(userId) ?? [];
  }

  findProposal(userId: number, id: number): Proposal | undefined {
    return this.proposalsFor(userId).find((p) => p.id === id);
  }

  addProposal(userId: number, proposal: Proposal) {
    const list = this.proposals.get(userId) ?? [];
    list.push(proposal);
    this.proposals.set(userId, list);
  }

  // --- chat -----------------------------------------------------------
  chatFor(userId: number): ChatMessage[] {
    return this.chat.get(userId) ?? [];
  }

  addChatMessage(userId: number, message: ChatMessage) {
    const list = this.chat.get(userId) ?? [];
    list.push(message);
    this.chat.set(userId, list);
  }

  // --- sandbox / orders -------------------------------------------------
  sandboxFor(userId: number): SandboxState {
    let s = this.sandbox.get(userId);
    if (!s) {
      s = { cash: 500000, positions: new Map() };
      this.sandbox.set(userId, s);
    }
    return s;
  }

  ordersFor(userId: number): Order[] {
    return this.orders.get(userId) ?? [];
  }

  addOrder(userId: number, order: Order) {
    const list = this.orders.get(userId) ?? [];
    list.push(order);
    this.orders.set(userId, list);
  }

  applyOrder(userId: number, productCode: string, units: number, nav: number, cost: number) {
    const sandbox = this.sandboxFor(userId);
    sandbox.cash = round2(sandbox.cash - cost);
    const existing = sandbox.positions.get(productCode);
    if (existing) {
      const totalUnits = existing.units + units;
      const totalCost = existing.units * existing.avg_nav + units * nav;
      existing.units = totalUnits;
      existing.avg_nav = totalUnits > 0 ? totalCost / totalUnits : nav;
    } else {
      sandbox.positions.set(productCode, { units, avg_nav: nav });
    }
  }

  positionsFor(userId: number): Position[] {
    const sandbox = this.sandboxFor(userId);
    const out: Position[] = [];
    for (const [code, pos] of sandbox.positions.entries()) {
      const product = findProduct(code);
      if (!product || pos.units <= 0) continue;
      out.push({
        product_code: code,
        name: product.name,
        asset_class: product.asset_class,
        units: round4(pos.units),
        avg_nav: round4(pos.avg_nav),
        value: round2(pos.units * product.nav),
      });
    }
    return out;
  }

  // --- confirm tokens -----------------------------------------------------
  storeConfirmToken(state: ConfirmTokenState) {
    this.confirmTokens.set(state.tokenHash, state);
  }

  getConfirmToken(tokenHash: string): ConfirmTokenState | undefined {
    return this.confirmTokens.get(tokenHash);
  }

  // --- quiz attempts --------------------------------------------------
  addQuizAttempt(proposalId: number, attempt: QuizAttemptState) {
    const list = this.quizAttempts.get(proposalId) ?? [];
    list.push(attempt);
    this.quizAttempts.set(proposalId, list);
  }

  // --- records ----------------------------------------------------------
  recordsFor(userId: number): AdviceRecord[] {
    return this.records.get(userId) ?? [];
  }

  allRecords(): AdviceRecord[] {
    return Array.from(this.records.values()).flat();
  }

  addRecord(userId: number, record: AdviceRecord) {
    const list = this.records.get(userId) ?? [];
    list.push(record);
    this.records.set(userId, list);
  }

  // --- logs -------------------------------------------------------------
  log(entry: Omit<LogEntry, "id" | "ts">) {
    this.logs.push({ id: this.nextId("log"), ts: new Date(nowIso()).toISOString(), ...entry });
  }

  // --- rate limiting ------------------------------------------------------
  // Section 2.8.2: at most 10 log-in attempts a minute — every attempt
  // counts, not just failed ones.
  recordLoginAttempt() {
    const now = Date.now();
    this.loginAttempts = this.loginAttempts.filter((t) => now - t < 60_000);
    this.loginAttempts.push(now);
  }

  loginRateLimited(): boolean {
    const now = Date.now();
    this.loginAttempts = this.loginAttempts.filter((t) => now - t < 60_000);
    return this.loginAttempts.length >= 10;
  }

  chatRateLimited(userId: number): boolean {
    const now = Date.now();
    const list = (this.chatTimestamps.get(userId) ?? []).filter((t) => now - t < 60_000);
    this.chatTimestamps.set(userId, list);
    return list.length >= 20;
  }

  recordChatMessage(userId: number) {
    const list = this.chatTimestamps.get(userId) ?? [];
    list.push(Date.now());
    this.chatTimestamps.set(userId, list);
  }
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

// `Date.now()`/`new Date()` are fine here — this is runtime mock-server
// state, not a workflow script. Kept behind one helper for clarity.
function nowIso() {
  return new Date().toISOString();
}

export const db = new MockDb();
db.seed();
db.restore();

export function logAction(opts: {
  userId: number | null;
  actor: LogActor;
  action: string;
  tool?: string | null;
  tier?: "T0" | "T1" | "T2" | "T3" | null;
  decision?: LogDecision | null;
  detail?: Record<string, unknown>;
}) {
  db.log({
    user_id: opts.userId,
    actor: opts.actor,
    action: opts.action,
    tool: opts.tool ?? null,
    tier: opts.tier ?? null,
    decision: opts.decision ?? null,
    detail: opts.detail ?? {},
  });
}
