import { execFileSync } from "node:child_process";

import { expect, type Page, test } from "@playwright/test";

// Critical journey: apply → admin verifies → provider publishes → visible on /explore →
// admin suspends → hidden. Admin is granted the way the runbook does it (database owner,
// by Account ID), against the LOCAL stack only (`--local`), and revoked afterwards.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const password = "correct-horse-battery";
const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const providerEmail = `lifecycle-provider-${run}@example.test`;
const adminEmail = `lifecycle-admin-${run}@example.test`;
const providerName = `Lifecycle Treks ${run}`;
const experienceTitle = `Lifecycle walk ${run}`;

let adminId: string | undefined;

// The CLI's output depends on its environment: without --output-format it prints a
// text table (CI) and with it a bare JSON array, but inside an AI-agent session it
// wraps rows as { rows: [...] }. Accept both JSON shapes; fail loudly on anything else.
function localSql(sql: string): unknown[] {
  const out = execFileSync(
    "npx",
    ["supabase", "db", "query", "--local", "--output-format", "json", sql],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  const parsed: unknown = JSON.parse(out);
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { rows?: unknown }).rows)) {
    return (parsed as { rows: unknown[] }).rows;
  }
  throw new Error(`Unexpected supabase db query output: ${out.slice(0, 200)}`);
}

async function signUp(page: Page, email: string, name: string) {
  await page.context().clearCookies();
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/Password/).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function visitExploreAnonymously(page: Page) {
  await page.context().clearCookies();
  await page.goto("/explore");
}

test.afterAll(() => {
  if (adminId && UUID.test(adminId)) {
    localSql(
      `delete from public.user_roles where user_id = '${adminId}' and role = 'admin' returning user_id`,
    );
  }
});

test("provider lifecycle: verify, publish, suspend", async ({ page }) => {
  test.setTimeout(120_000);

  // Provider applies and submits for review.
  await signUp(page, providerEmail, "Lifecycle Provider");
  await page.goto("/provider");
  await page.getByLabel("Business name").fill(providerName);
  await page.getByLabel(/Short web address/).fill(`lifecycle-treks-${run}`);
  await page.getByLabel("Registered legal name").fill("Lifecycle Treks Pvt Ltd");
  await page.getByLabel("Contact email").fill(providerEmail);
  await page.getByRole("button", { name: "Save application as draft" }).click();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByTestId("provider-status")).toContainText("Pending review");

  // A new account is not an admin.
  await signUp(page, adminEmail, "Lifecycle Admin");
  await page.goto("/admin/providers");
  await expect(page.getByText("This page could not be found.")).toBeVisible();

  // Runbook: grant by the Account ID shown on /account.
  await page.goto("/account");
  adminId = (await page.getByTestId("account-id").textContent())?.trim();
  expect(adminId).toMatch(UUID);
  const granted = localSql(
    `insert into public.user_roles (user_id, role, granted_by)
     select u.id, 'admin', null from auth.users u
     where u.id = '${adminId}' and u.email_confirmed_at is not null
     on conflict do nothing
     returning user_id`,
  );
  expect(granted).toHaveLength(1);

  // Role is read live: no re-login needed.
  await page.goto("/admin/providers");
  const card = page.getByRole("listitem").filter({ hasText: providerName });
  await expect(card).toContainText("Pending review");
  await expect(card).toContainText("Lifecycle Treks Pvt Ltd");
  await card.getByRole("button", { name: "Verify" }).click();
  await expect(card).toContainText("Verified");

  // Provider publishes an experience; it appears publicly.
  await signIn(page, providerEmail);
  await page.goto("/provider");
  await expect(page.getByTestId("provider-status")).toContainText("Verified");
  await page.getByText("Add an experience").click();
  await page.getByLabel("Title").fill(experienceTitle);
  await page.getByLabel("Short web address").fill(`lifecycle-walk-${run}`);
  await page.getByLabel("Destination").selectOption({ label: "Ziro Valley (Lower Subansiri)" });
  await page.getByLabel("Duration (minutes)").fill("120");
  await page.getByRole("button", { name: "Save as draft" }).click();
  const row = page.getByRole("listitem").filter({ hasText: experienceTitle });
  await row.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(row).toContainText("published");
  await visitExploreAnonymously(page);
  await expect(page.getByText(experienceTitle)).toBeVisible();

  // Admin suspends; a note is required; the experience disappears publicly.
  await signIn(page, adminEmail);
  await page.goto("/admin/providers");
  const card2 = page.getByRole("listitem").filter({ hasText: providerName });
  await card2.getByRole("button", { name: "Suspend" }).click();
  await expect(card2.getByRole("alert")).toBeVisible();
  await card2.getByLabel(/Note/).fill("Verification documents expired");
  await card2.getByRole("button", { name: "Suspend" }).click();
  await expect(card2).toContainText("Suspended");
  await visitExploreAnonymously(page);
  await expect(page.getByText(experienceTitle)).toHaveCount(0);

  // Provider sees the suspension and cannot republish.
  await signIn(page, providerEmail);
  await page.goto("/provider");
  await expect(page.getByTestId("provider-status")).toContainText("Suspended");
  await expect(page.getByText("Reviewer note: Verification documents expired")).toBeVisible();
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: experienceTitle })
      .getByRole("button", { name: "Publish", exact: true }),
  ).toHaveCount(0);
});
