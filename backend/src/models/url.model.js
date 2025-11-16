import { db } from "../config/db.js";

export async function findByLongUrl(longUrl) {
  const res = await db.query(
    "SELECT * FROM urls WHERE long_url = $1 LIMIT 1",
    [longUrl]
  );
  return res.rows[0];
}

export async function findByShortCode(code) {
  const res = await db.query(
    "SELECT * FROM urls WHERE short_code = $1 LIMIT 1",
    [code]
  );
  return res.rows[0];
}

export async function insertUrl(longUrl, code) {
  const res = await db.query(
    "INSERT INTO urls (long_url, short_code) VALUES ($1, $2) RETURNING *",
    [longUrl, code]
  );
  return res.rows[0];
}
