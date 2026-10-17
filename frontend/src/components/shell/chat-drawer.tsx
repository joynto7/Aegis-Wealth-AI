"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  CircleCheck,
  Copy,
  Loader2,
  PauseCircle,
  Send,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  User as UserIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useChatFeedback, useChatHistory, useControls, useGoal, useProposal } from "@/lib/queries";
import { ApiError, streamChat } from "@/lib/api-client";
import { formatDateTime, formatMoney } from "@/lib/format";
import { ChatCards } from "@/components/chat/chat-cards";
import { ReplyText, sourceLabel, TOOL_LABEL } from "@/components/chat/reply-text";
import { AiLabel, AiNotice } from "@/components/shared/ai-label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ChatCard, ChatMessage, ChatRating, ToolCallSummary } from "@/lib/types";

export function ChatDrawer({
  open,
  onOpenChange,
  proposalId,
  pendingQuestion,
  onQuestionSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposalId?: number;
  /** A question asked from elsewhere (the dashboard's suggestions, an "Ask about this" button); sent once the drawer opens. */
  pendingQuestion?: string | null;
  onQuestionSent?: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[440px]">
        <SheetHeader className="bg-ink border-b border-(--ink-border) px-5 py-4">
          <SheetTitle className="flex items-center gap-3 text-white">
            <AiAvatar />
            <span className="flex flex-col">
              <span className="font-display text-[17px] font-bold">Ask Aegis</span>
              <span className="text-caption font-normal text-(--ink-muted)">Your AI advisor · checked by code</span>
            </span>
          </SheetTitle>
          <SheetDescription className="text-(--ink-muted)">{CHAT_DESCRIPTION}</SheetDescription>
        </SheetHeader>
        <ChatConversation proposalId={proposalId} pendingQuestion={pendingQuestion} onQuestionSent={onQuestionSent} />
      </SheetContent>
    </Sheet>
  );
}

const CHAT_DESCRIPTION = "Every figure is traced to a tool result. Tap one to see where it came from.";

function AiAvatar({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "bg-ai flex shrink-0 items-center justify-center rounded-full shadow-glow",
        size === "md" ? "size-10" : "size-7"
      )}
      aria-hidden
    >
      <Sparkles className={size === "md" ? "size-5" : "size-3.5"} />
    </span>
  );
}

/**
 * The advisor chat docked open beside the Proposal Workspace on screens
 * 1280 px and wider (Section 2.7.3); narrower screens use the drawer.
 */
export function DockedChat({ proposalId, className }: { proposalId?: number; className?: string }) {
  return (
    <aside
      aria-label="Ask Aegis"
      className={cn(
        "sticky top-0 flex h-[calc(100vh-9rem)] w-[400px] shrink-0 flex-col overflow-hidden rounded-2xl border border-(--border) bg-(--surface) shadow-card",
        className
      )}
    >
      <div className="bg-ink flex items-center gap-3 px-4 py-3.5">
        <AiAvatar />
        <div>
          <p className="font-display text-form font-bold text-white">Ask Aegis</p>
          <p className="text-caption text-(--ink-muted)">{CHAT_DESCRIPTION}</p>
        </div>
      </div>
      <ChatConversation proposalId={proposalId} />
    </aside>
  );
}

interface LiveTurn {
  steps: string[];
  tools: ToolCallSummary[];
  cards: ChatCard[];
}

const IDLE: LiveTurn = { steps: [], tools: [], cards: [] };

/** Questions that fit where the client is: a rejected proposal asks how to fix it, a goal asks if it's on track. */
function useSuggestions(proposalId?: number): string[] {
  const proposal = useProposal(proposalId ?? null);
  const goal = useGoal();
  return useMemo(() => {
    const g = goal.data;
    const goalQuestion = g
      ? `Will I reach ${formatMoney(g.target_amount)} in ${g.horizon_years} years?`
      : "Will I reach CNY 300,000 in 8 years?";
    const p = proposal.data;
    if (p && (p.status === "rejected" || p.status === "warning")) {
      return ["How do I fix it?", `Why was proposal #${p.id} flagged?`, goalQuestion];
    }
    if (p) return ["Why this proposal?", goalQuestion, "What's the worst case for this mix?"];
    return ["What's my risk tier?", "Which product costs me least?", goalQuestion];
  }, [proposal.data, goal.data]);
}

