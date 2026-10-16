"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { StressResult } from "@/lib/types";
import { formatMoney, formatPercent } from "@/lib/format";
import { ASSET_ORDER, useAssetColors } from "@/lib/asset-colors";
import { ASSET_CLASS_LABEL } from "@/lib/labels";

/**
 * One bar per scenario, stacked by each asset class's contribution in CNY
 * (FR-4.3). Classes keep their chart colours; losses are not drawn in red,
 * which Section 2.7.1 reserves for REJECT.
 */
export function StressBars({ stress }: { stress: StressResult[] }) {
  const colors = useAssetColors();
  const data = stress.map((s) => ({ name: s.scenario, label: s.name, ...s.contributions }));
  return (
    <div className="w-full space-y-3">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} stackOffset="sign" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--text-muted)" }} />
            <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickFormatter={(v: number) => formatMoney(v)} width={90} />
            <ReferenceLine y={0} stroke="var(--text-muted)" />
            <Tooltip
              formatter={(value, name) => [formatMoney(Number(value), true), ASSET_CLASS_LABEL[name as keyof typeof ASSET_CLASS_LABEL] ?? name]}
              labelFormatter={(label, payload) => payload?.[0]?.payload?.label ?? label}
              contentStyle={{ borderRadius: 8, borderColor: "var(--border)", fontSize: 13 }}
            />
            {ASSET_ORDER.map((cls) => (
              <Bar key={cls} dataKey={cls} stackId="contribution" fill={colors[cls]} maxBarSize={56} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="w-full text-left text-body">
        <thead className="border-b border-(--border) text-caption text-(--text-muted)">
          <tr>
            <th className="py-1.5">Scenario</th>
            <th className="py-1.5 text-right">Loss</th>
            <th className="py-1.5 text-right">Loss (CNY)</th>
          </tr>
        </thead>
        <tbody>
          {stress.map((s) => (
            <tr key={s.scenario} className="border-b border-(--border) last:border-0">
              <td className="py-1.5">
                <span className="font-mono text-caption text-(--text-muted)">{s.scenario}</span> {s.name}
              </td>
              <td className="py-1.5 text-right tabular-nums">{formatSigned(formatPercent(Math.abs(s.loss_pct), 2), s.loss_pct)}</td>
              <td className="py-1.5 text-right tabular-nums">{formatSigned(formatMoney(Math.abs(s.loss_cny), true), s.loss_cny)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-3 text-caption text-(--text-muted)" aria-hidden>
        {ASSET_ORDER.map((cls) => (
          <span key={cls} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: colors[cls] }} />
            {ASSET_CLASS_LABEL[cls]}
          </span>
        ))}
      </div>
      <p className="sr-only">
        {stress.map((s) => `${s.name}: a loss of ${formatMoney(Math.abs(s.loss_cny))} (${formatPercent(Math.abs(s.loss_pct))}).`).join(" ")}
      </p>
    </div>
  );
}

/** A true minus sign for losses (Section 2.7.4). */
function formatSigned(text: string, value: number) {
  return value < 0 ? `−${text}` : text;
}
