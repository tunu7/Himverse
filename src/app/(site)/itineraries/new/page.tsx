import { Suspense } from "react";

import { LoadingBlock, PageShell } from "@/components/page-shell";
import { PreferencesForm } from "@/features/itineraries/components/preferences-form";
import { getAiEnv } from "@/lib/env.server";
import { requireAccountForPage } from "@/server/auth/session";
import { listPublicDistricts, listPublishedDestinations } from "@/server/catalog/catalog";
import { todayInTripZone } from "@/server/itineraries/preferences";

async function NewItinerary() {
  await requireAccountForPage("/itineraries/new", ["traveller"]);
  if (getAiEnv().AI_ITINERARY_ENABLED !== "true") {
    return (
      <p
        role="status"
        className="rounded-2xl border border-warning-line bg-warning-soft p-4 text-warning-soft-fg"
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
    <PageShell
      title="Plan a trip"
      width="narrow"
      description="Answer a few questions and our AI planner drafts a day-by-day trip using only real experiences from verified local providers. You can refine it afterwards. Nothing is booked until you request it."
    >
      <Suspense fallback={<LoadingBlock label="Loading…" variant="form" />}>
        <NewItinerary />
      </Suspense>
    </PageShell>
  );
}
