import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";
import { db } from "./db";

export const worker = setupWorker(...handlers);

// Keep the mock store across reloads in this tab (see src/mocks/db.ts):
// save after every mocked response, and once more as the page goes away.
worker.events.on("response:mocked", () => db.persist());
if (typeof window !== "undefined") window.addEventListener("pagehide", () => db.persist());

/**
 * Starts the worker exactly once per page, no matter how many times this
 * gets called. React 19's Strict Mode deliberately double-invokes effects
 * in development to catch non-idempotent side effects like `worker.start()`
 * — without this guard, the second call rejects with "cannot configure an
 * already enabled network", the rejection goes uncaught, and the app never
 * leaves its loading screen.
 */
let startPromise: Promise<void> | null = null;

export function startWorkerOnce(): Promise<void> {
  if (!startPromise) {
    startPromise = worker
      .start({ onUnhandledFrame: "bypass", quiet: true })
      .then(() => undefined)
      .catch((err: unknown) => {
        // A second start() on an already-enabled network means the worker
        // is already running — that's success, not failure.
        const alreadyEnabled = err instanceof Error && /already enabled/i.test(err.message);
        if (!alreadyEnabled) {
          startPromise = null; // allow a real failure to be retried
          throw err;
        }
      });
  }
  return startPromise;
}
