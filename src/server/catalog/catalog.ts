import "server-only";

import { createSupabasePublicClient } from "@/lib/supabase/public";
import { toAppError } from "@/lib/supabase/errors";
import type { Database } from "@/types/database";

export type ExperienceCategory = Database["public"]["Enums"]["experience_category"];

export type PublicExperience = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: ExperienceCategory;
  durationMinutes: number;
  priceFromMinor: number | null;
  currency: string;
  destination: { name: string; district: string };
  provider: { displayName: string };
};

export type PublicDestination = { id: string; slug: string; name: string; district: string };

/**
 * Publicly visible experiences. Uses the anonymous client so RLS alone decides
 * visibility (published + verified provider + published destination); no
 * application-side filter can widen it.
 */
export async function listPublicExperiences(): Promise<PublicExperience[]> {
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("experiences")
    .select(
      "id, slug, title, summary, category, duration_minutes, price_from_minor, currency, destination:destinations(name, district), provider:providers(display_name)",
    )
    .order("title")
    .limit(100);
  if (error) {
    throw toAppError(error, "Could not load experiences.");
  }
  return data.flatMap((row) =>
    // Embedded rows are filtered by RLS too; skip anything not fully visible.
    row.destination && row.provider
      ? [
          {
            id: row.id,
            slug: row.slug,
            title: row.title,
            summary: row.summary,
            category: row.category,
            durationMinutes: row.duration_minutes,
            priceFromMinor: row.price_from_minor,
            currency: row.currency,
            destination: { name: row.destination.name, district: row.destination.district },
            provider: { displayName: row.provider.display_name },
          },
        ]
      : [],
  );
}

export async function listPublishedDestinations(): Promise<PublicDestination[]> {
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("destinations")
    .select("id, slug, name, district")
    .order("name");
  if (error) {
    throw toAppError(error, "Could not load destinations.");
  }
  return data;
}
