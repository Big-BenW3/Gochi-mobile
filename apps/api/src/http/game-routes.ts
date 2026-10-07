/**
 * The §40 game-state routes.
 *
 * Every one of these is a read or a narrow write over state the engine owns.
 * None of them computes progression: section 21.2 makes the server authoritative,
 * so a client that could set its own level would make every other rule
 * decorative.
 *
 * `POST /v1/companion/sync` is the one interesting route. Spec §40 describes it as
 * "starts/reconciles activity sync", and §24.5 is explicit that blockchain
 * activity arrives out of order and conflicts must be resolved by replaying from
 * the latest snapshot rather than by applying deltas twice. Ingestion itself
 * (Helius webhooks, RPC history) lands in P7; what this route does is apply
 * whatever events already exist, idempotently.
 */

import {
  achievementDetailResponseSchema,
  achievementsResponseSchema,
  activityDetailResponseSchema,
  activityResponseSchema,
  companionResponseSchema,
  coreMetadataSchema,
  dailySummaryResponseSchema,
  dialogueResponseSchema,
  evolutionResponseSchema,
  gameConfigResponseSchema,
  interactionRequestSchema,
  interactionResponseSchema,
  markReadRequestSchema,
  markReadResponseSchema,
  notificationPrefsResponseSchema,
  notificationPrefsSchema,
  notificationsResponseSchema,
  progressionResponseSchema,
  syncResponseSchema,
  whileYouWereAwayResponseSchema,
  vaultResponseSchema,
  type AchievementDto,
} from "@gochi/contracts";
import { and, count, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { GAME_CONFIG_V1 } from "../engine/config.js";
import {
  evolutionStageForLevel,
  totalXpToReachLevel,
  utcDayIndex,
  xpToNextLevel,
} from "../engine/engine.js";
import { createCompanion, ingestEvent } from "../engine/apply.js";
import { closeDb, getDb } from "../db/client.js";
import { env } from "../env.js";
import {
  normalizeAndValidate,
  orderEvents,
} from "../ingestion/pipeline.js";
import { defaultRpcHistoryAdapter } from "../ingestion/rpc-history.js";
import { DEFAULT_PREFS } from "../notifications/prefs.js";
import { fetchTokenBalances } from "../core/balances.js";
import { syncCursors } from "../db/schema.js";
import {
  achievements,
  activityEvents,
  companions,
  notifications,
  notificationPrefs,
  stateChanges,
  users,
} from "../db/schema.js";
import { ApiError, toApiError } from "./errors.js";
import type { AppEnv } from "./middleware.js";
import {
  idempotencyKey,
  oncePerRequest,
  readRateLimit,
  requireSession,
  withConfig,
  writeRateLimit,
} from "./middleware.js";
import type { Companion } from "../db/schema.js";

/**
 * §24 P7 ingestion pass. Pulls new onchain history for the user's wallet via
 * the RPC adapter (Helius once a key is configured), records each raw event as
 * a pending `activity_events` row, and advances the sync cursor.
 *
 * Rows are *recorded*, not applied — the drain loop below applies them through
 * `ingestEvent`, which is the single engine path. The unique idempotency key
 * makes re-ingestion of the same signature a no-op rather than an error.
 */
async function ingestFromChain(userId: string): Promise<void> {
  const db = getDb();
  const [user] = await db
    .select({ walletAddress: users.walletAddress })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user?.walletAddress) return;

  const [cursorRow] = await db
    .select()
    .from(syncCursors)
    .where(eq(syncCursors.userId, userId))
    .limit(1);
  const cursor = cursorRow?.lastSlot ?? null;

  // Always the RPC adapter. It used to be chosen by `env.heliusApiKey`, which was a
  // trap: `HeliusAdapter` is an unfinished stub whose `fetchRecent` returns `[]`,
  // so the moment a Helius key was configured, ingestion silently produced zero
  // events. No error, no log — the companion simply never reacted, which looks
  // exactly like a broken product rather than a missing feature.
  //
  // Helius is still what we read *through*, via `SOLANA_MAINNET_RPC_URL`; the
  // adapter is only about how results arrive, and polling is the one that works.
  // A key's presence must never be able to select the non-functional path.
  const rpcUrl = env.solanaMainnetRpcUrl;
  const adapter = defaultRpcHistoryAdapter(rpcUrl);

  const raws = await adapter.fetchRecent(user.walletAddress, cursor, 50);
  const network = rpcUrl.includes("mainnet") ? "mainnet" : "devnet";

  const orderedRaws = orderEvents(
    raws.map((raw) => ({ ...raw, timestamp: raw.blockTime ?? raw.ingestedAt })),
  );
  const normalizedBySignature = new Map(
    raws.map((raw, i) => [raw.signature, normalizeAndValidate(raw, network, adapter.name)]),
  );
  const ordered = orderedRaws.map((raw) => ({
    raw,
    norm: normalizedBySignature.get(raw.signature)!,
  }));

  let maxSlot = cursor ?? 0;
  for (const { raw, norm } of ordered) {
    if (raw.slot != null && raw.slot > maxSlot) maxSlot = raw.slot;
    if (!norm.ok) continue;
    await db
      .insert(activityEvents)
      .values({
        userId,
        signature: raw.signature,
        slot: raw.slot ?? undefined,
        eventType: norm.out.event.type,
        source: norm.out.event.source,
        payload: norm.out.event as unknown as Record<string, unknown>,
        occurredAt: new Date(norm.out.event.timestamp * 1000),
        idempotencyKey: norm.out.idempotencyKey,
      })
      .onConflictDoNothing({ target: activityEvents.idempotencyKey });
  }

  await db
    .insert(syncCursors)
    .values({ userId, walletAddress: user.walletAddress, lastSlot: maxSlot })
    .onConflictDoUpdate({
      target: syncCursors.userId,
      set: { lastSlot: maxSlot, updatedAt: new Date() },
    });
}

