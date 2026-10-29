import { expect, test } from "@playwright/test";

import {
  currentTotp,
  currentUserId,
  localSql,
  PASSWORD,
  signIn,
  signUp,
  uniqueEmail,
} from "./support";

const DEMO_PROVIDER = "5eed0000-0000-4000-8000-0000000000a1"; // owns Siang rafting

// Self-serve account deletion (ADR-0009): the password is re-checked, open
// bookings are cancelled and the rest kept anonymised for the partner.

function istDatePlus(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

test("a traveller deletes their account; their booking is cancelled and anonymised", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const email = uniqueEmail("leaver");
  await signUp(page, email, "Leaving Traveller");
  const userId = await currentUserId(page);

  await page.goto("/experiences/demo-siang-rafting");
  await page.getByLabel("Date").selectOption(istDatePlus(40));
  await page.getByLabel("Adults").fill("1");
  await page.getByLabel(/Contact phone/).fill("+91 98765 43210");
  await page.getByRole("button", { name: "Book now" }).click();
  await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}$/);
  const bookingId = page.url().split("/").at(-1);

  await page.goto("/account/settings");
  const danger = page
    .locator("details")
    .filter({ hasText: "Delete account" })
    .filter({ visible: true });
  await danger.locator("summary").click();

  // A wrong password or a missing confirmation is refused.
  await danger.getByLabel("Your password").fill("not-my-password");
  await danger.getByLabel("Type DELETE to confirm").fill("DELETE");
  await danger.getByRole("button", { name: "Delete my account" }).click();
  await expect(danger.getByText("That isn't your current password.")).toBeVisible();
  await danger.getByLabel("Your password").fill(PASSWORD);
  await danger.getByLabel("Type DELETE to confirm").fill("nope");
  await danger.getByRole("button", { name: "Delete my account" }).click();
  await expect(danger.getByText('Type "DELETE" to confirm.')).toBeVisible();

  // The form clears after each attempt (React form actions), so both are re-entered.
  await danger.getByLabel("Your password").fill(PASSWORD);
  await danger.getByLabel("Type DELETE to confirm").fill("DELETE");
  await danger.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/account-deleted$/);
  await expect(page.getByRole("heading", { name: "Your account has been deleted" })).toBeVisible();

  // Signed out, and the login is gone.
  await page.goto("/account");
  await expect(page).toHaveURL(/\/sign-in/);
  expect(localSql(`select id from auth.users where id = '${userId}'`)).toHaveLength(0);
  expect(
    localSql(
      `select status, traveler_name, contact_phone from public.bookings where id = '${bookingId}' and traveler_id is null`,
    ),
  ).toEqual([{ status: "cancelled", traveler_name: "Deleted traveller", contact_phone: "" }]);

  // The partner still has the (anonymised) booking in their list.
  const partnerEmail = uniqueEmail("leaver-host");
  await signUp(page, partnerEmail, "Leaver Host", "partner");
  const partnerId = await currentUserId(page, "partner");
  localSql(
    `insert into public.provider_members (provider_id, user_id) values ('${DEMO_PROVIDER}', '${partnerId}') returning user_id`,
  );
  await page.goto("/provider/bookings?view=all");
  await expect(
    page
      .getByTestId("provider-booking")
      .filter({ visible: true })
      .filter({ has: page.locator(`a[href="/provider/bookings/${bookingId}"]`) }),
  ).toContainText("Deleted traveller");
  await page.goto(`/provider/bookings/${bookingId}`);
  await expect(
    page.getByText("Not available (the traveller deleted their account)").filter({ visible: true }),
  ).toBeVisible();
  localSql(`delete from public.provider_members where user_id = '${partnerId}' returning user_id`);
});

test("a partner with two-step login confirms deletion with an authenticator code", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const email = uniqueEmail("leaving-partner");
  await signUp(page, email, "Leaving Partner", "partner");
  const userId = await currentUserId(page, "partner");
  // Codes are single-use per 30 s period: wait for the next one.
  await page.waitForTimeout(31_000);
  await signIn(page, email, "partner");
  await page.goto("/provider/account");
  const danger = page
    .locator("details")
    .filter({ hasText: "Delete account" })
    .filter({ visible: true });
  await danger.locator("summary").click();
  await expect(danger.getByLabel("Your password")).toHaveCount(0);
  await page.waitForTimeout(31_000);
  await danger.getByLabel(/6-digit code/).fill(currentTotp(email));
  await danger.getByLabel("Type DELETE to confirm").fill("DELETE");
  await danger.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/account-deleted$/);
  expect(localSql(`select id from auth.users where id = '${userId}'`)).toHaveLength(0);
});
