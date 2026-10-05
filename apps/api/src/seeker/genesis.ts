/**
 * Seeker Genesis Token verification.
 *
 * Server-side only, and that is not a formality. A client can be patched, so a
 * client-side `hasSGT` boolean is worth nothing — spec section 38 rule 6 lists
 * Genesis verification among the things a client must never be trusted about.
 * The client's job is to hand over a signature; this decides the answer.
 *
 * Three things have to be right, and each is a bypass on its own:
 *
 *  1. **The caller proved control of the wallet.** Done in `verify-siws.ts`.
 *     Checking only this proves a wallet is controlled but says nothing about a
 *     device.
 *
 *  2. **Both mint properties match.** A Token-2022 mint is an SGT only if its
 *     metadata pointer *and* its token-group membership point at the SGT
 *     address. Either alone is a bypass — any ordinary NFT can carry a metadata
 *     pointer, and group membership is separately forgeable.
 *
 *  3. **The wallet currently holds a non-zero balance.** Transferring an SGT
 *     out does not close the associated token account. The account stays open
 *     forever with a zero balance and `getTokenAccountsByOwner` keeps returning
 *     it, so an unfiltered list makes every wallet that has *ever* held an SGT
 *     verify as a current holder, permanently. Since the mint checks inspect the
 *     mint and never the balance, the filter is the only thing preventing this.
 *
 * The opposite error is also worth naming: a legitimately held SGT sits in a
 * *frozen* account, because Solana Mobile holds the freeze authority and
 * re-freezes on arrival to stop holders moving it themselves. Treating frozen as
 * suspicious rejects every real Seeker owner. The balance is the discriminator.
 */

import type { GenesisResult } from "@gochi/contracts";
import {
  TOKEN_2022_PROGRAM_ID,
  getMetadataPointerState,
  getTokenGroupMemberState,
  unpackMint,
} from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";

import { logger } from "../core/logging.js";

/**
 * Both properties carry this same address.
 *
 * That they are identical is not a mistake in the source data — Solana Mobile
 * points the metadata pointer and the group membership at the SGT collection
 * address, so checking one does not imply the other.
 */
export const SGT_ADDRESS = "GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te";

/**
 * Most providers reject a multi-account request larger than this. Batching at
 * 100 is the commonly accepted ceiling.
 */
const BATCH_SIZE = 100;

/** Guards against a provider that keeps handing back the same page. */
const MAX_PAGES = 50;

/** Accounts requested per page, and the size at which a V1 result looks capped. */
const PAGE_LIMIT = 1000;

export class GenesisCheckUnavailable extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GenesisCheckUnavailable";
  }
}

/**
 * Inspect a batch of mints and return the first that is an SGT.
 *
 * `unpackMint` throwing is expected and not an error: most mints in a wallet
 * will not be readable as Token-2022 accounts, and one that is not is simply not
 * an SGT.
 */
async function findSgtMint(
  connection: Connection,
  mintPubkeys: PublicKey[],
): Promise<string | null> {
  for (let i = 0; i < mintPubkeys.length; i += BATCH_SIZE) {
    const batch = mintPubkeys.slice(i, i + BATCH_SIZE);
    const infos = await connection.getMultipleAccountsInfo(batch);

    for (let j = 0; j < infos.length; j++) {
      const info = infos[j];
      if (!info) continue;

      let mint;
      try {
        mint = unpackMint(batch[j], info, TOKEN_2022_PROGRAM_ID);
      } catch {
        continue;
      }

      // Both properties. See the module comment for why one is not enough.
      const metadataPointer = getMetadataPointerState(mint);
      const groupMember = getTokenGroupMemberState(mint);

      if (
        metadataPointer?.metadataAddress?.toBase58() === SGT_ADDRESS &&
        groupMember?.group?.toBase58() === SGT_ADDRESS
      ) {
        // The mint identifies the *device*, which is the only value that can
        // support one-claim-per-device. Returning a bare boolean would throw
        // that away.
        return batch[j].toBase58();
      }
    }
  }

  return null;
}

