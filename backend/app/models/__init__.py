"""The 16 tables of Section 3.5, plus `controls`, `goals`, `market_clock` and `rebalance_plans` (additions).

Ids are integer keys; JSON columns hold structures from Section 2.6.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    event,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.timeutil import utcnow


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(20))  # client | compliance
    display_name: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class SessionRow(Base):
    """Server-side sessions. `id` is the SHA-256 of the cookie value, never the value itself."""

    __tablename__ = "sessions"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Profile(Base):
    __tablename__ = "profiles"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    answers: Mapped[dict[str, str]] = mapped_column(JSON)
    capacity_score: Mapped[int] = mapped_column(Integer)
    willingness_score: Mapped[int] = mapped_column(Integer)
    capacity_tier: Mapped[int] = mapped_column(Integer)
    willingness_tier: Mapped[int] = mapped_column(Integer)
    replay_adjustment: Mapped[int] = mapped_column(Integer, default=0)
    tier: Mapped[int] = mapped_column(Integer)
    max_acceptable_loss_pct: Mapped[int] = mapped_column(Integer)
    contradictions: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20))  # complete | needs_review
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    reactions: Mapped[list[ReplayReaction]] = relationship(
        back_populates="profile", order_by="ReplayReaction.id", cascade="all, delete-orphan"
    )


class ReplayReaction(Base):
    __tablename__ = "replay_reactions"
    __table_args__ = (UniqueConstraint("profile_id", "episode_id", name="uq_reaction_profile_episode"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id"), index=True)
    episode_id: Mapped[str] = mapped_column(String(8))
    reaction: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    profile: Mapped[Profile] = relationship(back_populates="reactions")


class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(10), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    type: Mapped[str] = mapped_column(String(40))
    asset_class: Mapped[str] = mapped_column(String(10))
    risk_level: Mapped[int] = mapped_column(Integer)
    annual_fee_pct: Mapped[float] = mapped_column(Float)
    liquidity_days: Mapped[int] = mapped_column(Integer)
    lockup_months: Mapped[int] = mapped_column(Integer)
    min_investment: Mapped[float] = mapped_column(Float)
    nav: Mapped[float] = mapped_column(Float)
    nav_date: Mapped[str] = mapped_column(String(10))
    volatility_pct: Mapped[float] = mapped_column(Float)
    max_drawdown_pct: Mapped[float] = mapped_column(Float)
    description: Mapped[str] = mapped_column(Text)


class Proposal(Base):
    __tablename__ = "proposals"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id"))
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("proposals.id"), nullable=True)
    version: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20))
    tier: Mapped[int] = mapped_column(Integer)
    amount: Mapped[float] = mapped_column(Float)
    horizon_years: Mapped[int] = mapped_column(Integer)
    near_term_need: Mapped[float] = mapped_column(Float)
    items_hash: Mapped[str] = mapped_column(String(64))
    metrics: Mapped[dict[str, Any]] = mapped_column(JSON)
    stress: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    quiz_passed: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[list[str]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    items: Mapped[list[ProposalItem]] = relationship(
        back_populates="proposal", order_by="ProposalItem.position", cascade="all, delete-orphan"
    )
    gate: Mapped[GateResult] = relationship(back_populates="proposal", uselist=False, cascade="all, delete-orphan")
    # Addition: a rebalancing proposal's trades; None for an ordinary proposal.
    rebalance: Mapped[RebalancePlan | None] = relationship(
        foreign_keys="RebalancePlan.proposal_id", uselist=False, cascade="all, delete-orphan", lazy="joined"
    )


class ProposalItem(Base):
    __tablename__ = "proposal_items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    proposal_id: Mapped[int] = mapped_column(ForeignKey("proposals.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    position: Mapped[int] = mapped_column(Integer)
    weight_pct: Mapped[float] = mapped_column(Float)
    amount: Mapped[float] = mapped_column(Float)
    rationale: Mapped[str] = mapped_column(Text, default="")

    proposal: Mapped[Proposal] = relationship(back_populates="items")
    product: Mapped[Product] = relationship(lazy="joined")


class GateResult(Base):
    __tablename__ = "gate_results"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    proposal_id: Mapped[int] = mapped_column(ForeignKey("proposals.id"), unique=True)
    decision: Mapped[str] = mapped_column(String(10))
    rules: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    acknowledged_rule_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    proposal: Mapped[Proposal] = relationship(back_populates="gate")


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    proposal_id: Mapped[int] = mapped_column(ForeignKey("proposals.id"), index=True)
    answers: Mapped[dict[str, str]] = mapped_column(JSON)
    passed: Mapped[bool] = mapped_column(Boolean)
    results: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ConfirmToken(Base):
    __tablename__ = "confirm_tokens"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    proposal_id: Mapped[int] = mapped_column(ForeignKey("proposals.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    items_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class SandboxAccount(Base):
    __tablename__ = "sandbox_accounts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    cash: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("sandbox_accounts.id"), index=True)
    proposal_id: Mapped[int] = mapped_column(ForeignKey("proposals.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    amount: Mapped[float] = mapped_column(Float)
    units: Mapped[float] = mapped_column(Float)
    nav: Mapped[float] = mapped_column(Float)
    cost: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(10), default="filled")
    side: Mapped[str] = mapped_column(String(4), default="buy")  # addition: buy | sell (a rebalancing sells)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    product: Mapped[Product] = relationship(lazy="joined")


class Position(Base):
    __tablename__ = "positions"
    __table_args__ = (UniqueConstraint("account_id", "product_id", name="uq_position_account_product"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("sandbox_accounts.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    units: Mapped[float] = mapped_column(Float)
    avg_nav: Mapped[float] = mapped_column(Float)

    product: Mapped[Product] = relationship(lazy="joined")


class AdviceRecord(Base):
    """Never updated after insert: a trigger blocks UPDATE and DELETE, and the hash chain detects anything that gets past it."""

    __tablename__ = "advice_records"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    proposal_id: Mapped[int] = mapped_column(ForeignKey("proposals.id"), unique=True)
    content: Mapped[dict[str, Any]] = mapped_column(JSON)
    prev_hash: Mapped[str] = mapped_column(String(64))
    hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    proposal_id: Mapped[int | None] = mapped_column(ForeignKey("proposals.id"), nullable=True)
    role: Mapped[str] = mapped_column(String(10))  # user | assistant
    content: Mapped[str] = mapped_column(Text)
    tool_calls: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    citations: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    # Additions: the cards shown beside the reply and the source of each number in it.
    cards: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    number_sources: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    # Addition: the reply's AI label and fingerprints (China's labelling measures, EU AI Act Art. 50).
    provenance: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    grounding: Mapped[str | None] = mapped_column(String(12), nullable=True)
    mode: Mapped[str | None] = mapped_column(String(10), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class OperationLog(Base):
    """Append-only (a trigger blocks UPDATE and DELETE)."""

    __tablename__ = "operation_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    actor: Mapped[str] = mapped_column(String(12))  # client | agent | system | compliance
    action: Mapped[str] = mapped_column(String(40), index=True)
    tool: Mapped[str | None] = mapped_column(String(40), nullable=True)
    tier: Mapped[str | None] = mapped_column(String(4), nullable=True)
    decision: Mapped[str | None] = mapped_column(String(8), nullable=True)  # allowed | denied
    detail: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class Goal(Base):
    """The client's saved goal for the planner (addition). Rows are kept; the latest one is the current goal."""

    __tablename__ = "goals"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(60))
    target_amount: Mapped[float] = mapped_column(Float)
    horizon_years: Mapped[int] = mapped_column(Integer)
    monthly_contribution: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class MarketClock(Base):
    """The simulated market (addition): how many months of the illustrative history have been replayed.

    One row, kept per database; no row means month 0. Only the compliance role moves it, always with a reason.
    """

    __tablename__ = "market_clock"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)  # always 1
    month: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(300))
    updated_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class RebalancePlan(Base):
    """A rebalancing proposal's trades (addition), priced at one market month against the holdings of that moment."""

    __tablename__ = "rebalance_plans"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    proposal_id: Mapped[int] = mapped_column(ForeignKey("proposals.id"), unique=True)
    source_proposal_id: Mapped[int] = mapped_column(ForeignKey("proposals.id"))  # the executed proposal it restores
    market_month: Mapped[int] = mapped_column(Integer)
    holdings_hash: Mapped[str] = mapped_column(String(64))
    portfolio_value: Mapped[float] = mapped_column(Float)
    trades: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    totals: Mapped[dict[str, float]] = mapped_column(JSON)  # sell_total, buy_total, net_cash, turnover_pct
    drift: Mapped[dict[str, Any]] = mapped_column(JSON)  # the drift that prompted it
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Control(Base):
    """Compliance switches (addition): one row per control; no row means the default (advisor active, execution open)."""

    __tablename__ = "controls"
    id: Mapped[str] = mapped_column(String(20), primary_key=True)  # advisor | execution
    state: Mapped[str] = mapped_column(String(12))  # active | suspended ; open | halted
    reason: Mapped[str] = mapped_column(String(300))
    updated_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


