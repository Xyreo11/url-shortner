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
redis.on("error", (err) => {
  console.error("[redis] client error:", err.message);
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
export function connectRedis() {
  if (!connectPromise) {
    connectPromise = redis.connect().catch((err) => {
      console.error("[redis] initial connect failed:", err.message);
    });
  }
  return connectPromise;
}

export async function closeRedis() {
  if (redis.isOpen) await redis.quit();
}
