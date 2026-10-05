/**
 * Identity routes.
 *
 * Five endpoints, and the flow they describe is section 29:
 *
 *   POST /v1/auth/nonce    issue a SIWS challenge          (A04, A05)
 *   POST /v1/auth/siws      prove wallet control            (A04)
 *   POST /v1/auth/privy     exchange a Google session       (A06)
 *   POST /v1/auth/link      attach a wallet to an account   (A07)
 *   GET  /v1/me             read identity                   (A08, A09)
 *   GET  /v1/genesis        check a wallet for an SGT       (A08, A09)
 *
 * Two ordering properties hold throughout. A wallet address never comes from a
 * request body without a signature over it, and no response ever reports a
 * Genesis result the server did not itself compute.
 */

import {
  nonceResponseSchema,
  privyVerifyRequestSchema,
  siwsVerifyRequestSchema,
  type GenesisStatus,
} from "@gochi/contracts";
import { Hono } from "hono";
import { z, ZodError } from "zod";

import {
  classifyNonceFailure,
  consumeNonce,
  issueNonce,
} from "../auth/nonce.js";
import {
  extractBearer,
  issueSession,
  verifySession,
  type Session,
} from "../auth/session.js";
import { verifySiwsSignature } from "../auth/verify-siws.js";
import { verifyPrivyAccessToken } from "../auth/privy.js";
import { env } from "../env.js";
import { logger } from "../core/logging.js";
import { ApiError, genesisUnavailable, toApiError } from "../http/errors.js";
import { GenesisCheckUnavailable, verifyGenesis } from "../seeker/genesis.js";
import { resolveSkrNames } from "../seeker/skr.js";
import {
  attachWalletToUser,
  findById,
  recordGenesisResult,
  recordSeekerId,
  toIdentity,
  touchLastSeen,
  upsertUserByPrivy,
  upsertUserByWallet,
  WalletAlreadyLinked,
} from "../users/repository.js";
import { address, createSolanaRpc } from "@solana/kit";

/** Mounted at `/v1/auth` — the four endpoints that establish a session. */
export const authRoutes = new Hono();

/** Mounted at `/v1` — the two identity reads from spec section 40. */
export const sessionRoutes = new Hono();

/**
 * Turn any thrown value into the shared error response.
 *
 * `toApiError` decides whether a failure is the client's or ours; only a genuine
 * unexpected fault is logged as one, so the log stays a record of problems rather
 * than of typos.
 */
function fail(
  c: { json: (b: unknown, s: number) => Response },
  error: unknown,
) {
  const apiError = toApiError(error);

  if (apiError.code === "internal_error") {
    logger.error("identity.unhandled", {
      reason: error instanceof Error ? error.message : "unknown",
      cause: error instanceof ZodError ? "validation" : undefined,
    });
  } else if (error instanceof ZodError) {
    // Log the field paths so a client's schema mismatch is diagnosable, without
    // echoing them into the response body.
    logger.info("identity.invalid_request", {
      issues: error.issues.map((i) => `${i.path.join(".")}:${i.code}`),
    });
  }

  return c.json(apiError.toBody(), apiError.status as never);
}

/**
 * Resolve the session, or throw `unauthorized`.
 *
 * Section 37's "session expires" case: cached companion data is preserved by the
 * client and re-authentication requested, which is a client concern. The server's
 * part is simply to distinguish expired from invalid, which the session module
 * does.
 */
async function requireSession(header: string | undefined): Promise<Session> {
  const token = extractBearer(header);
  if (!token) throw new ApiError("unauthorized");

  const result = await verifySession(token);
  if (!result.ok) throw new ApiError("unauthorized");

  return result.session;
}

// ---------------------------------------------------------------------------
// POST /v1/auth/nonce
// ---------------------------------------------------------------------------

authRoutes.post("/nonce", async (c) => {
  try {
    // Read once. A Request body can only be consumed once, so a second
    // `c.req.json()` here would throw rather than re-parse.
    // `.strict()` so an unexpected field is rejected rather than ignored. The
    // client sends exactly one key here; anything else is a caller that expects
    // the server to read something we deliberately do not accept.
    const raw = z
      .object({ address: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/) })
      .strict()
      .parse(await c.req.json());

    // The address is recorded so the nonce is bound to the wallet that will sign
    // it. It authorises nothing on its own: `verifySiwsSignature` re-derives the
    // verifying key from the address the signature is checked against, so a
    // nonce issued for one wallet cannot be spent by another's key.
    const payload = await issueNonce(raw.address);
    return c.json(nonceResponseSchema.parse({ payload }), 200);
  } catch (error) {
    return fail(c, error);
  }
});

