import type { Metadata } from "next";
import Link from "next/link";

import { PageShell } from "@/components/page-shell";

export const metadata: Metadata = { title: "Account deleted", robots: { index: false } };

export default function AccountDeletedPage() {
  return (
    <PageShell title="Your account has been deleted">
      <div className="flex flex-col gap-3" role="status">
        <p className="text-fg-soft">
          Your sign-in, profile and saved trips are gone. Partners keep only an anonymised record of
          past bookings. Thank you for travelling with Himverse.
        </p>
        <Link href="/" className="font-medium text-accent underline-offset-4 hover:underline">
          Back to the home page
        </Link>
      </div>
    </PageShell>
  );
}
