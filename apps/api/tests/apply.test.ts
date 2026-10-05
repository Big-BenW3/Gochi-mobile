/**
 * Engine persistence tests.
 *
 * These need a real database, because the properties under test *are* database
 * properties: that a duplicate event cannot award twice, and that a partial
 * failure leaves nothing behind. A mocked transaction would assert nothing about
 * either.
 */

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createCompanion, ingestEvent } from "../src/engine/apply.js";
import { GAME_CONFIG_V1 } from "../src/engine/config.js";
import { closeDb, getDb } from "../src/db/client.js";
import {
  achievements,
  activityEvents,
  companions,
  notifications,
  stateChanges,
  users,
} from "../src/db/schema.js";
import { upsertUserByWallet } from "../src/users/repository.js";
import type { NormalizedEvent } from "../src/engine/engine.js";

const T0 = Date.UTC(2026, 0, 15, 12, 0, 0);

let userId = "";

function swap(key: string, atMs = T0): NormalizedEvent {
  return {
    type: "SWAP",
    idempotencyKey: key,
    timestamp: Math.floor(atMs / 1000),
    source: "JUPITER",
    signature: `sig-${key}`,
  };
}

async function reset() {
  await getDb().delete(stateChanges);
  await getDb().delete(achievements);
  await getDb().delete(notifications);
  await getDb().delete(activityEvents);
  await getDb().delete(companions);
  await getDb().delete(users);
  const { user } = await upsertUserByWallet(
    "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T",
  );
  userId = user.id;
  await createCompanion(userId, "Gochi", new Date(T0));
}

beforeEach(reset);

afterAll(async () => {
  await reset();
  await closeDb();
});

describe("companion creation", () => {
  it("creates exactly one companion per user", async () => {
    const first = await createCompanion(userId);
    const second = await createCompanion(userId);
    expect(second.id).toBe(first.id);
    expect(await getDb().select().from(companions)).toHaveLength(1);
  });

  it("starts at level 1 with full energy", async () => {
    const c = await createCompanion(userId);
    expect(c.level).toBe(1);
    expect(c.energy).toBe(100);
    expect(c.condition).toBe("HEALTHY");
    expect(c.configVersion).toBe(GAME_CONFIG_V1.version);
  });
});