// ---------------------------------------------------------------------------
// POST /v1/auth/siws
// ---------------------------------------------------------------------------

authRoutes.post("/siws", async (c) => {
  try {
    const body = siwsVerifyRequestSchema.parse(await c.req.json());

    // 1. Consume the nonce atomically. A read-then-mark would let two concurrent
    //    requests both see it unused and accept one signature twice.
    const issued = await consumeNonce(body.nonce);

    if (!issued) {
      const reason = await classifyNonceFailure(body.nonce);
      // A replay is a 409, an expiry a 400: the client retries the former never
      // and the latter freely.
      throw new ApiError(
        reason === "expired" ? "nonce_expired" : "nonce_reused",
      );
    }

    // 2. The nonce must have been issued for the address that is presenting it.
    if (issued.address !== body.address) {
      throw new ApiError("invalid_signature");
    }

    // 3. The signature must verify against the payload *we* issued, so domain and
    //    chainId are pinned by construction.
    if (!(await verifySiwsSignature(issued.payload, body))) {
      throw new ApiError("invalid_signature");
    }

    // 4. Only now does the address mean anything. Find or create the account.
    const { user } = await upsertUserByWallet(body.address);

    // 5. Check for an SGT. A failure here must not fail the login — section 37
    //    says an outage shows "could not verify" rather than denying access, and
    //    the user can still reach their companion in preview.
    let genesisStatus: GenesisStatus = "not_detected";
    try {
      const result = await verifyGenesis(body.address, env.solanaMainnetRpcUrl);
      genesisStatus = result.status;
      await recordGenesisResult(user.id, result);
    } catch (error) {
      if (error instanceof GenesisCheckUnavailable) {
        logger.warn("genesis.unavailable_during_login");
        genesisStatus = "unavailable";
      } else {
        throw error;
      }
    }

    // 6. Resolve a `.skr` name if the wallet has one. Reverse lookup, because we
    //    already hold the address and need the name. Best effort: a wallet with
    //    no domain is normal, so this never fails the login.
    if (user.walletAddress) {
      const seekerId = await resolveSkrBestEffort(user.walletAddress);
      if (seekerId) await recordSeekerId(user.id, seekerId);
    }

    const fresh = (await findById(user.id)) ?? user;
    const { token, expiresAt } = await issueSession(user.id, body.address);

    return c.json(
      {
        token,
        expiresAt: expiresAt.toISOString(),
        user: toIdentity(fresh, {
          status: genesisStatus,
          mintAddress: fresh.genesisMintAddress,
          checkedAt: new Date().toISOString(),
        }),
      },
      200,
    );
  } catch (error) {
    return fail(c, error);
  }
});

// ---------------------------------------------------------------------------
// POST /v1/auth/privy
// ---------------------------------------------------------------------------

authRoutes.post("/privy", async (c) => {
  try {
    const body = privyVerifyRequestSchema.parse(await c.req.json());

    const verified = await verifyPrivyAccessToken(body.accessToken);
    if (!verified.ok) {
      // Expired and invalid both end the session. They are logged distinctly
      // because a `wrong_app` token is genuinely another app's, which is worth
      // knowing about and not the user's mistake.
      logger.info("privy.token_rejected", { reason: verified.reason });
      throw new ApiError("unauthorized");
    }

    // The account exists but may have no wallet yet — that is the A07 state,
    // since section 29.2 puts wallet connection after Google sign-in.
    const user = await upsertUserByPrivy(verified.claims.userId);
    await touchLastSeen(user.id);

    const { token, expiresAt } = await issueSession(
      user.id,
      user.walletAddress,
    );

    return c.json(
      {
        token,
        expiresAt: expiresAt.toISOString(),
        user: toIdentity(user, null),
      },
      200,
    );
  } catch (error) {
    return fail(c, error);
  }
});

// ---------------------------------------------------------------------------
// POST /v1/auth/link
// ---------------------------------------------------------------------------