/**
 * Reduce raw token accounts to the mints worth inspecting.
 *
 * The zero-balance filter is a security control, not defensive noise — see the
 * module comment. `amount` is a string in the JSON-parsed shape, so it is
 * compared as a string rather than coerced: `Number('0') === 0` would also
 * match `'00'`, and the safe reading is to keep only what is provably non-zero.
 */
export function collectCandidateMints(
  accounts: readonly unknown[],
): PublicKey[] {
  const mints: PublicKey[] = [];

  for (const entry of accounts) {
    const info = (
      entry as {
        account?: {
          data?: {
            parsed?: {
              info?: { tokenAmount?: { amount?: string }; mint?: string };
            };
          };
        };
      }
    )?.account?.data?.parsed?.info;

    if (!info?.mint) continue;

    // Zero-balance accounts are residue from a past transfer or a burn.
    if (!info.tokenAmount?.amount || info.tokenAmount.amount === "0") continue;

    try {
      mints.push(new PublicKey(info.mint));
    } catch {
      // A mint address we cannot parse is not a mint we can verify.
      continue;
    }
  }

  return mints;
}

/**
 * Fetch every Token-2022 token account a wallet owns.
 *
 * Two RPC methods, because providers disagree on what they support.
 *
 * `getTokenAccountsByOwnerV2` pages and is the better method, but it is not part
 * of the standard RPC surface — the public mainnet endpoint answers "Method not
 * found". Paginating providers such as Helius do implement it.
 *
 * The V1 method works everywhere but returns the whole set in one response, so
 * a wallet with an unusually large number of Token-2022 accounts can exceed
 * provider size limits. That failure is silent in the dangerous direction: a
 * truncated list reads as "no SGT". So V2 is tried first, V1 is the fallback,
 * and the fallback warns when the response looks like it may have been capped.
 */
async function fetchTokenAccounts(
  walletAddress: string,
  rpcUrl: string,
): Promise<unknown[]> {
  try {
    return await fetchPaginated(rpcUrl, walletAddress);
  } catch (error) {
    if (!isMethodNotFound(error)) throw error;
    logger.info("genesis.pagination_unsupported", { fallingBackTo: "v1" });
    return fetchUnpaginated(rpcUrl, walletAddress);
  }
}

/** True when the provider rejected the method rather than the request. */
function isMethodNotFound(error: unknown): boolean {
  return (
    error instanceof GenesisCheckUnavailable &&
    error.message.startsWith("RPC error: Method not found")
  );
}

