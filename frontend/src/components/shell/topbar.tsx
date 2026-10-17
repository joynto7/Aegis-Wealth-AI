"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Eye, EyeOff, LogOut, Menu, Moon, Search, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { DataLabel } from "@/components/shared/data-label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTopBarTitle } from "@/components/shell/page-title";
import { useHealth, useLogout } from "@/lib/queries";
import { formatDate } from "@/lib/format";
import { usePrivacy } from "@/lib/privacy";
import type { User } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function IconToggle({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={onClick} aria-label={label} className="text-(--text-muted)">
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function TopBar({
  user,
  onOpenMobileNav,
  onOpenCommand,
}: {
  user: User;
  onOpenMobileNav: () => void;
  onOpenCommand: () => void;
}) {
  const title = useTopBarTitle();
  const { resolvedTheme, setTheme } = useTheme();
  const { hidden, toggle } = usePrivacy();
  const health = useHealth();
  const router = useRouter();
  const logout = useLogout();
  const [loggingOut, setLoggingOut] = useState(false);
  const initials = user.display_name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout.mutateAsync();
    } finally {
      router.replace("/login");
    }
  }

  return (
    <header className="no-print sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-(--border) bg-(--surface)/85 px-4 backdrop-blur-md md:px-8">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenMobileNav} aria-label="Open navigation menu">
        <Menu className="size-5" />
      </Button>
      <div className="min-w-0">
        <p className="text-eyebrow hidden text-(--text-muted) sm:block">{user.role === "compliance" ? "Oversight" : "Wealth sandbox"}</p>
        <h2 className="truncate font-display text-[17px] font-bold leading-tight text-(--text)">{title}</h2>
      </div>

      <button
        type="button"
        onClick={onOpenCommand}
        className="ml-auto hidden h-10 w-64 items-center gap-2 rounded-[10px] border border-(--border) bg-(--surface-2) px-3 text-body text-(--text-muted) transition-colors hover:border-(--border-strong) lg:flex"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 text-left">{user.role === "client" ? "Search or ask Aegis…" : "Search or jump to…"}</span>
        <kbd className="rounded-md border border-(--border) bg-(--surface) px-1.5 text-caption">⌘K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-1 lg:ml-2">
        <Button variant="ghost" size="icon" className="text-(--text-muted) lg:hidden" onClick={onOpenCommand} aria-label="Search or jump to">
          <Search className="size-4" />
        </Button>
        <IconToggle label={hidden ? "Show amounts" : "Hide amounts"} onClick={toggle}>
          {hidden ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
        </IconToggle>
        <IconToggle
          label={resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          {resolvedTheme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
        </IconToggle>
        <DataLabel
          label={health.data?.market_month ? "Simulated market" : "Sample data"}
          asOf={`NAV ${formatDate(health.data?.data_as_of ?? "2026-09-30")}`}
          className="mx-2 hidden xl:inline-flex"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full border border-(--border) bg-(--surface) py-1 pl-1 pr-2.5 text-body font-medium text-(--text) hover:border-(--border-strong)"
            >
              <span className="bg-ai flex size-8 items-center justify-center rounded-full text-[12px] font-semibold" aria-hidden>
                {initials}
              </span>
              <span className="hidden max-w-[10rem] truncate sm:inline">{user.display_name}</span>
              <ChevronDown className="size-4 text-(--text-muted)" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="font-medium text-(--text)">{user.display_name}</span>
                <span className="text-caption font-normal text-(--text-muted)">{user.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
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
