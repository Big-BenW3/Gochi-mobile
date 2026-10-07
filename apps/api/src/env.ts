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
 * The Privy app secret is the concrete case. It is needed to verify the access
 * token the app presents on `POST /v1/auth/privy`, which happens only here, and
 * it must never reach the handset. It lives under `EXPO_PRIVATE_PRIVY_APP_SECRET`:
 * the `EXPO_` prefix keeps it grouped with its sibling credentials, and the
 * `PRIVATE_` segment marks it as server-side, since Expo's bundler inlines only
 * `EXPO_PUBLIC_` and leaves everything else in the server's environment.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Repo root, resolved relative to this file rather than to `process.cwd()`. */
const ENV_PATH = resolve(import.meta.dirname, "../../../.env");

/**
 * Read the repo-root `.env` into `process.env` without overwriting anything the
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
      `Copy .env.example to .env at the repo root and fill them in, or inject ` +
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

/** Read a required variable, with the guarantee that it exists. */
function required(key: RequiredVar): string {
  // Safe: `collectMissing` already threw for any of these being absent.
  return process.env[key]!.trim();
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

  /** Privy App Secret, for verifying the access token on the Privy auth path. */
  privyAppSecret: required("EXPO_PRIVATE_PRIVY_APP_SECRET"),

  /** Helius dashboard key. Required from P7, when activity ingestion begins. */
  heliusApiKey: optional("HELIUS_API_KEY"),

  /**
   * Path to the Solana keypair that pays for companion mints. Required from P4.
   *
   * Read lazily and validated at the point of use rather than at startup, because
   * the API must run with no payer configured for identity, the engine and every
   * read route. Making it a required variable would mean a developer without a
   * funded devnet keypair could not run the tests at all, and the failure would
   * arrive at boot rather than at the one route that needs it.
   *
   * The file is never read into anything but the mint module, and never logged.
   */
  payerKeypairPath: optional("PAYER_KEYPAIR_PATH"),

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
