"use client";

import { Bot, FileCheck2, Fingerprint, Info, Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Provenance } from "@/lib/types";

/**
 * The explicit label on every reply (China's AI-content labelling measures, EU AI Act Art. 50), opening its
 * machine-readable provenance: what produced the reply, the configuration fingerprint and the SHA-256 of the
 * text. A model reply wears the AI gradient; a checked template and a system notice say what they are.
 */
export function AiLabel({ provenance, className }: { provenance: Provenance; className?: string }) {
  const ai = provenance.ai_generated;
  const Icon = ai ? Sparkles : provenance.mode === "suspended" ? Info : FileCheck2;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4 transition-opacity hover:opacity-85",
            ai ? "bg-ai text-white" : "bg-(--muted) text-(--text-muted)",
            className
          )}
          aria-label={`${provenance.label}. Show where this reply came from`}
        >
          <Icon className="size-3" aria-hidden />
          {provenance.label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b border-(--border) px-4 py-3">
          <p className="flex items-center gap-1.5 text-body font-semibold text-(--text)">
            {ai ? <Sparkles className="size-4 text-(--primary)" aria-hidden /> : <Bot className="size-4" aria-hidden />}
            {provenance.label}
          </p>
          <p className="mt-0.5 text-caption text-(--text-muted)">
            {ai
              ? `Written by ${provenance.model ?? "the model"} and checked by code before you saw it.`
              : provenance.mode === "suspended"
                ? "A fixed notice: the AI advisor is paused."
                : "A checked template filled from the same tools, used when the model is unavailable."}
          </p>
        </div>
        <dl className="space-y-2 px-4 py-3 text-caption">
          <Row label="Generator" value={provenance.generator + (provenance.provider ? ` · ${provenance.provider}` : "")} />
          <Row label="Time" value={formatDateTime(provenance.created_at)} />
          <Row label="Config" value={provenance.config_fingerprint.slice(0, 16)} mono icon />
          <Row label="Text SHA-256" value={provenance.content_sha256.slice(0, 16)} mono />
        </dl>
        <p className="border-t border-(--border) px-4 py-2.5 text-[11px] leading-relaxed text-(--text-muted)">
          Labelled under {provenance.standards.join(" and ")}. The same facts travel in the reply&apos;s response headers.
        </p>
      </PopoverContent>
    </Popover>
  );
}

function Row({ label, value, mono = false, icon = false }: { label: string; value: string; mono?: boolean; icon?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-(--text-muted)">{label}</dt>
      <dd className={cn("flex items-center gap-1 truncate text-(--text)", mono && "font-mono text-[11.5px]")}>
        {icon ? <Fingerprint className="size-3 text-(--text-muted)" aria-hidden /> : null}
        {value}
      </dd>
    </div>
  );
}

/** The notice at the top of every conversation (EU AI Act Art. 50(1)): the client is talking to an AI system. */
export function AiNotice({ className }: { className?: string }) {
  return (
    <div className={cn("ring-ai flex items-start gap-2.5 rounded-xl bg-(--ai-soft) px-3 py-2.5", className)}>
      <span className="bg-ai mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg">
        <Sparkles className="size-3.5" aria-hidden />
      </span>
      <p className="text-caption leading-relaxed text-(--text)">
        <span className="font-semibold">You&apos;re talking to an AI system.</span> Every figure is checked against a tool
        result first, every reply is labelled, and it can&apos;t place orders: only your own Confirm click can.
      </p>
    </div>
  );
}