function ChatConversation({
  proposalId,
  pendingQuestion,
  onQuestionSent,
}: {
  proposalId?: number;
  pendingQuestion?: string | null;
  onQuestionSent?: () => void;
}) {
  const history = useChatHistory();
  const controls = useControls();
  const paused = controls.data?.advisor.state === "suspended";
  const suggestions = useSuggestions(proposalId);
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [live, setLive] = useState<LiveTurn>(IDLE);
  const [draft, setDraft] = useState("");
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextLocalId = useRef(-1);

  const messages = [...(history.data?.items ?? []), ...localMessages];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, pending, live.steps.length, live.tools.length, live.cards.length]);

  // A question asked from another screen is sent once, as soon as the conversation is open.
  const sentQuestion = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingQuestion || sentQuestion.current === pendingQuestion) return;
    sentQuestion.current = pendingQuestion;
    onQuestionSent?.();
    void submit(pendingQuestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuestion]);

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setDraft("");
    setPending(true);
    setLive({ ...IDLE, steps: ["Reading your question"] });
    const optimisticUser: ChatMessage = {
      message_id: nextLocalId.current--,
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString(),
    };
    setLocalMessages((prev) => [...prev, optimisticUser]);
    try {
      // Progress events show each step, each tool call with the broker's decision, and each result's card as it happens.
      await streamChat({ message: trimmed, proposal_id: proposalId }, (event) =>
        setLive((prev) =>
          event.type === "status"
            ? { ...prev, steps: prev.steps[prev.steps.length - 1] === event.text ? prev.steps : [...prev.steps, event.text] }
            : { ...prev, tools: [...prev.tools, event.call], cards: event.card ? [...prev.cards, event.card] : prev.cards }
        )
      );
      qc.invalidateQueries({ queryKey: ["controls"] });
      // A reply may have changed a proposal (a revision, a fix): refresh what the screens show.
      qc.invalidateQueries({ queryKey: ["proposals"] });
      // The saved history already holds this turn, so the optimistic copy goes once it is back.
      await qc.invalidateQueries({ queryKey: ["chat", "history"] });
      setLocalMessages([]);
    } catch (e) {
      if (e instanceof ApiError && e.code === "RATE_LIMITED") {
        setLocalMessages((prev) => [
          ...prev,
          { message_id: nextLocalId.current--, role: "assistant", content: e.message, created_at: new Date().toISOString() },
        ]);
        return;
      }
      setLocalMessages((prev) => [
        ...prev,
        {
          message_id: nextLocalId.current--,
          role: "assistant",
          content: "I couldn't reach the advisor service just now. Please try again.",
          mode: "fallback",
          grounding: "fallback",
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setPending(false);
      setLive(IDLE);
    }
  }

  return (
    <>
      <div ref={scrollRef} className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        <AiNotice />
        {paused ? (
          <div className="flex items-start gap-2 rounded-lg border border-(--border) bg-(--muted) p-3 text-caption text-(--text)">
            <PauseCircle className="mt-0.5 size-4 shrink-0 text-(--text-muted)" aria-hidden />
            <p>
              <span className="font-semibold">The AI advisor is paused by the compliance team.</span> Every screen still
              works, and orders still need your own Confirm click.
            </p>
          </div>
        ) : null}
        {history.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-3/4" />
            <Skeleton className="h-16 w-2/3 self-end" />
          </div>
        ) : messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-body text-(--text-muted)">
              Ask about your proposal, your risk tier, product fees or your goal. I cite every figure I use.
            </p>
            <SuggestionChips suggestions={suggestions} onPick={submit} disabled={pending} />
          </div>
        ) : (
          messages.map((m) => <ChatBubble key={m.message_id} message={m} />)
        )}
        {pending ? <LiveProgress live={live} /> : null}
      </div>

      {messages.length > 0 && !pending ? (
        <div className="border-t border-(--border) px-3 pt-2.5">
          <SuggestionChips suggestions={suggestions} onPick={submit} disabled={pending} compact />
        </div>
      ) : null}
      <form
        className={cn("flex items-end gap-2 p-3", !(messages.length > 0 && !pending) && "border-t border-(--border)")}
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(draft);
            }
          }}
          placeholder={paused ? "The advisor is paused" : "Ask about your money…"}
          maxLength={1000}
          className="min-h-10 flex-1 resize-none"
          aria-label="Message Aegis"
        />
        <Button type="submit" size="icon" disabled={!draft.trim() || pending} aria-label="Send message" className="bg-ai border-0 hover:opacity-90">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </form>
    </>
  );
}

