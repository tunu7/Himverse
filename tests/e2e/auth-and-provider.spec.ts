// Next.js 16 (Cache Components) keeps up to 3 previous routes mounted but hidden
// (React <Activity>), so test-id lookups only match visible elements.
import { expect, test } from "@playwright/test";

import { setUpTwoStep } from "./support";

test("protected pages redirect signed-out visitors to sign in", async ({ page }) => {
  await page.goto("/provider");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fprovider$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("a new partner can sign up, edit their profile and apply as a provider", async ({ page }) => {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const email = `e2e-${unique}@example.test`;

  await page.goto("/sign-up?as=partner");
  await page.getByLabel("Your name").fill("E2E Partner");
  await page.getByLabel("Email").fill(email);
  await page
    .getByLabel(/Password/)
    .first()
    .fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();

  // Partners set up two-step login before the portal opens.
  await setUpTwoStep(page, email, /\/provider$/);
  await page.goto("/provider/account");
  await expect(page.getByText(email)).toBeVisible();

  await page.getByLabel("Display name").fill("E2E Renamed");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

  // Not an admin: the admin area must not be revealed.
  await expect(page.getByRole("link", { name: /Admin/ })).toHaveCount(0);
  await page.goto("/admin/providers");
  await expect(page.getByText("This page could not be found.")).toBeVisible();

  await page.goto("/provider");
  await page.getByLabel("Business name").fill("E2E Treks");
  await page.getByLabel(/Short web address/).fill(`e2e-treks-${unique}`);
  await page.getByLabel("District").fill("Lower Subansiri");
  await page.getByLabel("Registered legal name").fill("E2E Treks Private Limited");
  await page.getByLabel("Contact email").fill(email);
  await page.getByRole("button", { name: "Save application as draft" }).click();

  await expect(page.getByTestId("provider-status").filter({ visible: true })).toContainText(
    "Draft",
  );
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByTestId("provider-status").filter({ visible: true })).toContainText(
    "Pending review",
  );
  await expect(page.getByRole("button", { name: "Submit for review" })).toHaveCount(0);
});

test("invalid credentials show a generic error", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("nobody@example.test");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Email or password is incorrect." }),
  ).toBeVisible();
});

test.describe("email confirmation links fail safely", () => {
  const cases: Record<string, string>[] = [
    {},
    { code: "not-a-real-code" },
    { token_hash: "bogus", type: "email" },
    { token_hash: "x", type: "admin" },
  ];
  for (const params of cases) {
    // `next` points off-site to also prove it is never followed.
    const query = new URLSearchParams({ ...params, next: "//evil.example" }).toString();
    test(`/auth/confirm?${query} redirects to sign-in with an error`, async ({ page }) => {
      await page.goto(`/auth/confirm?${query}`);
      await expect(page).toHaveURL(/\/sign-in\?error=confirmation_failed$/);
      await expect(
        page.getByRole("alert").filter({ hasText: "invalid or has expired" }),
      ).toBeVisible();
    });
  }
});
