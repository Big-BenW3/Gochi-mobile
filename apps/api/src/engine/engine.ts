/**
 * The game engine.
 *
 * Pure functions: event plus state plus config in, patch plus events out. No
 * database, no clock, no network. `now` is a parameter because section 25.1 lists
 * CurrentTime as an input, and a test that cannot inject a time cannot verify a
 * daily cap.
 *
 * Three properties are load-bearing and each is easy to lose:
 *
 *  1. **Purity.** `process()` does not mutate its input state. It returns a patch
 *     describing the difference. A mutation would make the `before_state` column
 *     in section 23's audit trail a lie, because the snapshot would already
 *     reflect the change.
 *
 *  2. **Determinism.** Same event, same state, same config, same result. Anything
 *     else would make section 24.5's replay-from-snapshot impossible.
 *
 *  3. **The daily cap is computed from state, not from a counter.** A swap count
 *     passed in by the caller could be stale or forged; XP already awarded today
 *     is a property of the state and cannot be.
 *
 * Persistence lives in `apply.ts`. Section 25.3 requires the marker, the state, the
 * XP change, achievements, dialogue and notification to commit as one operation,
 * and that is a transaction concern rather than a rule concern.
 */

import {
  type Condition,
  type EventType,
  type GameConfig,
  type ShieldSignal,
} from "./config.js";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** A normalized event, per spec section 24.2. */
export interface NormalizedEvent {
  type: EventType;
  /** Section 24.4: network + signature + event_type. */
  idempotencyKey: string;
  /** Chain time, seconds. */
  timestamp: number;
  source?: string;
  signature?: string;
  /** For SWAP. */
  assetCount?: number;
  /** For SECURITY_EVENT. Section 7.4: never fabricate this. */
  shieldSignal?: ShieldSignal;
  /** For SECURITY_EVENT: did the shield materially reduce? */
  shieldDelta?: number;
}

/**
 * The companion's state, as the engine reads it.
 *
 * Deliberately narrower than the database row. The engine needs the gameplay
 * numbers and the two timestamps it decays from; it has no use for the audit
 * columns, and accepting them would invite it to read one.
 */
export interface CompanionState {
  level: number;
  xp: number;
  energy: number;
  shieldHealth: number;
  shieldDurability: number;
  combatRating: number;
  aura: number;
  condition: Condition;
  evolutionStage: number;
  lastDecayAt: Date;
  lastStakingCycleAt: Date | null;
  /** XP already awarded today, per source class. Drives the caps. */
  dailyXp: {
    swap: number;
    stake: number;
    other: number;
    visitedAt: number | null;
  };
  /** How many swap events have already been counted today. */
  dailySwapCount: number;
  /** UTC day number, so "daily" resets on a UTC boundary. */
  dayIndex: number;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export interface StatePatch {
  level?: number;
  xp?: number;
  energy?: number;
  shieldHealth?: number;
  shieldDurability?: number;
  combatRating?: number;
  aura?: number;
  condition?: Condition;
  evolutionStage?: number;
  lastDecayAt?: Date;
  lastStakingCycleAt?: Date | null;
  dailyXp?: CompanionState["dailyXp"];
  dailySwapCount?: number;
  dayIndex?: number;
}

export type GameEventType =
  | "LEVEL_UP"
  | "EVOLVED"
  | "XP_AWARDED"
  | "ENERGY_RECOVERED"
  | "ENERGY_DECAYED"
  | "SHIELD_CHANGED"
  | "DAILY_RESET";

export interface GameEvent {
  type: GameEventType;
  detail: Record<string, string | number | boolean>;
}

export interface DialogueEvent {
  /** From section 8's templates, selected by condition and event. */
  templateKey: string;
}

export interface NotificationEvent {
  /** Section 28.1: critical | high | normal. */
  priority: "critical" | "high" | "normal";
  type: string;
  title: string;
  body: string;
}

export interface AchievementUpdate {
  key: string;
  title: string;
  metadata: Record<string, string | number>;
}

export interface ProcessResult {
  /** What the caller persists. Empty for a no-op. */
  patch: StatePatch;
  gameEvents: GameEvent[];
  dialogue?: DialogueEvent;
  notification?: NotificationEvent;
  achievements: AchievementUpdate[];
  /**
   * Why nothing happened, when nothing did.
   *
   * Exposed so the caller can record it: a dropped duplicate is a normal outcome
   * (section 55 scenario 5) and should be observable rather than silent.
   */
  noop?: "cap_reached" | "not_applicable" | "invalid";
}

// ---------------------------------------------------------------------------
// Derived values
// ---------------------------------------------------------------------------

/**
 * XP needed to advance from `level` to the next one.
 *
 * `floor(120 + 80L + 12L^2)` — spec section 6.3. Computed rather than tabulated,
 * which is what section 6.3 asks for instead of 50 hand-written thresholds.
 */
export function xpToNextLevel(level: number, config: GameConfig): number {
  return Math.floor(
    config.levelCurveBase +
      config.levelCurveLinear * level +
      config.levelCurveQuadratic * level * level,
  );
}

/** Total XP required to reach `level` from 1. Used by the curve tests. */
export function totalXpToReachLevel(level: number, config: GameConfig): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpToNextLevel(l, config);
  return total;
}

