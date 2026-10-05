/**
 * Privy access-token verification.
 *
 * Privy access tokens are ES256 JWTs. Verification resolves the app's JWKS and
 * pins issuer, audience, algorithm and `typ`.
 *
 * The audience is the claim that makes this authentication rather than a
 * well-formedness check. Privy mints tokens for every app on the platform, and
 * creating an app takes a minute — so a token minted for an attacker's Privy app
 * has a genuine signature. Verify without pinning `audience` to our own app ID
 * and that token authenticates against this server.
 *
 * `jose.jwtVerify` does not fail an audience check it cannot perform: it skips
 * the check entirely when `audience` is `undefined`. So the app ID is read once
 * into a checked constant at module load, and an unset variable throws there
 * rather than quietly turning verification into a signature check. That failure
 * mode is the reason this is a module-level constant and not a property read
 * inline at each call site.
 *
 * No wallet address is read from the request. An access token carries no linked
 * accounts, so it cannot say which wallet its bearer controls — taking one from
 * the body would let a caller with their own valid Google session submit a real
 * Seeker owner's address. The wallet arrives by signing our SIWS challenge.
 */

import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload } from "jose";

import { logger } from "../core/logging.js";
import { env } from "../env.js";

/**
 * Privy App ID, checked once at module load.
 *
 * `EXPO_PUBLIC_` is correct even server-side: the value is a public identifier
 * by design, and it must match what the app sends. This is a local constant so
 * that an unset value throws here instead of disabling the audience check.
 */
const PRIVY_APP_ID = env.privyAppId;

/** Privy signs as the platform, not as the app. */
const PRIVY_ISSUER = "privy.io";

/** ES256 only. Pinning prevents an algorithm-confusion downgrade. */
const ALGORITHMS = ["ES256"];

/**
 * The app's JWKS, fetched lazily and cached.
 *
 * `createRemoteJWKSet` caches the response and re-fetches on an unknown key ID,
 * so Privy's signing-key rotation needs no redeploy.
 */
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function getJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`https://api.privy.io/v1/apps/${PRIVY_APP_ID}/jwks.json`),
    );
  }
  return jwks;
}

/**
 * The claims a verified Privy access token carries.
 *
 * These are the whole of what verification tells us. Note the absence of a
 * wallet: that is the point, not an oversight.
 */
export interface PrivyClaims {
  /** Privy user ID — the `sub` claim, durable across devices. */
  userId: string;
  /** The session the token was issued for. */
  sessionId: string | null;
  /** When the token expires, as a Date. */
  expiresAt: Date;
}

export type PrivyVerification =
  | { ok: true; claims: PrivyClaims }
  | { ok: false; reason: "expired" | "invalid" | "wrong_app" | "malformed" };

/**
 * Verify a Privy access token.
 *
 * Never throws. An expired token is an ordinary event that sends the user back to
 * A06, so it needs to be a value rather than an exception every caller catches.
 */
export async function verifyPrivyAccessToken(
  accessToken: string,
): Promise<PrivyVerification> {
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    return { ok: false, reason: "malformed" };
  }

  let payload: JWTPayload;
  try {
    const verified = await jwtVerify(accessToken, getJwks(), {
      algorithms: ALGORITHMS,
      audience: PRIVY_APP_ID,
      issuer: PRIVY_ISSUER,
      typ: "JWT",
    });
    payload = verified.payload;
  } catch (error) {
    if (error instanceof errors.JWTExpired) {
      return { ok: false, reason: "expired" };
    }
    if (error instanceof errors.JWTClaimValidationFailed) {
      // Issuer, audience or typ disagreed. Most often a token minted for a
      // different Privy app, which has a genuine signature.
      return { ok: false, reason: "wrong_app" };
    }
    if (error instanceof errors.JWSSignatureVerificationFailed) {
      logger.warn("privy.bad_signature");
      return { ok: false, reason: "invalid" };
    }
    if (error instanceof errors.JOSEError) {
      // Includes JWKS fetch failure. Treated as invalid rather than a distinct
      // case: from the client's point of view the token did not authenticate.
      logger.warn("privy.verify_jose_error", {
        reason: error.message,
      });
      return { ok: false, reason: "invalid" };
    }
    return { ok: false, reason: "malformed" };
  }

  const userId = payload.sub;
  if (typeof userId !== "string" || userId.length === 0) {
    return { ok: false, reason: "malformed" };
  }

  if (typeof payload.exp !== "number") {
    // jose validates exp when present. An access token without one would be
    // valid forever, which is not something we want to accept.
    return { ok: false, reason: "malformed" };
  }

  return {
    ok: true,
    claims: {
      userId,
      sessionId: typeof payload.sid === "string" ? payload.sid : null,
      expiresAt: new Date(payload.exp * 1000),
    },
  };
}

/**
 * Warm the JWKS cache at startup.
 *
 * Optional: the first verification would fetch it anyway. Doing it here turns a
 * slow first login into a logged warning at boot rather than a user staring at a
 * spinner.
 */
export async function primePrivyJwks(): Promise<void> {
  try {
    await jwtVerify(
      // A token that cannot verify is fine — this only exercises the fetch.
      "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwcmVmaWdoIn0.",
      getJwks(),
      { algorithms: ALGORITHMS, audience: PRIVY_APP_ID, issuer: PRIVY_ISSUER },
    );
  } catch (error) {
    // A JWKSError here is the interesting one; a signature failure is expected
    // from the deliberately invalid token above.
    if (error instanceof errors.JWKSNoMatchingKey) {
      logger.info("privy.jwks_primed");
      return;
    }
    if (error instanceof errors.JWTInvalid) return; // expected
    logger.warn("privy.jwks_prime_failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
  }
}
