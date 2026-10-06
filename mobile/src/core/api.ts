/**
 * Typed HTTP client for the Gochi API.
 *
 * Design constraints, from the spec:
 *
 *   - section 21.2: the client is authoritative for *presentation only*. It reads
 *     companion state, it never computes it. Nothing here mutates local XP or
 *     level, and there is deliberately no client-side progression maths.
 *   - section 40: every endpoint the app uses is declared below, so a missing
 *     route is a type error rather than a 404 found in testing.
 *   - section 53 rule 9: cached data must be shown while syncing, never replaced
 *     by a spinner. That is why `request` throws on failure and leaves caching to
 *     React Query, rather than retrying internally and blocking the UI.
 *
 * Auth is a bearer token issued by the API after SIWS (P1). The token is stored
 * in memory only for now; persisting it to `expo-secure-store` is part of P1,
 * because a wallet signature should never sit in AsyncStorage.
 */

import type {
  GenesisResult,
  SiwsPayload,
  SiwsVerifyRequest,
  SiwsVerifyResponse,
  PrivyVerifyResponse,
  User,
} from '@gochi/contracts'

import { logger, redact } from './logging'

/** Base URL of the API. Public by design — it holds no secret. */
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787'

/**
 * Session token.
 *
 * Module-level and in memory only. A module-scoped variable is deliberate: it is
 * the smallest thing that survives a re-render but not an app restart, which is
 * the correct lifetime until P1 wires secure persistence and a restore endpoint.
 */
let sessionToken: string | null = null

export function setSessionToken(token: string | null) {
  sessionToken = token
}

export function getSessionToken(): string | null {
  return sessionToken
}

/**
 * A failed API call.
 *
 * `status` is separated from `message` so screens can branch on the kind of
 * failure — a 401 means re-authenticate, an offline network error means show
 * cached data — instead of pattern-matching on prose.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /** Session is missing or rejected, so the user must sign in again. */
  get isUnauthorized() {
    return this.status === 401
  }

  /**
   * Request never reached the server.
   *
   * Deliberately not an ApiError: there is no status, and the correct response is
   * to show cached data rather than an error, per spec section 36.
   */
  get isOffline() {
    return false
  }
}

