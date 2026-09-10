// src/models/user.model.js
import { db } from "../config/db.js";

// The only columns that may ever reach an HTTP response. Every selector that
// feeds a route returns exactly these. password_hash is deliberately absent.
const PUBLIC_COLS = "id, email, name, role, avatar_url, created_at";

/**
 * Includes password_hash because login has to compare against it.
 * Callers must pick fields explicitly; never serialise the result directly.
 */
export async function findUserByEmail(email) {
  const res = await db.query(
    `SELECT ${PUBLIC_COLS}, password_hash FROM users WHERE email = $1 LIMIT 1`,
    [email]
  );
  return res.rows[0] || null;
}

/**
 * Safe to serialise. This is the one that routes use.
 *
 * It previously selected password_hash as well, and updateUserProfile returned
 * it straight to res.json, so PUT /api/user/profile responded with the caller's
 * bcrypt hash. Splitting the two queries is what stops that recurring: a
 * function whose result is sent to a client cannot reach the hash at all.
 */
export async function findUserById(id) {
  const res = await db.query(
    `SELECT ${PUBLIC_COLS} FROM users WHERE id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

/**
 * Internal only. Used solely to verify a password before changing it.
 * Never return this to a caller.
 */
export async function findUserAuthById(id) {
  const res = await db.query(
    `SELECT id, password_hash FROM users WHERE id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

export async function insertUser({ email, password_hash, name, role = "user" }) {
  const res = await db.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1,$2,$3,$4)
     RETURNING id, email, name, role, avatar_url, created_at`,
    [email, password_hash, name, role]
  );
  return res.rows[0];
}

export async function updateUserAvatar(id, avatarUrl) {
  const res = await db.query(
    `UPDATE users
     SET avatar_url = $1
     WHERE id = $2
     RETURNING id, email, name, role, avatar_url, created_at`,
    [avatarUrl, id]
  );
  return res.rows[0];
}

/**
 * Updates name and/or email in a single statement.
 *
 * Replaces separate updateUserName and updateUserEmail calls, which the
 * service issued back to back with no transaction: if the second failed the
 * first stayed committed, leaving a half-applied update. COALESCE leaves a
 * column untouched when its parameter is null, so one round trip covers
 * either field or both.
 *
 * Returns the public columns directly, so the caller never needs a follow-up
 * SELECT. That follow-up SELECT is what leaked the password hash before.
 */
export async function updateUserProfileFields(id, { name, email }) {
  const res = await db.query(
    `UPDATE users
     SET name       = COALESCE($1, name),
         email      = COALESCE($2, email),
         updated_at = now()
     WHERE id = $3
     RETURNING ${PUBLIC_COLS}`,
    [name ?? null, email ?? null, id]
  );
  return res.rows[0] || null;
}