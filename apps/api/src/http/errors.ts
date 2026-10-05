/**
 * Errors and the section 37 error matrix.
 *
 * The spec gives no status codes and no error identifiers anywhere, so both are
 * ours. What is *not* ours is the behaviour: section 37 specifies which
 * situations exist, and two of its strings are quoted verbatim and must appear to
 * the user exactly as written.
 *
 * Every failure the API can produce resolves to one `ApiErrorCode`, so the client
 * switches on a closed set rather than pattern-matching message strings.
 */

import type { ApiErrorCode } from "@gochi/contracts";
import { ZodError } from "zod";

import { GenesisCheckUnavailable } from "../seeker/genesis.js";

/** HTTP status per code. Chosen so a 4xx means "the client" and 5xx means "us". */
const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  wallet_rejected: 400,
  nonce_expired: 400,
  nonce_reused: 409,
  invalid_signature: 401,
  unauthorized: 401,
  wallet_already_linked: 409,
  genesis_not_detected: 200,
  verification_unavailable: 503,
  invalid_request: 400,
  internal_error: 500,
};

/**
 * User-facing copy.
 *
 * Two of these are quoted verbatim from spec section 37 and must not be
 * reworded — "Wallet connection cancelled." for a dismissed wallet prompt, and
 * "We could not verify your Seeker identity right now." for an indexer outage.
 * The rest are written in the same voice: plain, no jargon, no internal detail.
 */
const MESSAGE_BY_CODE: Record<ApiErrorCode, string> = {
  // Section 37, verbatim. A dismissed prompt is not an account failure.
  wallet_rejected: "Wallet connection cancelled.",

  nonce_expired: "That sign-in request expired. Please try again.",
  nonce_reused: "That sign-in link has already been used.",
  invalid_signature: "We could not verify that wallet. Please try again.",
  unauthorized: "Your session has expired. Please sign in again.",

  wallet_already_linked:
    "That wallet is already linked to another Gochi account.",

  // Section 37, verbatim. The one case that must never be reported as verified.
  verification_unavailable:
    "We could not verify your Seeker identity right now.",

  invalid_request: "That request could not be processed.",
  internal_error: "Something went wrong. Please try again.",

  // Reached by GET /v1/genesis when the check completed and found nothing.
  // Section 37 calls for an explicit reason and a retry, so this is a 200 with
  // a status rather than an error: "not detected" is an answer, not a failure.
  genesis_not_detected:
    "We could not find a Seeker Genesis Token on that wallet.",
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode) {
    super(MESSAGE_BY_CODE[code]);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }

  toBody() {
    return { code: this.code, message: this.message };
  }
}

/** Thrown when a request body fails its schema. */
export const invalidRequest = () => new ApiError("invalid_request");

/**
 * Reduce any thrown value to an `ApiError`.
 *
 * A `ZodError` becomes `invalid_request` rather than an internal fault. Without
 * this, every malformed request body — a typo'd address, an extra field, a
 * signature of the wrong length — would answer 500, which tells the user the
 * app is broken when the request was wrong, and fills the log with stack noise
 * instead of the validation detail.
 *
 * The Zod issues are logged but never returned: they name internal schema paths,
 * which is a map of our validation rules for anyone probing the API.
 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  // A body that is not JSON at all. Hono's json() throws a SyntaxError, which is
  // the client's problem and would otherwise be reported as a server fault.
  if (error instanceof SyntaxError) {
    return invalidRequest();
  }

  if (error instanceof ZodError) {
    return invalidRequest();
  }

  // Postgres unique violation, from the linking path. Mapped centrally so a
  // conflict reads as a conflict regardless of which handler let it escape.
  if (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505"
  ) {
    return new ApiError("wallet_already_linked");
  }

  return new ApiError("internal_error");
}

/**
 * A Genesis check that could not complete.
 *
 * Distinct from `genesis_not_detected` on purpose, and the distinction is the
 * whole point of section 37's wording. Swallowing an RPC outage into a negative
 * result would tell a real Seeker owner they own no device — wrong, and
 * unfalsifiable from the client's side.
 *
 * The cause stays in the log rather than the response: a 503 body must not leak
 * an RPC URL or a provider error string to the client.
 */
export function genesisUnavailable(): ApiError {
  return new ApiError("verification_unavailable");
}

/** Re-export so route handlers do not import from the seeker module directly. */
export { GenesisCheckUnavailable };
