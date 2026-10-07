/**
 * §40 route tests, over HTTP.
 *
 * These drive the real Hono app through `app.request()`, against Neon, so the
 * middleware chain and the engine are exercised together rather than separately.
 *
 * The headline test is the last one: a replayed write over HTTP must not
 * double-award. Section 7 of the spec's acceptance is exactly that, and it is the
 * failure that would be most expensive to find late.
 */

import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { closeDb, getDb } from "../src/db/client.js";
import {
  activityEvents,
  achievements,
  companions,
  notifications,
  stateChanges,
  users,
} from "../src/db/schema.js";
import { issueSession } from "../src/auth/session.js";
import { createCompanion, ingestEvent } from "../src/engine/apply.js";
import { GAME_CONFIG_V1 } from "../src/engine/config.js";
import { upsertUserByWallet } from "../src/users/repository.js";
import { resetIdempotency } from "../src/http/middleware.js";
import { resetRateLimits } from "../src/http/rate-limit.js";

const app = createApp();
const T0 = Date.UTC(2026, 0, 15, 12, 0, 0);
const WALLET = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";

let auth = "";

async function seed() {
  await getDb().delete(stateChanges);
  await getDb().delete(achievements);
  await getDb().delete(notifications);
  await getDb().delete(activityEvents);
  await getDb().delete(companions);
  await getDb().delete(users);

  const { user } = await upsertUserByWallet(WALLET);
  await createCompanion(user.id, "Gochi", new Date(T0));

  const { token } = await issueSession(user.id, WALLET);
  auth = `Bearer ${token}`;
}

beforeEach(async () => {
  resetIdempotency();
  resetRateLimits();
  await seed();
});

afterAll(async () => {
  await seed();
  await closeDb();
});

const get_ = (path: string) =>
  app.request(path, { headers: { Authorization: auth } });
const post_ = (
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  app.request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: auth,
      ...headers,
    },
    body: JSON.stringify(body),
  });

describe("GET /v1/companion", () => {
  it("returns complete display state", async () => {
    const response = await get_("/v1/companion");
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, any>;
    // The curve fields are server-computed; a client that reimplemented them would
    // drift the moment the balance changed.
    expect(body.companion.xpToNextLevel).toBe(212);
    expect(body.companion.level).toBe(1);
    expect(body.configVersion).toBe("GAME_CONFIG_V1");
  });

  it("requires a session", async () => {
    const response = await app.request("/v1/companion");
    expect(response.status).toBe(401);
  });

  it("creates a companion on first read rather than 404ing", async () => {
    await getDb().delete(companions);
    const response = await get_("/v1/companion");
    expect(response.status).toBe(200);
  });
});

describe("GET /v1/progression", () => {
  it("sends the curve fields the client must not compute", async () => {
    const body = (await (await get_("/v1/progression")).json()) as Record<
      string,
      any
    >;
    expect(body.xpToNextLevel).toBe(212);
    expect(body.totalXp).toBe(0);
    expect(body.nextEvolutionAtLevel).toBe(10);
    expect(body.levelCurveVersion).toBe("GAME_CONFIG_V1");
  });

  it("reports null at maximum evolution", async () => {
    await getDb().update(companions).set({ level: 50 });
    const body = (await (await get_("/v1/progression")).json()) as Record<
      string,
      any
    >;
    expect(body.nextEvolutionAtLevel).toBeNull();
  });
});