async function fetchPaginated(
  rpcUrl: string,
  walletAddress: string,
): Promise<unknown[]> {
  const connection = new Connection(rpcUrl, "confirmed");
  const accounts: unknown[] = [];
  const seenPageKeys = new Set<string>();
  let pageKey: string | null = null;
  let page = 0;

  do {
    if (++page > MAX_PAGES) {
      // Fail loudly. Spinning forever on a provider that repeats itself is its
      // own bug, and a page cap alone would still spin MAX_PAGES times.
      throw new GenesisCheckUnavailable(
        `Pagination exceeded ${MAX_PAGES} pages.`,
      );
    }

    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `sgt-${page}`,
        method: "getTokenAccountsByOwnerV2",
        params: [
          walletAddress,
          { programId: TOKEN_2022_PROGRAM_ID.toBase58() },
          {
            encoding: "jsonParsed",
            limit: PAGE_LIMIT,
            // With this flag both `accounts` and `paginationKey` sit under
            // result.value. Without it, result.value *is* the array and
            // paginationKey is a sibling — reading the wrong shape yields
            // undefined, no accounts, and "no SGT" for every wallet.
            withContext: true,
            ...(pageKey ? { paginationKey: pageKey } : {}),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new GenesisCheckUnavailable(`RPC HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      error?: { message?: string };
      result?: {
        value?: { accounts?: unknown[]; paginationKey?: string | null };
      };
    };

    if (data.error) {
      throw new GenesisCheckUnavailable(`RPC error: ${data.error.message}`);
    }

    const value = data.result?.value;
    // Asserted rather than defaulted. Falling back to [] here would turn a shape
    // change into a confident "you do not own a Seeker".
    if (!Array.isArray(value?.accounts)) {
      throw new GenesisCheckUnavailable(
        "Unexpected getTokenAccountsByOwnerV2 response shape.",
      );
    }

    accounts.push(...value.accounts);
    pageKey = value.paginationKey ?? null;

    if (pageKey !== null) {
      if (seenPageKeys.has(pageKey)) {
        throw new GenesisCheckUnavailable(
          "getTokenAccountsByOwnerV2 repeated a paginationKey.",
        );
      }
      seenPageKeys.add(pageKey);
    }
  } while (pageKey);

  return accounts;
}

/**
 * The V1 path: one request, no pagination.
 *
 * The size warning is the important part. If the provider capped the response,
 * the missing accounts are exactly the ones that might have held an SGT, and the
 * caller would otherwise report a confident negative.
 */
async function fetchUnpaginated(
  rpcUrl: string,
  walletAddress: string,
): Promise<unknown[]> {
  const connection = new Connection(rpcUrl, "confirmed");

  let value: unknown[];
  try {
    const response = await connection.getParsedTokenAccountsByOwner(
      new PublicKey(walletAddress),
      { programId: TOKEN_2022_PROGRAM_ID },
    );
    value = response.value;
  } catch (error) {
    throw new GenesisCheckUnavailable(
      `Could not list token accounts: ${error instanceof Error ? error.message : "unknown"}`,
      { cause: error },
    );
  }

  if (value.length >= PAGE_LIMIT) {
    logger.warn("genesis.response_may_be_truncated", {
      count: value.length,
      note: "RPC returned a full page without pagination support; missing accounts would read as no SGT",
    });
  }

  return value;
}

/**
 * Check whether a wallet currently holds a Seeker Genesis Token.
 *
 * Throws `GenesisCheckUnavailable` rather than returning a negative result when
 * anything goes wrong. Spec section 37 requires an indexer outage to read as
 * "We could not verify your Seeker identity right now", which is a different
 * outcome from "Genesis NFT not found" and cannot be expressed by
 * `{ hasSgt: false }`.
 */
export async function checkWalletForSgt(
  walletAddress: string,
  rpcUrl: string,
): Promise<{ hasSgt: boolean; mintAddress: string | null }> {
  const connection = new Connection(rpcUrl, "confirmed");
  const accounts = await fetchTokenAccounts(walletAddress, rpcUrl);

  const mintAddress = await findSgtMint(
    connection,
    collectCandidateMints(accounts),
  );

  return { hasSgt: mintAddress !== null, mintAddress };
}

/**
 * The three-state result the API reports.
 *
 * The distinction between `not_detected` and `unavailable` is the whole point:
 * spec section 37 forbids marking a user verified on an indexer outage, and
 * requires the outage to offer a retry rather than a claim that they own no
 * device.
 */
export async function verifyGenesis(
  walletAddress: string,
  rpcUrl: string,
  now: Date = new Date(),
): Promise<GenesisResult> {
  try {
    const { hasSgt, mintAddress } = await checkWalletForSgt(
      walletAddress,
      rpcUrl,
    );
    return {
      status: hasSgt ? "verified" : "not_detected",
      mintAddress,
      checkedAt: now.toISOString(),
    };
  } catch (error) {
    // Deliberately not swallowed into a negative result. See the module comment.
    throw error instanceof GenesisCheckUnavailable
      ? error
      : new GenesisCheckUnavailable("Genesis verification failed.", {
          cause: error,
        });
  }
}
