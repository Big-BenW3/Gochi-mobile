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
  achievementsResponseSchema,
  activityDetailResponseSchema,
  activityResponseSchema,
  companionResponseSchema,
  coreMetadataSchema,
  gameConfigResponseSchema,
  interactionRequestSchema,
  interactionResponseSchema,
  markReadRequestSchema,
  markReadResponseSchema,
  notificationsResponseSchema,
  progressionResponseSchema,
  syncResponseSchema,
  vaultResponseSchema,
  type AchievementDto,
} from "@gochi/contracts";
import { and, count, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { GAME_CONFIG_V1 } from "../engine/config.js";
import {
  evolutionStageForLevel,
  totalXpToReachLevel,
  xpToNextLevel,
} from "../engine/engine.js";
import { createCompanion, ingestEvent } from "../engine/apply.js";
import { closeDb, getDb } from "../db/client.js";
import {
  achievements,
  activityEvents,
  companions,
  notifications,
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

    // Apply every event that is recorded but not yet processed. Ingestion is P7;
    // this reconciles whatever has arrived, which is what §24.5 asks for when two
    // updates conflict.
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

export { closeDb };
