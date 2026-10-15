"""Endpoints 10-12: product shelf, product detail, comparison (Module 3)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.core.auth import client_user, current_user
from app.core.database import get_db
from app.core.errors import ApiError
from app.engines.catalog import ProductSpec
from app.engines.fees import compare_products
from app.models import User
from app.routers.common import ERRORS
from app.schemas import CompareRequest, CompareResult, Product, ProductList, ProductType
from app.services import profiles
from app.services.context import AppContext, get_ctx

router = APIRouter(prefix="/products", tags=["products"], responses=ERRORS)


def _tier_of(db: Session, user: User) -> int | None:
    if user.role != "client":
        return None
    profile = profiles.latest(db, user.id)
    return profile.tier if profile else None


def product_schema(p: ProductSpec, tier: int | None) -> dict[str, Any]:
    return {
        "code": p.code,
        "name": p.name,
        "type": p.type,
        "asset_class": p.asset_class,
        "risk_level": p.risk_level,
        "annual_fee_pct": p.annual_fee_pct,
        "liquidity_days": p.liquidity_days,
        "lockup_months": p.lockup_months,
        "min_investment": p.min_investment,
        "nav": p.nav,
        "nav_date": p.nav_date,
        "volatility_pct": p.volatility_pct,
        "max_drawdown_pct": p.max_drawdown_pct,
        "description": p.description,
        "suitable": None if tier is None else p.risk_level <= tier,
        "data_label": "Sample data",
    }


@router.get("", response_model=ProductList)
def list_products(
    type: ProductType | None = Query(default=None),  # noqa: A002 - the contract's parameter name
    max_risk: int | None = Query(default=None, ge=1, le=5),
    q: str | None = Query(default=None, max_length=100),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    ctx: AppContext = Depends(get_ctx),
) -> dict:
    tier = _tier_of(db, user)
    needle = (q or "").strip().lower()
    items = [
        product_schema(p, tier)
        for p in ctx.catalog.products
        if (type is None or p.type == type)
        and (max_risk is None or p.risk_level <= max_risk)
        and (not needle or needle in p.name.lower() or needle in p.code.lower())
    ]
    return {"items": items}


@router.get("/{product_id}", response_model=Product)
def get_product(
    product_id: str = Path(max_length=10),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    ctx: AppContext = Depends(get_ctx),
) -> dict:
    product = ctx.catalog.product(product_id)
    if product is None:
        raise ApiError(404, "NOT_FOUND", "There is no product with this code.")
    return product_schema(product, _tier_of(db, user))


@router.post("/compare", response_model=CompareResult)
def compare(
    body: CompareRequest, user: User = Depends(client_user), db: Session = Depends(get_db), ctx: AppContext = Depends(get_ctx)
) -> dict:
    products = [ctx.catalog.product(c) for c in body.product_codes]
    unknown = [c for c, p in zip(body.product_codes, products, strict=True) if p is None]
    if unknown:
        raise ApiError(
            422,
            "VALIDATION_ERROR",
            f"Unknown product code: {', '.join(unknown)}.",
            {"fields": [{"field": "product_codes", "problem": "unknown code"}]},
        )
    result = compare_products(products, body.amount, body.horizon_years, ctx.catalog.gross_return)
    tier = _tier_of(db, user)
    for item in result["items"]:
        item["suitable"] = None if tier is None else item["risk_level"] <= tier
    return result
