"use client";

import { formatMoney } from "@/lib/format";
import { usePrivacy } from "@/lib/privacy";
import { cn } from "@/lib/utils";

/** An amount in CNY. Hidden as "CNY ••••••" while privacy mode is on. */
export function Money({
  value,
  withCents = false,
  className,
}: {
  value: number;
  withCents?: boolean;
  className?: string;
}) {
  const { hidden } = usePrivacy();
  if (hidden) {
    return (
      <span data-figure className={cn("tabular-nums", className)} aria-label="Amount hidden">
        CNY ••••••
      </span>
    );
  }
  return (
    <span data-figure className={cn("tabular-nums", className)}>
      {formatMoney(value, withCents)}
    </span>
  );
}
