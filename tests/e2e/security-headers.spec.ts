import { expect, test } from "@playwright/test";

// Security headers are set for every route (next.config.ts) and the CSP must not
// break real pages: any CSP violation reported by the browser fails the test.

test("security headers are present", async ({ request }) => {
  for (const path of ["/", "/experiences", "/sign-in", "/itineraries/new"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    const headers = response.headers();
    expect(headers["content-security-policy"], path).toContain("frame-ancestors 'none'");
    expect(headers["content-security-policy"], path).toContain("object-src 'none'");
    expect(headers["strict-transport-security"], path).toContain("max-age=");
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["x-frame-options"], path).toBe("DENY");
    expect(headers["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(headers["x-powered-by"], path).toBeUndefined();
  }
});

test("the CSP doesn't break pages or forms", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to (load|execute|apply|connect)/i.test(message.text())) {
      violations.push(message.text());
    }
  });
  // Blocked or wrongly upgraded requests (e.g. a protected-link prefetch redirected
  // to https on a plain-HTTP build). Aborted prefetches are normal and ignored.
  const failedRequests: string[] = [];
  page.on("requestfailed", (request) => {
    const error = request.failure()?.errorText ?? "";
    if (!error.includes("ERR_ABORTED")) failedRequests.push(`${request.url()} ${error}`);
  });
  for (const path of [
    "/",
    "/destinations",
    "/experiences?category=culture",
    "/experiences/demo-siang-rafting",
    "/sign-up",
  ]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  // Client navigation and a client-side form interaction still work.
  await page.getByRole("link", { name: "Experiences" }).first().click();
  await expect(page).toHaveURL(/\/experiences$/);
  expect(violations).toEqual([]);
  expect(failedRequests).toEqual([]);
});
