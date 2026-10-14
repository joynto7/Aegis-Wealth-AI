/**
 * Shared API types for Aegis Wealth AI.
 *
 * These mirror the API contract in Section 2.6 of the project documentation
 * exactly (field names, fixed value strings, shapes). In the real build they
 * would be generated from the backend's OpenAPI file with openapi-typescript;
 * here they are hand-written so the frontend can be built and reviewed before
 * the backend exists, per the "mock-first frontend" rule (Section 2.10.3).
 */

// ---------------------------------------------------------------------------
// 2.6.3 Fixed values
// ---------------------------------------------------------------------------

export type UserRole = "client" | "compliance";
export type ProfileStatus = "complete" | "needs_review";
export type ProposalStatus =
  | "rejected"
  | "warning"
  | "acknowledged"
  | "passed"
  | "executed"
  | "superseded";
export type GateDecision = "PASS" | "WARNING" | "REJECT";
export type RuleType = "hard" | "soft";
export type RuleResult = "pass" | "fail";
export type ReplayReaction = "hold" | "buy_more" | "sell_some" | "sell_all";
export type ProductType =
  | "deposit"
  | "money_market_fund"
  | "short_term_bond_fund"
  | "bond_fund"
  | "gold_etf"
  | "index_etf"
  | "active_equity_fund"
  | "thematic_equity_fund";
export type AssetClass = "cash" | "bond" | "gold" | "equity";
export type ChatMode = "model" | "fallback";
export type ChatGrounding = "passed" | "regenerated" | "fallback";
export type LogActor = "client" | "agent" | "system" | "compliance";
export type LogDecision = "allowed" | "denied";
export type OrderStatus = "filled";

// ---------------------------------------------------------------------------
// 2.6.2 Error format
// ---------------------------------------------------------------------------

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_CREDENTIALS"
  | "FORBIDDEN"
  | "TOKEN_INVALID"
  | "TOKEN_EXPIRED"
  | "NOT_FOUND"
  | "PROFILE_REQUIRED"
  | "CONTRADICTIONS_OPEN"
  | "GATE_REJECTED"
  | "WARNINGS_NOT_ACKNOWLEDGED"
  | "QUIZ_REQUIRED"
  | "TOKEN_USED"
  | "STATE_CONFLICT"
  | "INSUFFICIENT_CASH"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "INTERNAL";

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// Users / auth
// ---------------------------------------------------------------------------

export interface User {
  id: number;
  email: string;
  role: UserRole;
  display_name: string;
}

// ---------------------------------------------------------------------------
// Risk profiling
// ---------------------------------------------------------------------------

export interface QuestionOption {
  id: string; // "a" .. "e"
  label: string;
  points: number;
}

export interface Question {
  id: string; // C1..C5, W1..W5
  group: "capacity" | "willingness";
  text: string;
  options: QuestionOption[];
}

export interface Questionnaire {
  version: string;
  questions: Question[];
}

export interface Contradiction {
  id: string; // X1, X2, X3
  message: string;
  question_ids: string[];
}

export interface ProfileReplay {
  episode_id: string;
  reaction: ReplayReaction;
}

export interface Profile {
  id: number;
  version: number;
  status: ProfileStatus;
  capacity_score: number;
  willingness_score: number;
  capacity_tier: number;
  willingness_tier: number;
  replay_adjustment: number;
  tier: number;
  tier_label: string;
  max_acceptable_loss_pct: number;
  contradictions: Contradiction[];
  replay: ProfileReplay | null;
  created_at: string;
}

export interface ReplayEpisodeSummary {
  id: string; // E1, E2, E3
  name: string;
  start: string;
  end: string;
}

export interface ReplayPoint {
  month: string;
  value: number;
}

