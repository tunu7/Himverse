import { Suspense } from "react";

import { LoadingBlock, PageShell } from "@/components/page-shell";
import { PreferencesForm } from "@/features/itineraries/components/preferences-form";
import { getAiEnv } from "@/lib/env.server";
import { requireUserForPage } from "@/server/auth/session";
import { listPublicDistricts, listPublishedDestinations } from "@/server/catalog/catalog";
import { todayInTripZone } from "@/server/itineraries/preferences";

async function NewItinerary() {
  await requireUserForPage("/itineraries/new");
  if (getAiEnv().AI_ITINERARY_ENABLED !== "true") {
    return (
      <p
        role="status"
        className="rounded-md bg-amber-50 p-3 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
      >
        Trip planning is temporarily unavailable. Your saved trips are still available under Trips.
      </p>
    );
  }
  const [districts, destinations] = await Promise.all([
    listPublicDistricts(),
    listPublishedDestinations(),
  ]);
  return (
    <PreferencesForm
      districts={districts}
      destinations={destinations.map((d) => ({ slug: d.slug, name: d.name }))}
      minDate={todayInTripZone(new Date())}
    />
  );
}

export default function NewItineraryPage() {
  return (
    <PageShell title="Plan a trip">
      <p className="text-zinc-600 dark:text-zinc-400">
        Our AI planner builds a day-by-day suggestion using only published experiences from verified
        providers.
      </p>
      <Suspense fallback={<LoadingBlock label="Loading…" />}>
        <NewItinerary />
      </Suspense>
    </PageShell>
  );
}
