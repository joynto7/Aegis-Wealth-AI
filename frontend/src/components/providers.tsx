"use client";

import { useState } from "react";
import dynamicImport from "next/dynamic";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api-client";
import { API_MOCK } from "@/lib/api-mode";

/**
 * Section 2.7.6: a 401 from anywhere should bounce the user to /login, not
 * leave them half-authenticated. Re-checking "me" is enough — if the session
 * is really gone, useMe() flips to an error and AppShell's own effect
 * redirects; if it was a one-off, this just re-validates quietly.
 */
function handleAuthError(error: unknown, queryClient: QueryClient, queryKey?: readonly unknown[]) {
  if (error instanceof ApiError && error.code === "UNAUTHENTICATED") {
    if (queryKey?.[0] !== "me") queryClient.invalidateQueries({ queryKey: ["me"] });
  }
}

function makeQueryClient() {
  // A plain mutable holder, so the caches (created first) can reach the
  // client (created after) once it exists — onError only ever fires later,
  // well after `holder.client` is assigned below.
  const holder: { client?: QueryClient } = {};
  const queryCache = new QueryCache({
    onError: (error, query) => handleAuthError(error, holder.client!, query.queryKey),
  });
  const mutationCache = new MutationCache({
    onError: (error) => handleAuthError(error, holder.client!),
  });
  const queryClient = new QueryClient({
    queryCache,
    mutationCache,
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
  holder.client = queryClient;
  return queryClient;
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

// `msw/browser` must never enter the server bundle — ssr:false keeps the
// whole mock-starting boundary out of server compilation entirely (a plain
// useEffect-gated dynamic import() is not enough; Next still statically
// resolves module graphs for "use client" files during SSR).
const MockGate = dynamicImport(() => import("@/components/mock-gate").then((m) => m.MockGate), {
  ssr: false,
});

/** With NEXT_PUBLIC_API_MOCK on (the default until the backend exists), every /api/* call is served by MSW (src/mocks). */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(getQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {API_MOCK ? <MockGate>{children}</MockGate> : children}
      </TooltipProvider>
    </QueryClientProvider>
  );
}
