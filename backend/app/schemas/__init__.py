"""Pydantic request and response models: the API contract of Section 2.6.

Names and fields mirror the contract exactly; the frontend's types are
generated from the OpenAPI file these produce (NFR-5.2). Additions beyond
Section 2.6 are marked and listed in docs/api-contract-changes.md.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# --- 2.6.3 Fixed values ------------------------------------------------------
UserRole = Literal["client", "compliance"]
ProfileStatus = Literal["complete", "needs_review"]
ProposalStatus = Literal["rejected", "warning", "acknowledged", "passed", "executed", "superseded"]
GateDecision = Literal["PASS", "WARNING", "REJECT"]
RuleType = Literal["hard", "soft"]
RuleResult = Literal["pass", "fail"]
ReplayReaction = Literal["hold", "buy_more", "sell_some", "sell_all"]
ProductType = Literal[
    "deposit",
    "money_market_fund",
    "short_term_bond_fund",
    "bond_fund",
    "gold_etf",
    "index_etf",
    "active_equity_fund",
    "thematic_equity_fund",
]
AssetClass = Literal["cash", "bond", "gold", "equity"]
ChatMode = Literal["model", "fallback", "suspended"]  # "suspended" is an addition (compliance controls)
ChatGrounding = Literal["passed", "regenerated", "fallback"]
LogActor = Literal["client", "agent", "system", "compliance"]
LogDecision = Literal["allowed", "denied"]
OrderStatus = Literal["filled"]
ToolTier = Literal["T0", "T1", "T2"]
LogTier = Literal["T0", "T1", "T2", "T3"]

# --- 2.6.2 Error format ------------------------------------------------------
ErrorCode = Literal[
    "UNAUTHENTICATED",
    "INVALID_CREDENTIALS",
    "FORBIDDEN",
    "TOKEN_INVALID",
    "TOKEN_EXPIRED",
    "NOT_FOUND",
    "PROFILE_REQUIRED",
    "CONTRADICTIONS_OPEN",
    "GATE_REJECTED",
    "WARNINGS_NOT_ACKNOWLEDGED",
    "QUIZ_REQUIRED",
    "TOKEN_USED",
    "STATE_CONFLICT",
    "INSUFFICIENT_CASH",
    "VALIDATION_ERROR",
    "RATE_LIMITED",
    "INTERNAL",
    "EXECUTION_HALTED",  # addition: compliance halted sandbox execution
]


class RequestBody(BaseModel):
    """Base for request bodies: unknown fields are rejected, strings trimmed."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ApiErrorDetail(BaseModel):
    code: ErrorCode
    message: str
    details: dict[str, object] | None = None


class ApiErrorBody(BaseModel):
    error: ApiErrorDetail


# --- Users / auth ------------------------------------------------------------
class User(BaseModel):
    id: int
    email: str
    role: UserRole
    display_name: str


class LoginRequest(RequestBody):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=200)


class UserEnvelope(BaseModel):
    user: User


# --- Risk profiling ----------------------------------------------------------
class QuestionOption(BaseModel):
    id: str
    label: str


class Question(BaseModel):
    id: str
    group: Literal["capacity", "willingness"]
    text: str
    options: list[QuestionOption]


class Questionnaire(BaseModel):
    version: str
    questions: list[Question]


class ProfileSubmit(RequestBody):
    answers: dict[str, str] = Field(max_length=20)


class Contradiction(BaseModel):
    id: str
    message: str
    question_ids: list[str]


class ProfileReplay(BaseModel):
    episode_id: str
    reaction: ReplayReaction


class Profile(BaseModel):
    id: int
    version: int
    status: ProfileStatus
    capacity_score: int
    willingness_score: int
    capacity_tier: int
    willingness_tier: int
    replay_adjustment: int
    tier: int
    tier_label: str
    max_acceptable_loss_pct: int
    contradictions: list[Contradiction]
    replay: ProfileReplay | None
    created_at: str


class ReplayEpisodeSummary(BaseModel):
    id: str
    name: str
    start: str
    end: str


class ReplayEpisodes(BaseModel):
    episodes: list[ReplayEpisodeSummary]


class ReplayPoint(BaseModel):
    month: str
    value: float


class ClassWeights(BaseModel):
    cash: float
    bond: float
    gold: float
    equity: float


class ReplayEvent(BaseModel):
    month: str
    text: str


class ReplayResult(BaseModel):
    episode: ReplayEpisodeSummary
    tier: int
    weights_pct: ClassWeights
    start_value: float
    series: list[ReplayPoint]
    max_drawdown_pct: float
    lowest_month: str
    end_value: float
    data_label: str
    data_as_of: str
    events: list[ReplayEvent] = Field(description="Addition: what happened in the world during the episode.")
    events_label: str = Field(description="Addition: says the events are real and the portfolio path illustrative.")


