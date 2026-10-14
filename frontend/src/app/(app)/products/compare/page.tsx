"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { RoleGate } from "@/components/shared/role-gate";
import { ErrorState } from "@/components/shared/error-state";
import { FieldError } from "@/components/shared/error-state";
import { Money } from "@/components/shared/money";
import { Percent } from "@/components/shared/percent";
import { DataLabel } from "@/components/shared/data-label";
import { ChartCard } from "@/components/shared/chart-card";
import { FeeBars } from "@/components/charts/fee-bars";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageTitle } from "@/components/shell/page-title";
import { useCompareProducts } from "@/lib/queries";

const AMOUNT_MIN = 10000;
const AMOUNT_MAX = 10000000;

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
      setFormError(`Amount must be between CNY ${AMOUNT_MIN.toLocaleString()} and CNY ${AMOUNT_MAX.toLocaleString()}.`);
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
        <PageHeader title="Product Compare" description="Select 2 or 3 products on the shelf first." />
        <Button onClick={() => router.push("/products")}>Open Product Shelf</Button>
      </div>
    );
  }

  const result = compare.data;

  return (
    <div>
      <PageHeader title="Product Compare" description={`Comparing ${codes.length} products.`} />

      <div className="mb-6 flex flex-wrap items-end gap-4 rounded-xl border border-(--border) bg-(--surface) p-4">
        <div>
          <Label htmlFor="amount">Amount (CNY)</Label>
          <Input
            id="amount"
            type="number"
            className="mt-1.5 w-44"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
        </div>
        <div>
          <Label htmlFor="horizon">Horizon (years)</Label>
          <Input
            id="horizon"
            type="number"
            className="mt-1.5 w-32"
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
          />
        </div>
        <Button onClick={recalculate} disabled={compare.isPending}>
          {compare.isPending ? "Calculating…" : "Recalculate"}
        </Button>
      </div>
      <FieldError message={formError ?? undefined} />

      {compare.isPending && !result ? (
        <Skeleton className="h-80 w-full" />
      ) : compare.isError ? (
        <ErrorState error={compare.error} onRetry={recalculate} />
      ) : result ? (
        <div className="space-y-6">
          <ChartCard
            title="Fee cost over the horizon"
            summary={result.items.map((i) => `${i.name} would cost about ${i.fee_cost} in fees.`).join(" ")}
            dataLabel={result.data_label}
          >
            <FeeBars items={result.items} />
          </ChartCard>

          <div className="grid gap-4 md:grid-cols-3">
            {result.items.map((item) => (
              <Card key={item.code} className={item.code === result.cheapest_code ? "ring-2 ring-(--pass)" : undefined}>
                <CardContent className="space-y-3 px-6 py-5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-(--text)">{item.name}</p>
                    {item.code === result.cheapest_code ? (
                      <Badge className="shrink-0 bg-(--pass-bg) text-(--pass)">Lowest cost</Badge>
                    ) : null}
                  </div>
                  <dl className="space-y-1.5 text-body">
                    <Row label="Fee cost over horizon" value={<Money value={item.fee_cost} />} />
                    <Row label="End value after fees" value={<Money value={item.end_value_after_fees} />} />
                    <Row label="Annual fee" value={<Percent value={item.annual_fee_pct} decimals={2} />} />
                    <Row label="Risk level" value={`R${item.risk_level}`} />
                    <Row label="Liquidity" value={`${item.liquidity_days} day(s)`} />
                    <Row label="Lock-up" value={`${item.lockup_months} month(s)`} />
                    <Row
                      label="Suitable"
                      value={
                        item.suitable === null ? "—" : item.suitable ? (
                          <span className="text-(--pass)">Yes</span>
                        ) : (
                          <span className="text-(--warning)">Above your tier</span>
                        )
                      }
                    />
                  </dl>
                </CardContent>
              </Card>
            ))}
          </div>
          <DataLabel label="Returns are an assumption for illustration, not a forecast" />
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-(--text-muted)">{label}</dt>
      <dd className="font-medium text-(--text)">{value}</dd>
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
