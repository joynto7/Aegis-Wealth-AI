import Link from "next/link";
import { ArrowUpCircle, CheckCircle2, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Suitability of a product for the client's tier. Icon plus word in neutral
 * colours: green, amber and red belong to PASS, WARNING and REJECT only
 * (Section 2.7.1). Without a profile it reads "Unknown" and links to Risk
 * Profile (UC-3.2, step 3a).
 */
export function SuitabilityBadge({
  suitable,
  short = false,
  linkUnknown = false,
  className,
}: {
  suitable: boolean | null;
  short?: boolean;
  linkUnknown?: boolean;
  className?: string;
}) {
  const base = "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-medium";
  if (suitable === null) {
    const badge = (
      <span className={cn(base, "border-(--border) text-(--text-muted)", className)}>
        <HelpCircle className="size-3.5" aria-hidden />
        Unknown
      </span>
    );
    return linkUnknown ? (
      <span className="inline-flex items-center gap-2">
        {badge}
        <Link href="/profile" className="text-caption text-(--primary) hover:underline">
          Complete your risk profile
        </Link>
      </span>
    ) : (
      badge
    );
  }
  return suitable ? (
    <span className={cn(base, "border-(--border) text-(--text)", className)}>
      <CheckCircle2 className="size-3.5" aria-hidden />
      Suitable
    </span>
  ) : (
    <span className={cn(base, "border-(--text) text-(--text)", className)}>
      <ArrowUpCircle className="size-3.5" aria-hidden />
      {short ? "Above tier" : "Above your tier"}
    </span>
  );
}