class ReplayReactionRequest(RequestBody):
    episode_id: str = Field(min_length=2, max_length=8)
    reaction: ReplayReaction


# --- Products ----------------------------------------------------------------
class Product(BaseModel):
    code: str
    name: str
    type: ProductType
    asset_class: AssetClass
    risk_level: int
    annual_fee_pct: float
    liquidity_days: int
    lockup_months: int
    min_investment: float
    nav: float
    nav_date: str
    volatility_pct: float
    max_drawdown_pct: float
    description: str
    suitable: bool | None
    data_label: str


class ProductList(BaseModel):
    items: list[Product]


class CompareRequest(RequestBody):
    product_codes: list[str] = Field(min_length=2, max_length=3)
    amount: float = Field(ge=10_000, le=10_000_000)
    horizon_years: int = Field(ge=1, le=30)

    @field_validator("product_codes")
    @classmethod
    def _unique(cls, codes: list[str]) -> list[str]:
        if len(set(codes)) != len(codes):
            raise ValueError("choose 2 or 3 different products")
        return codes


class CompareItem(BaseModel):
    code: str
    name: str
    risk_level: int
    suitable: bool | None
    annual_fee_pct: float
    assumed_return_pct: float
    fee_cost: float
    end_value_after_fees: float
    liquidity_days: int
    lockup_months: int


class CompareResult(BaseModel):
    amount: float
    horizon_years: int
    items: list[CompareItem]
    cheapest_code: str
    data_label: str


# --- Proposals ---------------------------------------------------------------
class ProposalCreate(RequestBody):
    amount: float = Field(ge=10_000, le=10_000_000)
    horizon_years: int = Field(ge=1, le=30)
    near_term_need: float = Field(ge=0, le=10_000_000)


class ProposalItem(BaseModel):
    product_code: str
    name: str
    asset_class: AssetClass
    risk_level: int
    weight_pct: float
    amount: float
    rationale: str = Field(description="Addition: why the engine (or the client) chose this product, in plain words.")


class ProposalMetrics(BaseModel):
    volatility_pct: float
    max_drawdown_pct: float
    weighted_fee_pct: float
    liquid_share_pct: float
    largest_weight_pct: float


class StressContribution(BaseModel):
    cash: float
    bond: float
    gold: float
    equity: float


class StressResult(BaseModel):
    scenario: Literal["S1", "S2", "S3"]
    name: str
    loss_pct: float
    loss_cny: float
    contributions: StressContribution


class GateRule(BaseModel):
    id: str
    type: RuleType
    result: RuleResult
    message: str | None
    detail: str = Field(description="Addition: the measured value against the rule's limit, pass or fail.")


class GateResult(BaseModel):
    decision: GateDecision
    rules: list[GateRule]
    acknowledged_rule_ids: list[str]


class Proposal(BaseModel):
    id: int
    version: int
    parent_id: int | None
    status: ProposalStatus
    tier: int
    amount: float
    horizon_years: int
    near_term_need: float
    items: list[ProposalItem]
    class_weights_pct: ClassWeights
    metrics: ProposalMetrics
    stress: list[StressResult]
    gate: GateResult
    quiz_passed: bool
    notes: list[str]
    data_label: str
    data_as_of: str
    created_at: str


class ProposalSummary(BaseModel):
    id: int
    version: int
    status: ProposalStatus
    amount: float
    tier: int
    gate_decision: GateDecision
    created_at: str


class ProposalList(BaseModel):
    items: list[ProposalSummary]


class ReviseItem(RequestBody):
    product_code: str = Field(min_length=1, max_length=10)
    weight_pct: float = Field(ge=0, le=100)


class ReviseRequest(RequestBody):
    items: list[ReviseItem] = Field(min_length=1, max_length=6)

    @field_validator("items")
    @classmethod
    def _unique_products(cls, items: list[ReviseItem]) -> list[ReviseItem]:
        codes = [i.product_code for i in items]
        if len(set(codes)) != len(codes):
            raise ValueError("each product may appear once")
        return items


class AcknowledgeRequest(RequestBody):
    rule_ids: list[str] = Field(max_length=9)


class QuizOption(BaseModel):
    id: str
    label: str


class QuizQuestion(BaseModel):
    id: Literal["Q1", "Q2", "Q3"]
    text: str
    options: list[QuizOption]


class QuizQuestions(BaseModel):
    questions: list[QuizQuestion]


class QuizSubmit(RequestBody):
    answers: dict[str, str] = Field(max_length=3)


class QuizQuestionResult(BaseModel):
    id: str
    correct: bool
    explanation: str


class QuizResult(BaseModel):
    passed: bool
    results: list[QuizQuestionResult]


