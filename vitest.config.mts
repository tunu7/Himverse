import { defineConfig } from "vitest/config";

// Unit tests only. Integration tests need a running local Supabase and use
// vitest.integration.config.mts (npm run test:integration).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
});
