import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** A titled card: icon, title, optional one-line description and action, then the content. */
export function Panel({
  icon: Icon,
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("flex flex-col rounded-2xl border border-(--border) bg-(--surface) shadow-card", className)}>
      <header className="flex items-start justify-between gap-3 px-6 pt-5">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-(--primary-soft) text-(--primary)">
              <Icon className="size-4" aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="font-display text-form font-bold text-(--text)">{title}</h2>
            {description ? <p className="mt-0.5 text-caption leading-relaxed text-(--text-muted)">{description}</p> : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className={cn("flex-1 px-6 pb-6 pt-4", bodyClassName)}>{children}</div>
    </section>
  );
}
