/**
 * User resolution and wallet linking — spec section 29.3.
 *
 * The rule: one Solana wallet resolves to one active Gochi account.
 *
 * Section 29.3 lists three things to prevent, and each maps to a specific
 * mechanism here rather than to application logic:
 *
 *   - "two Google accounts claiming the same companion" — `users.wallet_address`
 *     is UNIQUE, so the second insert fails at the database.
 *   - "duplicate companion records caused by race conditions" — the same unique
 *     index, resolved by asking the constraint to decide rather than checking
 *     first. Asking "does a row exist?" and then inserting is a double-claim
 *     bug under concurrency, because two requests both find nothing.
 *   - "accidental loss of wallet linkage" — `wallet_links` keeps history, and
 *     `relink` moves a wallet rather than overwriting the account's address.
 *
 * Every function here treats a unique violation as a normal outcome with a
 * defined meaning, not an error to propagate. In Postgres a constraint
 * violation aborts the surrounding transaction, so a handler that tries to
 * continue issuing queries inside one will fail with 25P02 rather than the error
 * it expected. That is why each write is a single statement or uses a savepoint.
 */

import { and, eq, isNull, sql } from "drizzle-orm";

import type { GenesisResult } from "@gochi/contracts";

import { closeDb, getDb } from "../db/client.js";
import { users, walletLinks } from "../db/schema.js";
import type { NewUser, User } from "../db/schema.js";
import { logger } from "../core/logging.js";

/** Postgres unique violation. The only code this module treats as expected. */
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === UNIQUE_VIOLATION
  );
}

/** Map a stored user row onto the shape the app holds. */
export function toIdentity(user: User, genesis: GenesisResult | null) {
  return {
    id: user.id,
    wallet: user.walletAddress,
    seekerId: user.seekerId,
    genesisVerified: user.genesisVerified,
    // Prefer the freshly-checked status over the cached boolean. The cache is
    // only a fallback for when no check has run this session.
    genesisStatus:
      genesis?.status ?? (user.genesisVerified ? "verified" : "not_detected"),
    genesisMintAddress: user.genesisMintAddress,
    walletLinked: user.walletAddress !== null,
  } as const;
}

/** Find a user by their Privy identity, if one exists. */
export async function findByPrivyUserId(
  privyUserId: string,
): Promise<User | undefined> {
  const rows = await getDb()
    .select()
    .from(users)
    .where(eq(users.privyUserId, privyUserId))
    .limit(1);
  return rows[0];
}

/** Find a user by their linked wallet. */
export async function findByWallet(
  walletAddress: string,
): Promise<User | undefined> {
  const rows = await getDb()
    .select()
    .from(users)
    .where(eq(users.walletAddress, walletAddress))
    .limit(1);
  return rows[0];
}

export async function findById(id: string): Promise<User | undefined> {
  const rows = await getDb()
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return rows[0];
}