export const gameRoutes = new Hono<AppEnv>();

/** Applied to every route here: a session, the config, and a read limit. */
gameRoutes.use("*", requireSession, withConfig, readRateLimit);
gameRoutes.use("*", oncePerRequest(idempotencyKey));

/** Widen the writes beyond the read allowance. */
const isWrite = (c: { req: { method: string } }) =>
  c.req.method === "POST" ||
  c.req.method === "PUT" ||
  c.req.method === "DELETE";

/** Shared failure handling, matching the identity routes' shape. */
function fail(
  c: { json: (b: unknown, s: number) => Response },
  error: unknown,
) {
  const apiError = toApiError(error);
  if (apiError.code === "internal_error") {
    // eslint-disable-next-line no-console
    console.error("[game-routes] unhandled", error);
  }
  return c.json(apiError.toBody(), apiError.status as never);
}

/** The signed-in user's companion, creating it on first read. */
async function requireCompanion(userId: string): Promise<Companion> {
  const rows = await getDb()
    .select()
    .from(companions)
    .where(eq(companions.userId, userId))
    .limit(1);

  if (rows[0]) return rows[0];

  // A user who signed in before the companion existed still needs one, and the
  // create is idempotent, so racing here is harmless.
  return createCompanion(userId);
}

/**
 * Shape a companion for the wire, with the curve fields the client must not compute.
 *
 * `xpToNextLevel` comes from the engine's curve rather than being stored on the
 * row, so a client that reimplemented the formula would drift the moment the
 * balance changed. Section 41 wants that tuning to need no app release.
 */
function toCompanionDto(row: Companion) {
  return {
    id: row.id,
    name: row.name,
    level: row.level,
    xp: Number(row.xp),
    xpToNextLevel: xpToNextLevel(row.level, GAME_CONFIG_V1),
    energy: row.energy,
    shieldHealth: row.shieldHealth,
    shieldDurability: row.shieldDurability,
    combatRating: row.combatRating,
    aura: row.aura,
    condition: row.condition as Companion["condition"],
    evolutionStage: row.evolutionStage,
    assetAddress: row.assetAddress,
    metadataUri: row.metadataUri,
    lastStateUpdate: (row.lastStateUpdate ?? row.updatedAt).toISOString(),
    configVersion: row.configVersion,
  };
}

// ---------------------------------------------------------------------------
// GET /v1/companion
// ---------------------------------------------------------------------------

gameRoutes.get("/companion", async (c) => {
  try {
    const row = await requireCompanion(c.get("userId"));
    return c.json(
      companionResponseSchema.parse({
        companion: toCompanionDto(row),
        configVersion: row.configVersion,
      }),
      200,
    );
  } catch (error) {
    return fail(c, error);
  }
});

// ---------------------------------------------------------------------------
// POST /v1/companion/sync
// ---------------------------------------------------------------------------

gameRoutes.post("/companion/sync", writeRateLimit, async (c) => {
  try {
    const userId = c.get("userId");
    await requireCompanion(userId);

    // §24: first pull new history from the chain, then process pending rows.
    // Ingestion is best-effort — an RPC outage must not block reconciliation
    // of events that already landed. Skipped under Vitest: tests seed their own
    // deterministic rows and a live RPC fetch would inject devnet noise into
    // them.
    if (process.env.NODE_ENV !== "test") {
      try {
        await ingestFromChain(userId);
      } catch (error) {
        console.error("[sync] onchain ingestion failed:", error);
      }
    }

    // Apply every event that is recorded but not yet processed.
    const pending = await getDb()
      .select()
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.userId, userId),
          isNull(activityEvents.processedAt),
        ),
      )
      .orderBy(activityEvents.occurredAt);

    const gameEvents: {
      type: string;
      detail: Record<string, string | number | boolean>;
    }[] = [];
    let xpAwarded = 0;
    let eventsSkipped = 0;

    for (const event of pending) {
      const result = await ingestEvent({
        userId,
        // The row is already recorded by ingestion; process it rather than
        // re-inserting, which would collide with its own idempotency key.
        existingEventId: event.id,
        now: event.ingestedAt,
        event: {
          type: event.eventType as never,
          idempotencyKey: event.idempotencyKey,
          timestamp: Math.floor(event.occurredAt.getTime() / 1000),
          source: event.source ?? undefined,
          signature: event.signature ?? undefined,
          // Restore the side-channel fields ingestion stashed on the row —
          // the engine no-ops a SECURITY_EVENT without its signal.
          shieldSignal: (event.payload as { shieldSignal?: "confirmed" | "inferred" | "unknown" })?.shieldSignal,
          assetCount: (event.payload as { assetCount?: number })?.assetCount,
        },
      });

      if (!result.ok) {
        eventsSkipped += 1;
        continue;
      }

      for (const gameEvent of result.result.gameEvents) {
        gameEvents.push({ type: gameEvent.type, detail: gameEvent.detail });
        if (gameEvent.type === "XP_AWARDED") {
          xpAwarded += Number(gameEvent.detail.amount ?? 0);
        }
      }
      if (result.result.noop) eventsSkipped += 1;
    }

    const row = await requireCompanion(userId);
    const fresh = await getDb()
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(20);

    return c.json(
      syncResponseSchema.parse({
        eventsProcessed: pending.length - eventsSkipped,
        eventsSkipped,
        xpAwarded,
        companion: toCompanionDto(row),
        gameEvents,
        notifications: fresh.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          readAt: n.readAt?.toISOString() ?? null,
          createdAt: n.createdAt.toISOString(),
        })),
      }),
      200,
    );
  } catch (error) {
    return fail(c, error);
  }
});

