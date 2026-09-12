// src/services/url.service.js
import { findByLongUrl, insertUrl, findByShortCode } from "../models/url.model.js";
import { generateShortCode } from "../utils/hasher.js";
import { cacheGet, cacheSet } from "../utils/cache.js";
import { rateLimit } from "../utils/rateLimiter.js";
import { isBlacklisted } from "../utils/blacklist.js";
import { normalizeUrl, isValidUrl, isValidAlias } from "../utils/validator.js";
import { config } from "../config/env.js";

// Bounded so a pathological case cannot loop forever. With a 62^8 keyspace,
// needing a second attempt is already vanishingly unlikely.
const MAX_CODE_ATTEMPTS = 5;

// --------------------------------------------------
// CREATE / SHORTEN URL
// --------------------------------------------------
export async function shortenUrl(longUrl, alias, ip, ownerEmail = null) {
  const allowed = await rateLimit(
    `rl:create:${ip}`,
    config.RATE_LIMIT_CREATE_MAX,
    config.RATE_LIMIT_CREATE_WINDOW_S
  );
  if (!allowed) {
    // Carries its own status so the route does not report a throttled request
    // as a 400 Bad Request, which tells the caller nothing useful.
    const err = new Error("Rate limit exceeded");
    err.status = 429;
    throw err;
  }

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

  // Normalise and percent-encode once, here, and store the encoded form.
  //
  // The redirect path writes this value straight into a Location header, so
  // doing the encoding at write time means the read path is a pure
  // passthrough. It also moves the cost from once per redirect to once per
  // creation, which given the read/write ratio is roughly a hundredfold
  // fewer times.
  longUrl = new URL(longUrl).toString();

  if (await isBlacklisted(longUrl)) {
    throw new Error("This domain is blacklisted");
  }

  if (alias) {
    // No check-then-act. The previous version did findByShortCode then
    // insertUrl, and two concurrent requests for the same alias both passed
    // the check. The unique constraint arbitrates instead: no row back means
    // somebody else already has it.
    const claimed = await insertUrl(longUrl, alias, ownerEmail);
    if (!claimed) throw new Error("Alias already taken");

    await cacheSet(`short:${alias}`, longUrl);
    return alias;
  }

  // Dedupe is per owner, so the cache key must be too, or one user's link
  // would be served to another from cache even after the SQL was scoped.
  const dedupeKey = `long:${ownerEmail ?? "anon"}:${longUrl}`;

  const cached = await cacheGet(dedupeKey);
  if (cached) return cached;

  const existing = await findByLongUrl(longUrl, ownerEmail);
  if (existing) {
    await cacheSet(`short:${existing.short_code}`, existing.long_url);
    await cacheSet(dedupeKey, existing.short_code);
    return existing.short_code;
  }

  // Retry on code collision. generateShortCode is seeded with random bytes,
  // so each attempt is genuinely different.
  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
    const candidate = generateShortCode(longUrl);
    const shortCode = await insertUrl(longUrl, candidate, ownerEmail);

    if (shortCode) {
      await cacheSet(dedupeKey, shortCode);
      await cacheSet(`short:${shortCode}`, longUrl);
      return shortCode;
    }

    // The code was taken. That is almost always a genuine collision, but it
    // can also mean a concurrent request for this same URL won the race, so
    // check before burning another attempt.
    const raced = await findByLongUrl(longUrl, ownerEmail);
    if (raced) return raced.short_code;
  }

  throw new Error("Could not allocate a short code, please try again");
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
