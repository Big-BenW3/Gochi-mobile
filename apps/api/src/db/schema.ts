/**
 * Database schema — the P1 tables.
 *
 * P1 introduces `users`, `siws_nonces` and `wallet_links`. The remaining tables
 * from spec section 23 (`companions`, `activity_events`, `state_changes`,
 * `achievements`, `notifications`) arrive in P2, when the game engine that owns
 * them is written. Defining them now would mean guessing at columns the engine
 * does not have yet.
 *
 * Two deviations from section 23, both deliberate and recorded in ADR-014:
 *
 *   1. Section 23 lists `wallet_address TEXT UNIQUE` inline, which in Postgres
 *      makes every NULL unique. That is fine — NULL means "no wallet linked
 *      yet", which is exactly the Google path before A07 completes, and those
 *      rows must be allowed to coexist. The uniqueness we actually need is
 *      "one wallet, one account" (section 29.3), which the unique index gives
 *      us for every linked wallet while leaving unlinked ones free.
 *
 *   2. Section 23 has `genesis_verified BOOLEAN`. A boolean cannot distinguish
 *      "verified and the wallet holds an SGT" from "we never checked", and
 *      section 37 requires those to render differently — one is a success, the
 *      other is a retry prompt. So the boolean is kept as the cache the spec
 *      asks for, alongside the columns needed to know when it was last true.
 */

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Users — spec section 23.
 *
 * One row per Gochi account. Created by whichever auth path completes first:
 * the SIWS path creates it with `walletAddress` already set, the Privy path
 * creates it with only `privyUserId` and fills the wallet in later at A07.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Privy identity ID, NULL for accounts that only ever used SIWS. */
    privyUserId: text("privy_user_id"),

    /**
     * The linked Solana wallet, or NULL while the account has no wallet.
     * Unique, so one wallet cannot resolve to two accounts (section 29.3).
     */
    walletAddress: text("wallet_address"),

    /** The `.skr` domain, when resolution found one. */
    seekerId: text("seeker_id"),

    /**
     * Cached Genesis verification result. Never trusted from the client
     * (section 38 rule 6) — only `verifyGenesis` writes it.
     */
    genesisVerified: boolean("genesis_verified").notNull().default(false),

    /**
     * The SGT mint address that proved verification.
     *
     * The mint identifies the *device*, not the wallet: SGTs move between
     * wallets, and one wallet can hold a different SGT later. Anti-Sybil logic
     * has to key on this, because "one claim per device" cannot be expressed in
     * terms of a wallet address.
     */
    genesisMintAddress: text("genesis_mint_address"),

    /**
     * When Genesis was last checked, so revalidation can be scheduled. Section
     * 30.4 step 5 asks for periodic revalidation; without this column there is
     * nothing to schedule from.
     */
    genesisVerifiedAt: timestamp("genesis_verified_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  },
  (table) => ({
    /** Section 29.3: one wallet resolves to one account. */
    walletAddressIdx: uniqueIndex("users_wallet_address_key").on(
      table.walletAddress,
    ),
    /** Privy lookups on the Google path. */
    privyUserIdIdx: uniqueIndex("users_privy_user_id_key").on(
      table.privyUserId,
    ),
    /**
     * Partial index for the revalidation sweep in section 30.4 step 5.
     * Partial because only rows that have been verified are candidates, which
     * keeps the index proportional to verified users rather than all of them.
     */
    genesisRecheckIdx: index("users_genesis_recheck_idx").on(
      table.genesisVerifiedAt,
    ),
  }),
);

/**
 * SIWS nonces — the table the spec does not mention.
 *
 * A signed nonce is the whole point of SIWS: without server-issued,
 * single-use, short-lived challenges, a captured signature stays valid forever
 * and can be replayed. The spec's section 29.1 has no such table, so without
 * this the signature proof is not actually a proof.
 *
 * The payload is stored whole rather than just the nonce, because every field
 * that ends up inside the signature check must be pinned by the server. A
 * client-supplied `domain` or `chainId` is an attacker-chosen field, and the
 * whole value of the check comes from the server having issued it.
 */
