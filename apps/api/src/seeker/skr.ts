/**
 * `.skr` domain resolution.
 *
 * `.skr` names are AllDomains (ANS) accounts on **mainnet**, so this always
 * resolves against `solanaMainnetRpcUrl` even while the rest of the app develops
 * on devnet. Pointing it at devnet would return null for every name, which looks
 * like "this user has no domain" rather than "you asked the wrong cluster".
 *
 * Not-found is `null` and an RPC failure throws. That distinction is the whole
 * reason this is implemented directly instead of through `@onsol/tldparser`:
 * that SDK throws an indistinguishable `TypeError` for both a malformed input
 * and an unregistered name, and its ESM build is broken. Keeping the two apart
 * here is what lets the API answer 404 versus 503 — collapsing them would make
 * an outage look like every user having no name.
 *
 * Two properties worth remembering when this is used in a UI:
 *
 *  - A reverse-resolved name is not a claim about who an address is. `.skr`
 *    names are transferable and a transfer needs nothing from the recipient, so
 *    anyone can push a name onto any wallet. Render it beside the truncated
 *    address, never instead of it.
 *  - Expiry is honoured in both directions with no grace period. Seeker-issued
 *    names carry `expiresAt: 0`, which means non-expiring; `@onsol/tldparser`
 *    keeps a name resolving for ~50 days past expiry, and matching that would
 *    label a user with a name they have lost.
 */

import {
  address,
  getAddressDecoder,
  getAddressEncoder,
  getBase64Encoder,
  getProgramDerivedAddress,
  getUtf8Decoder,
  getUtf8Encoder,
  type Address,
  type Base58EncodedBytes,
  type createSolanaRpc,
} from "@solana/kit";
// Extensioned subpath: valid on @noble/hashes 1.x and 2.x. The bare `sha2`
// specifier breaks under strict exports resolution on 2.x.
import { sha256 } from "@noble/hashes/sha2.js";

type Rpc = ReturnType<typeof createSolanaRpc>;

/** AllDomains name-service program. */
const ANS_PROGRAM = address("ALTNSZ46uaAUU7XUV6awvdorLGqAsPwa9shm7h4uP2FK");
const TLD_HOUSE_PROGRAM = address(
  "TLDHkysf5pCnKsVA4gXpNvmy7psXLPEu4LAdDJthT9S",
);
const NAME_HOUSE_PROGRAM = address(
  "NH3uX6FtVE2fNREAioP7hm5RaozotZxeL6khU1EHx51",
);

/**
 * The ANS root, a constant of the protocol.
 *
 * Used as a self-check: deriving it and comparing against this value proves the
 * hashing and the seed order are right. Worth the check because every wrong
 * derivation fails the same silent way — a PDA for an account that does not
 * exist, indistinguishable from an unregistered name.
 */
export const ROOT_ANS = address("3mX9b4AZaQehNoQGfckVcmgmA6bkBoFcbLj9RMmMyNcU");

const HASH_PREFIX = "ALT Name Service";
export const SKR_TLD = ".skr";

/** Offsets into the 200-byte ANS name-account header. */
const HEADER_SIZE = 200;
const OWNER_OFFSET = 40;
const EXPIRES_AT_OFFSET = 104;

/** getMultipleAccounts accepts at most 100 addresses per call. */
const REVERSE_BATCH_SIZE = 100;

const addressDecoder = getAddressDecoder();
const utf8Decoder = getUtf8Decoder();
const base64Encoder = getBase64Encoder();

const utf8 = (value: string) => new Uint8Array(getUtf8Encoder().encode(value));
const addressBytes = (value: Address) =>
  new Uint8Array(getAddressEncoder().encode(value));
const ZERO_32 = new Uint8Array(32);

const hashName = (name: string) => sha256(utf8(HASH_PREFIX + name));

async function pda(
  programAddress: Address,
  seeds: Uint8Array[],
): Promise<Address> {
  const [derived] = await getProgramDerivedAddress({ programAddress, seeds });
  return derived;
}

