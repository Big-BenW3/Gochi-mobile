/**
 * Normalization → validation → dedupe → ordered apply (§24.2–24.5).
 *
 * Adapter-agnostic: adapters only produce RawWalletEvent. The pipeline is the one
 * place that decides event type, dedupe key and ordering.
 */
import { dedupeKey, type IngestionAdapter, type RawWalletEvent } from './types.js'
import type { NormalizedEvent } from '../engine/engine.js'
import type { EventType } from '../engine/config.js'

/** §24.3 accepted window — reject anything older than 30 days. */
const ACCEPTED_WINDOW_SECONDS = 60 * 60 * 24 * 30

export interface NormalizedWithKey {
  event: NormalizedEvent
  idempotencyKey: string
}

/**
 * Ground-truth event typing. A swap means the user's balance moved on two or
 * more mints; stake means a Stake-program instruction; anything else is
 * recorded as a security-signaled unknown rather than guessed into SWAP.
 */
export function deriveEventType(raw: RawWalletEvent): EventType {
  if (raw.stakeTouched) return 'STAKE_DETECTED'
  if ((raw.tokenMintsMoved ?? 0) >= 2) return 'SWAP'
  return 'SECURITY_EVENT'
}

/** §24.2 normalize + §24.3 validate. */
export function normalizeAndValidate(
  raw: RawWalletEvent,
  network: string,
  adapterName: string,
): { ok: true; out: NormalizedWithKey } | { ok: false; reason: string } {
  if (raw.failed) return { ok: false, reason: 'tx_failed' }
  if (!raw.signature) return { ok: false, reason: 'missing_signature' }

  const occurred = raw.blockTime ?? raw.ingestedAt
  const now = Math.floor(Date.now() / 1000)
  if (occurred > now + 300) return { ok: false, reason: 'timestamp_in_future' }
  if (now - occurred > ACCEPTED_WINDOW_SECONDS) return { ok: false, reason: 'too_old' }

  const type = deriveEventType(raw)
  const idempotencyKey = dedupeKey(network, raw.signature, type)
  const event: NormalizedEvent = {
    type,
    idempotencyKey,
    timestamp: occurred,
    source: adapterName === 'helius' ? 'HELIUS_WEBHOOK' : 'RPC_HISTORY',
    signature: raw.signature,
    shieldSignal: type === 'SECURITY_EVENT' ? 'unknown' : undefined,
  }
  return { ok: true, out: { event, idempotencyKey } }
}

/** §24.5 deterministic order: slot when known, then chain time (stable). */
export function orderEvents<T extends { timestamp: number; slot?: number | null }>(
  items: T[],
): T[] {
  // Array.prototype.sort is stable, so ties keep their input order — a
  // deterministic tiebreak without inventing a synthetic key.
  return [...items].sort((a, b) => {
    if (a.slot != null && b.slot != null && a.slot !== b.slot) return a.slot - b.slot
    return a.timestamp - b.timestamp
  })
}

export type { IngestionAdapter, RawWalletEvent }