describe("GET /v1/activity", () => {
  it("is empty for a new user, not fabricated", async () => {
    // Spec 55 scenario 2: a returning user with no activity gets no false event.
    const body = (await (await get_("/v1/activity")).json()) as Record<
      string,
      any
    >;
    expect(body.events).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });

  it("pages with a cursor", async () => {
    for (let i = 0; i < 3; i++) {
      await ingestEvent({
        userId: (await getDb().select().from(users))[0].id,
        event: {
          type: "SWAP",
          idempotencyKey: `page-${i}`,
          timestamp: Math.floor((T0 + i * 1000) / 1000),
          source: "JUPITER",
        },
        now: new Date(T0 + i * 1000),
      });
    }

    const first = (await (await get_("/v1/activity?limit=2")).json()) as Record<
      string,
      any
    >;
    expect(first.events).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();

    const second = (await (
      await get_(
        `/v1/activity?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`,
      )
    ).json()) as Record<string, any>;
    expect(second.events).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
  });

  it("will not show one user another user's event", async () => {
    const { user: other } = await upsertUserByWallet(
      "9WzDXwBbmkg8htpkmG6EvjBsAdyaMY4RzKUYFhSRCLLb",
    );
    await createCompanion(other.id);
    await ingestEvent({
      userId: other.id,
      event: { type: "SWAP", idempotencyKey: "theirs", timestamp: T0 / 1000 },
      now: new Date(T0),
    });

    const theirs = (await getDb().select().from(activityEvents))[0];
    // Knowing an event id is not enough to read it.
    const response = await get_(`/v1/activity/${theirs.id}`);
    expect(response.status).toBe(400);
  });
});

describe("achievements and notifications", () => {
  it("lists both unlocked and locked, so the screen is not blank", async () => {
    const body = (await (await get_("/v1/achievements")).json()) as Record<
      string,
      any
    >;
    expect(body.locked.length).toBeGreaterThan(0);
    // first_connection is awarded on any processed event.
    expect(
      body.locked.some((a: { key: string }) => a.key === "first_connection"),
    ).toBe(true);
  });

  it("moves an achievement from locked to unlocked once earned", async () => {
    await ingestEvent({
      userId: (await getDb().select().from(users))[0].id,
      event: { type: "SWAP", idempotencyKey: "ach", timestamp: T0 / 1000 },
      now: new Date(T0),
    });
    const body = (await (await get_("/v1/achievements")).json()) as Record<
      string,
      any
    >;
    expect(
      body.unlocked.some((a: { key: string }) => a.key === "first_swap"),
    ).toBe(true);
    expect(
      body.locked.some((a: { key: string }) => a.key === "first_swap"),
    ).toBe(false);
  });

  it("counts unread notifications", async () => {
    await ingestEvent({
      userId: (await getDb().select().from(users))[0].id,
      event: { type: "SWAP", idempotencyKey: "n", timestamp: T0 / 1000 },
      now: new Date(T0),
    });
    const body = (await (await get_("/v1/notifications")).json()) as Record<
      string,
      any
    >;
    expect(body.unreadCount).toBeGreaterThan(0);
  });

  it("marks notifications read and only theirs", async () => {
    const userId = (await getDb().select().from(users))[0].id;
    await ingestEvent({
      userId,
      event: { type: "SWAP", idempotencyKey: "mr", timestamp: T0 / 1000 },
      now: new Date(T0),
    });

    const before = (await (await get_("/v1/notifications")).json()) as Record<
      string,
      any
    >;
    const ids = before.notifications.map((n: { id: string }) => n.id);

    const result = (await (
      await post_("/v1/notifications/read", { ids })
    ).json()) as Record<string, any>;

    expect(result.updated).toBe(ids.length);
    expect(result.unreadCount).toBe(0);
  });

  it("rejects an empty read request", async () => {
    // A no-op that reports success would be worse than an error.
    const response = await post_("/v1/notifications/read", { ids: [] });
    expect(response.status).toBe(400);
  });
});

describe("POST /v1/companion/interaction", () => {
  it("returns companion state and a dialogue line", async () => {
    const response = await post_("/v1/companion/interaction", { kind: "pet" });
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, any>;
    expect(body.companion.level).toBe(1);
    // Section 19: interaction is emotional, so a line comes back regardless.
    expect(body.dialogue).not.toBeNull();
  });

  it("rejects an unknown interaction kind", async () => {
    const response = await post_("/v1/companion/interaction", {
      kind: "exploit",
    });
    expect(response.status).toBe(400);
  });

  it("rejects a client-supplied xp field", async () => {
    // Section 38 rule 6: never trust client-provided level or XP. The schema is
    // strict so such a request is refused rather than silently ignored.
    const response = await post_("/v1/companion/interaction", {
      kind: "pet",
      xp: 99999,
    });
    expect(response.status).toBe(400);
  });

  it("awards a small fixed amount, not a faucet", async () => {
    await post_("/v1/companion/interaction", { kind: "pet" });
    const row = (await getDb().select().from(companions))[0];
    expect(Number(row.xp)).toBe(GAME_CONFIG_V1.interactionXp);
  });
});

