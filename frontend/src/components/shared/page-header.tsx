import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** PageHeader (Section 2.7.4): title, description, one primary action. */
export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-start justify-between gap-4", className)}>
      <div>
        <h1 className="text-page-title text-(--text)">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-body text-(--text-muted)">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}
