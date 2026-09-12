import pkg from "pg";
import { config } from "./env.js";
import { counters, registerPool } from "../utils/metrics.js";

const { Pool } = pkg;

const pool = new Pool({
  connectionString: config.POSTGRES_URL,

  // Previously all defaults. An unbounded wait with no connection timeout
  // means a slow or unreachable database shows up as requests hanging rather
  // than as errors, and the pool size is the hard ceiling on concurrent
  // queries, so it belongs in configuration rather than in pg's defaults.
  max: config.PG_POOL_MAX,
  idleTimeoutMillis: config.PG_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: config.PG_CONNECT_TIMEOUT_MS,
});

// Without this listener, an error on an idle client is an unhandled 'error'
// event, which terminates the process. A database blip should not take the
// application down.
pool.on("error", (err) => {
  console.error("[db] idle client error:", err.message);
});

registerPool(pool);

/**
 * The pool, with `query` counted.
 *
 * One increment per query, which is the cheapest possible instrumentation and
 * gives an exact "Postgres queries per redirect" figure. That number is the
 * evidence for the write-behind work: it should fall from 2 to 0 on a cache
 * hit, which is a claim a reviewer can check against the source rather than
 * having to trust a latency delta measured on a laptop.
 */
export const db = {
  query(...args) {
    counters.pgQueries += 1;
    return pool.query(...args);
  },
  connect: (...args) => pool.connect(...args),
  get totalCount() {
    return pool.totalCount;
  },
  get idleCount() {
    return pool.idleCount;
  },
  get waitingCount() {
    return pool.waitingCount;
  },
};

export async function closeDb() {
  await pool.end();
}
