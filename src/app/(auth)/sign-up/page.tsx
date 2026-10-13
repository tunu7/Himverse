import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LoadingBlock } from "@/components/page-shell";
import { SignUpForm } from "@/features/auth/components/auth-forms";
import { GoogleSignIn } from "@/features/auth/components/google-sign-in";
import { safeRedirectPath } from "@/lib/redirect";

export const metadata: Metadata = { title: "Create your account · Himverse.AI" };

const AUDIENCES = {
  traveller: {
    label: "Traveller",
    intro: "Free to join. Save AI trip plans and request experiences from local providers.",
  },
  partner: {
    label: "Tourism partner",
    intro:
      "List your experiences on Himverse. Create an account, then complete your business application for review.",
  },
} as const;

async function SignUpContent({ searchParams }: PageProps<"/sign-up">) {
  const { next, as } = await searchParams;
  const audience = as === "partner" ? "partner" : "traveller";
  // Partners continue to their application; travellers to their account.
  const destination = safeRedirectPath(next, audience === "partner" ? "/provider" : "");
  const keepNext = typeof next === "string" ? `next=${encodeURIComponent(next)}` : "";
  return (
    <div className="flex flex-col gap-6">
      <nav
        aria-label="Account type"
        className="grid grid-cols-2 gap-1 rounded-full border border-line bg-surface-muted p-1"
      >
        {(Object.keys(AUDIENCES) as (keyof typeof AUDIENCES)[]).map((key) => {
          const query = [key === "partner" ? "as=partner" : "", keepNext].filter(Boolean).join("&");
          return (
            <Link
              key={key}
              href={`/sign-up${query ? `?${query}` : ""}`}
              aria-current={audience === key ? "page" : undefined}
              className={`rounded-full px-4 py-2 text-center text-sm font-semibold transition ${
                audience === key ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"
              }`}
            >
              {AUDIENCES[key].label}
            </Link>
          );
        })}
      </nav>
      <p className="text-muted">{AUDIENCES[audience].intro}</p>
      <GoogleSignIn next={destination} />
      <SignUpForm next={destination} />
    </div>
  );
}

export default function SignUpPage(props: PageProps<"/sign-up">) {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-4xl font-semibold tracking-[-0.03em] text-fg">Create your account</h1>
      <Suspense fallback={<LoadingBlock label="Loading…" variant="form" />}>
        <SignUpContent {...props} />
      </Suspense>
    </main>
  );
}
