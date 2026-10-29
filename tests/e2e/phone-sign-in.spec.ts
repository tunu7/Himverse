import { expect, type Page, test } from "@playwright/test";

import { localSql, signUp, uniqueEmail } from "./support";

// Phone sign-in with SMS codes (ADR-0011). The local stack uses fixed test codes
// for +91 9999 0000 01-03 (supabase/config.toml); no SMS is sent. Needs
// NEXT_PUBLIC_AUTH_PHONE_ENABLED=true at build time and the server key for the
// request limiter (`npm run env:local` writes both).

const CODE = "123456";

test.beforeAll(() => {
  // Shared local stack: start each run from fresh numbers and counters.
  localSql(
    "delete from auth.users where phone in ('919999000001', '919999000002', '919999000003') returning id",
  );
  localSql("delete from private.request_rate_limits returning bucket");
});

async function openPhoneForm(page: Page, path: string) {
  await page.goto(path);
  await page.getByText("Use your mobile number instead").click();
  const form = page.getByTestId("phone-sign-in").filter({ visible: true });
  await form.getByLabel("Country").selectOption("IN");
  return form;
}

test("a traveller signs up with a phone number and an SMS code", async ({ page }) => {
  test.setTimeout(90_000);
  const form = await openPhoneForm(page, "/sign-up");
  await form.getByLabel("Mobile number").fill("99990 00001");
  await form.getByRole("button", { name: "Text me a code" }).click();
  await expect(form.getByRole("status")).toContainText("+919999000001");
  await expect(form.getByRole("button", { name: /Send a new code in \d+s/ })).toBeDisabled();

  // A wrong code is refused without revealing anything else.
  await form.getByLabel("6-digit code").fill("000000");
  await form.getByRole("button", { name: "Continue" }).click();
  await expect(form.getByRole("alert")).toContainText("wrong or has expired");

  await form.getByLabel("6-digit code").fill(CODE);
  await form.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/account$/);
  const [profile] = localSql(
    "select p.account_type from public.profiles p join auth.users u on u.id = p.id where u.phone = '919999000001'",
  ) as Array<{ account_type: string }>;
  expect(profile?.account_type).toBe("traveller");
});

test("invalid numbers are refused before any SMS is sent", async ({ page }) => {
  const form = await openPhoneForm(page, "/sign-in");
  await form.getByLabel("Mobile number").fill("12345");
  await form.getByRole("button", { name: "Text me a code" }).click();
  await expect(form.getByText("Enter a valid mobile number for the chosen country.")).toBeVisible();
});

test("the same number can't be texted again within the cooldown", async ({ page }) => {
  test.setTimeout(90_000);
  const form = await openPhoneForm(page, "/sign-in");
  await form.getByLabel("Mobile number").fill("9999000002");
  await form.getByRole("button", { name: "Text me a code" }).click();
  await expect(form.getByRole("status")).toContainText("+919999000002");

  // A second request for the same number from a fresh page hits the 60-second cooldown.
  const again = await openPhoneForm(page, "/sign-in");
  await again.getByLabel("Mobile number").fill("9999000002");
  await again.getByRole("button", { name: "Text me a code" }).click();
  await expect(again.getByRole("alert")).toContainText(
    /Too many attempts\. Please wait \d+ seconds/,
  );
});

test("a signed-in traveller adds a phone number with a code", async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page, uniqueEmail("phone-link"), "Phone Linker");
  await page.goto("/account/settings");
  const link = page.getByTestId("phone-link").filter({ visible: true });
  await expect(link).toContainText("not added");
  await link.getByLabel("Country").selectOption("IN");
  await link.getByLabel("Mobile number").fill("9999000003");
  await link.getByRole("button", { name: "Add number" }).click();
  await link.getByLabel("6-digit code").fill(CODE);
  await link.getByRole("button", { name: "Confirm number" }).click();
  await expect(link.getByRole("status")).toContainText("Number confirmed");
  await page.reload();
  await expect(page.getByTestId("phone-link").filter({ visible: true })).toContainText(
    "+919999000003",
  );
});
