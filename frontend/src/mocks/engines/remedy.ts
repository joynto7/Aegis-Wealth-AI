import type { AssetClass, GateDecision, ProposalItem, ProposalMetrics, StressResult } from "@/lib/types";
import { PRODUCTS, findProduct, isLiquid, type ProductRecord } from "@/mocks/data/products";
import { computeMetrics } from "@/mocks/engines/metrics";
import { computeStress } from "@/mocks/engines/stress";
import { evaluateGate } from "@/mocks/engines/gate";
import { round2 } from "@/mocks/engines/numbers";

/**
 * How to fix, a port of backend/app/engines/remedy.py: the smallest set of changes that gets a proposal
 * through the gate, in the same fixed order (R-02/R-06 swaps, R-01 total, R-05 horizon cap, R-03 concentration,
 * R-04 liquidity, then the soft rules R-07 and R-08/R-09), with the same tie-breaks, so the mock suggests the
 * backend's fix (scripts/verify.ts checks AT-07 and Scenario 4).
 */
const MAX_SINGLE = 40;
const SHORT_YEARS = 3;
const SHORT_CAP = 20;
const MAX_FEE = 1.0;
const STEP_PCT = 5;
const MAX_LOSS_STEPS = 20;
const EPS = 1e-9;

export interface RemedyChangeResult {
  product_code: string;
  name: string;
  asset_class: AssetClass;
  risk_level: number;
  from_pct: number;
  to_pct: number;
  rule_ids: string[];
  reasons: string[];
}

export interface RemedyResult {
  gate_before: GateDecision;
  failed_before: string[];
  gate_after: GateDecision;
  failed_after: string[];
  fixed_rule_ids: string[];
  changes: RemedyChangeResult[];
  items: { product_code: string; weight_pct: number }[];
  metrics_after: ProposalMetrics;
  summary: string;
}

const g = (n: number) => String(Number(n.toPrecision(6)));
const codeOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function product(code: string): ProductRecord {
  const p = findProduct(code);
  if (!p) throw new Error(`Unknown product ${code}`);
  return p;
}

function classWeightsOf(items: { asset_class: AssetClass; weight_pct: number }[]): Record<AssetClass, number> {
  const w: Record<AssetClass, number> = { cash: 0, bond: 0, gold: 0, equity: 0 };
  for (const i of items) w[i.asset_class] += i.weight_pct;
  return w;
}

function failedIds(rules: { id: string; result: string }[]): string[] {
  return rules.filter((r) => r.result === "fail").map((r) => r.id);
}

class Work {
  weights = new Map<string, number>();
  original = new Map<string, number>();
  reasons = new Map<string, string[]>();
  rules = new Map<string, string[]>();

  constructor(items: { product_code: string; weight_pct: number }[]) {
    for (const item of items) this.weights.set(item.product_code, (this.weights.get(item.product_code) ?? 0) + item.weight_pct);
    this.original = new Map(this.weights);
  }

  note(code: string, ruleId: string, reason: string) {
    const r = this.reasons.get(code) ?? [];
    if (!r.includes(reason)) r.push(reason);
    this.reasons.set(code, r);
    const ids = this.rules.get(code) ?? [];
    if (!ids.includes(ruleId)) ids.push(ruleId);
    this.rules.set(code, ids);
  }

  move(src: string, dst: string, pts: number, ruleId: string, whySrc: string, whyDst: string) {
    if (pts <= EPS || src === dst) return;
    this.weights.set(src, (this.weights.get(src) ?? 0) - pts);
    this.weights.set(dst, (this.weights.get(dst) ?? 0) + pts);
    this.note(src, ruleId, whySrc);
    this.note(dst, ruleId, whyDst);
  }

  held(): string[] {
    return [...this.weights].filter(([, w]) => w > EPS).map(([c]) => c);
  }

  ofClass(cls: AssetClass): string[] {
    return this.held().filter((c) => product(c).asset_class === cls);
  }

  total(): number {
    return [...this.weights.values()].filter((w) => w > EPS).reduce((s, w) => s + w, 0);
  }

