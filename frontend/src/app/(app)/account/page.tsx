"use client";

import { PageHeader } from "@/components/shared/page-header";
import { RoleGate } from "@/components/shared/role-gate";
import { DataLabel } from "@/components/shared/data-label";
import { Money } from "@/components/shared/money";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { ChartCard } from "@/components/shared/chart-card";
import { AllocationDonut, AllocationLegend } from "@/components/charts/allocation-donut";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageTitle } from "@/components/shell/page-title";
import { useLogs, useSandboxAccount, useSandboxOrders } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";
import type { AssetClass } from "@/lib/types";
import { DecisionLabel } from "@/components/shared/decision-label";

function AccountOverview() {
  const { data: account, isLoading, error, refetch } = useSandboxAccount();
  const { data: ordersData } = useSandboxOrders();

  if (isLoading) return <Skeleton className="h-80 w-full" />;
  if (error || !account) return <ErrorState error={error} onRetry={() => refetch()} />;

  if (account.positions.length === 0) {
    return (
      <EmptyState
        title="No sandbox activity yet"
        description="Once you confirm a proposal, your simulated orders and positions appear here."
      />
    );
  }

  const weights: Record<AssetClass, number> = { cash: 0, bond: 0, gold: 0, equity: 0 };
  for (const p of account.positions) weights[p.asset_class] += (p.value / account.total_value) * 100;
  const cashPct = (account.cash / account.total_value) * 100;
  weights.cash += cashPct;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="px-6 py-5">
            <p className="text-caption text-(--text-muted)">Total value</p>
            <p className="text-key-figure text-(--text)">
              <Money value={account.total_value} />
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-6 py-5">
            <p className="text-caption text-(--text-muted)">Cash</p>
            <p className="text-key-figure text-(--text)">
              <Money value={account.cash} />
            </p>
          </CardContent>
        </Card>
      </div>

      <ChartCard title="Holdings by asset class" summary="Share of total value by asset class, including cash." dataLabel="Simulated">
        <AllocationDonut weights={weights} />
        <AllocationLegend weights={weights} />
      </ChartCard>

      <Card>
        <CardContent className="px-6 py-5">
          <h3 className="mb-3 text-form font-semibold text-(--text)">Positions</h3>
          <table className="w-full text-left text-body">
            <thead className="border-b border-(--border) text-caption text-(--text-muted)">
              <tr>
                <th className="py-2">Product</th>
                <th className="py-2">Units</th>
                <th className="py-2">Avg NAV</th>
                <th className="py-2">Value</th>
              </tr>
            </thead>
            <tbody>
              {account.positions.map((p) => (
                <tr key={p.product_code} className="border-b border-(--border) last:border-0">
                  <td className="py-2 font-medium text-(--text)">{p.name}</td>
                  <td className="py-2 tabular-nums">{p.units.toFixed(4)}</td>
                  <td className="py-2 tabular-nums">{p.avg_nav.toFixed(4)}</td>
                  <td className="py-2">
                    <Money value={p.value} withCents />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="px-6 py-5">
          <h3 className="mb-3 text-form font-semibold text-(--text)">Order history</h3>
          <table className="w-full text-left text-body">
            <thead className="border-b border-(--border) text-caption text-(--text-muted)">
              <tr>
                <th className="py-2">Date</th>
                <th className="py-2">Product</th>
                <th className="py-2">Amount</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {(ordersData?.items ?? []).map((o) => (
                <tr key={o.id} className="border-b border-(--border) last:border-0">
                  <td className="py-2 text-(--text-muted)">{formatDateTime(o.created_at)}</td>
                  <td className="py-2 font-medium">{o.product_code}</td>
                  <td className="py-2">
                    <Money value={o.amount} withCents />
                  </td>
                  <td className="py-2 capitalize">{o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function ActivityLog() {
  const { data, isLoading, error, refetch } = useLogs({ limit: 100 });
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!data?.items.length) return <EmptyState title="No activity yet" description="Actions you take will appear here." />;
  return (
    <Card>
      <CardContent className="px-6 py-5">
        <table className="w-full text-left text-body">
          <thead className="border-b border-(--border) text-caption text-(--text-muted)">
            <tr>
              <th className="py-2">Time</th>
              <th className="py-2">Action</th>
              <th className="py-2">Decision</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((l) => (
              <tr key={l.id} className="border-b border-(--border) last:border-0">
                <td className="py-2 text-(--text-muted)">{formatDateTime(l.ts)}</td>
                <td className="py-2">{l.action.replace(/_/g, " ")}</td>
                <td className="py-2">
                  <DecisionLabel decision={l.decision} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function AccountContent() {
  usePageTitle("Sandbox Account");
  return (
    <div>
      <PageHeader title="Sandbox Account" description="Simulated cash, positions and order history." action={<DataLabel label="Simulated" />} />
      <Tabs defaultValue="overview">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">My activity</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <AccountOverview />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityLog />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AccountPage() {
  return (
    <RoleGate role="client">
      <AccountContent />
    </RoleGate>
  );
}
