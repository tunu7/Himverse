import { expect, test } from "@playwright/test";

import { currentUserId, localSql, signIn, signUp, uniqueEmail } from "./support";

// In-app booking alerts: the partner portal shows waiting requests on every
// page; the traveller sees partner replies until they open their bookings.

const DEMO_PROVIDER = "5eed0000-0000-4000-8000-0000000000a1"; // owns Siang rafting

function istDatePlus(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

test("partners see waiting requests; travellers see replies until they look", async ({ page }) => {
  test.setTimeout(180_000);
  const partnerEmail = uniqueEmail("alert-host");
  await signUp(page, partnerEmail, "Alert Host", "partner");
  const partnerId = await currentUserId(page, "partner");
  localSql(
    `insert into public.provider_members (provider_id, user_id) values ('${DEMO_PROVIDER}', '${partnerId}') returning user_id`,
  );

  const travellerEmail = uniqueEmail("alert-guest");
  await signUp(page, travellerEmail, "Alert Guest");
  await page.goto("/experiences/demo-siang-rafting");
  await page.getByLabel("Date").fill(istDatePlus(33));
  await page.getByLabel("Adults").fill("1");
  await page.getByLabel(/Contact phone/).fill("+91 98765 43210");
  await page.getByRole("button", { name: "Request booking" }).click();
  await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}$/);
  const bookingUrl = page.url();
  // Nothing new yet: the traveller's own request isn't an update.
  await page.goto("/account");
  await expect(page.getByTestId("account-alerts")).toHaveCount(0);

  // The partner sees the waiting request on any portal page.
  await signIn(page, partnerEmail, "partner");
  await page.goto("/provider/listings");
  const bar = page.getByTestId("partner-alerts").filter({ visible: true });
  await expect(bar).toContainText(/booking requests? needs? your reply/);
  await page.goto(bookingUrl.replace("/bookings/", "/provider/bookings/"));
  await page.getByLabel(/Final price/).fill("3000");
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByTestId("booking-status").filter({ visible: true })).toHaveText(
    "Confirmed",
  );

  // The traveller sees the reply in the menu and on their bookings, once.
  await signIn(page, travellerEmail);
  await expect(page.getByTestId("account-alerts")).toContainText("1");
  await page.goto("/bookings");
  await expect(page.getByTestId("booking-updates").filter({ visible: true })).toContainText(
    "1 booking has an update",
  );
  await expect(page.getByText("Updated", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect
    .poll(async () => {
      await page.goto("/account");
      return page.getByTestId("account-alerts").count();
    })
    .toBe(0);
});
