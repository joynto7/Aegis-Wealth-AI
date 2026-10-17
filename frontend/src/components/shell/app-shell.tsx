"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Sidebar, SidebarNav } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/topbar";
import { ChatDrawer } from "@/components/shell/chat-drawer";
import { CommandPalette } from "@/components/shell/command-palette";
import { AegisWordmark } from "@/components/shell/brand";
import { PageTitleProvider } from "@/components/shell/page-title";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useMe } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** Opens the advisor chat from anywhere, optionally asking a question straight away. */
const AskAegisContext = createContext<(question?: string) => void>(() => {});

export function useAskAegis() {
  return useContext(AskAegisContext);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading, isError } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const proposalMatch = pathname.match(/^\/proposals\/(\d+)(\/confirm)?$/);
  const proposalId = proposalMatch ? Number(proposalMatch[1]) : undefined;
  // The Proposal Workspace docks the chat open at 1280 px and wider (Section 2.7.3).
  const chatDocked = !!proposalMatch && !proposalMatch[2];

  const askAegis = useCallback((question?: string) => {
    setPendingQuestion(question ?? null);
    setChatOpen(true);
  }, []);

  useEffect(() => {
    if (!isLoading && (isError || !user)) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, isError, user, router, pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-(--bg)">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-(--border) border-t-(--primary)" />
      </div>
    );
  }

  const isClient = user.role === "client";

  return (
    <AskAegisContext.Provider value={askAegis}>
      <PageTitleProvider>
        <div className="flex h-screen overflow-hidden bg-(--bg)">
          <Sidebar role={user.role} className="no-print" />

          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetContent side="left" className="bg-ink w-72 border-(--ink-border) p-0">
              <SheetTitle className="flex h-16 items-center px-5">
                <AegisWordmark />
              </SheetTitle>
              <SidebarNav role={user.role} onNavigate={() => setMobileNavOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar user={user} onOpenMobileNav={() => setMobileNavOpen(true)} onOpenCommand={() => setCommandOpen(true)} />
            {/* relative: absolutely positioned descendants (sr-only text) stay inside this scroll area, so the page itself never scrolls. */}
            <main className="relative flex-1 overflow-y-auto print:overflow-visible">
              {/* Client pages leave room at the bottom so the floating "Ask Aegis" button never covers the last action. */}
              <div
                className={cn(
                  "mx-auto max-w-[1320px] px-4 py-6 md:px-8 md:py-8 print:max-w-none print:p-0",
                  isClient && "pb-28 md:pb-28"
                )}
              >
                {children}
              </div>
            </main>
          </div>

          {isClient ? (
            <>
              <button
                type="button"
                onClick={() => askAegis()}
                className={cn(
                  "bg-ai no-print fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full px-5 py-3 text-body font-semibold shadow-raised transition-transform hover:-translate-y-0.5",
                  chatDocked && "xl:hidden"
                )}
              >
                <Sparkles className="size-[18px]" aria-hidden />
                Ask Aegis
              </button>
              <ChatDrawer
                open={chatOpen}
                onOpenChange={setChatOpen}
                proposalId={proposalId}
                pendingQuestion={pendingQuestion}
                onQuestionSent={() => setPendingQuestion(null)}
              />
            </>
          ) : null}

          <CommandPalette
            role={user.role}
            open={commandOpen}
            onOpenChange={setCommandOpen}
            onAskAegis={isClient ? (question?: string) => askAegis(question) : undefined}
          />
        </div>
      </PageTitleProvider>
    </AskAegisContext.Provider>
  );
}
