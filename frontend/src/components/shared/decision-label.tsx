import { Ban, Check } from "lucide-react";
import type { LogDecision } from "@/lib/types";

/** A log entry's allowed/denied decision; denied rows carry an icon (Section 2.7.5, S12). */
export function DecisionLabel({ decision }: { decision: LogDecision | null }) {
  if (!decision) return <span className="text-(--text-muted)">—</span>;
  return decision === "denied" ? (
    <span className="inline-flex items-center gap-1 font-semibold text-(--text)">
      <Ban className="size-3.5" aria-hidden />
      denied
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-(--text-muted)">
      <Check className="size-3.5" aria-hidden />
      allowed
    </span>
  );
}
