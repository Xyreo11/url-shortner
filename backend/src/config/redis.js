import { createClient } from "redis";
import { config } from "./env.js";

export const redis = createClient({ url: config.REDIS_URL });

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
