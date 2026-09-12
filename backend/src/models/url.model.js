import { db } from "../config/db.js";

/**
 * Finds an existing short code for this destination, scoped to the owner.
 *
 * The owner scope is a correctness fix, not a refinement: without it, user B
 * shortening a URL that user A had already shortened was handed A's code, so
 * B's dashboard showed a link B did not create and A's click counts absorbed
 * B's traffic.
 *
 * IS NOT DISTINCT FROM rather than = because owner_email is NULL for
 * anonymous links, and NULL = NULL is NULL, not true. Anonymous links
 * therefore deduplicate among themselves and never against a user's links.
 */
export async function findByLongUrl(longUrl, ownerEmail = null) {
  const res = await db.query(
    `SELECT * FROM urls
     WHERE long_url = $1
       AND owner_email IS NOT DISTINCT FROM $2
     LIMIT 1`,
    [longUrl, ownerEmail]
  );
  return res.rows[0];
}

/**
 * Only the columns a caller actually uses.
 *
 * SELECT * dragged long_url, short_code, created_at, click_count,
 * owner_email and id through the driver's row parser on the main thread for
 * every cache miss, when the redirect path reads exactly one of them.
 */
export async function findByShortCode(code) {
  const res = await db.query(
    "SELECT short_code, long_url FROM urls WHERE short_code = $1 LIMIT 1",
    [code]
  );
  return res.rows[0];
}

/**
 * Inserts a link, letting the database arbitrate code collisions.
 *
 * Returns the short code on success, or null when the code was already taken.
 * The caller decides what that means: a regenerated code should be retried,
 * a user-supplied alias should be reported as taken.
 *
 * Previously a bare INSERT with no ON CONFLICT and no RETURNING. A duplicate
 * short_code raised a raw Postgres error that surfaced to the client as a 400
 * containing the constraint name, and the caller had no way to know what had
 * actually been written.
 */
export async function insertUrl(longUrl, shortCode, ownerEmail = null) {
  const res = await db.query(
    `INSERT INTO urls (long_url, short_code, owner_email)
     VALUES ($1, $2, $3)
     ON CONFLICT (short_code) DO NOTHING
     RETURNING short_code`,
    [longUrl, shortCode, ownerEmail]
  );
  return res.rows[0]?.short_code ?? null;
}
