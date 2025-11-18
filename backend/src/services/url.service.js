// src/services/url.service.js
import { findByLongUrl, insertUrl, findByShortCode } from "../models/url.model.js";
import { generateShortCode } from "../utils/hasher.js";
import { cacheGet, cacheSet } from "../utils/cache.js";
import { rateLimit } from "../utils/rateLimiter.js";
import { isBlacklisted } from "../utils/blacklist.js";
import { normalizeUrl } from "../utils/validator.js";

// --------------------------------------------------
// CREATE / SHORTEN URL
// --------------------------------------------------
export async function shortenUrl(longUrl, alias, ip, ownerEmail = null) {
  const allowed = await rateLimit(`rl:create:${ip}`, 10, 60);
  if (!allowed) throw new Error("Rate limit exceeded");

  longUrl = normalizeUrl(longUrl);

  if (await isBlacklisted(longUrl)) {
    throw new Error("This domain is blacklisted");
  }

  if (alias) {
    const existing = await findByShortCode(alias);
    if (existing) throw new Error("Alias already taken");

    await insertUrl(longUrl, alias, ownerEmail);
    await cacheSet(`short:${alias}`, longUrl);
    return alias;
  }

  const cached = await cacheGet(`long:${longUrl}`);
  if (cached) return cached;

  const existing = await findByLongUrl(longUrl);
  if (existing) {
    await cacheSet(`short:${existing.short_code}`, existing.long_url);
    return existing.short_code;
  }

  const shortCode = generateShortCode(longUrl);

  await insertUrl(longUrl, shortCode, ownerEmail);
  await cacheSet(`long:${longUrl}`, shortCode);
  await cacheSet(`short:${shortCode}`, longUrl);

  console.log("Generated shortCode =", shortCode, "TYPE =", typeof shortCode, "ownerEmail=", ownerEmail);

  return shortCode;
}

// --------------------------------------------------
// RESOLVE SHORT URL
// --------------------------------------------------
export async function resolveUrl(shortCode) {
  const cached = await cacheGet(`short:${shortCode}`);
  if (cached) return cached;

  const data = await findByShortCode(shortCode);
  if (!data) return null;

  await cacheSet(`short:${shortCode}`, data.long_url);

  return data.long_url;
}
