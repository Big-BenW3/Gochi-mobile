/**
 * Environment loading and validation for the Gochi API.
 *
 * Two rules decide how this file is written.
 *
 * 1. The server must fail at startup, not on the first request that happens to
 *    need a missing variable. Every endpoint in spec section 40 depends on the
 *    database, and the auth endpoints additionally depend on both signing
 *    secrets. Discovering a missing DATABASE_URL from a 500 in production is
 *    the failure mode this prevents.
 *
 * 2. `EXPO_PUBLIC_` variables are deliberately not readable here. Expo inlines
 *    them into the app bundle at build time, which makes them public by
 *    definition. A server secret must never be named that way, so this module
 *    treats the prefix as a bug rather than a feature and refuses to load any
 *    variable that carries it.
 *
 * Privy is the concrete case for both halves of this. Verification is
 * asymmetric: the token is checked against Privy's published JWKS, signed by the
 * platform rather than the app, so the *only* Privy value the server needs is the
 * public App ID, used as the JWT audience to reject a token minted for a
 * different app. That is why `EXPO_PUBLIC_PRIVY_APP_ID` is required here
 * despite the prefix — it is public by design and already ships in the bundle.
 *
 * There is deliberately no Privy app secret. It was once required here and never
 * read: verification made no authenticated call to Privy, so requiring a secret
 * only put an unused credential on a public host. A secret would become necessary
 * the moment this server called a Privy *REST* endpoint, and the variable should
 * be reintroduced at that point rather than carried in the meantime.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * This service's own `.env`, resolved relative to this file rather than to
 * `process.cwd()`.
 *
 * `apps/api/.env` and not the repo root: the API owns its environment, and so does
 * the mobile app (`mobile/.env`, which is where Expo looks for it). Neither reads
 * the other's, so there is no shared file for the two to disagree about, and no
 * secret that has to be copied between them.
 */
const ENV_PATH = resolve(import.meta.dirname, "../.env");

/**
 * Read this service's `.env` into `process.env` without overwriting anything the
 * environment already provides.
 *
 * Real environment variables win over the file, so a deployed container can
 * inject secrets at runtime and still ship the same `.env` for local work.
 */
function loadEnvFile(): void {
  if (!existsSync(ENV_PATH)) {
    // Not fatal. In production the variables come from the platform's
    // environment and there is no file to read; the validation below decides
    // whether the process can actually start.
    return;
  }

  if (typeof process.loadEnvFile === "function") {
    process.loadEnvFile(ENV_PATH);
    return;
  }

  throw new Error(
    "process.loadEnvFile is unavailable. The Gochi API needs Node 20.12 or newer " +
      `(found ${process.versions.node}).`,
  );
}

loadEnvFile();

/** A variable the API refuses to start without. */
type RequiredVar =
  | "DATABASE_URL"
  | "API_JWT_SECRET"
  | "EXPO_PUBLIC_PRIVY_APP_ID";

/**
 * Collect every problem before reporting, rather than failing on the first.
 * Getting the full list in one run turns a slow fix-rebuild loop into a single
 * edit.
 */
function collectMissing(keys: readonly RequiredVar[]): string[] {
  return keys.filter((key) => !process.env[key]?.trim());
}

const missing = collectMissing([
  "DATABASE_URL",
  "API_JWT_SECRET",
  "EXPO_PUBLIC_PRIVY_APP_ID",
]);

if (missing.length > 0) {
  throw new Error(
    `Gochi API cannot start: missing required environment ${
      missing.length === 1 ? "variable" : "variables"
    } ${missing.join(", ")}.\n` +
      `Copy .env.example to .env in apps/api and fill them in, or inject ` +
      `them as real environment variables.`,
  );
}

/**
 * `.env` holds both `EXPO_PUBLIC_` and server-only names, so guard against the
 * one mistake that would publish a secret: a server secret named with the
 * public prefix. Reading one here would be harmless, but its presence in the
 * file means Expo has already inlined it into the shipped bundle.
 */
const publicLeaked = Object.keys(process.env).filter(
  (key) =>
    key.startsWith("EXPO_PUBLIC_") &&
    /SECRET|PRIVATE|KEYPAIR|PASSWORD|TOKEN/.test(key),
);

