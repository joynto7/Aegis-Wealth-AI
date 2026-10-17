"use client";

import { useEffect, useState } from "react";

/** The value, once it has stopped changing for `delay` ms: for live previews that follow a slider. */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return settled;
}