APPEND_ONLY_TABLES = ("advice_records", "operation_logs")

# Columns added after the first release. create_all() creates missing tables but never alters existing ones,
# so a database from an earlier version gets these columns on start-up.
ADDED_COLUMNS: dict[str, dict[str, str]] = {
    "chat_messages": {
        "cards": "JSON NOT NULL DEFAULT '[]'",
        "number_sources": "JSON NOT NULL DEFAULT '[]'",
        "provenance": "JSON",
    },
    "orders": {"side": "VARCHAR(4) NOT NULL DEFAULT 'buy'"},
}


def add_missing_columns(engine) -> list[str]:  # noqa: ANN001
    added = []
    if engine.dialect.name != "sqlite":
        return added
    with engine.begin() as conn:
        for table, columns in ADDED_COLUMNS.items():
            existing = {row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})")}
            for name, ddl in columns.items():
                if existing and name not in existing:
                    conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")
                    added.append(f"{table}.{name}")
    return added


def _append_only_triggers(target, connection, **_kw) -> None:  # noqa: ANN001
    if connection.dialect.name != "sqlite":
        return
    for table in APPEND_ONLY_TABLES:
        for op in ("UPDATE", "DELETE"):
            connection.execute(
                text(
                    f"CREATE TRIGGER IF NOT EXISTS {table}_no_{op.lower()} BEFORE {op} ON {table} "
                    f"BEGIN SELECT RAISE(ABORT, '{table} is append-only'); END"
                )
            )


event.listen(Base.metadata, "after_create", _append_only_triggers)
