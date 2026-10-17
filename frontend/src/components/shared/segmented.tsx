"use client";

import { cn } from "@/lib/utils";

/** A segmented control: one choice out of a few, as a radio group with arrow-key navigation. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  size = "md",
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; count?: number }[];
  label: string;
  className?: string;
  size?: "sm" | "md";
}) {
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const i = options.findIndex((o) => o.value === value);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(options[(i + 1) % options.length].value);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(options[(i - 1 + options.length) % options.length].value);
    }
  }
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("inline-flex rounded-xl bg-(--segment-track) p-1 ring-1 ring-(--border)/60", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg font-medium transition-[background-color,color,box-shadow] duration-150",
              size === "sm" ? "px-2.5 py-1 text-caption" : "px-3.5 py-1.5 text-body",
              active ? "bg-(--segment-thumb) text-(--text) shadow-card" : "text-(--text-muted) hover:text-(--text)"
            )}
          >
            {o.label}
            {o.count !== undefined ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                  active ? "bg-(--primary-soft) text-(--primary)" : "bg-(--surface-3) text-(--text-muted)"
                )}
              >
                {o.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
