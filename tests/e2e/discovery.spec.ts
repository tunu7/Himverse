// Next.js 16 (Cache Components) keeps up to 3 previous routes mounted but hidden
// (React <Activity>), so test-id lookups only match visible elements.
import { expect, type Page, test } from "@playwright/test";

// Read-only checks against the local seed (supabase/seed.sql): 17 public experiences
// across 6 published destinations, plus deliberately hidden records. Runs as its own
// Playwright project before specs that create data (see playwright.config.ts). Locally,
// run `npx supabase db reset` first if earlier runs were interrupted.

const cards = (page: Page) => page.getByTestId("experience-card").filter({ visible: true });
// Results stream in behind Suspense: wait for the summary before reading cards.
const titles = async (page: Page) => {
  await expect(summary(page)).toBeVisible();
  return (await cards(page).getByRole("heading").allTextContents()).map((t) => t.trim());
};
// The results summary (not the "Loading…" placeholder, which is also role=status).
const summary = (page: Page) => page.getByTestId("results-summary").filter({ visible: true });

test.describe("experience search", () => {
  test("lists public experiences with pagination", async ({ page }) => {
    await page.goto("/experiences");
    await expect(summary(page)).toContainText("17 experiences");
    await expect(cards(page)).toHaveCount(12);
    const pagination = page.getByRole("navigation", { name: "Pagination" });
    await expect(pagination).toContainText("Page 1 of 2");
    await pagination.getByRole("link", { name: /Next/ }).click();
    await expect(page).toHaveURL(/\/experiences\?page=2$/);
    await expect(cards(page)).toHaveCount(5);
    await expect(pagination).toContainText("Page 2 of 2");
  });

  test("full-text search uses stemming and never returns hidden inventory", async ({ page }) => {
    // The seed also has a suspended provider's and a draft destination's rafting trips.
    await page.goto("/experiences?q=raft");
    expect(await titles(page)).toEqual(["Siang river rafting (sample)"]);
  });

  for (const [query, expected] of [
    ["district=West+Kameng", 5],
    ["category=wildlife", 2],
    ["budget=under-1000", 4],
    ["duration=multi-day", 4],
  ] as const) {
    test(`filter ${query}`, async ({ page }) => {
      await page.goto(`/experiences?${query}`);
      await expect(cards(page)).toHaveCount(expected);
      await expect(summary(page)).toContainText(`${expected} experiences`);
    });
  }

  test("combined filters narrow results", async ({ page }) => {
    await page.goto("/experiences?category=trekking&duration=multi-day");
    expect((await titles(page)).sort()).toEqual([
      "Bomdila to Dirang trek (sample)",
      "Namdapha three-day camp (sample)",
    ]);
    await page.goto("/experiences?category=trekking&duration=multi-day&budget=3000-10000");
    expect(await titles(page)).toEqual(["Bomdila to Dirang trek (sample)"]);
  });

  test("sorting by price puts unpriced experiences last", async ({ page }) => {
    await page.goto("/experiences?sort=price-asc");
    expect((await titles(page))[0]).toBe("Tawang monastery morning (sample)");
    await page.goto("/experiences?sort=price-desc&page=2");
    const lastPage = await titles(page);
    expect(lastPage.slice(-2).sort()).toEqual([
      "Dirang hot springs half day (sample)",
      "Pasighat riverside picnic (sample)",
    ]);
  });

  test("the filter form produces a shareable URL", async ({ page }) => {
    await page.goto("/experiences");
    await page.getByLabel("Search experiences").fill("birding");
    await page.getByLabel("Category").selectOption("wildlife");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/q=birding/);
    await expect(page).toHaveURL(/category=wildlife/);
    expect(await titles(page)).toEqual(["Sangti valley birding (sample)"]);
    // Reloading the URL restores the same state.
    await page.reload();
    await expect(page.getByLabel("Category")).toHaveValue("wildlife");
    await expect(page.getByLabel("Search experiences")).toHaveValue("birding");
  });

  test("invalid parameters are ignored with a notice, not an error", async ({ page }) => {
    await page.goto(
      "/experiences?category=casino&budget=free&page=abc&sort=random&district=%3Cscript%3E",
    );
    await expect(summary(page)).toContainText("weren't recognised");
    await expect(summary(page)).toContainText("17 experiences");
    await expect(cards(page)).toHaveCount(12);
  });

  test("unusual search text is treated as text", async ({ page }) => {
    const response = await page.goto(`/experiences?q=${encodeURIComponent("a,b) or(1=1 'x\"")}`);
    expect(response?.status()).toBe(200);
    await expect(summary(page)).toContainText("No experiences match");
  });

  test("empty results explain themselves and offer a reset", async ({ page }) => {
    await page.goto("/experiences?q=zzzznothing");
    await expect(summary(page)).toContainText("No experiences match your search and filters.");
    await summary(page).getByRole("link", { name: "Clear all filters" }).click();
    await expect(page).toHaveURL(/\/experiences$/);
    await expect(cards(page)).toHaveCount(12);
  });

  test("a page beyond the last page offers a way back", async ({ page }) => {
    await page.goto("/experiences?category=culture&page=9");
    await expect(summary(page)).toContainText("There are no results on this page.");
    await summary(page).getByRole("link", { name: "Go to the first page" }).click();
    await expect(page).toHaveURL(/\/experiences\?category=culture$/);
  });
});