# --- Chat --------------------------------------------------------------------
class ToolCallSummary(BaseModel):
    tool: str
    tier: ToolTier
    decision: LogDecision
    summary: str


class Citation(BaseModel):
    tool: str
    path: str
    value: float | str


class NumberSource(BaseModel):
    """Addition: where one figure in the reply came from, by its character span in the reply."""

    start: int
    end: int
    text: str
    kind: Literal["tool", "message", "context"]
    tool: str | None
    path: str | None
    value: float


# --- Chat cards (addition): tool results shown beside the reply ------------------------
class RuleBasis(BaseModel):
    framework: str
    title: str
    ref: str
    requirement: str


class ProductsCardItem(BaseModel):
    code: str
    name: str
    type: ProductType
    risk_level: int
    annual_fee_pct: float
    suitable: bool | None


class ProductsCard(BaseModel):
    type: Literal["products"]
    items: list[ProductsCardItem]
    total: int
    data_label: str


class ComparisonCard(BaseModel):
    type: Literal["comparison"]
    amount: float
    horizon_years: int
    items: list[CompareItem]
    cheapest_code: str
    data_label: str


class FailedRule(BaseModel):
    id: str
    name: str
    type: RuleType
    detail: str


class ProposalCard(BaseModel):
    type: Literal["proposal"]
    proposal_id: int
    version: int
    status: ProposalStatus
    amount: float
    horizon_years: int
    tier: int
    class_weights_pct: ClassWeights
    gate_decision: GateDecision
    failed_rules: list[FailedRule]
    data_label: str


class RuleCard(BaseModel):
    type: Literal["rule"]
    id: str
    rule_type: RuleType
    name: str
    description: str
    threshold: str
    basis: list[RuleBasis]


class ProfileCard(BaseModel):
    type: Literal["profile"]
    tier: int
    tier_label: str
    capacity_score: int
    willingness_score: int
    max_acceptable_loss_pct: int
    status: ProfileStatus


class BlockedCard(BaseModel):
    type: Literal["blocked"]
    tool: str
    tier: LogTier
    reason: str


ChatCard = Annotated[
    ProductsCard | ComparisonCard | ProposalCard | RuleCard | ProfileCard | BlockedCard, Field(discriminator="type")
]


class ChatRequest(RequestBody):
    message: str = Field(min_length=1, max_length=1000)
    proposal_id: int | None = None


class ChatReply(BaseModel):
    message_id: int
    mode: ChatMode
    grounding: ChatGrounding
    reply: str
    tool_calls: list[ToolCallSummary]
    citations: list[Citation]
    cards: list[ChatCard] = Field(description="Addition: the tool results behind the reply, as cards.")
    number_sources: list[NumberSource] = Field(description="Addition: the source of each figure in the reply.")
    created_at: str


class ChatMessage(BaseModel):
    message_id: int
    role: Literal["user", "assistant"]
    content: str
    mode: ChatMode | None = None
    grounding: ChatGrounding | None = None
    tool_calls: list[ToolCallSummary] | None = None
    citations: list[Citation] | None = None
    cards: list[ChatCard] | None = None
    number_sources: list[NumberSource] | None = None
    created_at: str


class ChatHistory(BaseModel):
    items: list[ChatMessage]


# --- Sandbox execution ---------------------------------------------------------
class Order(BaseModel):
    id: int
    product_code: str
    amount: float
    units: float
    nav: float
    cost: float
    status: OrderStatus
    created_at: str


class OrderList(BaseModel):
    items: list[Order]


class Position(BaseModel):
    product_code: str
    name: str
    asset_class: AssetClass
    units: float
    avg_nav: float
    value: float


class SandboxAccount(BaseModel):
    cash: float
    positions: list[Position]
    total_value: float
    data_label: str


class ConfirmTokenResponse(BaseModel):
    confirm_token: str
    expires_at: str


class ExecuteResponse(BaseModel):
    proposal_id: int
    status: Literal["executed"]
    orders: list[Order]
    cash_after: float
    record_id: int


# --- Records and audit ---------------------------------------------------------
class RecordSummary(BaseModel):
    id: int
    proposal_id: int
    date: str
    decision: GateDecision
    amount: float
    short_hash: str


class RecordList(BaseModel):
    items: list[RecordSummary]


class RecordProfile(BaseModel):
    version: int
    tier: int
    capacity_score: int
    willingness_score: int
    replay_adjustment: int


class Disclosure(BaseModel):
    id: str
    version: str


class AdviceRecordContent(BaseModel):
    profile: RecordProfile
    proposal: Proposal
    gate: GateResult
    quiz: QuizResult
    disclosures: list[Disclosure]
    consent_at: str
    orders: list[Order]


