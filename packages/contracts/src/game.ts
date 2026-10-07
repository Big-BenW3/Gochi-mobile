/**
 * Shared contracts — game state.
 *
 * The ten routes from spec section 40 that P1 did not already cover. Declared
 * here as zod schemas so the API validates its responses with them and the app
 * parses them with the same schemas; a hand-written duplicate on either side
 * fails silently when the two versions disagree.
 *
 * Where the spec gives a field name it is used verbatim. Where it gives only a
 * one-line summary — `GET /v1/companion` says "Returns complete display state" —
 * the shape is ours and the reasoning is recorded here, because a reader needs to
 * know which fields were specified and which were inferred.
 */

import { z } from "zod";

import { conditionSchema } from "./identity.js";

// ---------------------------------------------------------------------------
// Shared sub-shapes
// ---------------------------------------------------------------------------

/**
 * A companion, as displayed.
 *
 * `GET /v1/companion` "returns complete display state", so this is one flat object
 * rather than something the client assembles. The client is authoritative for
 * presentation only (section 21.2) and must never compute any of these fields.
 */
export const companionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),

  level: z.number().int().min(1).max(50),
  xp: z.number().int().min(0),
  /** XP still needed for the next level. Precomputed: the curve is server-owned. */
  xpToNextLevel: z.number().int().min(0),

  energy: z.number().int().min(0).max(100),
  shieldHealth: z.number().int().min(0).max(100),
  shieldDurability: z.number().int().min(0).max(100),
  combatRating: z.number().int().min(0).max(1000),
  aura: z.number().int().min(0).max(100),

  condition: conditionSchema,
  evolutionStage: z.number().int().min(1).max(5),

  /** Section 10: onchain asset, when minted. Null until P4. */
  assetAddress: z.string().nullable(),
  /** The Core metadata host from P3, which serves the JSON Metaplex needs. */
  metadataUri: z.string().nullable(),

  lastStateUpdate: z.string().datetime(),
  /** Section 41: the config version this state was computed under. */
  configVersion: z.string(),
});
export type Companion = z.infer<typeof companionSchema>;

// ---------------------------------------------------------------------------
// GET /v1/companion
// ---------------------------------------------------------------------------

export const companionResponseSchema = z.object({
  companion: companionSchema,
  /**
   * The game config version the state reflects.
   *
   * Sent so a client running against an older build can tell that a balance
   * change happened rather than misreading the numbers it is shown.
   */
  configVersion: z.string(),
});
export type CompanionResponse = z.infer<typeof companionResponseSchema>;

// ---------------------------------------------------------------------------
// POST /v1/companion/sync
// ---------------------------------------------------------------------------

export const syncRequestSchema = z.object({}).strict();
export type SyncRequest = z.infer<typeof syncRequestSchema>;

/**
 * The sync result.
 *
 * `eventsProcessed` and `xpAwarded` are reported so the client can tell "nothing
 * happened" from "something happened but it awarded nothing" — section 55
 * scenario 2 requires the first to be genuinely empty rather than fabricated.
 */
export const syncResponseSchema = z.object({
  eventsProcessed: z.number().int().min(0),
  eventsSkipped: z.number().int().min(0),
  xpAwarded: z.number().int().min(0),
  companion: companionSchema,
  /** Game events produced, so the client can play a level-up animation. */
  gameEvents: z.array(
    z.object({
      type: z.string(),
      detail: z.record(z.union([z.string(), z.number(), z.boolean()])),
    }),
  ),
  notifications: z.array(
    z.object({
      id: z.string().uuid(),
      type: z.string(),
      title: z.string(),
      body: z.string(),
      readAt: z.string().datetime().nullable(),
      createdAt: z.string().datetime(),
    }),
  ),
});
export type SyncResponse = z.infer<typeof syncResponseSchema>;

// ---------------------------------------------------------------------------
// GET /v1/activity  and  GET /v1/activity/:id
// ---------------------------------------------------------------------------

export const activityEventSchema = z.object({
  id: z.string().uuid(),
  eventType: z.string(),
  source: z.string().nullable(),
  signature: z.string().nullable(),
  slot: z.number().int().nullable(),
  occurredAt: z.string().datetime(),
  processedAt: z.string().datetime().nullable(),
  /** What the engine awarded, so the feed can explain a level-up. */
  detail: z.record(z.string()),
});
export type ActivityEventDto = z.infer<typeof activityEventSchema>;

