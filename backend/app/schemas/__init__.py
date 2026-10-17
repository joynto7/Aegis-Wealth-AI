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
OrderSide = Literal["buy", "sell"]  # addition: a rebalancing sells as well as buys
ProposalKind = Literal["new", "rebalance"]  # addition
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


class DriftClass(BaseModel):
    """Addition: one asset class's live weight against its target."""

    asset_class: AssetClass
    target_pct: float
    current_pct: float
    drift_pp: float = Field(description="Live weight minus target, in percentage points.")
    outside_band: bool = Field(description="True when |drift_pp| is more than the band (rules.json drift_band_pp).")


class RebalanceTrade(BaseModel):
    """Addition: one order of a rebalancing, priced at the current simulated NAV."""

    product_code: str
    name: str
    asset_class: AssetClass
    side: OrderSide
    units: float
    nav: float
    amount: float
    from_pct: float = Field(description="The product's live weight before the trade.")
    to_pct: float = Field(description="Its target weight.")


class ProposalRebalance(BaseModel):
    """Addition: what a rebalancing proposal trades, priced at one market month and one set of holdings."""

    source_proposal_id: int = Field(description="The executed proposal whose mix it restores.")
    market_month: int
    market_as_of: str
    portfolio_value: float
    trades: list[RebalanceTrade]
    sell_total: float
    buy_total: float
    net_cash: float
    turnover_pct: float = Field(description="Sales as a share of the portfolio's value.")
    drift_before: list[DriftClass]
    band_pp: float = Field(description="The drift band when it was priced (rules.json drift_band_pp).")
    stale: bool = Field(description="True once prices or holdings have changed since it was priced: it can no longer execute.")


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
    rebalance: ProposalRebalance | None = Field(
        default=None, description="Addition: the trades of a rebalancing proposal; null for an ordinary proposal."
    )


class ProposalSummary(BaseModel):
    id: int
    version: int
    status: ProposalStatus
    amount: float
    tier: int
    gate_decision: GateDecision
    created_at: str
    kind: ProposalKind = Field(default="new", description="Addition: rebalance for a rebalancing proposal.")


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


# --- What-if and How to fix (additions) -----------------------------------------
class ProposalPreview(BaseModel):
    """A dry run of a revision: the same engines and gate, nothing saved."""

    proposal_id: int
    total_pct: float
    items: list[ProposalItem]
    class_weights_pct: ClassWeights
    metrics: ProposalMetrics
    stress: list[StressResult]
    gate: GateResult
    data_label: str


class RemedyChange(BaseModel):
    product_code: str
    name: str
    asset_class: AssetClass
    risk_level: int
    from_pct: float
    to_pct: float
    rule_ids: list[str]
    reasons: list[str]


class RemedyItem(BaseModel):
    product_code: str
    weight_pct: float


class Remedy(BaseModel):
    """The smallest change that gets the proposal through the gate, computed by code (a counterfactual explanation)."""

    proposal_id: int
    version: int
    gate_before: GateDecision
    failed_before: list[str]
    gate_after: GateDecision
    failed_after: list[str]
    fixed_rule_ids: list[str]
    changes: list[RemedyChange]
    items: list[RemedyItem]
    metrics_after: ProposalMetrics
    summary: str
    data_label: str


# --- Planning (additions): goal projections, goals, briefing, live-portfolio analytics ---
ProjectionBasisKind = Literal["proposal", "account", "tier"]


class ProjectionRequest(RequestBody):
    basis: ProjectionBasisKind = "tier"
    proposal_id: int | None = Field(default=None, ge=1, le=2_147_483_647)
    tier: int | None = Field(default=None, ge=1, le=5)
    amount: float | None = Field(default=None, ge=0, le=10_000_000)
    horizon_years: int | None = Field(default=None, ge=1, le=30)
    monthly_contribution: float = Field(default=0, ge=0, le=1_000_000)
    target_amount: float | None = Field(default=None, ge=1_000, le=100_000_000)
    compare_tiers: bool = True


class ProjectionBasis(BaseModel):
    kind: ProjectionBasisKind
    label: str
    proposal_id: int | None
    tier: int | None


class ProjectionBand(BaseModel):
    year: int
    p10: float
    p25: float
    p50: float
    p75: float
    p90: float


class ProjectionEnd(BaseModel):
    p10: float
    p25: float
    p50: float
    p75: float
    p90: float


class RequiredMonthly(BaseModel):
    confidence_pct: int
    monthly: float


class TierOutcome(BaseModel):
    tier: int
    label: str
    suitable: bool
    class_weights_pct: ClassWeights
    weighted_fee_pct: float
    probability_target_pct: float | None
    p10_end: float
    p50_end: float
    p90_end: float


