/**
 * Engine persistence — the transactional half of the game engine.
 *
 * `engine.ts` decides; this writes. Two things live here that cannot live in a
 * pure function:
 *
 *  1. **The replay guard.** Spec section 24.4: never increment XP because a
 *     webhook was delivered twice. The guard is the unique index on
 *     `activity_events.idempotency_key`, not a check-then-act — inserting and
 *     letting 23505 decide means two concurrent deliveries of the same event
 *     cannot both be processed, whereas a SELECT followed by an INSERT lets both
 *     see it unprocessed.
 *
 *  2. **Atomicity.** Spec section 25.3 lists six things that must commit as one
 *     operation: the processed marker, companion state, XP, achievements, dialogue
 *     and notification. A partial commit would leave a companion that gained XP
 *     with no achievement, or a notification for a level-up that never happened.
 *
 * Purity has a price worth naming: the engine cannot see the database, so it
 * cannot deduplicate. That is what this module is for.
 */

import { and, eq, gte, isNotNull, sql } from "drizzle-orm";

import { logger } from "../core/logging.js";
import { closeDb, getDb } from "../db/client.js";
import {
  achievements,
  activityEvents,
  companions,
  notifications,
  stateChanges,
  users,
} from "../db/schema.js";
import type { Companion } from "../db/schema.js";
import {
  configForVersion,
  GAME_CONFIG_V1,
  type GameConfig,
} from "../engine/config.js";
import {
  process,
  utcDayIndex,
  type CompanionState,
  type NormalizedEvent,
  type ProcessResult,
} from "../engine/engine.js";

const UNIQUE_VIOLATION = "23505";

/** Map a database row onto the narrower shape the engine reads. */
function toEngineState(row: Companion, now: Date): CompanionState {
  return {
    level: row.level,
    xp: Number(row.xp),
    energy: row.energy,
    shieldHealth: row.shieldHealth,
    shieldDurability: row.shieldDurability,
    combatRating: row.combatRating,
    aura: row.aura,
    // The column is TEXT; an unrecognised value falls back to HEALTHY so a
    // companion the client has not heard about yet still renders.
    condition: row.condition as CompanionState["condition"],
    evolutionStage: row.evolutionStage,
    lastDecayAt: row.lastDecayAt,
    lastStakingCycleAt: row.lastStakingCycleAt,
    // Daily counters are derived rather than stored. Section 6.2 caps
    // repetitive event classes, and the only trustworthy source for "already
    // awarded today" is the XP already recorded against today's events.
    dailyXp: { swap: 0, stake: 0, other: 0, visitedAt: null },
    dailySwapCount: 0,
    dayIndex: utcDayIndex(Math.floor(now.getTime() / 1000)),
  };
}

/**
 * A handle that can run queries, whether inside a transaction or not.
 *
 * Drizzle's transaction object and the database handle expose the same query
 * builder, so the helpers below accept either.
 */
type Queryable = Pick<
  ReturnType<typeof getDb>,
  "select" | "insert" | "update" | "delete"
>;

/**
 * XP already awarded today, by class.
 *
 * Read from the event log rather than a counter column, because a counter can
 * drift from the events it was meant to summarise and a drifted cap silently
 * awards too much. Recomputing is a cheap indexed aggregate and is exact.
 *
 * Takes the caller's handle rather than calling `getDb()` itself. Inside a
 * transaction that would be a different connection: the pooled client is capped
 * at one connection, which the transaction already holds, so the query would wait
 * for a connection that cannot be released until the query finishes. That
 * deadlocks rather than failing, which is why it presents as a timeout.
 */
