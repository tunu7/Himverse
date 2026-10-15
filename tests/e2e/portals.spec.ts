import { expect, test } from "@playwright/test";

import { PASSWORD, setUpTwoStep, uniqueEmail } from "./support";

// Travellers, tourism partners and admins have separate areas with their own
// navigation (admin is covered in admin-console.spec.ts).

test("traveller sign-up lands on the account page inside the traveller site", async ({ page }) => {
  await page.goto("/sign-up");
  // Focused auth layout: no site navigation.
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  await page.getByLabel("Your name").fill("Portal Traveller");
  await page.getByLabel("Email").fill(uniqueEmail("portal-traveller"));
  await page
    .getByLabel(/Password/)
    .first()
    .fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Partner portal" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Admin/ })).toHaveCount(0);

  // Account menu offers only travel links: no partner portal, no admin console.
  const header = page.getByRole("navigation", { name: "Main" });
  await header.getByText("Account", { exact: true }).click();
  await expect(header.getByRole("link", { name: "My trips" })).toBeVisible();
  await expect(header.getByRole("link", { name: /partner/i })).toHaveCount(0);
  await page.goto("/account/settings");
  await expect(page.getByTestId("account-type").filter({ visible: true })).toHaveText(
    "Traveller account",
  );

  // The partner portal isn't theirs: sent back to their own area.
  await page.goto("/provider");
  await expect(page).toHaveURL(/\/account$/);
});

test("partner sign-up lands in the separate partner portal", async ({ page }) => {
  await page.goto("/sign-up?as=partner");
  await expect(page.getByRole("link", { name: "Tourism partner" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const email = uniqueEmail("portal-partner");
  await page.getByLabel("Your name").fill("Portal Partner");
  await page.getByLabel("Email").fill(email);
  await page
    .getByLabel(/Password/)
    .first()
    .fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await setUpTwoStep(page, email, /\/provider$/);
  await expect(page.getByRole("navigation", { name: "Partner portal" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "Partner dashboard" })).toBeVisible();
  await expect(page.getByLabel("Business name")).toBeVisible();

  // Traveller areas aren't theirs (one role per account): sent back to the portal.
  for (const path of ["/account", "/itineraries/new", "/bookings"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/provider$/);
  }
  // Public pages stay browsable, but booking is for traveller accounts.
  await page.goto("/experiences/demo-siang-rafting");
  await expect(page.getByTestId("booking-not-for-account").filter({ visible: true })).toBeVisible();
  await expect(page.getByLabel("Date")).toHaveCount(0);
  // Their own settings live inside the portal.
  await page.goto("/provider/account");
  await expect(page.getByTestId("account-type").filter({ visible: true })).toHaveText(
    "Partner account",
  );
});

test("signed-out visitors to the partner portal are sent to sign in", async ({ page }) => {
  await page.goto("/provider/bookings");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fprovider%2Fbookings$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
});