class Projection(BaseModel):
    basis: ProjectionBasis
    amount: float
    horizon_years: int
    monthly_contribution: float
    target_amount: float | None
    class_weights_pct: ClassWeights
    weighted_fee_pct: float
    paths: int
    block_months: int
    seed: int
    method: str
    total_contributed: float
    years: list[ProjectionBand]
    end: ProjectionEnd
    probability_target_pct: float | None
    probability_loss_pct: float
    median_shortfall: float | None = Field(description="Median gap to the target in the paths that miss it.")
    required_monthly: list[RequiredMonthly] | None = Field(
        description="Monthly contribution needed for a 50%, 75% and 90% chance of reaching the target."
    )
    tiers: list[TierOutcome]
    client_tier: int | None
    data_label: str
    history_label: str


class GoalInput(RequestBody):
    name: str = Field(min_length=1, max_length=60)
    target_amount: float = Field(ge=1_000, le=100_000_000)
    horizon_years: int = Field(ge=1, le=30)
    monthly_contribution: float = Field(default=0, ge=0, le=1_000_000)


class Goal(BaseModel):
    id: int
    name: str
    target_amount: float
    horizon_years: int
    monthly_contribution: float
    created_at: str


class GoalEnvelope(BaseModel):
    goal: Goal | None


class Insight(BaseModel):
    id: str
    tone: Literal["positive", "attention", "info"]
    title: str
    body: str
    figure: str | None
    figure_label: str | None
    href: str | None
    action: str | None


class Insights(BaseModel):
    items: list[Insight]
    source: str
    generated_at: str


class PortfolioAnalytics(BaseModel):
    total_value: float
    cash: float
    invested: float
    class_weights_pct: ClassWeights
    weighted_fee_pct: float
    largest_position_pct: float
    positions: int
    stress: list[StressResult]
    data_label: str


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
    kind: ProposalKind = Field(default="new", description="Addition: rebalance for a rebalancing proposal.")


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


class ProjectionCardBand(BaseModel):
    year: int
    p10: float
    p50: float
    p90: float


class ProjectionCard(BaseModel):
    """Addition: the project_goal tool's result."""

    type: Literal["projection"]
    basis_label: str
    proposal_id: int | None
    amount: float
    horizon_years: int
    monthly_contribution: float
    target_amount: float | None
    total_contributed: float
    probability_target_pct: float | None
    probability_loss_pct: float
    median_shortfall: float | None
    end: ProjectionEnd
    required_monthly: list[RequiredMonthly] | None
    years: list[ProjectionCardBand]
    data_label: str


class RemedyCardChange(BaseModel):
    product_code: str
    name: str
    asset_class: AssetClass
    from_pct: float
    to_pct: float
    rule_ids: list[str]


class RemedyCard(BaseModel):
    """Addition: the suggest_fix tool's result; the client applies it with one click."""

    type: Literal["remedy"]
    proposal_id: int
    version: int
    gate_before: GateDecision
    gate_after: GateDecision
    failed_before: list[str]
    failed_after: list[str]
    fixed_rule_ids: list[str]
    changes: list[RemedyCardChange]
    items: list[RemedyItem]
    summary: str
    data_label: str


class DriftLargest(BaseModel):
    asset_class: AssetClass
    drift_pp: float


MonitoringStatus = Literal["none", "on_target", "drifted", "rule_breach"]


class DriftCard(BaseModel):
    """Addition: the check_drift tool's result; the client proposes a rebalancing with one click."""

    type: Literal["drift"]
    status: MonitoringStatus
    market_month: int
    market_as_of: str
    target_proposal_id: int | None
    total_value: float
    band_pp: float
    classes: list[DriftClass]
    largest: DriftLargest | None
    portfolio_drift_pct: float
    outside_band: bool
    rules_failing: list[str]
    sell_total: float | None
    turnover_pct: float | None
    open_rebalance_id: int | None
    data_label: str


ChatCard = Annotated[
    ProductsCard | ComparisonCard | ProposalCard | RuleCard | ProfileCard | BlockedCard | ProjectionCard | RemedyCard | DriftCard,
    Field(discriminator="type"),
]


class ChatRequest(RequestBody):
    message: str = Field(min_length=1, max_length=1000)
    proposal_id: int | None = None


