// src/services/analytics.service.js
import { db } from "../config/db.js";
import { redis } from "../config/redis.js";

/**
 * parseRange: gives start and end timestamps for common ranges
 * supported: days (e.g. 7d), dates (start=YYYY-MM-DD&end=YYYY-MM-DD)
 */
function parseRange(q = {}) {
  const { range, start, end } = q;
  if (start && end) {
    return { start: new Date(start), end: new Date(end) };
  }

  // range like "7d", "30d"
  if (typeof range === "string" && range.endsWith("d")) {
    const days = parseInt(range.slice(0, -1), 10) || 14;
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setUTCDate(endDate.getUTCDate() - days + 1);
    return { start: startDate, end: endDate };
  }

  // default 14 days
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setUTCDate(endDate.getUTCDate() - 13);
  return { start: startDate, end: endDate };
}

// -----------------------------
// Admin aggregations
// -----------------------------
export async function getAdminStats({ range = "30d" } = {}) {
  const { start, end } = parseRange({ range });

  // Total clicks & unique visitors
  const totalQ = `
    SELECT COUNT(*)::int AS total 
    FROM analytics 
    WHERE timestamp >= $1 AND timestamp <= $2
  `;
  const uniqueQ = `
    SELECT COUNT(DISTINCT ip_hash)::int AS unique_visitors 
    FROM analytics 
    WHERE timestamp >= $1 AND timestamp <= $2
  `;

  const [totalRes, uniqueRes] = await Promise.all([
    db.query(totalQ, [start, end]),
    db.query(uniqueQ, [start, end]),
  ]);

  const total = totalRes?.rows?.[0]?.total ?? 0;
  const unique = uniqueRes?.rows?.[0]?.unique_visitors ?? 0;

  // devices, browsers, os, countries
  const topQuery = (col) => `
    SELECT ${col} as key, COUNT(*)::int AS count
    FROM analytics
    WHERE timestamp >= $1 AND timestamp <= $2
    GROUP BY ${col}
    ORDER BY count DESC
    LIMIT 20
  `;

  const [devicesQ, browsersQ, osQ, countriesQ] = await Promise.all([
    db.query(topQuery("device"), [start, end]),
    db.query(topQuery("browser"), [start, end]),
    db.query(topQuery("os"), [start, end]),
    db.query(topQuery("country"), [start, end]),
  ]);

  // QR scans
  const qrQ = `
    SELECT COUNT(*)::int AS qr_scans 
    FROM analytics 
    WHERE is_qr = true AND timestamp >= $1 AND timestamp <= $2
  `;
  const qrRes = await db.query(qrQ, [start, end]);
  const qrScans = qrRes?.rows?.[0]?.qr_scans ?? 0;

  return {
    totalClicks: total,
    uniqueVisitors: unique,
    devices: devicesQ.rows || [],
    browsers: browsersQ.rows || [],
    os: osQ.rows || [],
    countries: countriesQ.rows || [],
    qrScans,
    failingUrls: [],  // placeholder
  };
}

/**
 * getUserStats(email)
 * requires urls table to have owner_email column
 */
export async function getUserStats(email, { range = "14d" } = {}) {
  const { start, end } = parseRange({ range });

  // total links owned
  const totalLinksQ = `SELECT COUNT(*)::int AS total FROM urls WHERE owner_email = $1`;
  // clicks for owner
  const clicksQ = `
    SELECT COUNT(*)::int AS clicks
    FROM analytics
    WHERE short_code IN (
      SELECT short_code FROM urls WHERE owner_email = $1
    ) AND timestamp >= $2 AND timestamp <= $3
  `;

  const [linksR, clicksR] = await Promise.all([
    db.query(totalLinksQ, [email]),
    db.query(clicksQ, [email, start, end]),
  ]);

  // top links for user (short_code, long_url, clicks)
  const topLinksQ = `
    SELECT a.short_code, u.long_url, COUNT(*)::int AS clicks
    FROM analytics a
    JOIN urls u ON u.short_code = a.short_code
    WHERE u.owner_email = $1 AND a.timestamp >= $2 AND a.timestamp <= $3
    GROUP BY a.short_code, u.long_url
    ORDER BY clicks DESC
    LIMIT 10
  `;
  const topLinksR = await db.query(topLinksQ, [email, start, end]);

  return {
    totalLinks: linksR.rows[0].total || 0,
    totalClicks: clicksR.rows[0].clicks || 0,
    topLinks: topLinksR.rows || [],
  };
}

/**
 * trend data (time series): daily/hourly
 * granularity: 'daily' | 'hourly'
 */