class AdviceRecord(BaseModel):
    id: int
    user_id: int
    proposal_id: int
    content: AdviceRecordContent
    prev_hash: str
    hash: str
    created_at: str


class VerifyRequest(RequestBody):
    scope: Literal["mine", "all"] = "mine"


class VerifyResult(BaseModel):
    valid: bool
    checked: int
    broken_record_id: int | None


class LogEntry(BaseModel):
    id: int
    ts: str
    user_id: int | None
    actor: LogActor
    action: str
    tool: str | None
    tier: LogTier | None
    decision: LogDecision | None
    detail: dict[str, object]


class LogPage(BaseModel):
    items: list[LogEntry]
    total: int


class Rule(BaseModel):
    id: str
    type: RuleType
    name: str
    description: str
    threshold: str
    basis: list[RuleBasis] = Field(description="Addition: the regulatory requirement each rule is designed to meet.")


class RuleList(BaseModel):
    items: list[Rule]


class HealthStatus(BaseModel):
    status: Literal["ok"]
    db: Literal["ok"]
    llm: Literal["ok", "fallback"]
    data_as_of: str


# --- Compliance controls and oversight (additions) ---------------------------------------
ControlName = Literal["advisor", "execution"]
ControlStateValue = Literal["active", "suspended", "open", "halted"]


class ControlState(BaseModel):
    state: ControlStateValue
    changed_at: str | None
    reason: str | None = Field(description="Shown to the compliance role only.")
    changed_by: str | None = Field(description="Shown to the compliance role only.")


class Controls(BaseModel):
    advisor: ControlState
    execution: ControlState


class ControlChange(RequestBody):
    control: ControlName
    state: ControlStateValue
    reason: str = Field(min_length=5, max_length=300)


class TurnTool(BaseModel):
    tool: str
    tier: LogTier
    decision: LogDecision


class TurnProposal(BaseModel):
    tool: str
    proposal_id: int
    gate: GateDecision


class AgentTurn(BaseModel):
    log_id: int
    ts: str
    user_id: int | None
    mode: ChatMode
    grounding: ChatGrounding
    tools: list[TurnTool]
    proposals: list[TurnProposal]
    figures_traced: int


class OversightKpis(BaseModel):
    agent_turns: int
    model_turns: int
    template_turns: int
    suspended_turns: int
    tool_calls_t0: int
    tool_calls_t1: int
    tool_calls_t2: int
    denied_tool_calls: int
    agent_proposals: int
    agent_proposals_rejected: int
    grounding_rewrites: int
    grounding_fallbacks: int
    figures_traced: int
    orders_by_agent: int
    orders_by_clients: int


class Oversight(BaseModel):
    llm: Literal["ok", "fallback"]
    model: str
    system_prompt_sha256: str
    controls: Controls
    kpis: OversightKpis
    turns: list[AgentTurn]


class AiControl(BaseModel):
    id: str
    framework: str
    title: str
    ref: str
    requirement: str
    control: str
    check: Literal["built_in", "controls", "report"]
    note: str | None


class Framework(BaseModel):
    id: str
    short: str
    title: str
    jurisdiction: str


class Regulations(BaseModel):
    version: str
    note: str
    frameworks: list[Framework]
    ai_controls: list[AiControl]


class ModelCardAdvisor(BaseModel):
    provider: str
    model: str
    mode: Literal["model", "fallback"]
    effort: str
    max_tokens: int
    timeout_seconds: float
    max_tool_rounds: int
    history_messages: int
    system_prompt_sha256: str
    tools_sha256: str
    data_sent: str
    data_never_sent: str


class ModelCardTool(BaseModel):
    name: str
    tier: ToolTier
    description: str


class ModelCardTier(BaseModel):
    tier: LogTier
    scope: str


class ModelCardGrounding(BaseModel):
    allowed_numbers: str
    banned_phrases: list[str]
    on_failure: str


class ModelCardScenario(BaseModel):
    id: str
    name: str
    shocks_pct: ClassWeights


class ModelCardAllocation(BaseModel):
    tier_labels: dict[str, str]
    model_portfolios_pct: dict[str, ClassWeights]
    steps: list[str]
    assumed_gross_return_pct: ClassWeights
    stress_scenarios: list[ModelCardScenario]


class ModelCard(BaseModel):
    report: str
    generated_at: str
    advisor: ModelCardAdvisor
    tools: list[ModelCardTool]
    permission_tiers: list[ModelCardTier]
    grounding: ModelCardGrounding
    allocation: ModelCardAllocation
    rules: list[Rule]
    controls: Controls
    regulations: Regulations
    data_versions: dict[str, str]
    content_sha256: str = Field(description="SHA-256 of this report without this field, for the record.")
