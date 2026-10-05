/**
 * GAME_CONFIG_V1 — every tunable number in one versioned object.
 *
 * Spec section 41 requires these to be backend configuration rather than client
 * constants, and requires the version under which an event was processed to be
 * retained for audit. That second requirement shapes the design: the config is
 * passed *into* the engine as an argument, never imported by it. An engine that
 * imports its own constants cannot be run against a historical version, so it
 * could never be replayed correctly after a balance change.
 *
 * Every value here is a spec number, cited. Nothing was invented.
 */

import { z } from "zod";

/** The eight conditions from spec section 5.2. */
export const conditionSchema = z.enum([
  "HEALTHY",
  "ENERGIZED",
  "TIRED",
  "ALERT",
  "DAMAGED",
  "RECOVERING",
  "EVOLVING",
  "SLEEPING",
]);
export type Condition = z.infer<typeof conditionSchema>;

/** Event types the engine handles, from spec section 25.2. */
export const eventTypeSchema = z.enum([
  "SWAP",
  "STAKE_DETECTED",
  "SECURITY_EVENT",
  "DAILY_RESET",
  "INTERACTION",
]);
export type EventType = z.infer<typeof eventTypeSchema>;

/** The three shield states spec section 7.4 requires us to distinguish. */
export const shieldSignalSchema = z.enum(["confirmed", "inferred", "unknown"]);
export type ShieldSignal = z.infer<typeof shieldSignalSchema>;

/**
 * The configuration schema.
 *
 * Bounds are enforced by zod rather than documented by comment. `energyDecay`
 * with a negative value, or a floor above the ceiling, would silently produce a
 * companion that heals while asleep — and `minEnergy` above 100 is exactly that
 * bug expressed as data.
 */
export const gameConfigSchema = z
  .object({
    /** Version tag. Stamped on every processed event, per section 41. */
    version: z.string().min(1),

    // --- Swaps, spec section 7.2 ------------------------------------------
    /** `base_xp = 40` in the spec's worked example. */
    swapXpBase: z.number().int().min(0),
    /** Daily swap XP ceiling. The spec suggests 300. */
    swapDailyCap: z.number().int().min(0),
    /** Per-swap ceiling after the frequency multiplier. */
    swapXpPerEventCap: z.number().int().min(0),
    /** `min(2.0, 1 + daily_swap_count * 0.05)`. */
    swapFrequencyStep: z.number().min(0),
    swapFrequencyCap: z.number().min(1),

    // --- Staking, spec section 7.3 -----------------------------------------
    /** `passive_xp = +25`, once per daily cycle. */
    stakingDailyXp: z.number().int().min(0),
    /** `energy_recovery = +20`, once per daily cycle. */
    stakingEnergyRecovery: z.number().int().min(0),
    /**
     * A "cycle" for the once-per-period rule. The spec says "daily" without
     * fixing the boundary, so this is UTC midnight: activity is UTC-timestamped
     * on chain, and a local-midnight boundary would shift with the user's
     * timezone and make the once-only guarantee untestable.
     */
    stakingCycleHours: z.number().int().min(1).max(24),

    // --- Energy, spec section 7.5 ------------------------------------------
    /** `energy_decay = 4 points / 24 hours`. */
    energyDecay: z.number().int().min(0),
    /**
     * `minimum_energy = 20`.
     *
     * The spec is explicit that this exists so the companion cannot become
     * unusable, and section 7.5 also rules out permanent death. Enforced as a
     * bound below so no configuration can reintroduce that failure.
     */
    minEnergy: z.number().int().min(0).max(100),
    maxEnergy: z.number().int().min(1).max(100),

    // --- Combat rating and aura, spec section 5.1 --------------------------
    combatRatingPerSwap: z.number().int().min(0),
    combatRatingMax: z.number().int().min(0).max(1000),
    auraPerSwap: z.number().int().min(0),
    auraMax: z.number().int().min(0).max(100),

    // --- Shield, spec section 7.4 ------------------------------------------
    shieldHealthMax: z.number().int().min(1).max(100),
    shieldDurabilityMax: z.number().int().min(1).max(100),
    /** Recovered per verified security confirmation. */
    shieldRecoveryPerEvent: z.number().int().min(0),

    // --- Levels, spec section 6.3 ------------------------------------------
    /**
     * `levelCurveVersion`, so a curve change is auditable. The function itself
     * lives in the engine; this only names the curve.
     */
    levelCurveVersion: z.string().min(1),
    maxLevel: z.number().int().min(1),
    /** The spec's curve constants: `120 + 80L + 12L^2`. */
    levelCurveBase: z.number().int().min(0),
    levelCurveLinear: z.number().int().min(0),
    levelCurveQuadratic: z.number().int().min(0),

    // --- Evolution, spec section 26 ---------------------------------------
    /** `[10, 20, 35, 50]`. Index 0 is stage 1, so length is stages - 1. */
    evolutionThresholds: z.array(z.number().int().min(1)).min(1),

    // --- XP sources, spec section 6.2 --------------------------------------
    /** First daily app visit. */
    dailyVisitXp: z.number().int().min(0),
    /** Direct companion interaction. Section 19 caps this deliberately. */
    interactionXp: z.number().int().min(0),
    /** Recovering from TIRED. */
    recoveryXp: z.number().int().min(0),
    /** Overall daily XP ceiling across every source. */
    dailyXpCap: z.number().int().min(0),

    // --- Notifications, spec section 28 ------------------------------------
    /** Per-category minimum gap between notifications. */
    notificationCooldowns: z.record(z.string(), z.number().int().min(0)),
    dailyNotificationCap: z.number().int().min(0),
  })
  .refine((c) => c.minEnergy < c.maxEnergy, {
    message: "minEnergy must be below maxEnergy.",
    path: ["minEnergy"],
  })
  .refine((c) => c.evolutionThresholds.every((t) => t <= c.maxLevel), {
    message: "Evolution thresholds cannot exceed maxLevel.",
    path: ["evolutionThresholds"],
  });

