import type { LogEntry, ReviewFlag, ReviewItem, ReviewQueue, ReviewStatus, TurnDetail } from "@/lib/types";
import { db, logAction } from "@/mocks/db";
import { findUserById } from "@/mocks/data/users";

/**
 * Supervisory review, a port of backend/app/services/reviews.py: the AI turns a person should look at
 * (threat signals, blocked calls, AI proposals the gate rejected, failed number checks, client thumbs-downs),
 * and the officer's decision on each, kept as append-only `review_decided` log entries.
 */
const SEVERITY = { high: 3, medium: 2, low: 1 } as const;
type Detail = Record<string, unknown>;

interface Feedback {
  rating: "up" | "down";
  reason: string | null;
  at: string;
}

export function flagsFor(detail: Detail, feedback?: Feedback): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  for (const s of (detail.signals as { label: string; severity: "low" | "medium" | "high" }[] | undefined) ?? []) {
    if (s.severity === "medium" || s.severity === "high") flags.push({ kind: "threat", text: `Threat signal: ${s.label}`, severity: s.severity });
  }
  for (const t of (detail.tools as { tool: string; tier: string; decision: string }[] | undefined) ?? []) {
    if (t.decision === "denied") flags.push({ kind: "blocked", text: `Broker blocked ${t.tool} (${t.tier})`, severity: "high" });
  }
  for (const p of (detail.proposals as { proposal_id: number; gate: string }[] | undefined) ?? []) {
    if (p.gate === "REJECT") flags.push({ kind: "gate", text: `AI proposal #${p.proposal_id} rejected by the gate`, severity: "medium" });
  }
  if (detail.grounding === "regenerated") flags.push({ kind: "grounding", text: "Reply rewritten after the number check", severity: "low" });
  if (detail.fallback_reason === "grounding") {
    flags.push({ kind: "grounding", text: "Template used after two failed number checks", severity: "medium" });
  }
  if (feedback?.rating === "down") {
    flags.push({ kind: "feedback", text: `Client marked the reply unhelpful${feedback.reason ? `: ${feedback.reason}` : ""}`, severity: "medium" });
  }
  return flags;
}

export function feedbackByMessage(userId?: number): Map<number, Feedback> {
  const out = new Map<number, Feedback>();
  for (const l of db.logs) {
    if (l.action !== "chat_feedback" || (userId !== undefined && l.user_id !== userId)) continue;
    const d = l.detail as Detail;
    if (typeof d.message_id === "number") {
      out.set(d.message_id, { rating: d.rating as Feedback["rating"], reason: (d.reason as string | null) ?? null, at: l.ts });
    }
  }
  return out;
}

function decisions(): Map<number, LogEntry> {
  const out = new Map<number, LogEntry>();
  for (const l of db.logs) {
    const d = l.detail as Detail;
    if (l.action === "review_decided" && typeof d.turn_log_id === "number") out.set(d.turn_log_id, l);
  }
  return out;
}

function statusOf(flags: ReviewFlag[], decision?: LogEntry): ReviewStatus | null {
  if (!flags.length) return null;
  return decision ? (((decision.detail as Detail).decision as ReviewStatus) ?? "open") : "open";
}

function decisionFields(decision?: LogEntry) {
  if (!decision) return { decided_by: null, decided_at: null, note: null };
  return {
    decided_by: decision.user_id ? (findUserById(decision.user_id)?.display_name ?? null) : null,
    decided_at: decision.ts,
    note: ((decision.detail as Detail).note as string | undefined) ?? null,
  };
}

function clientMessage(turn: LogEntry): string | null {
  const messageId = (turn.detail as Detail).message_id as number | undefined;
  if (!turn.user_id || messageId === undefined) return null;
  const earlier = db.chatFor(turn.user_id).filter((m) => m.role === "user" && m.message_id < messageId);
  return earlier.length ? earlier[earlier.length - 1].content : null;
}

function turns(): LogEntry[] {
  return db.logs.filter((l) => l.action === "agent_turn").reverse();
}

