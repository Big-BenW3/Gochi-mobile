/**
 * Database connection.
 *
 * Two clients, because Neon is two things at once. The pooler URL multiplexes
 * over a single server-side connection, which is what a long-lived API process
 * wants — opening a fresh Postgres connection per request exhausts the free
 * tier's connection budget within minutes. The direct URL is reserved for
 * migrations, which run DDL and must not sit in the pool.
 *
 * The migration client is lazy: importing this module must not require a
 * reachable database, or `drizzle-kit generate` would fail for a purely local
 * schema change.
 */

import { drizzle as drizzleNodePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "../env.js";
import * as schema from "./schema.js";

export const schema_ = schema;

let appClient: ReturnType<typeof postgres> | undefined;
let appDb: ReturnType<typeof drizzleNodePostgres<typeof schema>> | undefined;

/**
 * The pooled client used by the running server.
 *
 * `max: 1` is deliberate. Neon free tier allows a small pool, and a single
 * connection serialises requests, which is acceptable for a V1 where the only
 * hot path is auth. Raising this without raising the Neon's connection limit is
 * the fastest way to get "too many connections" errors in production.
 */
function getAppClient(): postgres.Sql {
  if (!appClient) {
    appClient = postgres(env.databaseUrlPooled ?? env.databaseUrl, {
      max: 1,
      // Neon terminates idle server-side connections. Without a keepalive the
      // pool hands out a socket the pooler has already closed, which surfaces
      // as an intermittent "Connection terminated" on otherwise idle routes.
      idle_timeout: 20,
      connect_timeout: 10,
      // Drizzle sends Date objects; postgres.js parses timestamptz as strings
      // by default, which would make every timestamp a string in the app.
      types: {
        // Keep drizzle's own transforms authoritative.
        bigint: postgres.BigInt,
      },
      onnotice: () => {},
    });
  }
  return appClient;
}

/** The request-path database handle. */
export function getDb() {
  if (!appDb) {
    appDb = drizzleNodePostgres(getAppClient(), { schema });
  }
  return appDb;
}

/**
 * A direct (unpooled) connection for migrations.
 *
 * DDL inside a pooler transaction is unreliable — the pooler does not always
 * keep the session on the same backend, so `CREATE INDEX CONCURRENTLY` and
 * friends can deadlock or land on a different server. Migrations get their own
 * connection for that reason.
 */
export function createMigrationClient(): postgres.Sql {
  return postgres(env.databaseUrl, { max: 1, onnotice: () => {} });
}

/** Close the pooled client. Used on server shutdown. */
export async function closeDb(): Promise<void> {
  if (appClient) {
    await appClient.end({ timeout: 5 });
    appClient = undefined;
    appDb = undefined;
  }
}

export { schema };
