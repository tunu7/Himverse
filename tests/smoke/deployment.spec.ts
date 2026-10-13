import { expect, test } from "@playwright/test";

// Read-only checks for a deployed environment (see playwright.smoke.config.ts).

test("health endpoint is ok, uncached and reports the release", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const body = await response.json();
  expect(body).toMatchObject({ status: "ok", checks: { database: "ok" } });
  test.info().annotations.push({ type: "release", description: String(body.release) });
});

test("security headers are served", async ({ request }) => {
  const headers = (await request.get("/")).headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["strict-transport-security"]).toContain("max-age=");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("public pages render without CSP violations or server errors", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  for (const path of ["/", "/experiences", "/destinations", "/sign-in"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  expect(problems).toEqual([]);
});

test("protected areas redirect signed-out visitors to sign in", async ({ page }) => {
  for (const path of ["/bookings", "/itineraries/new", "/provider", "/admin"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/sign-in\?next=/);
  }
});

test("unknown pages are not indexed", async ({ page }) => {
  await page.goto("/experiences/this-experience-does-not-exist");
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
});
