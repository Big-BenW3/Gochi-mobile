/**
 * P7 ingestion unit tests — the pipeline contract from §24.
 *
 * These are deliberately pure (no Neon, no RPC): the failure modes that matter
 * — duplicates, out-of-order delivery, failed txs, stale/future timestamps,
 * and genuinely unknown transactions — must be provable without a network.
 */
import { describe, expect, it } from 'vitest'

import { deriveEventType, normalizeAndValidate, orderEvents } from '../src/ingestion/pipeline.js'
import { knownProgramIds, type RawWalletEvent } from '../src/ingestion/types.js'
import { movedMintCount } from '../src/ingestion/rpc-history.js'
import type { ParsedTransactionWithMeta } from '@solana/web3.js'

function raw(overrides: Partial<RawWalletEvent> = {}): RawWalletEvent {
  return {
    signature: 'sig' + Math.random().toString(36).slice(2, 8),
    slot: 100,
    blockTime: Math.floor(Date.now() / 1000) - 60,
    failed: false,
    programIds: [],
    ingestedAt: Math.floor(Date.now() / 1000) - 60,
    ...overrides,
  }
}

describe('deriveEventType', () => {
  it('classifies a Stake-program transaction as stake, whatever else it touched', () => {
    expect(
      deriveEventType(raw({ stakeTouched: true, tokenMintsMoved: 5, programIds: [knownProgramIds.stake] })),
    ).toBe('STAKE_DETECTED')
  })

  it('classifies a two-sided token move as a swap (balance-delta truth)', () => {
    expect(deriveEventType(raw({ tokenMintsMoved: 2 }))).toBe('SWAP')
  })

  it('does not call a one-sided token move (a plain transfer) a swap', () => {
    expect(deriveEventType(raw({ tokenMintsMoved: 1 }))).toBe('SECURITY_EVENT')
  })

  it('never guesses a program type for an unknown transaction', () => {
    expect(deriveEventType(raw({ tokenMintsMoved: 0, programIds: ['SomeUnknownProgram111'] }))).toBe(
      'SECURITY_EVENT',
    )
  })
})

describe('normalizeAndValidate (§24.3)', () => {
  it('rejects failed transactions', () => {
    expect(normalizeAndValidate(raw({ failed: true }), 'devnet', 'rpc-history').ok).toBe(false)
  })

  it('rejects future timestamps beyond the tolerance window', () => {
    const future = raw({ blockTime: Math.floor(Date.now() / 1000) + 3600 })
    const result = normalizeAndValidate(future, 'devnet', 'rpc-history')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('timestamp_in_future')
  })

  it('rejects history older than 30 days', () => {
    const stale = raw({ blockTime: Math.floor(Date.now() / 1000) - 40 * 24 * 60 * 60 })
    const result = normalizeAndValidate(stale, 'devnet', 'rpc-history')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('too_old')
  })

  it('builds the §24.4 dedupe key and tags the source', () => {
    const r = raw({ signature: 'abc', tokenMintsMoved: 2 })
    const out = normalizeAndValidate(r, 'mainnet', 'rpc-history')
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.out.idempotencyKey).toBe('mainnet:abc:SWAP')
      expect(out.out.event.source).toBe('RPC_HISTORY')
    }
  })
})

describe('orderEvents (§24.5)', () => {
  it('orders by slot, not arrival order', () => {
    const a = { signature: 'a', timestamp: 1000, slot: 300 }
    const b = { signature: 'b', timestamp: 900, slot: 200 }
    const c = { signature: 'c', timestamp: 800, slot: 100 }
    expect(orderEvents([a, b, c]).map((x) => x.signature)).toEqual(['c', 'b', 'a'])
  })

  it('falls back to block time when slots are unknown', () => {
    const a = { signature: 'a', timestamp: 1000, slot: null }
    const b = { signature: 'b', timestamp: 500, slot: null }
    expect(orderEvents([a, b]).map((x) => x.signature)).toEqual(['b', 'a'])
  })

  it('is stable for true ties', () => {
    const a = { signature: 'a', timestamp: 500, slot: 1 }
    const b = { signature: 'b', timestamp: 500, slot: 1 }
    expect(orderEvents([a, b]).map((x) => x.signature)).toEqual(['a', 'b'])
  })
})

describe('movedMintCount', () => {
  const W = 'Wallet111'
  const balance = (owner: string, mint: string, amount: number) => ({
    owner,
    mint,
    uiTokenAmount: { uiAmountString: String(amount), decimals: 9 },
  })

  it('counts only mints whose owner balance actually changed', () => {
    const tx = {
      meta: {
        preTokenBalances: [balance(W, 'USDC', 100), balance(W, 'SOL-mint', 5), balance('other', 'USDC', 7)],
        postTokenBalances: [balance(W, 'USDC', 80), balance(W, 'SOL-mint', 5), balance('other', 'USDC', 7)],
      },
    } as unknown as ParsedTransactionWithMeta
    expect(movedMintCount(tx, W)).toBe(1) // only USDC moved for W
  })

  it('a swap moves two mints', () => {
    const tx = {
      meta: {
        preTokenBalances: [balance(W, 'USDC', 100), balance(W, 'GOCHI', 0)],
        postTokenBalances: [balance(W, 'USDC', 50), balance(W, 'GOCHI', 10)],
      },
    } as unknown as ParsedTransactionWithMeta
    expect(movedMintCount(tx, W)).toBe(2)
  })
})
