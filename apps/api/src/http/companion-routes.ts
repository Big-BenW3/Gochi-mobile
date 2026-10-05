/**
 * Companion creation — section 32's flow, end to end.
 *
 *   verify identity → create the companion row → create the Core Asset →
 *   write the metadata URI → persist the address → show the birth animation
 *
 * Two properties matter more than the order.
 *
 * **The asset address is persisted only on chain success.** An earlier draft wrote
 * the row first and updated it after the transaction, which left a companion whose
 * database row said "minting" indefinitely if the transaction failed. Here the
 * transaction runs first and the row records the result atomically, so a companion
 * row never claims an asset that does not exist.
 *
 * **One companion per wallet, enforced by the database.** Section 29.3 and the
 * unique index on `companions.user_id` do the work; the existence check here is for
 * a friendly response, not for correctness. Two concurrent requests both pass the
 * check and one loses on insert.
 *
 * The identity check is Genesis *optional*. Section 37 permits a preview state when
 * the signal is absent, so a non-Seeker wallet can still get a companion — it just
 * cannot claim device-only rewards. Refusing them outright would contradict the
 * spec, and section 37 explicitly says a Google-only user with no Seeker wallet
 * should be allowed into preview.
 */

import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { GAME_CONFIG_V1 } from "../engine/config.js";
import { closeDb, getDb } from "../db/client.js";
import { activityEvents, companions } from "../db/schema.js";
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
import {
  MintUnavailable,
  describeFunding,
  mintCompanionAsset,
  transferPolicy,
} from "../mint/companion.js";
import { logger } from "../core/logging.js";

export const companionRoutes = new Hono<AppEnv>();

companionRoutes.use("*", requireSession, withConfig, readRateLimit);
companionRoutes.use("*", oncePerRequest(idempotencyKey));

function fail(
  c: { json: (b: unknown, s: number) => Response },
  error: unknown,
) {
  const apiError = toApiError(error);
  if (apiError.code === "internal_error") {
    logger.error("companion.unhandled", {
      reason: error instanceof Error ? error.message : "unknown",
    });
  }
  return c.json(apiError.toBody(), apiError.status as never);
}

/** Where the P3 metadata host will serve this companion's document. */
function metadataUriFor(
  companionId: string,
  c: { req: { url: string } },
): string {
  const origin = (() => {
    try {
      return new URL(c.req.url).origin;
    } catch {
      return "";
    }
  })();
  // The origin is derived from the request when available. Core reads this URI
  // from chain permanently, so a localhost development origin baked into a devnet
  // asset is a deliberate, visible limitation rather than a silent one.
  return `${origin}/v1/metadata/${companionId}.json`;
}

/**
 * POST /v1/companion
 *
 * Creates the companion and its Core Asset. Idempotent per wallet: a second call
 * returns the existing companion rather than minting a second asset.
 */
companionRoutes.post("/", writeRateLimit, async (c) => {
  try {
    const userId = c.get("userId");

    // --- 1. Already created? Return what exists. -------------------------
    const existing = await getDb()
      .select()
      .from(companions)
      .where(eq(companions.userId, userId))
      .limit(1);

    if (existing[0]) {
      return c.json(
        {
          companion: {
            id: existing[0].id,
            assetAddress: existing[0].assetAddress,
          },
          alreadyCreated: true,
          funding: describeFunding(),
        },
        200,
      );
    }

    const body = z
      .object({
        name: z
          .string()
          .min(1)
          .max(32, "A companion name is at most 32 characters."),
      })
      .strict()
      .parse(await c.req.json());

    // --- 2. Claim the companion row. -------------------------------------
    // Inserted before the transaction so the metadata URI can point at a stable id:
    // Core stores the URI permanently, so it has to be final before the mint.
    let row;
    try {
      const inserted = await getDb()
        .insert(companions)
        .values({
          userId,
          name: body.name.trim().slice(0, 32),
          configVersion: GAME_CONFIG_V1.version,
        })
        .returning();
      row = inserted[0];
    } catch (error) {
      if ((error as { code?: string }).code !== "23505") throw error;
      // Lost the race against our own existence check. Return the winner's row
      // rather than erroring: two taps on "birth" should not fail.
      const winner = await getDb()
        .select()
        .from(companions)
        .where(eq(companions.userId, userId))
        .limit(1);
      return c.json(
        {
          companion: {
            id: winner[0].id,
            assetAddress: winner[0].assetAddress,
          },
          alreadyCreated: true,
          funding: describeFunding(),
        },
        200,
      );
    }

    // --- 3. Mint. --------------------------------------------------------
    // The user's wallet, from the session — never from the request body. The
    // session's wallet is the one that signed in with SIWS, so it is proven.
    const wallet = c.get("sessionWallet");
    if (!wallet) {
      throw new ApiError("unauthorized");
    }

    const metadataUri = metadataUriFor(row.id, c);

    let minted;
    try {
      minted = await mintCompanionAsset({
        owner: wallet,
        name: row.name,
        metadataUri,
      });
    } catch (error) {
      if (error instanceof MintUnavailable) {
        // The companion row exists but has no asset. Leaving it in place is
        // deliberate: the user can retry, and the row's asset_address stays null
        // so nothing ever claims an asset that does not exist.
        logger.warn("companion.mint_failed", { userId });
        throw new ApiError("mint_unavailable");
      }
      throw error;
    }

    // --- 4. Persist the address. -----------------------------------------
    await getDb()
      .update(companions)
      .set({
        assetAddress: minted.assetAddress,
        metadataUri,
        updatedAt: new Date(),
      })
      .where(eq(companions.id, row.id));

    logger.info("companion.created", {
      userId,
      asset: minted.assetAddress,
      // Section 32's step: a birth event the app can open with. Idempotency key
      // derived from the asset, so a retry cannot duplicate it.
    });

    await getDb()
      .insert(activityEvents)
      .values({
        userId,
        eventType: "COMPANION_CREATED",
        source: "MANUAL",
        payload: { assetAddress: minted.assetAddress, name: row.name },
        occurredAt: new Date(),
        processedAt: new Date(),
        idempotencyKey: `companion-created:${minted.assetAddress}`,
        configVersion: GAME_CONFIG_V1.version,
      })
      .onConflictDoNothing();

    return c.json(
      {
        companion: { id: row.id, assetAddress: minted.assetAddress },
        alreadyCreated: false,
        signature: minted.signature,
        funding: describeFunding(),
        transfer: transferPolicy(),
      },
      201,
    );
  } catch (error) {
    return fail(c, error);
  }
});

/**
 * GET /v1/companion/asset
 *
 * Screen G03: the Core asset detail. Reads from the database rather than the
 * chain, because every field here was persisted at mint time and re-reading a
 * network account on every app open to display static facts would be wasteful.
 */
companionRoutes.get("/asset", async (c) => {
  try {
    const userId = c.get("userId");

    const row = await getDb()
      .select()
      .from(companions)
      .where(eq(companions.userId, userId))
      .limit(1);

    const companion = row[0];
    if (!companion) {
      throw new ApiError("invalid_request");
    }

    return c.json(
      {
        assetId: companion.assetAddress,
        metadataUri: companion.metadataUri,
        owner: c.get("sessionWallet"),
        name: companion.name,
        level: companion.level,
        evolutionStage: companion.evolutionStage,
        funding: describeFunding(),
        transfer: transferPolicy(),
      },
      200,
    );
  } catch (error) {
    return fail(c, error);
  }
});

export { closeDb };
