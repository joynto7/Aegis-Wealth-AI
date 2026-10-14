"use client";

import { createContext, useContext, useEffect, useState } from "react";

interface PageTitleContextValue {
  title: string;
  setTitle: (title: string) => void;
}

const PageTitleContext = createContext<PageTitleContextValue | null>(null);

export function PageTitleProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = useState("Dashboard");
  return <PageTitleContext.Provider value={{ title, setTitle }}>{children}</PageTitleContext.Provider>;
}

/** Call at the top of a screen to put its name in the top bar. */
export function usePageTitle(title: string) {
  const ctx = useContext(PageTitleContext);
  useEffect(() => {
    ctx?.setTitle(title);
  }, [ctx, title]);
}

export function useTopBarTitle() {
  const ctx = useContext(PageTitleContext);
  return ctx?.title ?? "Aegis Wealth AI";
}
