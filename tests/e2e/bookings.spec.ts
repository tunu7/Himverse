import { expect, type Page, test } from "@playwright/test";

import { currentUserId, localSql, signIn, signUp, uniqueEmail, UUID } from "./support";

// Booking lifecycle through the UI against the local seed (daily bookable dates on
// the demo providers' experiences; instant booking, ADR-0004 amendment 2026-10-29). Provider membership is granted with owner SQL on
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

// The seed publishes a date every day for 120 days; experiences are booked only on those.
async function chooseDate(page: Page, slug: string, daysAhead: number) {
  await page.goto(`/experiences/${slug}`);
  await page.getByLabel("Date").selectOption(istDatePlus(daysAhead));
  await page.getByLabel("Adults").fill("1");
  await page.getByLabel(/Contact phone/).fill("+91 98765 43210");
}

// A random day among the 60 dates the booking form lists: one active booking per
// traveller, experience and date, and the shared local seed keeps bookings across runs.
const someDay = () => 20 + Math.floor(Math.random() * 30);

// Unique per run: the demo provider accumulates bookings across local runs.
const run = `${Date.now() % 1_000_000}`;

const status = (page: Page) => page.getByTestId("booking-status").filter({ visible: true });

test("signed-out visitors are asked to sign in before booking", async ({ page }) => {
  await page.goto("/experiences/demo-siang-rafting");
  await expect(
    page.getByRole("link", { name: "Sign in" }).filter({ hasText: "Sign in" }).last(),
  ).toBeVisible();
  await expect(page.getByText(/to book \(\d+ dates open\)/)).toBeVisible();
});

test("book → confirmed instantly → partner sees it → traveller cancels; others can't see it", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const travelerEmail = uniqueEmail("booker");
  await signUp(page, travelerEmail, `Booker ${run}`);

  // A double click still creates exactly one booking (button pending state + idempotency key).
  await chooseDate(page, "demo-siang-rafting", 5);
  await page.getByRole("button", { name: "Book now" }).dblclick();
  await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}$/);
  const bookingUrl = page.url();
  await expect(status(page)).toHaveText("Confirmed");
  await expect(page.getByTestId("booking-price").filter({ visible: true })).toContainText(
    "₹3,500 (confirmed)",
  );
  await page.goto("/bookings");
  await expect(page.getByRole("link", { name: "Siang river rafting (sample)" })).toHaveCount(1);

  // The partner sees the new booking, already confirmed, with nothing to answer.
  const providerEmail = uniqueEmail("provider");
  await signUp(page, providerEmail, "Rafting Guide", "partner");
  addMember(DEMO_PROVIDER, await currentUserId(page, "partner"));
  await page.goto("/provider/bookings");
  await expect(page.getByTestId("partner-new-bookings")).toBeVisible();
  const booked = page
    .getByTestId("provider-booking")
    .filter({ visible: true })
    .filter({ hasText: `Booker ${run}` });
  await expect(booked).toContainText("Confirmed");
  await booked.getByRole("link").click();
  await expect(page.getByText("+91 98765 43210")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm booking" })).toHaveCount(0);

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

  // The traveller sees the history (requested, then confirmed automatically), then cancels.
  await signIn(page, travelerEmail);
  await page.goto(bookingUrl);
  await expect(status(page)).toHaveText("Confirmed");
  await expect(
    page.getByTestId("booking-history").filter({ visible: true }).getByRole("listitem"),
  ).toHaveCount(2);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await expect(status(page)).toHaveText("Cancelled");
});

test("without a listed price, the partner's price waits for the traveller to accept", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const travelerEmail = uniqueEmail("approver");
  await signUp(page, travelerEmail, `Approver ${run}`);
  await chooseDate(page, "demo-pasighat-picnic", someDay());
  await page.getByRole("button", { name: "Request booking" }).click();
  await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}$/);
  const bookingUrl = page.url();
  await expect(status(page)).toHaveText("Awaiting provider confirmation");

  // No estimate: any total is a proposal, not a confirmation.
  await signUp(page, uniqueEmail("pricer"), "Pricing Guide", "partner");
  addMember(DEMO_PROVIDER, await currentUserId(page, "partner"));
  await page.goto(bookingUrl.replace("/bookings/", "/provider/bookings/"));
  await page.getByLabel(/Final price/).fill("5000");
  await page.getByLabel(/Message to the traveller/).fill("Peak-season permit fees");
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(status(page)).toHaveText("New price awaiting approval");
  await expect(page.getByTestId("price-proposal").filter({ visible: true })).toContainText(
    "You proposed ₹5,000",
  );
  await expect(page.getByRole("button", { name: "Confirm booking" })).toHaveCount(0);

  // The traveller sees the proposal and accepts it.
  await signIn(page, travelerEmail);
  await page.goto(bookingUrl);
  await expect(status(page)).toHaveText("New price awaiting approval");
  const proposal = page.getByTestId("price-proposal").filter({ visible: true });
  await expect(proposal).toContainText("₹5,000");
  await proposal.getByRole("button", { name: "Accept ₹5,000" }).click();
  await expect(status(page)).toHaveText("Confirmed");
  await expect(page.getByTestId("booking-price").filter({ visible: true })).toContainText(
    "₹5,000 (confirmed)",
  );
  await expect(page.getByText("Provider's message: Peak-season permit fees")).toBeVisible();
});

