/**
 * drizzle-kit configuration.
 *
 * Two things here are load-bearing and easy to get wrong.
 *
 * The schema path points at `src/db/schema.ts` rather than a barrel file,
 * because drizzle-kit reads the file's exports directly. Pointing it at an
 * `index.ts` that re-exports everything produces a schema with no tables and
 * migrations that silently do nothing.
 *
 * The dialect is `postgresql` and the dbCredentials use the *direct* Neon URL,
 * never the pooled one. Migrations run DDL, and the pooler does not reliably
 * keep a session pinned to one backend, so a pooled migration can deadlock or
 * execute against a different server than the one it inspected.
 */

import { defineConfig } from "drizzle-kit";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Directory of this config file.
 *
 * drizzle-kit bundles the config to CommonJS, where `import.meta.dirname` is
 * `undefined` at runtime even though the type-checks fine. `__dirname` works in
 * that output; the `fileURLToPath` branch covers being loaded as real ESM.
 */
const here =
  typeof __dirname === "string"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));

/**
 * Read a variable from the repo-root `.env`.
 *
 * drizzle-kit runs outside the API process, so it cannot import `../env.js` —
 * that module validates the whole runtime environment and would fail the CLI
 * for variables the migration does not care about. This reads one key, and
 * falls back to the process environment so CI can inject it instead.
 */
function readEnv(key: string): string | undefined {
  const fromProcess = process.env[key]?.trim();
  if (fromProcess) return fromProcess;

  // Lazily so the CLI still works if the file is absent, e.g. in CI.
  // Two levels up from apps/api reaches the repo root. (`src/env.ts` needs
  // three because it sits one directory deeper.)
  const envPath = resolve(here, "../../.env");
  if (!existsSync(envPath)) return undefined;

  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match && match[1] === key) {
      return match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return undefined;
}

const databaseUrl = readEnv("DATABASE_URL");

if (!databaseUrl) {
  throw new Error(
    "drizzle-kit needs DATABASE_URL. Copy .env.example to .env at the repo root.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl,
  },
  // `esbuild` bundles the TypeScript schema without needing a build step.
  verbose: true,
  strict: true,
});
