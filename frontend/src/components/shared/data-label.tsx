import { cn } from "@/lib/utils";

/** DataLabel (Section 2.7.4): the "Sample data", "Hypothetical", "Simulated" or "Illustrative" chip. */
export function DataLabel({ label, asOf, className }: { label: string; asOf?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-(--border) bg-(--surface) px-2 py-0.5 text-caption text-(--text-muted)",
        className
      )}
    >
      {label}
      {asOf ? ` · ${asOf}` : ""}
    </span>
  );
}
