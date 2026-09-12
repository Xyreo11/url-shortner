// src/index.js
//
// Process entry point: connect dependencies, listen, shut down cleanly.
// Application wiring lives in src/app.js.

import { createApp } from "./app.js";
import { config } from "./config/env.js";
import { closeDb } from "./config/db.js";
import { connectRedis, closeRedis } from "./config/redis.js";
import { startClickFlusher, drainClickBuffer } from "./services/clickBuffer.js";
import { startNearCacheRotation } from "./utils/nearCache.js";

const isCLI = process.argv.length > 2;

if (isCLI) {
  const url = process.argv[2];
  const alias = process.argv[3] || null;
  const { cliInput } = await import("./routes/cli.js");
  await cliInput(url, alias);
} else {
  // Resolves even if Redis is unreachable, so the app still starts and serves
  // from Postgres. /health reports the real state.
  await connectRedis();

  const app = createApp();

  // Drains the click buffer on a timer, off the request path.
  startClickFlusher();
  startNearCacheRotation();

  const server = app.listen(config.PORT, () => {
    console.log(`[${config.APP_NAME}] listening on port ${config.PORT}`);
  });

  server.on("error", (err) => {
    console.error("[server] failed to start:", err.message);
    process.exit(1);
  });

  // Without this, a container stop kills in-flight requests and leaves
  // pool connections open. It also gives buffered work a chance to drain.
  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[${config.APP_NAME}] ${signal} received, shutting down`);

    server.close(async () => {
      try {
        // Buffered clicks must reach Postgres BEFORE the pool closes.
        await drainClickBuffer();
        await closeRedis();
        await closeDb();
      } catch (err) {
        console.error("[shutdown] error closing connections:", err.message);
      }
      process.exit(0);
    });

    // Release keep-alive sockets so server.close can actually fire. Without
    // this it waits out keepAliveTimeout on every idle connection, which a
    // load generator holds open, and the drain sits behind that wait until
    // the force-exit timer below kills the process with clicks still buffered.
    if (typeof server.closeIdleConnections === "function") {
      server.closeIdleConnections();
    }

    // Do not hang forever on a stuck connection.
    setTimeout(() => {
      console.error("[shutdown] forced exit after timeout");
      process.exit(1);
    }, 10000).unref();
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
