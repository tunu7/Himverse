import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LoadingBlock } from "@/components/page-shell";
import {
  DeleteItineraryButton,
  MakeCurrentButton,
  RefineForm,
  RegenerateButton,
} from "@/features/itineraries/components/itinerary-controls";
import { ItineraryPlan } from "@/features/itineraries/components/itinerary-view";
import { requireUserForPage } from "@/server/auth/session";
import { getMyItinerary } from "@/server/itineraries/repository";

async function ItineraryDetail({ params, searchParams }: PageProps<"/itineraries/[id]">) {
  const { id } = await params;
  await requireUserForPage(`/itineraries/${id}`);
  const raw = (await searchParams).version;
  const requested = typeof raw === "string" && /^\d{1,4}$/.test(raw) ? Number(raw) : undefined;
  // RLS returns nothing for someone else's itinerary: same not-found as a missing one.
  const itinerary = await getMyItinerary(id, requested);
  if (!itinerary) {
    notFound();
  }
  const { version } = itinerary;
  const isCurrent = version.number === itinerary.currentVersionNumber;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/itineraries" className="underline">
            Your trips
          </Link>
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {itinerary.title}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400" data-testid="version-label">
          Version {version.number}
          {isCurrent ? " (current)" : " (not current)"} · {version.kind}
        </p>
        {!isCurrent ? (
          <MakeCurrentButton itineraryId={itinerary.id} version={version.number} />
        ) : null}
      </header>

      <ItineraryPlan itinerary={itinerary} />

      <section className="flex flex-col gap-3" aria-labelledby="refine-heading">
        <h2 id="refine-heading" className="text-lg font-semibold">
          Refine
        </h2>
        <RefineForm itineraryId={itinerary.id} />
        <div className="flex flex-wrap gap-3">
          <RegenerateButton itineraryId={itinerary.id} />
          <DeleteItineraryButton itineraryId={itinerary.id} />
        </div>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="versions-heading">
        <h2 id="versions-heading" className="text-lg font-semibold">
          Versions
        </h2>
        <ul className="flex flex-col gap-1 text-sm">
          {itinerary.versions.map((v) => (
            <li key={v.number}>
              <Link href={`/itineraries/${itinerary.id}?version=${v.number}`} className="underline">
                Version {v.number}
              </Link>{" "}
              · {v.kind}
              {v.number === itinerary.currentVersionNumber ? " · current" : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function ItineraryPage(props: PageProps<"/itineraries/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <Suspense fallback={<LoadingBlock label="Loading itinerary…" />}>
        <ItineraryDetail {...props} />
      </Suspense>
    </main>
  );
}