/** Section 40 calls this "paginated activity". */
export const activityResponseSchema = z.object({
  events: z.array(activityEventSchema),
  /** Cursor for the next page; null at the end. */
  nextCursor: z.string().nullable(),
});
export type ActivityResponse = z.infer<typeof activityResponseSchema>;

export const activityDetailResponseSchema = z.object({
  event: activityEventSchema,
  /** Section 23's state_changes, the explanation of what this event did. */
  stateChange: z
    .object({
      beforeState: z.record(z.unknown()),
      afterState: z.record(z.unknown()),
      reason: z.string(),
      createdAt: z.string().datetime(),
    })
    .nullable(),
});
export type ActivityDetailResponse = z.infer<
  typeof activityDetailResponseSchema
>;

// ---------------------------------------------------------------------------
// GET /v1/progression
// ---------------------------------------------------------------------------

export const progressionResponseSchema = z.object({
  level: z.number().int().min(1).max(50),
  xp: z.number().int().min(0),
  xpToNextLevel: z.number().int().min(0),
  totalXp: z.number().int().min(0),
  evolutionStage: z.number().int().min(1).max(5),
  /** The next evolution threshold, or null at maximum. */
  nextEvolutionAtLevel: z.number().int().nullable(),
  condition: conditionSchema,
  energy: z.number().int().min(0).max(100),
  /** Section 41: which curve these numbers came from. */
  levelCurveVersion: z.string(),
});
export type ProgressionResponse = z.infer<typeof progressionResponseSchema>;

// ---------------------------------------------------------------------------
// GET /v1/achievements
// ---------------------------------------------------------------------------

export const achievementSchema = z.object({
  key: z.string(),
  title: z.string(),
  unlockedAt: z.string().datetime(),
  metadata: z.record(z.union([z.string(), z.number()])),
});
export type AchievementDto = z.infer<typeof achievementSchema>;

export const achievementsResponseSchema = z.object({
  unlocked: z.array(achievementSchema),
  /**
   * Keys not yet earned.
   *
   * Included so the client can show progress toward something. Section 16's I06
   * lists the categories; the unlocked list alone would make an untouched
   * achievement list look broken.
   */
  locked: z.array(z.object({ key: z.string(), title: z.string() })),
});
export type AchievementsResponse = z.infer<typeof achievementsResponseSchema>;

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const notificationSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  /** Section 28.1 priority. */
  priority: z.enum(["critical", "high", "normal"]),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  /** Section 28.2: deep-link into the relevant screen. */
  deepLink: z.string().nullable(),
});
export type NotificationDto = z.infer<typeof notificationSchema>;

export const notificationsResponseSchema = z.object({
  notifications: z.array(notificationSchema),
  unreadCount: z.number().int().min(0),
});
export type NotificationsResponse = z.infer<typeof notificationsResponseSchema>;

export const markReadRequestSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});
export type MarkReadRequest = z.infer<typeof markReadRequestSchema>;

export const markReadResponseSchema = z.object({
  updated: z.number().int().min(0),
  unreadCount: z.number().int().min(0),
});
export type MarkReadResponse = z.infer<typeof markReadResponseSchema>;

// ---------------------------------------------------------------------------
// POST /v1/companion/interaction
// ---------------------------------------------------------------------------

/**
 * The interaction kinds section 19 defines.
 *
 * A closed enum rather than a free string: section 19 is explicit that
 * interaction must not produce unlimited XP, and an open field would let a client
 * invent kinds the engine has no rule for.
 */
export const interactionKindSchema = z.enum([
  "pet",
  "play",
  "feed",
  "clean",
  "sleep",
]);
export type InteractionKind = z.infer<typeof interactionKindSchema>;

export const interactionRequestSchema = z
  .object({
    kind: interactionKindSchema,
  })
  // Strict, so a client cannot append an `xp` or `level` and have it ignored.
  // Section 38 rule 6 lists level among the things a client must never be trusted
  // about; silently dropping such a field would make that trust look safe when the
  // server never actually refused it.
  .strict();
export type InteractionRequest = z.infer<typeof interactionRequestSchema>;

export const interactionResponseSchema = z.object({
  companion: companionSchema,
  /**
   * Always present so the client can animate a response even when nothing
   * changed. Section 19: interaction is emotional, not a progression faucet.
   */
  gameEvents: z.array(
    z.object({
      type: z.string(),
      detail: z.record(z.union([z.string(), z.number(), z.boolean()])),
    }),
  ),
  /** Section 8: a dialogue line for this interaction. */
  dialogue: z.string().nullable(),
});
export type InteractionResponse = z.infer<typeof interactionResponseSchema>;

// ---------------------------------------------------------------------------
// GET /v1/vault
// ---------------------------------------------------------------------------

