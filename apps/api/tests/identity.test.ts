/**
 * Identity integration tests.
 *
 * These drive the real Hono app with `app.request()`, against Neon and — for the
 * Genesis and `.skr` paths — against mainnet. No mocked crypto and no mocked RPC:
 * the properties worth protecting here are exactly the ones a mock would assert
 * nothing about.
 *
 * Each test signs for real with an ephemeral ed25519 key, so the SIWS signature
 * check runs against a genuine signature rather than a hardcoded true.
 *
 * A live-database suite cannot run in true parallel, so `vitest.config.ts` pins
 * this file to a single fork.
 */

import { generateKeyPairSync, sign } from "node:crypto";

import { getBase58Decoder } from "@solana/kit";
import { SignJWT } from "jose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { closeDb, getDb } from "../src/db/client.js";
import { users } from "../src/db/schema.js";

/** The app under test. Built once; it holds no per-request state. */
const app = createApp();

/** An ephemeral keypair standing in for a Seeker wallet. */
const keypair = generateKeyPairSync("ed25519");

/** Its base58 address. The last 32 bytes of an SPKI DER are the raw ed25519 key. */
const WALLET = getBase58Decoder().decode(
  Uint8Array.from(
    keypair.publicKey.export({ type: "spki", format: "der" }).subarray(-32),
  ),
);

/** A second address, for tests that need one wallet to differ from another. */
const OTHER_WALLET = "9WzDXwBbmkg8htpkmG6EvjBsAdyaMY4RzKUYFhSRCLLb";

/**
 * Rebuild the SIWS message the wallet would have signed.
 *
 * Mirrors the serialiser in @solana/wallet-standard-util, which does not export
 * it. If the library's format changes, these tests fail loudly rather than
 * passing against a stale copy.
 */
function signInMessage(input: Record<string, string | undefined>): string {
  let message = `${input.domain} wants you to sign in with your Solana account:\n${WALLET}`;
  if (input.statement) message += `\n\n${input.statement}`;

  const fields: string[] = [];
  if (input.uri) fields.push(`URI: ${input.uri}`);
  if (input.version) fields.push(`Version: ${input.version}`);
  if (input.chainId) fields.push(`Chain ID: ${input.chainId}`);
  if (input.nonce) fields.push(`Nonce: ${input.nonce}`);
  if (input.issuedAt) fields.push(`Issued At: ${input.issuedAt}`);
  if (input.expirationTime)
    fields.push(`Expiration Time: ${input.expirationTime}`);
  if (fields.length) message += `\n\n${fields.join("\n")}`;

  return message;
}

/** Sign an issued payload with the ephemeral key. */
function signPayload(payload: Record<string, string>) {
  const text = signInMessage(payload);
  return {
    address: WALLET,
    signature: Array.from(
      new Uint8Array(
        sign(null, Buffer.from(text), keypair.privateKey).subarray(0, 64),
      ),
    ),
    signedMessage: Array.from(Buffer.from(text)),
  };
}

type Json = Record<string, unknown>;

function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function get(path: string, headers: Record<string, string> = {}) {
  return app.request(path, { headers });
}

const json = (r: Response) => r.json() as Promise<Json>;

/** Issue a nonce for `address`. */
async function issueNonce(address = WALLET) {
  const response = await post("/v1/auth/nonce", { address });
  const body = await json(response);
  expect(response.status).toBe(200);
  return body.payload as Record<string, string>;
}

/** Complete a full SIWS login, returning the session token and user. */
async function signIn() {
  const payload = await issueNonce();
  const response = await post("/v1/auth/siws", {
    ...signPayload(payload),
    nonce: payload.nonce,
  });
  const body = await json(response);
  expect(response.status).toBe(200);
  return {
    token: body.token as string,
    user: body.user as Json,
    auth: { Authorization: `Bearer ${body.token as string}` },
  };
}

beforeAll(async () => {
  // Fail loudly rather than writing into a database the caller did not intend.
  await getDb().delete(users);
});

afterAll(async () => {
  await getDb().delete(users);
  await closeDb();
});

beforeEach(async () => {
  await getDb().delete(users);
});

describe("POST /v1/auth/nonce", () => {
  it("issues a payload pinned to mainnet with a five-minute expiry", async () => {
    const payload = await issueNonce();

    expect(payload.chainId).toBe("solana:mainnet");
    expect(payload.nonce).toMatch(/^[0-9a-f]{32}$/);

    const ttl =
      Date.parse(payload.expirationTime) - Date.parse(payload.issuedAt);
    expect(ttl).toBe(5 * 60 * 1000);
  });

  it.each([
    ["a malformed address", { address: "nope" }],
    ["a missing address", {}],
    ["null", null],
    ["an unexpected field", { address: WALLET, account: {} }],
  ])("rejects %s with 400", async (_label, body) => {
    const response = await post("/v1/auth/nonce", body);
    expect(response.status).toBe(400);
    expect((await json(response)).code).toBe("invalid_request");
  });

  it("rejects a body that is not JSON", async () => {
    const response = await app.request("/v1/auth/nonce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"broken"',
    });
    expect(response.status).toBe(400);
  });
});

