import { redis } from "../config/redis.js";
import { counters } from "./metrics.js";

const DEFAULT_TTL_S = 3600;

/**
 * Reads a cached value, or null.
 *
 * A Redis failure returns null, which callers already treat as a miss and
 * follow with a Postgres read. Previously the redis.get call sat OUTSIDE the
 * try block, so an unreachable Redis threw straight through resolveUrl and
 * into the redirect handler's catch, and every redirect answered 500. That
 * defeats the point of cache-aside: losing the cache should cost latency,
 * not availability.
 */
export async function cacheGet(key) {
  try {
    counters.redisCommands += 1;
    const value = await redis.get(key);

    if (value !== null) counters.l2Hits += 1;
    else counters.cacheMisses += 1;

    // Instrumentation must never be able to break a read, so it gets its own
    // guard. It is still awaited here; that round trip is dealt with
    // separately as a performance change.
    try {
      counters.redisCommands += 1;
      await redis.incr(value !== null ? "cache:hits" : "cache:misses");
    } catch {
      /* counters are best effort */
    }

    return value;
  } catch (err) {
    console.error("[cache] read failed, treating as a miss:", err.message);
    return null;
  }
}

/**
 * Writes a cached value. Failure is logged and swallowed: the source of truth
 * is Postgres, and a cache write that did not happen is a future miss, not an
 * error worth failing the request over.
 */
export async function cacheSet(key, value, ttlSeconds = DEFAULT_TTL_S) {
  try {
    counters.redisCommands += 1;
    await redis.set(key, value, { EX: ttlSeconds });
  } catch (err) {
    console.error("[cache] write failed:", err.message);
  }
}
