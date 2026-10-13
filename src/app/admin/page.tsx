import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { LoadingBlock, PageShell } from "@/components/page-shell";
import { getAiEnv } from "@/lib/env.server";
import { getAdminOverview } from "@/server/admin/admin";
import { requireAdminForPage } from "@/server/auth/session";

export const metadata: Metadata = { title: "Admin · Himverse.AI", robots: { index: false } };

function Stat({
  label,
  value,
  hint,
  href,
  attention = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  attention?: boolean;
}) {
  const body = (
    <>
      <p className="text-xs font-medium tracking-wide text-subtle uppercase">{label}</p>
      <p
        className={`text-3xl font-semibold tracking-tight ${attention ? "text-accent" : "text-fg"}`}
      >
        {value}
      </p>
      {hint ? <p className="text-sm text-muted">{hint}</p> : null}
    </>
  );
  const className = `flex flex-col gap-1 rounded-2xl border bg-surface p-5 shadow-xs ${
    attention ? "border-accent/40 ring-1 ring-accent/20" : "border-line"
  }`;
  return href ? (
    <Link href={href} className={`${className} transition hover:-translate-y-0.5 hover:shadow-md`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

async function Overview() {
  await requireAdminForPage("/admin");
  await connection();
  const o = await getAdminOverview(new Date());
  const ai = getAiEnv();
  const aiCap = ai.AI_DAILY_GENERATION_LIMIT;

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="attention" className="flex flex-col gap-4">
        <h2 id="attention" className="text-lg font-semibold text-fg">
          Needs attention
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Stat
            label="Providers awaiting review"
            value={o.providersAwaitingReview}
            hint="Verify, request changes or suspend"
            href="/admin/providers?status=pending_review"
            attention={o.providersAwaitingReview > 0}
          />
          <Stat
            label="Booking requests awaiting a reply"
            value={o.bookingsAwaitingReply}
            hint="Providers have 48 hours to respond"
            href="/admin/bookings?status=requested"
            attention={o.bookingsAwaitingReply > 0}
          />
          <Stat
            label="AI trip plans today"
            value={`${o.aiGenerationsToday} / ${aiCap}`}
            hint={
              ai.AI_ITINERARY_ENABLED === "true"
                ? "Daily platform cap (IST)"
                : "Trip planning is switched off"
            }
            attention={aiCap > 0 && o.aiGenerationsToday >= aiCap * 0.8}
          />
        </div>
      </section>

      <section aria-labelledby="catalogue" className="flex flex-col gap-4">
        <h2 id="catalogue" className="text-lg font-semibold text-fg">
          Catalogue
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Verified providers"
            value={o.providersVerified}
            href="/admin/providers?status=verified"
          />
          <Stat
            label="Published experiences"
            value={o.experiencesPublished}
            href="/admin/experiences?status=published"
          />
          <Stat
            label="Locked by moderation"
            value={o.experiencesLocked}
            hint="Providers can't republish these"
            href="/admin/experiences"
          />
          <Stat
            label="Published destinations"
            value={`${o.destinationsPublished} / ${o.destinationsTotal}`}
            href="/admin/destinations"
          />
        </div>
      </section>

      <section aria-labelledby="bookings" className="flex flex-col gap-4">
        <h2 id="bookings" className="text-lg font-semibold text-fg">
          Bookings
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Stat
            label="Requests in the last 7 days"
            value={o.bookingsLast7Days}
            href="/admin/bookings"
          />
          <Stat
            label="Upcoming confirmed bookings"
            value={o.bookingsConfirmedUpcoming}
            href="/admin/bookings?status=confirmed"
          />
        </div>
      </section>
    </div>
  );
}

export default function AdminOverviewPage() {
  return (
    <PageShell title="Admin overview" description="What needs your attention across Himverse.">
      <Suspense fallback={<LoadingBlock label="Loading overview…" variant="cards" />}>
        <Overview />
      </Suspense>
    </PageShell>
  );
}
