/**
 * Middleware: rate limiting.
 *
 * Spec section 38 rule 8 requires public APIs to be rate limited. This is a
 * fixed-window counter held in memory, which is honest about what it is: correct
 * for a single process, and not a distributed limit. A multi-instance deployment
 * would need Redis, and pretending otherwise would mean a limit that silently
 * multiplies by the instance count.
 *
 * The limits are per user where a session exists, and per IP otherwise, so one
 * user cannot exhaust the budget of everyone behind the same NAT — which is most
 * mobile carriers.
 */

import type { MiddlewareHandler } from "hono";

import { logger } from "../core/logging.js";

interface Bucket {
  count: number;
  /** When the window closes, as epoch milliseconds. */
  resetAt: number;
}

const WINDOW_MS = 60_000;

/**
 * Buckets keyed by identity.
 *
 * Swept on access rather than on a timer: a timer would need its own lifecycle,
 * and entries only matter while their window is open.
 */
const buckets = new Map<string, Bucket>();

function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** Rough bound so a burst of distinct keys cannot grow the map without limit. */
const MAX_BUCKETS = 10_000;

export interface RateLimitOptions {
  /** Requests allowed per window. */
  limit: number;
  /** Identifies the limit in a log line, e.g. 'auth' or 'write'. */
  name: string;
}

/**
 * Build a rate-limiting middleware.
 *
 * `getKey` lets a caller prefer the authenticated user and fall back to the IP, so
 * an unauthenticated request is still limited rather than being unlimited.
 */
export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
  const { limit, name } = options;

  return async (c, next) => {
    const now = Date.now();
    sweep(now);

    const identity =
      c.get("userId") ??
      ipFrom(c.req.header("x-forwarded-for"), c.req.header("x-real-ip"));

    // Over budget: answer 429 with the standard shape, and say when it resets so
    // a client can back off intelligently rather than guessing.
    const existing = buckets.get(identity);
    if (existing && existing.count >= limit) {
      const retryAfter = Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000),
      );
      c.header("Retry-After", String(retryAfter));
      logger.warn("ratelimit.exceeded", { bucket: name, retryAfter });
      return c.json(
        {
          code: "rate_limited",
          message: "Too many requests. Please try again shortly.",
        },
        429,
      );
    }

    if (existing) {
      existing.count += 1;
    } else {
      if (buckets.size >= MAX_BUCKETS) {
        // Evict the soonest-to-expire entry rather than refusing service.
        let oldestKey: string | null = null;
        let oldestAt = Infinity;
        for (const [key, bucket] of buckets) {
          if (bucket.resetAt < oldestAt) {
            oldestAt = bucket.resetAt;
            oldestKey = key;
          }
        }
        if (oldestKey) buckets.delete(oldestKey);
      }
      buckets.set(identity, { count: 1, resetAt: now + WINDOW_MS });
    }

    await next();
  };
}

/**
 * Best-effort client identity.
 *
 * `x-forwarded-for` may be a comma-separated chain, in which case the first entry
 * is the original client. A missing header yields a constant, which means such a
 * deployment shares one bucket — degraded, but bounded rather than unlimited.
 */
function ipFrom(
  forwarded: string | undefined,
  realIp: string | undefined,
): string {
  if (forwarded) return forwarded.split(",")[0].trim();
  if (realIp) return realIp.trim();
  return "unknown";
}

/** Reset the limiters. Test-only; production never calls this. */
export function resetRateLimits(): void {
  buckets.clear();
}
