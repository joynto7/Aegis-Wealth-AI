import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/**
 * ErrorState (Section 2.7.4/2.7.6): message, error code in small text, and a Retry button.
 * `compact` is the inline form for a failed action inside a card (v2).
 */
export function ErrorState({
  error,
  onRetry,
  className,
  compact = false,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}) {
  const message = error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
  const code = error instanceof ApiError ? error.code : undefined;
  if (compact) {
    return (
      <div role="alert" className={cn("flex items-start gap-2 rounded-xl border border-(--reject)/30 bg-(--reject-bg) px-3 py-2.5", className)}>
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-(--reject)" aria-hidden />
        <p className="text-caption text-(--text)">
          {message}
          {code ? <span className="ml-1 text-(--text-muted)">({code})</span> : null}
        </p>
      </div>
    );
  }
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-xl border border-(--border) bg-(--reject-bg) px-6 py-10 text-center", className)}>
      <AlertCircle className="size-6 text-(--reject)" aria-hidden />
      <p className="text-form font-semibold text-(--text)">{message}</p>
      {code ? <p className="text-caption text-(--text-muted)">Error code: {code}</p> : null}
      {onRetry ? (
        <Button variant="outline" onClick={onRetry} className="mt-1">
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-caption text-(--reject)">{message}</p>;
}
