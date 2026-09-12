import { createClient } from "redis";
import { config } from "./env.js";

export const redis = createClient({
  url: config.REDIS_URL,

  // Critical for the cache-aside fallback to work at all.
  //
  // By default node-redis QUEUES commands issued while the connection is down
  // and replays them on reconnect. So `await redis.get()` does not reject when
  // Redis is unreachable, it simply never settles, and a try/catch around it
  // can never fire. Measured before this was set: a redirect during a Redis
  // outage returned nothing at all rather than falling through to Postgres.
  //
  // With the offline queue disabled, commands fail fast while disconnected,
  // the caller catches, treats it as a miss, and serves from Postgres.
  disableOfflineQueue: true,

  socket: {
    connectTimeout: 3000,
    // Capped backoff, and it never gives up: this is a cache, so it should
    // rejoin by itself when Redis comes back.
    reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
  },
});

// node-redis emits 'error' on connection trouble. An 'error' event with no
// listener is an unhandled error and terminates the process, so this must
// exist even though it only logs. The client reconnects on its own.
//
// Throttled: with the reconnect strategy below, an unreachable Redis emits an
// error every few hundred milliseconds, and an unthrottled handler turns a
// cache outage into gigabytes of logs.
let lastErrorLoggedAt = 0;
const ERROR_LOG_INTERVAL_MS = 30000;

redis.on("error", (err) => {
  const now = Date.now();
  if (now - lastErrorLoggedAt < ERROR_LOG_INTERVAL_MS) return;
  lastErrorLoggedAt = now;
  console.error("[redis] client error:", err.message || err.code || String(err));
});

redis.on("ready", () => {
  lastErrorLoggedAt = 0;
  console.log("[redis] connected");
});

let connectPromise = null;

/**
 * Idempotent connect. The previous version was fire-and-forget, so early
 * requests could reach a client that was not ready yet and there was no way
 * for a caller to know whether the connection had been established.
 *
 * Deliberately resolves rather than rejects on failure: Redis is a cache, and
 * the application is expected to serve from Postgres without it. /health
 * reports the real state.
 */
export function connectRedis({ timeoutMs = 3000 } = {}) {
  if (!connectPromise) {
    const attempt = redis.connect().catch((err) => {
      console.error("[redis] initial connect failed:", err.message || err.code);
    });

    // Bounded, and this bound is load-bearing.
    //
    // The reconnect strategy below never gives up, which is right for a cache
    // but means redis.connect() does not REJECT when Redis is simply absent.
    // It never settles at all. Awaiting it unbounded meant the process hung
    // before app.listen and the service could not start without Redis --
    // exactly the dependency the cache-aside fallback exists to avoid.
    // Measured: with Redis stopped, the app printed connection errors forever
    // and never bound its port.
    //
    // Now startup proceeds, the client keeps reconnecting in the background,
    // and /health reports the real state.
    connectPromise = Promise.race([
      attempt,
      new Promise((resolve) => {
        const t = setTimeout(() => {
          console.warn(
            `[redis] not ready after ${timeoutMs}ms, starting anyway and serving from Postgres`
          );
          resolve();
        }, timeoutMs);
        t.unref();
      }),
    ]);
  }
  return connectPromise;
}

export async function closeRedis() {
  if (redis.isOpen) await redis.quit();
}
