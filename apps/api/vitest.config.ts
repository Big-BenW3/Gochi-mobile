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
    /**
     * Generous, because these are integration tests over a real network.
     *
     * Each transaction is a round trip to Neon, so a case that ingests fifteen
     * events takes tens of seconds. The earlier 30s produced a timeout that read
     * as a failure while the behaviour under test was fine — and a timeout is a
     * poor thing to leave ambiguous, because it is indistinguishable from a
     * deadlock.
     */
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
