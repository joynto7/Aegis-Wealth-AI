"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, BarChart3, Crown, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { RoleGate } from "@/components/shared/role-gate";
import { ErrorState, FieldError } from "@/components/shared/error-state";
import { Money } from "@/components/shared/money";
import { Percent } from "@/components/shared/percent";
import { Panel } from "@/components/shared/panel";
import { RiskMeter } from "@/components/shared/risk-meter";
import { FeeBars } from "@/components/charts/fee-bars";
import { SuitabilityBadge } from "@/components/shared/suitability-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageTitle } from "@/components/shell/page-title";
import { useCompareProducts } from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const AMOUNT_MIN = 10000;
const AMOUNT_MAX = 10000000;

function access(days: number): string {
  return days === 0 ? "Same day" : `${days} day${days === 1 ? "" : "s"}`;
}

function ProductCompareContent() {
  usePageTitle("Product Compare");
  const router = useRouter();
  const params = useSearchParams();
  const codes = (params.get("codes") ?? "").split(",").filter(Boolean);
  const [amount, setAmount] = useState(100000);
  const [horizon, setHorizon] = useState(5);
  const [formError, setFormError] = useState<string | null>(null);
  const compare = useCompareProducts();

  useEffect(() => {
    if (codes.length >= 2) {
      compare.mutate({ product_codes: codes, amount, horizon_years: horizon });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function recalculate() {
    if (amount < AMOUNT_MIN || amount > AMOUNT_MAX) {
      setFormError(`Amount must be between ${formatMoney(AMOUNT_MIN)} and ${formatMoney(AMOUNT_MAX)}.`);
      return;
    }
    if (horizon < 1 || horizon > 30) {
      setFormError("Horizon must be between 1 and 30 years.");
      return;
    }
    setFormError(null);
    compare.mutate({ product_codes: codes, amount, horizon_years: horizon });
  }

  if (codes.length < 2) {
    return (
      <div>
        <PageHeader eyebrow="Invest" title="Compare products" description="Pick two or three products on the shelf first." />
        <Button onClick={() => router.push("/products")}>
          <ArrowLeft className="size-4" /> Open the Product Shelf
        </Button>
      </div>
    );
  }

  const result = compare.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Invest"
        title="Compare products"
        description="What each product would cost you in fees, and what would be left, over the same amount and horizon."
        action={
          <Button asChild variant="outline">
            <Link href="/products">
              <ArrowLeft className="size-4" /> Back to the shelf
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-(--border) bg-(--surface) p-4 shadow-card">
        <div>
          <Label htmlFor="amount">Amount</Label>
          <div className="relative mt-1.5">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-body text-(--text-muted)">CNY</span>
            <Input id="amount" type="number" className="w-48 pl-12" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </div>
        </div>
        <div>
          <Label htmlFor="horizon">Horizon</Label>
          <div className="relative mt-1.5">
            <Input id="horizon" type="number" className="w-36 pr-14" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-body text-(--text-muted)">years</span>
          </div>
        </div>
        <Button onClick={recalculate} disabled={compare.isPending}>
          <RefreshCw className={cn("size-4", compare.isPending && "animate-spin")} />
          {compare.isPending ? "Calculating…" : "Recalculate"}
        </Button>
        <p className="ml-auto max-w-xs text-caption text-(--text-muted)">
          Growth rates are assumptions per asset class, before fees. They illustrate cost, not a forecast.
        </p>
      </div>
      <FieldError message={formError ?? undefined} />

      {compare.isPending && !result ? (
        <div className="grid gap-4 md:grid-cols-3">
          {codes.map((c) => (
            <Skeleton key={c} className="h-80 w-full rounded-2xl" />
          ))}
        </div>
      ) : compare.isError ? (
        <ErrorState error={compare.error} onRetry={recalculate} />
      ) : result ? (
        <>
          <div className={cn("grid gap-4", result.items.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2")}>
            {result.items.map((item) => {
              const best = item.code === result.cheapest_code;
              return (
                <article
                  key={item.code}
                  className={cn(
                    "relative flex flex-col gap-5 rounded-2xl border bg-(--surface) p-6 shadow-card",
                    best ? "border-(--primary) ring-2 ring-(--primary)/20" : "border-(--border)"
                  )}
                >
                  {best ? (
                    <span className="bg-ai absolute -top-3 left-6 flex items-center gap-1 rounded-full px-2.5 py-1 text-caption font-semibold shadow-glow">
                      <Crown className="size-3.5" aria-hidden /> Lowest cost
                    </span>
                  ) : null}
                  <div>
                    <h2 className="font-display text-form font-bold text-(--text)">{item.name}</h2>
                    <p className="font-mono text-caption text-(--text-muted)">{item.code}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <RiskMeter level={item.risk_level} />
                    <SuitabilityBadge suitable={item.suitable} short />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-(--surface-2) p-3">
                      <p className="text-caption text-(--text-muted)">Fees over {result.horizon_years} years</p>
                      <p className="font-display text-section text-(--text)">
                        <Money value={item.fee_cost} />
                      </p>
                    </div>
                    <div className="rounded-xl bg-(--surface-2) p-3">
                      <p className="text-caption text-(--text-muted)">Left after fees</p>
                      <p className="font-display text-section text-(--text)">
                        <Money value={item.end_value_after_fees} />
                      </p>
                    </div>
                  </div>
                  <dl className="space-y-2 text-body">
                    {[
                      ["Annual fee", <Percent key="f" value={item.annual_fee_pct} decimals={2} />],
                      ["Assumed growth before fees", <Percent key="g" value={item.assumed_return_pct} />],
                      ["Access", access(item.liquidity_days)],
                      ["Lock-up", item.lockup_months ? `${item.lockup_months} months` : "None"],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="flex items-center justify-between gap-3 border-b border-(--border) pb-2 last:border-0 last:pb-0">
                        <dt className="text-(--text-muted)">{label}</dt>
                        <dd className="font-semibold text-(--text)">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              );
            })}
          </div>

          <Panel icon={BarChart3} title="Fee cost side by side" description={`On ${formatMoney(result.amount)} over ${result.horizon_years} years. ${result.data_label}.`}>
            <p className="sr-only">{result.items.map((i) => `${i.name} would cost about ${formatMoney(i.fee_cost)} in fees.`).join(" ")}</p>
            <FeeBars items={result.items} />
          </Panel>
        </>
      ) : null}
    </div>
  );
}

export default function ProductComparePage() {
  return (
    <RoleGate role="client">
      <Suspense>
        <ProductCompareContent />
      </Suspense>
    </RoleGate>
  );
}
