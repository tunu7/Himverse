import { expect, type Page, test } from "@playwright/test";

import { currentUserId, localSql, signIn, signUp, uniqueEmail, UUID } from "./support";

// Booking lifecycle through the UI against the local seed (bookable dates on the
// demo providers' experiences). Provider membership is granted with owner SQL on
// the local stack, as an operator would. Next.js keeps hidden copies of previous
// routes, so test-id lookups only match visible elements.

const DEMO_PROVIDER = "5eed0000-0000-4000-8000-0000000000a1"; // owns Siang rafting
const OTHER_PROVIDER = "5eed0000-0000-4000-8000-0000000000a4"; // Valley Guides

function addMember(providerId: string, userId: string) {
  expect(userId).toMatch(UUID);
  const rows = localSql(
    `insert into public.provider_members (provider_id, user_id) values ('${providerId}', '${userId}') returning user_id`,
  );
  expect(rows).toHaveLength(1);
}

function istDatePlus(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The seed publishes rafting dates 5 and 12 days ahead; any future date can be requested.
async function requestRafting(page: Page, daysAhead: number) {
  await page.goto("/experiences/demo-siang-rafting");
  await page.getByLabel("Date").fill(istDatePlus(daysAhead));
  await page.getByLabel("Adults").fill("1");
  await page.getByLabel(/Contact phone/).fill("+91 98765 43210");
}

// Unique per run: the demo provider accumulates bookings across local runs.
const run = `${Date.now() % 1_000_000}`;

const status = (page: Page) => page.getByTestId("booking-status").filter({ visible: true });

test("signed-out visitors are asked to sign in before booking", async ({ page }) => {
  await page.goto("/experiences/demo-siang-rafting");
  await expect(
    page.getByRole("link", { name: "Sign in" }).filter({ hasText: "Sign in" }).last(),
  ).toBeVisible();
  await expect(page.getByText(/to request a booking \(2 dates open\)/)).toBeVisible();
});

test("request → provider confirms → traveller sees it → traveller cancels; others can't see it", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const travelerEmail = uniqueEmail("booker");
  await signUp(page, travelerEmail, `Booker ${run}`);

  // A double click still creates exactly one booking (button pending state + idempotency key).
  await requestRafting(page, 5);
  await page.getByRole("button", { name: "Request booking" }).dblclick();
  await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}$/);
  const bookingUrl = page.url();
  await expect(status(page)).toHaveText("Awaiting provider confirmation");
  await expect(page.getByTestId("booking-price").filter({ visible: true })).toContainText(
    "Estimated from ₹3,500",
  );
  await page.goto("/bookings");
  await expect(page.getByRole("link", { name: "Siang river rafting (sample)" })).toHaveCount(1);

  // Provider confirms with a final price.
  const providerEmail = uniqueEmail("provider");
  await signUp(page, providerEmail, "Rafting Guide", "partner");
  addMember(DEMO_PROVIDER, await currentUserId(page, "partner"));
  await page.goto("/provider/bookings");
  const pending = page
    .getByTestId("provider-booking")
    .filter({ visible: true })
    .filter({ hasText: `Booker ${run}` });
  await expect(pending).toContainText("Awaiting provider confirmation");
  await pending.getByRole("link").click();
  await expect(page.getByText("+91 98765 43210")).toBeVisible();
  await page.getByLabel(/Final price/).fill("3600");
  await page.getByLabel(/Message to the traveller/).fill("Meet at the jetty at 8am");
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(status(page)).toHaveText("Confirmed");

  // Another provider and another traveller can't open it.
  await signUp(page, uniqueEmail("other-provider"), "Other Provider", "partner");
  addMember(OTHER_PROVIDER, await currentUserId(page, "partner"));
  await page.goto(bookingUrl.replace("/bookings/", "/provider/bookings/"));
  await expect(page.getByRole("heading", { name: "Booking not found" })).toBeVisible();
  await page.goto("/provider/bookings");
  await expect(
    page
      .getByTestId("provider-booking")
      .filter({ visible: true })
      .filter({ hasText: `Booker ${run}` }),
  ).toHaveCount(0);
  await signUp(page, uniqueEmail("nosy"), "Nosy");
  await page.goto(bookingUrl);
  await expect(page.getByRole("heading", { name: "Booking not found" })).toBeVisible();

  // The traveller sees the confirmed price, the original estimate and the history, then cancels.
  await signIn(page, travelerEmail);
  await page.goto(bookingUrl);
  await expect(status(page)).toHaveText("Confirmed");
  await expect(page.getByTestId("booking-price").filter({ visible: true })).toContainText(
    "₹3,600 (confirmed by the provider)",
  );
  await expect(page.getByText("Original estimate: from ₹3,500")).toBeVisible();
  await expect(page.getByText("Provider's message: Meet at the jetty at 8am")).toBeVisible();
  await expect(
    page.getByTestId("booking-history").filter({ visible: true }).getByRole("listitem"),
  ).toHaveCount(2);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await expect(status(page)).toHaveText("Cancelled");
});

