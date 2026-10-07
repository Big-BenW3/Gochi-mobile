/**
 * §8.4 no-spam and §28.2 preference tests.
 *
 * The no-spam rule is the acceptance criterion for P8 — "a meaningful event
 * produces exactly one contextual message; cooldowns enforce the no-spam rule" —
 * so it is tested at both levels: the pure decision, and the database behaviour
 * it produces through the engine.
 */

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createCompanion, ingestEvent } from "../src/engine/apply.js";
import { decideDialogue } from "../src/dialogue/guard.js";
import { renderLine, templateFor } from "../src/dialogue/templates.js";
import {
  allowsNotification,
  capReached,
  DEFAULT_PREFS,
  inQuietHours,
  type Prefs,
} from "../src/notifications/prefs.js";
import { closeDb, getDb } from "../src/db/client.js";
import {
  companions,
  notifications,
  activityEvents,
  stateChanges,
  users,
} from "../src/db/schema.js";
import { upsertUserByWallet } from "../src/users/repository.js";
import type { NormalizedEvent } from "../src/engine/engine.js";

const T0 = Date.UTC(2026, 0, 15, 12, 0, 0);
const MINUTE = 60_000;

let userId = "";

async function reset() {
  await getDb().delete(stateChanges);
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

describe("dialogue templates (§8.3)", () => {
  it("has an authored line for every template the engine emits", () => {
    for (const key of ["swap_encouragement", "staking_energy", "shield_recovered"]) {
      expect(renderLine(key).length).toBeGreaterThan(0);
    }
  });

  it("varies the line deterministically by seed", () => {
    expect(renderLine("swap_encouragement", 0)).not.toBe(
      renderLine("swap_encouragement", 1),
    );
  });

  it("gives level-up and evolution critical priority (§28.1)", () => {
    expect(templateFor("level_up").priority).toBe("critical");
    expect(templateFor("evolved").priority).toBe("critical");
  });
});

describe("decideDialogue (§8.4)", () => {
  const now = new Date(T0);

  it("posts a first line", () => {
    expect(decideDialogue("swap_encouragement", [], 1, now)).toEqual({ action: "post" });
  });

  it("suppresses the same template inside the cooldown", () => {
    const recent = [{ templateKey: "swap_encouragement", createdAt: new Date(T0 - 10_000) }];
    expect(decideDialogue("swap_encouragement", recent, 1, now)).toEqual({
      action: "suppress",
    });
  });

  it("allows the same template again after the cooldown", () => {
    const recent = [{ templateKey: "swap_encouragement", createdAt: new Date(T0 - 61_000) }];
    expect(decideDialogue("swap_encouragement", recent, 1, now)).toEqual({
      action: "post",
    });
  });

  it("folds a burst into one summary carrying the real count", () => {
    const recent = [
      { templateKey: "swap_encouragement", createdAt: new Date(T0 - 3 * MINUTE) },
      { templateKey: "swap_encouragement", createdAt: new Date(T0 - 2 * MINUTE) },
    ];
    const decision = decideDialogue("swap_encouragement", recent, 10, now);
    expect(decision).toEqual({ action: "burst", count: 10 });
  });

  it("updates the open summary instead of adding another one", () => {
    const recent = [
      { templateKey: "swap_burst", createdAt: new Date(T0 - MINUTE) },
      { templateKey: "swap_encouragement", createdAt: new Date(T0 - 2 * MINUTE) },
    ];
    expect(decideDialogue("swap_encouragement", recent, 12, now)).toEqual({
      action: "burst",
      count: 12,
    });
  });

  it("never cools down a critical line", () => {
    const recent = [{ templateKey: "level_up", createdAt: new Date(T0 - 1_000) }];
    expect(decideDialogue("level_up", recent, 1, now)).toEqual({ action: "post" });
  });
});

describe("notification preferences (§28.2)", () => {
  const prefs = (over: Partial<Prefs> = {}): Prefs => ({ ...DEFAULT_PREFS, ...over });

  it("lets critical through even with everything muted", () => {
    expect(
      allowsNotification(prefs({ systemEnabled: false }), "critical", "system", 3),
    ).toBe(true);
  });

  it("honours category toggles", () => {
    expect(allowsNotification(prefs({ dialogueEnabled: false }), "normal", "dialogue", 12)).toBe(
      false,
    );
    expect(allowsNotification(prefs({ systemEnabled: false }), "high", "system", 12)).toBe(
      false,
    );
  });

  it("silences only normal priority during quiet hours", () => {
    const quiet = prefs({ quietStartHour: 22, quietEndHour: 7 });
    expect(inQuietHours(quiet, 23)).toBe(true);
    expect(inQuietHours(quiet, 3)).toBe(true); // wraps past midnight
    expect(inQuietHours(quiet, 12)).toBe(false);
    expect(allowsNotification(quiet, "normal", "dialogue", 23)).toBe(false);
    expect(allowsNotification(quiet, "critical", "system", 23)).toBe(true);
  });

  it("treats a same-hour window as disabled rather than always quiet", () => {
    expect(inQuietHours(prefs({ quietStartHour: 9, quietEndHour: 9 }), 9)).toBe(false);
  });

  it("caps non-critical notifications at the daily limit", () => {
    expect(capReached(prefs({ dailyCap: 3 }), 2)).toBe(false);
    expect(capReached(prefs({ dailyCap: 3 }), 3)).toBe(true);
  });
});

describe("engine dialogue emission (integration)", () => {
  function swap(key: string, atMs: number): NormalizedEvent {
    return {
      type: "SWAP",
      idempotencyKey: key,
      timestamp: Math.floor(atMs / 1000),
      source: "JUPITER",
      signature: `sig-${key}`,
    };
  }

  it("writes an authored line, not a bare template key", async () => {
    await ingestEvent({ userId, event: swap("d1", T0), now: new Date(T0) });
    const [row] = await getDb()
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId));
    expect(row.type).toBe("dialogue");
    expect(row.body.length).toBeGreaterThan(0);
  });

  it("does not repeat the same line inside the cooldown", async () => {
    await ingestEvent({ userId, event: swap("c1", T0), now: new Date(T0) });
    await ingestEvent({
      userId,
      event: swap("c2", T0 + 5_000),
      now: new Date(T0 + 5_000),
    });
    const rows = await getDb()
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId));
    const lines = rows.filter((r) => r.title === "swap_encouragement");
    expect(lines).toHaveLength(1);
  });

  it("collapses a burst into a single summary line", async () => {
    for (let i = 0; i < 6; i += 1) {
      await ingestEvent({
        userId,
        event: swap(`b${i}`, T0 + i * 20_000),
        now: new Date(T0 + i * 20_000),
      });
    }
    const rows = await getDb()
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId));
    const bursts = rows.filter((r) => r.title === "swap_burst");
    expect(bursts).toHaveLength(1);
    expect(bursts[0].body).toContain("I definitely noticed");
    // Six swaps must not produce six companion lines.
    const lines = rows.filter((r) => r.title === "swap_encouragement");
    expect(lines.length).toBeLessThanOrEqual(2);
  });
});