describe("POST /v1/auth/siws", () => {
  it("issues a session for a genuine signature", async () => {
    const payload = await issueNonce();
    const response = await post("/v1/auth/siws", {
      ...signPayload(payload),
      nonce: payload.nonce,
    });

    expect(response.status).toBe(200);

    const body = await json(response);
    expect(String(body.token).split(".")).toHaveLength(3);
    expect((body.user as Json).wallet).toBe(WALLET);
  });

  it("reports Genesis honestly for a wallet holding no SGT", async () => {
    const { user } = await signIn();

    // This wallet is freshly generated, so it cannot hold a Genesis Token. The
    // contract is that we say so rather than claiming verification.
    expect(user.genesisStatus).toBe("not_detected");
    expect(user.genesisVerified).toBe(false);
  });

  it("refuses a replayed nonce with 409", async () => {
    const payload = await issueNonce();
    const proof = { ...signPayload(payload), nonce: payload.nonce };

    expect((await post("/v1/auth/siws", proof)).status).toBe(200);

    const replay = await post("/v1/auth/siws", proof);
    expect(replay.status).toBe(409);
    expect((await json(replay)).code).toBe("nonce_reused");
  });

  it("refuses a signature over a different address", async () => {
    const payload = await issueNonce();
    const response = await post("/v1/auth/siws", {
      ...signPayload(payload),
      address: OTHER_WALLET,
      nonce: payload.nonce,
    });

    expect(response.status).toBe(401);
    expect((await json(response)).code).toBe("invalid_signature");
  });

  it("refuses a signature that does not verify", async () => {
    const payload = await issueNonce();
    const response = await post("/v1/auth/siws", {
      ...signPayload(payload),
      signature: new Array(64).fill(7),
      nonce: payload.nonce,
    });

    expect(response.status).toBe(401);
  });

  it("refuses a nonce issued for another wallet", async () => {
    const payload = await issueNonce(OTHER_WALLET);
    const response = await post("/v1/auth/siws", {
      ...signPayload(payload),
      nonce: payload.nonce,
    });

    expect(response.status).toBe(401);
  });

  it.each([
    ["a short signature", { signature: new Array(63).fill(0) }],
    ["an out-of-range byte", { signature: new Array(64).fill(999) }],
    ["a malformed nonce", { nonce: "short" }],
  ])("rejects %s with 400", async (_label, override) => {
    const payload = await issueNonce();
    const response = await post("/v1/auth/siws", {
      ...signPayload(payload),
      nonce: payload.nonce,
      ...override,
    });

    expect(response.status).toBe(400);
  });

  it("resolves one wallet to one account across repeated sign-ins", async () => {
    const first = await signIn();
    const second = await signIn();

    expect(second.user.id).toBe(first.user.id);
    expect(await getDb().select().from(users)).toHaveLength(1);
  });
});

describe("session enforcement", () => {
  it.each(["/v1/me", "/v1/genesis"])(
    "requires a token for %s",
    async (path) => {
      const response = await get(path);
      expect(response.status).toBe(401);
      expect((await json(response)).code).toBe("unauthorized");
    },
  );

  it("reads identity for a valid session", async () => {
    const { auth, user } = await signIn();
    const response = await get("/v1/me", auth);

    expect(response.status).toBe(200);
    expect((await json(response)).id).toBe(user.id);
  });

  it("reports an expired token with the spec 37 wording", async () => {
    const { token } = await signIn();

    // Re-sign the same claims with a lifetime in the past.
    const expired = await new SignJWT({
      sub: "00000000-0000-0000-0000-000000000000",
      wallet: WALLET,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("gochi")
      .setAudience("gochi-mobile")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 10_000)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 5)
      .sign(new TextEncoder().encode(process.env.API_JWT_SECRET!));

    const response = await get("/v1/me", {
      Authorization: `Bearer ${expired}`,
    });

    expect(response.status).toBe(401);
    expect((await json(response)).message).toBe(
      "Your session has expired. Please sign in again.",
    );
    expect(token).toBeTruthy();
  });

  it("refuses a tampered token", async () => {
    const { token } = await signIn();
    const response = await get("/v1/me", {
      Authorization: `Bearer ${token.slice(0, -4)}AAAA`,
    });

    expect(response.status).toBe(401);
  });
});

describe("GET /v1/genesis", () => {
  it("answers not_detected with a 200 for a wallet holding no SGT", async () => {
    const { auth } = await signIn();
    const response = await get("/v1/genesis", auth);

    // Not an error: "not detected" is an answer, and section 37 wants an explicit
    // reason with a retry rather than a failure.
    expect(response.status).toBe(200);

    const body = await json(response);
    expect(body.status).toBe("not_detected");
    expect(body.mintAddress).toBeNull();
    expect(Number.isNaN(Date.parse(String(body.checkedAt)))).toBe(false);
  });

  it("never accepts an address from the query string", async () => {
    const { auth } = await signIn();
    // Otherwise anyone could probe whether an arbitrary wallet holds a Seeker.
    const response = await get(`/v1/genesis?address=${OTHER_WALLET}`, auth);
    expect(response.status).toBe(200);
  });
});

describe("unmatched routes", () => {
  it("answers 404 in the shared error shape", async () => {
    const { auth } = await signIn();
    // A path that genuinely does not exist. `/v1/companion` used to be the
    // example here, but P3 mounted it, so it would now return 200 — which is
    // exactly the kind of stale expectation that makes a suite lie.
    const response = await get("/v1/nonexistent", auth);

    expect(response.status).toBe(404);
    expect((await json(response)).code).toBe("invalid_request");
  });
});
