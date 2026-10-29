import { expect, test } from "@playwright/test";

import { localSql, signUp, uniqueEmail } from "./support";

// Phase 3b (ADR-0008): AI plans include a partner stay for each night, and
// "Book whole trip" sends one stay request covering all its nights. Uses the
// deterministic mock model and the verified demo provider.

const DEMO_PROVIDER = "5eed0000-0000-4000-8000-0000000000a1";
const PASIGHAT = "5eed0000-0000-4000-8000-000000000006";
const run = `${Date.now() % 1_000_000}`;
const title = `Siang riverside room ${run}`;
const slug = `siang-room-${run}`;
const guideTitle = `Siang valley guide ${run}`;
const guideSlug = `siang-guide-${run}`;

function istDatePlus(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

test.beforeAll(() => {
  localSql(
    `insert into public.experiences (provider_id, destination_id, slug, title, category, duration_minutes,
       price_from_minor, status, listing_type, price_unit, daily_capacity, max_guests)
     values ('${DEMO_PROVIDER}', '${PASIGHAT}', '${slug}', '${title}', 'culture', 1440,
       250000, 'published', 'stay', 'per_room_night', 2, 2)
     returning id`,
  );
  localSql(
    `insert into public.experiences (provider_id, destination_id, slug, title, category, duration_minutes,
       price_from_minor, status, listing_type, price_unit, daily_capacity, max_guests, languages)
     values ('${DEMO_PROVIDER}', '${PASIGHAT}', '${guideSlug}', '${guideTitle}', 'culture', 480,
       150000, 'published', 'guide', 'per_group_day', 1, 6, '{English,Adi}')
     returning id`,
  );
});

test.afterAll(() => {
  // Hide it again: the shared local seed is counted by discovery and itinerary tests.
  localSql(
    `update public.experiences set status = 'archived' where slug in ('${slug}', '${guideSlug}') returning id`,
  );
});

test("AI plan includes a partner stay and guide; booking the trip books each once", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page, uniqueEmail("staytrip"), "Stay Planner");

  await page.goto("/itineraries/new");
  await page.getByLabel("Where would you like to go?").selectOption({ label: "Pasighat" });
  await page.getByLabel("Start date").fill(istDatePlus(12));
  await page.getByLabel("Number of days").fill("3");
  await page.getByLabel("Adults").fill("2");
  await expect(page.getByLabel("Suggest places to stay from our partners")).toBeChecked();
  await expect(page.getByLabel("Suggest a local guide")).toBeChecked();
  await page.getByLabel("Guide language (optional)").fill("adi");
  await page.getByRole("button", { name: "Plan my trip" }).click();
  await expect(page).toHaveURL(/\/itineraries\/[0-9a-f-]{36}$/);

  // Nights 1 and 2 at the stay; none on the last day. Priced per room per night.
  const stays = page.getByTestId("itinerary-stay").filter({ visible: true });
  await expect(stays).toHaveCount(2);
  await expect(stays.first()).toContainText(title);
  await expect(stays.first()).toContainText("1 room");
  await expect(stays.first()).toContainText("from ₹2,500 per room per night");

  // The guide (speaks Adi) every day, priced per group per day.
  const guides = page.getByTestId("itinerary-guide").filter({ visible: true });
  await expect(guides).toHaveCount(3);
  await expect(guides.first()).toContainText(guideTitle);
  await expect(guides.first()).toContainText("1 guide");
  await expect(guides.first()).toContainText("from ₹1,500 per group per day");

  // One stay line for both nights in the trip booking.
  const lines = page.getByTestId("trip-booking-lines").filter({ visible: true });
  await expect(lines.getByRole("listitem").filter({ hasText: title })).toHaveCount(1);
  await expect(lines.getByRole("listitem").filter({ hasText: title })).toContainText(
    "2 nights, 1 room",
  );
  await expect(lines.getByRole("listitem").filter({ hasText: guideTitle })).toContainText(
    "3 days, 1 guide",
  );

  await page.getByLabel(/Contact phone/).fill("+91 98765 43210");
  await page.getByRole("button", { name: "Book whole trip" }).click();
  const results = page.getByTestId("trip-booking-results").filter({ visible: true });
  await expect(results).toContainText("Every item is booked.");
  await expect(results.getByRole("listitem").filter({ hasText: guideTitle })).toHaveCount(1);
  const stayResult = results.getByRole("listitem").filter({ hasText: title });
  await expect(stayResult).toHaveCount(1);
  await stayResult.getByRole("link", { name: /^Confirmed · HV-/ }).click();

  // The stay booking spans check-in to check-out: 2 nights x 1 room x ₹2,500.
  await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/\(2 nights\)/)).toBeVisible();
  await expect(page.getByText("2 adults · 1 room")).toBeVisible();
  await expect(page.getByTestId("booking-price").filter({ visible: true })).toContainText("₹5,000");
});
