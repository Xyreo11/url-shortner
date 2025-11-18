// src/models/user.model.js
import { db } from "../config/db.js";

export async function findUserByEmail(email) {
  const res = await db.query(
    "SELECT * FROM users WHERE email = $1 LIMIT 1",
    [email]
  );
  return res.rows[0] || null;
}

export async function findUserById(id) {
  const res = await db.query(
    `SELECT id, email, name, role, avatar_url, password_hash, created_at
     FROM users 
     WHERE id = $1`,
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