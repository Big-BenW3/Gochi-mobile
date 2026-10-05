/**
 * The Hono application.
 *
 * Kept separate from `index.ts` so tests can import the app and drive it with
 * `app.request()` without a port being opened as a side effect of importing.
 * `index.ts` is the only module that listens.
 *
 * Only the identity routes are mounted. The rest of spec section 40 —
 * `/v1/companion`, `/v1/progression`, `/v1/activity`, `/v1/achievements`,
 * `/v1/notifications`, `/v1/vault` — arrive with the game engine in P2 and P3.
 * Mounting them now would mean inventing response shapes nothing has defined.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";

import { env } from "./env.js";
import { logger } from "./core/logging.js";
import { authRoutes, sessionRoutes } from "./http/identity-routes.js";
import { ApiError } from "./http/errors.js";
import { gameRoutes, metadataRoutes } from "./http/game-routes.js";

export function createApp() {
  const app = new Hono();

  /**
   * CORS, development only.
   *
   * A native client is not governed by CORS, so this exists for browser-based
   * tooling during development. Returning the request's own origin rather than
   * `*` keeps the response cacheable per-origin and avoids the wildcard-plus-
   * credentials combination, which is a thing worth not having in the codebase.
   */
  app.use(
    "/v1/*",
    cors({
      origin: (origin) => {
        // Native clients send no Origin header. Rejecting those would break the app.
        if (!origin) return origin;
        return env.nodeEnv === "production" ? null : origin;
      },
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "OPTIONS"],
    }),
  );

  /**
   * Liveness. Deliberately does not touch the database, so a green `/health`
   * means the process is up, not that Neon is reachable.
   */
  app.get("/health", (c) => c.json({ ok: true }));

  app.route("/v1/auth", authRoutes);
  // /v1/me and /v1/genesis from identity, then the ten §40 game-state routes.
  app.route("/v1", sessionRoutes);
  app.route("/v1", gameRoutes);

  // Unauthenticated: a Core metadata document is public on-chain by design, since
  // anyone holding the asset must be able to fetch it. It carries no user data.
  app.route("/v1/metadata", metadataRoutes);

  /** Unmatched paths answer in the same error shape as everything else. */
  app.notFound((c) =>
    c.json({ code: "invalid_request", message: "Not found." }, 404),
  );

  /** Anything a handler did not catch. */
  app.onError((error, c) => {
    // An ApiError thrown by middleware — a missing session, a rate limit — is a
    // deliberate refusal, not a fault. Without this it answers 500, telling the
    // client the server is broken when the request was merely unauthenticated.
    if (error instanceof ApiError) {
      return c.json(error.toBody(), error.status as never);
    }

    logger.error("server.unhandled", {
      reason: error instanceof Error ? error.message : "unknown",
      path: c.req.path,
    });
    return c.json(
      {
        code: "internal_error",
        message: "Something went wrong. Please try again.",
      },
      500,
    );
  });

  return app;
}

export const app = createApp();
