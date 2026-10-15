import { tierLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** TierBadge (Section 2.7.4): "Tier 3 · Balanced" in neutral blue — never colour-coded by risk. */
export function TierBadge({ tier, className }: { tier: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-(--primary-soft) px-2.5 py-1 text-body font-medium leading-none text-(--primary)",
        className
      )}
    >
      Tier {tier} · {tierLabel(tier)}
    </span>
  );
}
