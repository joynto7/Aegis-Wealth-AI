import { cn } from "@/lib/utils";

const RISK_WORDS = ["Very low", "Low", "Medium", "High", "Very high"];

/** A product's risk level, R1–R5, as five segments filled up to the level, with the level in words. */
export function RiskMeter({ level, showWords = true, className }: { level: number; showWords?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)} aria-label={`Risk level R${level} of 5, ${RISK_WORDS[level - 1]}`} role="img">
      <span className="flex gap-[3px]" aria-hidden>
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={cn("h-2 w-3.5 rounded-[3px]", n <= level ? "bg-(--primary)" : "bg-(--primary-soft)")}
            style={n <= level ? { opacity: 0.45 + n * 0.11 } : undefined}
          />
        ))}
      </span>
      <span className="text-caption font-semibold text-(--text)">R{level}</span>
      {showWords ? <span className="text-caption text-(--text-muted)">{RISK_WORDS[level - 1]}</span> : null}
    </div>
  );
}
