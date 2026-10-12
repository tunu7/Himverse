import { describe, expect, it } from "vitest";

import {
  destinationsHref,
  experiencesHref,
  parseDestinationSearchParams,
  parseExperienceSearchParams,
} from "@/features/discovery/search-params";
import { MAX_PAGE, pageCountFor, QUERY_MAX_LENGTH } from "@/lib/catalog-options";

describe("parseExperienceSearchParams", () => {
  it("defaults to newest, page 1, no filters", () => {
    expect(parseExperienceSearchParams({})).toEqual({
      filters: { sort: "newest", page: 1 },
      ignored: [],
    });
  });

  it("accepts every valid filter together", () => {
    const { filters, ignored } = parseExperienceSearchParams({
      q: "  river   rafting ",
      district: "East Siang",
      category: "adventure",
      budget: "3000-10000",
      duration: "full-day",
      sort: "price-asc",
      page: "2",
    });
    expect(ignored).toEqual([]);
    expect(filters).toEqual({
      q: "river rafting",
      district: "East Siang",
      category: "adventure",
      budget: "3000-10000",
      duration: "full-day",
      sort: "price-asc",
      page: 2,
    });
  });

  it.each([
    ["category", "casino"],
    ["budget", "free"],
    ["duration", "forever"],
    ["sort", "random"],
    ["district", "<script>"],
    ["district", "1st district"],
    ["page", "abc"],
    ["page", "0"],
    ["page", "-3"],
    ["page", "1.5"],
  ])("drops invalid %s=%j and reports it", (name, value) => {
    const { filters, ignored } = parseExperienceSearchParams({ [name]: value });
    expect(ignored).toEqual([name]);
    expect(filters.sort).toBe("newest");
    expect(filters.page).toBe(1);
    expect(filters).not.toHaveProperty(name, value);
  });

  it("keeps valid filters when others are invalid", () => {
    const { filters, ignored } = parseExperienceSearchParams({
      category: "trekking",
      budget: "nope",
    });
    expect(filters.category).toBe("trekking");
    expect(filters.budget).toBeUndefined();
    expect(ignored).toEqual(["budget"]);
  });

  it("caps the page number and the query length", () => {
    expect(parseExperienceSearchParams({ page: "999999" }).filters.page).toBe(MAX_PAGE);
    const long = parseExperienceSearchParams({ q: "x".repeat(500) }).filters.q;
    expect(long).toHaveLength(QUERY_MAX_LENGTH);
  });

  it("treats blank values as absent, not invalid", () => {
    expect(parseExperienceSearchParams({ q: "   ", category: "" })).toEqual({
      filters: { sort: "newest", page: 1 },
      ignored: [],
    });
  });

  it("uses the first value of a repeated parameter", () => {
    expect(
      parseExperienceSearchParams({ category: ["wildlife", "culture"] }).filters.category,
    ).toBe("wildlife");
  });

  it("passes search text through untouched for the bound full-text parameter", () => {
    expect(parseExperienceSearchParams({ q: "a,b) or(1=1" }).filters.q).toBe("a,b) or(1=1");
  });
});

describe("parseDestinationSearchParams", () => {
  it("accepts q, district and page and ignores experience-only params", () => {
    const { filters, ignored } = parseDestinationSearchParams({
      q: "monastery",
      district: "Tawang",
      page: "3",
      category: "culture",
    });
    expect(filters).toEqual({ q: "monastery", district: "Tawang", page: 3 });
    expect(ignored).toEqual([]);
  });
});

describe("hrefs", () => {
  it("omits defaults and round-trips through the parser", () => {
    const filters = {
      q: "river rafting",
      district: "East Siang",
      category: "adventure" as const,
      budget: "3000-10000" as const,
      duration: "full-day" as const,
      sort: "price-asc" as const,
      page: 2,
    };
    const href = experiencesHref(filters);
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseExperienceSearchParams(params).filters).toEqual(filters);
    expect(experiencesHref({ sort: "newest", page: 1 })).toBe("/experiences");
  });

  it("applies overrides such as the next page", () => {
    expect(experiencesHref({ category: "culture", sort: "newest", page: 1 }, { page: 2 })).toBe(
      "/experiences?category=culture&page=2",
    );
    expect(destinationsHref({ q: "lakes & passes", page: 1 })).toBe(
      "/destinations?q=lakes+%26+passes",
    );
  });
});

describe("pageCountFor", () => {
  it("is at least 1 and at most MAX_PAGE", () => {
    expect(pageCountFor(0)).toBe(1);
    expect(pageCountFor(12)).toBe(1);
    expect(pageCountFor(13)).toBe(2);
    expect(pageCountFor(1_000_000)).toBe(MAX_PAGE);
  });
});
