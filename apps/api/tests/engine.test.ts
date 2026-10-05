/**
 * Engine tests.
 *
 * Covers the spec section 43 unit list and the section 55 scenario matrix, with
 * `now` injected rather than read so a daily cap is actually testable.
 *
 * `engine.test.ts` holds the pure-function cases; `apply.test.ts` covers the
 * transactional paths that need a database.
 */

import { describe, expect, it } from "vitest";

import {
  GAME_CONFIG_V1,
  conditionSchema,
  gameConfigSchema,
} from "../src/engine/config.js";
import {
  evolutionStageForLevel,
  process,
  swapXp,
  totalXpToReachLevel,
  utcDayIndex,
  xpToNextLevel,
  type CompanionState,
  type NormalizedEvent,
} from "../src/engine/engine.js";

/**
 * One day, in both units.
 *
 * Previously a single `DAY = 86_400` was used for `timestamp` (seconds) *and*
 * for `new Date(T0 + DAY_MS)` (milliseconds), so a "day" in the second place was
 * 86 seconds and no decay period ever elapsed. Two names, because conflating
 * them hid five failing assertions behind one wrong constant.
 */
const DAY_SECONDS = 86_400;
const DAY_MS = 86_400_000;
const T0 = Date.UTC(2026, 0, 15, 12, 0, 0);

/** A fresh level-1 companion. */
function freshState(overrides: Partial<CompanionState> = {}): CompanionState {
  return {
    level: 1,
    xp: 0,
    energy: 100,
    shieldHealth: 100,
    shieldDurability: 100,
    combatRating: 0,
    aura: 0,
    condition: "HEALTHY",
    evolutionStage: 1,
    lastDecayAt: new Date(T0),
    lastStakingCycleAt: null,
    dailyXp: { swap: 0, stake: 0, other: 0, visitedAt: null },
    dailySwapCount: 0,
    dayIndex: utcDayIndex(T0 / 1000),
    ...overrides,
  };
}

function swapEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    type: "SWAP",
    idempotencyKey: `swap-${Math.random()}`,
    timestamp: T0 / 1000,
    source: "JUPITER",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Section 43: XP calculations
// ---------------------------------------------------------------------------

describe("XP curve (spec 6.3)", () => {
  it("matches floor(120 + 80L + 12L^2) exactly", () => {
    // Worked by hand rather than recomputing the formula, so a change to the
    // implementation cannot quietly agree with a change to the test.
    expect(xpToNextLevel(1, GAME_CONFIG_V1)).toBe(212);
    expect(xpToNextLevel(2, GAME_CONFIG_V1)).toBe(328);
    expect(xpToNextLevel(3, GAME_CONFIG_V1)).toBe(468);
    expect(xpToNextLevel(10, GAME_CONFIG_V1)).toBe(2120);
    expect(xpToNextLevel(50, GAME_CONFIG_V1)).toBe(34_120);
  });

  it("increases monotonically", () => {
    for (let level = 1; level < 50; level++) {
      expect(xpToNextLevel(level + 1, GAME_CONFIG_V1)).toBeGreaterThan(
        xpToNextLevel(level, GAME_CONFIG_V1),
      );
    }
  });

  it("accumulates a coherent total", () => {
    const toTen = totalXpToReachLevel(10, GAME_CONFIG_V1);
    const toNine = totalXpToReachLevel(9, GAME_CONFIG_V1);
    expect(toTen - toNine).toBe(xpToNextLevel(9, GAME_CONFIG_V1));
  });
});

// ---------------------------------------------------------------------------
// Section 43: daily caps
// ---------------------------------------------------------------------------

