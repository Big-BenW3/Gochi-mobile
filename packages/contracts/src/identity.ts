/**
 * Shared contracts — identity.
 *
 * The app and the API both validate against these schemas. That is the point:
 * if the two sides disagree about a field name, a zod parse fails on one side
 * of the wire instead of producing a subtly wrong request that only shows up as
 * a bug much later.
 *
 * The SIWS payload is the most important shape here. Every field in it is fed
 * into the signature verification, and every one of them is attacker-controlled
 * unless the server issued it — which is why the client sends back only the
 * address, the signature, the signed bytes and the nonce, and the server
 * reconstructs the message from its own stored copy.
 */

import { z } from "zod";

/**
 * A base58 Solana address.
 *
 * 32-44 characters, because 32 bytes base58-encode to 32-44 characters
 * depending on the leading byte. Anchored so a truncated or padded address is
 * rejected before it reaches `getBase58Encoder().encode()`, which would
 * otherwise throw an opaque decoder error deep inside verification.
 */
export const solanaAddressSchema = z
  .string()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Not a valid Solana address.");

/** Solana mainnet CAIP-2 identifier. */
export const SOLANA_MAINNET_CHAIN_ID = "solana:mainnet";

/**
 * The SIWS payload the server issues.
 *
 * Chain id is pinned to mainnet by the server rather than taken from the
 * wallet's selected chain: SGTs exist only on mainnet, so a devnet-scoped
 * signature proves nothing about a device. Pinning it at issue time is what
 * turns that into a guarantee rather than a comment.
 */
export const siwsPayloadSchema = z.object({
  chainId: z.literal(SOLANA_MAINNET_CHAIN_ID),
  domain: z.string().min(1),
  uri: z.string().min(1),
  version: z.string().min(1),
  statement: z.string().min(1),
  /** Hex-encoded, server-generated, single use. */
  nonce: z.string().regex(/^[0-9a-f]{32}$/, "Malformed nonce."),
  issuedAt: z.string().datetime(),
  expirationTime: z.string().datetime(),
});
export type SiwsPayload = z.infer<typeof siwsPayloadSchema>;

/** `POST /v1/auth/nonce` request body. Empty — the server decides everything. */
export const nonceRequestSchema = z.object({}).strict();
export type NonceRequest = z.infer<typeof nonceRequestSchema>;

/** `POST /v1/auth/nonce` response body. */
export const nonceResponseSchema = z.object({
  payload: siwsPayloadSchema,
});
export type NonceResponse = z.infer<typeof nonceResponseSchema>;

/**
 * `POST /v1/auth/siws` request body.
 *
 * Exactly four fields, and deliberately not the wallet's full `account` object.
 * The verifying key has to be derived server-side from the address the server
 * is about to act on; accepting a public key here would let any throwaway
 * keypair sign a message naming someone else's address. The signature would be
 * genuine and the address would not be the holder's.
 */
export const siwsVerifyRequestSchema = z
  .object({
    address: solanaAddressSchema,
    nonce: z.string().regex(/^[0-9a-f]{32}$/, "Malformed nonce."),
    /** 64 bytes for ed25519. */
    signature: z.array(z.number().int().min(0).max(255)).length(64),
    /** The exact bytes the wallet signed. */
    signedMessage: z.array(z.number().int().min(0).max(255)),
    // Strict on purpose. A wallet's `signIn` result also carries an `account`
    // object holding a public key, and it is tempting to post it. Rejecting the
    // whole body when one is present makes that a loud protocol error instead of a
    // field that is silently dropped — and silently dropping it is what keeps the
    // server deriving the verifying key from the address rather than the body.
  })
  .strict();
export type SiwsVerifyRequest = z.infer<typeof siwsVerifyRequestSchema>;

/**
 * The eight companion conditions from spec section 5.2.
 *
 * Declared here rather than in the API's engine config so both sides validate
 * against one definition. Duplicating the enum would let the app render a
 * condition string the server cannot produce, which fails silently as a blank
 * badge rather than as a type error.
 */
export const conditionSchema = z.enum([
  "HEALTHY",
  "ENERGIZED",
  "TIRED",
  "ALERT",
  "DAMAGED",
  "RECOVERING",
  "EVOLVING",
  "SLEEPING",
]);
export type Condition = z.infer<typeof conditionSchema>;

/**
 * The result of checking a wallet for a Seeker Genesis Token.
 *
 * Three states, not two, and the difference matters:
 *
 *   - `verified`     the wallet holds an SGT
 *   - `not_detected` the check completed and found nothing
 *   - `unavailable`  the check could not complete
 *
 * Spec section 37 requires the last two to read differently — "We could not
 * verify your Seeker identity right now" versus "Genesis NFT not found" — and
 * forbids marking the user verified on an indexer outage. Collapsing them into
 * one boolean makes that impossible to express.
 */
