import type {
  AdviceRecord,
  ControlName,
  Goal,
  Controls,
  ControlStateValue,
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
import { navsAt } from "@/mocks/engines/market";
import type { Trade } from "@/mocks/engines/rebalance";
import type { DriftResult } from "@/mocks/engines/drift";
import { round2, round4 } from "@/mocks/engines/numbers";

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

/** A compliance switch that was flipped (addition); an absent switch is in its default state. */
interface ControlRow {
  state: ControlStateValue;
  reason: string;
  changedBy: string;
  changedAt: string;
}

const CONTROL_DEFAULTS: Record<ControlName, ControlStateValue> = { advisor: "active", execution: "open" };

/** The simulated market clock (addition): months replayed so far. No row means month 0. */
export interface MarketRow {
  month: number;
  reason: string;
  changedBy: string;
  changedAt: string;
}

/** A rebalancing proposal's trades (addition), priced at one market month against the holdings of that moment. */
export interface RebalanceRow {
  source_proposal_id: number;
  market_month: number;
  holdings_key: string;
  portfolio_value: number;
  trades: Trade[];
  totals: { sell_total: number; buy_total: number; net_cash: number; turnover_pct: number };
  drift: Pick<DriftResult, "classes" | "largest" | "portfolio_drift_pct" | "outside_band" | "band_pp">;
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
  controls = new Map<ControlName, ControlRow>();
  /** Saved goals per client (addition); the latest is the current one. */
  goals = new Map<number, Goal[]>();
  /** The simulated market clock and the rebalancing proposals' trades, by proposal id (monitoring loop). */
  market: MarketRow | null = null;
  rebalances = new Map<number, RebalanceRow>();
  private navCache: { month: number; navs: Record<string, number> } | null = null;

  private ids = { proposal: 100, log: 1, message: 1, order: 1, record: 1, session: 1, profile: 1, goal: 1 };

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
        controls: [...this.controls],
        goals: [...this.goals],
        market: this.market,
        rebalances: [...this.rebalances],
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
      this.goals = new Map(s.goals ?? []);
      this.ids = { goal: 1, ...s.ids };
      this.replayReactions = new Map(
        (s.replayReactions as [number, string[]][]).map(([id, episodes]) => [id, new Set(episodes)])
      );
      this.controls = new Map(s.controls ?? []);
      this.market = s.market ?? null;
      this.rebalances = new Map(s.rebalances ?? []);
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

  // --- goals (addition) ------------------------------------------------
  currentGoal(userId: number): Goal | undefined {
    const list = this.goals.get(userId) ?? [];
    return list[list.length - 1];
  }

  addGoal(userId: number, goal: Goal) {
    const list = this.goals.get(userId) ?? [];
    list.push(goal);
    this.goals.set(userId, list);
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

  // --- the simulated market (addition) ---------------------------------------
  marketMonth(): number {
    return this.market?.month ?? 0;
  }

  /** Every product's NAV at the current simulated month (engines/market.ts), computed once per month. */
  navs(): Record<string, number> {
    const month = this.marketMonth();
    if (this.navCache?.month !== month) this.navCache = { month, navs: navsAt(month) };
    return this.navCache.navs;
  }

  /** A rebalancing's sale: fewer units, more cash. */
  applySale(userId: number, productCode: string, units: number, proceeds: number) {
    const sandbox = this.sandboxFor(userId);
    const existing = sandbox.positions.get(productCode);
    if (existing) existing.units = round4(Math.max(0, existing.units - units));
    sandbox.cash = round2(sandbox.cash + proceeds);
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

  /** Positions valued at the current simulated NAV (addition: the market clock moves it). */
  positionsFor(userId: number): Position[] {
    const sandbox = this.sandboxFor(userId);
    const navs = this.navs();
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
        value: round2(pos.units * navs[code]),
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

  // --- compliance controls (addition) --------------------------------------
  controlState(name: ControlName): ControlStateValue {
    return this.controls.get(name)?.state ?? CONTROL_DEFAULTS[name];
  }

  setControl(name: ControlName, row: ControlRow) {
    this.controls.set(name, row);
  }

  /** Clients see the state only; the reason and who changed it are for compliance. */
  controlsSnapshot(forCompliance: boolean): Controls {
    const entry = (name: ControlName) => {
      const row = this.controls.get(name);
      return {
        state: row?.state ?? CONTROL_DEFAULTS[name],
        changed_at: row?.changedAt ?? null,
        reason: forCompliance ? (row?.reason ?? null) : null,
        changed_by: forCompliance ? (row?.changedBy ?? null) : null,
      };
    };
    return { advisor: entry("advisor"), execution: entry("execution") };
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
