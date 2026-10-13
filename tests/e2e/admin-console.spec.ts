import { expect, test } from "@playwright/test";

import { localSql, signUp, uniqueEmail, UUID } from "./support";

// Admin console: overview, destination curation and experience moderation, and
// that none of it is revealed to non-admins. Uses its own provider, destination
// and experience so the shared seed (counted by discovery tests) is untouched.

const run = `${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
const ids = {
  provider: crypto.randomUUID(),
  destination: crypto.randomUUID(),
  experience: crypto.randomUUID(),
};
const experienceTitle = `Admin console walk ${run}`;
const newDestinationName = `Console Valley ${run}`;
const newDestinationSlug = `console-valley-${run}`;
let adminId: string | undefined;

test.beforeAll(() => {
  // One statement per call, like the other specs.
  localSql(
    `insert into public.providers (id, slug, display_name, status, verified_at)
     values ('${ids.provider}', 'console-co-${run}', 'Console Co ${run}', 'verified', now())
     returning id`,
  );
  localSql(
    `insert into public.destinations (id, slug, name, district, is_published)
     values ('${ids.destination}', 'console-dest-${run}', 'Console Town ${run}', 'Tawang', true)
     returning id`,
  );
  localSql(
    `insert into public.experiences (id, provider_id, destination_id, slug, title, category, duration_minutes, price_from_minor, status)
     values ('${ids.experience}', '${ids.provider}', '${ids.destination}', 'console-walk-${run}', '${experienceTitle}', 'culture', 60, 10000, 'published')
     returning id`,
  );
});

test.afterAll(() => {
  localSql(`delete from public.experiences where id = '${ids.experience}' returning id`);
  localSql(
    `delete from public.destinations where id = '${ids.destination}' or slug = '${newDestinationSlug}' returning id`,
  );
  localSql(`delete from public.providers where id = '${ids.provider}' returning id`);
  if (adminId && UUID.test(adminId)) {
    localSql(`delete from public.user_roles where user_id = '${adminId}' returning user_id`);
  }
});

test("admin console: hidden from non-admins; overview, destinations and moderation work", async ({
  page,
}) => {
  test.setTimeout(120_000);

  // A signed-in non-admin sees no admin link and a plain 404.
  await signUp(page, uniqueEmail("console-admin"), "Console Admin");
  await expect(page.getByRole("link", { name: /Admin/ })).toHaveCount(0);
  for (const path of ["/admin", "/admin/destinations", "/admin/experiences", "/admin/bookings"]) {
    await page.goto(path);
    await expect(page.getByText("This page could not be found.")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Admin console" })).toHaveCount(0);
  }

  // Grant admin the runbook way (by Account ID, as the database owner).
  await page.goto("/account");
  adminId = (await page.getByTestId("account-id").filter({ visible: true }).textContent())?.trim();
  expect(adminId).toMatch(UUID);
  localSql(
    `insert into public.user_roles (user_id, role, granted_by) values ('${adminId}', 'admin', null) returning user_id`,
  );

  // Overview.
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Admin overview" })).toBeVisible();
  await expect(page.getByText("Providers awaiting review")).toBeVisible();
  // The console has its own frame, separate from the traveller site.
  await expect(page.getByRole("navigation", { name: "Admin console" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);

  // Destinations: create hidden, then publish it and see the public page.
  await page.goto("/admin/destinations");
  await page.getByText("Add a destination").click();
  const create = page.locator("details").filter({ hasText: "Add a destination" });
  await create.getByLabel("Name").fill(newDestinationName);
  await create.getByLabel("District").fill("West Kameng");
  await create.getByLabel("Web address (slug)").fill(newDestinationSlug);
  await create.getByRole("button", { name: "Create destination" }).click();
  await expect(create.getByText("Destination created.")).toBeVisible();

  await page.reload();
  const row = page.getByRole("listitem").filter({ hasText: newDestinationName });
  await expect(row.getByText("Hidden")).toBeVisible();
  await row.getByText(newDestinationName).click();
  await row.getByLabel(/Published/).check();
  await row.getByRole("button", { name: "Save destination" }).click();
  await expect(row.getByText("Destination saved.")).toBeVisible();
  await page.goto(`/destinations/${newDestinationSlug}`);
  await expect(page.getByRole("heading", { level: 1, name: newDestinationName })).toBeVisible();

  // Moderation: unpublish locks the experience and hides it publicly; publish restores.
  await page.goto(`/admin/experiences?q=${encodeURIComponent(`console walk ${run}`)}`);
  const item = page.getByRole("listitem").filter({ hasText: experienceTitle });
  await item.getByRole("button", { name: "Unpublish" }).click();
  await expect(item.getByText("Locked by moderation")).toBeVisible();
  await page.goto(`/experiences/console-walk-${run}`);
  await expect(page.getByRole("heading", { name: "Experience not found" })).toBeVisible();

  await page.goto(`/admin/experiences?q=${encodeURIComponent(`console walk ${run}`)}`);
  await page
    .getByRole("listitem")
    .filter({ hasText: experienceTitle })
    .getByRole("button", { name: "Publish" })
    .click();
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: experienceTitle })
      .getByText("Published", { exact: true }),
  ).toBeVisible();
  await page.goto(`/experiences/console-walk-${run}`);
  await expect(page.getByRole("heading", { level: 1, name: experienceTitle })).toBeVisible();

  // Bookings overview renders (read-only).
  await page.goto("/admin/bookings");
  await expect(page.getByRole("heading", { level: 1, name: "Bookings" })).toBeVisible();
});
