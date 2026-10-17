"""Fee comparison (Section 2.5.4; AT-08)."""

from __future__ import annotations

from app.engines.fees import compare_products
from tests.engine_helpers import allocate, failed, gate_for, item  # noqa: F401


def test_at08_fee_costs(catalog):
    r = compare_products([catalog.product(c) for c in ("SBF-01", "SBF-02", "BND-01")], 50_000, 8, catalog.gross_return)
    assert [i["fee_cost"] for i in r["items"]] == [1460.89, 1941.26, 2418.36]
    assert [i["end_value_after_fees"] for i in r["items"]] == [61877.61, 61397.25, 60920.14]
    assert r["cheapest_code"] == "SBF-01"
