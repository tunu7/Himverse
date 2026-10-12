import { Suspense } from "react";

import { LoadingBlock, PageShell } from "@/components/page-shell";
import {
  ExperienceStatusForm,
  NewExperienceForm,
  ProviderApplicationForm,
  SubmitForReviewForm,
} from "@/features/providers/components/provider-forms";
import { formatDuration, formatPriceFrom } from "@/lib/format";
import { requireUserForPage } from "@/server/auth/session";
import { listPublishedDestinations } from "@/server/catalog/catalog";
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
        <p className="text-zinc-600 dark:text-zinc-400">
          Offer experiences on Himverse.AI. Applications are reviewed by our team before anything
          you publish becomes visible to travelers.
        </p>
        <ProviderApplicationForm />
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {providers.map((p) => (
        <ProviderSection key={p.id} provider={p} destinations={destinations} />
      ))}
    </div>
  );
}

function ProviderSection({
  provider,
  destinations,
}: {
  provider: MyProvider;
  destinations: Awaited<ReturnType<typeof listPublishedDestinations>>;
}) {
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
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Reviewer note: {provider.latestReviewNote}
          </p>
        ) : null}
        {provider.status === "suspended" ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
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
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No experiences yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {provider.experiences.map((e) => {
              const price = formatPriceFrom(e.priceFromMinor);
              return (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
                >
                  <div>
                    <p className="font-medium">{e.title}</p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {e.status} · {e.destinationName ?? "destination not published"} ·{" "}
                      {formatDuration(e.durationMinutes)}
                      {price ? ` · from ${price}` : null}
                    </p>
                    {e.moderationLocked ? (
                      <p className="text-sm text-amber-800 dark:text-amber-300">
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
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            You can prepare drafts now; publishing is available once your provider is verified.
          </p>
        ) : null}
      </div>

      <details className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
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
      <Suspense fallback={<LoadingBlock label="Loading your provider workspace…" />}>
        <ProviderWorkspace />
      </Suspense>
    </PageShell>
  );
}
