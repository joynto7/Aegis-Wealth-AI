"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CompareItem } from "@/lib/types";
import { formatMoney } from "@/lib/format";

const COLORS = ["#2563eb", "#0f766e", "#b7791f"];

export function FeeBars({ items }: { items: CompareItem[] }) {
  const data = items.map((i) => ({ name: i.code, label: i.name, fee_cost: i.fee_cost }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--text-muted)" }} />
          <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickFormatter={(v: number) => formatMoney(v)} width={90} />
          <Tooltip
            formatter={(value) => [formatMoney(Number(value)), "Fee cost"]}
            labelFormatter={(label, payload) => payload?.[0]?.payload?.label ?? label}
            contentStyle={{ borderRadius: 8, borderColor: "var(--border)", fontSize: 13 }}
          />
          <Bar dataKey="fee_cost" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={d.name} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
