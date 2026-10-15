"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, ChevronDown, Send, User as UserIcon } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useChatHistory, useSendChat } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";
import type { ChatMessage } from "@/lib/types";

const SUGGESTED = ["Why this proposal?", "What's my risk tier?", "Which product costs me least?"];

export function ChatDrawer({
  open,
  onOpenChange,
  proposalId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposalId?: number;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[400px]">
        <SheetHeader className="border-b border-(--border)">
          <SheetTitle className="flex items-center gap-2">
            <Bot className="size-5 text-(--primary)" aria-hidden />
            Ask Aegis
          </SheetTitle>
          <SheetDescription>{CHAT_DESCRIPTION}</SheetDescription>
        </SheetHeader>
        <ChatConversation proposalId={proposalId} />
      </SheetContent>
    </Sheet>
  );
}

const CHAT_DESCRIPTION = "Grounded in your own data — every figure comes from a tool result.";

/**
 * The advisor chat docked open beside the Proposal Workspace on screens
 * 1280 px and wider (Section 2.7.3); narrower screens use the drawer.
 */
export function DockedChat({ proposalId, className }: { proposalId?: number; className?: string }) {
  return (
    <aside
      aria-label="Ask Aegis"
      className={cn(
        "sticky top-0 flex h-[calc(100vh-8rem)] w-[400px] shrink-0 flex-col rounded-xl border border-(--border) bg-(--surface)",
        className
      )}
    >
      <div className="border-b border-(--border) px-4 py-3">
        <p className="flex items-center gap-2 text-form font-semibold text-(--text)">
          <Bot className="size-5 text-(--primary)" aria-hidden />
          Ask Aegis
        </p>
        <p className="text-caption text-(--text-muted)">{CHAT_DESCRIPTION}</p>
      </div>
      <ChatConversation proposalId={proposalId} />
    </aside>
  );
}

function ChatConversation({ proposalId }: { proposalId?: number }) {
  const history = useChatHistory();
  const send = useSendChat();
  const [draft, setDraft] = useState("");
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextLocalId = useRef(-1);

  const messages = [...(history.data?.items ?? []), ...localMessages];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, send.isPending]);

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || send.isPending) return;
    setDraft("");
    const optimisticUser: ChatMessage = {
      message_id: nextLocalId.current--,
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString(),
    };
    setLocalMessages((prev) => [...prev, optimisticUser]);
    try {
      // useSendChat refetches the saved history before resolving, and that
      // history already holds this turn — so drop the optimistic copies.
      await send.mutateAsync({ message: trimmed, proposal_id: proposalId });
      setLocalMessages([]);
    } catch {
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
    }
  }

  return (
    <>
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
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
        {send.isPending ? <TypingIndicator /> : null}
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
        <Button type="submit" size="icon" disabled={!draft.trim() || send.isPending} aria-label="Send message">
          <Send className="size-4" />
        </Button>
      </form>
    </>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 text-caption text-(--text-muted)" role="status" aria-label="Aegis is typing">
      <span className="size-1.5 animate-bounce rounded-full bg-(--text-muted) [animation-delay:-0.3s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-(--text-muted) [animation-delay:-0.15s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-(--text-muted)" />
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={cn("flex gap-2", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-(--primary)" : "bg-(--muted)"
        )}
      >
        {isUser ? <UserIcon className="size-3.5 text-white" /> : <Bot className="size-3.5 text-(--text-muted)" />}
      </div>
      <div className={cn("max-w-[85%] space-y-1.5", isUser && "items-end text-right")}>
        <div
          className={cn(
            "rounded-xl px-3 py-2 text-body",
            isUser ? "bg-(--primary) text-white" : "bg-(--muted) text-(--text)"
          )}
        >
          {message.content}
        </div>
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
                  message.grounding === "passed" ? "bg-(--primary-soft) text-(--primary)" : "bg-(--surface) text-(--text-muted) ring-1 ring-(--border)"
                )}
              >
                {message.mode === "model" && message.grounding === "passed" ? "Checked" : "Template answer"}
              </span>
            ) : null}
          </div>
        ) : null}
        {!isUser && message.citations?.length ? (
          <div>
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="flex items-center gap-1 text-caption text-(--primary) hover:underline"
            >
              <ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} />
              {expanded ? "Hide citations" : "Show citations"}
            </button>
            {expanded ? (
              <ul className="mt-1 space-y-0.5 text-caption text-(--text-muted)">
                {message.citations.map((c, i) => (
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