function SuggestionChips({
  suggestions,
  onPick,
  disabled,
  compact = false,
}: {
  suggestions: string[];
  onPick: (q: string) => void;
  disabled: boolean;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex gap-2", compact ? "scrollbar-thin overflow-x-auto pb-0.5" : "flex-wrap")}>
      {suggestions.map((q) => (
        <button
          key={q}
          type="button"
          disabled={disabled}
          onClick={() => onPick(q)}
          className={cn(
            "shrink-0 rounded-full border border-(--border) bg-(--surface) px-3 py-1.5 text-caption font-medium text-(--text) transition-colors hover:border-(--primary)/40 hover:text-(--primary) disabled:opacity-50",
            compact && "py-1"
          )}
        >
          {q}
        </button>
      ))}
    </div>
  );
}

/**
 * The agent at work, step by step: each stage it reports, each tool call with its tier and the broker's
 * decision, and each result's card as it arrives. The reply itself only appears after the number check.
 */
function LiveProgress({ live }: { live: LiveTurn }) {
  const { steps, tools, cards } = live;
  const current = steps[steps.length - 1] ?? "Working";
  return (
    <div className="flex gap-2" role="status" aria-label={`Aegis is working: ${current}`}>
      <AiAvatar size="sm" />
      <div className="ring-ai ai-working min-w-0 flex-1 rounded-xl bg-(--surface) p-3">
        <ol className="space-y-1.5">
          {steps.map((step, i) => {
            const done = i < steps.length - 1;
            return (
              <li key={`${step}-${i}`} className="flex items-center gap-2 text-caption">
                {done ? (
                  <CircleCheck className="size-3.5 shrink-0 text-(--primary)" aria-hidden />
                ) : (
                  <Loader2 className="size-3.5 shrink-0 animate-spin text-(--primary)" aria-hidden />
                )}
                <span className={done ? "text-(--text-muted)" : "font-medium text-(--text)"}>{step}</span>
              </li>
            );
          })}
        </ol>
        {tools.length ? (
          <ul className="mt-2 flex flex-wrap gap-1.5 border-t border-(--border) pt-2">
            {tools.map((t, i) => (
              <ToolChip key={i} call={t} />
            ))}
          </ul>
        ) : null}
        <ChatCards cards={cards} className="mt-2" />
      </div>
    </div>
  );
}

function ToolChip({ call }: { call: ToolCallSummary }) {
  const denied = call.decision === "denied";
  return (
    <li
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
        denied ? "border-dashed border-(--text-muted) text-(--text)" : "border-(--border) bg-(--surface) text-(--text-muted)"
      )}
      title={call.summary}
    >
      <span className="font-medium text-(--text)">{TOOL_LABEL[call.tool] ?? call.tool}</span>
      <span className="font-mono">{call.tier}</span>
      <span>{denied ? "· blocked" : "· allowed"}</span>
    </li>
  );
}

const MODE_LABEL = {
  model: "Claude · checked",
  fallback: "Template answer",
  suspended: "Paused by compliance",
} as const;

const DOWN_REASONS = ["A figure looks wrong", "Not clear", "Didn't answer my question"];

