/**
 * Middleware: session, rate limiting, idempotency and config version.
 *
 * Session lives here rather than in each route file because every game-state route
 * needs it, and a route that forgot to require one would return another user's
 * companion. The `userId` it puts on the context is what the rate limiter keys on,
 * which is why it runs first.
 */

import type { MiddlewareHandler } from "hono";

import { extractBearer, verifySession } from "../auth/session.js";
import {
  configForVersion,
  GAME_CONFIG_V1,
  type GameConfig,
} from "../engine/config.js";
import { logger } from "../core/logging.js";
import { ApiError } from "./errors.js";
import { rateLimit } from "./rate-limit.js";

/**
 * Declare the context types Hono threads through.
 *
 * Without this the handlers would read `c.get('userId')` as an `any`, and a typo
 * in the key would be a runtime undefined rather than a compile error.
 */
export type AppEnv = {
  Variables: {
    userId: string;
    sessionWallet: string | null;
    config: GameConfig;
  };
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Hono {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface ContextEnv extends AppEnv {}
  }
}

/**
 * Require a valid session.
 *
 * `GET /health` and the auth endpoints are exempt by being mounted outside it
 * rather than by a list here — a skip-list is one more thing to forget.
 */
/**
 * Paths served without a session.
 *
 * A Core metadata document is public on-chain by design: anyone holding the asset
 * must be able to fetch it, and it carries no user data. It is the only public
 * route under /v1.
 *
 * This has to be an explicit list. `gameRoutes` is mounted at /v1 with `use('*')`,
 * so its middleware also runs for /v1/metadata/* even though that router owns no
 * such route — an early version answered 401 for every metadata request for
 * exactly that reason. Enumerating the exception keeps the default safe: a new
 * route is protected unless it is named here.
 */
const PUBLIC_PATHS = ["/v1/metadata"];

export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (PUBLIC_PATHS.some((prefix) => c.req.path.startsWith(prefix))) {
    return next();
  }

  const token = extractBearer(c.req.header("authorization"));
  if (!token) throw new ApiError("unauthorized");

  const result = await verifySession(token);
  if (!result.ok) throw new ApiError("unauthorized");

  c.set("userId", result.session.userId);
  c.set("sessionWallet", result.session.walletAddress);

  await next();
};

/**
 * The config version the request is served under.
 *
 * Section 41 wants the version retained per event, not per request, so this is
 * about the *response*: the client is told which curve produced the numbers it is
 * looking at, so a balance change is legible rather than mysterious. Historic
 * events carry their own version on the row.
 */
export const withConfig: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("config", GAME_CONFIG_V1);
  await next();
};

/**
 * Section 38 rule 8.
 *
 * Tighter on writes than reads: a write costs a transaction and can move
 * progression, so a client looping on one is both expensive and a sign of a bug.
 */
/**
 * Read a limit from the environment, falling back to the production default.
 *
 * Exists so the limiter can be tested without a hundred real database round trips:
 * a flood test that spends the production budget is slow enough to look like a
 * hang. Overridable per deployment is independently useful, since a public edge
 * and an internal caller warrant different budgets.
 */
function limitFromEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const readRateLimit = rateLimit({
  limit: limitFromEnv("RATE_LIMIT_READ", 120),
  name: "read",
});
export const writeRateLimit = rateLimit({
  limit: limitFromEnv("RATE_LIMIT_WRITE", 30),
  name: "write",
});

/**
 * Reject a write that repeats an idempotency key already seen in this window.
 *
 * This is a *second* line of defence, not the primary one. The real replay
 * protection is the unique index on `activity_events.idempotency_key`, which works
 * across processes and forever. This catches a retried POST before it reaches the
 * database, which matters because a double-tapped button should be cheap rather
 * than merely correct.
 *
 * In memory and therefore per-process, which is acceptable for the same reason as
 * the rate limiter: the durable guarantee does not live here.
 */
const seenKeys = new Map<string, number>();

const KEY_TTL_MS = 60 * 60 * 1000;

export const idempotencyKey: MiddlewareHandler<AppEnv> = async (c, next) => {
  // Only writes carry one. A GET with the header is simply ignored.
  if (c.req.method !== "POST") return next();

  const key =
    c.req.header("idempotency-key") ?? c.req.header("x-idempotency-key");
  if (!key) {
    // Absent is not an error: the engine derives its own key from the event's
    // network, signature and type, which is the durable one.
    return next();
  }

  const now = Date.now();
  for (const [existing, at] of seenKeys) {
    if (at + KEY_TTL_MS <= now) seenKeys.delete(existing);
  }

  const identity = `${c.get("userId") ?? "anon"}:${key}`;

  if (seenKeys.has(identity)) {
    logger.info("idempotency.replayed", { key });
    return c.json(
      {
        code: "idempotent_replay",
        message: "That request was already processed.",
      },
      409,
    );
  }

  seenKeys.set(identity, now);
  await next();
};

/** Reset the replay window. Test-only. */
export function resetIdempotency(): void {
  seenKeys.clear();
}

export { configForVersion };