describe("swap XP (spec 7.2)", () => {
  it("starts at the base award", () => {
    expect(swapXp(0, GAME_CONFIG_V1)).toBe(40);
  });

  it("scales by 5% per prior swap, to a ceiling of 2x", () => {
    // 40 * 1.05 = 42
    expect(swapXp(1, GAME_CONFIG_V1)).toBe(42);
    // 40 * 1.10 = 44
    expect(swapXp(2, GAME_CONFIG_V1)).toBe(44);
  });

  it("never exceeds the frequency multiplier ceiling", () => {
    // 1 + 100*0.05 = 6.0, clamped to 2.0 -> 40 * 2 = 80
    expect(swapXp(100, GAME_CONFIG_V1)).toBe(80);
  });

  it("never exceeds the per-event cap", () => {
    for (let count = 0; count < 200; count++) {
      expect(swapXp(count, GAME_CONFIG_V1)).toBeLessThanOrEqual(
        GAME_CONFIG_V1.swapXpPerEventCap,
      );
    }
  });

  it("stops awarding once the daily swap cap is reached", () => {
    let state = freshState();
    let awarded = 0;
    const now = new Date(T0);

    // Feed swaps until the cap trips. 300 / ~40-80 per swap is well under 20.
    for (let i = 0; i < 20; i++) {
      const result = process(swapEvent(), state, GAME_CONFIG_V1, now);
      if (result.noop === "cap_reached") break;
      state = { ...state, ...result.patch };
      awarded += Number(
        result.gameEvents.find((e) => e.type === "XP_AWARDED")?.detail.amount ??
          0,
      );
    }

    expect(awarded).toBe(GAME_CONFIG_V1.swapDailyCap);
    // The cap held exactly, not approximately.
    expect(awarded).toBe(300);
  });

  it("reports a no-op rather than silently awarding nothing", () => {
    const state = freshState({
      dailyXp: { swap: 300, stake: 0, other: 0, visitedAt: null },
    });
    const result = process(swapEvent(), state, GAME_CONFIG_V1, new Date(T0));
    expect(result.noop).toBe("cap_reached");
    expect(result.patch).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Section 43: energy decay
// ---------------------------------------------------------------------------

describe("energy decay (spec 7.5)", () => {
  it("loses 4 points per 24 hours", () => {
    const result = process(
      {
        type: "DAILY_RESET",
        idempotencyKey: "d1",
        timestamp: T0 / 1000 + DAY_SECONDS,
      },
      freshState({ energy: 100 }),
      GAME_CONFIG_V1,
      new Date(T0 + DAY_MS),
    );
    expect(result.patch.energy).toBe(96);
  });

  it("never falls below the floor of 20", () => {
    // Three months idle: 90 * 4 = 360, far past zero.
    const result = process(
      {
        type: "DAILY_RESET",
        idempotencyKey: "d2",
        timestamp: T0 / 1000 + 90 * DAY_SECONDS,
      },
      freshState({ energy: 100 }),
      GAME_CONFIG_V1,
      new Date(T0 + 90 * DAY_MS),
    );
    expect(result.patch.energy).toBe(20);
  });

  it("applies many elapsed periods in one step, not one", () => {
    const result = process(
      {
        type: "DAILY_RESET",
        idempotencyKey: "d3",
        timestamp: T0 / 1000 + 5 * DAY_SECONDS,
      },
      freshState({ energy: 100 }),
      GAME_CONFIG_V1,
      new Date(T0 + 5 * DAY_MS),
    );
    // 100 - 5*4 = 80. A per-call cron would have applied a single 4.
    expect(result.patch.energy).toBe(80);
  });

  it("applies nothing inside the first 24 hours", () => {
    const result = process(
      {
        type: "DAILY_RESET",
        idempotencyKey: "d4",
        timestamp: T0 / 1000 + 3600,
      },
      freshState(),
      GAME_CONFIG_V1,
      new Date(T0 + 3600 * 1000),
    );
    expect(result.patch.energy).toBeUndefined();
  });

  it("accumulates partial days rather than rounding them away", () => {
    let state = freshState({ energy: 100 });
    const first = process(
      {
        type: "DAILY_RESET",
        idempotencyKey: "p1",
        timestamp: T0 / 1000 + 20 * 3600,
      },
      state,
      GAME_CONFIG_V1,
      new Date(T0 + 20 * 3600 * 1000),
    );
    state = { ...state, ...first.patch };

    // 4 hours later the 24 hours have elapsed across the two calls.
    const second = process(
      {
        type: "DAILY_RESET",
        idempotencyKey: "p2",
        timestamp: T0 / 1000 + 24 * 3600,
      },
      state,
      GAME_CONFIG_V1,
      new Date(T0 + 24 * 3600 * 1000),
    );
    expect(second.patch.energy).toBe(96);
  });
});

// ---------------------------------------------------------------------------
// Section 43: level progression and evolution
// ---------------------------------------------------------------------------

describe("level progression (spec 6.4)", () => {
  it("levels up and carries overflow XP forward", () => {
    // Level 1 needs 212 to reach 2.
    const state = freshState({ xp: 0 });
    const result = process(
      { type: "INTERACTION", idempotencyKey: "x", timestamp: T0 / 1000 },
      state,
      { ...GAME_CONFIG_V1, interactionXp: 500, dailyXpCap: 10_000 },
      new Date(T0),
    );

    // 500 - 212 (level 1's requirement) = 288 carried, and level 2 needs 328,
    // so a single threshold is crossed — one level up, not two.
    expect(result.patch.level).toBe(2);
    expect(result.patch.xp).toBe(288);
    expect(result.gameEvents.filter((e) => e.type === "LEVEL_UP")).toHaveLength(
      1,
    );
  });

  it("is idempotent for the same event run twice on the same state", () => {
    // Purity is what makes this hold: the second call starts from unchanged state.
    const state = freshState();
    const event = {
      type: "INTERACTION" as const,
      idempotencyKey: "same",
      timestamp: T0 / 1000,
    };
    const first = process(event, state, GAME_CONFIG_V1, new Date(T0));
    const second = process(event, state, GAME_CONFIG_V1, new Date(T0));
    expect(second.patch.level).toBe(first.patch.level);
  });

  it("notifies critically on level-up (spec 28.1)", () => {
    const result = process(
      { type: "INTERACTION", idempotencyKey: "x", timestamp: T0 / 1000 },
      freshState(),
      { ...GAME_CONFIG_V1, interactionXp: 500, dailyXpCap: 10_000 },
      new Date(T0),
    );
    expect(result.notification?.priority).toBe("critical");
  });

  it("caps level at 50 and stops accumulating XP", () => {
    const result = process(
      { type: "INTERACTION", idempotencyKey: "x", timestamp: T0 / 1000 },
      freshState({ level: 50, xp: 0 }),
      { ...GAME_CONFIG_V1, interactionXp: 100_000, dailyXpCap: 1_000_000 },
      new Date(T0),
    );
    // Level is unchanged, so it is absent from the patch; XP is clamped instead.
    expect(result.patch.level).toBeUndefined();
    expect(result.patch.xp).toBe(xpToNextLevel(50, GAME_CONFIG_V1));
  });
});

describe("evolution thresholds (spec 26)", () => {
  it.each([
    [1, 1],
    [9, 1],
    [10, 2],
    [19, 2],
    [20, 3],
    [34, 3],
    [35, 4],
    [49, 4],
    [50, 5],
  ])("level %i is stage %i", (level, stage) => {
    expect(evolutionStageForLevel(level, GAME_CONFIG_V1)).toBe(stage);
  });

  it("emits an EVOLVED event on crossing a threshold", () => {
    const state = freshState({
      level: 9,
      xp: xpToNextLevel(9, GAME_CONFIG_V1),
    });
    const result = process(
      { type: "INTERACTION", idempotencyKey: "x", timestamp: T0 / 1000 },
      state,
      { ...GAME_CONFIG_V1, interactionXp: 1, dailyXpCap: 10_000 },
      new Date(T0),
    );
    expect(result.gameEvents.some((e) => e.type === "EVOLVED")).toBe(true);
    expect(result.patch.evolutionStage).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Section 43: shield rules
// ---------------------------------------------------------------------------

describe("shield (spec 7.4)", () => {
  it("moves the shield only on a confirmed signal", () => {
    const result = process(
      {
        type: "SECURITY_EVENT",
        idempotencyKey: "s1",
        timestamp: T0 / 1000,
        shieldSignal: "confirmed",
        shieldDelta: -30,
      },
      freshState(),
      GAME_CONFIG_V1,
      new Date(T0),
    );
    // -30 damage, then the +5 recovery a confirmation earns.
    expect(result.patch.shieldHealth).toBe(75);
  });

  it.each(["inferred", "unknown"] as const)(
    "does not touch the shield on an %s signal",
    (signal) => {
      const result = process(
        {
          type: "SECURITY_EVENT",
          idempotencyKey: `s-${signal}`,
          timestamp: T0 / 1000,
          shieldSignal: signal,
          shieldDelta: -50,
        },
        freshState(),
        GAME_CONFIG_V1,
        new Date(T0),
      );
      expect(result.patch.shieldHealth).toBeUndefined();
    },
  );

  it("reports unavailable rather than damaged when the signal is unknown", () => {
    const result = process(
      {
        type: "SECURITY_EVENT",
        idempotencyKey: "s2",
        timestamp: T0 / 1000,
        shieldSignal: "unknown",
      },
      freshState(),
      GAME_CONFIG_V1,
      new Date(T0),
    );
    // Spec 7.4, verbatim.
    expect(result.notification?.body).toBe("Security status unavailable.");
  });

  it("becomes DAMAGED when the shield is materially reduced", () => {
    const result = process(
      {
        type: "SECURITY_EVENT",
        idempotencyKey: "s3",
        timestamp: T0 / 1000,
        shieldSignal: "confirmed",
        shieldDelta: -70,
      },
      freshState(),
      GAME_CONFIG_V1,
      new Date(T0),
    );
    expect(result.patch.condition).toBe("DAMAGED");
  });
});

// ---------------------------------------------------------------------------
// Section 55 scenario 4: staking exactly once per cycle
// ---------------------------------------------------------------------------

describe("staking (spec 7.3)", () => {
  it("awards energy and XP on first detection", () => {
    const result = process(
      { type: "STAKE_DETECTED", idempotencyKey: "k1", timestamp: T0 / 1000 },
      freshState({ energy: 50 }),
      GAME_CONFIG_V1,
      new Date(T0),
    );
    expect(result.patch.energy).toBe(70); // +20
    expect(result.gameEvents.some((e) => e.type === "ENERGY_RECOVERED")).toBe(
      true,
    );
    expect(result.gameEvents.some((e) => e.type === "XP_AWARDED")).toBe(true);
    expect(result.patch.condition).toBe("RECOVERING");
  });

  it("awards nothing again within the same cycle", () => {
    const state = freshState({ energy: 50 });
    const first = process(
      { type: "STAKE_DETECTED", idempotencyKey: "k1", timestamp: T0 / 1000 },
      state,
      GAME_CONFIG_V1,
      new Date(T0),
    );
    const after = { ...state, ...first.patch };

    // Same stake account read again two hours later: not new activity.
    const second = process(
      {
        type: "STAKE_DETECTED",
        idempotencyKey: "k2",
        timestamp: T0 / 1000 + 7200,
      },
      after,
      GAME_CONFIG_V1,
      new Date(T0 + 7200 * 1000),
    );
    expect(second.noop).toBe("not_applicable");
    expect(second.patch).toEqual({});
  });

  it("awards again in the next cycle", () => {
    const state = freshState({ energy: 50 });
    const first = process(
      { type: "STAKE_DETECTED", idempotencyKey: "k1", timestamp: T0 / 1000 },
      state,
      GAME_CONFIG_V1,
      new Date(T0),
    );
    const after = { ...state, ...first.patch };

    const nextDay = new Date(T0 + DAY_MS + 1000);
    const second = process(
      {
        type: "STAKE_DETECTED",
        idempotencyKey: "k2",
        timestamp: Math.floor(nextDay.getTime() / 1000),
      },
      after,
      GAME_CONFIG_V1,
      nextDay,
    );
    expect(second.patch.energy).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Section 55 scenario 2: returning user, no false event
// ---------------------------------------------------------------------------

describe("conditions (spec 5.2)", () => {
  it("reports HEALTHY with no activity", () => {
    const result = process(
      { type: "DAILY_RESET", idempotencyKey: "d", timestamp: T0 / 1000 },
      freshState({ lastDecayAt: new Date(T0 - 1000) }),
      GAME_CONFIG_V1,
      new Date(T0),
    );
    // Nothing happened, so the condition is unchanged rather than fabricated.
    expect(result.patch.condition).toBeUndefined();
  });

  it("reports ENERGIZED after a swap", () => {
    const result = process(
      swapEvent(),
      freshState(),
      GAME_CONFIG_V1,
      new Date(T0),
    );
    expect(result.patch.condition).toBe("ENERGIZED");
  });

  it("reports TIRED at the energy floor", () => {
    const result = process(
      {
        type: "DAILY_RESET",
        idempotencyKey: "d",
        timestamp: T0 / 1000 + 30 * DAY_SECONDS,
      },
      freshState({ energy: 100 }),
      GAME_CONFIG_V1,
      new Date(T0 + 30 * DAY_MS),
    );
    expect(result.patch.condition).toBe("TIRED");
  });

  it("does not report RECOVERING after decay alone", () => {
    // Regression: decay once shared an event type with recovery, so an idle night
    // was dressed up as a health improvement.
    const result = process(
      {
        type: "DAILY_RESET",
        idempotencyKey: "d",
        timestamp: T0 / 1000 + 2 * DAY_SECONDS,
      },
      freshState({ energy: 90 }),
      GAME_CONFIG_V1,
      new Date(T0 + 2 * DAY_MS),
    );
    expect(result.patch.condition).not.toBe("RECOVERING");
  });

  it("accepts exactly the eight spec conditions", () => {
    expect(conditionSchema.options.sort()).toEqual(
      [
        "ALERT",
        "DAMAGED",
        "ENERGIZED",
        "EVOLVING",
        "HEALTHY",
        "RECOVERING",
        "SLEEPING",
        "TIRED",
      ].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// Purity — the property everything else rests on
// ---------------------------------------------------------------------------

describe("purity", () => {
  it("does not mutate the state it is given", () => {
    const state = freshState({
      dailyXp: { swap: 0, stake: 0, other: 0, visitedAt: null },
    });
    const snapshot = structuredClone(state);

    process(swapEvent(), state, GAME_CONFIG_V1, new Date(T0));

    // The audit trail stores `before_state`; a mutated input would make it a lie.
    expect(state).toEqual(snapshot);
  });

  it("is deterministic", () => {
    const event = swapEvent();
    const state = freshState();
    const a = process(event, state, GAME_CONFIG_V1, new Date(T0));
    const b = process(event, state, GAME_CONFIG_V1, new Date(T0));
    expect(a).toEqual(b);
  });

  it("returns an empty patch when nothing applies", () => {
    const result = process(
      { type: "DAILY_RESET", idempotencyKey: "d", timestamp: T0 / 1000 },
      freshState({ lastDecayAt: new Date(T0 - 1000) }),
      GAME_CONFIG_V1,
      new Date(T0),
    );
    expect(result.patch).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Config guards
// ---------------------------------------------------------------------------

describe("GAME_CONFIG_V1 (spec 41)", () => {
  it("carries the spec numbers", () => {
    expect(GAME_CONFIG_V1.version).toBe("GAME_CONFIG_V1");
    expect(GAME_CONFIG_V1.swapXpBase).toBe(40);
    expect(GAME_CONFIG_V1.swapDailyCap).toBe(300);
    expect(GAME_CONFIG_V1.stakingDailyXp).toBe(25);
    expect(GAME_CONFIG_V1.stakingEnergyRecovery).toBe(20);
    expect(GAME_CONFIG_V1.energyDecay).toBe(4);
    expect(GAME_CONFIG_V1.minEnergy).toBe(20);
  });

  it("refuses a configuration whose floor exceeds its ceiling", () => {
    const broken = { ...GAME_CONFIG_V1, minEnergy: 100, maxEnergy: 100 };
    expect(gameConfigSchema.safeParse(broken).success).toBe(false);
  });

  it("refuses an evolution threshold beyond max level", () => {
    const broken = { ...GAME_CONFIG_V1, evolutionThresholds: [10, 999] };
    expect(gameConfigSchema.safeParse(broken).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Achievements (I06)
// ---------------------------------------------------------------------------

describe("achievements (I06)", () => {
  it("unlocks first_swap when the key is not already held", () => {
    const result = process(
      swapEvent(),
      freshState(),
      GAME_CONFIG_V1,
      new Date(T0),
      new Set(),
    );
    expect(result.achievements.some((a) => a.key === "first_swap")).toBe(true);
  });

  it("does not re-unlock a key the caller already holds", () => {
    // The engine stays pure, so idempotency comes from the caller passing what
    // the database holds. This is the replay case: the same event, already
    // recorded, must not produce a second unlock.
    const held = new Set(["first_connection", "first_swap"]);
    const result = process(
      swapEvent(),
      freshState(),
      GAME_CONFIG_V1,
      new Date(T0),
      held,
    );
    expect(result.achievements.some((a) => a.key === "first_swap")).toBe(false);
  });

  it("does not unlock shield recovery from an unverified signal", () => {
    const result = process(
      {
        type: "SECURITY_EVENT",
        idempotencyKey: "a",
        timestamp: T0 / 1000,
        shieldSignal: "inferred",
      },
      freshState(),
      GAME_CONFIG_V1,
      new Date(T0),
      new Set(),
    );
    expect(result.achievements.some((a) => a.key === "shield_recovery")).toBe(
      false,
    );
  });

  it("does not mutate the caller achievement set", () => {
    const unlocked = new Set<string>(["first_connection"]);
    process(swapEvent(), freshState(), GAME_CONFIG_V1, new Date(T0), unlocked);
    expect(unlocked.size).toBe(1);
  });
});
