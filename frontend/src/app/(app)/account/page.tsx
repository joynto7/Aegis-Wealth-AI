"use client";

import Link from "next/link";
import { Activity, ArrowRight, ListOrdered, PieChart, Wallet } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { RoleGate } from "@/components/shared/role-gate";
import { Money } from "@/components/shared/money";
import { ErrorState } from "@/components/shared/error-state";
import { Panel } from "@/components/shared/panel";
import { DecisionLabel } from "@/components/shared/decision-label";
import { AllocationDonut, AllocationLegend } from "@/components/charts/allocation-donut";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageTitle } from "@/components/shell/page-title";
import { useLogs, useSandboxAccount, useSandboxOrders } from "@/lib/queries";
import { useAssetColors } from "@/lib/asset-colors";
import { ACTIVITY, FALLBACK_ACTIVITY_ICON, describeActivity } from "@/lib/activity";
import { ASSET_CLASS_LABEL } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";
import type { AssetClass, SandboxAccount } from "@/lib/types";

function AccountHero({ account }: { account: SandboxAccount }) {
  const invested = account.total_value - account.cash;
  return (
    <section className="bg-ink relative overflow-hidden rounded-2xl p-7 shadow-raised">
      <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[#6366f1]/25 blur-3xl" aria-hidden />
      <div className="relative">
        <p className="flex items-center gap-2 text-body text-(--ink-muted)">
          <Wallet className="size-4" aria-hidden /> Total value · {account.data_label}
        </p>
        <p className="mt-3 text-hero-figure text-white">
          <Money value={account.total_value} />
        </p>
        <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-5">
          <div>
            <dt className="text-caption text-(--ink-muted)">Invested</dt>
            <dd className="font-display text-section text-white">
              <Money value={invested} />
            </dd>
          </div>
          <div>
            <dt className="text-caption text-(--ink-muted)">Cash</dt>
            <dd className="font-display text-section text-white">
              <Money value={account.cash} />
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function AccountOverview() {
  const { data: account, isLoading, error, refetch } = useSandboxAccount();
  const { data: ordersData } = useSandboxOrders();
  const colors = useAssetColors();

  if (isLoading) return <Skeleton className="h-80 w-full rounded-2xl" />;
  if (error || !account) return <ErrorState error={error} onRetry={() => refetch()} />;

  if (account.positions.length === 0) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <AccountHero account={account} />
        <section className="flex flex-col justify-center gap-3 rounded-2xl border border-dashed border-(--border-strong) bg-(--surface) p-7">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-(--primary-soft) text-(--primary)">
            <PieChart className="size-5" aria-hidden />
          </span>
          <h2 className="font-display text-section text-(--text)">Nothing invested yet</h2>
          <p className="text-body text-(--text-muted)">
            Your sandbox holds simulated cash. Once you confirm a proposal, your positions, their mix and every order appear here.
          </p>
          <Button asChild className="w-fit">
            <Link href="/proposals/new">
              Build a proposal <ArrowRight className="size-4" />
            </Link>
          </Button>
        </section>
      </div>
    );
  }

  const weights: Record<AssetClass, number> = { cash: 0, bond: 0, gold: 0, equity: 0 };
  for (const p of account.positions) weights[p.asset_class] += (p.value / account.total_value) * 100;
  weights.cash += (account.cash / account.total_value) * 100;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <AccountHero account={account} />
        <Panel icon={PieChart} title="Mix by asset class" description="Share of total value, cash included.">
          <div className="grid items-center gap-4 sm:grid-cols-[170px_1fr]">
            <AllocationDonut weights={weights} height={170} centerValue={`${account.positions.length}`} centerLabel="positions" />
            <AllocationLegend weights={weights} columns />
          </div>
        </Panel>
      </div>

      <Panel icon={Wallet} title="Positions" description="Units, average purchase price and current value at the sample NAV.">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body">
            <thead className="text-caption text-(--text-muted)">
              <tr className="border-b border-(--border)">
                <th className="py-2.5 font-medium">Product</th>
                <th className="py-2.5 text-right font-medium">Units</th>
                <th className="py-2.5 text-right font-medium">Average NAV</th>
                <th className="py-2.5 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {account.positions.map((p) => (
                <tr key={p.product_code} className="border-b border-(--border) last:border-0">
                  <td className="py-3">
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[p.asset_class] }} aria-hidden />
                      <span className="font-semibold text-(--text)">{p.name}</span>
                      <span className="text-caption text-(--text-muted)">{ASSET_CLASS_LABEL[p.asset_class]}</span>
                    </span>
                  </td>
                  <td className="py-3 text-right tabular-nums">{p.units.toFixed(4)}</td>
                  <td className="py-3 text-right tabular-nums">{p.avg_nav.toFixed(4)}</td>
                  <td className="py-3 text-right font-semibold">
                    <Money value={p.value} withCents />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel icon={ListOrdered} title="Order history" description="Every simulated order, newest first. Each was placed by your own Confirm click.">
        <ol className="space-y-2">
          {(ordersData?.items ?? []).map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-(--border) px-4 py-3">
              <span className="rounded-md bg-(--surface-2) px-2 py-0.5 font-mono text-caption text-(--text-muted)">#{o.id}</span>
              <span className="font-semibold text-(--text)">{o.product_code}</span>
              <span className="text-caption text-(--text-muted)">
                {o.units.toFixed(4)} units at {o.nav.toFixed(4)}
              </span>
              <span className="ml-auto font-semibold text-(--text)">
                <Money value={o.amount} withCents />
              </span>
              <span className="rounded-full bg-(--primary-soft) px-2 py-0.5 text-caption font-medium capitalize text-(--primary)">{o.status}</span>
              <span className="w-full text-caption text-(--text-muted) sm:w-auto">{formatDateTime(o.created_at)}</span>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}

function ActivityLog() {
  const { data, isLoading, error, refetch } = useLogs({ limit: 100 });
  if (isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  return (
    <Panel icon={Activity} title="My activity" description="Your own entries in the append-only operation log, newest first.">
      {!data?.items.length ? (
        <p className="py-8 text-center text-body text-(--text-muted)">Actions you take will appear here.</p>
      ) : (
        <ol className="divide-y divide-(--border)">
          {data.items.map((l) => {
            const Icon = ACTIVITY[l.action]?.icon ?? FALLBACK_ACTIVITY_ICON;
            return (
              <li key={l.id} className="flex items-center gap-3 py-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-(--surface-2) text-(--primary) ring-1 ring-(--border)">
                  <Icon className="size-3.5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-medium text-(--text)">{describeActivity(l)}</span>
                  <span className="block text-caption text-(--text-muted)">{formatDateTime(l.ts)}</span>
                </span>
                <DecisionLabel decision={l.decision} />
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

function AccountContent() {
  usePageTitle("Sandbox Account");
  return (
    <div>
      <PageHeader eyebrow="Portfolio" title="Sandbox account" description="Simulated cash, positions and orders. Every change here traces back to your own click." />
      <Tabs defaultValue="overview">
        <TabsList className="mb-6">
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
