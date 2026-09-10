import dotenv from "dotenv";
dotenv.config();

const NODE_ENV = process.env.NODE_ENV || "development";

/**
 * A secret that must never silently fall back to a default in production.
 *
 * JWT_SECRET and IP_SALT were previously read straight from process.env at
 * their call sites. JWT_SECRET was undefined, so jwt.sign threw on the first
 * login rather than at boot, and IP_SALT fell back to the literal string
 * "static_salt", which made every visitor IP hash trivially reversible.
 * Failing loudly at startup is the correct behaviour for both.
 */
function requiredSecret(name, devFallback) {
  const value = process.env[name];
  if (value) return value;

  if (NODE_ENV === "production") {
    throw new Error(
      `[config] ${name} is required but is not set. ` +
        `Refusing to start: falling back to a default would be a security defect.`
    );
  }

  console.warn(
    `[config] ${name} is not set. Using an insecure development default. ` +
      `This will refuse to start when NODE_ENV=production.`
  );
  return devFallback;
}

function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`[config] ${name} must be an integer, got "${raw}"`);
  }
  return parsed;
}

export const config = {
  NODE_ENV,
  APP_NAME: process.env.APP_NAME || "shortify",

  // App
  PORT: int("PORT", 3000),
  BASE_URL: process.env.BASE_URL || "http://localhost:3000",

  // Postgres
  POSTGRES_URL: process.env.POSTGRES_URL,
  POSTGRES_USER: process.env.POSTGRES_USER,
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD,
  POSTGRES_DB: process.env.POSTGRES_DB,

  // Connection pool. Previously unbounded in configuration and therefore
  // pg's default of 10, which is the ceiling on concurrent queries and so
  // on redirect throughput while the click write is still synchronous.
  PG_POOL_MAX: int("PG_POOL_MAX", 10),
  PG_IDLE_TIMEOUT_MS: int("PG_IDLE_TIMEOUT_MS", 30000),
  PG_CONNECT_TIMEOUT_MS: int("PG_CONNECT_TIMEOUT_MS", 5000),

  // Redis
  REDIS_URL: process.env.REDIS_URL,

  // Auth
  JWT_SECRET: requiredSecret("JWT_SECRET", "dev-only-insecure-jwt-secret"),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  BCRYPT_ROUNDS: int("BCRYPT_ROUNDS", 12),

  // Analytics privacy. Salts the visitor IP before it is hashed, so the raw
  // address is never persisted.
  IP_SALT: requiredSecret("IP_SALT", "dev-only-insecure-ip-salt"),

  // Rate limiting on link creation. Configurable so a load test can raise it
  // identically across benchmark phases instead of measuring 429s.
  RATE_LIMIT_CREATE_MAX: int("RATE_LIMIT_CREATE_MAX", 10),
  RATE_LIMIT_CREATE_WINDOW_S: int("RATE_LIMIT_CREATE_WINDOW_S", 60),
};
