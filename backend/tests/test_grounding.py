"""Grounding and wording check (Section 2.5.7; AT-09 at the unit level)."""

from __future__ import annotations

from app.agent.grounding import check_reply, extract_numbers

COMPARE = (
    "compare_products",
    {"items": [{"code": "SBF-01", "annual_fee_pct": 0.3, "fee_cost": 1460.89}, {"code": "SBF-02", "fee_cost": 1941.26}]},
)


def test_numbers_are_extracted_and_identifiers_ignored():
    found = [n.text for n in extract_numbers("SBF-01 costs CNY 1,461 (0.30%) under R-03 in S3 at tier T2; loss -6.73%.")]
    assert found == ["1,461", "0.30%", "-6.73%"]


def test_supported_numbers_pass_and_are_cited():
    r = check_reply("SBF-01 charges 0.30% a year: about CNY 1,461 over 8 years.", [COMPARE], "Why SBF-01 over 8 years?")
    assert r.passed
    assert {c["path"] for c in r.citations} == {"items[0].annual_fee_pct", "items[0].fee_cost"}


def test_an_invented_number_fails():
    r = check_reply("SBF-01 will cost CNY 1,700 in fees.", [COMPARE], "Which is cheapest?")
    assert not r.passed and r.unsupported == ["1,700"]


def test_rounding_must_be_real_rounding():
    assert check_reply("about CNY 1,461", [COMPARE], "").passed
    assert not check_reply("about CNY 1,462", [COMPARE], "").passed  # 1460.89 never rounds to 1,462


def test_percent_of_a_fraction_and_small_integers_and_years():
    r = check_reply("A 15% slice, 3 funds, since 2008.", [("t", {"weight": 0.15})], "")
    assert r.passed


def test_numbers_from_the_users_message_are_allowed():
    assert check_reply("For CNY 250,000 over 12 years:", [], "I have CNY 250,000 for 12 years").passed


def test_banned_phrases_fail_even_with_good_numbers():
    for phrase in ("This return is guaranteed.", "It's risk-free.", "You can't lose.", "I promise 6%."):
        r = check_reply(phrase, [("t", {"x": 6})], "")
        assert not r.passed and r.banned, phrase
