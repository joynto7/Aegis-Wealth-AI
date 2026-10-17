"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive,
  FileSpreadsheet,
  Gauge,
  Goal,
  History,
  LayoutDashboard,
  Package,
  PauseCircle,
  Radar,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { AegisMark, AegisWordmark } from "@/components/shell/brand";
import { useControls, useMe } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const CLIENT_NAV: NavGroup[] = [
  {
    label: "Invest",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/profile", label: "Risk Profile", icon: Gauge },
      { href: "/profile/replay", label: "Crisis Replay", icon: History },
      { href: "/products", label: "Products", icon: Package },
      { href: "/proposals/new", label: "Proposals", icon: FileSpreadsheet },
      { href: "/planner", label: "Goal Planner", icon: Goal },
    ],
  },
  {
    label: "Portfolio",
    items: [
      { href: "/account", label: "Account", icon: Wallet },
      { href: "/records", label: "Records", icon: Archive },
    ],
  },
];

const COMPLIANCE_NAV: NavGroup[] = [
  {
    label: "Oversight",
    items: [
      { href: "/control-room", label: "Control Room", icon: Radar },
      { href: "/console", label: "Console", icon: ShieldCheck },
      { href: "/records", label: "Records", icon: Archive },
    ],
  },
];

export function navGroups(role: UserRole): NavGroup[] {
  return role === "compliance" ? COMPLIANCE_NAV : CLIENT_NAV;
}

/** Flat list of nav items, for the mobile menu and the command palette. */
export function SidebarNavItems(role: UserRole): NavItem[] {
  return navGroups(role).flatMap((g) => g.items);
}

/** The most specific item matching the path, so /profile/replay doesn't also light up /profile. */
export function activeHref(pathname: string, role: UserRole): string | undefined {
  const matches = SidebarNavItems(role)
    .map((i) => i.href)
    .filter(
      (href) =>
        pathname === href ||
        (href !== "/" && pathname.startsWith(`${href}/`)) ||
        (href === "/proposals/new" && pathname.startsWith("/proposals"))
    );
  return matches.sort((a, b) => b.length - a.length)[0];
}

function AdvisorStatus({ compact }: { compact: boolean }) {
  const controls = useControls();
  const paused = controls.data?.advisor.state === "suspended";
  const halted = controls.data?.execution.state === "halted";
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-xl border border-(--ink-border) bg-white/[0.04] text-[12.5px] text-(--ink-text)",
        compact ? "justify-center p-2" : "px-3 py-2.5"
      )}
      title={paused ? "AI advisor paused by compliance" : "AI advisor active"}
    >
      {paused ? (
        <PauseCircle className="size-4 shrink-0 text-(--ink-muted)" aria-hidden />
      ) : (
        <span className="relative flex size-2.5 shrink-0" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#a5b4fc] opacity-60" />
          <span className="relative inline-flex size-2.5 rounded-full bg-[#a5b4fc]" />
        </span>
      )}
      <span className={cn("leading-tight", compact && "sr-only")}>
        <span className="block font-medium">{paused ? "AI advisor paused" : "AI advisor active"}</span>
        <span className="block text-[11px] text-(--ink-muted)">
          {halted ? "Order execution halted" : paused ? "By the compliance team" : "Guarded by 9 rules"}
        </span>
      </span>
    </div>
  );
}

function UserCard({ compact }: { compact: boolean }) {
  const { data: user } = useMe();
  if (!user) return null;
  const initials = user.display_name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className={cn("flex items-center gap-3", compact && "justify-center")}>
      <span className="bg-ai flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold" aria-hidden>
        {initials}
      </span>
      <span className={cn("min-w-0 leading-tight", compact && "sr-only")}>
        <span className="block truncate text-[13px] font-medium text-white">{user.display_name}</span>
        <span className="block truncate text-[11.5px] text-(--ink-muted)">
          {user.role === "compliance" ? "Compliance officer" : "Client · sandbox"}
        </span>
      </span>
    </div>
  );
}

export function SidebarNav({
  role,
  compact = false,
  onNavigate,
}: {
  role: UserRole;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = activeHref(pathname, role);
  return (
    <div className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
      {navGroups(role).map((group) => (
        <div key={group.label}>
          <p className={cn("text-eyebrow mb-2 px-3 text-(--ink-muted)", compact && "sr-only")}>{group.label}</p>
          <ul className="space-y-1">
            {group.items.map((item) => {
              const isActive = item.href === active;
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={item.label}
                    onClick={onNavigate}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors",
                      compact && "justify-center px-0",
                      isActive ? "bg-white/[0.09] text-white" : "text-(--ink-muted) hover:bg-white/[0.05] hover:text-white"
                    )}
                  >
                    {isActive ? (
                      <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-[#a5b4fc]" aria-hidden />
                    ) : null}
                    <Icon className={cn("size-[18px] shrink-0", isActive && "text-[#c7d2fe]")} aria-hidden />
                    <span className={cn(compact && "sr-only")}>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** The ink sidebar: brand, grouped navigation, the AI advisor's state and the user. */
export function Sidebar({ role, className }: { role: UserRole; className?: string }) {
  return (
    <nav
      aria-label="Main"
      className={cn(
        "bg-ink hidden h-full shrink-0 flex-col border-r border-(--ink-border) md:flex md:w-[76px] xl:w-[264px]",
        className
      )}
    >
      <div className="flex h-16 items-center px-5">
        <Link href="/dashboard" aria-label="Aegis Wealth AI dashboard" className="hidden xl:block">
          <AegisWordmark />
        </Link>
        <Link href="/dashboard" aria-label="Aegis Wealth AI dashboard" className="mx-auto xl:hidden">
          <AegisMark />
        </Link>
      </div>
      <div className="hidden min-h-0 flex-1 flex-col xl:flex">
        <SidebarNav role={role} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col xl:hidden">
        <SidebarNav role={role} compact />
      </div>
      <div className="space-y-3 border-t border-(--ink-border) p-3">
        <div className="hidden xl:block">
          <AdvisorStatus compact={false} />
        </div>
        <div className="xl:hidden">
          <AdvisorStatus compact />
        </div>
        <div className="hidden px-1 py-1 xl:block">
          <UserCard compact={false} />
        </div>
        <div className="py-1 xl:hidden">
          <UserCard compact />
        </div>
      </div>
    </nav>
  );
}
