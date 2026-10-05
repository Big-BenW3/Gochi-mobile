/**
 * Session tokens.
 *
 * Stateless JWTs, signed HS256 with `API_JWT_SECRET`. No session table: the
 * token carries everything needed to identify the caller, so an authenticated
 * request costs one signature check rather than a database round trip. That
 * matters because the auth check sits in front of every other route.
 *
 * What the token deliberately does *not* carry is anything about Genesis or
 * progression. Those are read from the database on demand, for two reasons: a
 * seven-day token would otherwise keep reporting a stale verified status after
 * a device was revoked, and spec section 21.2 makes the server authoritative
 * for progression, which a self-contained token is not.
 *
 * Seven days is long enough that a user is not reauthorising daily, and short
 * enough that a leaked token on a lost handset has a bounded life. There is no
 * refresh token: rotation introduces a revocation problem that V1 does not need,
 * and a revoked session is recoverable by signing in again.
 */

import { errors, jwtVerify, SignJWT } from "jose";

import { env } from "../env.js";
import { logger } from "../core/logging.js";

/**
 * Issuer and audience are both checked on verify.
 *
 * Without them a token minted for any other consumer of the same signing secret
 * would authenticate here — a real risk in a monorepo where several services
 * might share one secret by accident.
 */
const ISSUER = "gochi";
const AUDIENCE = "gochi-mobile";

const ALGORITHM = "HS256";

/** Seven days. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

/**
 * Why a token was rejected.
 *
 * The distinction matters to the caller: an expired token is a normal event that
 * should send the user back to A04, whereas a malformed or wrongly-signed token
 * is either a bug or an attack and should be logged as such.
 */
export type SessionFailure =
  "expired" | "invalid_signature" | "malformed" | "wrong_issuer";

export interface Session {
  userId: string;
  walletAddress: string | null;
}

export type SessionResult =
  { ok: true; session: Session } | { ok: false; reason: SessionFailure };

/**
 * The signing key, derived once.
 *
 * jose requires a `Uint8Array`, and a string would be silently accepted with
 * its UTF-16 bytes — which still round-trips but halves the effective entropy
 * of an ASCII secret. Encoding explicitly avoids the ambiguity.
 */
function signingKey(): Uint8Array {
  return new TextEncoder().encode(env.jwtSecret);
}

/** Issue a session token for a user. */
export async function issueSession(
  userId: string,
  walletAddress: string | null,
): Promise<{ token: string; expiresAt: Date }> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAtSeconds = issuedAt + SESSION_TTL_SECONDS;

  const token = await new SignJWT({
    // `sub` is the standard subject claim; the API reads the user id from there
    // rather than a custom field.
    sub: userId,
    wallet: walletAddress,
  })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAtSeconds)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    // A unique id per token, so two sessions for one user are distinguishable in
    // logs without storing anything.
    .setJti(crypto.randomUUID())
    .sign(signingKey());

  return { token, expiresAt: new Date(expiresAtSeconds * 1000) };
}

/**
 * Verify a session token.
 *
 * Never throws: an auth check that can throw has to be wrapped at every call
 * site, and the one thing that goes wrong in practice is a token that is simply
 * no longer valid.
 */
export async function verifySession(token: string): Promise<SessionResult> {
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      // Only HS256. Pinning the algorithm is what stops an attacker presenting
      // an unsigned token or an RS256 token whose "public key" is something
      // they control — the classic JWT confusion attack.
      algorithms: [ALGORITHM],
    });

    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      return { ok: false, reason: "malformed" };
    }

    const wallet =
      typeof payload.wallet === "string" && payload.wallet.length > 0
        ? payload.wallet
        : null;

    return {
      ok: true,
      session: { userId: payload.sub, walletAddress: wallet },
    };
  } catch (error) {
    if (error instanceof errors.JWTExpired) {
      return { ok: false, reason: "expired" };
    }
    if (error instanceof errors.JWSSignatureVerificationFailed) {
      // A wrong signature is not a routine event. Log it.
      logger.warn("session.bad_signature");
      return { ok: false, reason: "invalid_signature" };
    }
    if (error instanceof errors.JWTClaimValidationFailed) {
      return { ok: false, reason: "wrong_issuer" };
    }
    return { ok: false, reason: "malformed" };
  }
}

/**
 * Pull the bearer token out of an Authorization header.
 *
 * Returns null rather than throwing so a route without a session is simply
 * unauthenticated, which is the correct state for the nonce and auth endpoints.
 */
export function extractBearer(
  header: string | undefined | null,
): string | null {
  if (!header) return null;

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;

  const token = match[1].trim();
  return token.length > 0 ? token : null;
}