test("providers must give a reason to decline", async ({ page }) => {
  test.setTimeout(120_000);
  const travelerEmail = uniqueEmail("declined");
  await signUp(page, travelerEmail, "Hopeful");
  await requestRafting(page, 12);
  await page.getByRole("button", { name: "Request booking" }).click();
  await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}$/);
  const bookingUrl = page.url();

  await signUp(page, uniqueEmail("decliner"), "Busy Guide", "partner");
  addMember(DEMO_PROVIDER, await currentUserId(page, "partner"));
  await page.goto(bookingUrl.replace("/bookings/", "/provider/bookings/"));
  await page.getByRole("button", { name: "Decline" }).click();
  await expect(page.getByText("Give the traveller a reason.")).toBeVisible();
  await page.getByLabel(/Message to the traveller/).fill("Fully booked with a school group");
  await page.getByRole("button", { name: "Decline" }).click();
  await expect(status(page)).toHaveText("Declined");

  await signIn(page, travelerEmail);
  await page.goto(bookingUrl);
  await expect(status(page)).toHaveText("Declined");
  await expect(
    page.getByText("Provider's message: Fully booked with a school group"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel booking" })).toHaveCount(0);
});

test("providers add and close dates; closed dates can't be requested", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  // Published dates are shown to travellers (partners can't book), in a second browser.
  const traveller = await (await browser.newContext()).newPage();
  await signUp(traveller, uniqueEmail("date-viewer"), "Date Viewer");
  await signUp(page, uniqueEmail("scheduler"), "Scheduler", "partner");
  addMember(DEMO_PROVIDER, await currentUserId(page, "partner"));
  // Random future date: dates are unique per experience and persist across local runs.
  const date = new Date(Date.now() + (40 + Math.floor(Math.random() * 600)) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const label = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

  await page.goto("/provider");
  const manager = page
    .getByTestId("slot-manager")
    .filter({ visible: true })
    .filter({ hasText: "Pasighat riverside picnic (sample)" });
  await manager.getByLabel("Date").fill(date);
  await manager.getByLabel("Seats").fill("3");
  await manager.getByRole("button", { name: "Add date" }).click();
  await expect(manager.getByText("Date added.")).toBeVisible();
  await expect(manager.getByText(label)).toBeVisible();

  await traveller.goto("/experiences/demo-pasighat-picnic");
  const published = traveller.getByTestId("published-dates").filter({ visible: true });
  await expect(published.getByText(label)).toHaveCount(1);

  await page.goto("/provider");
  const row = page
    .getByTestId("slot-manager")
    .filter({ visible: true })
    .filter({ hasText: "Pasighat riverside picnic (sample)" })
    .getByRole("listitem")
    .filter({ hasText: label });
  await row.getByRole("button", { name: "Close date" }).click();
  await expect(row).toContainText("closed");

  await traveller.goto("/experiences/demo-pasighat-picnic");
  await expect(traveller.getByRole("heading", { name: "Request to book" })).toBeVisible();
  await expect(traveller.getByText(label)).toHaveCount(0);
  await traveller.context().close();
});

test("any future date can be requested when the provider has published none", async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page, uniqueEmail("any-date"), "Any Date");
  await page.goto("/experiences/demo-dirang-orchard-walk");
  await expect(page.getByTestId("published-dates")).toHaveCount(0);
  // Random date: one active request per traveller, experience and date.
  await page.getByLabel("Date").fill(istDatePlus(20 + Math.floor(Math.random() * 300)));
  await page.getByLabel("Adults").fill("2");
  await page.getByLabel(/Contact phone/).fill("+91 98765 43210");
  await page.getByRole("button", { name: "Request booking" }).click();
  await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}$/);
  await expect(status(page)).toHaveText("Awaiting provider confirmation");
});

test("dates must be in the future", async ({ page }) => {
  await signUp(page, uniqueEmail("past-date"), "Past Date");
  await page.goto("/experiences/demo-dirang-orchard-walk");
  await page.getByLabel("Date").fill(istDatePlus(0));
  await page.getByLabel(/Contact phone/).fill("+91 98765 43210");
  await page.getByRole("button", { name: "Request booking" }).click();
  await expect(page.getByText("Choose a date from tomorrow onwards.")).toBeVisible();
});

test("providers can stop and resume booking requests for an experience", async ({ page }) => {
  test.setTimeout(120_000);
  const [owner] = localSql(
    "select provider_id from public.experiences where slug = 'demo-sangti-birding'",
  ) as Array<{ provider_id: string }>;
  expect(owner?.provider_id).toMatch(UUID);
  await signUp(page, uniqueEmail("toggler"), "Toggler", "partner");
  addMember(owner!.provider_id, await currentUserId(page, "partner"));

  await page.goto("/provider");
  const row = page
    .getByRole("listitem")
    .filter({ visible: true })
    .filter({ hasText: "Sangti" })
    .filter({ has: page.getByTestId("booking-requests-state") });
  await row.getByRole("button", { name: "Stop booking requests" }).click();
  await expect(row.getByTestId("booking-requests-state")).toHaveText(/Not accepting/);

  await page.goto("/experiences/demo-sangti-birding");
  await expect(page.getByText(/isn.t taking booking requests/)).toBeVisible();
  await expect(page.getByLabel("Date")).toHaveCount(0);

  // Restore: the local seed is shared across runs.
  await page.goto("/provider");
  await row.getByRole("button", { name: "Accept booking requests" }).click();
  await expect(row.getByTestId("booking-requests-state")).toHaveText(/Accepting/);
});
