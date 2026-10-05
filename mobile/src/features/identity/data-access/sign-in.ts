/**
 * Sign-in-with-Solana, from the phone.
 *
 * The exchange is three steps and the ordering is the whole design:
 *
 *   1. ask the server for a challenge
 *   2. have the wallet sign it
 *   3. hand the signature back for a session token
 *
 * The challenge is never assembled here. `domain`, `chainId`, `nonce` and
 * `expirationTime` all come from the server, because every one of them ends up
 * inside the signature check and a client-supplied copy would be a value the
 * caller chose. We add only the address, which the server could not know.
 *
 * MWA's `signIn` does steps 2 and the prompt in one call. It also returns an
 * `account` object we deliberately do not send: the server derives the verifying
 * key from the address itself, and accepting a public key from the body would
 * let any throwaway keypair sign a message naming someone else's wallet.
 */

import type { SiwsPayload, SiwsVerifyRequest } from '@gochi/contracts'
import type { useMobileWallet } from '@wallet-ui/react-native-kit'

import { ApiError, api, setSessionToken } from '../../../core/api'
import { logger } from '../../../core/logging'

/** What the wallet hook gives us that this module needs. */
type WalletApi = Pick<ReturnType<typeof useMobileWallet>, 'signIn'>

/**
 * Why a sign-in attempt ended without a session.
 *
 * `rejected` is separate from `failed` on purpose: spec section 37 says a
 * dismissed wallet prompt must not be treated as an account failure, and A05
 * lists "MWA declined" as its own state.
 */
export type SignInFailure = 'rejected' | 'no_wallet' | 'failed' | 'unavailable'

export type SignInResult =
  { ok: true; seekerId: string | null; genesisStatus: string } | { ok: false; reason: SignInFailure; message: string }

const FAILURE_MESSAGES: Record<SignInFailure, string> = {
  // Spec section 37, verbatim.
  rejected: 'Wallet connection cancelled.',
  no_wallet: 'No Seeker wallet found on this device.',
  unavailable: 'Wallet unavailable. Please try again.',
  failed: 'We could not complete sign-in. Please try again.',
}

/** Map an API failure onto the reason the UI should show. */
function classify(error: unknown): SignInFailure {
  if (!(error instanceof ApiError)) return 'failed'

  switch (error.code) {
    // The nonce aged out before the user finished in their wallet app. The one
    // case where retrying is the right advice.
    case 'nonce_expired':
      return 'failed'
    case 'wallet_rejected':
      return 'rejected'
    default:
      return 'failed'
  }
}

/**
 * Run the full SIWS exchange.
 *
 * `signIn` is passed in rather than called through a hook so this stays
 * ordinary async code: no rules-of-hooks constraint, and the same function is
 * callable from a retry button or a background task.
 */
export async function signInWithWallet(wallet: WalletApi, address: string): Promise<SignInResult> {
  // 1. Challenge. Server-issued, so nothing here is attacker-controllable.
  let payload: SiwsPayload
  try {
    payload = await api.authNonce(address)
  } catch (error) {
    logger.warn('siws.nonce_failed', { address })
    return { ok: false, reason: classify(error), message: FAILURE_MESSAGES.failed }
  }

  // 2. Sign. `signIn` shows the wallet prompt and resolves with the signature
  //    plus the exact bytes that were signed.
  let signature: Uint8Array
  let signedMessage: Uint8Array
  try {
    const output = await wallet.signIn({ ...payload, address })
    signature = output.signature
    signedMessage = output.signedMessage
  } catch {
    // A dismissed prompt throws here. Section 37: that is not an account
    // failure, and it must not be reported as one.
    logger.info('siws.wallet_prompt_dismissed', { address })
    return { ok: false, reason: 'rejected', message: FAILURE_MESSAGES.rejected }
  }

  // 3. Exchange. Four fields, no account object.
  const proof: SiwsVerifyRequest = {
    address,
    nonce: payload.nonce,
    signature: Array.from(signature),
    signedMessage: Array.from(signedMessage),
  }

  try {
    const response = await api.authSiws(proof)
    setSessionToken(response.token)

    return {
      ok: true,
      seekerId: response.user.seekerId,
      genesisStatus: response.user.genesisStatus,
    }
  } catch (error) {
    logger.warn('siws.verify_failed', { address })
    return {
      ok: false,
      reason: classify(error),
      message: FAILURE_MESSAGES.failed,
    }
  }
}

/**
 * Attach a wallet to an account that already signed in with Google (A07).
 *
 * The same signature proof as the SIWS path. That is what makes the linked wallet
 * ours rather than a claim the request body makes about it — which matters most
 * here, because a Google-only session has no wallet of its own yet.
 */
export async function linkWallet(wallet: WalletApi, address: string): Promise<SignInResult> {
  let payload: SiwsPayload
  try {
    payload = await api.authNonce(address)
  } catch {
    return { ok: false, reason: 'failed', message: FAILURE_MESSAGES.failed }
  }

  let signature: Uint8Array
  let signedMessage: Uint8Array
  try {
    const output = await wallet.signIn({ ...payload, address })
    signature = output.signature
    signedMessage = output.signedMessage
  } catch {
    return { ok: false, reason: 'rejected', message: FAILURE_MESSAGES.rejected }
  }

  try {
    const response = await api.authLink({
      address,
      nonce: payload.nonce,
      signature: Array.from(signature),
      signedMessage: Array.from(signedMessage),
    })
    return {
      ok: true,
      seekerId: response.user.seekerId,
      genesisStatus: response.user.genesisStatus,
    }
  } catch (error) {
    if (error instanceof ApiError && error.code === 'wallet_already_linked') {
      return {
        ok: false,
        reason: 'failed',
        // Section 29.3: refuse rather than steal. Moving a wallet between
        // accounts would let whoever signed in second take over the first
        // one's companion.
        message: error.message,
      }
    }
    return { ok: false, reason: 'failed', message: FAILURE_MESSAGES.failed }
  }
}
/**
 * Exchange a Privy access token for a Gochi session.
 *
 * The token is fetched fresh rather than cached: Privy access tokens are
 * short-lived and the SDK refreshes them on demand, so a stored copy expires
 * mid-session and produces a 401 the user cannot act on.
 *
 * No wallet is sent with it. An access token proves who signed in with Google;
 * it carries no linked accounts, so it cannot say which wallet that person
 * controls. The wallet arrives separately, through the signature proof at A07.
 */
export async function signInWithPrivy(
  getAccessToken: () => Promise<string | null>,
): Promise<{ ok: true } | { ok: false; reason: 'cancelled' | 'failed' }> {
  let accessToken: string | null
  try {
    accessToken = await getAccessToken()
  } catch {
    // The user dismissed the Privy modal. Section 37: a cancelled handoff is
    // not an account failure.
    return { ok: false, reason: 'cancelled' }
  }

  if (!accessToken) return { ok: false, reason: 'cancelled' }

  try {
    const response = await api.authPrivy(accessToken)
    setSessionToken(response.token)
    return { ok: true }
  } catch {
    logger.warn('privy.exchange_failed')
    return { ok: false, reason: 'failed' }
  }
}