if (publicLeaked.length > 0) {
  throw new Error(
    `Refusing to start: ${publicLeaked.join(", ")} looks like a server secret ` +
      "but uses the EXPO_PUBLIC_ prefix. Expo inlines those into the app " +
      "bundle, so they are readable by anyone who unpacks the APK. Rename the " +
      "variable to drop the prefix.",
  );
}

/**
 * Read a required variable.
 *
 * Throws a named error rather than trusting `collectMissing` to have caught it.
 * That pre-check and the `required()` calls below are two separate lists, and
 * they did drift: `EXPO_PRIVATE_PRIVY_APP_SECRET` was passed to `required()`
 * without being listed for pre-checking, so a host that correctly omitted it got
 * `TypeError: Cannot read properties of undefined (reading 'trim')` from the `!`
 * assertion instead of a message naming the variable. The `!` was the bug — it
 * asserted something the code had not actually established.
 */
function required(key: RequiredVar): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(
      `Gochi API cannot start: ${key} is missing or empty. ` +
        "Set it in the environment, or in apps/api/.env for local work.",
    );
  }
  return value;
}

/** Read an optional variable, treating blank as absent. */
function optional(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

export const env = {
  /** Postgres connection string. */
  databaseUrl: required("DATABASE_URL"),

  /**
   * Pooled Postgres connection string, used by the running server when present.
   * Neon poolers terminate idle connections, so a long-lived server should
   * prefer the pooled URL and keep the direct one for migrations, which need to
   * run DDL outside the pool.
   */
  databaseUrlPooled: optional("DATABASE_URL_POOLED"),

  /** Secret used to sign and verify session JWTs. */
  jwtSecret: required("API_JWT_SECRET"),

  /**
   * Privy App ID.
   *
   * A public identifier, so it keeps the `EXPO_PUBLIC_` prefix even server-side —
   * it is the same value the app sends. The server needs it to pin the access
   * token's audience, which is what stops a token minted for a different Privy
   * app from authenticating here.
   */
  privyAppId: required("EXPO_PUBLIC_PRIVY_APP_ID"),

  /** Helius dashboard key. Required from P7, when activity ingestion begins. */
  heliusApiKey: optional("HELIUS_API_KEY"),

  /**
   * The Solana keypair that pays for companion mints, as base64.
   *
   * The transport is an env variable rather than a file path because the API has
   * to run in two places with opposite needs: a laptop, where a keyfile on disk
   * is natural and keeps the secret out of shell history, and a host, where the
   * filesystem has no such file and baking one into an image would put a funded
   * wallet into git history permanently. One variable serves both.
   *
   * A Solana keyfile is a JSON array of 64 bytes, so this is base64 of that JSON
   * *text* — not of the raw bytes. Produce it with:
   *
   *     base64 -w0 ~/.config/solana/id.json
   *
   * Read lazily by the mint module and never logged. Optional as a variable so
   * the API still boots with no payer configured — identity, the engine and every
   * read route work without one, and minting reports its own failure.
   */
  payerSecretKeyBase64: optional("PAYER_SECRET_KEY_BASE64"),

  /** Solana JSON RPC endpoint. */
  solanaRpcUrl: optional("SOLANA_RPC_URL") ?? "https://api.devnet.solana.com",

  /**
   * Mainnet RPC, for reads that must hit mainnet whatever the working cluster
   * is.
   *
   * Genesis Token verification and `.skr` resolution both need it: an SGT exists
   * only on mainnet, so a devnet endpoint reports every wallet as having no
   * device, and ANS has no devnet accounts so every `.skr` name comes back
   * unresolved. Both are confident wrong answers rather than errors. Kept
   * separate from `solanaRpcUrl` so a devnet default cannot silently break them.
   */
  solanaMainnetRpcUrl:
    optional("SOLANA_MAINNET_RPC_URL") ?? "https://api.mainnet-beta.solana.com",

  /** Address the API listens on. */
  port: Number(process.env.PORT ?? 8787),

  /** Set when running a local dev build against the handset. */
  nodeEnv: process.env.NODE_ENV ?? "development",
} as const;

export type Env = typeof env;
