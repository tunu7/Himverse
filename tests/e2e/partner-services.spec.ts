import { expect, type Page, test } from "@playwright/test";

import { signUp, uniqueEmail } from "./support";

// The partner dashboard adapts to what a business offers, and partners switch
// listings online/offline one at a time or a whole type at once. A fresh,
// unverified business works only with drafts, so nothing here is public.

const run = `${Date.now() % 1_000_000}`;

async function addStay(page: Page, title: string, slug: string) {
  const add = page.locator("details#add-listing");
  // An open <details> has open="" (falsy), so ask the element itself.
  if (!(await add.evaluate((d) => (d as HTMLDetailsElement).open))) {
    await add.locator("summary").click();
  }
  await expect(add.getByLabel("What are you listing?")).toHaveValue("stay");
  await add.getByLabel("Title").fill(title);
  await add.getByLabel("Short web address").fill(slug);
  await add.getByLabel("Destination").selectOption({ label: "Pasighat (East Siang)" });
  await add.getByLabel("Rooms of this type").fill("2");
  await add.getByLabel("Guests per room").fill("3");
  await add.getByRole("button", { name: "Save as draft" }).click();
  await expect(
    page.getByTestId("listing-row").filter({ visible: true }).filter({ hasText: title }),
  ).toBeVisible();
}

test("partner services: pick a service, switch listings online and offline", async ({ page }) => {
  test.setTimeout(180_000);
  const email = uniqueEmail("services");
  await signUp(page, email, "Services Host", "partner");

  await page.goto("/provider");
  await page.getByLabel("Business name").fill(`Hilltop Homestay ${run}`);
  await page.getByLabel(/Short web address/).fill(`hilltop-homestay-${run}`);
  await page.getByLabel("Registered legal name").fill("Hilltop Homestay");
  await page.getByLabel("Contact email").fill(email);
  await page.getByRole("button", { name: "Save application as draft" }).click();

  // No listings yet: the dashboard asks what the business offers.
  await page.getByRole("link", { name: /Homestays and rooms/ }).click();
  await expect(page).toHaveURL(/\/provider\/listings\?type=stay/);

  await addStay(page, `Valley room ${run}`, `valley-room-${run}`);
  await addStay(page, `Garden room ${run}`, `garden-room-${run}`);

  const group = page.getByTestId("listing-group-stay");
  await expect(group).toContainText("Stays (2)");
  const switches = group.getByRole("switch");
  await expect(switches).toHaveCount(2);
  for (const s of await switches.all()) await expect(s).toHaveAttribute("aria-checked", "true");

  // Season closed: every stay goes offline at once.
  await group.getByRole("button", { name: "Take all stays offline" }).click();
  for (const s of await switches.all()) await expect(s).toHaveAttribute("aria-checked", "false");
  await expect(group.getByRole("button", { name: "Put all stays online" })).toBeVisible();

  // One room reopens on its own.
  const valley = group.getByRole("switch", {
    name: `Take booking requests for Valley room ${run}`,
  });
  await valley.click();
  await expect(valley).toHaveAttribute("aria-checked", "true");
  await expect(
    group.getByTestId("listing-row").filter({ hasText: `Valley room ${run}` }),
  ).toContainText("Online: will accept booking requests once it goes live");

  // The dashboard now summarises the business by what it offers.
  await page.goto("/provider");
  const services = page.getByTestId("partner-services");
  await expect(services).toContainText("Stays");
  await expect(services).toContainText("0 taking requests · 0 published · 2 total");
  await expect(services).not.toContainText("Guides");
});
