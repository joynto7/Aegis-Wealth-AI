"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { StressResult } from "@/lib/types";
import { formatMoney, formatPercent } from "@/lib/format";

export function StressBars({ stress }: { stress: StressResult[] }) {
  const data = stress.map((s) => ({ name: s.scenario, label: s.name, loss_pct: s.loss_pct, loss_cny: s.loss_cny }));
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--text-muted)" }} />
          <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickFormatter={(v: number) => `${v}%`} />
          <Tooltip
            formatter={(value) => [formatPercent(Number(value)), "Loss"]}
            labelFormatter={(label, payload) => payload?.[0]?.payload?.label ?? label}
            contentStyle={{ borderRadius: 8, borderColor: "var(--border)", fontSize: 13 }}
          />
          <Bar dataKey="loss_pct" radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.name} fill="#b91c1c" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="sr-only">
        {stress.map((s) => `${s.name}: a loss of ${formatMoney(Math.abs(s.loss_cny))} (${formatPercent(Math.abs(s.loss_pct))}).`).join(" ")}
      </p>
    </div>
  );
}