/**
 * The evolution stage for a level, per spec section 26.
 *
 * `[10, 20, 35, 50]` means stage 1 below 10, stage 2 at 10, and so on. A level
 * above the last threshold stays at the final stage rather than inventing one.
 */
export function evolutionStageForLevel(
  level: number,
  config: GameConfig,
): number {
  let stage = 1;
  for (const threshold of config.evolutionThresholds) {
    if (level >= threshold) stage += 1;
  }
  return Math.min(stage, config.evolutionThresholds.length + 1);
}

/** UTC day number. Makes "daily" a well-defined boundary in tests. */
export function utcDayIndex(epochSeconds: number): number {
  return Math.floor(epochSeconds / 86_400);
}

/** Start of the current staking cycle, for the once-per-cycle rule. */
export function stakingCycleStart(
  epochSeconds: number,
  config: GameConfig,
): number {
  const cycleSeconds = config.stakingCycleHours * 3600;
  return Math.floor(epochSeconds / cycleSeconds) * cycleSeconds;
}

/**
 * XP for one swap, per spec section 7.2.
 *
 * `base * min(frequencyCap, 1 + count * step)`, then `min(perEventCap, ...)`.
 * Both ceilings matter: the multiplier alone lets a burst scale without limit,
 * and the spec's `min(100, ...)` is what stops a single event being worth a lot.
 */
export function swapXp(dailySwapCount: number, config: GameConfig): number {
  const multiplier = Math.min(
    config.swapFrequencyCap,
    1 + dailySwapCount * config.swapFrequencyStep,
  );
  return Math.min(
    config.swapXpPerEventCap,
    Math.round(config.swapXpBase * multiplier),
  );
}

// ---------------------------------------------------------------------------
// Clamping
// ---------------------------------------------------------------------------

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * Advance the level, carrying overflow XP forward.
 *
 * The loop matters: a single large award can cross several thresholds, and
 * checking only once would drop the excess. Level is capped at `maxLevel`, at
 * which point XP stops accumulating rather than growing without bound.
 */
function applyXp(
  level: number,
  xp: number,
  award: number,
  config: GameConfig,
): { level: number; xp: number; levelsGained: number } {
  if (award <= 0) return { level, xp, levelsGained: 0 };

  let nextLevel = level;
  let nextXp = xp + award;
  let levelsGained = 0;

  while (
    nextLevel < config.maxLevel &&
    nextXp >= xpToNextLevel(nextLevel, config)
  ) {
    nextXp -= xpToNextLevel(nextLevel, config);
    nextLevel += 1;
    levelsGained += 1;
  }

  // At max level there is no next threshold to clear, so XP is pinned rather than
  // left to accumulate as an unbounded number.
  if (nextLevel >= config.maxLevel) {
    nextXp = Math.min(nextXp, xpToNextLevel(config.maxLevel, config));
  }

  return { level: nextLevel, xp: nextXp, levelsGained };
}

/**
 * Derive the condition, per spec section 5.2.
 *
 * Precedence runs worst-first so a more serious state is never masked by a milder
 * one. `EVOLVING` wins outright because it is a one-frame narrative state that
 * must not be suppressed by, say, a low energy reading on the same pass.
 *
 * Energy never reaches the floor's *decay* target because section 7.5 forbids the
 * companion becoming a punishment machine — TIRED is the honest floor, not a
 * death state.
 */
