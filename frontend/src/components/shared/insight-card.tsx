import Link from "next/link";
import { ArrowUpRight, BadgeCheck, CircleAlert, Lightbulb, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Insight } from "@/lib/types";

/**
 * One line of the briefing: what the client's numbers mean, computed by code. Tone is said by an icon and
 * a word, never by green, amber or red (kept for the gate's verdicts).
 */
const TONES: Record<Insight["tone"], { icon: LucideIcon; label: string; chip: string }> = {
  positive: { icon: BadgeCheck, label: "Good", chip: "text-(--primary) bg-(--primary-soft)" },
  attention: { icon: CircleAlert, label: "Look at this", chip: "text-(--text) bg-(--surface-3) ring-1 ring-(--border-strong)" },
  info: { icon: Lightbulb, label: "Good to know", chip: "text-(--text-muted) bg-(--muted)" },
};

export function InsightCard({ insight, className }: { insight: Insight; className?: string }) {
  const tone = TONES[insight.tone];
  const Icon = tone.icon;
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", tone.chip)}>
          <Icon className="size-3" aria-hidden />
          {tone.label}
        </span>
        {insight.href ? (
          <ArrowUpRight
            className="size-4 text-(--text-muted) transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-(--primary)"
            aria-hidden
          />
        ) : null}
      </div>
      {insight.figure ? (
        <p className="mt-3 font-display text-[26px] font-bold leading-none tracking-tight text-(--text)">{insight.figure}</p>
      ) : null}
      {insight.figure_label ? <p className="mt-1 text-caption text-(--text-muted)">{insight.figure_label}</p> : null}
      <p className={cn("text-body font-semibold text-(--text)", insight.figure ? "mt-3" : "mt-3")}>{insight.title}</p>
      <p className="mt-1 text-caption leading-relaxed text-(--text-muted)">{insight.body}</p>
    </>
  );
  const shell = cn(
    "group flex h-full flex-col rounded-2xl border border-(--border) bg-(--surface) p-5 shadow-card transition-[border-color,box-shadow,transform] duration-200",
    insight.href && "hover:-translate-y-0.5 hover:border-(--primary)/35 hover:shadow-raised",
    className
  );
  return insight.href ? (
    <Link href={insight.href} className={shell} aria-label={`${insight.title}. ${insight.action ?? "Open"}`}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}
