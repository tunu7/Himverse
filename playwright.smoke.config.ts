import { defineConfig, devices } from "@playwright/test";

/**
 * Read-only smoke checks against a DEPLOYED environment (staging, or production
 * right after a release). They never sign in or write data.
 *
 *   STAGING_BASE_URL=https://staging.example.com npm run test:smoke
 *
 * Locally, use http://localhost:<port>, not 127.0.0.1: the CSP's
 * upgrade-insecure-requests makes the browser request sub-resources over HTTPS
 * except on localhost.
 */
const baseURL = process.env.STAGING_BASE_URL;
if (!baseURL) {
  throw new Error("Set STAGING_BASE_URL to the deployment to check.");
}

export default defineConfig({
  testDir: "./tests/smoke",
  forbidOnly: Boolean(process.env.CI),
  retries: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
