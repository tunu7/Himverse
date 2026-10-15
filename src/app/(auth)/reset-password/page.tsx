import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { LoadingBlock } from "@/components/page-shell";
import { ResetPasswordForm } from "@/features/auth/components/password-forms";
import { getAssurance, recentRecovery } from "@/server/auth/assurance";
import { RECOVERY_WINDOW_SECONDS } from "@/server/auth/passwords";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Choose a new password · Himverse.AI" };

async function ResetContent() {
  await connection();
  const [user, assurance] = await Promise.all([getCurrentUser(), getAssurance()]);
  if (!user || !assurance || !recentRecovery(assurance, RECOVERY_WINDOW_SECONDS)) {
    return (
      <div className="flex flex-col gap-3" role="alert">
        <p className="text-fg-soft">
          This page only works straight after opening a password-reset link, in the same browser.
        </p>
        <Link
          href="/forgot-password"
          className="self-start font-medium text-accent underline-offset-4 hover:underline"
        >
          Request a new reset link
        </Link>
      </div>
    );
  }
  // A reset must not bypass two-step login.
  if (assurance.hasVerifiedTotp && assurance.aal !== "aal2") {
    redirect(`/mfa/verify?next=${encodeURIComponent("/reset-password")}`);
  }
  return <ResetPasswordForm />;
}

export default function ResetPasswordPage() {
  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-semibold tracking-[-0.03em] text-fg">Choose a new password</h1>
        <p className="text-muted">You&apos;ll stay signed in here; other devices are signed out.</p>
      </header>
      <Suspense fallback={<LoadingBlock label="Loading…" variant="form" />}>
        <ResetContent />
      </Suspense>
    </main>
  );
}
