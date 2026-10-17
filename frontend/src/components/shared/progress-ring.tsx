/** A progress ring: "3 of 5", with the fraction in the middle. */
export function ProgressRing({ done, total, size = 96, unit = "steps" }: { done: number; total: number; size?: number; unit?: string }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const fraction = total ? Math.min(1, done / total) : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${done} of ${total} ${unit}`}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--primary-soft)" strokeWidth="9" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fraction)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden>
        <span className="font-display text-[22px] font-bold leading-none text-(--text)">
          {done}
          <span className="text-[14px] text-(--text-muted)">/{total}</span>
        </span>
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-(--text-muted)">{unit}</span>
      </span>
    </div>
  );
}
