import pkg from "pg";
import { config } from "./env.js";

const { Pool } = pkg;

export const db = new Pool({
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
db.on("error", (err) => {
  console.error("[db] idle client error:", err.message);
});

export async function closeDb() {
  await db.end();
}
