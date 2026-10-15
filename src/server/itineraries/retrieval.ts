import "server-only";

import { createSupabasePublicClient } from "@/lib/supabase/public";
import { toAppError } from "@/lib/supabase/errors";
import { type TripPreferences, travelerCount } from "@/server/itineraries/preferences";
import type { Candidates } from "@/server/itineraries/schemas";

/**
 * Deterministic retrieval of eligible inventory. Uses the anonymous client, so
 * only publicly visible experiences (published, verified provider, published
 * destination) can ever be candidates, and only those whose provider accepts
 * booking requests at planning time (ADR-0004 amendment). Bounded to keep prompts small.
 */
export const MAX_CANDIDATE_EXPERIENCES = 40;
export const MAX_CANDIDATE_DESTINATIONS = 10;

const COLUMNS =
  "id, slug, title, summary, category, duration_minutes, price_from_minor, destination_id, destination:destinations!experiences_destination_id_fkey!inner(id, slug, name, district)";

export async function retrieveCandidates(prefs: TripPreferences): Promise<Candidates> {
  const first = await query(prefs, prefs.interests);
  // Too few interest matches to fill the trip: widen to every category in the area.
  const widened = prefs.interests.length > 0 && first.length < prefs.durationDays;
  const rows = widened ? await query(prefs, []) : first;

  const destinations = new Map<string, Candidates["destinations"][number]>();
  const experiences: Candidates["experiences"] = [];
  for (const row of rows) {
    if (!destinations.has(row.destination.id)) {
      if (destinations.size >= MAX_CANDIDATE_DESTINATIONS) continue;
      destinations.set(row.destination.id, row.destination);
    }
    experiences.push({
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary.slice(0, 200),
      category: row.category,
      durationMinutes: row.duration_minutes,
      priceFromMinor: row.price_from_minor,
      destinationId: row.destination_id,
    });
  }
  return { experiences, destinations: [...destinations.values()], widened };
}

async function query(prefs: TripPreferences, categories: TripPreferences["interests"]) {
  const supabase = createSupabasePublicClient();
  let q = supabase
    .from("experiences")
    .select(COLUMNS)
    .eq("accepts_bookings", true)
    // Day plans use experiences; stays and transport join in Phase 3b (ADR-0008).
    .eq("listing_type", "experience")
    // Must fit inside the trip.
    .lte("duration_minutes", prefs.durationDays * 1440);
  if (prefs.destinationSlug) {
    q = q.eq("destination.slug", prefs.destinationSlug);
  } else if (prefs.district) {
    q = q.eq("destination.district", prefs.district);
  }
  if (categories.length > 0) {
    q = q.in("category", categories);
  }
  if (prefs.budgetMaxMinor !== undefined) {
    // An experience that alone exceeds the whole budget can never fit. Unpriced
    // experiences stay eligible and are flagged as "price on request".
    const perPersonCeiling = Math.floor(prefs.budgetMaxMinor / travelerCount(prefs));
    q = q.or(`price_from_minor.is.null,price_from_minor.lte.${perPersonCeiling}`);
  }
  const { data, error } = await q
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(MAX_CANDIDATE_EXPERIENCES);
  if (error) {
    throw toAppError(error, "Could not load experiences for your trip.");
  }
  return data;
}