describe("event ingestion", () => {
  it("applies a swap and persists the patch", async () => {
    const result = await ingestEvent({
      userId,
      event: swap("k1"),
      now: new Date(T0),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outcome).toBe("applied");

    const row = await getDb()
      .select()
      .from(companions)
      .where(eq(companions.userId, userId));
    expect(row[0].combatRating).toBe(GAME_CONFIG_V1.combatRatingPerSwap);
    expect(row[0].aura).toBe(GAME_CONFIG_V1.auraPerSwap);
    expect(row[0].version).toBe(1);
  });

  it("records the config version on the companion and the event", async () => {
    await ingestEvent({ userId, event: swap("k1"), now: new Date(T0) });

    const row = await getDb()
      .select()
      .from(companions)
      .where(eq(companions.userId, userId));
    expect(row[0].configVersion).toBe("GAME_CONFIG_V1");

    const events = await getDb().select().from(activityEvents);
    expect(events[0].configVersion).toBe("GAME_CONFIG_V1");
    expect(events[0].processedAt).not.toBeNull();
  });

  it("writes a state change with before and after", async () => {
    await ingestEvent({ userId, event: swap("k1"), now: new Date(T0) });

    const changes = await getDb().select().from(stateChanges);
    expect(changes).toHaveLength(1);
    expect(changes[0].reason).toBe("SWAP");
    expect(changes[0].beforeState).toMatchObject({ combatRating: 0 });
    expect(changes[0].afterState).toMatchObject({
      combatRating: GAME_CONFIG_V1.combatRatingPerSwap,
    });
  });
});

describe("replay protection (spec 24.4, scenario 5)", () => {
  it("awards nothing for a duplicated event", async () => {
    const first = await ingestEvent({
      userId,
      event: swap("dup"),
      now: new Date(T0),
    });
    expect(first.ok).toBe(true);

    const second = await ingestEvent({
      userId,
      event: swap("dup"),
      now: new Date(T0),
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe("duplicate");

    // One event, one state change, one increment.
    expect(await getDb().select().from(activityEvents)).toHaveLength(1);
    expect(await getDb().select().from(stateChanges)).toHaveLength(1);
    const row = await getDb()
      .select()
      .from(companions)
      .where(eq(companions.userId, userId));
    expect(row[0].combatRating).toBe(GAME_CONFIG_V1.combatRatingPerSwap);
  });

  it("is safe under concurrent delivery of the same event", async () => {
    // This is the case a check-then-act implementation fails: both requests see
    // the key as unprocessed, and both award. The unique index decides instead.
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        ingestEvent({ userId, event: swap("race"), now: new Date(T0) }),
      ),
    );

    const applied = results.filter((r) => r.ok);
    expect(applied).toHaveLength(1);

    expect(await getDb().select().from(activityEvents)).toHaveLength(1);
    const row = await getDb()
      .select()
      .from(companions)
      .where(eq(companions.userId, userId));
    expect(row[0].combatRating).toBe(GAME_CONFIG_V1.combatRatingPerSwap);
  });

  it("does not re-unlock an achievement on a different event", async () => {
    await ingestEvent({ userId, event: swap("a1"), now: new Date(T0) });
    const before = (await getDb().select().from(achievements)).length;

    await ingestEvent({ userId, event: swap("a2"), now: new Date(T0 + 1000) });

    const keys = (await getDb().select().from(achievements)).map(
      (a) => a.achievementKey,
    );
    expect(new Set(keys).size).toBe(keys.length);
    // First swap is still one row, however many swaps arrive.
    expect(keys.filter((k) => k === "first_swap")).toHaveLength(1);
    expect(before).toBeGreaterThan(0);
  });
});

describe("daily caps across events (spec 6.2)", () => {
  it("stops at the swap cap over many distinct events", async () => {
    // Distinct keys, so the replay guard is not what stops it — the cap is.
    for (let i = 0; i < 15; i++) {
      await ingestEvent({
        userId,
        event: swap(`cap-${i}`, T0 + i * 1000),
        now: new Date(T0 + i * 1000),
      });
    }

    const events = await getDb().select().from(activityEvents);
    const awarded = events.reduce(
      (sum, e) =>
        sum + Number((e.payload as { xpAwarded?: number }).xpAwarded ?? 0),
      0,
    );
    expect(awarded).toBeLessThanOrEqual(GAME_CONFIG_V1.swapDailyCap);
  });

  it("resets the cap on the next UTC day", async () => {
    await ingestEvent({ userId, event: swap("d1"), now: new Date(T0) });

    const nextDay = new Date(T0 + 86_400_000 + 1000);
    await ingestEvent({
      userId,
      event: swap("d2", nextDay.getTime()),
      now: nextDay,
    });

    const events = await getDb().select().from(activityEvents);
    const day2 = events.find((e) => e.idempotencyKey === "d2");
    expect(
      Number((day2?.payload as { xpAwarded?: number }).xpAwarded ?? 0),
    ).toBeGreaterThan(0);
  });
});

describe("optimistic concurrency (spec 24.5)", () => {
  it("bumps the version on every applied write", async () => {
    await ingestEvent({ userId, event: swap("v1"), now: new Date(T0) });
    await ingestEvent({
      userId,
      event: swap("v2", T0 + 1000),
      now: new Date(T0 + 1000),
    });

    const row = await getDb()
      .select()
      .from(companions)
      .where(eq(companions.userId, userId));
    expect(row[0].version).toBe(2);
  });
});

describe("notifications and dialogue", () => {
  it("writes a critical notification on level-up", async () => {
    await ingestEvent({
      userId,
      event: {
        type: "INTERACTION",
        idempotencyKey: "lv",
        timestamp: T0 / 1000,
      },
      now: new Date(T0),
      config: { ...GAME_CONFIG_V1, interactionXp: 500, dailyXpCap: 10_000 },
    });

    const rows = await getDb().select().from(notifications);
    const levelUp = rows.find((n) => n.type === "level_up");
    expect(levelUp).toBeDefined();
    expect((levelUp?.payload as { priority: string }).priority).toBe(
      "critical",
    );
  });

  it("stores dialogue as a queue the client drains", async () => {
    await ingestEvent({ userId, event: swap("dlg"), now: new Date(T0) });
    const rows = await getDb().select().from(notifications);
    expect(rows.some((n) => n.type === "dialogue")).toBe(true);
  });
});

describe("honesty under failure (scenario 7)", () => {
  it("leaves the shield untouched when the security signal is unknown", async () => {
    await ingestEvent({
      userId,
      event: {
        type: "SECURITY_EVENT",
        idempotencyKey: "sec1",
        timestamp: T0 / 1000,
        shieldSignal: "unknown",
      },
      now: new Date(T0),
    });

    const row = await getDb()
      .select()
      .from(companions)
      .where(eq(companions.userId, userId));
    expect(row[0].shieldHealth).toBe(100);
    expect(row[0].shieldDurability).toBe(100);

    const rows = await getDb().select().from(notifications);
    // Section 7.4, verbatim — never a fabricated score.
    expect(rows.some((n) => n.body === "Security status unavailable.")).toBe(
      true,
    );
  });
});