test("providers must give a reason to decline", async ({ page }) => {
  test.setTimeout(120_000);
  const travelerEmail = uniqueEmail("declined");
  await signUp(page, travelerEmail, "Hopeful");
  await chooseDate(page, "demo-pasighat-picnic", someDay());
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

test("providers add and close dates; closed dates can't be booked", async ({ page, browser }) => {
  test.setTimeout(120_000);
  // Published dates are shown to travellers (partners can't book), in a second browser.
  const traveller = await (await browser.newContext()).newPage();
  await signUp(traveller, uniqueEmail("date-viewer"), "Date Viewer");
  await signUp(page, uniqueEmail("scheduler"), "Scheduler", "partner");
  addMember(DEMO_PROVIDER, await currentUserId(page, "partner"));
  // The seed publishes every day; free one (days 56-59, which no other test books)
  // so the partner can add it again. Dates persist across local runs.
  const date = istDatePlus(56 + Math.floor(Math.random() * 4));
  const label = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

  const [picnic] = localSql(
    "select id from public.experiences where slug = 'demo-pasighat-picnic'",
  ) as Array<{ id: string }>;
  expect(picnic?.id).toMatch(UUID);
  localSql(
    `delete from public.availability_slots where experience_id = '${picnic!.id}' and starts_on = '${date}' returning id`,
  );
  // Dates are managed on the listing's own page in the partner portal.
  await page.goto(`/provider/listings/${picnic!.id}`);
  const manager = page.getByTestId("slot-manager").filter({ visible: true });
  await manager.getByLabel("Date").fill(date);
  await manager.getByLabel("Seats").fill("3");
  await manager.getByRole("button", { name: "Add date" }).click();
  await expect(manager.getByText("Date added.")).toBeVisible();
  await expect(manager.getByText(label)).toBeVisible();

  await traveller.goto("/experiences/demo-pasighat-picnic");
  const published = traveller.getByTestId("published-dates").filter({ visible: true });
  await expect(published.locator("option", { hasText: label })).toHaveCount(1);

  await page.goto(`/provider/listings/${picnic!.id}`);
  const row = page
    .getByTestId("slot-manager")
    .filter({ visible: true })
    .getByRole("listitem")
    .filter({ hasText: label });
  await row.getByRole("button", { name: "Close date" }).click();
  await expect(row).toContainText("closed");

  await traveller.goto("/experiences/demo-pasighat-picnic");
  await expect(traveller.getByRole("heading", { name: "Book", exact: true })).toBeVisible();
  await expect(
    traveller
      .getByTestId("published-dates")
      .filter({ visible: true })
      .locator("option", { hasText: label }),
  ).toHaveCount(0);
  await traveller.context().close();
});

test("providers can stop and resume booking requests for an experience", async ({ page }) => {
  test.setTimeout(120_000);
  const [owner] = localSql(
    "select provider_id from public.experiences where slug = 'demo-sangti-birding'",
  ) as Array<{ provider_id: string }>;
  expect(owner?.provider_id).toMatch(UUID);
  await signUp(page, uniqueEmail("toggler"), "Toggler", "partner");
  addMember(owner!.provider_id, await currentUserId(page, "partner"));

  await page.goto("/provider/listings");
  const row = page
    .getByTestId("listing-row")
    .filter({ visible: true })
    .filter({ hasText: "Sangti" });
  const toggle = row.getByRole("switch", { name: /Take booking requests for/ });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(row.getByTestId("booking-requests-state")).toHaveText(/Offline: not accepting/);

  await page.goto("/experiences/demo-sangti-birding");
  await expect(page.getByText(/isn.t taking bookings/)).toBeVisible();
  await expect(page.getByLabel("Date")).toHaveCount(0);

  // Restore: the local seed is shared across runs.
  await page.goto("/provider/listings");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(row.getByTestId("booking-requests-state")).toHaveText(/Online: accepting/);
});
