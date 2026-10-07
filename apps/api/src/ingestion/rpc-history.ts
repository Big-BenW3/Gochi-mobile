/**
 * RPC history adapter — the no-Helius-key path §24 / PLAN P7 require.
 *
 * Uses @solana/web3.js v1 Connection: getSignaturesForAddress gives the recent
 * signature list, getParsedTransaction gives program ids and pre/post token
 * balances, from which we derive tokenMintsMoved / stakeTouched — the actual
 * classification signal.
 */
import {
  Connection,
  PublicKey,
  type ParsedTransactionWithMeta,
} from '@solana/web3.js'
import { knownProgramIds, type IngestionAdapter, type RawWalletEvent } from './types.js'

interface HistoryFetcher {
  getSignaturesForAddress: Connection['getSignaturesForAddress']
  getParsedTransaction: Connection['getParsedTransaction']
}

/** Distinct mint count whose owner-balance changed between pre and post. */
export function movedMintCount(
  tx: ParsedTransactionWithMeta,
  wallet: string,
): number {
  const balances = (bals: NonNullable<ParsedTransactionWithMeta['meta']>['preTokenBalances']) =>
    new Map(
      (bals ?? [])
        .filter((b) => b.owner === wallet)
        .map((b) => [b.mint, Number(b.uiTokenAmount.uiAmountString ?? 0)] as const),
    )
  const pre = balances(tx.meta?.preTokenBalances)
  const post = balances(tx.meta?.postTokenBalances)
  let moved = 0
  for (const mint of new Set([...pre.keys(), ...post.keys()])) {
    if ((pre.get(mint) ?? 0) !== (post.get(mint) ?? 0)) moved += 1
  }
  return moved
}

export class RpcHistoryAdapter implements IngestionAdapter {
  name = 'rpc-history'

  constructor(private readonly fetcher: HistoryFetcher) {}

  async fetchRecent(
    wallet: string,
    cursor: number | null,
    limit: number,
  ): Promise<RawWalletEvent[]> {
    const signatures = await this.fetcher.getSignaturesForAddress(new PublicKey(wallet), {
      limit,
    })

    const out: RawWalletEvent[] = []
    for (const sig of signatures) {
      // Cursor is "last processed slot"; skip anything at or before it so a
      // re-sync never re-emits settled history.
      if (cursor != null && sig.slot != null && sig.slot <= cursor) continue

      // `maxSupportedTransactionVersion: 1` matters: versioned transactions are
      // now the majority on mainnet, and asking for 0 makes the RPC *reject*
      // them with -32015. That error is thrown, not returned, so an older
      // version of this loop aborted the whole batch on the first version-1
      // transaction and a wallet's recent activity — exactly what the demo
      // depends on — silently vanished.
      let tx: Awaited<ReturnType<HistoryFetcher['getParsedTransaction']>>
      try {
        tx = await this.fetcher.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 1,
        })
      } catch (error) {
        // One unreadable transaction must not cost the rest of the batch.
        continue
      }
      if (!tx) continue
      const instructions = tx.transaction.message.instructions
      const programIds = instructions
        .map((ix) =>
          'programId' in ix && ix.programId ? ix.programId.toBase58() : undefined,
        )
        .filter((p): p is string => Boolean(p))

      out.push({
        signature: sig.signature,
        slot: sig.slot ?? null,
        blockTime: sig.blockTime ?? tx.blockTime ?? null,
        failed: tx.meta?.err != null,
        programIds,
        ingestedAt: Math.floor(Date.now() / 1000),
        tokenMintsMoved: tx.meta ? movedMintCount(tx, wallet) : undefined,
        stakeTouched: programIds.includes(knownProgramIds.stake),
      })
    }
    return out
  }
}

/** Default factory used by the sync route. */
export function defaultRpcHistoryAdapter(rpcUrl: string): RpcHistoryAdapter {
  return new RpcHistoryAdapter(new Connection(rpcUrl, 'confirmed'))
}
