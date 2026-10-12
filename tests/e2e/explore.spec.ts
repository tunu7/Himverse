import { expect, test } from "@playwright/test";

// Relies on supabase/seed.sql (local stack / CI). Two seeded experiences are
// live; two others must stay hidden (unpublished destination, unverified provider).
test("anonymous visitors see only intentionally public experiences", async ({ page }) => {
  await page.goto("/explore");

  const cards = page.getByTestId("experience-card");
  await expect(cards).toHaveCount(2);
  await expect(page.getByText("Apatani village walk (sample)")).toBeVisible();
  await expect(page.getByText("Dirang hot springs half day (sample)")).toBeVisible();
  await expect(page.getByText(/Mechuka trek/)).toHaveCount(0);
  await expect(page.getByText(/Tawang tour/)).toHaveCount(0);
});