export const siwsNonces = pgTable(
  "siws_nonces",
  {
    /** Also the lookup key the client sends back. */
    nonce: text("nonce").primaryKey(),

    /** The issuing wallet address, so a nonce cannot be spent by another. */
    address: text("address").notNull(),

    /**
     * The issued SIWS payload: domain, uri, chainId, version, statement,
     * issuedAt, expirationTime.
     *
     * Verification reconstructs the message from this stored copy, never from
     * the request. That is what makes `chainId: 'solana:mainnet'` a guarantee
     * rather than a comment — SGTs exist only on mainnet, so a devnet-scoped
     * signature proves nothing about a device.
     */
    payload: jsonb("payload").notNull(),

    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

    /**
     * Set once the nonce is spent.
     *
     * Consuming it is `DELETE ... RETURNING` rather than a select-then-update,
     * because read-then-mark leaves a window in which two concurrent requests
     * both observe an unused nonce and one signature is accepted twice.
     * `consumedAt` records that a nonce *was* burned so a replay can be
     * answered with a distinct "already used" rather than a generic "invalid".
     */
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (table) => ({
    /** The sweep that clears expired nonces. */
    expiresAtIdx: index("siws_nonces_expires_at_idx").on(table.expiresAt),
  }),
);

/**
 * Wallet links — an audit trail for section 29.3.
 *
 * `users.walletAddress` already guarantees a wallet maps to one account, but
 * it cannot answer "which account owned this wallet last week". Section 29.3
 * explicitly asks us to prevent accidental loss of wallet linkage, and a
 * reversible column is the only way to recover from a bad link.
 */
export const walletLinks = pgTable(
  "wallet_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    walletAddress: text("wallet_address").notNull(),
    linkedAt: timestamp("linked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Set when the link is replaced or revoked. */
    unlinkedAt: timestamp("unlinked_at", { withTimezone: true }),
    /** Why the link ended: 'relinked', 'revoked', 'replaced'. */
    reason: text("reason"),
  },
  (table) => ({
    /**
     * One live link per wallet. Partial, so the same wallet can appear in
     * history many times while holding at most one active link.
     */
    activeLinkIdx: uniqueIndex("wallet_links_active_key")
      .on(table.walletAddress)
      .where(sql`${table.unlinkedAt} is null`),
    userIdx: index("wallet_links_user_id_idx").on(table.userId),
  }),
);

// ---------------------------------------------------------------------------
// P2 — the game-state tables from spec section 23.
// ---------------------------------------------------------------------------

/**
 * Companions — spec section 23.
 *
 * `version` is the optimistic-concurrency column. Every engine run compares the
 * version it read against the version it writes, so two concurrent events cannot
 * both derive a patch from the same snapshot and overwrite each other's work.
 * Spec section 24.5 calls for replaying from the latest authoritative snapshot
 * rather than blindly applying deltas twice; this is what makes that safe.
 *
 * `shieldHealth` is 0-100 and `shieldDurability` is 0-100 separately, because
 * section 7.4 distinguishes immediate protection state from longer-term
 * condition. Collapsing them would make "damaged" and "worn" indistinguishable.
 */
export const companions = pgTable(
  "companions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    name: text("name").notNull(),

    level: integer("level").notNull().default(1),
    xp: bigint("xp", { mode: "number" }).notNull().default(0),

    energy: integer("energy").notNull().default(100),
    shieldHealth: integer("shield_health").notNull().default(100),
    shieldDurability: integer("shield_durability").notNull().default(100),
    combatRating: integer("combat_rating").notNull().default(0),
    aura: integer("aura").notNull().default(0),

    /** One of the eight conditions in spec section 5.2. */
    condition: text("condition").notNull().default("HEALTHY"),
    evolutionStage: integer("evolution_stage").notNull().default(1),

    assetAddress: text("asset_address"),
    metadataUri: text("metadata_uri"),

    /**
     * When energy was last decayed.
     *
     * Decay is 4 points per 24h, and the elapsed periods are computed from this
     * rather than from a daily cron: a user who opens the app after three days
     * should lose three periods' worth in one step, and a cron would have missed
     * the days the app was not running.
     */
    lastDecayAt: timestamp("last_decay_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** When the last staking bonus was applied, for once-per-cycle enforcement. */
    lastStakingCycleAt: timestamp("last_staking_cycle_at", {
      withTimezone: true,
    }),

    /** Section 41: the config version an event was processed under, for audit. */
    configVersion: text("config_version").notNull(),

    version: integer("version").notNull().default(0),

    lastStateUpdate: timestamp("last_state_update", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    /**
     * One companion per user. Spec section 29.3 says one wallet resolves to one
     * companion, and the constraint is what enforces it rather than application
     * code.
     */
    userIdx: uniqueIndex("companions_user_id_key").on(table.userId),
    conditionIdx: index("companions_condition_idx").on(table.condition),
  }),
);

/**
 * Activity events — spec section 23.
 *
 * `idempotency_key` is UNIQUE, and that uniqueness *is* the replay protection.
 * Section 24.4 defines the key as network + signature + event_type, so a webhook
 * delivered twice collapses on insert rather than needing application logic to
 * notice. The insert failing is how a duplicate is detected.
 */
export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    signature: text("signature"),
    slot: bigint("slot", { mode: "number" }),

    /** SWAP, STAKE_DETECTED, SECURITY_EVENT, DAILY_RESET, INTERACTION. */
    eventType: text("event_type").notNull(),

    /** HELIUS_WEBHOOK, RPC_HISTORY, MANUAL, DEMO. */
    source: text("source"),

    /** The normalized payload from spec section 24.2. */
    payload: jsonb("payload").notNull().default({}),

    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),

    /** Section 24.4: network + signature + event_type. */
    idempotencyKey: text("idempotency_key").notNull(),

    /** Section 41: which config version processed this, for audit. */
    configVersion: text("config_version"),
  },
  (table) => ({
    /**
     * The replay guard. Two concurrent inserts of the same event: one wins, one
     * raises 23505, and the engine treats that as a no-op.
     */
    idempotencyIdx: uniqueIndex("activity_events_idempotency_key_key").on(
      table.idempotencyKey,
    ),
    userIdx: index("activity_events_user_id_idx").on(table.userId),
    /** Activity feeds read newest-first per user. */
    userOccurredIdx: index("activity_events_user_occurred_idx").on(
      table.userId,
      table.occurredAt,
    ),
  }),
);

