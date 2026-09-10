#!/usr/bin/env node
//
// Seeds deterministic benchmark data and asserts the result.
//
// Everything except the user rows is generated server-side with
// generate_series, so 550,000 rows never cross the wire. Users need bcrypt,
// which is a Node library, so those are inserted from here.
//
//   node bench/seed.mjs

import pg from "pg";
import bcrypt from "bcrypt";
import { bench, codeFor, userEmail } from "./lib/config.mjs";

const db = new pg.Pool({ connectionString: bench.POSTGRES_URL, max: 4 });

const t0 = Date.now();
const log = (msg) => console.log(`[seed] ${msg}`);

try {
  log(`target: ${bench.POSTGRES_URL.replace(/:\/\/[^@]*@/, "://***:***@")}`);

  // ---------------------------------------------------------------------
  // urls
  // ---------------------------------------------------------------------
  // Destinations point at a non-resolving host on purpose. k6 is configured
  // not to follow redirects, but if any client ever did, a real destination
  // would turn the measurement into DNS plus wide-area latency.
  log(`inserting ${bench.SEED_URLS} urls...`);
  await db.query(
    `INSERT INTO urls (long_url, short_code, owner_email, click_count)
     SELECT 'https://bench.invalid/target/' || i,
            'b' || lpad(i::text, 7, '0'),
            CASE WHEN i % 10 = 0
                 THEN 'bench' || ((i / 10) % $2) || '@example.com'
                 ELSE NULL END,
            0
     FROM generate_series(1, $1) i
     ON CONFLICT (short_code) DO NOTHING`,
    [bench.SEED_URLS, bench.SEED_USERS]
  );

  // ---------------------------------------------------------------------
  // analytics
  // ---------------------------------------------------------------------
  // Spread across 30 days with realistic cardinality on the grouped columns.
  // Benchmarking the dashboard against an empty table measures nothing.
  log(`inserting ${bench.SEED_ANALYTICS} analytics rows...`);
  await db.query(
    `INSERT INTO analytics
       (short_code, ip_hash, device, browser, os, country, is_qr, referrer, "timestamp")
     SELECT 'b' || lpad(((i % $2) + 1)::text, 7, '0'),
            md5(i::text),
            (ARRAY['desktop','mobile','tablet'])[1 + (i % 3)],
            (ARRAY['Chrome','Safari','Firefox','Edge','Opera'])[1 + (i % 5)],
            (ARRAY['Windows','macOS','iOS','Android','Linux'])[1 + (i % 5)],
            (ARRAY['US','IN','GB','DE','JP','BR'])[1 + (i % 6)],
            (i % 7 = 0),
            '',
            now() - ((i % 2592000) || ' seconds')::interval
     FROM generate_series(1, $1) i`,
    [bench.SEED_ANALYTICS, bench.HOT_URLS]
  );

  // ---------------------------------------------------------------------
  // users
  // ---------------------------------------------------------------------
  log(`inserting ${bench.SEED_USERS} users at bcrypt cost ${bench.BCRYPT_ROUNDS}...`);
  const hash = await bcrypt.hash(bench.USER_PASSWORD, bench.BCRYPT_ROUNDS);
  for (let i = 0; i < bench.SEED_USERS; i++) {
    await db.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, 'user')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [userEmail(i), hash, `Bench User ${i}`]
    );
  }

  // ---------------------------------------------------------------------
  // Assert, do not assume. A run against half-seeded data is not comparable
  // to one against full data, and the difference is invisible in the results.
  // ---------------------------------------------------------------------
  const checks = [
    ["urls", `SELECT count(*)::int AS n FROM urls`, bench.SEED_URLS],
    ["analytics", `SELECT count(*)::int AS n FROM analytics`, bench.SEED_ANALYTICS],
    ["users", `SELECT count(*)::int AS n FROM users`, bench.SEED_USERS],
  ];

  let ok = true;
  for (const [label, sql, expected] of checks) {
    const { rows } = await db.query(sql);
    const actual = rows[0].n;
    const pass = actual === expected;
    ok &&= pass;
    console.log(`[seed] ${pass ? "OK  " : "FAIL"} ${label}: ${actual} (expected ${expected})`);
  }

  const { rows: spot } = await db.query(
    `SELECT short_code, long_url FROM urls WHERE short_code IN ($1, $2) ORDER BY short_code`,
    [codeFor(1), codeFor(bench.SEED_URLS)]
  );
  console.log(`[seed] first/last codes: ${spot.map((r) => r.short_code).join(", ")}`);

  if (!ok) {
    console.error("[seed] counts do not match. Reset the stack and reseed before benchmarking.");
    process.exitCode = 1;
  } else {
    log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
} finally {
  await db.end();
}