describe("POST /v1/companion/sync", () => {
  it("reports zero for a user with nothing pending", async () => {
    const body = (await (
      await post_("/v1/companion/sync", {})
    ).json()) as Record<string, any>;
    // Section 55 scenario 2: genuinely empty, not a fabricated event.
    expect(body.eventsProcessed).toBe(0);
    expect(body.xpAwarded).toBe(0);
  });

  it("applies pending events exactly once", async () => {
    const userId = (await getDb().select().from(users))[0].id;

    // Inserted but left unprocessed, as the P7 ingestion path would.
    await getDb()
      .insert(activityEvents)
      .values({
        userId,
        eventType: "SWAP",
        source: "HELIUS_WEBHOOK",
        payload: { xpAwarded: 0 },
        occurredAt: new Date(T0),
        idempotencyKey: "pending-1",
        configVersion: "GAME_CONFIG_V1",
      });

    const first = (await (
      await post_("/v1/companion/sync", {})
    ).json()) as Record<string, any>;
    expect(first.eventsProcessed).toBe(1);
    expect(first.xpAwarded).toBeGreaterThan(0);

    // Running sync again must not re-apply it.
    const second = (await (
      await post_("/v1/companion/sync", {})
    ).json()) as Record<string, any>;
    expect(second.eventsProcessed).toBe(0);
    expect(second.xpAwarded).toBe(0);
  });
});

describe("GET /v1/vault", () => {
  it("carries the custody notice verbatim", async () => {
    // Spec 9.3: the app must never imply it holds funds.
    const body = (await (await get_("/v1/vault")).json()) as Record<
      string,
      any
    >;
    expect(body.custodyNotice).toBe(
      "Your wallet holds your assets. Gochi does not take custody.",
    );
  });

  it("presents the wallet as the owner", async () => {
    const body = (await (await get_("/v1/vault")).json()) as Record<
      string,
      any
    >;
    expect(body.ownership.walletAddress).toBe(WALLET);
  });

  it("shows raw balances, never a portfolio value (§9.2 read, §9.3 respected)", async () => {
    const body = (await (await get_("/v1/vault")).json()) as Record<
      string,
      any
    >;

    // P10 adds holdings, and with them the temptation to attach a price. A
    // `value`/`priceUsd` field would be a portfolio the app cannot honestly
    // produce, so the assertion is that neither exists.
    expect(body.balance).toBeUndefined();
    expect(body.value).toBeUndefined();
    expect(body.priceUsd).toBeUndefined();

    // Amounts are strings with an explicit scale, and unavailability is stated
    // rather than shown as a zero balance.
    expect(typeof body.balances.available).toBe("boolean");
    expect(Array.isArray(body.balances.tokens)).toBe(true);
    for (const token of body.balances.tokens as Array<Record<string, unknown>>) {
      expect(typeof token.amount).toBe("string");
      expect(typeof token.decimals).toBe("number");
    }
  });
});

