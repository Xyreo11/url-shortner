// src/app.js
//
// Builds the Express application without starting a listener, so tests can
// drive it through supertest and src/index.js stays responsible only for
// process concerns: listening, signals and shutdown.

import express from "express";
import cors from "cors";
import helmet from "helmet";

import httpRouter from "./routes/http.js";
import qrRouter from "./routes/qr.js";
import analyticsRouter from "./routes/analytics.js";
import authRouter from "./routes/auth.js";
import userRouter from "./routes/user.js";

import { config } from "./config/env.js";
import { db } from "./config/db.js";
import { redis } from "./config/redis.js";
import { logRequests } from "./middleware/requestLogger.js";
import { snapshot, resetMetrics } from "./utils/metrics.js";

export function createApp() {
  const app = express();

  // Was unconditionally true, which meant any client could set
  // X-Forwarded-For and pick its own rate-limit bucket and analytics IP hash.
  app.set("trust proxy", config.TRUST_PROXY);

  // Content-Security-Policy is disabled: this service returns 302s and JSON,
  // never HTML it controls, and a default CSP would apply to error pages
  // without protecting anything. The rest (HSTS, nosniff, frameguard,
  // referrer policy) all apply.
  app.use(helmet({ contentSecurityPolicy: false }));

  app.use(express.json({ limit: "5mb" }));

  app.use(
    cors({
      // An allowlist rather than "*". A wildcard lets any site on the
      // internet call this API from a logged-in visitor's browser.
      origin(origin, callback) {
        // Requests with no Origin header are not browser cross-origin calls:
        // curl, server-to-server, and the redirect path itself.
        if (!origin) return callback(null, true);
        if (config.CORS_ORIGINS.includes(origin)) return callback(null, true);
        return callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
    })
  );

  app.use(logRequests);

  // Must be registered before the catch-all router below, which matches any
  // single-segment path and would otherwise treat "health" as a short code.
  app.get("/health", async (req, res) => {
    const checks = {};
    let healthy = true;

    try {
      await db.query("SELECT 1");
      checks.postgres = "ok";
    } catch (err) {
      checks.postgres = `fail: ${err.message}`;
      healthy = false;
    }

    try {
      await redis.ping();
      checks.redis = "ok";
    } catch (err) {
      // Redis being down is a degradation, not an outage: redirects still
      // serve from Postgres. Reported so a load test does not start against
      // a half-ready stack, but it does not by itself fail the check.
      checks.redis = `fail: ${err.message}`;
    }

    res.status(healthy ? 200 : 503).json({
      status: healthy ? "ok" : "unhealthy",
      app: config.APP_NAME,
      uptimeSeconds: Math.round(process.uptime()),
      checks,
    });
  });

  // Like /health, this must come before the catch-all below or "metrics" is
  // parsed as a short code.
  //
  // Counters and gauges only, scraped at run start and run end. Nothing here
  // accumulates per request, so it costs one extra entry in the router chain
  // and nothing else. Present in both benchmark phases by design.
  app.get("/metrics", (req, res) => {
    res.json(snapshot());
  });

  // Zeroes the counters so a single run can be measured in isolation.
  // Benchmark-only; it would be gated behind auth in anything real.
  app.post("/metrics/reset", (req, res) => {
    resetMetrics();
    res.json({ reset: true });
  });

  // Specific prefixes first.
  app.use("/api/auth", authRouter);
  app.use("/api/user", userRouter);
  app.use("/analytics", analyticsRouter);
  app.use("/qr", qrRouter);

  // Catch-all: GET /:code. Matches any single-segment path, so it must stay
  // last or it swallows every route above.
  app.use("/", httpRouter);

  app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Four arguments, so Express treats this as the error handler. Without it,
  // a thrown error in any route produces Express's default HTML stack trace.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error("[app] unhandled error:", err.message);
    res.status(err.status || 500).json({ error: "Internal server error" });
  });

  return app;
}
