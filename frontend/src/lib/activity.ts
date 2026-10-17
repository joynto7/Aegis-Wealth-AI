import {
  Activity,
  BadgeCheck,
  CalendarClock,
  Bot,
  ClipboardCheck,
  FileSpreadsheet,
  Flag,
  Gauge,
  History,
  Lock,
  Repeat,
  MessageSquareHeart,
  Scale,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { LogEntry } from "@/lib/types";

/** Plain-English names and icons for operation-log actions, for the client's own activity feed. */
export const ACTIVITY: Record<string, { label: string; icon: LucideIcon }> = {
  login: { label: "Signed in", icon: Lock },
  logout: { label: "Signed out", icon: Lock },
  profile_submitted: { label: "Risk profile saved", icon: Gauge },
  replay_reaction: { label: "Crisis replay answered", icon: History },
  proposal_created: { label: "Proposal created", icon: FileSpreadsheet },
  proposal_revised: { label: "Proposal revised", icon: FileSpreadsheet },
  gate_decided: { label: "Compliance gate decided", icon: Scale },
  warnings_acknowledged: { label: "Warnings acknowledged", icon: BadgeCheck },
  quiz_attempted: { label: "Comprehension quiz taken", icon: BadgeCheck },
  token_issued: { label: "Confirmation token issued", icon: Lock },
  orders_executed: { label: "Sandbox orders filled", icon: Wallet },
  record_created: { label: "Advice record sealed", icon: ShieldCheck },
  agent_turn: { label: "Asked Aegis", icon: Bot },
  tool_call: { label: "Aegis used a tool", icon: Bot },
  permission_denied: { label: "Request blocked by the broker", icon: ShieldCheck },
  chain_verified: { label: "Record chain verified", icon: ShieldCheck },
  goal_set: { label: "Goal saved", icon: Flag },
  chat_feedback: { label: "Rated an answer", icon: MessageSquareHeart },
  review_decided: { label: "AI turn reviewed", icon: ClipboardCheck },
  market_advanced: { label: "Simulated market moved", icon: CalendarClock },
  rebalance_proposed: { label: "Rebalancing proposed", icon: Repeat },
};

export function describeActivity(entry: LogEntry): string {
  const base = ACTIVITY[entry.action]?.label ?? entry.action.replace(/_/g, " ");
  const d = entry.detail as Record<string, unknown>;
  if (entry.action === "gate_decided" && d.decision) return `${base}: ${String(d.decision)}`;
  if (entry.action === "tool_call" && entry.tool) return `${base}: ${entry.tool} (${entry.tier})`;
  if (entry.action === "permission_denied" && entry.tool) return `${base}: ${entry.tool}`;
  if ((entry.action === "proposal_created" || entry.action === "proposal_revised") && d.proposal_id) return `${base} #${String(d.proposal_id)}`;
  if (entry.action === "goal_set" && d.horizon_years) return `${base}: a ${String(d.horizon_years)}-year target`;
  if (entry.action === "chat_feedback" && d.rating) return `${base}: ${d.rating === "down" ? "not helpful" : "helpful"}`;
  if (entry.action === "review_decided" && d.decision) return `${base}: ${String(d.decision)}`;
  if (entry.action === "rebalance_proposed" && d.proposal_id) return `${base} #${String(d.proposal_id)}${entry.actor === "agent" ? " by Aegis" : ""}`;
  if (entry.action === "market_advanced" && d.as_of) return `${base} to ${String(d.as_of)}`;
  return base;
}


export const FALLBACK_ACTIVITY_ICON = Activity;