/** Raised when the request could not be sent at all (no network, DNS, timeout). */
export class OfflineError extends Error {
  constructor(message = 'No connection') {
    super(message)
    this.name = 'OfflineError'
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST'
  body?: unknown
  /** Query string values. `undefined` entries are dropped. */
  query?: Record<string, string | number | boolean | undefined>
  signal?: AbortSignal
}

/**
 * Perform one API request.
 *
 * Kept separate from React Query on purpose: the transport knows about auth and
 * error shape, while the cache and refetch policy stay in the hooks. Mixing them
 * is what produces components that each invent their own loading flags.
 */
async function request<T>(path: string, { body, method = 'GET', query, signal }: RequestOptions = {}): Promise<T> {
  const url = new URL(`${API_URL}${path}`)

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
  }

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`

  let response: Response
  try {
    response = await fetch(url.toString(), {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
      method,
      signal,
    })
  } catch (cause) {
    // fetch only rejects for transport failures, so this really does mean the
    // request never left the device.
    logger.warn('[api] request did not reach the server', { path, reason: String(cause) })
    throw new OfflineError()
  }

  if (!response.ok) {
    // The error body is logged through `redact`, so a server error that echoes
    // back a token does not end up in the log.
    const detail = await response.json().catch(() => null)
    logger.warn('[api] request failed', { path, status: response.status, detail: redact(detail) })

    throw new ApiError(response.status, detail?.message ?? `Request failed with ${response.status}`, detail?.code)
  }

  // 204 has no body to parse; anything else is expected to be JSON.
  if (response.status === 204) return undefined as T

  return (await response.json()) as T
}

/**
 * The API surface, grouped as the spec groups it in section 40.
 *
 * Response types are `unknown`-shaped for now and become generated zod types in
 * P2/P3, when `packages/contracts` holds the schemas both sides validate against.
 * Declaring speculative shapes here would be guessing at the server.
 */
export const api = {
  // --- Identity (P1) -------------------------------------------------------
  /**
   * Ask the server for a SIWS challenge.
   *
   * The payload comes wholly from the server: domain, chainId, nonce and expiry
   * are all pinned there. A client-assembled challenge would carry
   * attacker-chosen values into the signature check, which is the entire thing
   * being prevented.
   */
  authNonce: (address: string) => request<SiwsPayload>('/v1/auth/nonce', { body: { address }, method: 'POST' }),

  /**
   * Exchange a signed challenge for a session token.
   *
   * Exactly four fields, and no `account` object. The server derives the
   * verifying key from `address` itself; sending a public key alongside would
   * let a throwaway keypair sign a message naming someone else's wallet.
   */
  authSiws: (proof: SiwsVerifyRequest) => request<SiwsVerifyResponse>('/v1/auth/siws', { body: proof, method: 'POST' }),

  /** Exchange a Privy access token for a Gochi session. Carries no wallet. */
  authPrivy: (accessToken: string) =>
    request<PrivyVerifyResponse>('/v1/auth/privy', {
      body: { accessToken },
      method: 'POST',
    }),

  /** Attach a wallet to an account that signed in with Google (A07). */
  authLink: (proof: SiwsVerifyRequest) => request<{ user: User }>('/v1/auth/link', { body: proof, method: 'POST' }),

  /** Re-check a linked wallet for a Seeker Genesis Token. */
  genesis: () => request<GenesisResult>('/v1/genesis'),

  /**
   * Create the companion and its Core Asset (spec 32).
   *
   * Idempotent per wallet: a repeat call returns the existing companion rather than
   * minting a second asset, which is what makes a double-tapped button harmless.
   */
  createCompanion: (body: { name: string }) =>
    request<{
      companion: { id: string; assetAddress: string | null }
      alreadyCreated: boolean
      signature?: string
      funding: { paidBy: string; copy: string; requiresUserApproval: false }
      transfer?: { soulbound: boolean; holderCanTransfer: boolean; reason: string }
    }>('/v1/companion', { body, method: 'POST' }),

  /** The Core asset detail for screen G03. */
  companionAsset: () =>
    request<{
      assetId: string | null
      metadataUri: string | null
      owner: string | null
      name: string
      level: number
      evolutionStage: number
    }>('/v1/companion/asset'),

  me: () => request<User>('/v1/me'),
  companion: () => request<unknown>('/v1/companion'),

  /** Ask the server to reconcile activity. Progression is applied server-side. */
  /**
   * Ask the server to reconcile activity (spec 40).
   *
   * Typed rather than `unknown` because A14 renders `eventsProcessed` directly: the
   * difference between "nothing to sync" and "sync failed" is a user-visible
   * distinction, and scenario 2 requires the first to read as genuinely empty.
   */
  syncCompanion: () =>
    request<{
      eventsProcessed: number
      eventsSkipped: number
      xpAwarded: number
      companion: import('@gochi/contracts').Companion
      gameEvents: { type: string; detail: Record<string, unknown> }[]
      notifications: {
        id: string
        type: string
        title: string
        body: string
        readAt: string | null
        createdAt: string
      }[]
    }>('/v1/companion/sync', { method: 'POST' }),

  /**
   * Record a direct companion interaction (spec section 40).
   *
   * Intentionally does not grant progression. Spec section 19 is explicit that
   * interaction must not produce unlimited XP — it is emotional, not a faucet.
   */
  recordInteraction: (kind: string) =>
    request<unknown>('/v1/companion/interaction', { body: { kind }, method: 'POST' }),

  activity: (cursor?: string) => request<unknown>('/v1/activity', { query: { cursor } }),
  activityEvent: (id: string) => request<unknown>(`/v1/activity/${id}`),

  progression: () => request<unknown>('/v1/progression'),
  achievements: () => request<unknown>('/v1/achievements'),

  notifications: () => request<unknown>('/v1/notifications'),
  markNotificationsRead: (ids: string[]) =>
    request<unknown>('/v1/notifications/read', { body: { ids }, method: 'POST' }),

  vault: () => request<unknown>('/v1/vault'),
} as const

export { API_URL }
