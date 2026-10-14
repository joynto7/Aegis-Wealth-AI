"use client";

import { useEffect, useState } from "react";
import { worker } from "@/mocks/browser";

/**
 * Starts the MSW service worker and only then renders the app. This file is
 * loaded via next/dynamic({ ssr: false }) from providers.tsx so that
 * `msw/browser` (a browser-only module) never enters the server bundle.
 */
export function MockGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    worker
      .start({ onUnhandledFrame: "bypass", quiet: true })
      .then(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
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
