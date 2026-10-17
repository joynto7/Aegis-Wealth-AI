"use client";

import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { NumberSource } from "@/lib/types";

/** Plain names for the agent's tools, as the client sees them. */
export const TOOL_LABEL: Record<string, string> = {
  search_products: "Product search",
  compare_products: "Fee comparison",
  explain_rule: "Compliance rule",
  get_profile_summary: "Your risk profile",
  get_proposal: "Your proposal",
  create_proposal: "New proposal",
  revise_proposal: "Revised proposal",
  project_goal: "Goal projection",
  suggest_fix: "How to fix",
};

export function sourceLabel(source: NumberSource): string {
  if (source.kind === "message") return "Your own message";
  if (source.kind === "context") return `Your profile${source.path ? `: ${source.path.replace(/_/g, " ")}` : ""}`;
  return `${TOOL_LABEL[source.tool ?? ""] ?? source.tool}: ${source.path}`;
}

function formatValue(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/**
 * An assistant reply with every figure linked to where it came from
 * (addition). The grounding check already matched each figure to a tool
 * result, the client's message or their profile before the reply was sent;
 * this only shows that match. Small whole numbers and years need no source
 * and stay plain text.
 */
export function ReplyText({ text, sources }: { text: string; sources?: NumberSource[] | null }) {
  const usable = (sources ?? [])
    .filter((s) => s.start >= 0 && s.end <= text.length && text.slice(s.start, s.end) === s.text)
    .sort((a, b) => a.start - b.start);
  if (!usable.length) return <>{text}</>;

  const parts: ReactNode[] = [];
  let cursor = 0;
  usable.forEach((source, i) => {
    if (source.start < cursor) return;
    if (source.start > cursor) parts.push(text.slice(cursor, source.start));
    parts.push(<SourcedFigure key={i} source={source} />);
    cursor = source.end;
  });
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}

function SourcedFigure({ source }: { source: NumberSource }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="cursor-help rounded-sm font-semibold underline decoration-(--primary) decoration-dotted decoration-2 underline-offset-[3px] focus-visible:outline-2 focus-visible:outline-(--primary)"
        >
          {source.text}
          <span className="sr-only"> (source: {sourceLabel(source)})</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-72 flex-col items-start gap-0.5">
        <span className="font-medium">Source: {sourceLabel(source)}</span>
        <span className="opacity-80">Value there: {formatValue(source.value)}</span>
      </TooltipContent>
    </Tooltip>
  );
}