class Provenance(BaseModel):
    """Addition: the explicit and machine-readable label on every reply (China's AI-content labelling measures,
    EU AI Act Art. 50). The same facts travel in the X-AI-Generated and X-AI-Content-SHA256 response headers."""

    label: str = Field(description="The visible label: AI-generated, Automated template (checked) or System notice.")
    ai_generated: bool
    generator: str
    provider: str | None
    model: str | None = Field(description="The model that served the reply, when the model answered.")
    mode: ChatMode
    config_fingerprint: str = Field(description="SHA-256 of the configuration that produced the reply.")
    content_sha256: str = Field(description="SHA-256 of the reply text exactly as shown.")
    created_at: str
    standards: list[str]


ChatRating = Literal["up", "down"]


class ChatFeedbackRequest(RequestBody):
    message_id: int = Field(ge=1, le=2_147_483_647)
    rating: ChatRating
    reason: str | None = Field(default=None, max_length=300)


class ChatFeedbackResult(BaseModel):
    message_id: int
    rating: ChatRating


class ChatReply(BaseModel):
    message_id: int
    mode: ChatMode
    grounding: ChatGrounding
    reply: str
    tool_calls: list[ToolCallSummary]
    citations: list[Citation]
    cards: list[ChatCard] = Field(description="Addition: the tool results behind the reply, as cards.")
    number_sources: list[NumberSource] = Field(description="Addition: the source of each figure in the reply.")
    provenance: Provenance = Field(description="Addition: the reply's AI label and fingerprints.")
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
    provenance: Provenance | None = None
    feedback: ChatRating | None = None
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
    side: OrderSide = Field(default="buy", description="Addition: sell for the sales of a rebalancing.")


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
    data_as_of: str = Field(description="The products' NAV date: the simulated market's date once it has moved (addition).")
    market_month: int = Field(default=0, description="Addition: months the simulated market has moved; 0 is the data date.")


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


class ThreatSignal(BaseModel):
    id: str
    label: str
    severity: Literal["low", "medium", "high"]
    owasp: str
    evidence: str


class TraceSpan(BaseModel):
    """One step of a turn, named after the OpenTelemetry GenAI semantic conventions."""

    span_id: int
    parent_id: int | None
    name: str
    start_ms: float
    duration_ms: float
    status: Literal["ok", "error"]
    attributes: dict[str, object]


ReviewStatus = Literal["open", "cleared", "escalated"]
ReviewSeverity = Literal["high", "medium", "low"]


class ReviewFlag(BaseModel):
    kind: str
    text: str
    severity: ReviewSeverity


class AgentTurn(BaseModel):
    log_id: int
    ts: str
    user_id: int | None
    mode: ChatMode
    grounding: ChatGrounding
    tools: list[TurnTool]
    proposals: list[TurnProposal]
    figures_traced: int
    signals: list[str] = Field(default_factory=list, description="Addition: ids of the message's threat signals.")
    flags: int = Field(default=0, description="Addition: how many review flags the turn raised.")
    review_status: ReviewStatus | None = Field(
        default=None, description="Addition: open, cleared or escalated; null if not flagged."
    )
    latency_ms: float | None = None


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
    threat_turns: int = Field(description="Addition: turns whose message raised a medium or high threat signal.")
    reviews_open: int = Field(description="Addition: flagged turns not yet cleared or escalated.")
    reviews_escalated: int
    feedback_down: int = Field(description="Addition: replies a client marked unhelpful.")


class Alert(BaseModel):
    id: str
    severity: Literal["high", "medium", "info"]
    title: str
    detail: str
    since: str | None


class Oversight(BaseModel):
    llm: Literal["ok", "fallback"]
    model: str
    system_prompt_sha256: str
    config_fingerprint: str = Field(description="Addition: the configuration fingerprint replies are tagged with.")
    controls: Controls
    kpis: OversightKpis
    alerts: list[Alert] = Field(description="Addition: conditions in the log that need attention.")
    turns: list[AgentTurn]


class ReviewItem(BaseModel):
    log_id: int
    ts: str
    user_id: int | None
    client: str | None
    message_preview: str
    mode: ChatMode
    grounding: ChatGrounding
    severity: ReviewSeverity
    flags: list[ReviewFlag]
    status: ReviewStatus
    decided_by: str | None
    decided_at: str | None
    note: str | None


class ReviewCounts(BaseModel):
    open: int
    cleared: int
    escalated: int


class ReviewQueue(BaseModel):
    items: list[ReviewItem]
    counts: ReviewCounts


class ReviewDecisionRequest(RequestBody):
    decision: Literal["cleared", "escalated"]
    note: str = Field(min_length=5, max_length=300)


class TurnFeedback(BaseModel):
    rating: ChatRating
    reason: str | None
    at: str


