import { defineConfig, devices } from "@playwright/test";

// Dedicated port so E2E never runs against another local app on :3000.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

// Fake, test-only Razorpay credentials shared by the app and the fake API server
// (and by payments.spec.ts to sign webhooks). Not real keys.
export const FAKE_RAZORPAY_PORT = 4010;
export const RAZORPAY_TEST_KEYS = {
  RAZORPAY_KEY_ID: "rzp_test_E2EFAKEKEY1",
  RAZORPAY_KEY_SECRET: "e2e-fake-key-secret",
  RAZORPAY_WEBHOOK_SECRET: "e2e-fake-webhook-secret",
};
export const E2E_CRON_SECRET = "e2e-fake-cron-secret-0001";

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
  webServer: [
    {
      // Stand-in for Razorpay's API (tests/e2e/fake-razorpay.mjs); never the real service.
      command: "node tests/e2e/fake-razorpay.mjs",
      url: `http://127.0.0.1:${FAKE_RAZORPAY_PORT}/health`,
      reuseExistingServer: false,
      env: { ...RAZORPAY_TEST_KEYS, FAKE_RAZORPAY_PORT: String(FAKE_RAZORPAY_PORT) },
      timeout: 30_000,
    },
    {
      command: `npm run start -- --port ${PORT}`,
      url: baseURL,
      reuseExistingServer: false,
      // Deterministic AI model for E2E. `next start` is a production build, so the
      // mock must be allowed explicitly (always refused on Vercel production).
      env: {
        AI_PROVIDER: "mock",
        AI_ALLOW_MOCK: "true",
        ...RAZORPAY_TEST_KEYS,
        RAZORPAY_API_BASE: `http://127.0.0.1:${FAKE_RAZORPAY_PORT}`,
        CRON_SECRET: E2E_CRON_SECRET,
      },
      timeout: 120_000,
    },
  ],
});
