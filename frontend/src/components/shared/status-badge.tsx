import { CheckCircle2, AlertTriangle, OctagonX, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GateDecision, ProposalStatus } from "@/lib/types";

/**
 * StatusBadge (Section 2.7.4 / NFR-4.2): PASS, WARNING and REJECT always
 * show an icon and a word — colour alone never carries the meaning.
 */
export function StatusBadge({ decision, className }: { decision: GateDecision; className?: string }) {
  const map: Record<GateDecision, { label: string; icon: typeof CheckCircle2; tone: string }> = {
    PASS: { label: "PASS", icon: CheckCircle2, tone: "text-(--pass) bg-(--pass-bg)" },
    WARNING: { label: "WARNING", icon: AlertTriangle, tone: "text-(--warning) bg-(--warning-bg)" },
    REJECT: { label: "REJECT", icon: OctagonX, tone: "text-(--reject) bg-(--reject-bg)" },
  };
  const { label, icon: Icon, tone } = map[decision];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-body font-semibold leading-none",
        tone,
        className
      )}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </span>
  );
}

const PROPOSAL_STATUS_META: Record<ProposalStatus, { label: string; icon: typeof CheckCircle2; tone: string }> = {
  rejected: { label: "Rejected", icon: OctagonX, tone: "text-(--reject) bg-(--reject-bg)" },
  warning: { label: "Warning", icon: AlertTriangle, tone: "text-(--warning) bg-(--warning-bg)" },
  acknowledged: { label: "Acknowledged", icon: CheckCircle2, tone: "text-(--pass) bg-(--pass-bg)" },
  passed: { label: "Passed", icon: CheckCircle2, tone: "text-(--pass) bg-(--pass-bg)" },
  executed: { label: "Executed", icon: CheckCircle2, tone: "text-(--primary) bg-(--primary-soft)" },
  superseded: { label: "Superseded", icon: Circle, tone: "text-(--text-muted) bg-(--muted)" },
};

export function ProposalStatusBadge({ status, className }: { status: ProposalStatus; className?: string }) {
  const { label, icon: Icon, tone } = PROPOSAL_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-body font-medium leading-none",
        tone,
        className
      )}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </span>
  );
}