// ---------------------------------------------------------------------------
// GET /v1/activity  and  GET /v1/activity/:id
// ---------------------------------------------------------------------------

gameRoutes.get("/activity", async (c) => {
  try {
    const userId = c.get("userId");
    const limit = Math.min(50, Math.max(1, Number(c.req.query("limit") ?? 20)));
    const cursor = c.req.query("cursor");

    // Cursor pagination on occurredAt rather than offset: new events arrive while
    // the user scrolls, and an offset would skip or repeat rows as the window
    // shifts underneath it.
    const where = cursor
      ? and(
          eq(activityEvents.userId, userId),
          lt(activityEvents.occurredAt, new Date(cursor)),
        )
      : eq(activityEvents.userId, userId);

    const rows = await getDb()
      .select()
      .from(activityEvents)
      .where(where)
      .orderBy(desc(activityEvents.occurredAt))
      // One extra to learn whether another page exists without a second count.
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return c.json(
      activityResponseSchema.parse({
        events: page.map((e) => ({
          id: e.id,
          eventType: e.eventType,
          source: e.source,
          signature: e.signature,
          slot: e.slot,
          occurredAt: e.occurredAt.toISOString(),
          processedAt: e.processedAt?.toISOString() ?? null,
          detail: Object.fromEntries(
            Object.entries((e.payload as Record<string, unknown>) ?? {}).map(
              ([k, v]) => [k, String(v)],
            ),
          ),
        })),
        nextCursor: hasMore
          ? page[page.length - 1].occurredAt.toISOString()
          : null,
      }),
      200,
    );
  } catch (error) {
    return fail(c, error);
  }
});

// ---------------------------------------------------------------------------
// GET /v1/activity/sync-status
// ---------------------------------------------------------------------------

/**
 * What ingestion has observed.
 *
 * Needed because section 28 feeds status into sync UI, and because "activity
 * is a teaser" is easy to fake: the only honest values here are ones derived from
 * rows that exist.
 */
gameRoutes.get("/activity/sync-status", async (c) => {
  try {
    const userId = c.get("userId");

    const [{ value: total }] = await getDb()
      .select({ value: count() })
      .from(activityEvents)
      .where(eq(activityEvents.userId, userId));

    const [{ value: pending }] = await getDb()
      .select({ value: count() })
      .from(activityEvents)
      .where(and(eq(activityEvents.userId, userId), isNull(activityEvents.processedAt)));

    const processed = await getDb()
      .select({ processedAt: activityEvents.processedAt })
      .from(activityEvents)
      .where(and(eq(activityEvents.userId, userId), sql`${activityEvents.processedAt} is not null`))
      .orderBy(desc(activityEvents.processedAt))
      .limit(1);

    const lastSuccessful = processed[0]?.processedAt ?? null;

    return c.json(
      {
        lastSuccessfulSync: lastSuccessful ? lastSuccessful.toISOString() : null,
        pendingCount: Number(pending),
        totalEvents: Number(total),
        ingestion: "rpc" as const,
      },
      200,
    );
  } catch (error) {
    return fail(c, error);
  }
});

gameRoutes.get("/activity/:id", async (c) => {
  try {
    const id = z.string().uuid().parse(c.req.param("id"));

    const events = await getDb()
      .select()
      .from(activityEvents)
      // Scoped to the user, so knowing an event id is not enough to read it.
      .where(
        and(
          eq(activityEvents.id, id),
          eq(activityEvents.userId, c.get("userId")),
        ),
      )
      .limit(1);

    if (!events[0]) throw new ApiError("invalid_request");

    const changes = await getDb()
      .select()
      .from(stateChanges)
      .where(eq(stateChanges.eventId, id))
      .limit(1);

    const event = events[0];
    return c.json(
      activityDetailResponseSchema.parse({
        event: {
          id: event.id,
          eventType: event.eventType,
          source: event.source,
          signature: event.signature,
          slot: event.slot,
          occurredAt: event.occurredAt.toISOString(),
          processedAt: event.processedAt?.toISOString() ?? null,
          detail: Object.fromEntries(
            Object.entries(
              (event.payload as Record<string, unknown>) ?? {},
            ).map(([k, v]) => [k, String(v)]),
          ),
        },
        stateChange: changes[0]
          ? {
              beforeState: changes[0].beforeState as Record<string, unknown>,
              afterState: changes[0].afterState as Record<string, unknown>,
              reason: changes[0].reason,
              createdAt: changes[0].createdAt.toISOString(),
            }
          : null,
      }),
      200,
    );
  } catch (error) {
    return fail(c, error);
  }
});



