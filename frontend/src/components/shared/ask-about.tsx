"use client";

import { Sparkles } from "lucide-react";
import { useAskAegis } from "@/components/shell/app-shell";
import { cn } from "@/lib/utils";

/**
 * "Ask about this": the AI as part of the page, not only a chat box. Opens the advisor with a question about
 * the thing beside it (a rule, a figure, a chart), already filled in and sent.
 */
export function AskAbout({
  question,
  label = "Ask",
  className,
}: {
  question: string;
  label?: string;
  className?: string;
}) {
  const ask = useAskAegis();
  return (
    <button
      type="button"
      onClick={() => ask(question)}
      className={cn(
        "no-print inline-flex items-center gap-1 rounded-full border border-(--border) bg-(--surface) px-2 py-0.5 text-[11px] font-semibold text-(--text-muted) transition-colors hover:border-(--primary)/40 hover:text-(--primary)",
        className
      )}
      title={question}
    >
      <Sparkles className="size-3 text-(--primary)" aria-hidden />
      {label}
      <span className="sr-only">: {question}</span>
    </button>
  );
}