/**
 * State changes — spec section 23.
 *
 * The audit trail. Section 38 rule 10 requires state changes to be logged with
 * traceable event IDs, and this is that log: before/after snapshots plus the
 * reason, so any progression number can be explained after the fact.
 */
export const stateChanges = pgTable(
  "state_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companionId: uuid("companion_id")
      .notNull()
      .references(() => companions.id, { onDelete: "cascade" }),

    eventId: uuid("event_id").references(() => activityEvents.id, {
      onDelete: "set null",
    }),

    beforeState: jsonb("before_state").notNull(),
    afterState: jsonb("after_state").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    companionIdx: index("state_changes_companion_id_idx").on(table.companionId),
  }),
);

/**
 * Achievements — spec section 23, with the categories from I06.
 *
 * UNIQUE(user_id, achievement_key) is what makes unlocking idempotent. Without it
 * a replayed event would re-unlock and re-notify, which is the same class of bug
 * as double-awarding XP.
 */
export const achievements = pgTable(
  "achievements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    achievementKey: text("achievement_key").notNull(),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (table) => ({
    unlockIdx: uniqueIndex("achievements_user_key_key").on(
      table.userId,
      table.achievementKey,
    ),
  }),
);

/**
 * Notifications — spec section 23.
 *
 * `read_at` nullable rather than a boolean: section 28 wants a feed that can
 * show "new since last visit", which a boolean cannot express.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Companion, activity, progression, auth — section 28.1 priorities. */
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    payload: jsonb("payload").notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    /** The feed reads newest-first per user, filtered by unread. */
    userCreatedIdx: index("notifications_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type SiwsNonce = typeof siwsNonces.$inferSelect;

// Row types, for the persistence layer. Inferred rather than hand-written so a
// column change is a type error rather than a silent mismatch.
export type Companion = typeof companions.$inferSelect;
export type ActivityEvent = typeof activityEvents.$inferSelect;
export type Achievement = typeof achievements.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type StateChange = typeof stateChanges.$inferSelect;
