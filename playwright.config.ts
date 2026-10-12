import { defineConfig, devices } from "@playwright/test";

// Dedicated port so E2E never runs against another local app on :3000.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

/**
 * E2E tests run against a production build (`next start`) so they exercise the
 * same output that is deployed. Run `npm run build` first.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    // Read-only checks against the seed run first, so specs that create or publish
    // data (e.g. the provider lifecycle) cannot change the counts they assert.
    {
      name: "discovery",
      testMatch: /discovery\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      testIgnore: /discovery\.spec\.ts/,
      dependencies: ["discovery"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run start -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: false,
    // Deterministic AI model for E2E (refused in production by getAiEnv).
    env: { AI_PROVIDER: "mock" },
    timeout: 120_000,
  },
});
