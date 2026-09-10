import { redis } from "../config/redis.js";

/**
 * Sliding-window rate limit. Returns true when the request is allowed.
 *
 * Replaces an INCR followed by a conditional EXPIRE, which had two problems.
 *
 * It was not atomic. Those were separate round trips, so a crash or a Redis
 * error between them left the key with no TTL at all, and that client was
 * rate limited permanently.
 *
 * It was a fixed window. With a limit of 10 per minute, a client could send
 * 10 at 11:59:59 and 10 more at 12:00:01: twice the limit in two seconds.
 *
 * A sorted set scored by timestamp fixes both. Everything older than the
 * window is trimmed, this request is added, and the remaining cardinality is
 * the count. All four commands go in one MULTI, so it is still a single round
 * trip and cannot half-apply.
 *
 * Fails OPEN. If Redis is unreachable the request is allowed, because a brief
 * window of unlimited traffic is less damaging than locking every user out
 * over a cache outage. The blacklist check deliberately does the opposite: it
 * protects users from bad destinations rather than protecting the service
 * from users.
 */
export async function rateLimit(key, limit, windowSeconds) {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  try {
    const results = await redis
      .multi()
      .zRemRangeByScore(key, 0, windowStart)
      // The member must be unique, or two requests in the same millisecond
      // collapse into one entry and the count is short.
      .zAdd(key, [{ score: now, value: `${now}-${Math.random()}` }])
      .zCard(key)
      // Always set, so the key cannot outlive its window.
      .expire(key, windowSeconds + 1)
      .exec();

    // Index 2 is the zCard result: entries inside the window, including this
    // one. A rejected request still counts, so a client that keeps hammering
    // stays blocked rather than being admitted the moment the window rolls.
    const count = Number(results[2]);
    return count <= limit;
  } catch (err) {
    console.error("[rateLimit] check failed, allowing request:", err.message);
    return true;
  }
}
