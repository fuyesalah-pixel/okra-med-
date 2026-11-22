import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Vitest does not read tsconfig `paths`; tests import app modules via "@/...".
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Better Auth validates these at module load; tests that sign in need them.
    env: {
      BETTER_AUTH_SECRET: "test-only-secret-not-used-outside-vitest-0123456789",
      BETTER_AUTH_URL: "http://localhost:3000",
    },
  },
});
