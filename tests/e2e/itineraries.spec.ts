// Next.js 16 (Cache Components) keeps up to 3 previous routes mounted but hidden
// (React <Activity>), so test-id lookups only match visible elements.
import { expect, type Page, test } from "@playwright/test";

// AI itinerary flow against the deterministic mock model (AI_PROVIDER=mock, set
// in playwright.config.ts). Uses the local seed's public inventory.

const password = "correct-horse-battery";

function istDatePlus(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function signUp(page: Page, label: string) {
  const email = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  await page.context().clearCookies();
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill(label);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/Password/).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function fillTrip(
  page: Page,
  options: { place: string; startDate: string; days?: number; budget?: string },
) {
  await page.goto("/itineraries/new");
  await page.getByLabel("Where would you like to go?").selectOption({ label: options.place });
  await page.getByLabel("Start date").fill(options.startDate);
  await page.getByLabel("Number of days").fill(String(options.days ?? 2));
  await page.getByLabel("Adults").fill("2");
  if (options.budget) await page.getByLabel(/Budget for experiences/).fill(options.budget);
}

const rupees = (text: string) => Number(text.replace(/[^\d]/g, ""));

test("trips require sign-in", async ({ page }) => {
  await page.goto("/itineraries/new");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fitineraries%2Fnew$/);
});

test("plan, refine, restore and delete an itinerary; others can't see it", async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page, "planner");

  await fillTrip(page, { place: "Ziro Valley", startDate: istDatePlus(7) });
  await page.getByLabel("Culture").check();
  await page.getByRole("button", { name: "Plan my trip" }).click();

  await expect(page).toHaveURL(/\/itineraries\/[0-9a-f-]{36}$/);
  const itineraryUrl = page.url();
  await expect(page.getByTestId("version-label").filter({ visible: true })).toContainText(
    "Version 1 (current)",
  );
  await expect(page.getByText(/AI-suggested plan, not a booking/)).toBeVisible();
  await expect(page.getByTestId("itinerary-day").filter({ visible: true })).toHaveCount(2);

  // Every item links to a real, public Ziro experience.
  const links = page.getByTestId("itinerary-item").filter({ visible: true }).getByRole("link");
  expect(await links.count()).toBeGreaterThan(0);
  for (const href of await links.evaluateAll((els) => els.map((e) => e.getAttribute("href")))) {
    expect(href).toMatch(/^\/experiences\/demo-(ziro|apatani)/);
  }

  // The total is computed from database prices: sum of per-person prices x 2 travellers.
  const perPerson = (
    await page.getByTestId("itinerary-item").filter({ visible: true }).allTextContents()
  )
    .map((t) => t.match(/from ₹([\d,]+) per person/)?.[1])
    .filter((p): p is string => Boolean(p))
    .reduce((sum, p) => sum + rupees(p), 0);
  await expect(page.getByTestId("itinerary-total").filter({ visible: true })).toContainText(
    `₹${(perPerson * 2).toLocaleString("en-IN")}`,
  );

  // Refine creates version 2.
  await page.getByLabel("What would you like to change?").fill("More food, please");
  await page.getByRole("button", { name: "Refine itinerary" }).click();
  await expect(page.getByTestId("version-label").filter({ visible: true })).toContainText(
    "Version 2 (current)",
  );
  await expect(page.getByRole("link", { name: "Version 1" })).toBeVisible();

  // Restore version 1.
  await page.getByRole("link", { name: "Version 1" }).click();
  await expect(page.getByTestId("version-label").filter({ visible: true })).toContainText(
    "Version 1 (not current)",
  );
  await page.getByRole("button", { name: "Use version 1" }).click();
  await expect(page.getByTestId("version-label").filter({ visible: true })).toContainText(
    "Version 1 (current)",
  );

  // Another traveller can't open it.
  await signUp(page, "stranger");
  await page.goto(itineraryUrl);
  await expect(page.getByRole("heading", { name: "Itinerary not found" })).toBeVisible();
  await page.goto("/itineraries");
  await expect(page.getByText("You haven't planned any trips yet.")).toBeVisible();
});

test("empty inventory is explained, not invented", async ({ page }) => {
  await signUp(page, "frugal");
  // Every Tawang experience costs more than ₹1 per person.
  await fillTrip(page, { place: "Tawang", startDate: istDatePlus(10), budget: "1" });
  await page.getByRole("button", { name: "Plan my trip" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "couldn't find published experiences" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/itineraries\/new$/);
});

test("invalid dates are rejected on the server", async ({ page }) => {
  await signUp(page, "timetraveller");
  await fillTrip(page, { place: "Ziro Valley", startDate: istDatePlus(-3) });
  await page.getByRole("button", { name: "Plan my trip" }).click();
  await expect(page.getByText("The trip can't start in the past.")).toBeVisible();
});

test("an itinerary can be deleted", async ({ page }) => {
  test.setTimeout(90_000);
  await signUp(page, "deleter");
  await fillTrip(page, { place: "Pasighat", startDate: istDatePlus(14), days: 1 });
  await page.getByRole("button", { name: "Plan my trip" }).click();
  await expect(page).toHaveURL(/\/itineraries\/[0-9a-f-]{36}$/);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete itinerary" }).click();
  await expect(page).toHaveURL(/\/itineraries$/);
  await expect(page.getByText("You haven't planned any trips yet.")).toBeVisible();
});
