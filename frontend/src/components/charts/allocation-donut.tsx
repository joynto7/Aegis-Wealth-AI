"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { AssetClass } from "@/lib/types";
import { ASSET_COLORS, ASSET_ORDER } from "@/lib/asset-colors";
import { ASSET_CLASS_LABEL } from "@/lib/labels";
import { formatPercent } from "@/lib/format";

export function AllocationDonut({ weights }: { weights: Record<AssetClass, number> }) {
  const data = ASSET_ORDER.filter((cls) => weights[cls] > 0).map((cls) => ({
    name: ASSET_CLASS_LABEL[cls],
    value: weights[cls],
    cls,
  }));

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
            {data.map((d) => (
              <Cell key={d.cls} fill={ASSET_COLORS[d.cls]} stroke="var(--surface)" strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name) => [formatPercent(Number(value)), String(name)]}
            contentStyle={{ borderRadius: 8, borderColor: "var(--border)", fontSize: 13 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AllocationLegend({ weights }: { weights: Record<AssetClass, number> }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {ASSET_ORDER.filter((cls) => weights[cls] > 0).map((cls) => (
        <li key={cls} className="flex items-center gap-1.5 text-caption text-(--text-muted)">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: ASSET_COLORS[cls] }} aria-hidden />
          {ASSET_CLASS_LABEL[cls]} · {formatPercent(weights[cls])}
        </li>
      ))}
    </ul>
  );
}