const deriveNameAccount = (name: string, parent?: Address) =>
  pda(ANS_PROGRAM, [
    hashName(name),
    ZERO_32,
    parent ? addressBytes(parent) : ZERO_32,
  ]);

const deriveTldHouse = () =>
  pda(TLD_HOUSE_PROGRAM, [utf8("tld_house"), utf8(SKR_TLD)]);

const deriveReverseAccount = (nameAccount: Address, tldHouse: Address) =>
  pda(ANS_PROGRAM, [hashName(nameAccount), addressBytes(tldHouse), ZERO_32]);

async function deriveNftRecord(nameAccount: Address, tldHouse: Address) {
  const nameHouse = await pda(NAME_HOUSE_PROGRAM, [
    utf8("name_house"),
    addressBytes(tldHouse),
  ]);
  return pda(NAME_HOUSE_PROGRAM, [
    utf8("nft_record"),
    addressBytes(nameHouse),
    addressBytes(nameAccount),
  ]);
}

async function fetchAccountData(
  rpc: Rpc,
  account: Address,
): Promise<Uint8Array | null> {
  const { value } = await rpc
    .getAccountInfo(account, { encoding: "base64" })
    .send();
  return value ? new Uint8Array(base64Encoder.encode(value.data[0])) : null;
}

/** True when `expiresAt` is unset (non-expiring) or still in the future. */
function isLive(expiresAt: number, now: number): boolean {
  return expiresAt === 0 || expiresAt * 1000 >= now;
}

/**
 * Normalise user input to a bare label, or null if it cannot name a `.skr`
 * domain.
 *
 * Accepts `alice.skr`, `alice`, `Alice.SKR`. Rejects anything with an interior
 * dot, including subdomains like `a.alice.skr` — those are a different
 * derivation, and quietly resolving them to the wrong account would be worse
 * than refusing.
 */
export function normalizeSkrName(input: string): string | null {
  const label = input
    .trim()
    .toLowerCase()
    .replace(/\.skr$/, "");
  return /^[a-z0-9-]{1,63}$/.test(label) ? label : null;
}

/** Forward lookup. Accepts `alice.skr` or `alice`. Returns null when unregistered. */
export async function resolveSkrDomain(
  rpc: Rpc,
  domain: string,
): Promise<Address | null> {
  const label = normalizeSkrName(domain);
  if (!label) return null;

  const parent = await deriveNameAccount(SKR_TLD, ROOT_ANS);
  const nameAccount = await deriveNameAccount(label, parent);

  const data = await fetchAccountData(rpc, nameAccount);
  if (!data || data.length < HEADER_SIZE) return null;

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const expiresAt = Number(view.getBigUint64(EXPIRES_AT_OFFSET, true));
  if (!isLive(expiresAt, Date.now())) return null;

  const owner = addressDecoder.decode(
    data.subarray(OWNER_OFFSET, OWNER_OFFSET + 32),
  );

  // A tokenized domain records the nft_record PDA as its owner; the real owner
  // holds the NFT.
  const nftRecord = await deriveNftRecord(nameAccount, await deriveTldHouse());
  return owner === nftRecord ? resolveTokenizedOwner(rpc, nftRecord) : owner;
}

async function resolveTokenizedOwner(
  rpc: Rpc,
  nftRecord: Address,
): Promise<Address | null> {
  const data = await fetchAccountData(rpc, nftRecord);
  if (!data || data[8] !== 1) return null; // tag !== ActiveRecord

  const mint = addressDecoder.decode(data.subarray(74, 106));

  // Check the mint's supply, not the holder's balance. getTokenLargestAccounts
  // returns the twenty largest holders, so a mint of supply 2 split across two
  // accounts passes a balance check and resolves to an arbitrary one of them.
  // Requiring a supply of exactly one indivisible unit is what makes "largest
  // holder" and "owner" the same thing.
  const { value: supply } = await rpc.getTokenSupply(mint).send();
  if (supply.decimals !== 0 || BigInt(supply.amount) !== 1n) return null;

  const { value: largest } = await rpc.getTokenLargestAccounts(mint).send();
  if (!largest?.length) return null;

  const { value: holder } = await rpc
    .getAccountInfo(largest[0].address, { encoding: "jsonParsed" })
    .send();
  const parsed = holder?.data as
    { parsed?: { info?: { owner?: string } } } | undefined;
  const ownerString = parsed?.parsed?.info?.owner;
  return ownerString ? address(ownerString) : null;
}