test.describe("experience detail", () => {
  test("shows price, duration, category, location and provider", async ({ page }) => {
    await page.goto("/experiences/demo-siang-rafting");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Siang river rafting (sample)",
    );
    await expect(page).toHaveTitle(/Siang river rafting/);
    await expect(page.getByText("From ₹3,500")).toBeVisible();
    await expect(page.getByText("6 h", { exact: true })).toBeVisible();
    await expect(page.getByText("Demo Provider (local seed)")).toBeVisible();
    await expect(page.getByText(/availability isn't guaranteed/)).toBeVisible();
    await page.getByRole("link", { name: "Pasighat" }).click();
    await expect(page).toHaveURL(/\/destinations\/pasighat$/);
  });

  test("unknown slugs show a not-found page that isn't indexed", async ({ page }) => {
    await page.goto("/experiences/does-not-exist");
    await expect(page.getByRole("heading", { name: "Experience not found" })).toBeVisible();
    await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  });

  for (const slug of [
    "demo-suspended-raft-run",
    "demo-draft-provider-tour",
    "demo-anini-drive",
    "demo-mechuka-hidden",
    "demo-ziro-night-sky",
  ]) {
    test(`hidden inventory is not reachable by URL: ${slug}`, async ({ page }) => {
      await page.goto(`/experiences/${slug}`);
      await expect(page.getByRole("heading", { name: "Experience not found" })).toBeVisible();
    });
  }
});

test.describe("destinations", () => {
  const destinationTitles = async (page: Page) => {
    await expect(summary(page)).toBeVisible();
    return (
      await page
        .getByTestId("destination-card")
        .filter({ visible: true })
        .getByRole("heading")
        .allTextContents()
    ).map((t) => t.trim());
  };

  test("lists only published destinations with public experience counts", async ({ page }) => {
    await page.goto("/destinations");
    expect(await destinationTitles(page)).toEqual([
      "Bomdila",
      "Dirang",
      "Namdapha",
      "Pasighat",
      "Tawang",
      "Ziro Valley",
    ]);
    // Ziro has 4 public experiences; its draft experience is not counted.
    await expect(
      page
        .getByTestId("destination-card")
        .filter({ visible: true })
        .filter({ hasText: "Ziro Valley" }),
    ).toContainText("4 experiences");
  });

  test("search and region filter", async ({ page }) => {
    await page.goto("/destinations?q=monastery");
    expect((await destinationTitles(page)).sort()).toEqual(["Bomdila", "Tawang"]);
    await page.goto("/destinations?district=West+Kameng");
    expect(await destinationTitles(page)).toEqual(["Bomdila", "Dirang"]);
  });

  test("detail page lists only that destination's public experiences", async ({ page }) => {
    await page.goto("/destinations/ziro");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ziro Valley");
    await expect(cards(page)).toHaveCount(4);
    await expect(page.getByText(/night sky/)).toHaveCount(0);
    await page.getByRole("link", { name: "All experiences in Lower Subansiri" }).click();
    await expect(page).toHaveURL(/district=Lower\+Subansiri/);
    await expect(cards(page)).toHaveCount(4);
  });

  for (const slug of ["mechuka", "anini", "does-not-exist"]) {
    test(`unpublished or unknown destination is not found: ${slug}`, async ({ page }) => {
      await page.goto(`/destinations/${slug}`);
      await expect(page.getByRole("heading", { name: "Destination not found" })).toBeVisible();
    });
  }
});

test("the old /explore URL redirects permanently", async ({ request }) => {
  const response = await request.get("/explore", { maxRedirects: 0 });
  expect(response.status()).toBe(308);
  expect(response.headers().location).toBe("/experiences");
});

test.describe("mobile layout", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("experience search fits a phone screen and stays usable", async ({ page }) => {
    await page.goto("/experiences");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole("search", { name: "Search and filter experiences" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await expect(cards(page).first()).toBeVisible();
  });
});