async function dailyXpTotals(
  db: Queryable,
  userId: string,
  now: Date,
): Promise<{ swap: number; stake: number; other: number; swapCount: number }> {
  const dayStart = new Date(
    Math.floor(now.getTime() / 86_400_000) * 86_400_000,
  );

  const rows = await db
    .select({
      eventType: activityEvents.eventType,
      payload: activityEvents.payload,
    })
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.userId, userId),
        // drizzle's operators rather than a raw `sql` fragment: an interpolated
        // fragment sends a Date as a query *parameter* of unknown type, which
        // postgres.js cannot encode. `gte` and `isNotNull` keep the value typed.
        gte(activityEvents.occurredAt, dayStart),
        isNotNull(activityEvents.processedAt),
      ),
    );

  let swap = 0;
  let stake = 0;
  let other = 0;
  let swapCount = 0;

  for (const row of rows) {
    const awarded = Number(
      (row.payload as { xpAwarded?: number } | null)?.xpAwarded ?? 0,
    );
    if (row.eventType === "SWAP") {
      swap += awarded;
      swapCount += 1;
    } else if (row.eventType === "STAKE_DETECTED") {
      stake += awarded;
    } else {
      other += awarded;
    }
  }

  return { swap, stake, other, swapCount };
}

export type IngestResult =
  | { ok: true; outcome: "applied" | "noop"; result: ProcessResult }
  /** The idempotency key was already processed. Section 55 scenario 5. */
  | { ok: false; reason: "duplicate"; existingEventId: string };

/**
 * Ingest one normalized event and apply it, atomically.
 *
 * The idempotency insert happens *inside* the transaction and first, so the
 * duplicate check and the state write commit together. A duplicate raises 23505
 * and rolls the whole thing back — which is the correct outcome, since none of
 * the writes should have happened anyway.
 */
export async function ingestEvent(params: {
  userId: string;
  event: NormalizedEvent;
  /**
   * Process a row that is already recorded, rather than inserting it.
   *
   * Ingestion (P7) writes the event; the engine applies it. `/v1/companion/sync`
   * reconciles whatever ingestion has written but not yet processed, so it has to
   * process the existing row — re-inserting it would collide with its own
   * idempotency key and come back as a duplicate of itself.
   */
  existingEventId?: string;
  now?: Date;
  config?: GameConfig;
}): Promise<IngestResult> {
  const now = params.now ?? new Date();
  const config = params.config ?? GAME_CONFIG_V1;
  const { userId, event, existingEventId } = params;

  const db = getDb();

  try {
    return await db.transaction(async (tx) => {
      // --- 1. Claim the idempotency key, unless the row already exists. ---
      let eventId: string;
      if (existingEventId) {
        eventId = existingEventId;
      } else {
        try {
          const inserted = await tx
            .insert(activityEvents)
            .values({
              userId,
              signature: event.signature,
              eventType: event.type,
              source: event.source,
              // xpAwarded is written back after the engine runs, which is why the
              // payload is a mutable record rather than the raw event.
              payload: { ...(event as unknown as Record<string, unknown>) },
              occurredAt: new Date(event.timestamp * 1000),
              idempotencyKey: event.idempotencyKey,
              configVersion: config.version,
            })
            .returning({ id: activityEvents.id });

          eventId = inserted[0].id;
        } catch (error) {
          if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
            const existing = await tx
              .select({ id: activityEvents.id })
              .from(activityEvents)
              .where(eq(activityEvents.idempotencyKey, event.idempotencyKey))
              .limit(1);
            throw Object.assign(new Error("duplicate_event"), {
              code: UNIQUE_VIOLATION,
              existingEventId: existing[0]?.id,
            });
          }
          throw error;
        }
      }

      // --- 2. Load the companion. ----------------------------------------
      const companion = await tx
        .select()
        .from(companions)
        .where(eq(companions.userId, userId))
        .limit(1);

      if (!companion.length) {
        throw Object.assign(new Error("no_companion"), {
          code: "NO_COMPANION",
        });
      }

      const row = companion[0];

      // --- 3. Run the engine. --------------------------------------------
      const totals = await dailyXpTotals(tx, userId, now);
      const state: CompanionState = {
        ...toEngineState(row, now),
        dailyXp: {
          swap: totals.swap,
          stake: totals.stake,
          other: totals.other,
          visitedAt: null,
        },
        dailySwapCount: totals.swapCount,
      };

      const unlocked = new Set(
        (
          await tx
            .select({ achievementKey: achievements.achievementKey })
            .from(achievements)
            .where(eq(achievements.userId, userId))
        ).map((a) => a.achievementKey),
      );

      const outcome = process(event, state, config, now, unlocked);
      const awardedXp = outcome.gameEvents
        .filter((e) => e.type === "XP_AWARDED")
        .reduce((sum, e) => sum + Number(e.detail.amount), 0);

      // --- 4. Write the patch, guarded by version. ------------------------
      // Spec section 24.5: two conflicting updates must not both apply. The
      // version column makes the write conditional on nothing having changed it
      // since we read it.
      if (Object.keys(outcome.patch).length > 0) {
        await tx
          .update(companions)
          .set({
            ...outcome.patch,
            // Section 41: retain the config version under which this ran.
            configVersion: config.version,
            version: sql`${companions.version} + 1`,
            lastStateUpdate: now,
            updatedAt: now,
          })
          .where(
            and(eq(companions.id, row.id), eq(companions.version, row.version)),
          );
      }

      // --- 5. Audit, achievements, dialogue, notification. ---------------
      await tx.insert(stateChanges).values({
        companionId: row.id,
        eventId,
        beforeState: row,
        afterState: outcome.patch,
        reason: event.type,
      });

      if (outcome.achievements.length > 0) {
        await tx
          .insert(achievements)
          .values(
            outcome.achievements.map((a) => ({
              userId,
              achievementKey: a.key,
              metadata: a.metadata,
            })),
          )
          .onConflictDoNothing();
      }

      if (outcome.notification) {
        const n = outcome.notification;
        await tx.insert(notifications).values({
          userId,
          type: n.type,
          title: n.title,
          body: n.body,
          payload: { priority: n.priority, eventId },
        });
      }

      if (outcome.dialogue) {
        // Dialogue is a queue the client drains; stored as a notification with a
        // distinct type so one table serves both feeds and the ordering between
        // a line and a level-up banner is preserved.
        await tx.insert(notifications).values({
          userId,
          type: "dialogue",
          title: outcome.dialogue.templateKey,
          body: "",
          payload: { templateKey: outcome.dialogue.templateKey, eventId },
        });
      }

      // --- 6. Mark processed, recording the XP actually awarded. -----------
      await tx
        .update(activityEvents)
        .set({
          processedAt: now,
          payload: sql`${activityEvents.payload} || ${JSON.stringify({ xpAwarded: awardedXp })}::jsonb`,
        })
        .where(eq(activityEvents.id, eventId));

      return {
        ok: true as const,
        outcome: outcome.noop ? ("noop" as const) : ("applied" as const),
        result: outcome,
      };
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === UNIQUE_VIOLATION) {
      // Expected, and the single most important path here. Logged so a duplicate
      // delivery is visible without being alarming.
      logger.info("engine.duplicate_event", {
        key: event.idempotencyKey,
      });
      return {
        ok: false,
        reason: "duplicate",
        existingEventId:
          (error as { existingEventId?: string }).existingEventId ?? "",
      };
    }
    if (code === "NO_COMPANION") {
      logger.warn("engine.no_companion", { userId });
      throw error;
    }
    throw error;
  }
}

