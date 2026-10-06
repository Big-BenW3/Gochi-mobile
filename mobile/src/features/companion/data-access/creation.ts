/**
 * Companion creation — the client's half of spec section 32's flow.
 *
 * Four calls in sequence, and the ordering carries the honesty requirements:
 *
 *   claim the row → mint on chain → persist the address → reveal
 *
 * The client cannot tell whether the mint succeeded from a 201 alone, so
 * `createCompanion` returns the persisted asset address and the reveal screen
 * renders from that. A failure leaves a companion row with no asset, which the
 * birth screen shows as retryable rather than as a hatchling — the distinction
 * between "not yet" and "never" is the whole point.
 */

import type { ApiErrorCode } from '@gochi/contracts'

import { api, ApiError } from '../../../core/api'

/**
 * How a creation attempt ended.
 *
 * `unavailable` is separate from `failed` because the two need different copy:
 * one is worth retrying immediately, the other suggests something is wrong with
 * the wallet or the payer.
 */
export type CreationOutcome =
  | { ok: true; assetAddress: string | null; alreadyCreated: boolean }
  | { ok: false; reason: 'unavailable' | 'failed' | 'rejected'; message: string }

const MESSAGES: Record<Exclude<CreationOutcome, { ok: true }>['reason'], string> = {
  unavailable: 'We could not create your companion right now. Please try again shortly.',
  failed: 'Something went wrong. Please try again.',
  rejected: 'Wallet connection cancelled.',
}

/** Map an API failure onto a creation outcome. */
function classify(error: unknown): CreationOutcome {
  if (!(error instanceof ApiError)) {
    return { ok: false, reason: 'failed', message: MESSAGES.failed }
  }

  const code = error.code as ApiErrorCode | undefined

  switch (code) {
    case 'mint_unavailable':
      return { ok: false, reason: 'unavailable', message: MESSAGES.unavailable }
    case 'wallet_rejected':
      return { ok: false, reason: 'rejected', message: MESSAGES.rejected }
    default:
      return { ok: false, reason: 'failed', message: error.message || MESSAGES.failed }
  }
}

/**
 * Create the companion, or return the existing one.
 *
 * Idempotent per wallet: a repeat call returns `alreadyCreated` rather than
 * minting a second asset. That is the server's guarantee (a unique index), and
 * relying on it here is what makes a double-tapped "Activate Egg" harmless.
 */
export async function createCompanion(name: string): Promise<CreationOutcome> {
  try {
    const response = await api.createCompanion({ name })
    return {
      ok: true,
      assetAddress: response.companion.assetAddress,
      alreadyCreated: response.alreadyCreated,
    }
  } catch (error) {
    return classify(error)
  }
}

/**
 * The Core asset detail for screen G03.
 *
 * Reads from the database rather than the chain: every field was persisted at mint
 * time, and re-reading a network account on every app open to display static facts
 * would be slow for no benefit.
 */
export async function fetchCompanionAsset() {
  return api.companionAsset()
}

/** Where the Core metadata document lives, for an explorer or a direct fetch. */
export function metadataUriFor(assetAddress: string, origin: string): string {
  return `${origin}/v1/metadata/${assetAddress}.json`
}
