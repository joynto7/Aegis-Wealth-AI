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

const failures: string[] = [];
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
}

section("AT-03 Scoring");
const answers = { C1: "b", C2: "d", C3: "c", C4: "b", C5: "d", W1: "c", W2: "c", W3: "d", W4: "c", W5: "b" };
const scored = scoreQuestionnaire(answers);
console.log(scored);
check("AT-03 scores", [scored.capacity_score, scored.willingness_score], [70, 70]);
check("AT-03 tier", computeTier(scored.capacity_tier, scored.willingness_tier, 0), 4);
check("AT-05 sell_all lowers tier once", computeTier(4, 4, 1), 3);
check("AT-05 tier never below 1", computeTier(1, 1, 1), 1);

section("Contradictions X2");
const x2 = checkContradictions({ W3: "d", W4: "a", W1: "c", W2: "c", W5: "b", C1: "a", C2: "b", C3: "a", C4: "a", C5: "a" });
console.log(x2);
check("AT-04 contradiction X2", x2.map((c) => c.id), ["X2"]);

section("AT-06 Allocation (tier 3, 200000, 8y, need 30000)");
const alloc = buildAllocation(3, 200000, 8, 30000);
console.log(JSON.stringify(alloc, null, 2));
check(
  "AT-06 proposal example in 2.6.5, item by item",
  alloc.items.map((i) => [i.product_code, i.weight_pct, i.amount]),
  [
    ["DEP-01", 15, 30000],
    ["SBF-01", 25, 50000],
    ["SBF-02", 25, 50000],
    ["GLD-01", 10, 20000],
    ["IDX-01", 25, 50000],
  ]
);
for (const tier of [1, 2, 3, 4, 5]) {
  for (const h of [2, 5, 10]) {
    for (const needPct of [0, 15]) {
      const a = buildAllocation(tier, 200000, h, (200000 * needPct) / 100);
      const total = a.items.reduce((s, i) => s + i.weight_pct, 0);
      const eg = a.class_weights_pct.equity + a.class_weights_pct.gold;
      if (total !== 100 || (h < 3 && eg > 20) || a.class_weights_pct.cash < needPct) {
        failures.push(`AT-06 tier ${tier}, ${h}y, need ${needPct}%: total ${total}, equity+gold ${eg}, cash ${a.class_weights_pct.cash}`);
      }
    }
  }
}
check("AT-06 empty class moves weight into the cash item", buildAllocation(3, 10000, 8, 9000).items.reduce((s, i) => s + i.weight_pct, 0), 100);
{
  // 7,000 / 100,000 x 100 is 7.000000000000001 in floating point, and rounding the other classes
  // up can push the total to 101: the floor must still be exactly 7%, and the total exactly 100.
  const tight = buildAllocation(5, 100000, 10, 7000);
  check("AT-06 liquidity floor survives float noise and rounding (tier 5, need 7%)", [tight.class_weights_pct.cash, tight.items.reduce((s, i) => s + i.weight_pct, 0)], [7, 100]);
  check("every item explains why it was chosen", alloc.items.every((i) => i.rationale.length > 20), true);
}

section("Metrics + Stress for that allocation");
const metrics = computeMetrics(alloc.items);
console.log(metrics);
const stress = computeStress(alloc.class_weights_pct, 200000);
console.log(stress.map((s) => ({ scenario: s.scenario, loss_pct: s.loss_pct, loss_cny: s.loss_cny })));
check("AT-08 stress loss_cny", stress.map((s) => s.loss_cny), [-12000, -13450, -25900]);
check("2.6.5 stress loss_pct", stress.map((s) => s.loss_pct), [-6, -6.73, -12.95]);
check("2.6.5 weighted fee / liquid share / largest weight", [metrics.weighted_fee_pct, metrics.liquid_share_pct, metrics.largest_weight_pct], [0.25, 40, 25]);

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
check("Scenario 1 step 8: gate PASS", gate.decision, "PASS");
check("every gate rule reports its measured value", gate.rules.every((r) => r.detail.length > 0), true);

section("AT-08 Fee comparison (SBF-01, SBF-02, BND-01; 50000; 8y) expect ~1460.89 / 1941.26 / 2418.36");
const cmp = compareProducts(["SBF-01", "SBF-02", "BND-01"], 50000, 8);
console.log(cmp.items.map((i) => ({ code: i.code, fee_cost: i.fee_cost, end_value_after_fees: i.end_value_after_fees })));
console.log("cheapest:", cmp.cheapest_code);
check("AT-08 fee costs", cmp.items.map((i) => i.fee_cost), [1460.89, 1941.26, 2418.36]);
check("2.6.5 cheapest", cmp.cheapest_code, "SBF-01");

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
{
  const items = badItems.map((b) => ({ ...alloc.items.find((i) => i.product_code === b.product_code)!, weight_pct: b.weight_pct }));
  const classWeights = { cash: 0, bond: 0, gold: 0, equity: 0 };
  for (const i of items) classWeights[i.asset_class] += i.weight_pct;
  const m = computeMetrics(items);
  const g = evaluateGate({ items, classWeightsPct: classWeights, metrics: m, stress: computeStress(classWeights, 200000), tier: 3, amount: 200000, horizonYears: 8, nearTermNeed: 30000, maxAcceptableLossPct: 20 });
  check("AT-07 / Scenario 1 step 10: REJECT naming R-03", [g.decision, g.rules.some((r) => r.id === "R-03" && r.result === "fail")], ["REJECT", true]);
  const r02Items = [...alloc.items.filter((i) => i.product_code !== "IDX-01"), { product_code: "HGF-01", name: "Sample High-Growth Fund A", asset_class: "equity" as const, risk_level: 5, weight_pct: 25, amount: 50000, rationale: "" }];
  const g2 = evaluateGate({ items: r02Items, classWeightsPct: alloc.class_weights_pct, metrics: computeMetrics(r02Items), stress, tier: 3, amount: 200000, horizonYears: 8, nearTermNeed: 30000, maxAcceptableLossPct: 20 });
  check("AT-07: product above tier gives REJECT with R-02", [g2.decision, g2.rules.find((r) => r.id === "R-02")?.result], ["REJECT", "fail"]);
}

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

  check("quiz passes with all correct answers", checkQuiz(fakeProposal, correctAnswers).passed, true);

  if (failures.length) {
    console.error(`\n${failures.length} CHECK(S) FAILED:\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }
  console.log("\nALL CHECKS PASSED");
}

main();
