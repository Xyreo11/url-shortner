import { redis } from "../config/redis.js";

/**
 * rateLimit(key, limit, windowSeconds)
 * Example:
 *   rateLimit("rl:create:IP", 10, 60)
 */
export async function rateLimit(key, limit, windowSeconds) {
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }

  return count <= limit;
}