export const genesisStatusSchema = z.enum([
  "verified",
  "not_detected",
  "unavailable",
]);
export type GenesisStatus = z.infer<typeof genesisStatusSchema>;

/**
 * The Genesis result as the API reports it.
 *
 * `mintAddress` identifies the *device*, not the wallet: SGTs move between
 * wallets, so it is the only value that supports one-claim-per-device.
 */
export const genesisResultSchema = z.object({
  status: genesisStatusSchema,
  mintAddress: z.string().nullable(),
  /** When the check ran, for the revalidation sweep in section 30.4. */
  checkedAt: z.string().datetime(),
});
export type GenesisResult = z.infer<typeof genesisResultSchema>;

/**
 * The identity the app holds, per spec section 40's `GET /v1/me`.
 *
 * Field names follow section 40 exactly. `seekerId` stays nullable because a
 * wallet without a `.skr` domain is a legitimate state, and inventing a
 * placeholder would be a lie the app then has to display.
 */
export const userSchema = z.object({
  id: z.string().uuid(),
  wallet: z.string().nullable(),
  seekerId: z.string().nullable(),
  genesisVerified: z.boolean(),
  genesisStatus: genesisStatusSchema,
  genesisMintAddress: z.string().nullable(),
  /** True once a wallet is linked, whichever auth path got us here. */
  walletLinked: z.boolean(),
});
export type User = z.infer<typeof userSchema>;

/**
 * `POST /v1/auth/siws` response body.
 *
 * Declared after `userSchema` because the schema is built eagerly at module
 * load: referencing a `const` declared further down would throw a
 * temporal-dead-zone error the first time this file is imported.
 */
export const siwsVerifyResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.string().datetime(),
  user: userSchema,
});
export type SiwsVerifyResponse = z.infer<typeof siwsVerifyResponseSchema>;

/**
 * `POST /v1/auth/privy` request body.
 *
 * The access token, and nothing else. There is deliberately no `address` field.
 *
 * A Privy access token proves who signed in with Google; it carries no linked
 * accounts, so it cannot also prove which wallet that person controls. Accepting
 * an address alongside it would be the same bug the Genesis skill warns about: a
 * caller submits a real Seeker owner's address with their own valid Google
 * session and is handed that owner's identity.
 *
 * The wallet arrives the honest way instead — spec 29.2 puts "Connect Seeker
 * Wallet" after Google sign-in, so the user signs the SIWS challenge with that
 * wallet and the address comes from the signature. That is A07.
 */
export const privyVerifyRequestSchema = z
  .object({
    /** Privy access token, obtained client-side. */
    accessToken: z.string().min(1),
  })
  .strict();
export type PrivyVerifyRequest = z.infer<typeof privyVerifyRequestSchema>;

/** `POST /v1/auth/privy` response body — same shape as the SIWS response. */
export const privyVerifyResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.string().datetime(),
  user: userSchema,
});
export type PrivyVerifyResponse = z.infer<typeof privyVerifyResponseSchema>;

/**
 * Machine-readable error codes.
 *
 * The spec gives no status codes or error identifiers anywhere, so these are
 * ours. What is *not* ours to change are the two user-facing strings quoted in
 * section 37, which are reproduced verbatim in the UI.
 *
 * `wallet_rejected` is separate from a genuine failure because section 37 says
 * a cancelled MWA prompt must not be treated as an account failure — it is a
 * normal outcome of a user changing their mind.
 */
export const apiErrorCodeSchema = z.enum([
  /** The user dismissed the wallet prompt. Not a failure. */
  "wallet_rejected",
  /** The nonce was never issued, or has expired. */
  "nonce_expired",
  /** The nonce was already spent — a replay attempt. */
  "nonce_reused",
  /** Signature did not verify against the address. */
  "invalid_signature",
  /** Session missing, malformed or expired. */
  "unauthorized",
  /** Spec 29.3: this wallet is already linked to another account. */
  "wallet_already_linked",
  /** No Genesis Token. Spec 37: show the reason and offer retry. */
  "genesis_not_detected",
  /** Spec 37: "We could not verify your Seeker identity right now." */
  "verification_unavailable",
  /** Request body failed schema validation. */
  "invalid_request",
  /** Anything unexpected. */
  "internal_error",
]);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

/** Every error the API returns has this shape. */
export const apiErrorSchema = z.object({
  code: apiErrorCodeSchema,
  /** Safe to show a user. Never contains internal detail. */
  message: z.string(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
