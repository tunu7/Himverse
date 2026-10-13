import { expect, test } from "@playwright/test";

test("home page introduces Himverse.AI and its main actions", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Himverse.AI");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Plan your Himalayan journey with trusted local experiences",
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Plan my trip with AI" })).toHaveAttribute(
    "href",
    "/itineraries/new",
  );
  // Featured experiences stream in from the catalogue.
  await expect(page.getByTestId("experience-card").first()).toBeVisible();
});
