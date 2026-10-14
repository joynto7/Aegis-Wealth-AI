import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Percent({
  value,
  decimals = 1,
  className,
}: {
  value: number;
  decimals?: number;
  className?: string;
}) {
  return (
    <span data-figure className={cn("tabular-nums", className)}>
      {formatPercent(value, decimals)}
    </span>
  );
}
