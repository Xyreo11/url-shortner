// src/services/url.service.js
import { findByLongUrl, insertUrl, findByShortCode } from "../models/url.model.js";
import { generateShortCode } from "../utils/hasher.js";
import { cacheGet, cacheSet } from "../utils/cache.js";
import { rateLimit } from "../utils/rateLimiter.js";
import { isBlacklisted } from "../utils/blacklist.js";
import { normalizeUrl, isValidUrl, isValidAlias } from "../utils/validator.js";
import { config } from "../config/env.js";

// --------------------------------------------------
// CREATE / SHORTEN URL
// --------------------------------------------------
export async function shortenUrl(longUrl, alias, ip, ownerEmail = null) {
  const allowed = await rateLimit(
    `rl:create:${ip}`,
    config.RATE_LIMIT_CREATE_MAX,
    config.RATE_LIMIT_CREATE_WINDOW_S
  );
  if (!allowed) throw new Error("Rate limit exceeded");

  if (typeof longUrl !== "string" || longUrl.trim() === "") {
    throw new Error("A URL is required");
  }

  // isValidUrl and isValidAlias existed in utils/validator.js but were never
  // imported anywhere, so any string at all was accepted as a destination and
  // an alias could be any length or charset. Cheap in-process checks run
  // before the blacklist and dedupe lookups, which both cost round trips.
  if (alias !== undefined && alias !== null && alias !== "" && !isValidAlias(alias)) {
    throw new Error("Invalid alias: use 3-50 characters from A-Z, 0-9, dot, dash or underscore");
  }

  longUrl = normalizeUrl(longUrl);

  if (!isValidUrl(longUrl)) {
    throw new Error("Invalid URL");
  }

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
