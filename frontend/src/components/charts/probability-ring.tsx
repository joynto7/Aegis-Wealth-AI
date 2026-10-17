"use client";

import { AnimatedNumber } from "@/components/shared/figure";
import { useChartTheme } from "@/lib/chart-theme";
import { cn } from "@/lib/utils";

/**
 * A meter for one ratio against 100%: the chance of reaching a goal. The fill and its unfilled track are two
 * steps of the same indigo ramp; the figure in the middle carries the value, so colour never does it alone.
 * Not a status colour: green, amber and red stay with the compliance verdicts.
 */
export function ProbabilityRing({
  value,
  size = 132,
  stroke = 12,
  label = "chance",
  className,
}: {
  value: number | null;
  size?: number;
  stroke?: number;
  label?: string;
  className?: string;
}) {
  const theme = useChartTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${pct}% ${label}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={theme.track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={theme.accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 600ms var(--ease-out)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-display text-[26px] font-bold leading-none text-(--text)" style={{ fontSize: size * 0.2 }}>
          {value === null ? "—" : <AnimatedNumber value={pct} decimals={pct % 1 ? 1 : 0} suffix="%" />}
        </span>
        <span className="mt-1 text-[11px] font-medium text-(--text-muted)">{label}</span>
      </div>
    </div>
  );
}
