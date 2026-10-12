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

async function requestRafting(page: Page, dateIndex: number) {
  await page.goto("/experiences/demo-siang-rafting");
  await page.getByLabel("Date").selectOption({ index: dateIndex });
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
  await requestRafting(page, 1);
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
  await signUp(page, providerEmail, "Rafting Guide");
  addMember(DEMO_PROVIDER, await currentUserId(page));
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
  await signUp(page, uniqueEmail("other-provider"), "Other Provider");
  addMember(OTHER_PROVIDER, await currentUserId(page));
  await page.goto(bookingUrl);
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
  await requestRafting(page, 2);
  await page.getByRole("button", { name: "Request booking" }).click();
  await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}$/);
  const bookingUrl = page.url();

  await signUp(page, uniqueEmail("decliner"), "Busy Guide");
  addMember(DEMO_PROVIDER, await currentUserId(page));
  await page.goto(bookingUrl);
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

test("providers add and close dates; closed dates can't be requested", async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page, uniqueEmail("scheduler"), "Scheduler");
  addMember(DEMO_PROVIDER, await currentUserId(page));
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

  await page.goto("/experiences/demo-pasighat-picnic");
  await expect(page.getByLabel("Date").locator("option", { hasText: label })).toHaveCount(1);

  await page.goto("/provider");
  const row = page
    .getByTestId("slot-manager")
    .filter({ visible: true })
    .filter({ hasText: "Pasighat riverside picnic (sample)" })
    .getByRole("listitem")
    .filter({ hasText: label });
  await row.getByRole("button", { name: "Close date" }).click();
  await expect(row).toContainText("closed");

  await page.goto("/experiences/demo-pasighat-picnic");
  await expect(page.getByText("No dates are open for booking yet.")).toBeVisible();
});
