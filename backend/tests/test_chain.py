"""Advice-record hash chain (Section 2.5.11; AT-11)."""

from __future__ import annotations

from app.engines.chain import GENESIS_HASH, canonical, first_broken, next_hash
from tests.engine_helpers import allocate, failed, gate_for, item  # noqa: F401


def test_chain_detects_the_first_edited_record():
    contents = [{"n": 1, "name": "Rina"}, {"n": 2}, {"n": 3}]
    chain, prev = [], GENESIS_HASH
    for i, c in enumerate(contents, start=1):
        h = next_hash(prev, c)
        chain.append((i, h, c))
        prev = h
    assert first_broken(chain) == (3, None)
    tampered = [(1, chain[0][1], chain[0][2]), (2, chain[1][1], {"n": 999}), (3, chain[2][1], chain[2][2])]
    assert first_broken(tampered) == (2, 2)


def test_canonical_json_matches_the_spec():
    assert canonical({"b": 1, "a": "é"}) == '{"a":"é","b":1}'
