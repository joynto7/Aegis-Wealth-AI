"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/**
 * Privacy mode (docs/ui-redesign.md): one switch hides every amount, as banking
 * apps do for use in public. Remembered per browser; a convenience only, so a
 * blocked storage simply means it starts off.
 */
const STORAGE_KEY = "aegis_privacy_mode";

const PrivacyContext = createContext<{ hidden: boolean; toggle: () => void }>({ hidden: false, toggle: () => {} });

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      // Restoring a saved preference after hydration; the default (shown) is what the server rendered.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHidden(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // Storage blocked: amounts stay visible.
    }
  }, []);

  const toggle = useCallback(() => {
    setHidden((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Not remembered, still applied.
      }
      return next;
    });
  }, []);

  return <PrivacyContext.Provider value={{ hidden, toggle }}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy() {
  return useContext(PrivacyContext);
}