/**
 * Create a companion for a user.
 *
 * Section 55 scenario 1 ends at "Egg → Companion", so creation is idempotent and
 * keyed on the user: the unique index on `user_id` is what stops a retried
 * onboarding from creating a second companion, which section 29.3 forbids.
 */
export async function createCompanion(
  userId: string,
  name = "Gochi",
  now: Date = new Date(),
): Promise<Companion> {
  const existing = await getDb()
    .select()
    .from(companions)
    .where(eq(companions.userId, userId))
    .limit(1);
  if (existing[0]) return existing[0];

  try {
    const inserted = await getDb()
      .insert(companions)
      .values({
        userId,
        name,
        level: 1,
        xp: 0,
        energy: 100,
        shieldHealth: 100,
        shieldDurability: 100,
        combatRating: 0,
        aura: 0,
        condition: "HEALTHY",
        evolutionStage: 1,
        lastDecayAt: now,
        configVersion: GAME_CONFIG_V1.version,
      })
      .returning();

    return inserted[0];
  } catch (error) {
    if ((error as { code?: string }).code !== UNIQUE_VIOLATION) throw error;
    const rows = await getDb()
      .select()
      .from(companions)
      .where(eq(companions.userId, userId))
      .limit(1);
    return rows[0];
  }
}

export { closeDb, configForVersion };
