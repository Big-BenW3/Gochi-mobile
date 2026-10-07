/**
 * §9.2 / §9.3 — token balances for the Mini-Vault.
 *
 * Read-only, from the user's own token accounts. Deliberately raw: amounts are
 * returned with decimals and no price. The vault shows what the wallet holds; it
 * never implies Gochi can move it, and a zero-balance response is an explicit
 * `available: false` so the UI can offer a retry instead of claiming the wallet
 * is empty when the read simply failed.
 */
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { Connection, PublicKey } from '@solana/web3.js'

export interface TokenBalance {
  mint: string
  amount: string
  decimals: number
  symbol: string | null
}

export interface BalancesResult {
  available: boolean
  tokens: TokenBalance[]
}

/** Token account layout: mint (32) + owner (32) + amount (u64) + ... */
const TOKEN_ACCOUNT_DATA_SIZE = 165

/** Read u64 at the amount offset (little-endian) as a base-10 string. */
function readAmount(data: Buffer): string {
  return data.readBigUInt64LE(64).toString(10)
}

/**
 * Fetch non-zero SPL balances for `wallet`.
 *
 * Uses `getParsedTokenAccountsByOwner`, which returns parsed accounts — no
 * manual layout math, and therefore no wrong-offset bug class.
 */
export async function fetchTokenBalances(
  rpcUrl: string,
  wallet: string,
  limit = 20,
): Promise<BalancesResult> {
  try {
    const connection = new Connection(rpcUrl, 'confirmed')
    const response = await connection.getParsedTokenAccountsByOwner(
      new PublicKey(wallet),
      { programId: TOKEN_PROGRAM_ID },
    )

    const tokens: TokenBalance[] = []
    for (const { account } of response.value) {
      const parsed = account.data.parsed as
        | { info?: { mint?: string; tokenAmount?: { amount?: string; decimals?: number } } }
        | undefined
      const amount = parsed?.info?.tokenAmount?.amount
      const mint = parsed?.info?.mint
      if (!amount || !mint) continue
      if (amount === '0') continue
      tokens.push({
        mint,
        amount,
        decimals: parsed?.info?.tokenAmount?.decimals ?? 0,
        symbol: null,
      })
      if (tokens.length >= limit) break
    }
    return { available: true, tokens }
  } catch (error) {
    // A failed read is not an empty wallet. Report unavailability and let the
    // caller render a retry (spec section 37: indexer/RPC down is its own state).
    return { available: false, tokens: [] }
  }
}

export { readAmount, TOKEN_ACCOUNT_DATA_SIZE }