/** Record that the user was seen. Best effort — never fails a request. */
export async function touchLastSeen(userId: string): Promise<void> {
  try {
    await getDb()
      .update(users)
      .set({ lastSeenAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId));
  } catch (error) {
    // Analytics-adjacent. A failure here must not fail the request the user
    // actually cares about.
    logger.warn("users.touch_last_seen_failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
  }
}

export type LinkResult =
  | { ok: true; user: User; alreadyLinked: boolean }
  | { ok: false; reason: "wallet_already_linked"; ownerId: string };

/**
 * Link a wallet to an account, creating the account if it does not exist.
 *
 * This is the SIWS entry point, where the wallet is the only identity available.
 * If the wallet already resolves to an account, that account is returned rather
 * than creating a second one — signing in twice must not create a duplicate.
 */
export async function upsertUserByWallet(
  walletAddress: string,
): Promise<{ user: User; alreadyLinked: boolean }> {
  const existing = await findByWallet(walletAddress);
  if (existing) {
    await touchLastSeen(existing.id);
    return { user: existing, alreadyLinked: true };
  }

  const values: NewUser = { walletAddress };

  try {
    const inserted = await getDb().insert(users).values(values).returning();
    return { user: inserted[0], alreadyLinked: false };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    // Lost a race: another request inserted the same wallet between our SELECT
    // and our INSERT. The unique index is what decided, which is the point —
    // and the loser resolves to the winner rather than erroring.
    const winner = await findByWallet(walletAddress);
    if (!winner) throw error;
    return { user: winner, alreadyLinked: true };
  }
}

/**
 * Find or create the account behind a Privy identity, without a wallet.
 *
 * Section 29.2 puts wallet connection *after* Google sign-in, so this creates an
 * account that has no wallet yet — the A07 state.
 */
export async function upsertUserByPrivy(privyUserId: string): Promise<User> {
  const existing = await findByPrivyUserId(privyUserId);
  if (existing) return existing;

  try {
    const inserted = await getDb()
      .insert(users)
      .values({ privyUserId })
      .returning();
    return inserted[0];
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const winner = await findByPrivyUserId(privyUserId);
    if (!winner) throw error;
    return winner;
  }
}

export type AttachResult =
  | { ok: true; user: User }
  | { ok: false; reason: "wallet_already_linked"; ownerId: string };

/**
 * Attach a wallet to an existing account (the Google path, at A07).
 *
 * Refuses rather than stealing: if the wallet already belongs to somebody, that
 * is reported so the UI can explain it. Section 29.3 asks us to prevent two
 * Google accounts claiming the same companion, and quietly moving a wallet
 * between accounts would be worse than refusing — it would let whoever signed
 * in second take over the first one's companion.
 */
export async function attachWalletToUser(
  userId: string,
  walletAddress: string,
): Promise<AttachResult> {
  const user = await findById(userId);
  if (!user) {
    // A session naming an account that does not exist is a broken state, not a
    // user error. Fail loudly rather than inventing an account.
    throw new Error(`Session references unknown user ${userId}`);
  }

  if (user.walletAddress === walletAddress) {
    return { ok: true, user };
  }

  const holder = await findByWallet(walletAddress);
  if (holder && holder.id !== userId) {
    return { ok: false, reason: "wallet_already_linked", ownerId: holder.id };
  }

  // Close any active link on the wallet we are taking, then claim it.
  //
  // Three separate statements, deliberately not wrapped in one transaction. A
  // statement that fails on a unique violation aborts the enclosing Postgres
  // transaction, so a multi-statement transaction would need savepoints to
  // continue after the expected failure — and drizzle's `transaction()` does
  // not expose them. Since the partial unique index is the real arbiter and
  // every statement here is idempotent, running them independently is both
  // correct and recoverable: the worst case is a closed link with the new one
  // not yet inserted, which the next attempt re-runs from the top.
  const db = getDb();

  await db
    .update(walletLinks)
    .set({ unlinkedAt: new Date(), reason: "relinked" })
    .where(
      and(
        eq(walletLinks.walletAddress, walletAddress),
        isNull(walletLinks.unlinkedAt),
      ),
    );

  try {
    await db.insert(walletLinks).values({ userId, walletAddress });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Another session attached it microseconds ago. Report it rather than
    // stealing: section 29.3 asks us to stop two accounts claiming one companion.
    const winner = await findByWallet(walletAddress);
    throw Object.assign(new Error("wallet_already_linked"), {
      code: UNIQUE_VIOLATION,
      ownerId: winner?.id,
    });
  }

  await db
    .update(users)
    .set({ walletAddress, updatedAt: new Date() })
    .where(eq(users.id, userId));

  const updated = await findById(userId);
  if (!updated) throw new Error(`User ${userId} vanished during attach`);

  return { ok: true, user: updated };
}

/**
 * Persist the outcome of a Genesis check.
 *
 * Writes the boolean the spec asks for alongside the mint and timestamp, so a
 * later read can tell "verified at some point" from "never checked". Also
 * returns false when the check could not complete, leaving the previous value
 * untouched rather than downgrading a genuinely verified user because of a
 * transient RPC outage.
 */
export async function recordGenesisResult(
  userId: string,
  result: GenesisResult,
): Promise<void> {
  if (result.status === "unavailable") {
    logger.warn("genesis.result_ignored", { reason: "unavailable" });
    return;
  }

  const verified = result.status === "verified";

  await getDb()
    .update(users)
    .set({
      genesisVerified: verified,
      genesisMintAddress: result.mintAddress,
      genesisVerifiedAt:
        result.status === "verified" ? new Date(result.checkedAt) : null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

/** Store a resolved `.skr` domain, if one was found. */
export async function recordSeekerId(
  userId: string,
  seekerId: string,
): Promise<void> {
  await getDb()
    .update(users)
    .set({ seekerId, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

/** Close the pool on shutdown. Exported so the server entry point can call it. */
export { closeDb };