function Feedback({ message }: { message: ChatMessage }) {
  const rate = useChatFeedback();
  const [asking, setAsking] = useState(false);
  const [copied, setCopied] = useState(false);
  const current = message.feedback ?? null;
  function send(rating: ChatRating, reason?: string) {
    setAsking(false);
    rate.mutate({ message_id: message.message_id, rating, reason });
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: nothing to do.
    }
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-0.5">
        <IconButton label={copied ? "Copied" : "Copy reply"} onClick={copy}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </IconButton>
        <IconButton label="Helpful" active={current === "up"} onClick={() => send("up")} disabled={rate.isPending}>
          <ThumbsUp className="size-3.5" />
        </IconButton>
        <IconButton label="Not helpful" active={current === "down"} onClick={() => setAsking((v) => !v)} disabled={rate.isPending}>
          <ThumbsDown className="size-3.5" />
        </IconButton>
      </div>
      {asking ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-(--text-muted)">What was wrong?</span>
          {DOWN_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => send("down", r)}
              className="rounded-full border border-(--border) px-2 py-0.5 text-[11px] text-(--text) hover:border-(--primary)/40"
            >
              {r}
            </button>
          ))}
          <button type="button" onClick={() => send("down")} className="text-[11px] text-(--text-muted) underline">
            Skip
          </button>
        </div>
      ) : null}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  active = false,
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-pressed={active}
          className={cn(
            "flex size-7 items-center justify-center rounded-md transition-colors disabled:opacity-50",
            active ? "bg-(--primary-soft) text-(--primary)" : "text-(--text-muted) hover:bg-(--muted) hover:text-(--text)"
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const [expanded, setExpanded] = useState(false);
  const saved = message.message_id > 0;
  return (
    <div className={cn("flex gap-2", isUser && "flex-row-reverse")}>
      <div className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", isUser ? "bg-(--primary)" : "bg-ai")}>
        {isUser ? <UserIcon className="size-3.5 text-(--primary-foreground)" /> : <Sparkles className="size-3.5 text-white" />}
      </div>
      <div className={cn("min-w-0 max-w-[88%] space-y-1.5", isUser && "items-end text-right")}>
        {!isUser && message.provenance ? <AiLabel provenance={message.provenance} /> : null}
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2.5 text-body leading-relaxed",
            isUser ? "rounded-tr-md bg-(--primary) text-(--primary-foreground)" : "rounded-tl-md bg-(--muted) text-(--text)"
          )}
        >
          {isUser ? message.content : <ReplyText text={message.content} sources={message.number_sources} />}
        </div>
        {!isUser ? <ChatCards cards={message.cards} /> : null}
        {!isUser && (message.tool_calls?.length || message.mode) ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {message.tool_calls?.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {message.tool_calls.map((t, i) => (
                  <ToolChip key={i} call={t} />
                ))}
              </ul>
            ) : null}
            {message.mode && !message.provenance ? (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-caption font-medium",
                  // Neutral on purpose: green/amber/red are reserved for gate decisions (Section 2.7.1).
                  message.mode === "model" ? "bg-(--primary-soft) text-(--primary)" : "bg-(--surface) text-(--text-muted) ring-1 ring-(--border)"
                )}
              >
                {MODE_LABEL[message.mode]}
              </span>
            ) : null}
            {message.grounding === "regenerated" ? (
              <span className="rounded-full bg-(--surface) px-2 py-0.5 text-[11px] text-(--text-muted) ring-1 ring-(--border)">
                rewritten once by the number check
              </span>
            ) : null}
            {message.number_sources?.length ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full bg-(--primary-soft) px-2 py-0.5 text-[11px] font-medium text-(--primary)"
                  >
                    <ShieldCheck className="size-3" aria-hidden />
                    {message.number_sources.length} figure{message.number_sources.length === 1 ? "" : "s"} traced
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-64">
                  Before you saw this reply, code matched each figure to a tool result or your own message.
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        ) : null}
        {!isUser && (message.number_sources?.length || message.citations?.length) ? (
          <div>
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="flex items-center gap-1 text-caption text-(--primary) hover:underline"
              aria-expanded={expanded}
            >
              <ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} />
              {expanded ? "Hide sources" : "Show sources"}
            </button>
            {expanded ? (
              <ul className="mt-1 space-y-0.5 text-caption text-(--text-muted)">
                {message.number_sources?.length
                  ? message.number_sources.map((s, i) => (
                      <li key={i}>
                        <span className="font-medium text-(--text)">{s.text}</span> ← {sourceLabel(s)}
                      </li>
                    ))
                  : message.citations?.map((c, i) => (
                      <li key={i}>
                        {c.tool} → {c.path}: {String(c.value)}
                      </li>
                    ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <div className={cn("flex items-center gap-2", isUser && "justify-end")}>
          <p className="text-[11px] text-(--text-muted)">{formatDateTime(message.created_at)}</p>
        </div>
        {!isUser && saved ? <Feedback message={message} /> : null}
      </div>
    </div>
  );
}