  /** One the fix added, then the costliest, then the largest, then by code. */
  donor(codes: string[]): string {
    return [...codes].sort((a, b) => {
      const ao = this.original.has(a) ? 1 : 0;
      const bo = this.original.has(b) ? 1 : 0;
      if (ao !== bo) return ao - bo;
      const fee = product(b).annual_fee_pct - product(a).annual_fee_pct;
      if (fee !== 0) return fee;
      const w = (this.weights.get(b) ?? 0) - (this.weights.get(a) ?? 0);
      if (w !== 0) return w;
      return codeOrder(a, b);
    })[0];
  }
}

function itemsOf(work: Work, amount: number): ProposalItem[] {
  const out: ProposalItem[] = [];
  for (const code of work.held()) {
    const p = product(code);
    const w = round2(work.weights.get(code) ?? 0);
    if (w <= 0) continue;
    out.push({
      product_code: code,
      name: p.name,
      asset_class: p.asset_class,
      risk_level: p.risk_level,
      weight_pct: w,
      amount: round2((w / 100) * amount),
      rationale: "",
    });
  }
  return out;
}

export function suggestFix(
  items: ProposalItem[],
  opts: { tier: number; amount: number; horizonYears: number; nearTermNeed: number; maxAcceptableLossPct: number }
): RemedyResult {
  const { tier, amount, horizonYears, nearTermNeed, maxAcceptableLossPct } = opts;
  const horizonMonths = horizonYears * 12;
  const work = new Work(items);

  const eligible = (cls: AssetClass, slotPct = 0): ProductRecord[] => {
    const slot = (slotPct / 100) * amount;
    return PRODUCTS.filter(
      (p) =>
        p.asset_class === cls &&
        p.risk_level <= tier &&
        p.lockup_months <= horizonMonths &&
        p.min_investment <= Math.max(slot, 0) &&
        (cls !== "cash" || nearTermNeed <= 0 || isLiquid(p))
    ).sort((a, b) => a.annual_fee_pct - b.annual_fee_pct || a.liquidity_days - b.liquidity_days || codeOrder(a.code, b.code));
  };

  const room = (code: string) =>
    product(code).asset_class === "cash" ? Infinity : Math.max(0, MAX_SINGLE - (work.weights.get(code) ?? 0));

  const place = (pts: number, classes: AssetClass[], ruleId: string, whySrc: string, src: string, exclude: Set<string>): number => {
    let left = pts;
    for (const cls of classes) {
      for (const p of eligible(cls, left)) {
        if (left <= EPS) return 0;
        if (exclude.has(p.code) || p.code === src) continue;
        const take = Math.min(left, room(p.code));
        if (take <= EPS) continue;
        const whyDst = `Takes the weight moved here: ${p.annual_fee_pct.toFixed(2)}% a year, risk level R${p.risk_level}.`;
        work.move(src, p.code, take, ruleId, whySrc, whyDst);
        left -= take;
      }
    }
    return left;
  };

  const safeClasses: AssetClass[] = tier === 1 ? ["cash"] : ["bond", "cash"];
  const classesFor = (cls: AssetClass): AssetClass[] => [cls, ...safeClasses.filter((c) => c !== cls)];

  const rebalanceTotal = () => {
    let gap = 100 - work.total();
    if (gap > EPS) {
      const cash = eligible("cash", gap);
      if (cash.length) {
        const dst = cash[0].code;
        work.weights.set(dst, (work.weights.get(dst) ?? 0) + gap);
        work.note(dst, "R-01", "Takes the missing weight so the total is 100%.");
      }
    }
    while (gap < -EPS) {
      const held = work.held();
      const illiquid = held.filter((c) => !isLiquid(product(c)));
      const nonCash = held.filter((c) => product(c).asset_class !== "cash");
      const donors = illiquid.length ? illiquid : nonCash.length ? nonCash : held;
      const src = work.donor(donors);
      const take = Math.min(-gap, work.weights.get(src) ?? 0);
      work.weights.set(src, (work.weights.get(src) ?? 0) - take);
      work.note(src, "R-01", "Trimmed so the total is 100%.");
      gap += take;
    }
  };

  // 1. R-02 and R-06: swap unsuitable and locked products.
  for (const code of work.held()) {
    const p = product(code);
    const problems: [string, string][] = [];
    if (p.risk_level > tier) problems.push(["R-02", `Risk level R${p.risk_level} is above your tier ${tier}.`]);
    if (p.lockup_months > horizonMonths) {
      problems.push(["R-06", `Locks money for ${p.lockup_months} months, beyond your ${horizonMonths}-month horizon.`]);
    }
    for (const [ruleId, why] of problems) {
      const pts = work.weights.get(code) ?? 0;
      if (pts <= EPS) continue;
      place(pts, classesFor(p.asset_class), ruleId, `${why} Swapped out.`, code, new Set());
    }
  }

  // 2. R-01.
  rebalanceTotal();

  // 3. R-05: under the short horizon, cap equity plus gold.
  if (horizonYears < SHORT_YEARS) {
    const risky = work.held().filter((c) => ["equity", "gold"].includes(product(c).asset_class));
    let excess = risky.reduce((s, c) => s + (work.weights.get(c) ?? 0), 0) - SHORT_CAP;
    const order = [...risky].sort((a, b) => {
      const ae = product(a).asset_class !== "equity" ? 1 : 0;
      const be = product(b).asset_class !== "equity" ? 1 : 0;
      if (ae !== be) return ae - be;
      const w = (work.weights.get(b) ?? 0) - (work.weights.get(a) ?? 0);
      if (w !== 0) return w;
      return codeOrder(a, b);
    });
    for (const code of order) {
      if (excess <= EPS) break;
      const take = Math.min(excess, work.weights.get(code) ?? 0);
      const why = `Equity and gold may be at most ${g(SHORT_CAP)}% with under ${SHORT_YEARS} years.`;
      const left = place(take, safeClasses, "R-05", why, code, new Set());
      excess -= take - left;
    }
  }

  // 4. R-03: no non-cash product above 40%.
  for (const code of work.held()) {
    const p = product(code);
    const excess = (work.weights.get(code) ?? 0) - MAX_SINGLE;
    if (p.asset_class === "cash" || excess <= EPS) continue;
    place(excess, classesFor(p.asset_class), "R-03", `Capped at the ${g(MAX_SINGLE)}% limit for one product.`, code, new Set());
  }

  // 5. R-04: liquid cash covers the near-term need.
  if (nearTermNeed > 0 && amount > 0) {
    const needPct = Math.ceil(Math.round(((nearTermNeed * 100) / amount) * 1e9) / 1e9);
    const liquid = work.held().filter((c) => isLiquid(product(c))).reduce((s, c) => s + (work.weights.get(c) ?? 0), 0);
    let shortfall = needPct - liquid;
    const cash = eligible("cash", needPct);
    if (shortfall > EPS && cash.length) {
      const dst = cash[0];
      while (shortfall > EPS) {
        const donors = work.held().filter((c) => !isLiquid(product(c)));
        if (!donors.length) break;
        const src = work.donor(donors);
        const take = Math.min(1, shortfall, work.weights.get(src) ?? 0);
        work.move(
          src,
          dst.code,
          take,
          "R-04",
          "Trimmed to fund cash you can withdraw within 1 day.",
          `Raised to cover your near-term need (${dst.liquidity_days}-day access).`
        );
        shortfall -= take;
      }
    }
  }

  const measure = (): [ProposalMetrics, StressResult[]] => {
    const current = itemsOf(work, amount);
    return [computeMetrics(current), computeStress(classWeightsOf(current), amount)];
  };

  // 6. R-07 (soft): swap the most expensive products while the fee is over the limit.
  let [metrics, stress] = measure();
  const byFee = [...work.held()].sort((a, b) => product(b).annual_fee_pct - product(a).annual_fee_pct || codeOrder(a, b));
  for (const code of byFee) {
    if (metrics.weighted_fee_pct <= MAX_FEE) break;
    const p = product(code);
    const cheaper = eligible(p.asset_class, work.weights.get(code) ?? 0).filter((q) => q.annual_fee_pct < p.annual_fee_pct);
    if (!cheaper.length) continue;
    const why = `Charges ${p.annual_fee_pct.toFixed(2)}% a year; the weighted fee is over ${MAX_FEE.toFixed(2)}%.`;
    place(work.weights.get(code) ?? 0, [p.asset_class], "R-07", why, code, new Set([p.code]));
    [metrics, stress] = measure();
  }

  // 7. R-08 and R-09 (soft): move risk to bonds until the losses fit the client's limit.
  const limit = maxAcceptableLossPct;
  for (let step = 0; step < MAX_LOSS_STEPS; step++) {
    const mdd = metrics.max_drawdown_pct;
    const worst = Math.abs(stress.reduce((m, s) => (s.loss_pct < m.loss_pct ? s : m), stress[0]).loss_pct);
    if (mdd <= limit && worst <= limit) break;
    const equity = work.ofClass("equity");
    const donors = equity.length ? equity : work.ofClass("gold");
    if (!donors.length) break;
    const src = work.donor(donors);
    const take = Math.min(STEP_PCT, work.weights.get(src) ?? 0);
    const ruleId = mdd > limit ? "R-08" : "R-09";
    const why = `Lowered so the largest fall fits the ${g(limit)}% you said you could accept.`;
    const left = place(take, safeClasses, ruleId, why, src, new Set());
    if (left >= take - EPS) break;
    [metrics, stress] = measure();
  }

  rebalanceTotal();
  const after = itemsOf(work, amount);
  const afterWeights = classWeightsOf(after);
  const afterMetrics = computeMetrics(after);
  const afterStress = computeStress(afterWeights, amount);
  const gateInputs = { tier, amount, horizonYears, nearTermNeed, maxAcceptableLossPct };
  const beforeWeights = classWeightsOf(items);
  const before = evaluateGate({
    items,
    classWeightsPct: beforeWeights,
    metrics: computeMetrics(items),
    stress: computeStress(beforeWeights, amount),
    ...gateInputs,
  });
  const afterGate = evaluateGate({ items: after, classWeightsPct: afterWeights, metrics: afterMetrics, stress: afterStress, ...gateInputs });

  const changes: RemedyChangeResult[] = [];
  const codes = [...work.original.keys(), ...[...work.weights.keys()].filter((c) => !work.original.has(c))];
  for (const code of codes) {
    const from = round2(work.original.get(code) ?? 0);
    const to = round2(Math.max(work.weights.get(code) ?? 0, 0));
    if (from === to) continue;
    const p = product(code);
    changes.push({
      product_code: code,
      name: p.name,
      asset_class: p.asset_class,
      risk_level: p.risk_level,
      from_pct: from,
      to_pct: to,
      rule_ids: [...(work.rules.get(code) ?? [])].sort(),
      reasons: work.reasons.get(code) ?? [],
    });
  }
  const failedBefore = failedIds(before.rules);
  const failedAfter = failedIds(afterGate.rules);
  const fixed = failedBefore.filter((r) => !failedAfter.includes(r));
  return {
    gate_before: before.decision,
    failed_before: failedBefore,
    gate_after: afterGate.decision,
    failed_after: failedAfter,
    fixed_rule_ids: fixed,
    changes,
    items: after.map((i) => ({ product_code: i.product_code, weight_pct: i.weight_pct })),
    metrics_after: afterMetrics,
    summary: summary(changes, before.decision, afterGate.decision, fixed),
  };
}

function summary(changes: RemedyChangeResult[], before: string, after: string, fixed: string[]): string {
  if (!changes.length) return "Nothing to change: every rule this fix can address already passes.";
  const added = changes.reduce((s, c) => s + Math.max(0, c.to_pct - c.from_pct), 0);
  const removed = changes.reduce((s, c) => s + Math.max(0, c.from_pct - c.to_pct), 0);
  const moved = round2(Math.max(added, removed));
  const rules = fixed.length ? fixed.join(", ") : "no rule";
  return `Moving ${g(moved)} points across ${changes.length} products fixes ${rules}; the gate's verdict goes from ${before} to ${after}.`;
}