/** Flags and review status for each turn, for the Control Room's live feed. */
export function annotate(list: LogEntry[]): Map<number, [ReviewFlag[], ReviewStatus | null]> {
  const fb = feedbackByMessage();
  const dec = decisions();
  const out = new Map<number, [ReviewFlag[], ReviewStatus | null]>();
  for (const t of list) {
    const d = t.detail as Detail;
    const flags = flagsFor(d, fb.get(Number(d.message_id ?? 0)));
    out.set(t.id, [flags, statusOf(flags, dec.get(t.id))]);
  }
  return out;
}

export function reviewQueue(status: "open" | "resolved" | "all", limit = 50): ReviewQueue {
  const fb = feedbackByMessage();
  const dec = decisions();
  const counts = { open: 0, cleared: 0, escalated: 0 };
  const items: ReviewItem[] = [];
  for (const t of turns()) {
    const d = t.detail as Detail;
    const flags = flagsFor(d, fb.get(Number(d.message_id ?? 0)));
    if (!flags.length) continue;
    const decision = dec.get(t.id);
    const state = statusOf(flags, decision) ?? "open";
    counts[state] += 1;
    if (status === "all" || state === status || (status === "resolved" && state !== "open")) {
      const text = clientMessage(t) ?? "";
      items.push({
        log_id: t.id,
        ts: t.ts,
        user_id: t.user_id,
        client: t.user_id ? (findUserById(t.user_id)?.display_name ?? null) : null,
        message_preview: text.length <= 140 ? text : `${text.slice(0, 139)}…`,
        mode: (d.mode as ReviewItem["mode"]) ?? "fallback",
        grounding: (d.grounding as ReviewItem["grounding"]) ?? "fallback",
        severity: flags.reduce<ReviewFlag["severity"]>((m, f) => (SEVERITY[f.severity] > SEVERITY[m] ? f.severity : m), "low"),
        flags,
        status: state,
        ...decisionFields(decision),
      });
    }
  }
  return { items: items.slice(0, limit), counts };
}

export function findTurn(logId: number): LogEntry | undefined {
  return db.logs.find((l) => l.id === logId && l.action === "agent_turn");
}

export function turnDetail(turn: LogEntry): TurnDetail {
  const d = turn.detail as Detail;
  const messageId = d.message_id as number | undefined;
  const reply = turn.user_id && messageId !== undefined ? db.chatFor(turn.user_id).find((m) => m.message_id === messageId) : undefined;
  const feedback = feedbackByMessage().get(Number(messageId ?? 0));
  const decision = decisions().get(turn.id);
  const flags = flagsFor(d, feedback);
  return {
    log_id: turn.id,
    ts: turn.ts,
    user_id: turn.user_id,
    client: turn.user_id ? (findUserById(turn.user_id)?.display_name ?? null) : null,
    message: clientMessage(turn),
    reply: reply?.content ?? null,
    mode: (d.mode as TurnDetail["mode"]) ?? "fallback",
    grounding: (d.grounding as TurnDetail["grounding"]) ?? "fallback",
    fallback_reason: (d.fallback_reason as string | null) ?? null,
    served_model: (d.served_model as string | null) ?? null,
    config_fingerprint: (d.config_fingerprint as string | null) ?? null,
    latency_ms: (d.latency_ms as number | null) ?? null,
    usage: (d.usage as Record<string, number>) ?? {},
    provenance: reply?.provenance ?? null,
    tools: reply?.tool_calls ?? [],
    cards: (d.cards as string[]) ?? [],
    proposals: (d.proposals as TurnDetail["proposals"]) ?? [],
    figures_traced: Number(d.figures_traced ?? 0),
    signals: (d.signals as TurnDetail["signals"]) ?? [],
    trace: (d.trace as TurnDetail["trace"]) ?? [],
    flags,
    status: statusOf(flags, decision),
    ...decisionFields(decision),
    feedback: feedback ?? null,
  };
}

export function decide(officerId: number, turn: LogEntry, decision: "cleared" | "escalated", note: string): TurnDetail {
  logAction({
    userId: officerId,
    actor: "compliance",
    action: "review_decided",
    decision: "allowed",
    detail: { turn_log_id: turn.id, client_id: turn.user_id, decision, note },
  });
  return turnDetail(turn);
}
