#!/usr/bin/env node
//
// Returns the stack to the exact state every run must start from.
//
// Faster and far more reliable than tearing the compose stack down, and it
// never touches volumes belonging to anything else. Re-seeds analytics from
// scratch because the previous run inserted rows into it, and drops any links
// created by the write scenario.
//
//   node bench/reset.mjs && node bench/warm.mjs

import pg from "pg";
import { createClient } from "redis";
import { bench } from "./lib/config.mjs";

const db = new pg.Pool({ connectionString: bench.POSTGRES_URL, max: 4 });
const redis = createClient({ url: bench.REDIS_URL });
redis.on("error", (e) => console.error("[reset] redis:", e.message));

const t0 = Date.now();

try {
  await redis.connect();

  // 1. Links created during the run. The seeded set is exactly the codes
  //    matching the bench pattern, so anything else came from the create
  //    scenario.
  const { rowCount: removed } = await db.query(
    `DELETE FROM urls WHERE short_code !~ '^b[0-9]{7}$'`
  );
  console.log(`[reset] removed ${removed} links created during the run`);

  // 2. Click counts, which the previous run incremented.
  await db.query(`UPDATE urls SET click_count = 0 WHERE click_count <> 0`);

  // 3. Analytics: truncate and re-seed. RESTART IDENTITY keeps the sequence
  //    from drifting between runs.
  await db.query(`TRUNCATE analytics RESTART IDENTITY`);
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

  // 4. Redis, wholesale. Rate-limit keys, cache entries and counters all have
  //    to go, or the next run starts partly throttled or partly warm.
  await redis.flushDb();

  // 5. Assert. A run that starts from the wrong state produces a number that
  //    looks fine and means nothing.
  const { rows: u } = await db.query(`SELECT count(*)::int AS n FROM urls`);
  const { rows: a } = await db.query(`SELECT count(*)::int AS n FROM analytics`);
  const { rows: c } = await db.query(`SELECT coalesce(sum(click_count), 0)::int AS n FROM urls`);
  const size = await redis.dbSize();

  const checks = [
    ["urls", u[0].n, bench.SEED_URLS],
    ["analytics", a[0].n, bench.SEED_ANALYTICS],
    ["total click_count", c[0].n, 0],
    ["redis DBSIZE", size, 0],
  ];

  let ok = true;
  for (const [label, actual, expected] of checks) {
    const pass = actual === expected;
    ok &&= pass;
    console.log(`[reset] ${pass ? "OK  " : "FAIL"} ${label}: ${actual} (expected ${expected})`);
  }

  console.log(`[reset] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (!ok) {
    console.error("[reset] state is not clean. Do not benchmark until this passes.");
    process.exitCode = 1;
  } else {
    console.log("[reset] now run: node bench/warm.mjs");
  }
} finally {
  await redis.quit();
  await db.end();
}
