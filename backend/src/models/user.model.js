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

export async function updateUserName(id, name) {
  const res = await db.query(
    `UPDATE users
     SET name = $1
     WHERE id = $2
     RETURNING id, email, name, role, avatar_url, created_at`,
    [name, id]
  );
  return res.rows[0];
}

export async function updateUserEmail(id, email) {
  const res = await db.query(
    `UPDATE users 
     SET email = $1 
     WHERE id = $2
     RETURNING id, email, name, role, avatar_url, created_at`,
    [email, id]
  );
  return res.rows[0];
}