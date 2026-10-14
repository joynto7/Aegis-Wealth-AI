import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const STEPPER_STEPS = ["Profile", "Replay", "Proposal", "Confirm", "Done"] as const;
export type StepperStepName = (typeof STEPPER_STEPS)[number];

/** Stepper (Section 2.7.3/2.7.4): shown on the dashboard and every step page. */
export function Stepper({ current, className }: { current: StepperStepName; className?: string }) {
  const currentIndex = STEPPER_STEPS.indexOf(current);
  return (
    <ol className={cn("flex items-center gap-2", className)} aria-label="Advisory run progress">
      {STEPPER_STEPS.map((step, i) => {
        const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-caption font-semibold",
                state === "done" && "bg-(--primary) text-white",
                state === "current" && "bg-(--primary-soft) text-(--primary) ring-2 ring-(--primary)",
                state === "upcoming" && "bg-(--muted) text-(--text-muted)"
              )}
              aria-current={state === "current" ? "step" : undefined}
            >
              {state === "done" ? <Check className="size-3.5" aria-hidden /> : i + 1}
            </span>
            <span
              className={cn(
                "text-caption",
                state === "current" ? "font-semibold text-(--text)" : "text-(--text-muted)"
              )}
            >
              {step}
            </span>
            {i < STEPPER_STEPS.length - 1 ? <span className="h-px w-6 bg-(--border)" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}