/**
 * Reverse lookup: every live `.skr` name the address owns, sorted.
 *
 * The second read — the human-readable label lives in its own account per name
 * — is batched 100 at a time and issued sequentially. A per-name fan-out would
 * let an outsider size a burst against our RPC quota by transferring names onto
 * an address and asking us to resolve it.
 *
 * Sorted because on-chain order is not a ranking, and an unsorted result would
 * make the displayed label change between calls. Sorting makes it stable, not
 * trustworthy — see the module comment.
 */
export async function resolveSkrNames(
  rpc: Rpc,
  owner: Address,
): Promise<string[]> {
  const parent = await deriveNameAccount(SKR_TLD, ROOT_ANS);
  const tldHouse = await deriveTldHouse();

  const accounts = await rpc
    .getProgramAccounts(ANS_PROGRAM, {
      encoding: "base64",
      // Just the expiry field. Enough to drop expired names in this same call,
      // without pulling 200-byte headers for every name the address holds.
      dataSlice: { offset: EXPIRES_AT_OFFSET, length: 8 },
      filters: [
        {
          // memcmp needs the raw base58 string, while an `Address` is a branded
          // string type. Cast through the brand rather than rebuilding the value.
          memcmp: {
            offset: 8n,
            bytes: parent as string as Base58EncodedBytes,
            encoding: "base58",
          },
        },
        {
          memcmp: {
            offset: BigInt(OWNER_OFFSET),
            bytes: owner as string as Base58EncodedBytes,
            encoding: "base58",
          },
        },
      ],
    })
    .send();

  const now = Date.now();

  const live = accounts.filter(({ account }) => {
    const expiry = new Uint8Array(base64Encoder.encode(account.data[0]));
    if (expiry.length < 8) return false;
    const expiresAt = Number(
      new DataView(expiry.buffer, expiry.byteOffset, 8).getBigUint64(0, true),
    );
    return isLive(expiresAt, now);
  });

  // PDA derivation only — no network, so deriving these together is free.
  const reverseAccounts = await Promise.all(
    live.map(({ pubkey }) => deriveReverseAccount(pubkey, tldHouse)),
  );

  const names: string[] = [];
  for (let i = 0; i < reverseAccounts.length; i += REVERSE_BATCH_SIZE) {
    const { value: batch } = await rpc
      .getMultipleAccounts(reverseAccounts.slice(i, i + REVERSE_BATCH_SIZE), {
        encoding: "base64",
      })
      .send();

    for (const entry of batch) {
      if (!entry) continue;
      const data = new Uint8Array(base64Encoder.encode(entry.data[0]));
      if (data.length <= HEADER_SIZE) continue;
      const label = utf8Decoder
        .decode(data.subarray(HEADER_SIZE))
        .replace(/\0.*$/, "");
      if (label) names.push(`${label}${SKR_TLD}`);
    }
  }

  return names.sort();
}

/**
 * Self-check: the ANS root derivation must reproduce the protocol constant.
 *
 * If this fails, every lookup in this file is returning null for the wrong
 * reason and it will look exactly like a user having no domain.
 */
export async function assertRootDerivation(): Promise<void> {
  const derived = await deriveNameAccount("ANS");
  if (derived !== ROOT_ANS) {
    throw new Error(
      `ANS root derivation is wrong: got ${derived}, expected ${ROOT_ANS}. ` +
        "Hashing or seed order is wrong; every lookup would silently return null.",
    );
  }
}