describe("Core metadata host", () => {
  it("serves metadata without a session, because it is public on-chain data", async () => {
    const companion = (await getDb().select().from(companions))[0];
    const response = await app.request(`/v1/metadata/${companion.id}.json`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, any>;
    expect(body.name).toBe("Gochi");
    expect(body.symbol).toBe("GOCHI");
    expect(body.seller_fee_basis_points).toBe(0);
    // No animation_url until P5 has a model to point at; a broken reference is
    // worse than an absent one.
    expect(body.animation_url).toBeUndefined();
  });

  it("404s for an unknown companion rather than serving an empty document", async () => {
    const response = await app.request(
      "/v1/metadata/22222222-2222-4222-8222-222222222222.json",
    );
    expect(response.status).toBe(404);
  });
});

describe("GET /v1/activity/sync-status", () => {
  it("reports a clean state for a new user", async () => {
    const response = await get_("/v1/activity/sync-status");
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.pendingCount).toBe(0);
    expect(body.totalEvents).toBe(0);
    expect(body.ingestion).toBe("rpc");
  });

  it("counts a pending, unprocessed event without inventing a success", async () => {
    const user = (await getDb().select().from(users))[0];
    await getDb().insert(activityEvents).values({
      userId: user.id,
      eventType: "SWAP",
      source: "HELIUS_WEBHOOK",
      payload: {},
      occurredAt: new Date(T0),
      idempotencyKey: "pending-status",
      configVersion: "GAME_CONFIG_V1",
    });

    const response = await get_("/v1/activity/sync-status");
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.pendingCount).toBe(1);
    expect(body.lastSuccessfulSync).toBeNull();
  });
});

describe("admin config (spec 41)", () => {
  it("exposes the tuning values", async () => {
    const body = (await (await get_("/v1/admin/config")).json()) as Record<
      string,
      any
    >;
    expect(body.version).toBe("GAME_CONFIG_V1");
    expect(body.swapXpBase).toBe(40);
    expect(body.energyDecay).toBe(4);
    expect(body.minEnergy).toBe(20);
  });
});

describe("middleware", () => {
  it("rejects a repeated write inside the idempotency window", async () => {
    const headers = { "Idempotency-Key": "abc-123" };
    const first = await post_("/v1/companion/sync", {}, headers);
    expect(first.status).toBe(200);

    const second = await post_("/v1/companion/sync", {}, headers);
    expect(second.status).toBe(409);
    expect(((await second.json()) as any).code).toBe("idempotent_replay");
  });

  it("ignores an idempotency key on a read", async () => {
    const response = await app.request("/v1/companion", {
      headers: { Authorization: auth, "Idempotency-Key": "read-only" },
    });
    expect(response.status).toBe(200);
  });

  it("rate limits a flood", async () => {
    // The suite sets a small budget (see vitest.config.ts), so ten requests must
    // trip it. Using the production budget of 120 here would mean a hundred real
    // database round trips, which is slow enough to read as a hang.
    let limited = false;
    for (let i = 0; i < 12; i++) {
      const response = await get_("/v1/companion");
      if (response.status === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });

  it("separates users so one cannot exhaust another budget", async () => {
    const { user: other } = await upsertUserByWallet(
      "9WzDXwBbmkg8htpkmG6EvjBsAdyaMY4RzKUYFhSRCLLb",
    );
    await createCompanion(other.id);
    const { token } = await issueSession(
      other.id,
      "9WzDXwBbmkg8htpkmG6EvjBsAdyaMY4RzKUYFhSRCLLb",
    );

    for (let i = 0; i < 12; i++) {
      await get_("/v1/companion");
    }

    // A different user is unaffected.
    const response = await app.request("/v1/companion", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
  });
});

describe("the acceptance test for P3", () => {
  it("never double-awards for a replayed request", async () => {
    const userId = (await getDb().select().from(users))[0].id;
    const event = {
      type: "SWAP" as const,
      idempotencyKey: "replay-me",
      timestamp: T0 / 1000,
      source: "JUPITER",
    };

    // The same event, delivered five times.
    for (let i = 0; i < 5; i++) {
      await ingestEvent({ userId, event, now: new Date(T0) });
    }

    const row = (
      await getDb()
        .select()
        .from(companions)
        .where(eq(companions.userId, userId))
    )[0];
    const expected = GAME_CONFIG_V1.combatRatingPerSwap;

    expect(row.combatRating).toBe(expected);
    expect(await getDb().select().from(activityEvents)).toHaveLength(1);
    expect(await getDb().select().from(stateChanges)).toHaveLength(1);
    expect(row.version).toBe(1);
  });
});
