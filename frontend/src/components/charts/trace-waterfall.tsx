"use client";

import { Bot, Cpu, Lock, ShieldCheck, Sparkles, Wrench, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TraceSpan } from "@/lib/types";

/**
 * One AI turn as a waterfall: each span (named after the OpenTelemetry GenAI conventions) is a row whose bar
 * starts and ends where the step did. The row's icon and name say what the step was, so colour is only a
 * second cue: the AI's own model calls in its gradient, tool calls in indigo, Aegis's checks in ink.
 * A tool call the broker refused says "denied" in words.
 */
interface Kind {
  icon: LucideIcon;
  bar: string;
  label: string;
}

function kindOf(span: TraceSpan): Kind {
  const op = String(span.attributes["gen_ai.operation.name"] ?? "");
  if (op === "invoke_agent") return { icon: Bot, bar: "bg-(--border-strong)", label: "Turn" };
  if (op === "chat") return { icon: Sparkles, bar: "bg-ai", label: "Model call" };
  if (op === "execute_tool") return { icon: Wrench, bar: "bg-(--primary)", label: "Tool call" };
  if (span.name === "aegis.grounding") return { icon: ShieldCheck, bar: "bg-(--text)", label: "Number check" };
  if (span.name === "aegis.template") return { icon: Cpu, bar: "bg-(--text-muted)", label: "Checked template" };
  return { icon: Cpu, bar: "bg-(--text-muted)", label: "Step" };
}

function depthOf(span: TraceSpan, byId: Map<number, TraceSpan>): number {
  let depth = 0;
  let parent = span.parent_id;
  while (parent !== null && parent !== undefined && depth < 6) {
    depth += 1;
    parent = byId.get(parent)?.parent_id ?? null;
  }
  return depth;
}

function ms(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${value < 10 ? value.toFixed(1) : Math.round(value)} ms`;
}

function detail(span: TraceSpan): string | null {
  const a = span.attributes;
  const parts: string[] = [];
  if (a["aegis.tier"]) parts.push(`${a["aegis.tier"]} · ${a["aegis.decision"]}`);
  if (a["aegis.gate.decision"]) parts.push(`gate ${a["aegis.gate.decision"]}`);
  const tokensIn = a["gen_ai.usage.input_tokens"];
  const tokensOut = a["gen_ai.usage.output_tokens"];
  if (typeof tokensIn === "number" || typeof tokensOut === "number") parts.push(`${tokensIn ?? 0} in / ${tokensOut ?? 0} out tokens`);
  if (a["aegis.grounding.figures_traced"] !== undefined) parts.push(`${a["aegis.grounding.figures_traced"]} figures traced`);
  if (a["aegis.grounding.unsupported"]) parts.push(`${a["aegis.grounding.unsupported"]} unsupported`);
  if (a["aegis.fallback.reason"]) parts.push(`reason: ${a["aegis.fallback.reason"]}`);
  return parts.length ? parts.join(" · ") : null;
}

export function TraceWaterfall({ spans }: { spans: TraceSpan[] }) {
  if (!spans.length) {
    return <p className="text-caption text-(--text-muted)">This turn was recorded before tracing was added.</p>;
  }
  const byId = new Map(spans.map((s) => [s.span_id, s]));
  const total = Math.max(...spans.map((s) => s.start_ms + s.duration_ms), 0.001);
  return (
    <div className="space-y-1.5" role="table" aria-label="Steps of this AI turn">
      <div role="row" className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_64px] gap-3 pb-1 text-[11px] font-medium text-(--text-muted)">
        <span role="columnheader">Step</span>
        <span role="columnheader">Timeline (0 to {ms(total)})</span>
        <span role="columnheader" className="text-right">
          Took
        </span>
      </div>
      {spans.map((span) => {
        const kind = kindOf(span);
        const Icon = kind.icon;
        const denied = span.attributes["aegis.decision"] === "denied";
        const left = (span.start_ms / total) * 100;
        const width = Math.max((span.duration_ms / total) * 100, 0.8);
        const info = detail(span);
        return (
          <div
            key={span.span_id}
            role="row"
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_64px] items-center gap-3 rounded-lg px-1 py-1 hover:bg-(--surface-2)"
            title={info ?? undefined}
          >
            <div role="cell" className="flex min-w-0 items-center gap-2" style={{ paddingLeft: depthOf(span, byId) * 14 }}>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-(--surface-2) text-(--text-muted) ring-1 ring-(--border)">
                {denied ? <Lock className="size-3.5" aria-hidden /> : <Icon className="size-3.5" aria-hidden />}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-mono text-[12px] text-(--text)">{span.name}</span>
                <span className="block truncate text-[11px] text-(--text-muted)">
                  {kind.label}
                  {denied ? " · denied" : ""}
                  {span.status === "error" && !denied ? " · error" : ""}
                  {info ? ` · ${info}` : ""}
                </span>
              </span>
            </div>
            <div role="cell" className="relative h-2.5 rounded-full bg-(--surface-2)">
              <span
                className={cn("absolute inset-y-0 rounded-full", denied ? "bg-(--border-strong)" : kind.bar)}
                style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
              />
            </div>
            <span role="cell" className="text-right font-mono text-[12px] tabular-nums text-(--text-muted)">
              {ms(span.duration_ms)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
