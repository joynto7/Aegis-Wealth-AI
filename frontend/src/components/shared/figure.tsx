"use client";

import NumberFlow from "@number-flow/react";
import { usePrivacy } from "@/lib/privacy";
import { cn } from "@/lib/utils";

/**
 * Animated figures (v2): numbers that change roll to their new value instead of
 * jumping, so a client sees what moved. Same house style as <Money> ("CNY 200,000"),
 * hidden by privacy mode, and still under prefers-reduced-motion.
 */
export function AnimatedMoney({ value, className }: { value: number; className?: string }) {
  const { hidden } = usePrivacy();
  if (hidden) {
    return (
      <span data-figure className={cn("tabular-nums", className)} aria-label="Amount hidden">
        CNY ••••••
      </span>
    );
  }
  return (
    <NumberFlow
      value={Math.round(value)}
      prefix="CNY "
      locales="en-US"
      format={{ maximumFractionDigits: 0 }}
      className={cn("tabular-nums", className)}
      data-figure
    />
  );
}

export function AnimatedNumber({
  value,
  decimals = 0,
  suffix,
  prefix,
  className,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
}) {
  return (
    <NumberFlow
      value={value}
      prefix={prefix}
      suffix={suffix}
      locales="en-US"
      format={{ minimumFractionDigits: decimals, maximumFractionDigits: decimals }}
      className={cn("tabular-nums", className)}
      data-figure
    />
  );
}
