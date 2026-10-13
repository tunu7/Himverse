import Link from "next/link";
import { Suspense } from "react";

import { LoadingBlock, PageShell } from "@/components/page-shell";
import {
  ExperienceStatusForm,
  NewExperienceForm,
  ProviderApplicationForm,
  SubmitForReviewForm,
} from "@/features/providers/components/provider-forms";
import { AddSlotForm, SlotStatusButton } from "@/features/bookings/components/booking-forms";
import { formatDuration, formatPriceFrom, formatSlot } from "@/lib/format";
import { requireUserForPage } from "@/server/auth/session";
import { listSlotsForExperiences, type ProviderSlot } from "@/server/bookings/repository";
import { listPublishedDestinations } from "@/server/catalog/catalog";
import { todayInTripZone } from "@/server/itineraries/preferences";
import { listMyProviders, type MyProvider } from "@/server/providers/providers";
import { canSubmitForReview, PROVIDER_STATUS_LABELS } from "@/server/providers/status";

async function ProviderWorkspace() {
  await requireUserForPage("/provider");
  const [providers, destinations] = await Promise.all([
    listMyProviders(),
    listPublishedDestinations(),
  ]);

  if (providers.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        <p className="text-muted">
          Offer experiences on Himverse.AI. Applications are reviewed by our team before anything
          you publish becomes visible to travelers.
        </p>
        <ProviderApplicationForm />
      </section>
    );
  }

  const slots = await listSlotsForExperiences(
    providers.flatMap((p) => p.experiences.map((e) => e.id)),
  );
  const minDate = todayInTripZone(new Date());

  return (
    <div className="flex flex-col gap-10">
      <Link
        href="/provider/bookings"
        className="self-start font-medium text-accent underline-offset-4 hover:underline"
      >
        View booking requests
      </Link>
      {providers.map((p) => (
        <ProviderSection
          key={p.id}
          provider={p}
          destinations={destinations}
          slots={slots}
          minDate={minDate}
        />
      ))}
    </div>
  );
}

function ProviderSection({
  provider,
  destinations,
  slots,
  minDate,
}: {
  provider: MyProvider;
  destinations: Awaited<ReturnType<typeof listPublishedDestinations>>;
  slots: readonly ProviderSlot[];
  minDate: string;
}) {
  const bookable = provider.experiences.filter((e) => e.status !== "archived");
  const verified = provider.status === "verified";
  return (
    <section className="flex flex-col gap-4" aria-labelledby={`provider-${provider.id}`}>
      <div className="flex flex-col gap-1">
        <h2 id={`provider-${provider.id}`} className="text-xl font-semibold">
          {provider.displayName}
        </h2>
        <p data-testid="provider-status" className="text-sm">
          Status: <span className="font-medium">{PROVIDER_STATUS_LABELS[provider.status]}</span>
        </p>
        {provider.latestReviewNote &&
        (provider.status === "rejected" || provider.status === "suspended") ? (
          <p className="text-sm text-warning-soft-fg">Reviewer note: {provider.latestReviewNote}</p>
        ) : null}
        {provider.status === "suspended" ? (
          <p className="text-sm text-muted">
            Your experiences are hidden from travelers while the provider is suspended.
          </p>
        ) : null}
      </div>

      {canSubmitForReview(provider.status) ? (
        <SubmitForReviewForm providerId={provider.id} />
      ) : null}

      <div className="flex flex-col gap-3">
        <h3 className="font-semibold">Experiences</h3>
        {provider.experiences.length === 0 ? (
          <p className="text-sm text-muted">No experiences yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {provider.experiences.map((e) => {
              const price = formatPriceFrom(e.priceFromMinor);
              return (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface shadow-xs p-4"
                >
                  <div>
                    <p className="font-medium">{e.title}</p>
                    <p className="text-sm text-muted">
                      {e.status} · {e.destinationName ?? "destination not published"} ·{" "}
                      {formatDuration(e.durationMinutes)}
                      {price ? ` · from ${price}` : null}
                    </p>
                    {e.moderationLocked ? (
                      <p className="text-sm text-warning-soft-fg">
                        Unpublished by Himverse moderation. You can revise it as a draft; contact us
                        to have it published again.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    {e.status !== "published" &&
                    verified &&
                    e.destinationName &&
                    !e.moderationLocked ? (
                      <ExperienceStatusForm
                        experienceId={e.id}
                        status="published"
                        label="Publish"
                      />
                    ) : null}
                    {e.status === "published" ? (
                      <ExperienceStatusForm experienceId={e.id} status="draft" label="Unpublish" />
                    ) : null}
                    {e.status !== "archived" ? (
                      <ExperienceStatusForm experienceId={e.id} status="archived" label="Archive" />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {!verified ? (
          <p className="text-sm text-muted">
            You can prepare drafts now; publishing is available once your provider is verified.
          </p>
        ) : null}
      </div>

      {bookable.length > 0 ? (
        <section className="flex flex-col gap-3" aria-label="Dates for booking">
          <h3 className="font-semibold">Dates for booking</h3>
          {!verified ? (
            <p className="text-sm text-muted">
              Travellers can book dates once your provider is verified and the experience is
              published.
            </p>
          ) : null}
          {bookable.map((e) => {
            const experienceSlots = slots.filter((s) => s.experienceId === e.id);
            return (
              <div
                key={e.id}
                data-testid="slot-manager"
                className="flex flex-col gap-2 rounded-xl border border-line bg-surface shadow-xs p-4"
              >
                <p className="font-medium">{e.title}</p>
                {experienceSlots.length === 0 ? (
                  <p className="text-sm text-muted">No dates yet.</p>
                ) : (
                  <ul className="flex flex-col gap-1 text-sm">
                    {experienceSlots.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center gap-3">
                        <span>
                          {formatSlot(s.startsOn, s.startTime)} · {s.capacity - s.seatsLeft}/
                          {s.capacity} seats confirmed · {s.status}
                        </span>
                        <SlotStatusButton slotId={s.id} status={s.status} />
                      </li>
                    ))}
                  </ul>
                )}
                <AddSlotForm experienceId={e.id} minDate={minDate} />
              </div>
            );
          })}
        </section>
      ) : null}

      <details className="rounded-xl border border-line bg-surface shadow-xs p-5">
        <summary className="cursor-pointer font-medium">Add an experience</summary>
        <div className="pt-4">
          <NewExperienceForm providerId={provider.id} destinations={destinations} />
        </div>
      </details>
    </section>
  );
}

export default function ProviderPage() {
  return (
    <PageShell title="Provider workspace">
      <Suspense fallback={<LoadingBlock label="Loading your provider workspace…" variant="list" />}>
        <ProviderWorkspace />
      </Suspense>
    </PageShell>
  );
}