export async function getClickTrend({ range = "14d", granularity = "daily", ownerEmail = null, zeroFill = true } = {}) {
  const { start, end } = parseRange({ range });

  // Build optional owner filter - use parameter index $3 for ownerEmail
  const ownerFilter = ownerEmail
    ? `AND a.short_code IN (SELECT short_code FROM urls WHERE owner_email = $3)`
    : '';

  if (granularity === "hourly") {
    const q = `
      SELECT date_trunc('hour', a.timestamp) AS bucket, COUNT(*)::int AS clicks
      FROM analytics a
      WHERE a.timestamp >= $1 AND a.timestamp <= $2
      ${ownerFilter}
      GROUP BY bucket
      ORDER BY bucket
    `;
    const params = ownerEmail ? [start, end, ownerEmail] : [start, end];
    const r = await db.query(q, params);
    const rows = r.rows.map(r => ({ time: r.bucket, clicks: r.clicks }));

    if (!zeroFill) return rows;

    // zero-fill hourly series between start and end
    const out = [];
    const s = new Date(start);
    s.setMinutes(0, 0, 0);
    const e = new Date(end);
    e.setMinutes(0, 0, 0);
    for (let dt = new Date(s); dt <= e; dt.setHours(dt.getHours() + 1)) {
      const iso = new Date(dt).toISOString();
      const found = rows.find(r => new Date(r.time).toISOString() === iso);
      out.push({ time: iso, clicks: found ? found.clicks : 0 });
    }
    return out;
  } else {
    const q = `
      SELECT date_trunc('day', a.timestamp) AS bucket, COUNT(*)::int AS clicks
      FROM analytics a
      WHERE a.timestamp >= $1 AND a.timestamp <= $2
      ${ownerFilter}
      GROUP BY bucket
      ORDER BY bucket
    `;
    const params = ownerEmail ? [start, end, ownerEmail] : [start, end];
    const r = await db.query(q, params);
    const rows = r.rows.map(r => ({ time: r.bucket, clicks: r.clicks }));

    if (!zeroFill) return rows;

    // zero-fill daily series between start and end
    const out = [];
    const s = new Date(start);
    s.setUTCHours(0, 0, 0, 0);
    const e = new Date(end);
    e.setUTCHours(0, 0, 0, 0);
    for (let dt = new Date(s); dt <= e; dt.setUTCDate(dt.getUTCDate() + 1)) {
      const iso = new Date(dt).toISOString();
      const found = rows.find(r => new Date(r.time).toISOString().slice(0,10) === iso.slice(0,10));
      out.push({ time: iso, clicks: found ? found.clicks : 0 });
    }
    return out;
  }
}
/**
 * top links (global)
 */
export async function getTopLinks({ range = "30d", limit = 10 } = {}) {
  const { start, end } = parseRange({ range });
  const q = `
    SELECT a.short_code, u.long_url, COUNT(*)::int AS clicks
    FROM analytics a
    LEFT JOIN urls u ON u.short_code = a.short_code
    WHERE a.timestamp >= $1 AND a.timestamp <= $2
    GROUP BY a.short_code, u.long_url
    ORDER BY clicks DESC
    LIMIT $3
  `;
  const r = await db.query(q, [start, end, limit]);
  return r.rows;
}

/**
 * device/browser/country lists
 */
export async function getBreakdowns({ range = "30d" } = {}) {
  const { start, end } = parseRange({ range });

  const q = (col) => `
    SELECT ${col} as key, COUNT(*)::int AS count
    FROM analytics
    WHERE timestamp >= $1 AND timestamp <= $2
    GROUP BY ${col}
    ORDER BY count DESC
    LIMIT 50
  `;

  const [devices, browsers, countries] = await Promise.all([
    db.query(q("device"), [start, end]),
    db.query(q("browser"), [start, end]),
    db.query(q("country"), [start, end]),
  ]);

  return {
    devices: devices.rows,
    browsers: browsers.rows,
    countries: countries.rows,
  };
}

/**
 * health metrics (placeholders that you can expand)
 * - avg redirect latency (if you log latency in a separate table)
 * - cache hit rate (needs redis instrumentation)
 * - error rate (needs error log table)
 */
export async function getHealthMetrics() {
  // Try to read counters from redis (non-blocking)
  let cacheHitRate = null;
  try {
    const hits = parseInt(await redis.get("cache:hits") || "0", 10);
    const misses = parseInt(await redis.get("cache:misses") || "0", 10);
    const total = hits + misses;
    cacheHitRate = total > 0 ? (hits / total) * 100 : null;
  } catch (e) {
    console.warn("Failed to read cache counters:", e.message || e);
  }

  // Placeholder values for redirect latency and error rate (you can instrument later)
  const avgRedirectLatency = null;
  const errorRate = null;

  return {
    avgRedirectLatency,
    cacheHitRate,
    errorRate,
  };
}
