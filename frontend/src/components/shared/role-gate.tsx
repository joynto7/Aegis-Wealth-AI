"use client";

import { useMe } from "@/lib/queries";
import type { UserRole } from "@/lib/types";
import { Forbidden } from "@/components/shared/forbidden";
import { Skeleton } from "@/components/ui/skeleton";

/** Restricts a page to one role, server-equivalent check done again by the mock API itself. */
export function RoleGate({ role, children }: { role: UserRole; children: React.ReactNode }) {
  const { data: user, isLoading } = useMe();
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!user || user.role !== role) return <Forbidden />;
  return <>{children}</>;
}