function deriveCondition(
  state: CompanionState,
  events: GameEvent[],
  justLevelled: boolean,
  justEvolved: boolean,
  config: GameConfig,
): Condition {
  if (justEvolved) return "EVOLVING";
  if (justLevelled) return "EVOLVING";

  // DAMAGED when the shield is materially reduced, per section 5.2's own wording.
  const shieldRatio = state.shieldHealth / Math.max(1, config.shieldHealthMax);
  if (shieldRatio <= 0.4) return "DAMAGED";

  if (state.energy <= config.minEnergy) return "TIRED";
  // Only a genuine recovery — staking — sets RECOVERING. Decay is its own event
  // precisely so an idle night is not dressed up as a health improvement.
  if (events.some((e) => e.type === "ENERGY_RECOVERED")) return "RECOVERING";
  if (
    events.some((e) => e.type === "ENERGY_DECAYED") &&
    state.energy <= config.minEnergy
  ) {
    return "TIRED";
  }
  if (events.some((e) => e.type === "SHIELD_CHANGED")) return "ALERT";
  if (events.some((e) => e.type === "XP_AWARDED")) return "ENERGIZED";

  return "HEALTHY";
}

// ---------------------------------------------------------------------------
// Achievements, per I06
// ---------------------------------------------------------------------------

/**
 * Evaluate achievements against state and this event.
 *
 * `alreadyUnlocked` is passed in rather than read, keeping `process()` pure. The
 * caller supplies the set from the database, which is what makes unlocking
 * idempotent: a replayed event sees the key already present and skips it.
 */
function evaluateAchievements(
  state: CompanionState,
  event: NormalizedEvent,
  config: GameConfig,
  unlocked: ReadonlySet<string>,
  createdAt: Date,
): AchievementUpdate[] {
  const out: AchievementUpdate[] = [];
  // Copied rather than mutated: the caller's set is read-only, and mutating it
  // would make a repeated call in the same process look already-unlocked.
  const seen = new Set(unlocked);

  const add = (
    key: string,
    title: string,
    metadata: Record<string, string | number> = {},
  ) => {
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key, title, metadata });
  };

  // I06 categories. Each maps to a fact about the state or this event.
  add("first_connection", "First connection", { at: createdAt.toISOString() });
  if (event.type === "SWAP") add("first_swap", "First swap");
  if (event.type === "STAKE_DETECTED")
    add("first_stake", "First staking detected");

  if (state.evolutionStage >= 2) {
    add("evolution_2", "Evolved once", { stage: 2 });
  }
  // Section 7.5's floor is also the TIRED threshold, so recovering past it is
  // the achievement. Read from config: a future floor change must move this too.
  if (state.energy > config.minEnergy && event.type === "STAKE_DETECTED") {
    add("recovered_from_tired", "Recovered from tired");
  }

  // Section 7.4: only a confirmed signal counts as shield recovery. An `unknown`
  // must never unlock this, or the app would be claiming a verification it does
  // not have.
  if (event.type === "SECURITY_EVENT" && event.shieldSignal === "confirmed") {
    add("shield_recovery", "Shield recovered");
  }

  if (state.aura >= 80)
    add("aura_milestone", "Aura milestone", { aura: state.aura });
  if (state.level >= 10) add("level_10", "Reached level 10", { level: 10 });
  if (state.level >= 25) add("level_25", "Reached level 25", { level: 25 });
  if (state.level >= 50) add("level_50", "Reached level 50", { level: 50 });

  return out;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Apply one event to a state, returning the patch and what should happen.
 *
 * @param event   the normalized event
 * @param state   current state; never mutated
 * @param config  the config version to apply, per section 41
 * @param now     current time, injected for determinism
 * @param unlocked achievement keys already held, for idempotent unlocking
 */
