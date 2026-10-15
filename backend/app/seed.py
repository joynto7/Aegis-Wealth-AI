"""Seed data (FR-1.4): the 20 products, two clients and one compliance officer, CNY 500,000 sandbox cash each.

Runs automatically at start-up when the database is empty.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings
from app.core.security import hash_password
from app.engines.catalog import Catalog
from app.models import Product, SandboxAccount, User

DEMO_USERS = (
    # (id, email, role, display name) - ids match the frontend's mock data.
    (1, "officer@example.com", "compliance", "Amara (Compliance)"),
    (2, "rina@example.com", "client", "Rina"),
    (3, "chen@example.com", "client", "Chen"),
)
STARTING_CASH = 500_000.0


def seed_products(db: Session, catalog: Catalog) -> None:
    existing = {code for (code,) in db.execute(select(Product.code))}
    for p in catalog.products:
        if p.code in existing:
            continue
        db.add(
            Product(
                code=p.code,
                name=p.name,
                type=p.type,
                asset_class=p.asset_class,
                risk_level=p.risk_level,
                annual_fee_pct=p.annual_fee_pct,
                liquidity_days=p.liquidity_days,
                lockup_months=p.lockup_months,
                min_investment=p.min_investment,
                nav=p.nav,
                nav_date=p.nav_date,
                volatility_pct=p.volatility_pct,
                max_drawdown_pct=p.max_drawdown_pct,
                description=p.description,
            )
        )


def seed_users(db: Session, settings: Settings) -> None:
    for user_id, email, role, name in DEMO_USERS:
        db.add(
            User(
                id=user_id,
                email=email,
                role=role,
                display_name=name,
                password_hash=hash_password(settings.demo_password, settings.bcrypt_rounds),
            )
        )
    db.flush()  # users first: the accounts reference them
    for user_id, _email, role, _name in DEMO_USERS:
        if role == "client":
            db.add(SandboxAccount(user_id=user_id, cash=STARTING_CASH))


def seed_if_empty(factory: sessionmaker[Session], settings: Settings, catalog: Catalog) -> bool:
    with factory() as db:
        seed_products(db, catalog)
        seeded = False
        if (db.scalar(select(func.count()).select_from(User)) or 0) == 0:
            seed_users(db, settings)
            seeded = True
        db.commit()
        return seeded
