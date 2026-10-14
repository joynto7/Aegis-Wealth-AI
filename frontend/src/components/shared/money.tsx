import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Money({
  value,
  withCents = false,
  className,
}: {
  value: number;
  withCents?: boolean;
  className?: string;
}) {
  return (
    <span data-figure className={cn("tabular-nums", className)}>
      {formatMoney(value, withCents)}
    </span>
  );
}
