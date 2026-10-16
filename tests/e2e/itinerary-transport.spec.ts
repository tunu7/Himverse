import { expect, test } from "@playwright/test";

import { localSql, signUp, uniqueEmail } from "./support";

// Phase 3b (ADR-0008): when the plan moves to another destination, it adds a
// partner vehicle for that leg, and "Book whole trip" requests it on that day.
// Fixture: a region of two destinations with one experience each, so the
// deterministic mock model spends day 1 at one and moves to the other on day 2,
// plus a vehicle in each direction (the mock picks whichever matches its order).

const DEMO_PROVIDER = "5eed0000-0000-4000-8000-0000000000a1";
const run = `${Date.now() % 1_000_000}`;
// Region names are letters only (the planner validates them), so spell the run as letters.
const region = `Testvalley ${[...run].map((d) => "abcdefghij"[Number(d)]).join("")}`;
const places = [
  { slug: `e2e-upper-${run}`, name: `Upper Camp ${run}` },
  { slug: `e2e-lower-${run}`, name: `Lower Camp ${run}` },
] as const;
const vehicleTitle = (from: string, to: string) => `SUV ${from} to ${to}`;

function istDatePlus(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

test.beforeAll(() => {
  for (const place of places) {
    localSql(
      `insert into public.destinations (slug, name, district, is_published)
       values ('${place.slug}', '${place.name}', '${region}', true) returning id`,
    );
    localSql(
      `insert into public.experiences (provider_id, destination_id, slug, title, category, duration_minutes,
         price_from_minor, status)
       select '${DEMO_PROVIDER}', d.id, '${place.slug}-walk', 'Village walk at ${place.name}', 'culture', 180,
         80000, 'published'
       from public.destinations d where d.slug = '${place.slug}' returning id`,
    );
  }
  for (const [from, to] of [
    [places[0], places[1]],
    [places[1], places[0]],
  ] as const) {
    localSql(
      `insert into public.experiences (provider_id, destination_id, route_to_destination_id, slug, title,
         category, duration_minutes, price_from_minor, status, listing_type, price_unit, daily_capacity, max_guests)
       select '${DEMO_PROVIDER}', a.id, b.id, '${from.slug}-to-${to.slug}', '${vehicleTitle(from.name, to.name)}',
         'adventure', 240, 450000, 'published', 'transport', 'per_vehicle_trip', 1, 6
       from public.destinations a, public.destinations b
       where a.slug = '${from.slug}' and b.slug = '${to.slug}' returning id`,
    );
  }
});

test.afterAll(() => {
  // Hide the fixture again: discovery and itinerary tests count the shared local seed.
  localSql(
    `update public.experiences set status = 'archived'
     where slug like 'e2e-%-${run}%' returning id`,
  );
  localSql(
    `update public.destinations set is_published = false
     where slug in ('${places[0].slug}', '${places[1].slug}') returning id`,
  );
});

test("AI plan adds a vehicle when the trip moves on, and booking the trip requests it", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page, uniqueEmail("roadtrip"), "Road Tripper");

  await page.goto("/itineraries/new");
  await page.getByLabel("Where would you like to go?").selectOption({ label: region });
  await page.getByLabel("Start date").fill(istDatePlus(15));
  await page.getByLabel("Number of days").fill("2");
  await page.getByLabel("Adults").fill("2");
  await expect(page.getByLabel("Suggest private vehicles between places")).toBeChecked();
  await page.getByRole("button", { name: "Plan my trip" }).click();
  await expect(page).toHaveURL(/\/itineraries\/[0-9a-f-]{36}$/);

  // Day 1 at one camp, day 2 at the other with a vehicle between them.
  const days = page.getByTestId("itinerary-day").filter({ visible: true });
  await expect(days).toHaveCount(2);
  await expect(days.nth(0).getByTestId("itinerary-transport")).toHaveCount(0);
  const leg = days.nth(1).getByTestId("itinerary-transport");
  await expect(leg).toHaveCount(1);
  await expect(leg).toContainText(/SUV (Upper|Lower) Camp \d+ to (Upper|Lower) Camp \d+/);
  await expect(leg).toContainText("1 vehicle");
  await expect(leg).toContainText("from ₹4,500 per vehicle");
  const legTitle = (await leg.getByRole("link").textContent())?.trim() ?? "";
  expect(legTitle).toMatch(/^SUV /);

  // The vehicle is one line in the trip booking, on day 2.
  const lines = page.getByTestId("trip-booking-lines").filter({ visible: true });
  await expect(lines.getByRole("listitem").filter({ hasText: legTitle })).toHaveCount(1);

  await page.getByLabel(/Contact phone/).fill("+91 98765 43210");
  await page.getByRole("button", { name: "Book whole trip" }).click();
  const results = page.getByTestId("trip-booking-results").filter({ visible: true });
  await expect(results).toContainText("Booking requests sent for every item.");
  const legResult = results.getByRole("listitem").filter({ hasText: legTitle });
  await expect(legResult).toHaveCount(1);
  await legResult.getByRole("link", { name: /^Requested · HV-/ }).click();

  // One vehicle for the trip on day 2, at the per-vehicle estimate.
  await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(legTitle);
  await expect(page.getByText("2 adults · 1 vehicle")).toBeVisible();
  await expect(page.getByTestId("booking-price").filter({ visible: true })).toContainText("₹4,500");
});
