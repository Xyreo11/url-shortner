#!/usr/bin/env node
//
// Warms exactly the hot pool into Redis and asserts the resulting DBSIZE.
//
// Warming matters for comparability: a run that starts cold spends its first
// seconds measuring Postgres, and if the two phases warm differently the
// comparison is meaningless. Asserting DBSIZE afterwards is what catches a
// half-finished warm, which is otherwise invisible in the results.
//
//   node bench/warm.mjs

import { createClient } from "redis";
import { bench, codeFor } from "./lib/config.mjs";

const redis = createClient({ url: bench.REDIS_URL });
redis.on("error", (e) => console.error("[warm] redis:", e.message));
await redis.connect();

const t0 = Date.now();
console.log(`[warm] loading ${bench.HOT_URLS} hot keys...`);

// Pipelined in batches. One round trip per key would take minutes.
const BATCH = 1000;
for (let start = 1; start <= bench.HOT_URLS; start += BATCH) {
  const end = Math.min(start + BATCH - 1, bench.HOT_URLS);
  const multi = redis.multi();
  for (let i = start; i <= end; i++) {
    // Same key shape and TTL the application writes, so a warmed key is
    // indistinguishable from one the app cached itself.
    multi.set(`short:${codeFor(i)}`, `https://bench.invalid/target/${i}`, { EX: 3600 });
  }
  await multi.exec();
}

const size = await redis.dbSize();
const pass = size === bench.HOT_URLS;

console.log(`[warm] DBSIZE = ${size} (expected ${bench.HOT_URLS}) ${pass ? "OK" : "FAIL"}`);
console.log(`[warm] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

if (!pass) {
  console.error(
    "[warm] Redis does not hold exactly the hot pool. Run bench/reset.mjs and warm again."
  );
  process.exitCode = 1;
}

await redis.quit();
