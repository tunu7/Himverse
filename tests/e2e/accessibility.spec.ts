import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { localSql, setUpTwoStep, signUp, uniqueEmail, UUID } from "./support";

// Automated WCAG 2.1 A/AA checks (axe-core) on every area, in light and dark
// themes. Automated checks find roughly a third of accessibility problems;
// keyboard and screen-reader passes remain manual (docs/engineering/ACCESSIBILITY.md).

const DEMO_PROVIDER = "5eed0000-0000-4000-8000-0000000000a1";

// Check content at rest: scroll-reveal animations make entering cards briefly translucent.
test.use({ reducedMotion: "reduce" });

async function expectAccessible(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const problems = results.violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 3).map((n) => `${n.target.join(" ")}: ${n.failureSummary ?? ""}`),
  }));
  expect(problems, `${path} has accessibility violations`).toEqual([]);
}

const PUBLIC = [
  "/",
  "/destinations",
  "/destinations/ziro",
  "/experiences",
  "/experiences/demo-siang-rafting",
  "/stays",
  "/guides",
  "/transport",
  "/privacy",
  "/terms",
  "/sign-in",
  "/sign-up",
  "/sign-up?as=partner",
  "/forgot-password",
  "/account-deleted",
];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("public pages", async ({ page }) => {
      test.setTimeout(180_000);
      for (const path of PUBLIC) await expectAccessible(page, path);
    });

    test("traveller pages", async ({ page }) => {
      test.setTimeout(180_000);
      await signUp(page, uniqueEmail(`a11y-${scheme}`), "A11y Traveller");
      for (const path of [
        "/account",
        "/account/settings",
        "/bookings",
        "/itineraries",
        "/itineraries/new",
      ]) {
        await expectAccessible(page, path);
      }
    });
  });
}

test("partner portal", async ({ page }) => {
  test.setTimeout(180_000);
  await signUp(page, uniqueEmail("a11y-partner"), "A11y Partner", "partner");
  await page.goto("/provider/account");
  const id = (await page.getByTestId("account-id").filter({ visible: true }).textContent())?.trim();
  expect(id).toMatch(UUID);
  localSql(
    `insert into public.provider_members (provider_id, user_id) values ('${DEMO_PROVIDER}', '${id}') returning user_id`,
  );
  for (const path of [
    "/provider",
    "/provider/listings",
    "/provider/bookings",
    "/provider/business",
    "/provider/account",
  ]) {
    await expectAccessible(page, path);
  }
});

test("admin console", async ({ page }) => {
  test.setTimeout(180_000);
  const email = uniqueEmail("a11y-admin");
  await signUp(page, email, "A11y Admin");
  await page.goto("/account/settings");
  const id = (await page.getByTestId("account-id").filter({ visible: true }).textContent())?.trim();
  expect(id).toMatch(UUID);
  localSql(
    `insert into public.user_roles (user_id, role, granted_by) values ('${id}', 'admin', null) returning user_id`,
  );
  try {
    await page.goto("/admin");
    await setUpTwoStep(page, email, /\/admin$/);
    for (const path of [
      "/admin",
      "/admin/providers",
      "/admin/destinations",
      "/admin/experiences",
      "/admin/bookings",
      "/admin/users",
      "/admin/account",
    ]) {
      await expectAccessible(page, path);
    }
  } finally {
    localSql(`delete from public.user_roles where user_id = '${id}' returning user_id`);
  }
});
