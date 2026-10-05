/**
 * Gochi API — server entry point.
 *
 * The only module that opens a port. The app itself lives in `app.ts` so tests
 * can import and exercise it without a listener.
 */

import { serve } from "@hono/node-server";

import { app } from "./app.js";
import { closeDb } from "./db/client.js";
import { env } from "./env.js";
import { logger } from "./core/logging.js";

/**
 * Binds 0.0.0.0 so a handset on the same network can reach it during
 * development — the mobile app talks to this over the LAN, not over loopback.
 * A production deployment should sit behind a proxy rather than expose a
 * listener on every interface.
 */
export function start(port: number = env.port) {
  const server = serve({ fetch: app.fetch, port, hostname: "0.0.0.0" });
  logger.info("server.listening", { port });

  let shuttingDown = false;
  const shutdown = () => {
    // A second Ctrl-C should not re-enter: closing the pool twice logs noise and
    // the process is already on its way out.
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info("server.shutdown");
    server.close();
    void closeDb().finally(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return server;
}

start();
