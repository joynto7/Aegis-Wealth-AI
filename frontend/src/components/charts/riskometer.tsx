"use client";

import { useTheme } from "next-themes";
import { tierLabel } from "@/lib/labels";

/**
 * Riskometer: the client's tier as a 180° gauge (after SEBI's risk-o-meter,
 * docs/ui-redesign.md). Five segments, filled up to the tier on a validated
 * one-hue ordinal ramp; the needle and the words "Tier 3 · Balanced" carry the
 * value, so colour never does it alone.
 */
const RAMP_LIGHT = ["#8b97f7", "#7480f5", "#6366f1", "#4f46e5", "#3730a3"];
const RAMP_DARK = ["#4f46e5", "#6366f1", "#818cf8", "#a5b4fc", "#c7d2fe"];

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
}

function arc(cx: number, cy: number, rOuter: number, rInner: number, start: number, end: number) {
  const p1 = polar(cx, cy, rOuter, start);
  const p2 = polar(cx, cy, rOuter, end);
  const p3 = polar(cx, cy, rInner, end);
  const p4 = polar(cx, cy, rInner, start);
  return `M ${p1.x} ${p1.y} A ${rOuter} ${rOuter} 0 0 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${rInner} ${rInner} 0 0 0 ${p4.x} ${p4.y} Z`;
}

export function Riskometer({ tier, size = 220, showLabel = true }: { tier: number; size?: number; showLabel?: boolean }) {
  const { resolvedTheme } = useTheme();
  const ramp = resolvedTheme === "dark" ? RAMP_DARK : RAMP_LIGHT;
  const w = 220;
  const h = 128;
  const cx = w / 2;
  const cy = 112;
  const segments = [1, 2, 3, 4, 5];
  const gap = 2.2; // degrees between segments
  const span = 180 / 5;
  const needleAngle = 180 - (tier - 0.5) * span;
  const tip = polar(cx, cy, 78, needleAngle);
  return (
    <figure className="flex flex-col items-center" aria-label={`Risk tier ${tier} of 5, ${tierLabel(tier)}`}>
      <svg viewBox={`0 0 ${w} ${h}`} width={size} height={(size * h) / w} role="img" aria-hidden>
        {segments.map((s) => {
          const start = 180 - (s - 1) * span - gap / 2;
          const end = 180 - s * span + gap / 2;
          return (
            <path
              key={s}
              d={arc(cx, cy, 100, 74, start, end)}
              fill={s <= tier ? ramp[s - 1] : "var(--muted)"}
              stroke="none"
            />
          );
        })}
        <line x1={cx} y1={cy} x2={tip.x} y2={tip.y} stroke="var(--text)" strokeWidth={3} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={7} fill="var(--text)" />
        <circle cx={cx} cy={cy} r={2.5} fill="var(--surface)" />
        <text x={14} y={126} fontSize={10} className="fill-(--text-muted)">
          Low
        </text>
        <text x={w - 14} y={126} fontSize={10} textAnchor="end" className="fill-(--text-muted)">
          High
        </text>
      </svg>
      {showLabel ? (
        <figcaption className="-mt-1 text-center">
          <span className="font-display text-section text-(--text)">Tier {tier}</span>
          <span className="block text-body text-(--text-muted)">{tierLabel(tier)}</span>
        </figcaption>
      ) : null}
    </figure>
  );
}

/** A 0–100 score as a slim labelled meter, for capacity and willingness. */
export function ScoreMeter({ label, score }: { label: string; score: number }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-caption">
        <span className="text-(--text-muted)">{label}</span>
        <span className="font-semibold tabular-nums text-(--text)">{score} / 100</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-(--primary-soft)" role="meter" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-(--primary)" style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}
