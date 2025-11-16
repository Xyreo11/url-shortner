import { db } from "../config/db.js";
import { redis } from "../config/redis.js";
import { URL } from "url";

export async function isBlacklisted(url) {
  let hostname;

  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;  // invalid URL, not blacklist
  }

  console.log("🔍 BLACKLIST CHECK:", hostname);

  // 1. Check Redis cache
  const cached = await redis.get(`bl:${hostname}`);
  if (cached !== null) {
    return cached === "1";
  }

  // 2. Check Postgres
  const result = await db.query(
    "SELECT 1 FROM blacklist WHERE domain = $1 LIMIT 1;",
    [hostname]
  );

  const isBlocked = result.rows.length > 0;

  // 3. Save in Redis (cache both allowed and blocked)
  await redis.set(`bl:${hostname}`, isBlocked ? "1" : "0");

  return isBlocked;
}