authRoutes.post("/link", async (c) => {
  try {
    const session = await requireSession(c.req.header("authorization"));

    const body = z
      .object({
        nonce: z.string().regex(/^[0-9a-f]{32}$/),
        address: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
        signature: z.array(z.number().int().min(0).max(255)).length(64),
        signedMessage: z.array(z.number().int().min(0).max(255)),
      })
      .strict()
      .parse(await c.req.json());

    // Same proof as the SIWS path. This is what makes the linked wallet ours,
    // rather than a claim the request body makes about it.
    const issued = await consumeNonce(body.nonce);
    if (!issued) {
      const reason = await classifyNonceFailure(body.nonce);
      throw new ApiError(
        reason === "expired" ? "nonce_expired" : "nonce_reused",
      );
    }
    if (issued.address !== body.address) {
      throw new ApiError("invalid_signature");
    }
    if (!(await verifySiwsSignature(issued.payload, body))) {
      throw new ApiError("invalid_signature");
    }

    try {
      const { user } = await attachWalletToUser(session.userId, body.address);
      await touchLastSeen(session.userId);
      return c.json({ user: toIdentity(user, null) }, 200);
    } catch (error) {
      if (error instanceof WalletAlreadyLinked) {
        throw new ApiError("wallet_already_linked");
      }
      throw error;
    }
  } catch (error) {
    return fail(c, error);
  }
});

// ---------------------------------------------------------------------------
// GET /v1/me
// ---------------------------------------------------------------------------

sessionRoutes.get("/me", async (c) => {
  try {
    const session = await requireSession(c.req.header("authorization"));

    const user = await findById(session.userId);
    if (!user) {
      // The session names an account that does not exist. Treat as unauthenticated
      // rather than 500: the client should sign in again.
      throw new ApiError("unauthorized");
    }

    await touchLastSeen(user.id);

    return c.json(
      {
        id: user.id,
        wallet: user.walletAddress,
        seekerId: user.seekerId,
        genesisVerified: user.genesisVerified,
        genesisStatus: user.genesisVerified ? "verified" : "not_detected",
        genesisMintAddress: user.genesisMintAddress,
        walletLinked: user.walletAddress !== null,
      },
      200,
    );
  } catch (error) {
    return fail(c, error);
  }
});

// ---------------------------------------------------------------------------
// GET /v1/genesis
// ---------------------------------------------------------------------------

/**
 * Check a wallet for an SGT, on demand.
 *
 * A completed check that finds nothing is a 200 with `not_detected`, not an
 * error: "not detected" is an answer, and section 37 wants A09 to show an
 * explicit reason with a retry rather than a failure. An RPC failure is a 503,
 * because section 37 forbids reporting an outage as a negative result.
 */
sessionRoutes.get("/genesis", async (c) => {
  try {
    const session = await requireSession(c.req.header("authorization"));

    const user = await findById(session.userId);
    if (!user) throw new ApiError("unauthorized");

    // Only ever check the wallet this account is linked to. Accepting an address
    // from the query string would let anyone probe whether an arbitrary wallet
    // holds a Seeker.
    if (!user.walletAddress) throw new ApiError("unauthorized");

    try {
      const result = await verifyGenesis(
        user.walletAddress,
        env.solanaMainnetRpcUrl,
      );
      await recordGenesisResult(user.id, result);

      if (result.status === "verified" && !user.seekerId) {
        const seekerId = await resolveSkrBestEffort(user.walletAddress);
        if (seekerId) await recordSeekerId(user.id, seekerId);
      }

      return c.json(result, 200);
    } catch (error) {
      if (error instanceof GenesisCheckUnavailable) {
        logger.warn("genesis.check_unavailable");
        throw genesisUnavailable();
      }
      throw error;
    }
  } catch (error) {
    return fail(c, error);
  }
});

/**
 * Resolve a wallet's `.skr` name, swallowing failure.
 *
 * Reverse rather than forward lookup, because callers already hold the address
 * and need the name. Sorted before taking the first: on-chain order is not a
 * ranking, so an unsorted pick would change the displayed label between calls.
 * That makes the label stable, not trustworthy — a `.skr` transfer needs nothing
 * from the recipient, so it is rendered beside the truncated address, never
 * instead of it.
 *
 * Returns null rather than throwing. A wallet without a domain is the common
 * case, and it must never fail a login or block a Genesis check.
 */
async function resolveSkrBestEffort(
  walletAddress: string,
): Promise<string | null> {
  try {
    const rpc = createSolanaRpc(env.solanaMainnetRpcUrl);
    const names = await resolveSkrNames(rpc, address(walletAddress));
    return names[0] ?? null;
  } catch (error) {
    logger.warn("skr.resolve_failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}
