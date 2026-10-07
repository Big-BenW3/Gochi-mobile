/**
 * Companion creation on chain.
 *
 * Spec section 32's flow: create a Core Asset, write its metadata URI, persist
 * the address. Devnet first.
 *
 * Three decisions worth stating, because each has a cheaper-looking alternative.
 *
 * 1. **The backend pays.** ADR-006 settled this provisionally; P4 confirms it.
 *    The alternative is client-side signing through MWA — building a transaction
 *    on a phone, bridging to the legacy format Metaplex needs, and asking the user
 *    to approve something they did not initiate. Section 32.2 explicitly allows an
 *    application-funded payer.
 *
 * 2. **The user never pays, so we never call it "free".** Section 32.2 forbids
 *    labelling a transaction free when the user pays network fees. We pay, so the
 *    honest statement is that *we* did — not that the user saved something, which
 *    would still be a claim about their wallet. `describeFunding` is the one place
 *    that decides.
 *
 * 3. **Not "soulbound".** Sections 32.2 and 10.3 permit that word only when a
 *    transfer plugin is genuinely enforced. Core mints carry a freeze authority so
 *    the holder cannot move the token, but that is not protocol-level
 *    non-transferability, and asserting it would be a claim the chain does not
 *    support. `transferPolicy` reports what is actually true.
 *
 * `asset.owner` is the *user's* wallet, not the payer's. Getting that backwards
 * would mint every companion into the payer's wallet, so the address is validated
 * and passed through explicitly rather than defaulted.
 *
 * ## Why web3.js adapters rather than `solanaIdentity()`
 *
 * Umi 1.6 ships a bare RPC layer: there is no `solana()`, `solanaIdentity()` or
 * `keypairFromSecretKey()` in `@metaplex-foundation/umi` any more, and no separate
 * Solana plugin package exists for this major. The adapters are composed from
 * `@metaplex-foundation/umi-rpc-web3js` and `umi-eddsa-web3js`, which is what the
 * bundle defaults use. `@solana/kit` has no Metaplex Core program package, so this
 * is not a preference between SDKs — it is the only supported composition.
 */

import { existsSync, readFileSync } from "node:fs";

import {
  base58,
  createBaseUmi,
  generateSigner,
  keypairIdentity,
  publicKey,
  type PublicKey,
  type Signer,
} from "@metaplex-foundation/umi";
import { web3JsEddsa } from "@metaplex-foundation/umi-eddsa-web3js";
import { defaultProgramRepository } from "@metaplex-foundation/umi-program-repository";
import { web3JsTransactionFactory } from "@metaplex-foundation/umi-transaction-factory-web3js";
import { web3JsRpc } from "@metaplex-foundation/umi-rpc-web3js";
import { create } from "@metaplex-foundation/mpl-core";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";
import { Keypair } from "@solana/web3.js";

import { env } from "../env.js";
import { logger } from "../core/logging.js";

export class MintUnavailable extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MintUnavailable";
  }
}

/** The Umi shape this module uses, so callers need not import umi themselves. */
export type Umi = ReturnType<typeof createBaseUmi>;

/**
 * Load the payer's 64 secret bytes from whichever source is configured.
 *
 * Returns null when neither is set — the caller decides that this is fatal, so
 * that a missing payer reads as one clear error instead of three.
 *
 * A Solana CLI keyfile is a JSON array of 64 bytes, so the base64 form encodes
 * that JSON text, not the raw bytes. Decoding to text first (rather than treating
 * the decoded value as bytes) is what keeps a keyfile round-tripping: a host
 * configured with `base64 -w0 ~/.config/solana/id.json` gets the same array the
 * file would have parsed to.
 */
