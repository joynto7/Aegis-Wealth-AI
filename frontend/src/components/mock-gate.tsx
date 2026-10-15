"use client";

import { useEffect, useState } from "react";
import { startWorkerOnce } from "@/mocks/browser";

/**
 * Starts the MSW service worker and only then renders the app. This file is
 * loaded via next/dynamic({ ssr: false }) from providers.tsx so that
 * `msw/browser` (a browser-only module) never enters the server bundle.
 */
export function MockGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"starting" | "ready" | "error">("starting");

  useEffect(() => {
    let cancelled = false;
    startWorkerOnce()
      .then(() => {
        if (!cancelled) setState("ready");
      })
      .catch((err) => {
        console.error("Failed to start the mock API layer:", err);
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-(--bg) px-4">
        <div className="max-w-sm text-center">
          <p className="text-form font-semibold text-(--text)">Couldn&apos;t start the mock API layer</p>
          <p className="mt-2 text-body text-(--text-muted)">
            Reload the page. If this keeps happening, clear this site&apos;s service workers in your browser&apos;s
            DevTools (Application → Service Workers → Unregister) and reload.
          </p>
        </div>
      </div>
    );
  }

  if (state === "starting") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-(--bg)">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-(--border) border-t-(--primary)" />
          <p className="text-body text-(--text-muted)">Starting Aegis Wealth AI…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
