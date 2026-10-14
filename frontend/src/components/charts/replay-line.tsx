"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceDot, CartesianGrid } from "recharts";
import type { ReplayPoint } from "@/lib/types";
import { formatMoney } from "@/lib/format";

export function ReplayLine({ series, lowestMonth }: { series: ReplayPoint[]; lowestMonth: string }) {
  const lowestPoint = series.find((p) => p.month === lowestMonth);
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            tickFormatter={(v: number) => formatMoney(v)}
            width={90}
          />
          <Tooltip
            formatter={(value) => [formatMoney(Number(value)), "Value"]}
            contentStyle={{ borderRadius: 8, borderColor: "var(--border)", fontSize: 13 }}
          />
          <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={false} />
          {lowestPoint ? (
            <ReferenceDot x={lowestPoint.month} y={lowestPoint.value} r={5} fill="#b91c1c" stroke="none" />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
