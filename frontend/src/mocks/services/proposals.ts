import type { AssetClass, Profile, Proposal, ProposalItem } from "@/lib/types";
import { db } from "@/mocks/db";
import { buildAllocation } from "@/mocks/engines/allocation";
import { computeMetrics } from "@/mocks/engines/metrics";
import { computeStress } from "@/mocks/engines/stress";
import { evaluateGate } from "@/mocks/engines/gate";
import { findProduct } from "@/mocks/data/products";
import { DATA_AS_OF } from "@/mocks/data/scenarios";

function statusFromDecision(decision: "PASS" | "WARNING" | "REJECT"): Proposal["status"] {
  if (decision === "REJECT") return "rejected";
  if (decision === "WARNING") return "warning";
  return "passed";
}

export function createProposal(
  userId: number,
  profile: Profile,
  amount: number,
  horizonYears: number,
  nearTermNeed: number
): Proposal {
  const { items, class_weights_pct, notes } = buildAllocation(profile.tier, amount, horizonYears, nearTermNeed);
  return finalizeProposal({
    userId,
    profile,
    amount,
    horizonYears,
    nearTermNeed,
    items,
    classWeightsPct: class_weights_pct,
    notes,
    parentId: null,
  });
}

export function reviseProposal(
  userId: number,
  parent: Proposal,
  profile: Profile,
  rawItems: { product_code: string; weight_pct: number }[]
): { proposal?: Proposal; error?: string } {
  const items: ProposalItem[] = [];
  for (const raw of rawItems) {
    const product = findProduct(raw.product_code);
    if (!product) return { error: `Unknown product code: ${raw.product_code}` };
    items.push({
      product_code: product.code,
      name: product.name,
      asset_class: product.asset_class,
      risk_level: product.risk_level,
      weight_pct: raw.weight_pct,
      amount: Math.round(((raw.weight_pct / 100) * parent.amount) * 100) / 100,
    });
  }
  const classWeightsPct: Record<AssetClass, number> = { cash: 0, bond: 0, gold: 0, equity: 0 };
  for (const item of items) classWeightsPct[item.asset_class] += item.weight_pct;

  const proposal = finalizeProposal({
    userId,
    profile,
    amount: parent.amount,
    horizonYears: parent.horizon_years,
    nearTermNeed: parent.near_term_need,
    items,
    classWeightsPct,
    notes: [],
    parentId: parent.id,
  });

  parent.status = "superseded";
  return { proposal };
}

function finalizeProposal(opts: {
  userId: number;
  profile: Profile;
  amount: number;
  horizonYears: number;
  nearTermNeed: number;
  items: ProposalItem[];
  classWeightsPct: Record<AssetClass, number>;
  notes: string[];
  parentId: number | null;
}): Proposal {
  const metrics = computeMetrics(opts.items);
  const stress = computeStress(opts.classWeightsPct, opts.amount);
  const gate = evaluateGate({
    items: opts.items,
    classWeightsPct: opts.classWeightsPct,
    metrics,
    stress,
    tier: opts.profile.tier,
    amount: opts.amount,
    horizonYears: opts.horizonYears,
    nearTermNeed: opts.nearTermNeed,
    maxAcceptableLossPct: opts.profile.max_acceptable_loss_pct,
  });

  const existing = db.proposalsFor(opts.userId);
  const version = opts.parentId
    ? (existing.find((p) => p.id === opts.parentId)?.version ?? 0) + 1
    : 1;

  const proposal: Proposal = {
    id: db.nextId("proposal"),
    version,
    parent_id: opts.parentId,
    status: statusFromDecision(gate.decision),
    tier: opts.profile.tier,
    amount: opts.amount,
    horizon_years: opts.horizonYears,
    near_term_need: opts.nearTermNeed,
    items: opts.items,
    class_weights_pct: opts.classWeightsPct,
    metrics,
    stress,
    gate,
    quiz_passed: false,
    notes: opts.notes,
    data_label: "Sample data; stress results are hypothetical",
    data_as_of: DATA_AS_OF,
    created_at: new Date().toISOString(),
  };
  db.addProposal(opts.userId, proposal);
  return proposal;
}

export function toSummary(p: Proposal) {
  return {
    id: p.id,
    version: p.version,
    status: p.status,
    amount: p.amount,
    tier: p.tier,
    gate_decision: p.gate.decision,
    created_at: p.created_at,
  };
}
