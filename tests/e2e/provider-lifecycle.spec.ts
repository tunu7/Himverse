import { execFileSync } from "node:child_process";

// Next.js 16 (Cache Components) keeps up to 3 previous routes mounted but hidden
// (React <Activity>), so test-id lookups only match visible elements.
import { expect, type Page, test } from "@playwright/test";

import { passTwoStep, setUpTwoStep, signUp } from "./support";

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

/** Sign-in without `next` lands by role: admins /admin, partners /provider, else /account. */
async function signIn(page: Page, email: string, landing: RegExp) {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Partners and admins pass two-step login (ADR-0007).
  await passTwoStep(page, email, landing);
}

async function visitExploreAnonymously(page: Page) {
  await page.context().clearCookies();
  // Newest first: the default order is by id, so a new listing can land on page 2.
  await page.goto("/experiences?sort=newest");
}

test.afterAll(() => {
  if (adminId && UUID.test(adminId)) {
    localSql(
      `delete from public.user_roles where user_id = '${adminId}' and role = 'admin' returning user_id`,
    );
  }
});

test("provider lifecycle: verify, publish, suspend", async ({ page }) => {
  // Two sign-ups with two-step setup, a review, publishing and a suspension.
  test.setTimeout(240_000);

  // Provider applies and submits for review.
  await signUp(page, providerEmail, "Lifecycle Provider", "partner");
  await page.goto("/provider");
  await page.getByLabel("Business name").fill(providerName);
  await page.getByLabel(/Short web address/).fill(`lifecycle-treks-${run}`);
  await page.getByLabel("Registered legal name").fill("Lifecycle Treks Pvt Ltd");
  await page.getByLabel("Contact email").fill(providerEmail);
  await page.getByRole("button", { name: "Save application as draft" }).click();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByTestId("provider-status").filter({ visible: true })).toContainText(
    "Pending review",
  );

  // A new account is not an admin.
  await signUp(page, adminEmail, "Lifecycle Admin", "traveller");
  await page.goto("/admin/providers");
  await expect(page.getByText("This page could not be found.")).toBeVisible();

  // Runbook: grant by the Account ID shown on /account.
  await page.goto("/account/settings");
  adminId = (await page.getByTestId("account-id").filter({ visible: true }).textContent())?.trim();
  expect(adminId).toMatch(UUID);
  const granted = localSql(
    `insert into public.user_roles (user_id, role, granted_by)
     select u.id, 'admin', null from auth.users u
     where u.id = '${adminId}' and u.email_confirmed_at is not null
     on conflict do nothing
     returning user_id`,
  );
  expect(granted).toHaveLength(1);

  // Role is read live: no re-login needed; admins set up two-step login first.
  await page.goto("/admin/providers");
  await setUpTwoStep(page, adminEmail, /\/admin\/providers$/);
  const card = page.getByRole("listitem").filter({ hasText: providerName });
  await expect(card).toContainText("Pending review");
  await expect(card).toContainText("Lifecycle Treks Pvt Ltd");
  await card.getByRole("button", { name: "Verify" }).click();
  await expect(card).toContainText("Verified");

  // Provider publishes an experience; it appears publicly.
  await signIn(page, providerEmail, /\/provider$/);
  await page.goto("/provider");
  await expect(page.getByTestId("provider-status").filter({ visible: true })).toContainText(
    "Verified",
  );
  // Listings live on their own page; the add form starts open when there are none.
  await page.goto("/provider/listings");
  await page.getByLabel("Title").fill(experienceTitle);
  await page.getByLabel("Short web address").fill(`lifecycle-walk-${run}`);
  await page.getByLabel("Destination").selectOption({ label: "Ziro Valley (Lower Subansiri)" });
  await page.getByLabel("Duration (minutes)").fill("120");
  await page.getByRole("button", { name: "Save as draft" }).click();
  // The new draft appears in the list (the add form folds away once there's a listing).
  const row = page
    .getByTestId("listing-row")
    .filter({ visible: true })
    .filter({ hasText: experienceTitle });
  await expect(row).toContainText("draft");
  await row.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(row).toContainText("published");
  await visitExploreAnonymously(page);
  await expect(page.getByText(experienceTitle)).toBeVisible();

  // Admin suspends; a note is required; the experience disappears publicly.
  await signIn(page, adminEmail, /\/admin$/);
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
  await signIn(page, providerEmail, /\/provider$/);
  await page.goto("/provider");
  await expect(page.getByTestId("provider-status").filter({ visible: true })).toContainText(
    "Suspended",
  );
  await expect(page.getByText("Reviewer note: Verification documents expired")).toBeVisible();
  await page.goto("/provider/listings");
  await expect(
    page
      .getByTestId("listing-row")
      .filter({ hasText: experienceTitle })
      .getByRole("button", { name: "Publish", exact: true }),
  ).toHaveCount(0);
});
