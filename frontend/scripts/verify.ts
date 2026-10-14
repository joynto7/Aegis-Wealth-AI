import { scoreQuestionnaire, computeTier } from "../src/mocks/engines/scoring";
import { checkContradictions } from "../src/mocks/engines/contradictions";
import { buildAllocation } from "../src/mocks/engines/allocation";
import { computeMetrics } from "../src/mocks/engines/metrics";
import { computeStress } from "../src/mocks/engines/stress";
import { evaluateGate } from "../src/mocks/engines/gate";
import { compareProducts } from "../src/mocks/engines/fees";
import { runReplay } from "../src/mocks/engines/replay";
import { nextHash, GENESIS_HASH, canonicalStringify } from "../src/mocks/engines/chain";
import { buildQuiz, checkQuiz } from "../src/mocks/engines/quiz";
import type { Proposal } from "../src/lib/types";

function section(name: string) {
  console.log("\n=== " + name + " ===");
}

section("AT-03 Scoring");
const answers = { C1: "b", C2: "d", C3: "c", C4: "b", C5: "d", W1: "c", W2: "c", W3: "d", W4: "c", W5: "b" };
const scored = scoreQuestionnaire(answers);
console.log(scored);
console.log("expected: capacity 70, willingness 70, tier 4 ->", computeTier(scored.capacity_tier, scored.willingness_tier, 0));

section("Contradictions X2");
console.log(checkContradictions({ W3: "d", W4: "a", W1: "c", W2: "c", W5: "b", C1: "a", C2: "b", C3: "a", C4: "a", C5: "a" }));

section("AT-06 Allocation (tier 3, 200000, 8y, need 30000)");
const alloc = buildAllocation(3, 200000, 8, 30000);
console.log(JSON.stringify(alloc, null, 2));

section("Metrics + Stress for that allocation");
const metrics = computeMetrics(alloc.items);
console.log(metrics);
const stress = computeStress(alloc.class_weights_pct, 200000);
console.log(stress.map((s) => ({ scenario: s.scenario, loss_pct: s.loss_pct, loss_cny: s.loss_cny })));

section("Gate for that proposal (max loss 20%)");
const gate = evaluateGate({
  items: alloc.items,
  classWeightsPct: alloc.class_weights_pct,
  metrics,
  stress,
  tier: 3,
  amount: 200000,
  horizonYears: 8,
  nearTermNeed: 30000,
  maxAcceptableLossPct: 20,
});
console.log(gate.decision, gate.rules.filter((r) => r.result === "fail"));

section("AT-08 Fee comparison (SBF-01, SBF-02, BND-01; 50000; 8y) expect ~1460.89 / 1941.26 / 2418.36");
const cmp = compareProducts(["SBF-01", "SBF-02", "BND-01"], 50000, 8);
console.log(cmp.items.map((i) => ({ code: i.code, fee_cost: i.fee_cost, end_value_after_fees: i.end_value_after_fees })));
console.log("cheapest:", cmp.cheapest_code);

section("Push one equity fund to 60% -> expect REJECT R-03 (concentration)");
const badItems = alloc.items.map((i) => ({ product_code: i.product_code, weight_pct: i.weight_pct }));
const eqIdx = badItems.findIndex((i) => i.product_code === "IDX-01");
if (eqIdx >= 0) {
  const old = badItems[eqIdx].weight_pct;
  const diff = 60 - old;
  badItems[eqIdx].weight_pct = 60;
  const others = badItems.filter((_, i) => i !== eqIdx);
  const othersTotal = others.reduce((s, i) => s + i.weight_pct, 0);
  for (const o of others) o.weight_pct = Math.round(o.weight_pct - (o.weight_pct / othersTotal) * diff);
  const total = badItems.reduce((s, i) => s + i.weight_pct, 0);
  badItems[0].weight_pct += 100 - total;
}
console.log(badItems, "total:", badItems.reduce((s, i) => s + i.weight_pct, 0));

section("Replay E1 tier 4");
const replay = runReplay("E1", 4);
console.log({
  max_drawdown_pct: replay.max_drawdown_pct,
  lowest_month: replay.lowest_month,
  end_value: replay.end_value,
  months: replay.series.length,
});

async function main() {
  section("Hash chain");
  const h1 = await nextHash(GENESIS_HASH, { a: 1, b: 2 });
  const h2 = await nextHash(h1, { c: 3 });
  console.log({ h1, h2, canonical: canonicalStringify({ b: 2, a: 1 }) });

  section("Quiz determinism");
  const fakeProposal = {
    id: 101,
    amount: 200000,
    metrics: { liquid_share_pct: 40 },
    stress,
  } as unknown as Proposal;
  const quiz = buildQuiz(fakeProposal);
  console.log(JSON.stringify(quiz, null, 2));
  const correctAnswers: Record<string, string> = {};
  for (const q of quiz) {
    for (const opt of q.options) {
      const res = checkQuiz(fakeProposal, { [q.id]: opt.id });
      if (res.results.find((r) => r.id === q.id)?.correct) correctAnswers[q.id] = opt.id;
    }
  }
  console.log("correct combo:", correctAnswers, "passes all:", checkQuiz(fakeProposal, correctAnswers).passed);

  console.log("\nALL CHECKS RAN WITHOUT THROWING");
}

main();
