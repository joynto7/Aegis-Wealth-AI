"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FieldError } from "@/components/shared/error-state";
import { useLogin } from "@/lib/queries";
import { ApiError } from "@/lib/api-client";

const schema = z.object({
  email: z.string().min(1, "Enter your email."),
  password: z.string().min(1, "Enter your password."),
});
type FormValues = z.infer<typeof schema>;

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const login = useLogin();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      const { user } = await login.mutateAsync(values);
      // Only same-origin paths ("/x", never "//host" or "https://host"), so
      // the link can't send someone to another site after they log in.
      const raw = params.get("next");
      const next = raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : null;
      if (next && ((user.role === "client" && !next.startsWith("/console")) || (user.role === "compliance" && next.startsWith("/console")))) {
        router.replace(next);
      } else {
        router.replace(user.role === "compliance" ? "/console" : "/");
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === "RATE_LIMITED") {
        setFormError("Too many attempts; try again in a minute.");
      } else if (e instanceof ApiError && e.code === "INVALID_CREDENTIALS") {
        setFormError("Email or password is incorrect.");
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--bg) px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <ShieldAlert className="size-9 text-(--primary)" aria-hidden />
          <h1 className="text-page-title text-(--text)">Aegis Wealth AI</h1>
          <p className="text-body text-(--text-muted)">A wealth-advisory sandbox. Log in to continue.</p>
        </div>

        <div className="rounded-xl border border-(--border) bg-(--surface) p-6 shadow-sm">
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                className="mt-1.5"
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
                className="mt-1.5"
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

            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending ? "Logging in…" : "Log in"}
            </Button>
          </form>
        </div>

        <div className="mt-4 rounded-xl border border-dashed border-(--border) bg-(--surface) p-4 text-caption text-(--text-muted)">
          <p className="font-medium text-(--text)">Demo accounts (password: password123)</p>
          <ul className="mt-1 space-y-0.5">
            <li>rina@example.com — client</li>
            <li>chen@example.com — client</li>
            <li>officer@example.com — compliance</li>
          </ul>
        </div>
      </div>
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