// ---------------------------------------------------------------------------
// GET /v1/progression
// ---------------------------------------------------------------------------

gameRoutes.get("/progression", async (c) => {
  try {
    const row = await requireCompanion(c.get("userId"));
    const config = GAME_CONFIG_V1;
    const stage = evolutionStageForLevel(row.level, config);

    // The next threshold above the current level, or null at maximum. Computed
    // here rather than sent as a raw list, because the client must not reimplement
    // the curve.
    const next = config.evolutionThresholds.find((t) => t > row.level) ?? null;

    return c.json(
      progressionResponseSchema.parse({
        level: row.level,
        xp: Number(row.xp),
        xpToNextLevel: xpToNextLevel(row.level, config),
        totalXp: totalXpToReachLevel(row.level, config) + Number(row.xp),
        evolutionStage: stage,
        nextEvolutionAtLevel: next,
        condition: row.condition,
        energy: row.energy,
        levelCurveVersion: config.levelCurveVersion,
      }),
      200,
    );
  } catch (error) {
    return fail(c, error);
  }
});

// ---------------------------------------------------------------------------
// GET /v1/achievements
// ---------------------------------------------------------------------------

/**
 * The full I06 catalogue.
 *
 * Held here rather than in the database so a new achievement is a code change
 * reviewed alongside the rule that awards it. The locked list is derived from this,
 * which is why an untouched achievements screen is populated rather than blank.
 */
const ACHIEVEMENT_CATALOGUE: Record<string, string> = {
  first_connection: "First connection",
  first_swap: "First swap",
  first_stake: "First staking detected",
  shield_recovery: "Shield recovered",
  recovered_from_tired: "Recovered from tired",
  aura_milestone: "Aura milestone",
  evolution_2: "Evolved once",
  level_10: "Reached level 10",
  level_25: "Reached level 25",
  level_50: "Reached level 50",
  seven_day_presence: "Seven days together",
};

gameRoutes.get("/achievements", async (c) => {
  try {
    const userId = c.get("userId");
    const rows = await getDb()
      .select()
      .from(achievements)
      .where(eq(achievements.userId, userId))
      .orderBy(desc(achievements.unlockedAt));

    const unlocked: AchievementDto[] = rows.map((a) => ({
      key: a.achievementKey,
      title: ACHIEVEMENT_CATALOGUE[a.achievementKey] ?? a.achievementKey,
      unlockedAt: a.unlockedAt.toISOString(),
      metadata: a.metadata as Record<string, string | number>,
    }));

    const held = new Set(unlocked.map((a) => a.key));
    const locked = Object.entries(ACHIEVEMENT_CATALOGUE)
      .filter(([key]) => !held.has(key))
      .map(([key, title]) => ({ key, title }));

    return c.json(achievementsResponseSchema.parse({ unlocked, locked }), 200);
  } catch (error) {
    return fail(c, error);
  }
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

gameRoutes.get("/notifications", async (c) => {
  try {
    const userId = c.get("userId");
    const rows = await getDb()
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);

    const unread = await getDb()
      .select({ n: count() })
      .from(notifications)
      .where(
        and(eq(notifications.userId, userId), isNull(notifications.readAt)),
      );

    return c.json(
      notificationsResponseSchema.parse({
        notifications: rows.map((n) => {
          const payload = (n.payload ?? {}) as {
            priority?: string;
            templateKey?: string;
          };
          return {
            id: n.id,
            type: n.type,
            title: n.title,
            body: n.body,
            // Section 28.1: dialogue is a companion message, so "normal".
            priority:
              payload.priority === "critical" || payload.priority === "high"
                ? payload.priority
                : ("normal" as const),
            readAt: n.readAt?.toISOString() ?? null,
            createdAt: n.createdAt.toISOString(),
            // Section 28.2 wants a deep link into the relevant screen.
            deepLink: payload.templateKey ? "/home" : n.type,
          };
        }),
        unreadCount: unread[0]?.n ?? 0,
      }),
      200,
    );
  } catch (error) {
    return fail(c, error);
  }
});

gameRoutes.post("/notifications/read", writeRateLimit, async (c) => {
  try {
    const userId = c.get("userId");
    const body = markReadRequestSchema.parse(await c.req.json());

    // Scoped to the user: a request naming someone else's notification marks
    // nothing rather than leaking its existence through the affected count.
    const updated = await getDb()
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
          // `inArray`, not a raw `= ANY(${ids}::uuid[])` fragment: interpolating a
          // JS array into sql`` sends it as a single untyped parameter, which
          // Postgres rejects as a malformed array literal rather than as the
          // intended membership test.
          inArray(notifications.id, body.ids),
        ),
      )
      .returning({ id: notifications.id });

    const unread = await getDb()
      .select({ n: count() })
      .from(notifications)
      .where(
        and(eq(notifications.userId, userId), isNull(notifications.readAt)),
      );

    return c.json(
      markReadResponseSchema.parse({
        updated: updated.length,
        unreadCount: unread[0]?.n ?? 0,
      }),
      200,
    );
  } catch (error) {
    return fail(c, error);
  }
});

