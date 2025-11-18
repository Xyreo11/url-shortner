import { redis } from "../config/redis.js";

export async function cacheGet(key) {
  const v = await redis.get(key);
  try {
    if (v !== null) {
      await redis.incr("cache:hits");
      return v;
    } else {
      await redis.incr("cache:misses");
      return null;
    }
  } catch (e) {
    // if redis counters fail, still return value
    return v;
  }
}

export async function cacheSet(key, value) {
  await redis.set(key, value, { EX: 3600 }); // 1 hr cache
}
