// Shared configuration for the benchmark scripts.
//
// Loads bench/.env.bench if present. That file points at the compose stack
// from the HOST (localhost:5433, localhost:6379) rather than at the container
// hostnames the application's own .env uses, because the app under test runs
// natively rather than inside Docker. See bench/README.md for why.

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, "..", ".env.bench") });

function required(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `[bench] ${name} is not set. Copy bench/.env.bench.example to ` +
        `bench/.env.bench and fill it in.`
    );
  }
  return v;
}

function int(name, fallback) {
  const raw = process.env[name];
  return raw === undefined || raw === "" ? fallback : Number.parseInt(raw, 10);
}

export const bench = {
  POSTGRES_URL: required("BENCH_POSTGRES_URL"),
  REDIS_URL: required("BENCH_REDIS_URL"),
  BASE_URL: process.env.BENCH_BASE_URL || "http://localhost:3000",

  // Total links seeded. Codes run b0000001 .. b<SEED_URLS>.
  SEED_URLS: int("BENCH_SEED_URLS", 50000),

  // The first HOT_URLS codes are warmed into Redis. Everything above that is
  // the cold pool, deliberately never warmed, so the cache-miss scenario is
  // genuinely missing.
  HOT_URLS: int("BENCH_HOT_URLS", 10000),

  SEED_ANALYTICS: int("BENCH_SEED_ANALYTICS", 500000),
  SEED_USERS: int("BENCH_SEED_USERS", 10),

  // Must match the app's BCRYPT_ROUNDS during the run, or the seeded hashes
  // verify at a different cost than the app expects and the login scenario
  // measures the wrong thing.
  BCRYPT_ROUNDS: int("BENCH_BCRYPT_ROUNDS", 10),

  USER_PASSWORD: process.env.BENCH_USER_PASSWORD || "benchpassword1",
};

/** Zero-padded code for index i, matching what the seeder writes. */
export function codeFor(i) {
  return "b" + String(i).padStart(7, "0");
}

export function userEmail(i) {
  return `bench${i}@example.com`;
}
