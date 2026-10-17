import { useId } from "react";
import { cn } from "@/lib/utils";

/** The Aegis mark: a shield with a rising line, in the brand gradient. */
export function AegisMark({ className }: { className?: string }) {
  const gradientId = `aegis-mark-${useId().replace(/:/g, "")}`;

  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <path
        d="M16 2.5 4.5 7v8.2c0 7.2 4.9 12.5 11.5 14.3 6.6-1.8 11.5-7.1 11.5-14.3V7L16 2.5Z"
        fill={`url(#${gradientId})`}
      />
      <path
        d="m9.5 19.5 4.2-4.3 3.1 3 5.7-6.2"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="22.5" cy="12" r="1.6" fill="#ffffff" />
    </svg>
  );
}

export function AegisWordmark({ className, subtle = false }: { className?: string; subtle?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <AegisMark />
      <span className="flex flex-col leading-none">
        <span className={cn("font-display text-[17px] font-bold tracking-tight", subtle ? "text-(--text)" : "text-white")}>
          Aegis
        </span>
        <span className={cn("text-eyebrow mt-0.5 !text-[9.5px]", subtle ? "text-(--text-muted)" : "text-(--ink-muted)")}>
          Wealth AI
        </span>
      </span>
    </span>
  );
}
