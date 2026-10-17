"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Money } from "@/components/shared/money";
import { useAssetColors } from "@/lib/asset-colors";
import { ASSET_CLASS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { OrderSide, RebalanceTrade } from "@/lib/types";

const g = (n: number) => String(Number(n.toPrecision(6)));

/** Sell or Buy, said with an icon and a word. Neither uses the verdict colours (green, amber, red). */
export function SideChip({ side, className }: { side: OrderSide; className?: string }) {
  const sell = side === "sell";
  const Icon = sell ? ArrowDownRight : ArrowUpRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold",
        sell ? "bg-(--muted) text-(--text)" : "bg-(--primary-soft) text-(--primary)",
        className
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {sell ? "Sell" : "Buy"}
    </span>
  );
}

/** A rebalancing's trades, sales first: each product's weight before and after, the units and the amount at the NAV. */
export function TradesTable({ trades, empty = "No trade is needed: every holding is within CNY 1 of its target." }: { trades: RebalanceTrade[]; empty?: string }) {
  const colors = useAssetColors();
  if (!trades.length) return <p className="py-4 text-center text-body text-(--text-muted)">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-left text-body">
        <thead className="text-caption text-(--text-muted)">
          <tr className="border-b border-(--border)">
            <th className="py-2.5 pr-3 font-medium">Trade</th>
            <th className="py-2.5 pr-3 font-medium">Product</th>
            <th className="whitespace-nowrap py-2.5 pr-3 text-right font-medium">Weight</th>
            <th className="whitespace-nowrap py-2.5 pr-3 text-right font-medium">Units at NAV</th>
            <th className="whitespace-nowrap py-2.5 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={`${t.side}-${t.product_code}`} className="border-b border-(--border) last:border-0">
              <td className="py-2.5 pr-3">
                <SideChip side={t.side} />
              </td>
              <td className="py-2.5 pr-3">
                <span className="flex items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[t.asset_class] }} aria-hidden />
                  <span className="font-medium text-(--text)">{t.name}</span>
                  <span className="text-caption text-(--text-muted)">{ASSET_CLASS_LABEL[t.asset_class]}</span>
                </span>
              </td>
              <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums">
                <span className="text-(--text-muted)">{g(t.from_pct)}%</span> → <span className="font-semibold text-(--text)">{g(t.to_pct)}%</span>
              </td>
              <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums text-(--text-muted)">
                {t.units.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} at {t.nav.toFixed(4)}
              </td>
              <td className="whitespace-nowrap py-2.5 text-right font-semibold">
                <Money value={t.amount} withCents />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
