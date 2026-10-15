import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LoadingBlock } from "@/components/page-shell";
import { ForgotPasswordForm } from "@/features/auth/components/password-forms";

export const metadata: Metadata = { title: "Reset your password · Himverse.AI" };

async function Notice({ searchParams }: PageProps<"/forgot-password">) {
  const { error } = await searchParams;
  return error === "expired" ? (
    <p
      role="alert"
      className="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger-soft-fg"
    >
      That reset link is invalid, expired or was opened in a different browser. Request a new one
      below.
    </p>
  ) : null;
}

export default function ForgotPasswordPage(props: PageProps<"/forgot-password">) {
  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-semibold tracking-[-0.03em] text-fg">Forgot your password?</h1>
        <p className="text-muted">
          Enter your account email and we&apos;ll send you a link to choose a new password.
        </p>
      </header>
      <Suspense fallback={null}>
        <Notice {...props} />
      </Suspense>
      <Suspense fallback={<LoadingBlock label="Loading…" variant="form" />}>
        <ForgotPasswordForm />
      </Suspense>
      <Link
        href="/sign-in"
        className="text-sm font-medium text-accent underline-offset-4 hover:underline"
      >
        Back to sign in
      </Link>
    </main>
  );
}
