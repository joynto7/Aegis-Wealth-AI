"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, LogOut, ChevronDown, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { DataLabel } from "@/components/shared/data-label";
import { useTopBarTitle } from "@/components/shell/page-title";
import { useLogout } from "@/lib/queries";
import type { User } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function TopBar({ user, onOpenMobileNav }: { user: User; onOpenMobileNav: () => void }) {
  const title = useTopBarTitle();
  const { resolvedTheme, setTheme } = useTheme();
  const router = useRouter();
  const logout = useLogout();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout.mutateAsync();
    } finally {
      router.replace("/login");
    }
  }

  return (
    <header className="no-print flex h-14 shrink-0 items-center gap-3 border-b border-(--border) bg-(--surface) px-4 md:px-6">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenMobileNav} aria-label="Open navigation menu">
        <Menu className="size-5" />
      </Button>
      <h2 className="text-form font-semibold text-(--text)">{title}</h2>
      <div className="ml-auto flex items-center gap-3">
        <DataLabel label="Sample data" asOf="NAV 30 Sep 2026" className="hidden sm:inline-flex" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              <span className="max-w-[10rem] truncate">{user.display_name}</span>
              <ChevronDown className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="font-medium text-(--text)">{user.display_name}</span>
                <span className="text-caption font-normal text-(--text-muted)">{user.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
              {resolvedTheme === "dark" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
              {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleLogout} disabled={loggingOut}>
              <LogOut className="size-4" aria-hidden />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
