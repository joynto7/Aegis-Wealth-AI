"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, FlaskConical, Lock, Scale, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FieldError } from "@/components/shared/error-state";
import { AegisWordmark } from "@/components/shell/brand";
import { useLogin } from "@/lib/queries";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const schema = z.object({
  email: z.string().min(1, "Enter your email."),
  password: z.string().min(1, "Enter your password."),
});
type FormValues = z.infer<typeof schema>;

/** The seeded demo accounts (README); one click fills the form. */
const DEMO_ACCOUNTS = [
  { email: "rina@example.com", name: "Rina", role: "Client · first-time investor" },
  { email: "chen@example.com", name: "Chen", role: "Client" },
  { email: "officer@example.com", name: "Amara", role: "Compliance officer" },
];
const DEMO_PASSWORD = "password123";

function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-violet-50 lg:flex lg:w-[52%] lg:flex-col lg:justify-between lg:p-14 dark:from-[#0a1330] dark:via-[#0f1a45] dark:to-[#0a1330]">
      <div className="pointer-events-none absolute -left-24 top-1/3 size-[28rem] rounded-full bg-[#6366f1]/25 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -right-20 bottom-0 size-[24rem] rounded-full bg-[#a855f7]/20 blur-3xl" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12] dark:opacity-[0.07]"
        style={{
          backgroundImage: "linear-gradient(rgba(79,70,229,.24) 1px, transparent 1px), linear-gradient(90deg, rgba(79,70,229,.24) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse at 30% 40%, black 30%, transparent 75%)",
        }}
        aria-hidden
      />
      <div className="relative">
        <AegisWordmark subtle />
      </div>
      <div className="relative max-w-lg">
        <p className="text-eyebrow text-indigo-700 dark:text-[#c7d2fe]">Aegis Wealth AI</p>
        <h1 className="mt-4 font-display text-[42px] font-extrabold leading-[1.08] tracking-tight text-(--text)">
          Clear guidance.
          <br />
          <span className="text-ai">Your decision.</span>
        </h1>
        <p className="mt-5 max-w-md text-[16px] leading-relaxed text-(--text-muted)">
          Explore a transparent wealth-advice sandbox, with explanations and safeguards at every step.
        </p>
        <div className="mt-8 flex max-w-md items-start gap-3 rounded-2xl border border-indigo-100 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.05]">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-white/[0.08] dark:text-[#c7d2fe]">
            <ShieldCheck className="size-[18px]" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-(--text)">You stay in control</p>
            <p className="mt-1 text-caption leading-relaxed text-(--text-muted)">The AI can explain a plan. Only you can confirm a simulated action.</p>
          </div>
        </div>
      </div>
      <p className="relative inline-flex w-fit items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50/80 px-3.5 py-2 text-caption text-(--text-muted) dark:border-white/10 dark:bg-white/[0.04]">
        <Lock className="size-3.5" aria-hidden /> Simulated accounts · no real money
      </p>
    </aside>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const login = useLogin();
  const [formError, setFormError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      const { user } = await login.mutateAsync(values);
      // Only same-origin paths ("/x", never "//host" or "https://host"), so
      // the link can't send someone to another site after they log in.
      const raw = params.get("next");
      const requested = raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : null;
      const next = requested === "/" ? "/dashboard" : requested;
      const complianceOnly = !!next && (next.startsWith("/console") || next.startsWith("/control-room"));
      if (next && ((user.role === "client" && !complianceOnly) || (user.role === "compliance" && complianceOnly))) {
        router.replace(next);
      } else {
        router.replace(user.role === "compliance" ? "/control-room" : "/dashboard");
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === "RATE_LIMITED") {
        // The server says which limit applied: too many attempts, or this account locked for a few minutes.
        setFormError(e.message || "Too many attempts; try again in a minute.");
      } else if (e instanceof ApiError && e.code === "INVALID_CREDENTIALS") {
        setFormError("Email or password is incorrect.");
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    }
  }

  function pickDemo(email: string) {
    setPicked(email);
    setValue("email", email, { shouldValidate: true });
    setValue("password", DEMO_PASSWORD, { shouldValidate: true });
  }

  return (
    <div className="flex min-h-screen bg-(--bg)">
      <BrandPanel />
      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 lg:hidden">
            <AegisWordmark subtle />
          </div>
          <h2 className="font-display text-[28px] font-bold tracking-tight text-(--text)">Welcome back</h2>
          <p className="mt-1.5 text-body text-(--text-muted)">Log in to your wealth sandbox.</p>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8 space-y-5">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="you@example.com"
                className="mt-1.5 h-11"
                aria-invalid={!!errors.email}
                {...register("email")}
              />
              <FieldError message={errors.email?.message} />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                className="mt-1.5 h-11"
                aria-invalid={!!errors.password}
                {...register("password")}
              />
              <FieldError message={errors.password?.message} />
            </div>

            {formError ? (
              <Alert variant="destructive">
                <AlertTitle>Couldn&apos;t log in</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" size="lg" className="w-full" disabled={login.isPending}>
              {login.isPending ? "Logging in…" : "Log in"}
              {login.isPending ? null : <ArrowRight className="size-4" />}
            </Button>
          </form>

          <div className="mt-10">
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-(--border)" aria-hidden />
              <p className="flex items-center gap-1.5 text-caption text-(--text-muted)">
                <FlaskConical className="size-3.5" aria-hidden /> Demo accounts · password {DEMO_PASSWORD}
              </p>
              <span className="h-px flex-1 bg-(--border)" aria-hidden />
            </div>
            <ul className="mt-4 grid gap-2">
              {DEMO_ACCOUNTS.map((a) => (
                <li key={a.email}>
                  <button
                    type="button"
                    onClick={() => pickDemo(a.email)}
                    aria-pressed={picked === a.email}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border bg-(--surface) px-3.5 py-3 text-left transition-colors hover:border-(--primary)",
                      picked === a.email ? "border-(--primary) ring-2 ring-(--primary)/20" : "border-(--border)"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full",
                        a.email.startsWith("officer") ? "bg-(--ink) text-white" : "bg-(--primary-soft) text-(--primary)"
                      )}
                    >
                      {a.email.startsWith("officer") ? <Scale className="size-4" aria-hidden /> : <UserRound className="size-4" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-body font-semibold text-(--text)">{a.name}</span>
                      <span className="block truncate text-caption text-(--text-muted)">
                        {a.role} · {a.email}
                      </span>
                    </span>
                    <span className="text-caption font-medium text-(--primary)">Use</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-8 text-center text-caption text-(--text-muted)">
            Sample products and simulated orders. No real money, brokerage or market data.
          </p>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
