"use client";

import { Landmark } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { RuleBasis } from "@/lib/types";

/**
 * The regulatory requirement a rule is designed to meet (addition): one chip
 * per source, the full title and requirement on hover or focus.
 */
export function RegulationChips({ basis, className }: { basis: RuleBasis[] | undefined; className?: string }) {
  if (!basis?.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1", className)} aria-label="Regulatory basis">
      {basis.map((b) => (
        <li key={`${b.framework}-${b.ref}`}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-(--border) bg-(--surface) px-2 py-0.5 text-caption text-(--text-muted) hover:border-(--primary) hover:text-(--primary) focus-visible:outline-2 focus-visible:outline-(--primary)"
              >
                <Landmark className="size-3" aria-hidden />
                {b.framework} · {b.ref}
                <span className="sr-only">: {b.requirement}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-72 flex-col items-start gap-1">
              <span className="font-medium">{b.title}</span>
              <span className="opacity-90">{b.requirement}</span>
            </TooltipContent>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}