// ---------------------------------------------------------------------------
// GET /v1/dialogue  and  GET|PUT /v1/notification-prefs
// ---------------------------------------------------------------------------

/**
 * §8 thread. Reads the same rows the engine wrote as `type = 'dialogue'`, so
 * there is exactly one store behind both the notification feed and the chat.
 */
gameRoutes.get("/dialogue", async (c) => {
  try {
    const userId = c.get("userId");
    const rows = await getDb()
      .select({
        id: notifications.id,
        title: notifications.title,
        body: notifications.body,
        payload: notifications.payload,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.type, "dialogue")))
      .orderBy(desc(notifications.createdAt))
      .limit(50);

    const messages = rows.map((r) => ({
      id: r.id,
      templateKey: String((r.payload as { templateKey?: string })?.templateKey ?? r.title),
      body: r.body,
      readAt: r.readAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));

    return c.json(
      dialogueResponseSchema.parse({
        messages,
        // §8.4 conversation context: what the latest line was reacting to.
        lastTrigger: messages[0]
          ? { templateKey: messages[0].templateKey, createdAt: messages[0].createdAt }
          : null,
      }),
      200,
    );
  } catch (error) {
    return fail(c, error);
  }
});

/** §28.2 preferences. Absent row means defaults, so this never 404s. */
gameRoutes.get("/notification-prefs", async (c) => {
  try {
    const userId = c.get("userId");
    const [row] = await getDb()
      .select()
      .from(notificationPrefs)
      .where(eq(notificationPrefs.userId, userId))
      .limit(1);

    return c.json(
      notificationPrefsResponseSchema.parse({
        prefs: row
          ? {
              systemEnabled: row.systemEnabled,
              dialogueEnabled: row.dialogueEnabled,
              quietStartHour: row.quietStartHour,
              quietEndHour: row.quietEndHour,
              dailyCap: row.dailyCap,
            }
          : DEFAULT_PREFS,
      }),
      200,
    );
  } catch (error) {
    return fail(c, error);
  }
});

gameRoutes.put("/notification-prefs", writeRateLimit, async (c) => {
  try {
    const userId = c.get("userId");
    const body = notificationPrefsSchema.parse(await c.req.json());

    const [row] = await getDb()
      .insert(notificationPrefs)
      .values({ userId, ...body })
      .onConflictDoUpdate({
        target: notificationPrefs.userId,
        set: { ...body, updatedAt: new Date() },
      })
      .returning();

    return c.json(
      notificationPrefsResponseSchema.parse({
        prefs: {
          systemEnabled: row.systemEnabled,
          dialogueEnabled: row.dialogueEnabled,
          quietStartHour: row.quietStartHour,
          quietEndHour: row.quietEndHour,
          dailyCap: row.dailyCap,
        },
      }),
      200,
    );
  } catch (error) {
    return fail(c, error);
  }
});

// ---------------------------------------------------------------------------
// POST /v1/companion/interaction
// ---------------------------------------------------------------------------

gameRoutes.post("/companion/interaction", writeRateLimit, async (c) => {
  try {
    const userId = c.get("userId");
    const body = interactionRequestSchema.parse(await c.req.json());
    await requireCompanion(userId);

    // Interaction is an event like any other, so it goes through the engine and
    // gets the same idempotency and audit treatment. Section 19's cap is the
    // config's interactionXp, not a special case here.
    //
    // The idempotency key is derived from the minute bucket rather than a random
    // value, so a double-tapped button collapses into one event while two
    // deliberate taps a minute apart remain two.
    const now = new Date();
    const bucket = Math.floor(now.getTime() / 60_000);

    const result = await ingestEvent({
      userId,
      now,
      event: {
        type: "INTERACTION",
        idempotencyKey: `interaction:${body.kind}:${bucket}`,
        timestamp: Math.floor(now.getTime() / 1000),
        source: "MANUAL",
      },
    });

    const row = await requireCompanion(userId);

    return c.json(
      interactionResponseSchema.parse({
        companion: toCompanionDto(row),
        gameEvents: result.ok ? result.result.gameEvents : [],
        // A dialogue line is expected even when nothing changed: section 19 makes
        // interaction emotional rather than a progression faucet, and a tap that
        // visibly does nothing feels broken.
        dialogue: "That helped.",
      }),
      200,
    );
  } catch (error) {
    return fail(c, error);
  }
});

// ---------------------------------------------------------------------------
// GET /v1/vault
// ---------------------------------------------------------------------------

