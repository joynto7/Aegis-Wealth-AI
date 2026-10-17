"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, Check, Wand2 } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { AskAbout } from "@/components/shared/ask-about";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { useRemedy, useReviseProposal } from "@/lib/queries";
import { useAssetColors } from "@/lib/asset-colors";
import { cn } from "@/lib/utils";
import type { Proposal } from "@/lib/types";

/**
 * How to fix: the gate's decision explained by what would need to change (a counterfactual explanation),
 * computed by code, not the AI. One click applies it as the next version, which the gate checks again.
 */
export function FixPanel({ proposal }: { proposal: Proposal }) {
  const router = useRouter();
  const colors = useAssetColors();
  const open = proposal.status === "rejected" || proposal.status === "warning";
  const remedy = useRemedy(proposal.id, open);
  const revise = useReviseProposal(proposal.id);
  if (!open) return null;

  async function apply() {
    if (!remedy.data) return;
    const next = await revise.mutateAsync(remedy.data.items);
    router.push(`/proposals/${next.id}`);
  }

  const fix = remedy.data;
  const rejected = proposal.status === "rejected";
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-(--surface) shadow-card",
        rejected ? "border-(--reject)/30" : "border-(--warning)/30"
      )}
      aria-labelledby="fix-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 pt-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 items-center justify-center rounded-xl bg-(--primary-soft) text-(--primary)">
            <Wand2 className="size-[18px]" aria-hidden />
          </span>
          <div>
            <h2 id="fix-title" className="font-display text-form font-bold text-(--text)">
              How to fix this version
            </h2>
            <p className="mt-0.5 max-w-2xl text-caption leading-relaxed text-(--text-muted)">
              {rejected
                ? "The gate rejected this version. Here is the smallest change, computed by code, that gets it through."
                : "The gate raised a warning. You can acknowledge it on the Confirm screen, or apply the change that clears it."}
            </p>
          </div>
        </div>
        {fix ? (
          <div className="flex items-center gap-2" aria-label={`Verdict goes from ${fix.gate_before} to ${fix.gate_after}`}>
            <StatusBadge decision={fix.gate_before} className="px-2 py-0.5 text-caption [&_svg]:size-3.5" />
            <ArrowRight className="size-4 text-(--text-muted)" aria-hidden />
            <StatusBadge decision={fix.gate_after} className="px-2 py-0.5 text-caption [&_svg]:size-3.5" />
          </div>
        ) : null}
      </div>

      <div className="px-6 pb-6 pt-4">
        {remedy.isLoading ? (
          <div className="space-y-2">
            <span className="shimmer block h-10 w-full rounded-xl" />
            <span className="shimmer block h-10 w-full rounded-xl" />
          </div>
        ) : remedy.isError ? (
          <ErrorState error={remedy.error} compact />
        ) : fix && fix.changes.length ? (
          <>
            <p className="text-body text-(--text)">{fix.summary}</p>
            <ul className="mt-4 divide-y divide-(--border) rounded-xl border border-(--border)">
              {fix.changes.map((c) => (
                <li key={c.product_code} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-body">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: colors[c.asset_class] }} aria-hidden />
                      <span className="font-semibold text-(--text)">{c.name}</span>
                      <span className="font-mono text-caption text-(--text-muted)">{c.product_code}</span>
                      {c.rule_ids.map((id) => (
                        <span key={id} className="rounded-md bg-(--muted) px-1.5 font-mono text-[11px] text-(--text-muted)">
                          {id}
                        </span>
                      ))}
                    </p>
                    <p className="mt-0.5 pl-[18px] text-caption leading-relaxed text-(--text-muted)">{c.reasons.join(" ")}</p>
                  </div>
                  <p className="flex items-center gap-2 pl-[18px] font-display text-body font-bold tabular-nums sm:pl-0">
                    <span className={cn(c.to_pct < c.from_pct ? "text-(--text-muted) line-through decoration-1" : "text-(--text-muted)")}>
                      {c.from_pct}%
                    </span>
                    <ArrowRight className="size-3.5 text-(--text-muted)" aria-hidden />
                    <span className="text-(--text)">{c.to_pct}%</span>
                  </p>
                </li>
              ))}
            </ul>
            {fix.failed_after.length ? (
              <p className="mt-3 text-caption text-(--text-muted)">
                Still flagged after the fix: {fix.failed_after.join(", ")}. These are warnings you can acknowledge.
              </p>
            ) : null}
            {revise.isError ? <ErrorState error={revise.error} compact className="mt-3" /> : null}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <AskAbout question={`Explain the suggested fix for proposal #${proposal.id} in plain words.`} label="Ask Aegis to explain" />
              <Button onClick={apply} disabled={revise.isPending}>
                <Check className="size-4" />
                {revise.isPending ? "Applying…" : `Apply as version ${proposal.version + 1}`}
              </Button>
            </div>
          </>
        ) : (
          <p className="text-body text-(--text-muted)">{fix?.summary ?? "No change can clear this flag automatically."}</p>
        )}
      </div>
    </section>
  );
}
