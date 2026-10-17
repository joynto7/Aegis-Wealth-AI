import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const STEPPER_STEPS = ["Profile", "Replay", "Proposal", "Confirm", "Done"] as const;
export type StepperStepName = (typeof STEPPER_STEPS)[number];

/** Stepper (Section 2.7.3/2.7.4): the five steps of an advisory run, shown on the dashboard and every step page. */
export function Stepper({ current, className }: { current: StepperStepName; className?: string }) {
  const currentIndex = STEPPER_STEPS.indexOf(current);
  return (
    <ol
      className={cn(
        "flex w-full items-center gap-2 overflow-x-auto rounded-2xl border border-(--border) bg-(--surface) px-4 py-3 shadow-card",
        className
      )}
      aria-label="Advisory run progress"
    >
      {STEPPER_STEPS.map((step, i) => {
        const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
        return (
          <li key={step} className={cn("flex items-center gap-2", i < STEPPER_STEPS.length - 1 && "flex-1")}>
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-caption font-semibold transition-colors",
                state === "done" && "bg-(--primary) text-(--primary-foreground)",
                state === "current" && "bg-(--primary-soft) text-(--primary) ring-2 ring-(--primary)",
                state === "upcoming" && "bg-(--muted) text-(--text-muted)"
              )}
              aria-current={state === "current" ? "step" : undefined}
            >
              {state === "done" ? <Check className="size-3.5" aria-hidden /> : i + 1}
            </span>
            <span
              className={cn(
                "whitespace-nowrap text-body",
                state === "current" ? "font-semibold text-(--text)" : state === "done" ? "text-(--text)" : "text-(--text-muted)"
              )}
            >
              {step}
            </span>
            {i < STEPPER_STEPS.length - 1 ? (
              <span className="mx-1 h-[3px] min-w-6 flex-1 overflow-hidden rounded-full bg-(--muted)" aria-hidden>
                <span className={cn("block h-full rounded-full bg-(--primary) transition-all", i < currentIndex ? "w-full" : "w-0")} />
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
