// src/models/analytics.model.js
import { db } from "../config/db.js";

/**
 * Insert click event (DB-level). IP is hashed here deterministically using md5.
 * timestamp is optional (defaults to now())
 */
export async function insertClickEvent({
  shortCode,
  ip,
  device,
  browser,
  os,
  country,
  isQR = false,
  referrer = null,
  timestamp = new Date(),
}) {
  // Use deterministic md5 hashing of IP (not reversible to original IP easily in practice for our use-case)
  const query = `
    INSERT INTO analytics
      (short_code, ip_hash, device, browser, os, country, is_qr, referrer, timestamp)
    VALUES
      ($1, md5($2), $3, $4, $5, $6, $7, $8, $9)
    RETURNING id
  `;
  const values = [
    shortCode,
    ip || "",
    device || null,
    browser || null,
    os || null,
    country || null,
    isQR,
    referrer,
    timestamp,
  ];
  const res = await db.query(query, values);
  return res.rows[0];
}
