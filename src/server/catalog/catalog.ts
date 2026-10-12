import "server-only";

import { createSupabasePublicClient } from "@/lib/supabase/public";
import { toAppError } from "@/lib/supabase/errors";
import {
  BUDGETS,
  type DestinationFilters,
  DURATIONS,
  type ExperienceCategory,
  type ExperienceFilters,
  PAGE_SIZE,
  pageCountFor,
} from "@/server/catalog/search-options";

// Every read here uses the anonymous, cookie-less client: RLS alone decides
// visibility (published experience + verified provider + published
// destination; published destinations), so no application filter can widen it.
// Inner joins additionally drop rows whose embedded parent is not visible.

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type ExperienceSummary = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: ExperienceCategory;
  durationMinutes: number;
  priceFromMinor: number | null;
  currency: string;
  destination: { slug: string; name: string; district: string };
  provider: { displayName: string };
};

export type ExperienceDetail = ExperienceSummary & {
  description: string;
  provider: { displayName: string; district: string | null };
};

export type DestinationSummary = {
  id: string;
  slug: string;
  name: string;
  district: string;
  summary: string;
  experienceCount: number;
};

export type DestinationDetail = Omit<DestinationSummary, "experienceCount"> & {
  description: string;
  experiences: ExperienceSummary[];
};

export type PublicDestination = { id: string; slug: string; name: string; district: string };

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageCount: number;
  /** True when the requested page lies beyond the last page of results. */
  outOfRange: boolean;
};

const EXPERIENCE_SUMMARY_COLUMNS =
  "id, slug, title, summary, category, duration_minutes, price_from_minor, currency, destination:destinations!inner(slug, name, district), provider:providers!inner(display_name)";

type ExperienceSummaryRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: ExperienceCategory;
  duration_minutes: number;
  price_from_minor: number | null;
  currency: string;
  destination: { slug: string; name: string; district: string };
  provider: { display_name: string };
};

function toExperienceSummary(row: ExperienceSummaryRow): ExperienceSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    category: row.category,
    durationMinutes: row.duration_minutes,
    priceFromMinor: row.price_from_minor,
    currency: row.currency,
    destination: row.destination,
    provider: { displayName: row.provider.display_name },
  };
}

function rangeFor(page: number): [number, number] {
  const from = (page - 1) * PAGE_SIZE;
  return [from, from + PAGE_SIZE - 1];
}

// PostgREST answers PGRST103 when the requested range starts past the last row.
const RANGE_NOT_SATISFIABLE = "PGRST103";

/** Searches public experiences with validated filters (see search-options.ts). */
export async function searchExperiences(
  filters: ExperienceFilters,
): Promise<Page<ExperienceSummary>> {
  const supabase = createSupabasePublicClient();

  const build = () => {
    let query = supabase.from("experiences").select(EXPERIENCE_SUMMARY_COLUMNS, { count: "exact" });
    if (filters.q) {
      // Bound parameter (websearch_to_tsquery); never PostgREST filter syntax.
      query = query.textSearch("search_vector", filters.q, {
        type: "websearch",
        config: "english",
      });
    }
    if (filters.district) {
      query = query.eq("destination.district", filters.district);
    }
    if (filters.category) {
      query = query.eq("category", filters.category);
    }
    if (filters.budget) {
      const budget: { min?: number; max?: number } = BUDGETS[filters.budget];
      if (budget.min !== undefined) query = query.gte("price_from_minor", budget.min);
      if (budget.max !== undefined) query = query.lt("price_from_minor", budget.max);
    }
    if (filters.duration) {
      const duration: { min?: number; max?: number } = DURATIONS[filters.duration];
      if (duration.min !== undefined) query = query.gte("duration_minutes", duration.min);
      if (duration.max !== undefined) query = query.lt("duration_minutes", duration.max);
    }
    switch (filters.sort) {
      case "price-asc":
        query = query.order("price_from_minor", { ascending: true, nullsFirst: false });
        break;
      case "price-desc":
        query = query.order("price_from_minor", { ascending: false, nullsFirst: false });
        break;
      case "duration":
        query = query.order("duration_minutes", { ascending: true });
        break;
      case "title":
        query = query.order("title", { ascending: true });
        break;
      case "newest":
        query = query.order("published_at", { ascending: false, nullsFirst: false });
        break;
    }
    // Unique tie-breaker so pagination is stable.
    return query.order("id", { ascending: true });
  };

  const [from, to] = rangeFor(filters.page);
  const { data, error, count } = await build().range(from, to);

  if (error?.code === RANGE_NOT_SATISFIABLE) {
    const { count: total, error: countError } = await build().range(0, 0);
    if (countError) throw toAppError(countError, "Could not load experiences.");
    return {
      items: [],
      total: total ?? 0,
      page: filters.page,
      pageCount: pageCountFor(total ?? 0),
      outOfRange: true,
    };
  }
  if (error) {
    throw toAppError(error, "Could not load experiences.");
  }

  const total = count ?? 0;
  return {
    items: data.map(toExperienceSummary),
    total,
    page: filters.page,
    pageCount: pageCountFor(total),
    outOfRange: data.length === 0 && total > 0,
  };
}