export function process(
  event: NormalizedEvent,
  state: CompanionState,
  config: GameConfig,
  now: Date,
  unlocked: ReadonlySet<string> = new Set(),
): ProcessResult {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const gameEvents: GameEvent[] = [];

  // --- Daily reset, applied before anything reads a daily counter -----------
  // Section 55 scenario 2: a returning user with no new activity gets no false
  // event. If the day rolled over, counters reset silently and only decay applies.
  const currentDay = utcDayIndex(nowSeconds);
  let working: CompanionState = { ...state, dailyXp: { ...state.dailyXp } };
  let dayRolled = false;

  if (currentDay !== state.dayIndex) {
    working = {
      ...working,
      dayIndex: currentDay,
      dailyXp: { swap: 0, stake: 0, other: 0, visitedAt: null },
      dailySwapCount: 0,
    };
    dayRolled = true;
  }

  // --- Gentle decay, section 7.5 -------------------------------------------
  // Computed from elapsed time rather than a daily cron, so a user who opens the
  // app after three days loses three periods' worth in one step.
  const elapsedMs = now.getTime() - working.lastDecayAt.getTime();
  const periodsElapsed = Math.floor(elapsedMs / 86_400_000);

  if (periodsElapsed >= 1) {
    const decayed = clamp(
      working.energy - periodsElapsed * config.energyDecay,
      config.minEnergy,
      config.maxEnergy,
    );
    if (decayed !== working.energy) {
      working = { ...working, energy: decayed };
      gameEvents.push({
        type: "ENERGY_DECAYED",
        detail: {
          periods: periodsElapsed,
          lost: periodsElapsed * config.energyDecay,
          floor: config.minEnergy,
        },
      });
    }
    // Advance the marker by whole periods only, so a partial day accumulates
    // rather than being rounded away on every call.
    working = {
      ...working,
      lastDecayAt: new Date(
        working.lastDecayAt.getTime() + periodsElapsed * 86_400_000,
      ),
    };
    if (dayRolled) {
      gameEvents.push({ type: "DAILY_RESET", detail: { day: currentDay } });
    }
  }

  // --- Event-specific rules, spec section 25.2 ----------------------------
  let xpAward = 0;
  let xpSource: "swap" | "stake" | "other" = "other";
  let dialogue: DialogueEvent | undefined;
  let notification: NotificationEvent | undefined;

  switch (event.type) {
    case "SWAP": {
      // The spec's worked example: award, then apply both ceilings.
      const raw = swapXp(working.dailySwapCount, config);
      const room = Math.max(0, config.swapDailyCap - working.dailyXp.swap);
      const awarded = Math.min(raw, config.swapXpPerEventCap, room);

      if (awarded > 0) {
        xpAward = awarded;
        xpSource = "swap";
        working = {
          ...working,
          dailySwapCount: working.dailySwapCount + 1,
          dailyXp: {
            ...working.dailyXp,
            swap: working.dailyXp.swap + awarded,
          },
        };
        gameEvents.push({
          type: "XP_AWARDED",
          detail: { source: "SWAP", amount: awarded, capped: awarded < raw },
        });
        dialogue = { templateKey: "swap_encouragement" };

        // Combat rating and aura, section 7.2.
        working = {
          ...working,
          combatRating: clamp(
            working.combatRating + config.combatRatingPerSwap,
            0,
            config.combatRatingMax,
          ),
          aura: clamp(working.aura + config.auraPerSwap, 0, config.auraMax),
        };
      } else {
        // Section 55 scenario 5 in spirit: a capped-out day is a no-op, and it
        // says so rather than silently doing nothing.
        return { patch: {}, gameEvents, achievements: [], noop: "cap_reached" };
      }
      break;
    }

    case "STAKE_DETECTED": {
      // Once per cycle. Section 7.3: "do not award the bonus every time the same
      // stake account is read." A balance that stays staked is not new activity.
      const cycle = stakingCycleStart(nowSeconds, config);
      const lastCycle = working.lastStakingCycleAt
        ? stakingCycleStart(
            Math.floor(working.lastStakingCycleAt.getTime() / 1000),
            config,
          )
        : null;

      if (lastCycle !== null && lastCycle === cycle) {
        return {
          patch: {},
          gameEvents,
          achievements: [],
          noop: "not_applicable",
        };
      }

      const recovered = clamp(
        working.energy + config.stakingEnergyRecovery,
        config.minEnergy,
        config.maxEnergy,
      );
      working = {
        ...working,
        energy: recovered,
        lastStakingCycleAt: new Date(cycle * 1000),
      };
      gameEvents.push({
        type: "ENERGY_RECOVERED",
        detail: { reason: "staking", amount: config.stakingEnergyRecovery },
      });

      xpAward = config.stakingDailyXp;
      xpSource = "stake";
      working = {
        ...working,
        dailyXp: { ...working.dailyXp, stake: config.stakingDailyXp },
      };
      gameEvents.push({
        type: "XP_AWARDED",
        detail: { source: "STAKE", amount: config.stakingDailyXp },
      });
      dialogue = { templateKey: "staking_energy" };
      break;
    }

    case "SECURITY_EVENT": {
      // Section 7.4 is emphatic: never fabricate a security score. Only a
      // `confirmed` signal moves the shield.
      if (event.shieldSignal === "confirmed") {
        const delta = event.shieldDelta ?? 0;
        const nextHealth = clamp(
          working.shieldHealth + delta + config.shieldRecoveryPerEvent,
          0,
          config.shieldHealthMax,
        );
        const nextDurability = clamp(
          working.shieldDurability + delta,
          0,
          config.shieldDurabilityMax,
        );

        working = {
          ...working,
          shieldHealth: nextHealth,
          shieldDurability: nextDurability,
        };
        gameEvents.push({
          type: "SHIELD_CHANGED",
          detail: { health: nextHealth, durability: nextDurability, delta },
        });
        if (delta > 0) dialogue = { templateKey: "shield_recovered" };
      } else {
        // Recorded, but not acted on. Section 55 scenario 7: an unavailable
        // security API must not damage the shield.
        gameEvents.push({
          type: "SHIELD_CHANGED",
          detail: { applied: false, signal: event.shieldSignal ?? "unknown" },
        });
        if (event.shieldSignal === "unknown") {
          notification = {
            priority: "high",
            type: "shield",
            title: "Security status unavailable",
            // Section 7.4, verbatim. Never a fabricated number.
            body: "Security status unavailable.",
          };
        }
      }
      break;
    }

    case "INTERACTION": {
      // Section 19: interaction is emotional, not a faucet. A small fixed award.
      xpAward = config.interactionXp;
      working = {
        ...working,
        dailyXp: { ...working.dailyXp, other: config.interactionXp },
      };
      gameEvents.push({
        type: "XP_AWARDED",
        detail: { source: "INTERACTION", amount: config.interactionXp },
      });
      break;
    }

    case "DAILY_RESET": {
      // The counters above already reset. Nothing further to do beyond decay.
      break;
    }
  }

  // --- Overall daily XP ceiling, section 6.2 ------------------------------
  const totalToday =
    working.dailyXp.swap + working.dailyXp.stake + working.dailyXp.other;
  if (xpAward > 0 && totalToday > config.dailyXpCap) {
    const over = totalToday - config.dailyXpCap;
    xpAward = Math.max(0, xpAward - over);
  }

  // --- Level and evolution ------------------------------------------------
  let justLevelled = false;
  let justEvolved = false;

  if (xpAward > 0) {
    const before = working;
    const { level, xp, levelsGained } = applyXp(
      before.level,
      before.xp,
      xpAward,
      config,
    );
    working = { ...before, level, xp };

    for (let gained = 0; gained < levelsGained; gained++) {
      gameEvents.push({
        type: "LEVEL_UP",
        detail: { level: level - levelsGained + gained + 1 },
      });
      justLevelled = true;
    }
    if (levelsGained > 0) {
      notification = {
        // Section 28.1: level-up is critical.
        priority: "critical",
        type: "level_up",
        title: "Level up",
        body: "We are getting stronger.",
      };
    }
  }

  const stage = evolutionStageForLevel(working.level, config);
  if (stage > working.evolutionStage) {
    working = { ...working, evolutionStage: stage };
    justEvolved = true;
    gameEvents.push({ type: "EVOLVED", detail: { stage } });
    notification = {
      priority: "critical",
      type: "evolution",
      title: "Evolution",
      body: "Your companion changed form.",
    };
  }

  // --- Condition ----------------------------------------------------------
  working = {
    ...working,
    condition: deriveCondition(
      working,
      gameEvents,
      justLevelled,
      justEvolved,
      config,
    ),
  };

  // --- Achievements -------------------------------------------------------
  const achievements = evaluateAchievements(
    working,
    event,
    config,
    unlocked,
    now,
  );

  // --- Patch --------------------------------------------------------------
  // Only fields that actually differ, so a no-op event produces an empty patch
  // and the caller can skip the write entirely.
  const patch: StatePatch = {};

  /**
   * Copy a field into the patch only if it actually changed.
   *
   * `dailyXp` is compared field by field rather than by reference. The working
   * state holds a fresh copy of it, so a reference comparison reports a change on
   * every single event — which would make the caller rewrite the row and record a
   * state change for an event that changed nothing.
   */
  const assign = <K extends keyof CompanionState>(key: K) => {
    if (key === "dailyXp") {
      const before = state.dailyXp;
      const after = working.dailyXp;
      const changed =
        before.swap !== after.swap ||
        before.stake !== after.stake ||
        before.other !== after.other ||
        before.visitedAt !== after.visitedAt;
      if (changed) patch.dailyXp = after;
      return;
    }
    if (working[key] !== state[key]) patch[key] = working[key];
  };

  assign("level");
  assign("xp");
  assign("energy");
  assign("shieldHealth");
  assign("shieldDurability");
  assign("combatRating");
  assign("aura");
  assign("condition");
  assign("evolutionStage");
  assign("lastDecayAt");
  assign("lastStakingCycleAt");
  assign("dailyXp");
  assign("dailySwapCount");
  assign("dayIndex");

  return { patch, gameEvents, dialogue, notification, achievements };
}
