import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { Checklist, Panel, StatCard, StatGrid } from "@/components/dashboard";
import { secondaryButtonClass } from "@/components/form-feedback";
import { LoadingBlock, PageShell } from "@/components/page-shell";
import {
  ProviderApplicationForm,
  SubmitForReviewForm,
} from "@/features/providers/components/provider-forms";
import { formatPriceFrom } from "@/lib/format";
import { requireAccountForPage } from "@/server/auth/session";
import { getMyBusiness, getPartnerOverview } from "@/server/providers/partner";
import { canSubmitForReview, PROVIDER_STATUS_LABELS } from "@/server/providers/status";

function Apply() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6">
        <h2 className="text-lg font-semibold text-fg">Apply to become a partner</h2>
        <p className="text-sm text-muted">
          Tell us about your business. Our team reviews every application before anything you
          publish becomes visible to travellers.
        </p>
        <ProviderApplicationForm />
      </section>
      <aside className="flex flex-col gap-4 rounded-2xl border border-accent/20 bg-accent-soft p-6">
        <h2 className="font-semibold text-accent-soft-fg">How partnering works</h2>
        <ol className="flex flex-col gap-3 text-sm text-fg-soft">
          {[
            ["Apply", "Save your business details as a draft, then submit for review."],
            ["Get verified", "Our team checks your details and verifies your business."],
            ["Publish", "Add listings and open dates. Travellers request; you confirm."],
          ].map(([title, body], i) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-on-accent">
                {i + 1}
              </span>
              <span>
                <span className="font-semibold text-fg">{title}.</span> {body}
              </span>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

function deadlineHint(iso: string | null, now: Date): string | undefined {
  if (!iso) return undefined;
  const hours = Math.max(0, Math.round((new Date(iso).getTime() - now.getTime()) / 3_600_000));
  return hours < 1 ? "Next deadline: under an hour" : `Next deadline: in ${hours} h`;
}

async function Overview() {
  await requireAccountForPage("/provider", ["partner"]);
  await connection();
  const business = await getMyBusiness();
  if (!business) return <Apply />;

  const now = new Date();
  const overview = await getPartnerOverview(business.id, now);
  const verified = business.status === "verified";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <p className="text-xl font-semibold text-fg">{business.displayName}</p>
        <p data-testid="provider-status" className="text-sm text-muted">
          Status:{" "}
          <span className="font-medium text-fg">{PROVIDER_STATUS_LABELS[business.status]}</span>
        </p>
        {business.latestReviewNote &&
        (business.status === "rejected" || business.status === "suspended") ? (
          <p className="text-sm text-warning-soft-fg">Reviewer note: {business.latestReviewNote}</p>
        ) : null}
        {business.status === "suspended" ? (
          <p className="text-sm text-muted">
            Your listings are hidden from travellers while your business is suspended.
          </p>
        ) : null}
      </div>

      <StatGrid>
        <StatCard
          label="Needs response"
          value={overview.needsResponse}
          hint={deadlineHint(overview.soonestDeadline, now) ?? "No requests waiting"}
          href="/provider/bookings?view=needs-response"
          tone={overview.needsResponse > 0 ? "attention" : "default"}
        />
        <StatCard
          label="Upcoming bookings"
          value={overview.upcomingConfirmed}
          hint="Confirmed, next 30 days"
          href="/provider/bookings?view=upcoming"
        />
        <StatCard
          label="Confirmed this month"
          value={formatPriceFrom(overview.revenueThisMonthMinor) ?? "₹0"}
          hint="Totals you confirmed; no payment is taken"
        />
        <StatCard
          label="Live listings"
          value={overview.liveListings}
          hint={`${overview.draftListings} draft · ${overview.openDates} open dates`}
          href="/provider/listings"
        />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Panel title="Getting set up">
          <Checklist
            steps={[
              { label: "Create your business profile", done: true },
              {
                label: "Submit your application",
                done: business.status !== "draft",
                href: "/provider/business",
                detail: canSubmitForReview(business.status)
                  ? "Review your details, then submit them to Himverse."
                  : undefined,
              },
              {
                label: "Get verified by Himverse",
                done: verified,
                detail:
                  business.status === "pending_review"
                    ? "We're reviewing your application."
                    : undefined,
              },
              {
                label: "Publish your first listing",
                done: overview.liveListings > 0,
                href: "/provider/listings",
              },
              {
                label: "Open dates or accept requests for any date",
                done: overview.openDates > 0 || overview.liveListings > 0,
                href: "/provider/listings",
              },
            ]}
          />
          {canSubmitForReview(business.status) ? (
            <SubmitForReviewForm providerId={business.id} />
          ) : null}
        </Panel>
        <Panel title="Quick actions">
          <div className="flex flex-col gap-2">
            <Link href="/provider/listings" className={secondaryButtonClass}>
              Add or edit listings
            </Link>
            <Link href="/provider/bookings" className={secondaryButtonClass}>
              Booking requests
            </Link>
            <Link href="/provider/business" className={secondaryButtonClass}>
              Business profile
            </Link>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export default function ProviderPage() {
  return (
    <PageShell
      title="Partner dashboard"
      description="Requests, listings and your business at a glance."
    >
      <Suspense fallback={<LoadingBlock label="Loading your dashboard…" variant="cards" />}>
        <Overview />
      </Suspense>
    </PageShell>
  );
}