/** A public experience by slug, or null if it doesn't exist or isn't public. */
export async function getPublicExperience(slug: string): Promise<ExperienceDetail | null> {
  if (!SLUG.test(slug) || slug.length > 80) {
    return null;
  }
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("experiences")
    .select(
      "id, slug, title, summary, description, category, duration_minutes, price_from_minor, currency, destination:destinations!inner(slug, name, district), provider:providers!inner(display_name, district)",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    throw toAppError(error, "Could not load this experience.");
  }
  if (!data) {
    return null;
  }
  return {
    ...toExperienceSummary(data),
    description: data.description,
    provider: { displayName: data.provider.display_name, district: data.provider.district },
  };
}

/** Searches published destinations, with each one's count of public experiences. */
export async function searchDestinations(
  filters: DestinationFilters,
): Promise<Page<DestinationSummary>> {
  const supabase = createSupabasePublicClient();

  const build = () => {
    let query = supabase
      .from("destinations")
      .select("id, slug, name, district, summary", { count: "exact" });
    if (filters.q) {
      query = query.textSearch("search_vector", filters.q, {
        type: "websearch",
        config: "english",
      });
    }
    if (filters.district) {
      query = query.eq("district", filters.district);
    }
    return query.order("name", { ascending: true }).order("id", { ascending: true });
  };

  const [from, to] = rangeFor(filters.page);
  const { data, error, count } = await build().range(from, to);

  if (error?.code === RANGE_NOT_SATISFIABLE) {
    const { count: total, error: countError } = await build().range(0, 0);
    if (countError) throw toAppError(countError, "Could not load destinations.");
    return {
      items: [],
      total: total ?? 0,
      page: filters.page,
      pageCount: pageCountFor(total ?? 0),
      outOfRange: true,
    };
  }
  if (error) {
    throw toAppError(error, "Could not load destinations.");
  }

  const counts = await countPublicExperiences(data.map((d) => d.id));
  const total = count ?? 0;
  return {
    items: data.map((d) => ({
      id: d.id,
      slug: d.slug,
      name: d.name,
      district: d.district,
      summary: d.summary,
      experienceCount: counts.get(d.id) ?? 0,
    })),
    total,
    page: filters.page,
    pageCount: pageCountFor(total),
    outOfRange: data.length === 0 && total > 0,
  };
}

// PostgREST's embedded `experiences(count)` reads whole rows, which needs the
// table-level SELECT that security hardening (L2) deliberately removed. Fetch only
// destination ids instead and tally them; this still runs under anon RLS, so
// hidden experiences are never counted. Bounded: at most PAGE_SIZE destinations.
const MAX_COUNTED_EXPERIENCES = 5000;

async function countPublicExperiences(destinationIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (destinationIds.length === 0) {
    return counts;
  }
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("experiences")
    .select("destination_id")
    .in("destination_id", destinationIds)
    .limit(MAX_COUNTED_EXPERIENCES);
  if (error) {
    throw toAppError(error, "Could not load destinations.");
  }
  for (const row of data) {
    counts.set(row.destination_id, (counts.get(row.destination_id) ?? 0) + 1);
  }
  return counts;
}

/** A published destination by slug with its public experiences, or null. */
export async function getPublicDestination(slug: string): Promise<DestinationDetail | null> {
  if (!SLUG.test(slug) || slug.length > 60) {
    return null;
  }
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("destinations")
    .select("id, slug, name, district, summary, description")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    throw toAppError(error, "Could not load this destination.");
  }
  if (!data) {
    return null;
  }

  const { data: experiences, error: experiencesError } = await supabase
    .from("experiences")
    .select(EXPERIENCE_SUMMARY_COLUMNS)
    .eq("destination_id", data.id)
    .order("title", { ascending: true })
    .order("id", { ascending: true })
    .limit(50);
  if (experiencesError) {
    throw toAppError(experiencesError, "Could not load this destination.");
  }

  return {
    ...data,
    experiences: experiences.map(toExperienceSummary),
  };
}

/** Districts that have at least one published destination, for the region filter. */
export async function listPublicDistricts(): Promise<string[]> {
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase.from("destinations").select("district").limit(500);
  if (error) {
    throw toAppError(error, "Could not load regions.");
  }
  return [...new Set(data.map((d) => d.district))].sort((a, b) => a.localeCompare(b));
}

/** Published destinations for the provider experience form. */
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
