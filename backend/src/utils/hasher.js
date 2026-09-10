import crypto from "crypto";

/**
 * Generates an 8-character short code.
 *
 * Deliberately NOT deterministic: the same URL yields a different code on
 * every call. Deduplication is therefore an explicit lookup plus the unique
 * constraint on short_code, never a property of this function.
 *
 * The random component matters. Previously the only varying input was
 * Date.now(), which has millisecond resolution, so two calls inside the same
 * millisecond produced identical codes. That made the collision retry loop in
 * url.service.js useless in exactly the case it exists for: a retry landing
 * immediately after a conflict would regenerate the code that just collided.
 */
export function generateShortCode(url) {
  const entropy = crypto.randomBytes(8).toString("hex");

  return crypto
    .createHash("sha256")
    .update(url + Date.now() + entropy)
    .digest("base64")
    .replace(/[^a-zA-Z0-9]/g, "")
    .substring(0, 8);
}