gameRoutes.get("/vault", async (c) => {
  try {
    const userId = c.get("userId");
    const row = await requireCompanion(userId);

    const totals = await getDb()
      .select({ n: count() })
      .from(activityEvents)
      .where(eq(activityEvents.userId, userId));

    const recent = await getDb()
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.userId, userId))
      .orderBy(desc(activityEvents.occurredAt))
      .limit(10);

    // Ownership comes from the user row, not the companion: the wallet belongs to
    // the account. Read directly rather than through a join, because the only key
    // needed is already in hand.
    const identity = await getDb()
      .select({
        walletAddress: users.walletAddress,
        seekerId: users.seekerId,
        genesisVerified: users.genesisVerified,
      })
      .from(users)
      .where(eq(users.id, row.userId))
      .limit(1);

    // §9.2 summaries. The wallet may be absent (SIWS-only account), in which
    // case there is nothing to read and the vault says so rather than showing
    // zeroes for a wallet that was never connected.
    const walletAddress = identity[0]?.walletAddress ?? null;
    const balances = walletAddress
      // Mainnet, like every other read: the balances being shown are the ones in
      // the user's real wallet. Read against devnet and the vault reports an
      // empty account for a wallet that is full.
      ? await fetchTokenBalances(env.solanaMainnetRpcUrl, walletAddress)
      : { available: false, tokens: [] };

    return c.json(
      vaultResponseSchema.parse({
        companion: {
          id: row.id,
          name: row.name,
          assetAddress: row.assetAddress,
          metadataUri: row.metadataUri,
        },
        ownership: {
          walletAddress: identity[0]?.walletAddress ?? null,
          seekerId: identity[0]?.seekerId ?? null,
          genesisVerified: identity[0]?.genesisVerified ?? false,
        },
        balances,
        activity: {
          totalEvents: totals[0]?.n ?? 0,
          recent: recent.map((e) => ({
            id: e.id,
            eventType: e.eventType,
            occurredAt: e.occurredAt.toISOString(),
          })),
        },
        // Section 9.3, verbatim: the app never holds custody.
        custodyNotice:
          "Your wallet holds your assets. Gochi does not take custody.",
      }),
      200,
    );
  } catch (error) {
    return fail(c, error);
  }
});

// ---------------------------------------------------------------------------
// GET /v1/admin/config — section 41
// ---------------------------------------------------------------------------

/**
 * The tuning surface, read-only.
 *
 * Section 41 wants numeric balance changes without an app release. Read access is
 * harmless and useful for debugging ("why did my companion not level?"). Write
 * access would let anyone rebalance the game, so V1 ships the read side only —
 * a balance change is a reviewed code change to GAME_CONFIG_V1, with the version
 * bump that the audit trail requires anyway.
 */
gameRoutes.get("/admin/config", async (c) => {
  try {
    const config = GAME_CONFIG_V1;
    return c.json(
      gameConfigResponseSchema.parse({
        version: config.version,
        levelCurveVersion: config.levelCurveVersion,
        swapXpBase: config.swapXpBase,
        swapDailyCap: config.swapDailyCap,
        stakingDailyXp: config.stakingDailyXp,
        stakingEnergyRecovery: config.stakingEnergyRecovery,
        energyDecay: config.energyDecay,
        minEnergy: config.minEnergy,
        evolutionThresholds: config.evolutionThresholds,
        notificationCooldowns: config.notificationCooldowns,
        dailyNotificationCap: config.dailyNotificationCap,
      }),
      200,
    );
  } catch (error) {
    return fail(c, error);
  }
});

// ---------------------------------------------------------------------------
// GET /v1/metadata/:companionId.json — the Core metadata host
// ---------------------------------------------------------------------------

/**
 * Serves Metaplex Core metadata.
 *
 * This exists because Metaplex's storage drivers are not React Native compatible
 * (ADR-006), so the app cannot upload its own metadata — the backend has to host
 * the JSON the Core program reads.
 *
 * Unauthenticated on purpose, and worth stating plainly: a metadata document is
 * public on-chain by design, since anyone holding the asset must be able to fetch
 * it. It carries no user data. `animation_url` points at a 3D model that does not
 * exist until P5, so it is omitted rather than emitted as a broken reference.
 */
export const metadataRoutes = new Hono();

metadataRoutes.get("/:companionId.json", async (c) => {
  try {
    // Hono captures the whole segment, and it names the parameter
    // `companionId.json` — not `companionId`. Reading `param('companionId')`
    // yields undefined and the uuid parse below fails, so the suffix is stripped
    // explicitly and its absence treated as a malformed id.
    const raw = c.req.param("companionId.json") ?? "";
    const id = z
      .string()
      .uuid()
      .parse(raw.replace(/\.json$/, ""));

    const rows = await getDb()
      .select()
      .from(companions)
      .where(eq(companions.id, id))
      .limit(1);

    if (!rows[0]) {
      // 404 rather than an empty document: an asset pointing here should fail
      // visibly, not render as nameless.
      return c.json({ error: "Not found." }, 404);
    }

    const row = rows[0];

    // Immutable per companion while the asset exists, so a CDN can cache it. A
    // mutable metadata URI is what makes an NFT's image change under its owner.
    c.header("Cache-Control", "public, max-age=31536000, immutable");

    return c.json(
      coreMetadataSchema.parse({
        name: row.name,
        symbol: "GOCHI",
        description: `Gochi companion, evolution stage ${row.evolutionStage}, level ${row.level}.`,
        seller_fee_basis_points: 0,
        image: `${publicBaseUrl(c)}/v1/metadata/${row.id}.image.png`,
        external_url: "https://gochi.app",
        attributes: [
          { trait_type: "Level", value: String(row.level) },
          { trait_type: "Evolution", value: String(row.evolutionStage) },
          { trait_type: "Condition", value: row.condition },
          { trait_type: "Aura", value: String(row.aura) },
        ],
      }),
      200,
    );
  } catch (error) {
    return fail(c, error);
  }
});

