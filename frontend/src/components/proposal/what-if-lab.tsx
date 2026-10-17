"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FlaskConical, Lock, Plus, RotateCcw, Save, X } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { AllocationBar } from "@/components/shared/allocation-bar";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useComplianceRules, usePreview, useProducts, useReviseProposal } from "@/lib/queries";
import { useDebouncedValue } from "@/lib/use-debounced";
import { useAssetColors } from "@/lib/asset-colors";
import { ASSET_CLASS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { Product, Proposal, ProposalPreview } from "@/lib/types";

/**
 * The what-if lab: move a weight and see the gate's verdict change as you go. Each move runs the same engines
 * and nine rules as a saved revision (POST /preview, a dry run: nothing is saved or logged), so the lab can
 * show a REJECT before it happens. "Keep the total at 100%" spreads a change across the other holdings in
 * proportion; saving creates the next version, checked by the gate again.
 */
interface Row {
  product_code: string;
  weight_pct: number;
}

const MAX_ITEMS = 6;

function round1(v: number) {
  return Math.round(v * 10) / 10;
}

/** Sets row i to `value` and spreads the difference over the others in proportion, so the total stays 100. */
function rebalance(rows: Row[], i: number, value: number): Row[] {
  const others = rows.map((r, j) => ({ r, j })).filter(({ j }) => j !== i);
  const othersTotal = others.reduce((s, { r }) => s + r.weight_pct, 0);
  const room = 100 - value;
  const next = rows.map((r, j) => {
    if (j === i) return { ...r, weight_pct: value };
    const share = othersTotal > 0 ? r.weight_pct / othersTotal : 1 / others.length;
    return { ...r, weight_pct: Math.max(0, round1(room * share)) };
  });
  const residue = round1(100 - next.reduce((s, r) => s + r.weight_pct, 0));
  if (residue !== 0 && others.length) {
    const k = others.map(({ j }) => j).sort((a, b) => next[b].weight_pct - next[a].weight_pct)[0];
    next[k] = { ...next[k], weight_pct: Math.max(0, round1(next[k].weight_pct + residue)) };
  }
  return next;
}

function Delta({ before, after, decimals = 1, suffix = "%", lowerIsBetter = true }: {
  before: number;
  after: number;
  decimals?: number;
  suffix?: string;
  lowerIsBetter?: boolean;
}) {
  const diff = after - before;
  if (Math.abs(diff) < 10 ** -decimals / 2) {
    return <span className="text-caption text-(--text-muted)">no change</span>;
  }
  const better = lowerIsBetter ? diff < 0 : diff > 0;
  return (
    <span className={cn("text-caption font-semibold tabular-nums", better ? "text-(--primary)" : "text-(--text)")}>
      {diff > 0 ? "+" : "−"}
      {Math.abs(diff).toFixed(decimals)}
      {suffix}
      <span className="sr-only">{better ? " (better)" : " (worse)"}</span>
    </span>
  );
}

function worstLoss(stress: Proposal["stress"]) {
  return Math.min(...stress.map((s) => s.loss_pct));
}

export function WhatIfLab({ proposal, onSaved }: { proposal: Proposal; onSaved?: () => void }) {
  const router = useRouter();
  const colors = useAssetColors();
  const products = useProducts({});
  const rules = useComplianceRules();
  const revise = useReviseProposal(proposal.id);
  const initial = useMemo(() => proposal.items.map((i) => ({ product_code: i.product_code, weight_pct: i.weight_pct })), [proposal]);
  const [rows, setRows] = useState<Row[]>(initial);
  const [keepTotal, setKeepTotal] = useState(true);
  const settled = useDebouncedValue(rows, 220);
  const preview = usePreview(proposal.id, settled);
  const editable = proposal.status !== "executed" && proposal.status !== "superseded";

  const byCode = useMemo(() => new Map((products.data?.items ?? []).map((p) => [p.code, p])), [products.data]);
  const ruleName = useMemo(() => new Map((rules.data?.items ?? []).map((r) => [r.id, r.name])), [rules.data]);
  const total = round1(rows.reduce((s, r) => s + r.weight_pct, 0));
  const changed = JSON.stringify(rows) !== JSON.stringify(initial);
  const result: ProposalPreview | undefined = preview.data;
  const fresh = !!result && JSON.stringify(settled) === JSON.stringify(rows) && !preview.isFetching;

  function setWeight(i: number, value: number) {
    setRows((prev) => (keepTotal && prev.length > 1 ? rebalance(prev, i, value) : prev.map((r, j) => (j === i ? { ...r, weight_pct: value } : r))));
  }
  function setProduct(i: number, code: string) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, product_code: code } : r)));
  }
  function remove(i: number) {
    setRows((prev) => {
      const gone = prev[i].weight_pct;
      const rest = prev.filter((_, j) => j !== i);
      if (!keepTotal || !rest.length) return rest;
      const restTotal = rest.reduce((s, r) => s + r.weight_pct, 0) || 1;
      return rest.map((r) => ({ ...r, weight_pct: round1(r.weight_pct + (gone * r.weight_pct) / restTotal) }));
    });
  }
  function add(code: string) {
    setRows((prev) => [...prev, { product_code: code, weight_pct: 0 }]);
  }

  async function save() {
    const next = await revise.mutateAsync(rows.filter((r) => r.weight_pct > 0));
    onSaved?.();
    router.push(`/proposals/${next.id}`);
  }

  const failing = (result?.gate.rules ?? []).filter((r) => r.result === "fail");
  const unused = (products.data?.items ?? []).filter((p) => !rows.some((r) => r.product_code === p.code));

  return (
    <section className="grid gap-6 xl:grid-cols-1 2xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <div className="rounded-2xl border border-(--border) bg-(--surface) p-6 shadow-card">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-8 items-center justify-center rounded-lg bg-(--primary-soft) text-(--primary)">
              <FlaskConical className="size-4" aria-hidden />
            </span>
            <div>
              <h2 className="font-display text-form font-bold text-(--text)">What-if lab</h2>
              <p className="text-caption text-(--text-muted)">
                Move a weight; the nine rules re-check it as you go. Nothing is saved until you save a version.
              </p>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-caption text-(--text-muted)">
            <input
              type="checkbox"
              className="size-4 accent-(--primary)"
              checked={keepTotal}
              onChange={(e) => setKeepTotal(e.target.checked)}
            />
            Keep the total at 100%
          </label>
        </header>

        <ul className="mt-5 space-y-4">
          {rows.map((row, i) => {
            const p = byCode.get(row.product_code);
            const cls = p?.asset_class ?? proposal.items.find((x) => x.product_code === row.product_code)?.asset_class ?? "cash";
            const candidates = (products.data?.items ?? []).filter(
              (c: Product) => c.asset_class === cls && (c.code === row.product_code || !rows.some((r) => r.product_code === c.code))
            );
            const above = p ? p.risk_level > proposal.tier : false;
            return (
              <li key={`${i}-${row.product_code}`} className="rounded-xl border border-(--border) p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: colors[cls] }} aria-hidden />
                  <Select value={row.product_code} onValueChange={(v) => setProduct(i, v)} disabled={!editable}>
                    <SelectTrigger className="h-8 min-w-0 flex-1 text-body" aria-label={`Product in row ${i + 1}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {candidates.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          <span className="flex items-center gap-2">
                            {c.name}
                            <span className="text-caption text-(--text-muted)">
                              R{c.risk_level} · {c.annual_fee_pct.toFixed(2)}%
                            </span>
                            {c.risk_level > proposal.tier ? <Lock className="size-3 text-(--text-muted)" aria-label="Above your tier" /> : null}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="w-14 text-right font-display text-form font-bold tabular-nums text-(--text)">
                    {row.weight_pct.toFixed(row.weight_pct % 1 ? 1 : 0)}%
                  </span>
                  {rows.length > 1 && editable ? (
                    <Button variant="ghost" size="icon" className="size-8 text-(--text-muted)" onClick={() => remove(i)} aria-label={`Remove ${p?.name ?? row.product_code}`}>
                      <X className="size-4" />
                    </Button>
                  ) : null}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <Slider
                    value={[row.weight_pct]}
                    min={0}
                    max={100}
                    step={1}
                    disabled={!editable}
                    onValueChange={([v]) => setWeight(i, v)}
                    aria-label={`Weight of ${p?.name ?? row.product_code}`}
                    rangeStyle={{ background: colors[cls] }}
                  />
                </div>
                <p className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-(--text-muted)">
                  <span>{ASSET_CLASS_LABEL[cls]}</span>
                  {p ? <span>Risk R{p.risk_level}</span> : null}
                  {p ? <span>{p.annual_fee_pct.toFixed(2)}% a year</span> : null}
                  {p && p.lockup_months ? <span>{p.lockup_months}-month lock-up</span> : null}
                  {above ? (
                    <span className="inline-flex items-center gap-1 font-medium text-(--text)">
                      <Lock className="size-3" aria-hidden /> above your tier {proposal.tier}
                    </span>
                  ) : null}
                </p>
              </li>
            );
          })}
        </ul>

        {editable && rows.length < MAX_ITEMS && unused.length ? (
          <div className="mt-4">
            <Select value="" onValueChange={add}>
              <SelectTrigger className="h-9 w-full border-dashed text-body text-(--text-muted)" aria-label="Add a product">
                <span className="flex items-center gap-2">
                  <Plus className="size-4" aria-hidden /> Add a product
                </span>
              </SelectTrigger>
              <SelectContent>
                {unused.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name} <span className="text-caption text-(--text-muted)">({ASSET_CLASS_LABEL[c.asset_class]}, R{c.risk_level})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-(--border) pt-4">
          <p className="text-body font-semibold tabular-nums text-(--text)" aria-live="polite">
            {total}% of 100%
            {Math.abs(total - 100) > 0.05 ? (
              <span className="ml-2 font-normal text-(--text-muted)">
                {total > 100 ? `${round1(total - 100)}% over` : `${round1(100 - total)}% short`}: a version needs exactly 100%
              </span>
            ) : null}
          </p>
          {editable ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setRows(initial)} disabled={!changed || revise.isPending}>
                <RotateCcw className="size-4" /> Reset
              </Button>
              <Button onClick={save} disabled={!changed || Math.abs(total - 100) > 0.05 || revise.isPending}>
                <Save className="size-4" />
                {revise.isPending ? "Saving…" : `Save as version ${proposal.version + 1}`}
              </Button>
            </div>
          ) : (
            <p className="text-caption text-(--text-muted)">This version is {proposal.status}; the lab is read-only.</p>
          )}
        </footer>
        {revise.isError ? <ErrorState error={revise.error} className="mt-3" compact /> : null}
      </div>

      <aside
        className={cn(
          "h-fit rounded-2xl border border-(--border) bg-(--surface) p-6 shadow-card transition-opacity duration-200 2xl:sticky 2xl:top-4",
          !fresh && result && "opacity-70"
        )}
        aria-live="polite"
        aria-busy={!fresh}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-eyebrow text-(--text-muted)">Live verdict</p>
            <p className="mt-0.5 text-caption text-(--text-muted)">Same engines and rules as a saved version.</p>
          </div>
          {result ? <StatusBadge decision={result.gate.decision} /> : <span className="shimmer h-7 w-24 rounded-full" />}
        </div>

        {result ? (
          <>
            <AllocationBar weights={result.class_weights_pct} className="mt-5" />

            <dl className="mt-5 divide-y divide-(--border) rounded-xl border border-(--border)">
              {(
                [
                  ["Weighted annual fee", proposal.metrics.weighted_fee_pct, result.metrics.weighted_fee_pct, 2, true],
                  ["Historical max drawdown", proposal.metrics.max_drawdown_pct, result.metrics.max_drawdown_pct, 1, true],
                  ["Worst stress loss", Math.abs(worstLoss(proposal.stress)), Math.abs(worstLoss(result.stress)), 2, true],
                  ["Available within 1 day", proposal.metrics.liquid_share_pct, result.metrics.liquid_share_pct, 1, false],
                  ["Largest single product", proposal.metrics.largest_weight_pct, result.metrics.largest_weight_pct, 1, true],
                ] as const
              ).map(([label, before, after, decimals, lowerIsBetter]) => (
                <div key={label} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <dt className="text-caption text-(--text-muted)">{label}</dt>
                  <dd className="flex items-center gap-2">
                    <span className="text-caption tabular-nums text-(--text-muted)">{before.toFixed(decimals)}%</span>
                    <ArrowRight className="size-3 text-(--text-muted)" aria-hidden />
                    <span className="text-body font-semibold tabular-nums text-(--text)">{after.toFixed(decimals)}%</span>
                    <Delta before={before} after={after} decimals={decimals} lowerIsBetter={lowerIsBetter} />
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-5">
              <p className="text-body font-semibold text-(--text)">
                {failing.length ? `${failing.length} rule${failing.length === 1 ? "" : "s"} would fail` : "Every rule would pass"}
              </p>
              {failing.length ? (
                <ul className="mt-2 space-y-2">
                  {failing.map((r) => (
                    <li
                      key={r.id}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-caption",
                        r.type === "hard" ? "border-(--reject)/35 bg-(--reject-bg)" : "border-(--warning)/35 bg-(--warning-bg)"
                      )}
                    >
                      <span className="font-mono text-(--text-muted)">{r.id}</span>{" "}
                      <span className="font-semibold text-(--text)">{ruleName.get(r.id) ?? ""}</span>{" "}
                      <span className={r.type === "hard" ? "text-(--reject)" : "text-(--warning)"}>
                        {r.type === "hard" ? "hard rule" : "warning"}
                      </span>
                      <span className="mt-0.5 block text-(--text)">{r.detail}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-caption text-(--text-muted)">
                  All nine rules pass with these weights. Save a version to make it your proposal.
                </p>
              )}
            </div>
          </>
        ) : preview.isError ? (
          <ErrorState error={preview.error} className="mt-4" compact />
        ) : (
          <div className="mt-5 space-y-3">
            <span className="shimmer block h-3 w-full rounded-full" />
            <span className="shimmer block h-24 w-full rounded-xl" />
          </div>
        )}
      </aside>
    </section>
  );
}
