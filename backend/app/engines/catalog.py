"""Loads the versioned data files in backend/data (Section 2.5.1) into immutable values.

Everything the engines need arrives through a Catalog, so the engines stay
pure functions with no file, database or network access (NFR-5.1).
"""

from __future__ import annotations

import csv
import json
from collections.abc import Mapping
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from types import MappingProxyType
from typing import Any

ASSET_CLASSES: tuple[str, ...] = ("cash", "bond", "gold", "equity")


@dataclass(frozen=True)
class ProductSpec:
    code: str
    name: str
    type: str
    asset_class: str
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

    @property
    def liquid(self) -> bool:
        """Section 2.5.1: liquid means liquidity_days <= 1 and no lock-up."""
        return self.liquidity_days <= 1 and self.lockup_months == 0


@dataclass(frozen=True)
class MonthlyReturn:
    month: str
    equity: float
    bond: float
    gold: float
    cash: float

    def of(self, asset_class: str) -> float:
        return float(getattr(self, asset_class))


@dataclass(frozen=True)
class Scenario:
    id: str
    name: str
    shocks: Mapping[str, float]


@dataclass(frozen=True)
class Episode:
    id: str
    name: str
    start: str
    end: str


@dataclass(frozen=True)
class Catalog:
    products: tuple[ProductSpec, ...]
    history: tuple[MonthlyReturn, ...]
    questionnaire: Mapping[str, Any]
    max_loss_by_w4: Mapping[str, int]
    model_portfolios: Mapping[int, Mapping[str, float]]
    tier_labels: Mapping[int, str]
    scenarios: tuple[Scenario, ...]
    gross_return: Mapping[str, float]
    rules: tuple[Mapping[str, Any], ...]
    thresholds: Mapping[str, float]
    banned_phrases: tuple[str, ...]
    disclosures: tuple[Mapping[str, str], ...]
    episodes: tuple[Episode, ...]
    meta: Mapping[str, Any]
    by_code: Mapping[str, ProductSpec] = field(default_factory=dict)

    def product(self, code: str) -> ProductSpec | None:
        return self.by_code.get(code)

    def episode(self, episode_id: str) -> Episode | None:
        return next((e for e in self.episodes if e.id == episode_id), None)

    def tier_label(self, tier: int) -> str:
        return self.tier_labels.get(tier, "Unknown")

    @property
    def products_as_of(self) -> str:
        return str(self.meta["products"]["data_as_of"])

    @property
    def history_label(self) -> str:
        return str(self.meta["history"]["data_label"])

    @property
    def history_as_of(self) -> str:
        return str(self.meta["history"]["data_as_of"])


def _read_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def _freeze(value: Any) -> Any:
    if isinstance(value, dict):
        return MappingProxyType({k: _freeze(v) for k, v in value.items()})
    if isinstance(value, list):
        return tuple(_freeze(v) for v in value)
    return value


@lru_cache(maxsize=4)
def load_catalog(data_dir: Path) -> Catalog:
    with (data_dir / "products.csv").open(encoding="utf-8", newline="") as fh:
        products = tuple(
            ProductSpec(
                code=row["code"],
                name=row["name"],
                type=row["type"],
                asset_class=row["asset_class"],
                risk_level=int(row["risk_level"]),
                annual_fee_pct=float(row["annual_fee_pct"]),
                liquidity_days=int(row["liquidity_days"]),
                lockup_months=int(row["lockup_months"]),
                min_investment=float(row["min_investment"]),
                nav=float(row["nav"]),
                nav_date=row["nav_date"],
                volatility_pct=float(row["volatility_pct"]),
                max_drawdown_pct=float(row["max_drawdown_pct"]),
                description=row["description"],
            )
            for row in csv.DictReader(fh)
        )
    with (data_dir / "history_monthly.csv").open(encoding="utf-8", newline="") as fh:
        history = tuple(
            MonthlyReturn(
                month=row["month"],
                equity=float(row["equity"]),
                bond=float(row["bond"]),
                gold=float(row["gold"]),
                cash=float(row["cash"]),
            )
            for row in csv.DictReader(fh)
        )

    questionnaire = _read_json(data_dir / "questionnaire.json")
    portfolios = _read_json(data_dir / "model_portfolios.json")
    scenarios = _read_json(data_dir / "scenarios.json")
    assumptions = _read_json(data_dir / "assumptions.json")
    rules = _read_json(data_dir / "rules.json")
    disclosures = _read_json(data_dir / "disclosures.json")
    episodes = _read_json(data_dir / "episodes.json")
    meta = _read_json(data_dir / "data_meta.json")

    return Catalog(
        products=products,
        history=history,
        questionnaire=_freeze(questionnaire),
        max_loss_by_w4=_freeze(questionnaire["max_acceptable_loss_pct"]),
        model_portfolios=MappingProxyType(
            {int(t): MappingProxyType({c: float(w) for c, w in ws.items()}) for t, ws in portfolios["weights_pct"].items()}
        ),
        tier_labels=MappingProxyType({int(t): label for t, label in portfolios["tier_labels"].items()}),
        scenarios=tuple(
            Scenario(id=s["id"], name=s["name"], shocks=MappingProxyType(dict(s["shocks"]))) for s in scenarios["scenarios"]
        ),
        gross_return=MappingProxyType(dict(assumptions["gross_annual_return"])),
        rules=_freeze(rules["rules"]),
        thresholds=_freeze(rules["thresholds"]),
        banned_phrases=tuple(rules["banned_phrases"]),
        disclosures=_freeze(disclosures["disclosures"]),
        episodes=tuple(Episode(**e) for e in episodes["episodes"]),
        meta=_freeze(meta),
        by_code=MappingProxyType({p.code: p for p in products}),
    )
