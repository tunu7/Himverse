import { expect, test } from "@playwright/test";

test("home page renders the Himverse.AI placeholder", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Himverse.AI");
  await expect(page.getByRole("heading", { level: 1, name: "Himverse.AI" })).toBeVisible();
});
