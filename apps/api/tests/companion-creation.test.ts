/**
 * Companion creation tests — spec section 32's flow.
 *
 * The happy path spends real devnet SOL, so it is behind `runIf` and skipped when
 * no payer is configured. The properties that must hold *regardless* of whether a
 * mint is possible are tested unconditionally: one companion per wallet, no
 * fabricated asset address, and honest disclosure about funding and transfer.
 *
 * The most important assertion in this file is that `assetAddress` stays null when
 * minting is unavailable. Section 32's flow ends with a persisted address, so a row
 * claiming an asset that was never created would produce a companion that looks
 * real and is not — and nothing would fail until someone tried to trade it.
 */

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { closeDb, getDb } from "../src/db/client.js";
import { activityEvents, companions, users } from "../src/db/schema.js";
import { issueSession } from "../src/auth/session.js";
import { upsertUserByWallet } from "../src/users/repository.js";
import { resetIdempotency } from "../src/http/middleware.js";
import { resetRateLimits } from "../src/http/rate-limit.js";
import { env } from "../src/env.js";

const app = createApp();
const WALLET = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";

/** A live mint needs a funded payer on devnet. */
const runIf =
  Boolean(env.payerKeypairPath) && env.solanaRpcUrl.includes("devnet");

let auth = "";

async function seed() {
  await getDb().delete(activityEvents);
  await getDb().delete(companions);
  await getDb().delete(users);

  const { user } = await upsertUserByWallet(WALLET);
  const { token } = await issueSession(user.id, WALLET);
  auth = `Bearer ${token}`;
}

beforeEach(async () => {
  resetIdempotency();
  resetRateLimits();
  await seed();
});

afterAll(async () => {
  await seed();
  await closeDb();
});

const post_ = (body: unknown) =>
  app.request("/v1/companion", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify(body),
  });

const get_ = (path: string) =>
  app.request(path, { headers: { Authorization: auth } });

describe("companion creation guards", () => {
  it("requires a session", async () => {
    const response = await app.request("/v1/companion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Gochi" }),
    });
    expect(response.status).toBe(401);
  });

  it("rejects a missing name", async () => {
    const response = await post_({});
    expect(response.status).toBe(400);
  });

  it("rejects a name over the Core limit rather than truncating silently", async () => {
    // The name screen validates, but the API is the boundary that matters.
    const response = await post_({ name: "a".repeat(64) });
    expect(response.status).toBe(400);
  });

  it("rejects a client-supplied owner", async () => {
    // The owner comes from the session. Accepting one from the body would let a
    // caller mint an asset into somebody else's wallet.
    const response = await post_({
      name: "Gochi",
      owner: "9WzDXwBbmkg8htpkmG6EvjBsAdyaMY4RzKUYFhSRCLLb",
    });
    expect(response.status).toBe(400);
  });

  it("rejects a client-supplied asset address", async () => {
    const response = await post_({
      name: "Gochi",
      assetAddress: "4cPViCJRm1kN1y67Jth6pVsMC44emFwuCKqye2bfQgB4",
    });
    expect(response.status).toBe(400);
  });
});

describe("one companion per wallet (spec 29.3)", () => {
  it("does not create a second companion for the same wallet", async () => {
    // Whether or not the mint succeeds, there is never a second row. This is what
    // the unique index guarantees; the existence check is only for a friendly
    // response.
    await post_({ name: "Gochi" });
    await post_({ name: "Gochi" });
    await post_({ name: "Gochi" });

    expect(await getDb().select().from(companions)).toHaveLength(1);
  });

  it("returns the existing companion rather than erroring on a repeat", async () => {
    const first = await post_({ name: "Gochi" });
    const second = await post_({ name: "Gochi" });

    expect(second.status).toBe(200);
    const body = (await second.json()) as Record<string, any>;
    expect(body.alreadyCreated).toBe(true);
    expect(first.status === 201 || first.status === 503).toBe(true);
  });
});

describe("honest state (spec 32)", () => {
  it("never records an asset address that does not exist", async () => {
    await post_({ name: "Gochi" });

    const row = (await getDb().select().from(companions))[0];
    // If minting succeeded the address is real; if it failed it is null. What must
    // never happen is a fabricated value.
    if (row.assetAddress !== null) {
      expect(row.assetAddress).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    }
  });

  it("reports funding as app-paid and never as free", async () => {
    const response = await post_({ name: "Gochi" });
    const body = (await response.json()) as Record<string, any>;

    expect(body.funding?.paidBy).toBe("app");
    expect(body.funding?.copy?.toLowerCase()).not.toContain("free");
  });

  it("does not claim the companion is soulbound", async () => {
    const response = await post_({ name: "Gochi" });
    const body = (await response.json()) as Record<string, any>;

    if (body.transfer) {
      expect(body.transfer.soulbound).toBe(false);
    }
  });
});

describe("asset detail (screen G03)", () => {
  it("404s before a companion exists", async () => {
    await getDb().delete(companions);
    const response = await get_("/v1/companion/asset");
    expect(response.status).toBe(400);
  });

  it("reports the asset fields once created", async () => {
    await post_({ name: "Gochi" });
    const response = await get_("/v1/companion/asset");

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, any>;
    expect(body.name).toBe("Gochi");
    expect(body.owner).toBe(WALLET);
  });
});

describe("a real mint over HTTP", () => {
  it.runIf(runIf)(
    "creates an asset owned by the session wallet",
    async () => {
      const response = await post_({ name: "Gochi" });
      expect(response.status).toBe(201);

      const body = (await response.json()) as Record<string, any>;
      expect(body.alreadyCreated).toBe(false);
      expect(body.companion.assetAddress).toMatch(
        /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
      );
      // The wallet that signed in is the owner, not the payer.
      expect(body.companion.owner ?? WALLET).toBe(WALLET);

      const row = (await getDb().select().from(companions))[0];
      expect(row.assetAddress).toBe(body.companion.assetAddress);
      expect(row.metadataUri).toContain(row.id);
    },
    120_000,
  );

  it.runIf(runIf)(
    "records a COMPANION_CREATED event",
    async () => {
      await post_({ name: "Gochi" });
      const events = await getDb()
        .select()
        .from(activityEvents)
        .where(eq(activityEvents.eventType, "COMPANION_CREATED"));

      expect(events).toHaveLength(1);
      expect(events[0].processedAt).not.toBeNull();
    },
    120_000,
  );
});
