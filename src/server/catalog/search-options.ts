/**
 * Shared catalogue vocabulary for discovery and provider forms: categories,
 * budget/duration buckets, sort keys and result limits. Pure and free of
 * `server-only` so client forms can import it; it holds no data access.
 */
import type { Database } from "@/types/database";

export type ExperienceCategory = Database["public"]["Enums"]["experience_category"];

export const EXPERIENCE_CATEGORIES = [
  "culture",
  "nature",
  "adventure",
  "trekking",
  "wildlife",
  "food_and_drink",
  "festivals",
  "wellness",
  "other",
] as const satisfies readonly ExperienceCategory[];

// Compile-time guard: fails if the database enum gains a value not listed above.
type MissingCategory = Exclude<ExperienceCategory, (typeof EXPERIENCE_CATEGORIES)[number]>;
const _allCategoriesListed: MissingCategory extends never ? true : never = true;
void _allCategoriesListed;

export const PAGE_SIZE = 12;
export const MAX_PAGE = 50;
export const QUERY_MAX_LENGTH = 100;

// Amounts in paise; `min` inclusive, `max` exclusive. Unpriced experiences never
// match a budget filter.
export const BUDGETS = {
  "under-1000": { label: "Under ₹1,000", max: 100_000 },
  "1000-3000": { label: "₹1,000 – ₹3,000", min: 100_000, max: 300_000 },
  "3000-10000": { label: "₹3,000 – ₹10,000", min: 300_000, max: 1_000_000 },
  "10000-plus": { label: "₹10,000 and above", min: 1_000_000 },
} as const satisfies Record<string, Range>;

// Minutes; `min` inclusive, `max` exclusive.
export const DURATIONS = {
  "under-3h": { label: "Under 3 hours", max: 180 },
  "half-day": { label: "Half day (3–6 h)", min: 180, max: 360 },
  "full-day": { label: "Full day (6–24 h)", min: 360, max: 1440 },
  "multi-day": { label: "Multi-day", min: 1440 },
} as const satisfies Record<string, Range>;

export const EXPERIENCE_SORTS = {
  newest: "Newest",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  duration: "Shortest first",
  title: "Title A–Z",
} as const;

type Range = { label: string; min?: number; max?: number };

export type BudgetKey = keyof typeof BUDGETS;
export type DurationKey = keyof typeof DURATIONS;
export type ExperienceSort = keyof typeof EXPERIENCE_SORTS;

export type ExperienceFilters = {
  q?: string | undefined;
  district?: string | undefined;
  category?: ExperienceCategory | undefined;
  budget?: BudgetKey | undefined;
  duration?: DurationKey | undefined;
  sort: ExperienceSort;
  page: number;
};

export type DestinationFilters = {
  q?: string | undefined;
  district?: string | undefined;
  page: number;
};

/** Number of pages for `total` results, never more than MAX_PAGE. */
export function pageCountFor(total: number): number {
  return Math.min(MAX_PAGE, Math.max(1, Math.ceil(total / PAGE_SIZE)));
}
