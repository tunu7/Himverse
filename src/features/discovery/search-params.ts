import { z } from "zod";

import {
  BUDGETS,
  type BudgetKey,
  type DestinationFilters,
  DURATIONS,
  type DurationKey,
  EXPERIENCE_CATEGORIES,
  EXPERIENCE_SORTS,
  type ExperienceFilters,
  type ExperienceSort,
  MAX_PAGE,
  QUERY_MAX_LENGTH,
} from "@/lib/catalog-options";

/**
 * URL search-parameter contract for /experiences and /destinations.
 *
 * Every parameter is parsed independently: an invalid value is dropped (and
 * reported in `ignored`) instead of failing the page, so a hand-edited or stale
 * link still shows useful results. Results stay bounded by PAGE_SIZE and
 * MAX_PAGE (src/server/catalog/search-options.ts).
 */

export type RawSearchParams = Record<string, string | string[] | undefined>;

const querySchema = z
  .string()
  .transform((v) => v.replace(/\s+/g, " ").trim().slice(0, QUERY_MAX_LENGTH))
  .pipe(z.string().min(1));
const districtSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z][A-Za-z .'-]{1,79}$/);
const categorySchema = z.enum(EXPERIENCE_CATEGORIES);
const budgetSchema = z.enum(Object.keys(BUDGETS) as [BudgetKey, ...BudgetKey[]]);
const durationSchema = z.enum(Object.keys(DURATIONS) as [DurationKey, ...DurationKey[]]);
const sortSchema = z.enum(Object.keys(EXPERIENCE_SORTS) as [ExperienceSort, ...ExperienceSort[]]);
const pageSchema = z
  .string()
  .regex(/^\d{1,6}$/)
  .transform(Number)
  .pipe(z.number().int().min(1))
  .transform((n) => Math.min(n, MAX_PAGE));

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function field<T>(
  raw: RawSearchParams,
  name: string,
  schema: z.ZodType<T>,
  ignored: string[],
): T | undefined {
  const value = first(raw[name]);
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    ignored.push(name);
    return undefined;
  }
  return result.data;
}

export function parseExperienceSearchParams(raw: RawSearchParams): {
  filters: ExperienceFilters;
  ignored: string[];
} {
  const ignored: string[] = [];
  const filters: ExperienceFilters = {
    q: field(raw, "q", querySchema, ignored),
    district: field(raw, "district", districtSchema, ignored),
    category: field(raw, "category", categorySchema, ignored),
    budget: field(raw, "budget", budgetSchema, ignored),
    duration: field(raw, "duration", durationSchema, ignored),
    sort: field(raw, "sort", sortSchema, ignored) ?? "newest",
    page: field(raw, "page", pageSchema, ignored) ?? 1,
  };
  return { filters, ignored };
}

export function parseDestinationSearchParams(raw: RawSearchParams): {
  filters: DestinationFilters;
  ignored: string[];
} {
  const ignored: string[] = [];
  const filters: DestinationFilters = {
    q: field(raw, "q", querySchema, ignored),
    district: field(raw, "district", districtSchema, ignored),
    page: field(raw, "page", pageSchema, ignored) ?? 1,
  };
  return { filters, ignored };
}

function toQueryString(entries: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Canonical, shareable URL for an experience search. Defaults are omitted. */
export function experiencesHref(
  filters: ExperienceFilters,
  overrides: Partial<ExperienceFilters> = {},
  basePath = "/experiences",
): string {
  const f = { ...filters, ...overrides };
  return `${basePath}${toQueryString({
    q: f.q,
    district: f.district,
    category: f.category,
    budget: f.budget,
    duration: f.duration,
    sort: f.sort === "newest" ? undefined : f.sort,
    page: f.page > 1 ? f.page : undefined,
  })}`;
}

export function destinationsHref(
  filters: DestinationFilters,
  overrides: Partial<DestinationFilters> = {},
): string {
  const f = { ...filters, ...overrides };
  return `/destinations${toQueryString({
    q: f.q,
    district: f.district,
    page: f.page > 1 ? f.page : undefined,
  })}`;
}