/** The origin this request arrived on, used to build absolute metadata URLs. */
function publicBaseUrl(c: { req: { url: string } }): string {
  try {
    return new URL(c.req.url).origin;
  } catch {
    return "https://gochi.app";
  }
}

// ---------------------------------------------------------------------------
// §26 evolution, §27 While You Were Away, §27.3 daily summary, I07 detail
// ---------------------------------------------------------------------------

/**
 * Deltas accumulated over a window of state changes.
 *
 * §27 asks for what happened *while the user was away*, and the audit trail
 * (`state_changes`, written on every applied event) is the only honest source
 * for it: it records before/after snapshots, so XP, energy, levels and evolution
 * are measured rather than reconstructed from event types we might misclassify.
 */
interface AwayTotals {
  xpGained: number
  energyGained: number
  levelsGained: number
  swapEvents: number
  stakingEvents: number
  interactionCount: number
  shieldChanges: number
  evolutionFrom: number | null
  evolutionTo: number | null
}

function emptyTotals(): AwayTotals {
  return {
    xpGained: 0,
    energyGained: 0,
    levelsGained: 0,
    swapEvents: 0,
    stakingEvents: 0,
    interactionCount: 0,
    shieldChanges: 0,
    evolutionFrom: null,
    evolutionTo: null,
  }
}

/** Walk the ordered snapshots, accumulating differences rather than absolutes. */
function accumulate(rows: typeof stateChanges.$inferSelect[]): AwayTotals {
  const totals = emptyTotals()
  for (const row of rows) {
    const before = (row.beforeState ?? {}) as Record<string, number | string | null>
    const after = (row.afterState ?? {}) as Record<string, number | string | null>
    const num = (v: unknown) => (typeof v === "number" ? v : 0)

    totals.xpGained += Math.max(0, num(after.xp) - num(before.xp))
    totals.energyGained += Math.max(0, num(after.energy) - num(before.energy))
    totals.levelsGained += Math.max(0, num(after.level) - num(before.level))

    if (row.reason === "SWAP") totals.swapEvents += 1
    else if (row.reason === "STAKE_DETECTED") totals.stakingEvents += 1
    else if (row.reason === "INTERACTION") totals.interactionCount += 1
    else if (row.reason === "SECURITY_EVENT") totals.shieldChanges += 1

    if (num(after.evolutionStage) !== num(before.evolutionStage)) {
      totals.evolutionFrom ??= num(before.evolutionStage)
      totals.evolutionTo = num(after.evolutionStage)
    }
  }
  return totals
}

/** §27.3 authored summary block. */
function summaryLines(t: AwayTotals): string[] {
  const lines: string[] = []
  if (t.xpGained > 0) lines.push(`+${t.xpGained} XP`)
  if (t.energyGained > 0) lines.push(`+${t.energyGained} Energy`)
  if (t.levelsGained > 0) {
    lines.push(`+${t.levelsGained} Level${t.levelsGained > 1 ? "s" : ""}`)
  }
  if (t.swapEvents > 0) {
    lines.push(`${t.swapEvents} Swap event${t.swapEvents > 1 ? "s" : ""}`)
  }
  if (t.stakingEvents > 0) {
    lines.push(`${t.stakingEvents} Staking update${t.stakingEvents > 1 ? "s" : ""}`)
  }
  return lines
}

gameRoutes.get("/evolution", async (c) => {
  try {
    const row = await requireCompanion(c.get("userId"));
    const config = GAME_CONFIG_V1;
    const thresholds = config.evolutionThresholds;

    const milestones = thresholds.map((atLevel, index) => {
      const stage = index + 1;
      const previous = index === 0 ? 1 : thresholds[index - 1];
      const span = Math.max(1, atLevel - previous);
      return {
        stage,
        atLevel,
        unlocked: row.level >= atLevel,
        progressPercent: Math.max(
          0,
          Math.min(100, Math.round(((row.level - previous) / span) * 100)),
        ),
      };
    });

    return c.json(
      evolutionResponseSchema.parse({
        currentStage: evolutionStageForLevel(row.level, config),
        nextStageAtLevel: thresholds.find((t) => t > row.level) ?? null,
        milestones,
      }),
      200,
    );
  } catch (error) {
    return fail(c, error);
  }
});

