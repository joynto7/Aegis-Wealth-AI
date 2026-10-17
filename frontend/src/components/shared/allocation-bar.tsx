"use client";

import { ASSET_ORDER, useAssetColors } from "@/lib/asset-colors";
import { ASSET_CLASS_LABEL } from "@/lib/labels";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AssetClass } from "@/lib/types";

/**
 * A one-line allocation: a stacked bar by asset class with 2px surface gaps
 * between segments, and an optional legend with each class's weight.
 */
export function AllocationBar({
  weights,
  legend = true,
  className,
  height = "h-2.5",
}: {
  weights: Record<AssetClass, number>;
  legend?: boolean;
  className?: string;
  height?: string;
}) {
  const colors = useAssetColors();
  const classes = ASSET_ORDER.filter((c) => weights[c] > 0);
  return (
    <div className={cn("space-y-2", className)}>
      <div
        className={cn("flex w-full gap-[2px] overflow-hidden rounded-full", height)}
        role="img"
        aria-label={classes.map((c) => `${ASSET_CLASS_LABEL[c]} ${formatPercent(weights[c], 0)}`).join(", ")}
      >
        {classes.map((c) => (
          <span key={c} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${weights[c]}%`, backgroundColor: colors[c] }} />
        ))}
      </div>
      {legend ? (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-caption text-(--text-muted)">
          {classes.map((c) => (
            <li key={c} className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ backgroundColor: colors[c] }} aria-hidden />
              {ASSET_CLASS_LABEL[c]} <span className="font-semibold tabular-nums text-(--text)">{formatPercent(weights[c], 0)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