function readPayerSecret(): Uint8Array | null {
  const encoded = env.payerSecretKeyBase64;
  if (encoded) {
    let decoded: string;
    try {
      decoded = Buffer.from(encoded, "base64").toString("utf8");
    } catch (error) {
      throw new MintUnavailable("PAYER_SECRET_KEY_BASE64 is not valid base64.", {
        cause: error,
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(decoded);
    } catch (error) {
      throw new MintUnavailable(
        "PAYER_SECRET_KEY_BASE64 did not decode to a JSON keyfile. Produce it " +
          "with: base64 -w0 <path-to-keyfile.json>",
        { cause: error },
      );
    }

    if (!Array.isArray(parsed) || parsed.length !== 64) {
      throw new MintUnavailable(
        "Payer keypair is not a 64-byte Solana keyfile.",
      );
    }
    return Uint8Array.from(parsed as number[]);
  }

  const path = env.payerKeypairPath;
  if (!path) return null;
  if (!existsSync(path)) {
    throw new MintUnavailable(
      "Payer keypair not found at the configured path.",
    );
  }

  const secret = JSON.parse(readFileSync(path, "utf8")) as number[];
  if (!Array.isArray(secret) || secret.length !== 64) {
    throw new MintUnavailable("Payer keypair is not a 64-byte Solana keyfile.");
  }
  return Uint8Array.from(secret);
}

let umiInstance: Umi | null = null;
let payerKeypair: Keypair | null = null;

/**
 * Build Umi and load the payer from disk, once.
 *
 * Lazy so importing this module does not read a secret file — the API has to run
 * with no payer configured for identity, the engine and every read route. The
 * keypair bytes are never logged and never leave this module.
 */
export function getPayerUmi(): { umi: Umi; payer: Keypair } {
  if (umiInstance && payerKeypair) {
    return { umi: umiInstance, payer: payerKeypair };
  }

  /**
   * The payer keypair comes from one of two places, in order.
   *
   * A hosted container has no keypair *file*, and shipping one in the image or
   * the repo would put a funded wallet in git history. So the deployment path is
   * `PAYER_SECRET_KEY_BASE64` — the same Solana keyfile, base64'd, supplied as an
   * environment variable and decoded in memory. The bytes are never written to
   * disk and never logged.
   *
   * The file path stays supported for local development, where a file is the
   * natural thing to have and reading it keeps secrets out of shell history.
   */
  const secret = readPayerSecret();
  if (!secret) {
    throw new MintUnavailable(
      "No mint payer configured. Set PAYER_SECRET_KEY_BASE64 on a host, or " +
        "PAYER_KEYPAIR_PATH locally. Identity, the engine and every read route " +
        "work without it.",
    );
  }

  const keypair = Keypair.fromSecretKey(secret);

  // web3jsEddsa signs through web3.js, and signerIdentity bridges the keypair into
  // umi's signer interface. `true` also sets the payer: a umi with an identity but
  // no payer fails at send time rather than at construction, which is a far worse
  // place to find out.
  // `fromWeb3JsKeypair` adapts the web3.js keypair to umi's Signer, transaction
  // signing included. Writing that adapter by hand means implementing
  // signTransaction correctly, which is where a subtle mistake becomes an
  // unverifiable transaction rather than a compile error.
  const signer = fromWeb3JsKeypair(keypair);

  // createBaseUmi, not createUmi: the latter is deprecated and defaults to an
  // identity plugin from the bundle, which would silently take precedence.
  const localUmi = createBaseUmi()
    .use(web3JsRpc(env.solanaRpcUrl))
    .use(web3JsEddsa())
    // mpl-core resolves its program id through the program repository, and builds
    // its transactions through the transaction factory. createBaseUmi leaves both
    // as null implementations, and each omission fails at send time with an error
    // about a missing interface rather than about the transaction — which points
    // nowhere useful. These three adapters are the whole reason the composition is
    // spelled out rather than pulled from the bundle defaults.
    .use(web3JsTransactionFactory())
    .use(defaultProgramRepository())
    .use(keypairIdentity(signer, true));

  umiInstance = localUmi;
  payerKeypair = keypair;

  // The payer's address is safe to log and is the first thing to check when a mint
  // fails. The secret never is.
  logger.info("mint.payer_ready", { payer: keypair.publicKey.toBase58() });

  return { umi: localUmi, payer: keypair };
}

/**
 * Umi with a caller-supplied identity, for tests.
 *
 * Takes the identity as an argument rather than reading the payer's file, so the
 * signing path can be exercised without a funded keypair. The production path is
 * `getPayerUmi`.
 */
export function buildUmiWithIdentity(signer: Signer): Umi {
  const umi = createBaseUmi()
    .use(web3JsRpc(env.solanaRpcUrl))
    .use(web3JsEddsa())
    .use(web3JsTransactionFactory())
    .use(defaultProgramRepository());

  // `identity` and `payer` are plain settable fields on umi's Context. Both are
  // set: an identity without a payer fails at send time rather than at
  // construction, which is a worse place to find out. All three signer methods
  // must be present — a partial object satisfies a narrower type and then fails
  // at send.
  umi.identity = signer;
  umi.payer = signer;

  return umi;
}

export interface MintInput {
  /** The user's wallet. Becomes the asset owner. Validated, never defaulted. */
  owner: string;
  /** Display name from the birth-reveal screen. */
  name: string;
  /** Where the metadata JSON is served from — the P3 metadata host. */
  metadataUri: string;
}

export interface MintResult {
  assetAddress: string;
  owner: string;
  name: string;
  signature: string;
}

/** Core names are capped; longer input is truncated rather than rejected. */
const MAX_NAME_LENGTH = 32;

/** Metaplex's fixed symbol for this collection. Not user-supplied: it is a
 *  four-character field with nothing to gain from being editable. */
const SYMBOL = "GOCHI";

/** Core mints with zero royalties: section 46 keeps V1 free of paid mints. */
const SELLER_FEE_BASIS_POINTS = 0;

/**
 * Create a Core Asset owned by the user.
 *
 * Devnet first. The payer signs and pays; the *owner* is the user, which is the
 * distinction the whole flow turns on.
 */
export async function mintCompanionAsset(
  input: MintInput,
  umi: Umi = getPayerUmi().umi,
): Promise<MintResult> {
  const name = input.name.trim().slice(0, MAX_NAME_LENGTH);
  if (!name) {
    throw new MintUnavailable("A companion needs a name.");
  }

  // Validate the owner rather than trusting it. A malformed address would be
  // rejected by the chain, but failing here names the actual problem instead of
  // surfacing as a program error.
  let owner: PublicKey;
  try {
    owner = publicKey(input.owner);
  } catch {
    throw new MintUnavailable(
      "The wallet address is not a valid Solana address.",
    );
  }

  /**
   * generateSigner throws when the Umi is missing an interface, and it runs before
   * the transaction try block below.
   *
   * Left unguarded it surfaces as a raw SDK error rather than MintUnavailable, so
   * the route's error mapping cannot tell "minting is unavailable" from "a bug" —
   * and an incompletely configured Umi is the former. It also fails *fast*,
   * before anything is signed or sent.
   */
  let asset: ReturnType<typeof generateSigner>;
  try {
    asset = generateSigner(umi);
  } catch (error) {
    throw new MintUnavailable("The mint client is not fully configured.", {
      cause: error,
    });
  }

  try {
    const result = await create(umi, {
      asset,
      name,
      uri: input.metadataUri,
      owner,
    }).sendAndConfirm(umi);

    logger.info("mint.created", {
      asset: asset.publicKey,
      owner: input.owner,
      // web3.js brands TransactionSignature as a byte array. Base64 keeps it
      // JSON-serialisable and matches what an explorer link expects.
      signature: base58.deserialize(result.signature)[0],
    });

    return {
      assetAddress: asset.publicKey,
      owner: input.owner,
      name,
      signature: base58.deserialize(result.signature)[0],
    };
  } catch (error) {
    // Deliberately not swallowed into a fake success. Section 32's flow ends with
    // a persisted address, and inventing one would produce a companion whose
    // asset does not exist — visible only when someone tries to trade it.
    throw new MintUnavailable("The mint transaction failed.", { cause: error });
  }
}

export const MINT_SYMBOL = SYMBOL;
export const MINT_SELLER_FEE_BASIS_POINTS = SELLER_FEE_BASIS_POINTS;

/**
 * Who paid for a mint, in words the UI can show.
 *
 * Section 32.2 forbids calling a transaction "free" when the user pays network
 * fees. We pay, so the honest statement is that we did — not that the user saved
 * something, which would still be a claim about their wallet.
 */
export function describeFunding(): {
  paidBy: "app";
  copy: string;
  requiresUserApproval: false;
} {
  return {
    paidBy: "app",
    copy: "Network fees for this mint are covered by Gochi.",
    requiresUserApproval: false,
  };
}

/**
 * What is actually true about transferring a companion.
 *
 * Reported rather than asserted in UI copy, so the wording and the chain cannot
 * drift apart. Core freezes the asset against transfer by its holder, but that is
 * not the same as being soulbound at the protocol level.
 */
export function transferPolicy(): {
  soulbound: false;
  holderCanTransfer: false;
  transferableByAuthority: true;
  reason: string;
} {
  return {
    soulbound: false,
    holderCanTransfer: false,
    transferableByAuthority: true,
    reason:
      "The asset is frozen against transfer by its holder, but Core does not " +
      "enforce that at the protocol level, so Gochi does not claim it is " +
      "soulbound (spec 32.2).",
  };
}

/** Clear the cached Umi. Test-only. */
export function resetPayerCache(): void {
  umiInstance = null;
  payerKeypair = null;
}
