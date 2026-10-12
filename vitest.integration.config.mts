import { defineConfig } from "vitest/config";

// Integration tests against the local Supabase stack (`npx supabase start`).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
