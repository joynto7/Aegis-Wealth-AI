"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  Package,
  FileSpreadsheet,
  Wallet,
  Archive,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";

const CLIENT_NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/profile", label: "Risk Profile", icon: ClipboardList },
  { href: "/products", label: "Products", icon: Package },
  { href: "/proposals/new", label: "Proposals", icon: FileSpreadsheet },
  { href: "/account", label: "Account", icon: Wallet },
  { href: "/records", label: "Records", icon: Archive },
];

const COMPLIANCE_NAV = [
  { href: "/console", label: "Console", icon: ShieldCheck },
  { href: "/records", label: "Records", icon: Archive },
];

export function Sidebar({ role, className }: { role: UserRole; className?: string }) {
  const pathname = usePathname();
  const items = role === "compliance" ? COMPLIANCE_NAV : CLIENT_NAV;

  return (
    <nav
      className={cn(
        "hidden h-full shrink-0 flex-col border-r border-(--border) bg-(--surface) md:flex md:w-18 xl:w-[248px]",
        className
      )}
    >
      <div className="flex h-14 items-center gap-2 border-b border-(--border) px-5">
        <ShieldAlert className="size-5 shrink-0 text-(--primary)" aria-hidden />
        <span className="hidden text-form font-semibold text-(--text) xl:inline">Aegis Wealth AI</span>
      </div>
      <ul className="flex-1 space-y-1 p-3">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                title={item.label}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-body transition-colors",
                  active
                    ? "bg-(--primary-soft) font-medium text-(--primary)"
                    : "text-(--text-muted) hover:bg-(--muted) hover:text-(--text)"
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-4.5 shrink-0" aria-hidden />
                <span className="hidden xl:inline">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SidebarNavItems(role: UserRole) {
  return role === "compliance" ? COMPLIANCE_NAV : CLIENT_NAV;
}
