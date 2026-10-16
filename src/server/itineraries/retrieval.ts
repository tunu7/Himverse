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
  const destinationIds = [...destinations.keys()];
  const [stays, transport, guides] = await Promise.all([
    prefs.includeStays ? queryStays(destinationIds, travelerCount(prefs)) : [],
    prefs.includeTransport ? queryTransport(destinationIds, travelerCount(prefs)) : [],
    prefs.includeGuide
      ? queryGuides(destinationIds, travelerCount(prefs), prefs.guideLanguage)
      : [],
  ]);
  return {
    experiences,
    destinations: [...destinations.values()],
    stays,
    transport,
    guides,
    widened,
  };
}

export const MAX_CANDIDATE_STAYS = 20;
export const MAX_CANDIDATE_TRANSPORT = 20;
export const MAX_CANDIDATE_GUIDES = 20;
/** Guides fetched before the language and group-size filters, so a match isn't cut off. */
const GUIDE_FETCH_LIMIT = 200;

/** Bookable stays at the candidate destinations with room for the whole group. */
async function queryStays(
  destinationIds: string[],
  travellers: number,
): Promise<Candidates["stays"]> {
  if (destinationIds.length === 0) return [];
  const { data, error } = await createSupabasePublicClient()
    .from("experiences")
    .select("id, title, destination_id, price_from_minor, max_guests, daily_capacity")
    .eq("listing_type", "stay")
    .eq("accepts_bookings", true)
    .in("destination_id", destinationIds)
    .order("price_from_minor", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(MAX_CANDIDATE_STAYS);
  if (error) throw toAppError(error, "Could not load stays for your trip.");
  return data.flatMap((s) =>
    s.max_guests && s.daily_capacity && s.max_guests * s.daily_capacity >= travellers
      ? [
          {
            id: s.id,
            title: s.title,
            destinationId: s.destination_id,
            priceFromMinor: s.price_from_minor,
            maxGuests: s.max_guests,
            dailyCapacity: s.daily_capacity,
          },
        ]
      : [],
  );
}

/** Vehicles between candidate destinations, or day hire at one, with seats for everyone. */
async function queryTransport(
  destinationIds: string[],
  travellers: number,
): Promise<Candidates["transport"]> {
  if (destinationIds.length === 0) return [];
  const { data, error } = await createSupabasePublicClient()
    .from("experiences")
    .select(
      "id, title, destination_id, route_to_destination_id, price_from_minor, max_guests, daily_capacity",
    )
    .eq("listing_type", "transport")
    .eq("accepts_bookings", true)
    .in("destination_id", destinationIds)
    .order("price_from_minor", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(MAX_CANDIDATE_TRANSPORT);
  if (error) throw toAppError(error, "Could not load transport for your trip.");
  return data.flatMap((t) =>
    t.max_guests &&
    t.daily_capacity &&
    t.max_guests * t.daily_capacity >= travellers &&
    (t.route_to_destination_id === null || destinationIds.includes(t.route_to_destination_id))
      ? [
          {
            id: t.id,
            title: t.title,
            destinationId: t.destination_id,
            routeToDestinationId: t.route_to_destination_id,
            priceFromMinor: t.price_from_minor,
            maxGuests: t.max_guests,
            dailyCapacity: t.daily_capacity,
          },
        ]
      : [],
  );
}

async function query(prefs: TripPreferences, categories: TripPreferences["interests"]) {
  const supabase = createSupabasePublicClient();
  let q = supabase
    .from("experiences")
    .select(COLUMNS)
    .eq("accepts_bookings", true)
    // Day plans use experiences; stays and transport are queried separately (ADR-0008).
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

/**
 * Bookable guides at the candidate destinations who can take the whole group,
 * speaking the requested language when one is given (case-insensitive).
 */
async function queryGuides(
  destinationIds: string[],
  travellers: number,
  language: string,
): Promise<Candidates["guides"]> {
  if (destinationIds.length === 0) return [];
  const { data, error } = await createSupabasePublicClient()
    .from("experiences")
    .select(
      "id, title, destination_id, price_from_minor, price_unit, languages, max_guests, daily_capacity",
    )
    .eq("listing_type", "guide")
    .eq("accepts_bookings", true)
    .in("destination_id", destinationIds)
    .order("price_from_minor", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(GUIDE_FETCH_LIMIT);
  if (error) throw toAppError(error, "Could not load guides for your trip.");
  const wanted = language.trim().toLowerCase();
  const guides = data.flatMap((g) =>
    g.max_guests &&
    g.daily_capacity &&
    g.max_guests * g.daily_capacity >= travellers &&
    (g.price_unit === "per_group_day" || g.price_unit === "per_person_day") &&
    (!wanted || g.languages.some((l) => l.toLowerCase() === wanted))
      ? [
          {
            id: g.id,
            title: g.title,
            destinationId: g.destination_id,
            priceFromMinor: g.price_from_minor,
            priceUnit: g.price_unit,
            languages: g.languages,
            maxGuests: g.max_guests,
            dailyCapacity: g.daily_capacity,
          },
        ]
      : [],
  );
  return guides.slice(0, MAX_CANDIDATE_GUIDES);
}
