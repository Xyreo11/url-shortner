import { db } from "../config/db.js";
import { redis } from "../config/redis.js";
import { counters } from "./metrics.js";
import { config } from "../config/env.js";
import { URL } from "url";

/**
 * Is this destination's hostname on the blacklist?
 *
 * Fails CLOSED. If the check itself cannot be completed, the link is refused.
 * That is the opposite of the rate limiter, which fails open, and the reason
 * differs: the limiter protects the service from users, so locking everyone
 * out over an infrastructure fault is worse than briefly allowing extra
 * traffic. This protects users from malicious destinations, so shortening a
 * link we could not verify is worse than refusing it.
 */
export async function isBlacklisted(url) {
  let hostname;

  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false; // not a parseable URL; validation rejects it separately
  }

  const key = `bl:${hostname}`;

  // 1. Cache. A Redis failure here is not fatal: fall through to Postgres.
  try {
    counters.redisCommands += 1;
    const cached = await redis.get(key);
    if (cached !== null) return cached === "1";
  } catch (err) {
    console.error("[blacklist] cache read failed:", err.message);
  }

  // 2. Source of truth. A failure here IS fatal, by design.
  const result = await db.query(
    "SELECT 1 FROM blacklist WHERE domain = $1 LIMIT 1;",
    [hostname]
  );
  const isBlocked = result.rows.length > 0;

  // 3. Cache both verdicts, WITH an expiry.
  //
  // The previous version called redis.set with two arguments and no TTL,
  // unlike every other cache write in the codebase. Once a hostname was
  // cached as allowed it stayed allowed forever, so adding a domain to the
  // blacklist table had no effect until Redis was flushed.
  try {
    await redis.set(key, isBlocked ? "1" : "0", { EX: config.BLACKLIST_TTL_S });
  } catch (err) {
    console.error("[blacklist] cache write failed:", err.message);
  }

  return isBlocked;
}
