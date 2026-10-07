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
 * The ceiling is deliberately low. Neon free tier allows a small pool, and
 * raising this without raising Neon's own connection limit is the fastest way to
 * get "too many connections" in production. Two rather than one so a long-running
 * read cannot block a write behind it; overridable because the right number
 * depends on the plan, and a suite that opens a connection per test will exhaust a
 * pool sized for production traffic.
 */
function getAppClient(): postgres.Sql {
  if (!appClient) {
    appClient = postgres(env.databaseUrlPooled ?? env.databaseUrl, {
      max: Number(process.env.DB_POOL_MAX ?? 2),
      // Neon terminates idle server-side connections. Without a keepalive the
      // pool hands out a socket the pooler has already closed, which surfaces
      // as an intermittent "Connection terminated" on otherwise idle routes.
      // Neon's pooler drops idle server-side connections. Without these the pool
      // hands out a socket the far end has already closed, which surfaces as an
      // intermittent connect timeout rather than as a query error — so a suite
      // that runs for a minute fails at random and looks like a network problem.
      idle_timeout: 20,
      // 60s, not the usual 30. With `idle_timeout: 20` the pool discards a socket
      // well before Neon does, so a later query re-handshakes TLS against a
      // backend that may have been parked for a while — and that handshake
      // intermittently took longer than 30s. It surfaced as connect ETIMEDOUT
      // on tests that had been idle, which reads as a network fault rather than
      // as a too-impatient timeout. A slow connect is recoverable; a failed one
      // is not.
      connect_timeout: 60,
      // Hold the connection open between suites. The default lets it go idle
      // during a slow test, and re-establishing it costs a TLS handshake each time.
      keep_alive: 30,
      max_lifetime: 60 * 30,
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
