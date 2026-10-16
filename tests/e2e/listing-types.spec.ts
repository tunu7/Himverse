import { expect, test } from "@playwright/test";

import { currentUserId, localSql, signIn, signUp, uniqueEmail, UUID } from "./support";

// Phase 3a (ADR-0008): a partner lists a stay (one room type), a traveller requests
// nights and rooms, and the partner confirms. Uses the verified demo provider.

const DEMO_PROVIDER = "5eed0000-0000-4000-8000-0000000000a1";
const run = `${Date.now() % 1_000_000}`;
const title = `Riverside family room ${run}`;
const slug = `riverside-room-${run}`;

function istDatePlus(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

test.afterAll(() => {
  // Hide it again: the shared local seed is counted by discovery tests.
  localSql(`update public.experiences set status = 'archived' where slug = '${slug}' returning id`);
});

test("stays: partner lists a room type, traveller requests nights, partner confirms", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const partnerEmail = uniqueEmail("host");
  await signUp(page, partnerEmail, "Riverside Host", "partner");
  const partnerId = await currentUserId(page, "partner");
  expect(partnerId).toMatch(UUID);
  localSql(
    `insert into public.provider_members (provider_id, user_id) values ('${DEMO_PROVIDER}', '${partnerId}') returning user_id`,
  );

  // Create the stay.
  await page.goto("/provider/listings");
  const add = page.locator("details").filter({ hasText: "Add a listing" });
  if (!(await add.getAttribute("open"))) await add.locator("summary").click();
  await add.getByLabel("What are you listing?").selectOption("stay");
  await add.getByLabel("Title").fill(title);
  await add.getByLabel("Short web address").fill(slug);
  await add.getByLabel("Destination").selectOption({ label: "Pasighat (East Siang)" });
  await add.getByLabel("Rooms of this type").fill("2");
  await add.getByLabel("Guests per room").fill("3");
  await add.getByLabel(/Indicative price from/).fill("2500");
  await add.getByRole("button", { name: "Save as draft" }).click();
  const row = page.getByTestId("listing-row").filter({ visible: true }).filter({ hasText: title });
  await expect(page.getByTestId("listing-group-stay")).toContainText(title);
  await expect(row).toContainText("2 rooms of this type");
  await row.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(row).toContainText("published");

  // Travellers find it under Stays with its price unit.
  const travellerEmail = uniqueEmail("guest");
  await signUp(page, travellerEmail, "Guest");
  await page.goto(`/stays?q=${encodeURIComponent("Riverside family room")}`);
  const card = page.getByTestId("experience-card").filter({ hasText: title });
  await expect(card).toContainText("per room per night");
  await card.getByRole("link").click();
  await expect(page.getByTestId("listing-price").filter({ visible: true })).toContainText(
    "₹2,500 per room per night",
  );

  // Two nights, one room, three guests.
  await page.getByLabel("Check-in").fill(istDatePlus(20));
  await page.getByLabel("Check-out").fill(istDatePlus(22));
  await page.getByLabel("Adults").fill("3");
  await expect(page.getByTestId("listing-estimate")).toContainText("₹5,000 for 2 nights");
  await page.getByLabel(/Contact phone/).fill("+91 98765 43210");
  await page.getByRole("button", { name: "Request booking" }).click();
  await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}$/);
  const bookingUrl = page.url();
  await expect(page.getByText(/\(2 nights\)/)).toBeVisible();
  await expect(page.getByTestId("booking-price").filter({ visible: true })).toContainText("₹5,000");

  // The host confirms.
  await signIn(page, partnerEmail, "partner");
  await page.goto(bookingUrl.replace("/bookings/", "/provider/bookings/"));
  await page.getByLabel(/Final price/).fill("5000");
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByTestId("booking-status").filter({ visible: true })).toHaveText(
    "Confirmed",
  );
});

test("guides and transport have their own browse pages", async ({ page }) => {
  for (const [path, heading] of [
    ["/guides", "Guides in Arunachal Pradesh"],
    ["/transport", "Transport in Arunachal Pradesh"],
    ["/stays", "Stays in Arunachal Pradesh"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
});
