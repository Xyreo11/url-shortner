import { redis } from "../config/redis.js";

export async function cacheGet(key) {
  return await redis.get(key);
}

export async function cacheSet(key, value) {
  await redis.set(key, value, { EX: 3600 }); // 1 hr cache
}