/**
 * The Mini-Vault, per section 9.
 *
 * Section 9.3 is the constraint that shapes this: the vault must not imply the app
 * holds custody. So there is no balance field and nothing phrased as an amount the
 * app controls — the wallet address is presented as the source of ownership, and
 * token balances are left to the wallet itself rather than duplicated here where
 * they could be mistaken for app-held funds.
 */
export const vaultResponseSchema = z.object({
  companion: z.object({
    id: z.string().uuid(),
    name: z.string(),
    assetAddress: z.string().nullable(),
    metadataUri: z.string().nullable(),
  }),
  ownership: z.object({
    /** The user's wallet. Section 9.3: this remains the source of ownership. */
    walletAddress: z.string().nullable(),
    seekerId: z.string().nullable(),
    genesisVerified: z.boolean(),
  }),
  /** Counts and recent items only — never a value. */
  activity: z.object({
    totalEvents: z.number().int().min(0),
    recent: z.array(
      z.object({
        id: z.string().uuid(),
        eventType: z.string(),
        occurredAt: z.string().datetime(),
      }),
    ),
  }),
  /**
   * Token holdings, read from the chain.
   *
   * Display only. Section 9.2 asks for summaries, not a portfolio the app
   * manages — and section 9.3 forbids implying custody, which is why each entry
   * is a balance in the *user's* wallet and nothing is presented as spendable
   * through Gochi.
   */
  balances: z.object({
    /** False when the chain could not be read; the UI shows a retry, not zeros. */
    available: z.boolean(),
    tokens: z.array(
      z.object({
        mint: z.string(),
        /** Raw onchain amount, unformatted: the client must not invent a price. */
        amount: z.string(),
        decimals: z.number().int().min(0).max(18),
        symbol: z.string().nullable(),
      }),
    ),
  }),
  /**
   * A fixed statement, not a computed flag.
   *
   * Rendered verbatim in the UI so the custody boundary is always on screen rather
   * than implied by omission.
   */
  custodyNotice: z.literal(
    "Your wallet holds your assets. Gochi does not take custody.",
  ),
});
export type VaultResponse = z.infer<typeof vaultResponseSchema>;

// ---------------------------------------------------------------------------
// GET /v1/metadata/:companionId.json — the Core metadata host
// ---------------------------------------------------------------------------

/**
 * Metaplex Core metadata JSON.
 *
 * Field names are Metaplex's, not ours — an off-chain metadata document has to
 * match what the Core program reads on chain, so these cannot be renamed. The
 * backend hosts this because Metaplex's storage drivers are not React Native
 * compatible (ADR-006), which means the app cannot upload it itself.
 */
export const coreMetadataSchema = z.object({
  name: z.string(),
  symbol: z.string(),
  description: z.string(),
  seller_fee_basis_points: z.number().int().min(0).max(10000),
  image: z.string(),
  animation_url: z.string().optional(),
  external_url: z.string().optional(),
  attributes: z
    .array(z.object({ trait_type: z.string(), value: z.string() }))
    .optional(),
  properties: z
    .object({
      files: z
        .array(
          z.object({ uri: z.string(), mime: z.string(), cdn: z.boolean() }),
        )
        .optional(),
      creators: z
        .array(z.object({ address: z.string(), share: z.number() }))
        .optional(),
    })
    .optional(),
});
export type CoreMetadata = z.infer<typeof coreMetadataSchema>;

// ---------------------------------------------------------------------------
// Admin configuration — section 41
// ---------------------------------------------------------------------------

/**
 * The config surface for section 41.
 *
 * Read-only in V1. Section 41 wants tuning without an app release, which this
 * satisfies for numeric balance changes; anything that changes *shape* still needs
 * the version bumped and both versions retained, which is why `version` is part of
 * the response rather than a header.
 */
export const gameConfigResponseSchema = z.object({
  version: z.string(),
  levelCurveVersion: z.string(),
  swapXpBase: z.number(),
  swapDailyCap: z.number(),
  stakingDailyXp: z.number(),
  stakingEnergyRecovery: z.number(),
  energyDecay: z.number(),
  minEnergy: z.number(),
  evolutionThresholds: z.array(z.number()),
  notificationCooldowns: z.record(z.number()),
  dailyNotificationCap: z.number(),
});
export type GameConfigResponse = z.infer<typeof gameConfigResponseSchema>;

// ---------------------------------------------------------------------------
// GET /v1/dialogue  and  GET/PUT /v1/notification-prefs
// ---------------------------------------------------------------------------