gameRoutes.get("/while-you-were-away", async (c) => {
  try {
    const userId = c.get("userId");
    const companion = await requireCompanion(userId);

    const [user] = await getDb()
      .select({ lastSeenAt: users.lastSeenAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    // Never summarised before the companion existed, and never before the user
    // has actually been away: first sync and an active session both read better
    // as "nothing happened".
    const since = user?.lastSeenAt ?? null;
    if (!since || since.getTime() <= companion.createdAt.getTime()) {
      return c.json(
        whileYouWereAwayResponseSchema.parse({
          hasSummary: false,
          since: null,
          lines: [],
          xpGained: 0,
          energyGained: 0,
          levelsGained: 0,
          swapEvents: 0,
          stakingEvents: 0,
          evolutionStage: null,
          highlights: [],
        }),
        200,
      );
    }

    const rows = await getDb()
      .select()
      .from(stateChanges)
      .where(
        and(
          eq(stateChanges.companionId, companion.id),
          gt(stateChanges.createdAt, since),
        ),
      )
      .orderBy(stateChanges.createdAt);

    const totals = accumulate(rows);
    const lines = summaryLines(totals);
    const evolved =
      totals.evolutionTo != null && totals.evolutionTo > (totals.evolutionFrom ?? 1);

    // §27.2 ranking, most meaningful first.
    const highlights = [] as {
      kind: "level_up" | "evolution" | "activity_burst" | "staking" | "shield_change" | "xp_change";
      title: string;
      detail: string;
      count: number;
    }[]
    if (evolved) {
      highlights.push({
        kind: "evolution",
        title: `Evolved to Stage ${totals.evolutionTo}`,
        detail: "New form unlocked.",
        count: 1,
      })
    }
    if (totals.levelsGained > 0) {
      highlights.push({
        kind: "level_up",
        title: `Level ${totals.levelsGained} gained`,
        detail: `Now level ${companion.level}.`,
        count: totals.levelsGained,
      })
    }
    if (totals.swapEvents > 0) {
      highlights.push({
        kind: "activity_burst",
        title: `${totals.swapEvents} swap${totals.swapEvents > 1 ? "s" : ""}`,
        detail: "Activity while you were away.",
        count: totals.swapEvents,
      })
    }
    if (totals.stakingEvents > 0) {
      highlights.push({
        kind: "staking",
        title: `${totals.stakingEvents} staking update${totals.stakingEvents > 1 ? "s" : ""}`,
        detail: "Staking state changed.",
        count: totals.stakingEvents,
      })
    }
    if (totals.shieldChanges > 0) {
      highlights.push({
        kind: "shield_change",
        title: "Shield activity",
        detail: "Shield state changed.",
        count: totals.shieldChanges,
      })
    }
    if (totals.xpGained > 0) {
      highlights.push({
        kind: "xp_change",
        title: `+${totals.xpGained} XP`,
        detail: "Progress banked.",
        count: totals.xpGained,
      })
    }

    return c.json(
      whileYouWereAwayResponseSchema.parse({
        hasSummary: lines.length > 0,
        since: since.toISOString(),
        lines,
        xpGained: totals.xpGained,
        energyGained: totals.energyGained,
        levelsGained: totals.levelsGained,
        swapEvents: totals.swapEvents,
        stakingEvents: totals.stakingEvents,
        evolutionStage: evolved ? totals.evolutionTo : null,
        highlights,
      }),
      200,
    );
  } catch (error) {
    return fail(c, error);
  }
});

gameRoutes.get("/daily-summary", async (c) => {
  try {
    const userId = c.get("userId");
    const companion = await requireCompanion(userId);
    const now = new Date();
    const dayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    const rows = await getDb()
      .select()
      .from(stateChanges)
      .where(
        and(
          eq(stateChanges.companionId, companion.id),
          gt(stateChanges.createdAt, dayStart),
        ),
      );

    const totals = accumulate(rows);
    const lines = summaryLines(totals);
    if (totals.interactionCount > 0) {
      lines.push(
        `${totals.interactionCount} interaction${totals.interactionCount > 1 ? "s" : ""}`,
      );
    }

    return c.json(
      dailySummaryResponseSchema.parse({
        dayIndex: utcDayIndex(Math.floor(now.getTime() / 1000)),
        xpGained: totals.xpGained,
        energyGained: totals.energyGained,
        swapEvents: totals.swapEvents,
        stakingEvents: totals.stakingEvents,
        interactionCount: totals.interactionCount,
        lines,
      }),
      200,
    );
  } catch (error) {
    return fail(c, error);
  }
});

gameRoutes.get("/achievements/:key", async (c) => {
  try {
    const userId = c.get("userId");
    const key = c.req.param("key");

    const [row] = await getDb()
      .select()
      .from(achievements)
      .where(and(eq(achievements.userId, userId), eq(achievements.achievementKey, key)))
      .limit(1);

    return c.json(
      achievementDetailResponseSchema.parse({
        key,
        title: ACHIEVEMENT_CATALOGUE[key] ?? key,
        unlocked: Boolean(row),
        unlockedAt: row?.unlockedAt.toISOString() ?? null,
        metadata: (row?.metadata ?? {}) as Record<string, string | number>,
      }),
      200,
    );
  } catch (error) {
    return fail(c, error);
  }
});

export { closeDb };
