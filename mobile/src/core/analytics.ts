/**
 * Analytics.
 *
 * An interface plus a no-op implementation, so screens can record events from P0
 * without a vendor being chosen and without shipping a tracking SDK that cannot
 * be removed later.
 *
 * The event list in spec section 42 is the backlog. Note what is deliberately
 * absent from it, because the spec is explicit: we do **not** track how many
 * transactions a user makes. Optimising for transaction volume is how a
 * companion game turns into pressure to trade, and spec section 42 lists it under
 * "do not optimize for".
 *
 * Privacy, from spec sections 38 and 39:
 *   - never send a wallet address, signature, or any private key material
 *   - a wallet public key is fine to store, but it is not an analytics property —
 *     analytics is about how the app is used, not what the user owns
 *   - no free-text user input ever goes into an event
 */

import { logger } from './logging'

/**
 * Product events, from spec section 42.
 *
 * The keys are the contract with whatever backend eventually receives them, so
 * they are named explicitly rather than passed as free strings — a typo in a
 * free string would be invisible until the data looked wrong months later.
 */
export type AnalyticsEvent =
  | 'onboarding_completed'
  | 'wallet_connect_success'
  | 'wallet_connect_failed'
  | 'genesis_verified'
  | 'genesis_not_detected'
  | 'companion_created'
  | 'companion_first_interaction'
  | 'first_activity_processed'
  | 'session_started'
  | 'level_up'
  | 'evolution_reached'
  | 'notification_opened'
  | 'model_load_failed'
  | 'sync_failed'
  | 'demo_mode_started'

export type AnalyticsProps = Record<string, string | number | boolean>

/**
 * The sink. Replace `createAnalyticsLogger` with a real implementation in P14
 * without any call site changing.
 */
export interface Analytics {
  track: (event: AnalyticsEvent, props?: AnalyticsProps) => void
}

/**
 * Keys that must never be sent, regardless of what a call site passes.
 *
 * Call sites are trusted to a point, not completely — this is the last gate
 * before data would leave the device, so it is a denylist rather than relying on
 * reviewers to catch a slip.
 */
const FORBIDDEN_PROPS = ['wallet', 'address', 'pubkey', 'publickey', 'signature', 'privkey', 'secret', 'token']

function stripForbidden(props: AnalyticsProps): AnalyticsProps {
  const out: AnalyticsProps = {}
  for (const [key, value] of Object.entries(props)) {
    if (FORBIDDEN_PROPS.some((needle) => key.toLowerCase().replace(/_/g, '').includes(needle))) {
      logger.warn('[analytics] dropped a forbidden property', { key })
      continue
    }
    out[key] = value
  }
  return out
}

/** Development sink: logs instead of shipping data anywhere. */
export function createAnalyticsLogger(): Analytics {
  return {
    track(event, props) {
      logger.debug('[analytics]', { event, props: props ? stripForbidden(props) : undefined })
    },
  }
}

/**
 * The app-wide instance.
 *
 * Screens import this rather than constructing their own, so there is exactly one
 * place to swap the implementation.
 */
export const analytics: Analytics = createAnalyticsLogger()

/** Convenience wrapper so call sites read as `trackEvent('level_up', { level: 12 })`. */
export function trackEvent(event: AnalyticsEvent, props?: AnalyticsProps) {
  analytics.track(event, props)
}
