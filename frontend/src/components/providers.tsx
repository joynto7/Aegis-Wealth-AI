"use client";

import { useState } from "react";
import dynamicImport from "next/dynamic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
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

/** There is no real backend in this build — every /api/* call is served by MSW (src/mocks). */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(getQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MockGate>{children}</MockGate>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
