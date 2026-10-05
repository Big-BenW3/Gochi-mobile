import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    /**
     * Single fork, deliberately.
     *
     * These tests share one Neon database and truncate the `users` table between
     * cases, so running files in parallel would have them deleting each other's
     * rows. Correctness over wall-clock time: the suite is small.
     */
    // Top-level in Vitest 4+; the old nested `poolOptions` form was removed.
    pool: "forks",
    maxWorkers: 1,
    // Mainnet RPC calls are slow and occasionally rate-limited.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