class TurnDetail(BaseModel):
    """Addition: everything about one AI turn, for the Control Room's turn inspector."""

    log_id: int
    ts: str
    user_id: int | None
    client: str | None
    message: str | None
    reply: str | None
    mode: ChatMode
    grounding: ChatGrounding
    fallback_reason: str | None
    served_model: str | None
    config_fingerprint: str | None
    latency_ms: float | None
    usage: dict[str, int]
    provenance: Provenance | None
    tools: list[ToolCallSummary]
    cards: list[str]
    proposals: list[TurnProposal]
    figures_traced: int
    signals: list[ThreatSignal]
    trace: list[TraceSpan]
    flags: list[ReviewFlag]
    status: ReviewStatus | None
    decided_by: str | None
    decided_at: str | None
    note: str | None
    feedback: TurnFeedback | None


class AiControl(BaseModel):
    id: str
    framework: str
    title: str
    ref: str
    requirement: str
    control: str
    check: Literal["built_in", "controls", "report", "reviews"]
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


class ModelCardSignal(BaseModel):
    id: str
    label: str
    severity: Literal["low", "medium", "high"]
    owasp: str


class ModelCardGovernance(BaseModel):
    """Addition: how the AI's output is labelled, fingerprinted, screened, traced and reviewed."""

    config_fingerprint: str
    config_components: dict[str, object]
    labelling: str
    threat_signals: list[ModelCardSignal]
    review_triggers: list[str]
    tracing: str


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
    governance: ModelCardGovernance
    content_sha256: str = Field(description="SHA-256 of this report without this field, for the record.")


# --- Monitoring loop (additions) ---------------------------------------------------
class MarketState(BaseModel):
    """Addition: the simulated market clock. Illustrative: it replays the synthetic monthly history."""

    month: int = Field(description="Months replayed so far; 0 is the data as of start_date.")
    as_of: str = Field(description="The simulated date: the last day of the current month.")
    replayed: str | None = Field(description="The history month whose returns were applied last.")
    next_replay: str = Field(description="The history month the next advance applies.")
    last_returns_pct: ClassWeights | None = Field(description="Each asset class's return in the last month applied.")
    since_start_pct: ClassWeights = Field(description="Each asset class's growth since start_date.")
    start_date: str
    replay_from: str
    max_months_per_advance: int
    changed_at: str | None
    changed_by: str | None = Field(description="Shown to the compliance role only.")
    reason: str | None = Field(description="Shown to the compliance role only.")
    data_label: str
    note: str


class MarketAdvanceRequest(RequestBody):
    months: int = Field(default=1, ge=1, le=12)
    reason: str = Field(min_length=5, max_length=300)


class DriftProduct(BaseModel):
    product_code: str
    name: str
    asset_class: AssetClass
    target_pct: float
    current_pct: float
    drift_pp: float
    value: float


class LiveRuleFailure(BaseModel):
    id: str
    name: str
    type: RuleType
    message: str | None
    detail: str
    new: bool = Field(description="True when the rule passed when the client confirmed the mix.")


class RebalancePreview(BaseModel):
    """The trades a rebalancing would place at today's simulated prices. Nothing is saved."""

    trades: list[RebalanceTrade]
    sell_total: float
    buy_total: float
    net_cash: float
    turnover_pct: float


class OpenRebalance(BaseModel):
    proposal_id: int
    version: int
    status: ProposalStatus
    gate_decision: GateDecision
    stale: bool


class PortfolioMonitoring(BaseModel):
    """Addition: the client's live portfolio against the mix they last agreed to (the latest executed proposal)."""

    market: MarketState
    status: MonitoringStatus
    target_proposal_id: int | None
    target_version: int | None
    total_value: float
    band_pp: float
    classes: list[DriftClass]
    products: list[DriftProduct]
    largest: DriftLargest | None
    portfolio_drift_pct: float
    outside_band: bool
    live_gate: GateDecision | None = Field(description="The gate's verdict on the live weights, with today's profile.")
    rules_failing: list[LiveRuleFailure]
    rebalance: RebalancePreview | None
    open_rebalance: OpenRebalance | None
    data_label: str


class ClientMonitoring(BaseModel):
    user_id: int
    client: str
    status: MonitoringStatus
    total_value: float
    target_proposal_id: int
    largest: DriftLargest
    portfolio_drift_pct: float
    outside_band: bool
    rules_failing: list[str]
    new_failures: list[str]
    open_rebalance: OpenRebalance | None


class MonitoringCounts(BaseModel):
    on_target: int
    drifted: int
    rule_breach: int


class MonitoringOverview(BaseModel):
    """Addition: every client's drift for the compliance officer, with the market clock."""

    market: MarketState
    band_pp: float
    clients: list[ClientMonitoring]
    counts: MonitoringCounts
    policy: str