export interface ReplayResult {
  episode: ReplayEpisodeSummary;
  tier: number;
  weights_pct: Record<AssetClass, number>;
  start_value: number;
  series: ReplayPoint[];
  max_drawdown_pct: number;
  lowest_month: string;
  end_value: number;
  data_label: string;
  data_as_of: string;
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export interface Product {
  code: string;
  name: string;
  type: ProductType;
  asset_class: AssetClass;
  risk_level: number; // 1..5
  annual_fee_pct: number;
  liquidity_days: number;
  lockup_months: number;
  min_investment: number;
  nav: number;
  nav_date: string;
  volatility_pct: number;
  max_drawdown_pct: number;
  description: string;
  suitable: boolean | null;
  data_label: string;
}

export interface CompareItem {
  code: string;
  name: string;
  risk_level: number;
  suitable: boolean | null;
  annual_fee_pct: number;
  assumed_return_pct: number;
  fee_cost: number;
  end_value_after_fees: number;
  liquidity_days: number;
  lockup_months: number;
}

export interface CompareResult {
  amount: number;
  horizon_years: number;
  items: CompareItem[];
  cheapest_code: string;
  data_label: string;
}

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

export interface ProposalItem {
  product_code: string;
  name: string;
  asset_class: AssetClass;
  risk_level: number;
  weight_pct: number;
  amount: number;
}

export interface ProposalMetrics {
  volatility_pct: number;
  max_drawdown_pct: number;
  weighted_fee_pct: number;
  liquid_share_pct: number;
  largest_weight_pct: number;
}

export interface StressContribution {
  cash: number;
  bond: number;
  gold: number;
  equity: number;
}

export interface StressResult {
  scenario: "S1" | "S2" | "S3";
  name: string;
  loss_pct: number;
  loss_cny: number;
  contributions: StressContribution;
}

export interface GateRule {
  id: string; // R-01 .. R-09
  type: RuleType;
  result: RuleResult;
  message: string | null;
}

export interface GateResult {
  decision: GateDecision;
  rules: GateRule[];
  acknowledged_rule_ids: string[];
}

export interface Proposal {
  id: number;
  version: number;
  parent_id: number | null;
  status: ProposalStatus;
  tier: number;
  amount: number;
  horizon_years: number;
  near_term_need: number;
  items: ProposalItem[];
  class_weights_pct: Record<AssetClass, number>;
  metrics: ProposalMetrics;
  stress: StressResult[];
  gate: GateResult;
  quiz_passed: boolean;
  notes: string[];
  data_label: string;
  data_as_of: string;
  created_at: string;
}

export interface ProposalSummary {
  id: number;
  version: number;
  status: ProposalStatus;
  amount: number;
  tier: number;
  gate_decision: GateDecision;
  created_at: string;
}

export interface QuizQuestion {
  id: "Q1" | "Q2" | "Q3";
  text: string;
  options: { id: string; label: string }[];
}

export interface QuizResult {
  passed: boolean;
  results: { id: string; correct: boolean; explanation: string }[];
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export interface ToolCallSummary {
  tool: string;
  tier: "T0" | "T1" | "T2";
  decision: LogDecision;
  summary: string;
}

export interface Citation {
  tool: string;
  path: string;
  value: number | string;
}

export interface ChatMessage {
  message_id: number;
  role: "user" | "assistant";
  content: string;
  mode?: ChatMode;
  grounding?: ChatGrounding;
  tool_calls?: ToolCallSummary[];
  citations?: Citation[];
  created_at: string;
}

export interface ChatReply {
  message_id: number;
  mode: ChatMode;
  grounding: ChatGrounding;
  reply: string;
  tool_calls: ToolCallSummary[];
  citations: Citation[];
  created_at: string;
}

// ---------------------------------------------------------------------------
// Sandbox execution
// ---------------------------------------------------------------------------

export interface Order {
  id: number;
  product_code: string;
  amount: number;
  units: number;
  nav: number;
  cost: number;
  status: OrderStatus;
  created_at: string;
}

export interface Position {
  product_code: string;
  name: string;
  asset_class: AssetClass;
  units: number;
  avg_nav: number;
  value: number;
}

export interface SandboxAccount {
  cash: number;
  positions: Position[];
  total_value: number;
  data_label: string;
}

export interface ConfirmTokenResponse {
  confirm_token: string;
  expires_at: string;
}

export interface ExecuteResponse {
  proposal_id: number;
  status: "executed";
  orders: Order[];
  cash_after: number;
  record_id: number;
}

// ---------------------------------------------------------------------------
// Records and audit
// ---------------------------------------------------------------------------

export interface RecordSummary {
  id: number;
  proposal_id: number;
  date: string;
  decision: GateDecision;
  amount: number;
  short_hash: string;
}

export interface AdviceRecord {
  id: number;
  user_id: number;
  proposal_id: number;
  content: {
    profile: Pick<Profile, "version" | "tier" | "capacity_score" | "willingness_score" | "replay_adjustment">;
    proposal: Proposal;
    gate: GateResult;
    quiz: QuizResult;
    disclosures: { id: string; version: string }[];
    consent_at: string;
    orders: Order[];
  };
  prev_hash: string;
  hash: string;
  created_at: string;
}

export interface VerifyResult {
  valid: boolean;
  checked: number;
  broken_record_id: number | null;
}

export interface LogEntry {
  id: number;
  ts: string;
  user_id: number | null;
  actor: LogActor;
  action: string;
  tool: string | null;
  tier: "T0" | "T1" | "T2" | "T3" | null;
  decision: LogDecision | null;
  detail: Record<string, unknown>;
}

export interface Rule {
  id: string;
  type: RuleType;
  name: string;
  description: string;
  threshold: string;
}

export interface HealthStatus {
  status: "ok";
  db: "ok";
  llm: "ok" | "fallback";
  data_as_of: string;
}
