import Link from "next/link";

import { buttonClass, inputClass } from "@/components/form-feedback";
import { formatCategory } from "@/lib/format";
import {
  BUDGETS,
  type DestinationFilters,
  DURATIONS,
  EXPERIENCE_CATEGORIES,
  EXPERIENCE_SORTS,
  type ExperienceFilters,
} from "@/server/catalog/search-options";

// Plain GET forms: work without JavaScript and every state is a shareable URL.

function Select({
  label,
  name,
  value,
  options,
  anyLabel,
}: {
  label: string;
  name: string;
  value: string | undefined;
  options: readonly (readonly [string, string])[];
  anyLabel?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      <select name={name} defaultValue={value ?? ""} className={inputClass}>
        {anyLabel ? <option value="">{anyLabel}</option> : null}
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ExperienceFiltersForm({
  filters,
  districts,
}: {
  filters: ExperienceFilters;
  districts: readonly string[];
}) {
  return (
    <form
      action="/experiences"
      method="get"
      role="search"
      aria-label="Search and filter experiences"
      className="grid gap-4 rounded-lg border border-zinc-200 p-4 sm:grid-cols-2 lg:grid-cols-3 dark:border-zinc-800"
    >
      <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
        <span className="text-sm font-medium">Search experiences</span>
        <input
          type="search"
          name="q"
          defaultValue={filters.q ?? ""}
          maxLength={100}
          placeholder="e.g. monastery, rafting, birding"
          className={inputClass}
        />
      </label>
      <Select
        label="Region (district)"
        name="district"
        value={filters.district}
        anyLabel="All regions"
        options={districts.map((d) => [d, d] as const)}
      />
      <Select
        label="Category"
        name="category"
        value={filters.category}
        anyLabel="All categories"
        options={EXPERIENCE_CATEGORIES.map((c) => [c, formatCategory(c)] as const)}
      />
      <Select
        label="Budget (indicative, per experience)"
        name="budget"
        value={filters.budget}
        anyLabel="Any budget"
        options={Object.entries(BUDGETS).map(([key, b]) => [key, b.label] as const)}
      />
      <Select
        label="Duration"
        name="duration"
        value={filters.duration}
        anyLabel="Any duration"
        options={Object.entries(DURATIONS).map(([key, d]) => [key, d.label] as const)}
      />
      <Select
        label="Sort by"
        name="sort"
        value={filters.sort}
        options={Object.entries(EXPERIENCE_SORTS)}
      />
      <div className="flex items-end gap-3">
        <button type="submit" className={buttonClass}>
          Apply
        </button>
        <Link href="/experiences" className="py-2 text-sm underline">
          Reset
        </Link>
      </div>
    </form>
  );
}

export function DestinationFiltersForm({
  filters,
  districts,
}: {
  filters: DestinationFilters;
  districts: readonly string[];
}) {
  return (
    <form
      action="/destinations"
      method="get"
      role="search"
      aria-label="Search destinations"
      className="grid gap-4 rounded-lg border border-zinc-200 p-4 sm:grid-cols-[2fr_1fr_auto] dark:border-zinc-800"
    >
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Search destinations</span>
        <input
          type="search"
          name="q"
          defaultValue={filters.q ?? ""}
          maxLength={100}
          placeholder="e.g. monastery, valley, river"
          className={inputClass}
        />
      </label>
      <Select
        label="Region (district)"
        name="district"
        value={filters.district}
        anyLabel="All regions"
        options={districts.map((d) => [d, d] as const)}
      />
      <div className="flex items-end gap-3">
        <button type="submit" className={buttonClass}>
          Search
        </button>
        <Link href="/destinations" className="py-2 text-sm underline">
          Reset
        </Link>
      </div>
    </form>
  );
}
