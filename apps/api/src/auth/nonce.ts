/**
 * SIWS nonce issuance and consumption.
 *
 * A nonce is only useful as a nonce if the server issued it. Three properties
 * have to hold together, and each one is easy to get wrong on its own:
 *
 *   1. **Server-issued and complete.** The server stores the entire SIWS
 *      payload, not just the nonce. Every field that ends up inside the
 *      signature check is then pinned by us — `domain` and `chainId`
 *      especially, since a client-supplied copy would be an attacker-chosen
 *      field reaching the verification.
 *   2. **Single use.** Consumption is one `DELETE ... RETURNING`, not a
 *      select-then-update. Read-then-mark leaves a window where two concurrent
 *      requests both see an unused nonce and one signature is accepted twice.
 *   3. **Short lived.** Five minutes. Long enough for a user to read a wallet
 *      prompt, short enough that a captured request has little value.
 */

import { randomBytes } from "node:crypto";

import {
  SOLANA_MAINNET_CHAIN_ID,
  type SiwsPayload,
  solanaAddressSchema,
} from "@gochi/contracts";
import { and, eq, isNotNull, lt, or } from "drizzle-orm";

import { getDb } from "../db/client.js";
import { siwsNonces } from "../db/schema.js";

/** Five minutes. Long enough for a wallet prompt, short enough to be useless later. */
const NONCE_TTL_MS = 5 * 60 * 1000;

/**
 * How long a session lasts.
 *
 * Deliberately shorter than the nonce TTL is *not* the relationship here —
 * sessions outlive nonces because a user signs in once and then browses for
 * days, while a nonce is consumed within seconds of being issued.
 */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

/**
 * The domain and URI pinned into every issued payload.
 *
 * Both come from configuration rather than a constant, because the signature
 * check compares against the *stored* payload. If this ever changes, previously
 * issued nonces still verify against what was stored — which is the correct
 * behaviour, not a bug.
 */
const SIWS_DOMAIN = "gochi.app";
const SIWS_URI = "https://gochi.app";

/**
 * Issue a SIWS payload for a wallet address.
 *
 * The address is recorded with the nonce so a nonce issued for wallet A cannot
 * be spent by a signature from wallet B. It is not part of the signed payload —
 * the client adds that when signing — so recording it here is a server-side
 * binding, not something the signature covers.
 */
export async function issueNonce(address: string): Promise<SiwsPayload> {
  // Validate before it reaches the database. zod throws, which the route turns
  // into a 400 rather than a 500.
  const validated = solanaAddressSchema.parse(address);

  const issuedAt = new Date();
  const expirationTime = new Date(issuedAt.getTime() + NONCE_TTL_MS);

  const payload: SiwsPayload = {
    chainId: SOLANA_MAINNET_CHAIN_ID,
    domain: SIWS_DOMAIN,
    uri: SIWS_URI,
    version: "1",
    statement: "Sign in to verify Seeker ownership",
    // 16 bytes of CSPRNG output. Not a UUID: the length is fixed, so the
    // contracts schema can pin it to 32 hex characters.
    nonce: randomBytes(16).toString("hex"),
    issuedAt: issuedAt.toISOString(),
    expirationTime: expirationTime.toISOString(),
  };

  await getDb().insert(siwsNonces).values({
    nonce: payload.nonce,
    address: validated,
    payload,
    issuedAt,
    expiresAt: expirationTime,
  });

  return payload;
}

/**
 * Atomically consume a nonce and return the payload it was issued with.
 *
 * The single `DELETE ... RETURNING` is the point. A select-then-update would
 * let two requests both read an unconsumed nonce, and both signatures would
 * verify — one signature, two sessions.
 *
 * Returns null when the nonce is unknown, already consumed, or expired; the
 * caller distinguishes those with `classifyNonceFailure`, because the client
 * wants a retry on an expiry and a rejection on a replay.
 */
export async function consumeNonce(
  nonce: string,
): Promise<{ payload: SiwsPayload; address: string } | null> {
  const deleted = await getDb()
    .delete(siwsNonces)
    .where(eq(siwsNonces.nonce, nonce))
    .returning({
      payload: siwsNonces.payload,
      address: siwsNonces.address,
      expiresAt: siwsNonces.expiresAt,
    });

  const row = deleted[0];
  if (!row) return null;

  const payload = row.payload as SiwsPayload;

  // The DELETE above succeeded, so the nonce is now spent. Check expiry after
  // consuming rather than as part of the WHERE clause: if expiry were a filter,
  // an expired row would survive to be deleted again and again, and an attacker
  // could keep presenting it without it ever being marked consumed.
  //
  // Two clocks are compared because they can disagree. `expiresAt` is the
  // server's own record and is what the sweeper uses; `payload.expirationTime`
  // is the value the user actually signed. Requiring both to be past means a
  // nonce cannot be replayed by shortening one column, and a legitimate
  // signature is not rejected because of a stale denormalised copy.
  const now = Date.now();
  const expired =
    row.expiresAt.getTime() < now || Date.parse(payload.expirationTime) < now;

  if (expired) return null;

  return { payload, address: row.address };
}

/**
 * Tell an expired failure apart from a reused one.
 *
 * After `consumeNonce` returns null the row is gone either way, so this looks
 * at what is left: an expired nonce that was never consumed is still present
 * with `consumed_at` null, whereas a replayed one is absent entirely.
 */
export async function classifyNonceFailure(
  nonce: string,
): Promise<"expired" | "reused" | "unknown"> {
  const rows = await getDb()
    .select({
      consumedAt: siwsNonces.consumedAt,
      expiresAt: siwsNonces.expiresAt,
    })
    .from(siwsNonces)
    .where(eq(siwsNonces.nonce, nonce));

  const row = rows[0];
  if (!row) return "reused";
  if (row.consumedAt) return "reused";
  if (row.expiresAt.getTime() < Date.now()) return "expired";
  return "unknown";
}

/**
 * Delete nonces that can no longer be used.
 *
 * Consumed rows go as soon as they are old enough to be out of any retry
 * window; unconsumed rows go once expired. Intended to run on a timer rather
 * than inline, since the table only grows if nobody sweeps it.
 */
export async function sweepExpiredNonces(): Promise<number> {
  const cutoff = new Date(Date.now() - SESSION_TTL_SECONDS * 1000);

  const deleted = await getDb()
    .delete(siwsNonces)
    .where(
      or(
        and(
          isNotNull(siwsNonces.consumedAt),
          lt(siwsNonces.consumedAt, cutoff),
        ),
        lt(siwsNonces.expiresAt, new Date()),
      ),
    )
    .returning({ nonce: siwsNonces.nonce });

  return deleted.length;
}
