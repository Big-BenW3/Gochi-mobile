/**
 * SIWS signature verification.
 *
 * The rule this file exists to enforce: **the verifying key is derived from the
 * address the server is about to act on, never read from the request.**
 *
 * `verifySignIn` from `@solana/wallet-standard-util` compares the payload's
 * fields against the signed text and then verifies the signature with
 * `account.publicKey`. It never checks that key and the address agree. Take the
 * key from the request body instead and any throwaway keypair can sign a
 * message naming someone else's address: the signature is genuine, it just is
 * not the address holder's.
 *
 * Everything else here is shape-checking. Signature length, byte ranges and
 * address validity are all attacker-chosen, and passing them through to the
 * ed25519 verify produces inconsistent failures — a short signature throws a
 * library error about byte lengths, while a non-array `signedMessage` coerces
 * to an empty array and returns a plain `false`. Rejecting on shape gives one
 * clear answer for both.
 */

import { getBase58Encoder } from "@solana/kit";
import type { SiwsPayload } from "@gochi/contracts";
import { verifySignIn } from "@solana/wallet-standard-util";

import { logger } from "../core/logging.js";

/** What the client posts back. Shape is validated by the contracts schema first. */
export interface SiwsProof {
  address: string;
  signature: number[];
  signedMessage: number[];
}

/**
 * Accept a byte sequence from either JSON or a typed array.
 *
 * `Array.isArray` alone is not enough and is a trap: a `Uint8Array` — what most
 * Solana code produces, including `TextEncoder.encode` — is an
 * `ArrayBufferView`, not an `Array`, so a strict check rejects the ordinary case
 * while accepting a JSON-parsed one. Normalising to `Uint8Array` here means the
 * rest of the function does not care which it got.
 */
function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) {
    // Every element already checked to be a byte by the contracts schema, but a
    // truncation here would silently sign over less than the caller intended.
    const bytes = new Uint8Array(value.length);
    for (let i = 0; i < value.length; i++) bytes[i] = value[i];
    return bytes;
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

/**
 * Verify a SIWS signature against a payload the server issued.
 *
 * `payload` must be the copy stored at issue time, not anything reconstructed
 * from the request. That is what makes `domain` and `chainId` a guarantee: no
 * client-supplied copy of either ever reaches this function.
 *
 * Returns false rather than throwing for every signature failure, because a
 * bad signature is an expected outcome and the caller needs one branch.
 * Malformed *input* throws, since that is a client bug or an attack worth a 400.
 */
export async function verifySiwsSignature(
  payload: SiwsPayload,
  proof: SiwsProof,
): Promise<boolean> {
  // Shape first. Everything here is attacker-controlled, and the library's own
  // error handling for these cases is inconsistent.
  const signature = toBytes(proof.signature);
  if (!signature || signature.length !== 64) {
    throw new Error("Malformed signature.");
  }

  const signedMessage = toBytes(proof.signedMessage);
  if (!signedMessage || signedMessage.length === 0) {
    throw new Error("Malformed signed message.");
  }

  // Derive the key from the address. This line is the whole security property.
  const publicKey = getBase58Encoder().encode(proof.address);
  if (publicKey.length !== 32) {
    throw new Error("Malformed address.");
  }

  try {
    return await verifySignIn(
      { ...payload, address: proof.address },
      {
        account: {
          address: proof.address,
          chains: [],
          features: [],
          publicKey,
        },
        signature,
        signedMessage,
      },
    );
  } catch (error) {
    // verifySignIn throws on a mismatch between the payload fields and the
    // signed text (a different domain, say). That is a rejection, not a crash.
    logger.warn("siws.verify_threw", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return false;
  }
}

/**
 * Confirm that a nonce was issued for this address.
 *
 * `verifySignIn` binds the signature to the address, and this binds the nonce
 * to the address. Without the second check, a nonce issued for wallet A can be
 * signed by wallet B and still produce a valid SIWS proof for B — the signature
 * is real, the challenge simply was not B's.
 *
 * Compared with a constant-time compare so this cannot be used as a timing
 * oracle. The values are not secret, but the habit costs nothing.
 */
export function nonceBelongsToAddress(
  issuedFor: string,
  presented: string,
): boolean {
  if (issuedFor.length !== presented.length) return false;

  let mismatch = 0;
  for (let i = 0; i < issuedFor.length; i++) {
    mismatch |= issuedFor.charCodeAt(i) ^ presented.charCodeAt(i);
  }
  return mismatch === 0;
}
