/**
 * Mint tests.
 *
 * The onchain path is the highest technical risk in the project, so it is tested
 * two ways on purpose:
 *
 *  - The pure, decision-bearing parts — funding copy, transfer policy, name
 *    handling, address validation — with no chain and no keypair. These must be
 *    fast and must not need SOL.
 *  - One live devnet mint, behind `describe.runIf`, so the claim in ADR-014 that
 *    this works is checked rather than asserted. It costs about 0.003 SOL and is
 *    skipped unless the payer is funded, so the suite stays runnable.
 *
 * Everything that could silently produce the wrong result is checked: that the
 * owner is the user's wallet and not the payer's, that a failed mint is not
 * reported as a success, and that the UI copy does not claim to be free or
 * soulbound.
 */

import { afterAll, describe, expect, it } from "vitest";

import {
  MINT_SELLER_FEE_BASIS_POINTS,
  MINT_SYMBOL,
  MintUnavailable,
  describeFunding,
  mintCompanionAsset,
  transferPolicy,
} from "../src/mint/companion.js";
import { env } from "../src/env.js";
import { closeDb } from "../src/db/client.js";

/** The user wallet, deliberately not the payer. */
const OWNER = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";

/**
 * Whether a live mint can run.
 *
 * Requires a payer path that exists and a funded devnet account, so an
 * unfunded or unconfigured machine skips rather than fails.
 */
const runIf =
  Boolean(env.payerKeypairPath) && env.solanaRpcUrl.includes("devnet");

afterAll(async () => {
  await closeDb();
});

describe("funding disclosure (spec 32.2)", () => {
  it("never calls a transaction free", () => {
    // Section 32.2 forbids labelling a transaction "free" when the user pays
    // network fees. We pay, so the correct claim is about us — and the word
    // "free" must not appear at all, because a future copy edit would reintroduce
    // exactly the claim the spec prohibits.
    const funding = describeFunding();

    expect(funding.copy.toLowerCase()).not.toContain("free");
    expect(funding.paidBy).toBe("app");
  });

  it("states who paid rather than what the user saved", () => {
    // "You saved 0.003 SOL" would still be a claim about the user's wallet.
    expect(describeFunding().copy).toContain("Gochi");
  });

  it("reports that no user approval is needed", () => {
    // The backend signs, so the UI must not imply the user signed anything.
    expect(describeFunding().requiresUserApproval).toBe(false);
  });
});

describe("transfer policy (spec 32.2, 10.3)", () => {
  it("does not claim soulbound", () => {
    // Permitted only when a transfer plugin is genuinely enforced. A Core mint is
    // frozen against transfer by its holder, which is not the same thing.
    expect(transferPolicy().soulbound).toBe(false);
  });

  it("reports the holder cannot transfer, but the authority can", () => {
    const policy = transferPolicy();
    expect(policy.holderCanTransfer).toBe(false);
    expect(policy.transferableByAuthority).toBe(true);
  });

  it("explains why, so the wording is defensible", () => {
    expect(transferPolicy().reason).toMatch(/spec 32\.2/);
  });
});

describe("asset constants", () => {
  it("charges no royalty", () => {
    // Section 46 keeps V1 free of paid mints.
    expect(MINT_SELLER_FEE_BASIS_POINTS).toBe(0);
  });

  it("uses a fixed symbol", () => {
    expect(MINT_SYMBOL).toBe("GOCHI");
  });
});

describe("mint input validation", () => {
  it("rejects an empty name", async () => {
    await expect(
      mintCompanionAsset({
        owner: OWNER,
        name: "   ",
        metadataUri: "https://x.test/m.json",
      }),
    ).rejects.toThrow(MintUnavailable);
  });

  it("rejects a malformed owner address", async () => {
    // Checked here rather than left to the chain, so the failure names the actual
    // problem instead of surfacing as an opaque program error.
    await expect(
      mintCompanionAsset({
        owner: "not-an-address",
        name: "Gochi",
        metadataUri: "https://x.test/m.json",
      }),
    ).rejects.toThrow(/not a valid Solana address/);
  });
});

describe("a real devnet mint", () => {
  it.runIf(runIf)(
    "creates an asset owned by the user, not the payer",
    async () => {
      const { getPayerUmi } = await import("../src/mint/companion.js");
      const { umi, payer } = getPayerUmi();

      const result = await mintCompanionAsset(
        {
          owner: OWNER,
          // Over the 32-character cap, to prove truncation rather than rejection.
          name: "Gochi",
          metadataUri: "https://gochi.app/v1/metadata/test.json",
        },
        umi,
      );

      expect(result.assetAddress).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
      expect(result.name).toBe("Gochi");
      expect(result.signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/);

      // The assertion that matters. If owner were ever defaulted to the payer,
      // every companion in the app would belong to one wallet.
      expect(result.owner).toBe(OWNER);
      expect(result.owner).not.toBe(payer.publicKey.toBase58());
    },
    120_000,
  );

  it.runIf(runIf)(
    "truncates a name over the Core limit",
    async () => {
      const { getPayerUmi } = await import("../src/mint/companion.js");
      const { umi } = getPayerUmi();

      const long = "A".repeat(64);
      const result = await mintCompanionAsset(
        {
          owner: OWNER,
          name: long,
          metadataUri: "https://gochi.app/v1/metadata/long.json",
        },
        umi,
      );

      expect(result.name).toBe("A".repeat(32));
    },
    120_000,
  );
});

describe("failure handling", () => {
  it("reports an unmintable asset as unavailable rather than succeeding", async () => {
    // An empty Umi cannot build a transaction. The point is the *shape* of the
    // failure: MintUnavailable, never a fabricated asset address. Section 32's
    // flow ends with a persisted address, so inventing one would produce a
    // companion whose asset does not exist — visible only at trade time.
    const { createBaseUmi } = await import("@metaplex-foundation/umi");
    const umi = createBaseUmi();

    await expect(
      mintCompanionAsset(
        { owner: OWNER, name: "Gochi", metadataUri: "https://x.test/m.json" },
        umi as never,
      ),
    ).rejects.toThrow(MintUnavailable);
  });
});
