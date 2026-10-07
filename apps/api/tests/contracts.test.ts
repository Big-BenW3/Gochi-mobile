/**
 * Contract tests.
 *
 * These assert that the schemas *reject* things, which is the property that
 * matters. A permissive schema passes every happy-path check while letting a
 * client send a level of 0, an aura of 101, or an interaction kind the engine has
 * no rule for — and each of those fails silently, as a wrong number on screen or
 * as XP that never moves.
 */

import { describe, expect, it } from "vitest";

import * as c from "@gochi/contracts";

const validCompanion = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Gochi",
  level: 1,
  xp: 0,
  xpToNextLevel: 212,
  energy: 100,
  shieldHealth: 100,
  shieldDurability: 100,
  combatRating: 0,
  aura: 0,
  condition: "HEALTHY" as const,
  evolutionStage: 1,
  assetAddress: null,
  metadataUri: null,
  lastStateUpdate: new Date().toISOString(),
  configVersion: "GAME_CONFIG_V1",
};

describe("companion", () => {
  it("accepts a well-formed companion", () => {
    expect(c.companionSchema.safeParse(validCompanion).success).toBe(true);
  });

  // Section 5.1 gives explicit ranges. A companion outside them would render a
  // progress bar past its own end or an XP figure no curve can reach.
  it.each([
    ["level 0", { level: 0 }],
    ["level 51", { level: 51 }],
    ["energy 101", { energy: 101 }],
    ["negative energy", { energy: -1 }],
    ["aura 101", { aura: 101 }],
    ["combat rating over 1000", { combatRating: 1001 }],
    ["shield over 100", { shieldHealth: 101 }],
    ["negative XP", { xp: -1 }],
    ["evolution stage 6", { evolutionStage: 6 }],
  ])("rejects %s", (_label, override) => {
    expect(
      c.companionSchema.safeParse({ ...validCompanion, ...override }).success,
    ).toBe(false);
  });

  it("rejects a condition outside the eight in spec 5.2", () => {
    expect(
      c.companionSchema.safeParse({ ...validCompanion, condition: "HUNGRY" })
        .success,
    ).toBe(false);
  });

  it("accepts a nullable asset address before minting", () => {
    expect(
      c.companionSchema.safeParse({ ...validCompanion, assetAddress: null })
        .success,
    ).toBe(true);
  });
});

describe("conditions", () => {
  it("are exactly the eight from spec 5.2", () => {
    expect([...c.conditionSchema.options].sort()).toEqual(
      [
        "ALERT",
        "DAMAGED",
        "ENERGIZED",
        "EVOLVING",
        "HEALTHY",
        "RECOVERING",
        "SLEEPING",
        "TIRED",
      ].sort(),
    );
  });
});

describe("interaction", () => {
  // Section 19 caps interaction deliberately. An open string would let a client
  // invent a kind the engine has no rule for.
  it("accepts each spec-defined kind", () => {
    for (const kind of ["pet", "play", "feed", "clean", "sleep"] as const) {
      expect(c.interactionRequestSchema.safeParse({ kind }).success).toBe(true);
    }
  });

  it("rejects an unknown kind", () => {
    expect(c.interactionRequestSchema.safeParse({ kind: "hack" }).success).toBe(
      false,
    );
  });

  it("rejects an extra field", () => {
    expect(
      c.interactionRequestSchema.safeParse({ kind: "pet", xp: 999 }).success,
    ).toBe(false);
  });
});

describe("vault (spec 9.3)", () => {
  const validVault = {
    companion: {
      id: validCompanion.id,
      name: "Gochi",
      assetAddress: null,
      metadataUri: null,
    },
    ownership: { walletAddress: null, seekerId: null, genesisVerified: false },
    balances: { available: false, tokens: [] },
    activity: { totalEvents: 0, recent: [] },
    custodyNotice:
      "Your wallet holds your assets. Gochi does not take custody." as const,
  };

  it("accepts the documented shape", () => {
    expect(c.vaultResponseSchema.safeParse(validVault).success).toBe(true);
  });

  it("pins the custody notice to one string", () => {
    // A literal type, so the notice cannot be reworded per response and stop
    // meaning the same thing.
    expect(
      c.vaultResponseSchema.safeParse({ ...validVault, custodyNotice: "other" })
        .success,
    ).toBe(false);
  });

  it("shows holdings without attaching a value to them", () => {
    // P10 added balances (spec 9.2 asks for token summaries). What must stay
    // absent is anything that turns holdings into a portfolio the app prices:
    // a top-level total, or any fiat value per token. Section 9.3 is about not
    // implying custody, and a priced portfolio is how that implication creeps
    // back in.
    const keys = Object.keys(c.vaultResponseSchema.shape);
    expect(keys).toContain("balances");
    expect(keys).not.toContain("balance");
    expect(keys).not.toContain("amount");
    expect(keys).not.toContain("value");
    expect(keys).not.toContain("totalValue");

    // A token carries an amount and a scale, and nothing that looks like money.
    const tokenKeys = Object.keys(
      (c.vaultResponseSchema.shape as { balances: { shape: Record<string, unknown> } })
        .balances.shape.tokens
        ? ((c.vaultResponseSchema.shape as never as { balances: { shape: { tokens: { _def: { shape: Record<string, unknown> } } } } }).balances.shape.tokens._def.shape)
        : {},
    );
    expect(tokenKeys).toContain("amount");
    expect(tokenKeys).not.toContain("priceUsd");
    expect(tokenKeys).not.toContain("valueUsd");
  });
});

describe("activity", () => {
  it("carries a null cursor at the end of a feed", () => {
    expect(
      c.activityResponseSchema.safeParse({ events: [], nextCursor: null })
        .success,
    ).toBe(true);
  });

  it("accepts a half-processed event", () => {
    // An event can be recorded before the engine has processed it, so
    // processedAt must be nullable rather than required.
    const event = {
      id: "11111111-1111-1111-1111-111111111111",
      eventType: "SWAP",
      source: "JUPITER",
      signature: null,
      slot: null,
      occurredAt: new Date().toISOString(),
      processedAt: null,
      detail: {},
    };
    expect(c.activityEventSchema.safeParse(event).success).toBe(true);
  });
});

describe("core metadata (Metaplex Core)", () => {
  it("keeps the on-chain field names", () => {
    // These cannot be renamed: an off-chain metadata document has to match what
    // the Core program reads, or the asset resolves to nothing.
    const metadata = {
      name: "Gochi",
      symbol: "GOCHI",
      description: "A companion.",
      seller_fee_basis_points: 0,
      image: "https://example.test/gochi.png",
    };
    const parsed = c.coreMetadataSchema.safeParse(metadata);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.seller_fee_basis_points).toBe(0);
    }
  });

  it("rejects a fee above the 10000 basis-point ceiling", () => {
    expect(
      c.coreMetadataSchema.safeParse({
        name: "Gochi",
        symbol: "GOCHI",
        description: "x",
        seller_fee_basis_points: 10_001,
        image: "https://example.test/a.png",
      }).success,
    ).toBe(false);
  });
});

describe("mark notifications read", () => {
  it("rejects an empty id list", () => {
    // A no-op request is a client bug, and accepting it would report success
    // without having marked anything.
    expect(c.markReadRequestSchema.safeParse({ ids: [] }).success).toBe(false);
  });

  it("rejects a non-uuid", () => {
    expect(c.markReadRequestSchema.safeParse({ ids: ["nope"] }).success).toBe(
      false,
    );
  });
});
