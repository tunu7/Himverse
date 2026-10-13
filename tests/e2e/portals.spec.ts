import { expect, test } from "@playwright/test";

import { PASSWORD, uniqueEmail } from "./support";

// Travellers, tourism partners and admins have separate areas with their own
// navigation (admin is covered in admin-console.spec.ts).

test("traveller sign-up lands on the account page inside the traveller site", async ({ page }) => {
  await page.goto("/sign-up");
  // Focused auth layout: no site navigation.
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  await page.getByLabel("Your name").fill("Portal Traveller");
  await page.getByLabel("Email").fill(uniqueEmail("portal-traveller"));
  await page.getByLabel(/Password/).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Partner portal" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Admin/ })).toHaveCount(0);

  // Account menu offers travel links and partnering, never the admin console.
  await page.getByText("Account", { exact: true }).click();
  await expect(page.getByRole("link", { name: "My trips" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Become a tourism partner" })).toBeVisible();
});

test("partner sign-up lands in the separate partner portal", async ({ page }) => {
  await page.goto("/sign-up?as=partner");
  await expect(page.getByRole("link", { name: "Tourism partner" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.getByLabel("Your name").fill("Portal Partner");
  await page.getByLabel("Email").fill(uniqueEmail("portal-partner"));
  await page.getByLabel(/Password/).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/provider$/);
  await expect(page.getByRole("navigation", { name: "Partner portal" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "Partner dashboard" })).toBeVisible();
  await expect(page.getByLabel("Business name")).toBeVisible();
});

test("signed-out visitors to the partner portal are sent to sign in", async ({ page }) => {
  await page.goto("/provider/bookings");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fprovider%2Fbookings$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
});
