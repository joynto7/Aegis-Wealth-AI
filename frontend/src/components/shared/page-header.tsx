import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** PageHeader (Section 2.7.4): an eyebrow, the title, one line on what the page is for, and its actions. */
export function PageHeader({
  title,
  description,
  action,
  eyebrow,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  eyebrow?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-8 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="text-eyebrow mb-1.5 text-(--primary)">{eyebrow}</p> : null}
        <h1 className="text-page-title text-(--text)">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-body text-(--text-muted)">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}
