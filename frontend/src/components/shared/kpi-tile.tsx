import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A stat tile: label (sentence case), value, and one line on what it means,
 * so no figure needs a tooltip to be understood. The icon sits in a tinted
 * square; colour never carries the meaning on its own.
 */
export function KpiTile({
  icon: Icon,
  label,
  value,
  hint,
  className,
  emphasis = false,
}: {
  icon?: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-(--border) bg-(--surface) p-5 shadow-card",
        emphasis && "ring-1 ring-(--primary)/30",
        className
      )}
    >
      <div className="flex items-center gap-2.5">
        {Icon ? (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-(--primary-soft) text-(--primary)">
            <Icon className="size-4" aria-hidden />
          </span>
        ) : null}
        <p className="text-body font-medium text-(--text-muted)">{label}</p>
      </div>
      <p className="text-key-figure text-(--text)">{value}</p>
      {hint ? <p className="text-caption leading-relaxed text-(--text-muted)">{hint}</p> : null}
    </div>
  );
}
