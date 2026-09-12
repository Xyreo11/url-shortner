// src/app.js
//
// Builds the Express application without starting a listener, so tests can
// drive it through supertest and src/index.js stays responsible only for
// process concerns: listening, signals and shutdown.

import express from "express";
import cors from "cors";
import helmet from "helmet";

import { shortenRouter, redirectRouter } from "./routes/http.js";
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
  // Express sets X-Powered-By and helmet then removes it again, so the
  // header is paid for twice and shipped never. Disabling it at the source
  // skips both.
  app.disable("x-powered-by");

  app.set("trust proxy", config.TRUST_PROXY);

  // Content-Security-Policy is disabled: this service returns 302s and JSON,
  // never HTML it controls, and a default CSP would apply to error pages
  // without protecting anything. The rest (HSTS, nosniff, frameguard,
  // referrer policy) all apply.
  const securityHeaders = helmet({ contentSecurityPolicy: false });

  const jsonBody = express.json({ limit: "5mb" });

  const corsPolicy = cors({
    // An allowlist rather than "*". A wildcard lets any site on the internet
    // call this API from a logged-in visitor's browser.
    origin(origin, callback) {
      // Requests with no Origin header are not browser cross-origin calls:
      // curl, server-to-server, and the redirect path itself.
      if (!origin) return callback(null, true);
      if (config.CORS_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  });

  /**
   * The full stack, applied per route rather than globally.
   *
   * All four used to be app.use'd, so every redirect ran all of them. helmet
   * is thirteen nested middlewares and about a dozen setHeader calls.
   * express.json allocates `req.body = {}` on a GET that has no body. The
   * CORS delegate runs and sets Vary and Allow-Credentials on a response no
   * browser treats as cross-origin. The request logger does a Date plus a
   * full JSON.stringify synchronously before calling next.
   *
   * A JSON API call needs all of it. A bare redirect needs none of it, and
   * the redirect is 93% of the traffic. The redirect path sets the two
   * headers that matter on a bodyless 302 itself, inside its single
   * writeHead, so they cost nothing extra.
   */
  const apiStack = [securityHeaders, jsonBody, corsPolicy, logRequests];

  // Must be registered before the catch-all router below, which matches any
  // single-segment path and would otherwise treat "health" as a short code.
  app.get("/health", securityHeaders, async (req, res) => {
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
  app.get("/metrics", securityHeaders, (req, res) => {
    res.json(snapshot());
  });

  // Zeroes the counters so a single run can be measured in isolation.
  // Benchmark-only; it would be gated behind auth in anything real.
  app.post("/metrics/reset", securityHeaders, (req, res) => {
    resetMetrics();
    res.json({ reset: true });
  });

  // Specific prefixes first, each with the full API stack.
  app.use("/api/auth", apiStack, authRouter);
  app.use("/api/user", apiStack, userRouter);
  app.use("/analytics", apiStack, analyticsRouter);
  app.use("/qr", apiStack, qrRouter);

  // POST /shorten is a JSON API call and needs the same treatment, so it is
  // mounted separately from the redirect rather than sharing its router.
  app.use("/shorten", apiStack, shortenRouter);

  // Catch-all: GET /:code, with nothing in front of it. Matches any single
  // segment, so it must stay last or it swallows every route above.
  app.use("/", redirectRouter);

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
