/**
 * Onchain ingestion — §24.
 *
 * One pipeline, two adapters. Helius parsed streams are open beta and need a key
 * we do not have yet, so the RPC history adapter is the default path §24 / PLAN
 * P7 require. Both adapters emit the same RawWalletEvent shape so normalization,
 * validation and dedupe are adapter-agnostic.
 */

/** A single wallet activity worth considering, before normalization. */
export interface RawWalletEvent {
  /** Onchain signature — part of the dedupe key (§24.4). */
  signature: string
  slot: number | null
  /** Block time in seconds, null if unknown. */
  blockTime: number | null
  /** True when the tx failed onchain (§24.3). */
  failed: boolean
  /** Program ids invoked, best-effort from the message. */
  programIds: string[]
  /** Ingestion time, seconds — part of ordering (§24.5). */
  ingestedAt: number
  /**
   * How many distinct SPL mints saw the user's balance change. Two or more is
   * the ground-truth signal for a swap: the user gave up one asset and received
   * another. One moved mint (e.g. a transfer) is not a swap.
   */
  tokenMintsMoved?: number
  /** True when a Stake program instruction was present. */
  stakeTouched?: boolean
}

export interface IngestionAdapter {
  name: string
  /**
   * Pull recent activity for `wallet` newer than `cursor` (a slot, or null for
   * the first run). Adapters may return events in any order; the pipeline
   * re-orders deterministically (§24.5).
   */
  fetchRecent(
    wallet: string,
    cursor: number | null,
    limit: number,
  ): Promise<RawWalletEvent[]>
}

/**
 * Canonical program ids, each verified against an official source. Kept as a
 * labeled registry so the activity feed can say "raydium_amm_v4" instead of a
 * raw base58 string. NOT the classification signal — that is the balance
 * delta, because Jupiter aggregates across these and unrecognized txs must not
 * be guessed at.
 */
export const knownProgramIds = {
  /** Solana builtin Stake program (solana-foundation/stake-program README). */
  stake: 'Stake11111111111111111111111111111111111111',
  /** Raydium AMM v4 (raydium-io/raydium-amm). */
  raydiumAmmV4: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  /** Orca Whirlpool concentrated liquidity (orca-so/whirlpools). */
  orcaWhirlpool: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
} as const

export function dedupeKey(network: string, signature: string, eventType: string) {
  return `${network}:${signature}:${eventType}`
}
