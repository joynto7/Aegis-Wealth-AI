"use client";

import { Cell, Label, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { AssetClass } from "@/lib/types";
import { ASSET_ORDER, useAssetColors, useChartSurface } from "@/lib/asset-colors";
import { ASSET_CLASS_LABEL } from "@/lib/labels";
import { formatPercent } from "@/lib/format";

/** Part-to-whole by asset class: four segments at most, a 2px surface gap between them, the label in the middle. */
export function AllocationDonut({
  weights,
  centerLabel,
  centerValue,
  height = 224,
}: {
  weights: Record<AssetClass, number>;
  centerLabel?: string;
  centerValue?: string;
  height?: number;
}) {
  const colors = useAssetColors();
  const surface = useChartSurface();
  const data = ASSET_ORDER.filter((cls) => weights[cls] > 0).map((cls) => ({
    name: ASSET_CLASS_LABEL[cls],
    value: weights[cls],
    cls,
  }));

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="68%"
            outerRadius="92%"
            paddingAngle={1}
            stroke={surface}
            strokeWidth={2}
            isAnimationActive={false}
          >
            {data.map((d) => (
              <Cell key={d.cls} fill={colors[d.cls]} />
            ))}
            {centerValue ? (
              <Label
                position="center"
                content={({ viewBox }) => {
                  const { cx, cy } = (viewBox ?? {}) as { cx?: number; cy?: number };
                  if (cx == null || cy == null) return null;
                  return (
                    <g>
                      <text x={cx} y={cy - 4} textAnchor="middle" className="fill-(--text) font-display" fontSize={20} fontWeight={700}>
                        {centerValue}
                      </text>
                      {centerLabel ? (
                        <text x={cx} y={cy + 16} textAnchor="middle" className="fill-(--text-muted)" fontSize={11}>
                          {centerLabel}
                        </text>
                      ) : null}
                    </g>
                  );
                }}
              />
            ) : null}
          </Pie>
          <Tooltip
            formatter={(value, name) => [formatPercent(Number(value)), String(name)]}
            contentStyle={{ borderRadius: 10, borderColor: "var(--border)", fontSize: 13 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/** The legend: a colour key, the class and its weight. Text stays in ink, never in the series colour. */
export function AllocationLegend({ weights, columns = false }: { weights: Record<AssetClass, number>; columns?: boolean }) {
  const colors = useAssetColors();
  return (
    <ul className={columns ? "grid grid-cols-2 gap-x-6 gap-y-2" : "flex flex-wrap gap-x-4 gap-y-1"}>
      {ASSET_ORDER.filter((cls) => weights[cls] > 0).map((cls) => (
        <li key={cls} className="flex items-center gap-2 text-caption text-(--text-muted)">
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[cls] }} aria-hidden />
          <span className="flex-1">{ASSET_CLASS_LABEL[cls]}</span>
          <span className="font-semibold tabular-nums text-(--text)">{formatPercent(weights[cls], 0)}</span>
        </li>
      ))}
    </ul>
  );
}
