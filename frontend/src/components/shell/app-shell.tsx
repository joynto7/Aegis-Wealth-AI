"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MessageCircleQuestion } from "lucide-react";
import { Sidebar, SidebarNavItems } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/topbar";
import { ChatDrawer } from "@/components/shell/chat-drawer";
import { PageTitleProvider } from "@/components/shell/page-title";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import Link from "next/link";
import { useMe } from "@/lib/queries";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading, isError } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && (isError || !user)) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, isError, user, router, pathname]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-(--bg)">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-(--border) border-t-(--primary)" />
      </div>
    );
  }

  return (
    <PageTitleProvider>
      <div className="flex h-screen overflow-hidden bg-(--bg)">
        <Sidebar role={user.role} className="no-print" />

        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="border-b border-(--border)">
              <SheetTitle>Aegis Wealth AI</SheetTitle>
            </SheetHeader>
            <ul className="space-y-1 p-3">
              {SidebarNavItems(user.role).map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileNavOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-body",
                        active ? "bg-(--primary-soft) font-medium text-(--primary)" : "text-(--text-muted)"
                      )}
                    >
                      <Icon className="size-4.5" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar user={user} onOpenMobileNav={() => setMobileNavOpen(true)} />
          <main className="flex-1 overflow-y-auto print:overflow-visible">
            <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-6 print:max-w-none print:p-0">{children}</div>
          </main>
        </div>

        {user.role === "client" ? (
          <>
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className="no-print fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-(--primary) px-4 py-3 text-body font-medium text-white shadow-lg transition-colors hover:bg-(--primary-hover)"
            >
              <MessageCircleQuestion className="size-5" aria-hidden />
              Ask Aegis
            </button>
            <ChatDrawer open={chatOpen} onOpenChange={setChatOpen} />
          </>
        ) : null}
      </div>
    </PageTitleProvider>
  );
}
