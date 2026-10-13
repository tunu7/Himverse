import { expect, test } from "@playwright/test";

test("health endpoint reports the database as reachable and is never cached", async ({
  request,
}) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.json()).toMatchObject({ status: "ok", checks: { database: "ok" } });
});