export type GameConfig = z.infer<typeof gameConfigSchema>;

/**
 * GAME_CONFIG_V1 — every number the spec states, unchanged.
 *
 * The curve is the one the user chose to keep: `floor(120 + 80L + 12L^2)`.
 */
export const GAME_CONFIG_V1: GameConfig = gameConfigSchema.parse({
  version: "GAME_CONFIG_V1",
  levelCurveVersion: "GAME_CONFIG_V1",

  swapXpBase: 40,
  swapDailyCap: 300,
  swapXpPerEventCap: 100,
  swapFrequencyStep: 0.05,
  swapFrequencyCap: 2.0,

  stakingDailyXp: 25,
  stakingEnergyRecovery: 20,
  stakingCycleHours: 24,

  energyDecay: 4,
  minEnergy: 20,
  maxEnergy: 100,

  combatRatingPerSwap: 5,
  combatRatingMax: 1000,
  auraPerSwap: 10,
  auraMax: 100,

  shieldHealthMax: 100,
  shieldDurabilityMax: 100,
  shieldRecoveryPerEvent: 5,

  levelCurveBase: 120,
  levelCurveLinear: 80,
  levelCurveQuadratic: 12,
  maxLevel: 50,

  evolutionThresholds: [10, 20, 35, 50],

  dailyVisitXp: 10,
  interactionXp: 5,
  recoveryXp: 15,
  dailyXpCap: 500,

  notificationCooldowns: {
    // Level-up and evolution are spec section 28.1 "critical" and must not be
    // rate-limited into silence.
    critical: 0,
    progression: 0,
    activity: 15 * 60,
    companion: 60 * 60,
    daily_summary: 4 * 60 * 60,
  },
  dailyNotificationCap: 20,
});

/**
 * Configs by version, so a historical event can be replayed under the rules that
 * actually applied to it.
 *
 * This is the point of versioned config. A balance change is not retroactive,
 * and without the old values stored an audit could not explain why a companion
 * reached the level it did.
 */
export const CONFIGS_BY_VERSION: Record<string, GameConfig> = {
  GAME_CONFIG_V1,
};

/** Look up a config by version, defaulting to V1. */
export function configForVersion(version: string | undefined): GameConfig {
  if (!version) return GAME_CONFIG_V1;
  return CONFIGS_BY_VERSION[version] ?? GAME_CONFIG_V1;
}