/**
 * A companion line (§8). `templateKey` is the machine-readable key the engine
 * emitted; `body` is the authored text (§8.3) so the client never has to hold
 * its own copy of the personality.
 */
export const dialogueMessageSchema = z.object({
  id: z.string().uuid(),
  templateKey: z.string(),
  body: z.string(),
  createdAt: z.string().datetime(),
  readAt: z.string().datetime().nullable(),
});
export type DialogueMessageDto = z.infer<typeof dialogueMessageSchema>;

export const dialogueResponseSchema = z.object({
  messages: z.array(dialogueMessageSchema),
  /** §8.4 context the UI shows above the thread (§8 conversation context). */
  lastTrigger: z
    .object({
      templateKey: z.string(),
      createdAt: z.string().datetime(),
    })
    .nullable(),
});
export type DialogueResponse = z.infer<typeof dialogueResponseSchema>;

/** §28.2 preferences. Null hour means the corresponding bound is off. */
export const notificationPrefsSchema = z.object({
  systemEnabled: z.boolean(),
  dialogueEnabled: z.boolean(),
  quietStartHour: z.number().int().min(0).max(23).nullable(),
  quietEndHour: z.number().int().min(0).max(23).nullable(),
  dailyCap: z.number().int().min(1).max(100),
});
export type NotificationPrefsDto = z.infer<typeof notificationPrefsSchema>;

export const notificationPrefsResponseSchema = z.object({
  prefs: notificationPrefsSchema,
});
export type NotificationPrefsResponse = z.infer<
  typeof notificationPrefsResponseSchema
>;

// ---------------------------------------------------------------------------
// §26 evolution, §27 While You Were Away, §27.3 daily summary
// ---------------------------------------------------------------------------

/** One evolution milestone. §26: stages unlock at fixed levels. */
export const evolutionMilestoneSchema = z.object({
  stage: z.number().int().min(1),
  atLevel: z.number().int().min(1),
  unlocked: z.boolean(),
  /** Current level's progress toward the next milestone, 0-100. */
  progressPercent: z.number().min(0).max(100),
});
export type EvolutionMilestoneDto = z.infer<typeof evolutionMilestoneSchema>;

export const evolutionResponseSchema = z.object({
  currentStage: z.number().int().min(1),
  nextStageAtLevel: z.number().int().min(1).nullable(),
  milestones: z.array(evolutionMilestoneSchema),
});
export type EvolutionResponse = z.infer<typeof evolutionResponseSchema>;

/**
 * §27.2 ranked highlights. Ordered most to least meaningful so the client can
 * render the list without re-deriving priority.
 */
export const awayHighlightSchema = z.object({
  kind: z.enum([
    "level_up",
    "evolution",
    "activity_burst",
    "staking",
    "shield_change",
    "xp_change",
  ]),
  title: z.string(),
  detail: z.string(),
  count: z.number().int().min(0),
});
export type AwayHighlightDto = z.infer<typeof awayHighlightSchema>;

export const whileYouWereAwayResponseSchema = z.object({
  /** False when there is nothing worth interrupting a return for. */
  hasSummary: z.boolean(),
  since: z.string().datetime().nullable(),
  /** §27.3 authored block, e.g. "+160 XP / +20 Energy / +1 Level". */
  lines: z.array(z.string()),
  xpGained: z.number().int().min(0),
  energyGained: z.number().int().min(0),
  levelsGained: z.number().int().min(0),
  swapEvents: z.number().int().min(0),
  stakingEvents: z.number().int().min(0),
  evolutionStage: z.number().int().min(1).nullable(),
  highlights: z.array(awayHighlightSchema),
});
export type WhileYouWereAwayResponse = z.infer<
  typeof whileYouWereAwayResponseSchema
>;

export const dailySummaryResponseSchema = z.object({
  dayIndex: z.number().int(),
  xpGained: z.number().int().min(0),
  energyGained: z.number().int().min(0),
  swapEvents: z.number().int().min(0),
  stakingEvents: z.number().int().min(0),
  interactionCount: z.number().int().min(0),
  lines: z.array(z.string()),
});
export type DailySummaryResponse = z.infer<typeof dailySummaryResponseSchema>;

/** I07 achievement detail. */
export const achievementDetailResponseSchema = z.object({
  key: z.string(),
  title: z.string(),
  unlocked: z.boolean(),
  unlockedAt: z.string().datetime().nullable(),
  metadata: z.record(z.union([z.string(), z.number()])),
});
export type AchievementDetailResponse = z.infer<
  typeof achievementDetailResponseSchema
>;
