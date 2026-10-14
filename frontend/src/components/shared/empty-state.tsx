import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

/** EmptyState (Section 2.7.4/2.7.6): one sentence on why, and a button for the next step. */
export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-(--border) bg-(--surface) px-6 py-12 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-(--muted) text-(--text-muted)">
        {icon ?? <Inbox className="size-5" aria-hidden />}
      </div>
      <p className="text-form font-semibold text-(--text)">{title}</p>
      <p className="max-w-sm text-body text-(--text-muted)">{description}</p>
      {actionLabel && onAction ? (
        <Button onClick={onAction} className="mt-1">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
