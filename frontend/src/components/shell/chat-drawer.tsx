"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, PauseCircle, Send, ShieldCheck, Sparkles, User as UserIcon } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useChatHistory, useControls } from "@/lib/queries";
import { ApiError, streamChat } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { ChatCards } from "@/components/chat/chat-cards";
import { ReplyText, sourceLabel } from "@/components/chat/reply-text";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ChatCard, ChatMessage, ToolCallSummary } from "@/lib/types";

const SUGGESTED = ["Why this proposal?", "What's my risk tier?", "Which product costs me least?"];

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
  /** A question asked from elsewhere (the dashboard's suggestions); sent once the drawer opens. */
  pendingQuestion?: string | null;
  onQuestionSent?: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[420px]">
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
  status: string;
  tools: ToolCallSummary[];
  cards: ChatCard[];
}

const IDLE: LiveTurn = { status: "", tools: [], cards: [] };

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
  }, [messages.length, pending, live.tools.length, live.cards.length]);

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
    setLive({ ...IDLE, status: "Thinking" });
    const optimisticUser: ChatMessage = {
      message_id: nextLocalId.current--,
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString(),
    };
    setLocalMessages((prev) => [...prev, optimisticUser]);
    try {
      // Progress events show each tool call, the broker's decision and the tool's card as it happens.
      await streamChat({ message: trimmed, proposal_id: proposalId }, (event) =>
        setLive((prev) =>
          event.type === "status"
            ? { ...prev, status: event.text }
            : { ...prev, tools: [...prev.tools, event.call], cards: event.card ? [...prev.cards, event.card] : prev.cards }
        )
      );
      qc.invalidateQueries({ queryKey: ["controls"] });
      // The saved history already holds this turn, so the optimistic copy goes once it is back.
      await qc.invalidateQueries({ queryKey: ["chat", "history"] });
      setLocalMessages([]);
    } catch (e) {
      if (e instanceof ApiError && e.code === "RATE_LIMITED") {
        setLocalMessages((prev) => [
          ...prev,
          {
            message_id: nextLocalId.current--,
            role: "assistant",
            content: e.message,
            created_at: new Date().toISOString(),
          },
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
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
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
              Ask about your proposal, your risk tier, or product fees. I cite every figure I use.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED.map((q) => (
                <Button key={q} variant="outline" size="sm" onClick={() => submit(q)}>
                  {q}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => <ChatBubble key={m.message_id} message={m} />)
        )}
        {pending ? <LiveProgress live={live} /> : null}
      </div>

      <form
        className="flex items-end gap-2 border-t border-(--border) p-3"
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
          placeholder="Type a question…"
          maxLength={1000}
          className="min-h-10 flex-1 resize-none"
          aria-label="Message Aegis"
        />
        <Button type="submit" size="icon" disabled={!draft.trim() || pending} aria-label="Send message">
          <Send className="size-4" />
        </Button>
      </form>
    </>
  );
}

/** The agent at work: what it is doing now, every tool call with its tier and the broker's decision, and each result's card. */
function LiveProgress({ live }: { live: LiveTurn }) {
  const { status, tools, cards } = live;
  return (
    <div className="space-y-1.5" role="status" aria-label={`Aegis is working: ${status}`}>
      <div className="flex items-center gap-2 text-caption text-(--text-muted)">
        <span className="flex gap-1" aria-hidden>
          <span className="size-1.5 animate-bounce rounded-full bg-(--text-muted) [animation-delay:-0.3s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-(--text-muted) [animation-delay:-0.15s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-(--text-muted)" />
        </span>
        {status}…
      </div>
      {tools.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {tools.map((t, i) => (
            <li
              key={i}
              className="rounded-full border border-(--border) bg-(--surface) px-2 py-0.5 text-caption text-(--text-muted)"
            >
              {t.tool} · {t.tier} · {t.decision}
            </li>
          ))}
        </ul>
      ) : null}
      <ChatCards cards={cards} className="pl-9" />
    </div>
  );
}

const MODE_LABEL = {
  model: "Claude · checked",
  fallback: "Template answer",
  suspended: "Paused by compliance",
} as const;

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={cn("flex gap-2", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-(--primary)" : "bg-ai"
        )}
      >
        {isUser ? <UserIcon className="size-3.5 text-(--primary-foreground)" /> : <Sparkles className="size-3.5 text-white" />}
      </div>
      <div className={cn("max-w-[85%] space-y-1.5", isUser && "items-end text-right")}>
        <div
          className={cn(
            "rounded-xl px-3 py-2 text-body",
            isUser ? "bg-(--primary) text-(--primary-foreground)" : "bg-(--muted) text-(--text)"
          )}
        >
          {isUser ? message.content : <ReplyText text={message.content} sources={message.number_sources} />}
        </div>
        {!isUser ? <ChatCards cards={message.cards} /> : null}
        {!isUser && (message.tool_calls?.length || message.mode) ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {message.tool_calls?.map((t, i) => (
              <span
                key={i}
                className="rounded-full border border-(--border) bg-(--surface) px-2 py-0.5 text-caption text-(--text-muted)"
              >
                {t.tool} · {t.tier} · {t.decision}
              </span>
            ))}
            {message.mode ? (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-caption font-medium",
                  // Neutral on purpose: green/amber/red are reserved for gate decisions (Section 2.7.1).
                  message.mode === "model" ? "bg-(--primary-soft) text-(--primary)" : "bg-(--surface) text-(--text-muted) ring-1 ring-(--border)"
                )}
              >
                {MODE_LABEL[message.mode]}
                {message.grounding === "regenerated" ? " · rewritten once" : ""}
              </span>
            ) : null}
            {message.number_sources?.length ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full bg-(--primary-soft) px-2 py-0.5 text-caption font-medium text-(--primary)"
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
        <p className="text-caption text-(--text-muted)">{formatDateTime(message.created_at)}</p>
      </div>
    </div>
  );
}
