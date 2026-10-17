"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { CornerDownLeft, Eye, EyeOff, MessageCircleQuestion, Moon, Plus, Search, Sparkles, Sun, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SidebarNavItems } from "@/components/shell/sidebar";
import { usePrivacy } from "@/lib/privacy";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";

interface Command {
  id: string;
  label: string;
  group: "Go to" | "Actions";
  icon: LucideIcon;
  keywords?: string;
  run: () => void;
}

/**
 * Command palette (⌘K / Ctrl+K): jump to any screen or run an action by name
 * (docs/ui-redesign.md, new feature 5). Arrow keys move, Enter runs, Esc closes.
 */
export function CommandPalette({
  role,
  open,
  onOpenChange,
  onAskAegis,
}: {
  role: UserRole;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAskAegis?: (question?: string) => void;
}) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { hidden, toggle } = usePrivacy();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const typed = query.trim();
  const commands = useMemo<Command[]>(() => {
    const close = (fn: () => void) => () => {
      onOpenChange(false);
      fn();
    };
    const go: Command[] = SidebarNavItems(role).map((item) => ({
      id: `go:${item.href}`,
      label: item.label,
      group: "Go to",
      icon: item.icon,
      run: close(() => router.push(item.href)),
    }));
    const actions: Command[] = [
      ...(role === "client"
        ? [
            {
              id: "new-proposal",
              label: "Build a new proposal",
              group: "Actions" as const,
              icon: Plus,
              keywords: "create allocation invest",
              run: close(() => router.push("/proposals/new")),
            },
            ...(onAskAegis
              ? [
                  {
                    id: "ask",
                    label: "Ask Aegis a question",
                    group: "Actions" as const,
                    icon: MessageCircleQuestion,
                    keywords: "chat ai advisor help",
                    run: close(() => onAskAegis()),
                  },
                ]
              : []),
          ]
        : []),
      {
        id: "privacy",
        label: hidden ? "Show amounts" : "Hide amounts",
        group: "Actions",
        icon: hidden ? Eye : EyeOff,
        keywords: "privacy balance mask",
        run: close(toggle),
      },
      {
        id: "theme",
        label: resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode",
        group: "Actions",
        icon: resolvedTheme === "dark" ? Sun : Moon,
        keywords: "theme appearance",
        run: close(() => setTheme(resolvedTheme === "dark" ? "light" : "dark")),
      },
    ];
    return [...go, ...actions];
  }, [role, router, onOpenChange, onAskAegis, hidden, toggle, resolvedTheme, setTheme]);

  const q = typed.toLowerCase();
  const matched = q ? commands.filter((c) => `${c.label} ${c.keywords ?? ""}`.toLowerCase().includes(q)) : commands;
  // Anything typed can also go straight to the advisor (v2): the AI from the command bar.
  const askTyped: Command | null =
    onAskAegis && typed.length >= 3
      ? {
          id: "ask-typed",
          label: `Ask Aegis: “${typed.length > 60 ? `${typed.slice(0, 59)}…` : typed}”`,
          group: "Actions",
          icon: Sparkles,
          run: () => {
            onOpenChange(false);
            onAskAegis(typed);
          },
        }
      : null;
  const shown = askTyped ? (matched.length ? [...matched, askTyped] : [askTyped]) : matched;
  const active = Math.min(cursor, Math.max(shown.length - 1, 0));

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      shown[active]?.run();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setQuery("");
        setCursor(0);
        onOpenChange(next);
      }}
    >
      <DialogContent className="top-[18%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg" showCloseButton={false}>
        <DialogTitle className="sr-only">Search or jump to</DialogTitle>
        <div className="flex items-center gap-3 border-b border-(--border) px-4">
          <Search className="size-4 text-(--text-muted)" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={onAskAegis ? "Search screens, or ask Aegis anything…" : "Search screens and actions…"}
            className="h-12 flex-1 bg-transparent text-form text-(--text) outline-none placeholder:text-(--text-muted)"
            aria-label="Search screens and actions"
            role="combobox"
            aria-expanded
            aria-controls="command-list"
            aria-activedescendant={shown[active] ? `cmd-${shown[active].id}` : undefined}
          />
          <kbd className="rounded-md border border-(--border) px-1.5 py-0.5 text-caption text-(--text-muted)">Esc</kbd>
        </div>
        <ul ref={listRef} id="command-list" role="listbox" className="max-h-80 overflow-y-auto p-2">
          {shown.length === 0 ? (
            <li className="px-3 py-6 text-center text-body text-(--text-muted)">Nothing matches “{query}”.</li>
          ) : (
            shown.map((c, i) => {
              const Icon = c.icon;
              const showGroup = i === 0 || shown[i - 1].group !== c.group;
              return (
                <li key={c.id} role="presentation">
                  {showGroup ? <p className="text-eyebrow px-3 pb-1 pt-2 text-(--text-muted)">{c.group}</p> : null}
                  <button
                    type="button"
                    id={`cmd-${c.id}`}
                    role="option"
                    aria-selected={i === active}
                    data-index={i}
                    onMouseEnter={() => setCursor(i)}
                    onClick={c.run}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-body text-(--text)",
                      i === active && "bg-(--primary-soft) text-(--primary)"
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="flex-1">{c.label}</span>
                    {i === active ? <CornerDownLeft className="size-3.5 opacity-70" aria-hidden /> : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
