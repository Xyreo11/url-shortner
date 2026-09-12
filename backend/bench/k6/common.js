// Shared helpers and options for every k6 script here.
//
// Read bench/README.md before changing any of this: several settings exist to
// stop the benchmark measuring the wrong thing, and they are not obvious.

import http from "k6/http";
import { check } from "k6";
import exec from "k6/execution";

export const BASE_URL = __ENV.BENCH_BASE_URL || "http://localhost:3000";

export const SEED_URLS = Number(__ENV.BENCH_SEED_URLS || 50000);
export const HOT_URLS = Number(__ENV.BENCH_HOT_URLS || 10000);
export const SEED_USERS = Number(__ENV.BENCH_SEED_USERS || 10);
export const USER_PASSWORD = __ENV.BENCH_USER_PASSWORD || "benchpassword1";

export const RATE = Number(__ENV.BENCH_RATE || 200);
export const WARMUP_S = Number(__ENV.BENCH_WARMUP_S || 30);
export const DURATION_S = Number(__ENV.BENCH_DURATION_S || 180);

const COLD_POOL = SEED_URLS - HOT_URLS;

export function codeFor(i) {
  return "b" + String(i).padStart(7, "0");
}

/** A code guaranteed to be in Redis. */
export function hotCode() {
  return codeFor(1 + Math.floor(Math.random() * HOT_URLS));
}

/**
 * A code guaranteed NOT to be in Redis, and not reused within this run.
 *
 * This is the subtle one. resolveUrl caches on a miss, so re-requesting a
 * cold code turns it into a hit and the "cache miss" scenario quietly
 * measures cache hits instead. Indexing by iterationInTest, which is unique
 * across the whole test, keeps every miss genuinely cold. If the run needs
 * more misses than the cold pool holds it wraps, which is why the pool is
 * sized well above the expected miss count and why the DBSIZE growth is
 * asserted afterwards.
 */
export function coldCode() {
  const n = exec.scenario.iterationInTest % COLD_POOL;
  return codeFor(HOT_URLS + 1 + n);
}

export function benchUser() {
  const i = Math.floor(Math.random() * SEED_USERS);
  return { email: `bench${i}@example.com`, password: USER_PASSWORD };
}

/**
 * Applied to every script.
 *
 * Not following redirects is load-bearing. k6 chases 3xx by default, so
 * without this every 302 would be followed out to the seeded destination and
 * the numbers would be dominated by DNS rather than by this service. The
 * destinations point at a non-resolving host as a second line of defence, and
 * the redirect scenarios also pass redirects: 0 per request as a third.
 */
export const baseOptions = {
  discardResponseBodies: true,
  noVUConnectionReuse: false,

  // maxRedirects, NOT "redirects". k6 silently ignores an unknown option, and
  // with the wrong name it followed every 302 out to the seeded destination:
  // half the recorded requests were DNS lookups for a host that does not
  // resolve, and the failure rate read 50%. The measurement has to stop at the
  // 302, which is the response this service actually produces.
  maxRedirects: 0,

  insecureSkipTLSVerify: true,

  // k6 reports p90 and p95 by default. p99 is the number worth quoting for a
  // redirect service, so it has to be requested explicitly.
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
};

export const OPS = ["redirect_hit", "redirect_miss", "create", "analytics_dash", "login"];

/**
 * Per-endpoint sub-metrics.
 *
 * k6 only materialises a tagged sub-metric when a threshold names it. Without
 * these, tagging every scenario with an `op` produces nothing at all: the
 * saved results contain one blended figure and the per-endpoint numbers do
 * not exist.
 *
 * That blended figure is unusable here. The workload is 93% redirect, 4%
 * create, 2% dashboard, 1% login, so p95 is the top 5% of requests and p99
 * the top 1%. Both sit entirely inside the login and dashboard populations:
 * the blended p99 is bcrypt by construction and would read the same if the
 * redirect handler did nothing at all.
 *
 * The bounds are deliberately unreachable. These exist to create the metric,
 * never to pass or fail. run-matrix.sh runs under `set -euo pipefail` and k6
 * exits non-zero on a crossed threshold, so a threshold that can fire is a
 * threshold that can silently change which runs complete.
 *
 * Tagged on op AND phase together, or the warmup contaminates them.
 */
const perOpThresholds = {};
for (const op of OPS) {
  perOpThresholds[`http_req_duration{op:${op},phase:measure}`] = ["p(99)<100000"];
  perOpThresholds[`http_reqs{op:${op},phase:measure}`] = ["count>=0"];
}

export const thresholds = {
  // Only the measurement phase counts. The warmup exists to let V8 reach
  // steady state and would otherwise drag the percentiles up.
  "http_req_duration{phase:measure}": ["p(95)<500", "p(99)<1000"],
  "http_req_failed{phase:measure}": ["rate<0.01"],
  // Non-zero dropped iterations means the run could not keep up with the
  // offered rate, which invalidates it as a latency measurement rather than
  // describing the server. Flagged explicitly in the summary.
  dropped_iterations: ["count<1"],
  ...perOpThresholds,
};

// ---------------------------------------------------------------------------
// Scenario bodies. Exported so mixed.js can weight them and the isolation
// scripts can run one at a time.
// ---------------------------------------------------------------------------

export function redirectHit() {
  const res = http.get(`${BASE_URL}/${hotCode()}`, { tags: { op: "redirect_hit" }, redirects: 0 });
  check(res, { "redirect_hit is 302": (r) => r.status === 302 });
}

export function redirectMiss() {
  const res = http.get(`${BASE_URL}/${coldCode()}`, { tags: { op: "redirect_miss" }, redirects: 0 });
  check(res, { "redirect_miss is 302": (r) => r.status === 302 });
}

export function create() {
  // Unique per iteration so this exercises the insert path rather than the
  // dedupe path, which would otherwise short-circuit after the first request.
  const url = `https://bench.invalid/created/${exec.scenario.iterationInTest}-${__VU}`;
  const res = http.post(`${BASE_URL}/shorten`, JSON.stringify({ url }), {
    headers: { "Content-Type": "application/json" },
    tags: { op: "create" },
  });
  check(res, { "create is 200": (r) => r.status === 200 });
}

export function login() {
  const res = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify(benchUser()), {
    headers: { "Content-Type": "application/json" },
    tags: { op: "login" },
  });
  check(res, { "login is 200": (r) => r.status === 200 });
}

/**
 * Needs a token, and minting one per iteration would measure bcrypt rather
 * than the dashboard, so each VU logs in once and reuses the token.
 */
let cachedToken = null;
export function analyticsDash() {
  if (!cachedToken) {
    const res = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify(benchUser()), {
      headers: { "Content-Type": "application/json" },
      tags: { op: "dash_login" },
      responseType: "text",
    });
    try {
      cachedToken = JSON.parse(res.body).token;
    } catch {
      return;
    }
  }

  const res = http.get(`${BASE_URL}/analytics/user`, {
    headers: { Authorization: `Bearer ${cachedToken}` },
    tags: { op: "analytics_dash" },
  });
  check(res, { "analytics_dash is 200": (r) => r.status === 200 });
}

/**
 * Writes the raw summary next to the human-readable one, so results can be
 * re-derived later without rerunning anything.
 */
export function summaryTo(name) {
  return (data) => {
    const out = {};
    out[`bench/results/${__ENV.BENCH_PHASE || "unknown"}/${name}-${__ENV.BENCH_RUN || "1"}.json`] =
      JSON.stringify(data, null, 2);
    out.stdout = textSummary(data);
    return out;
  };
}

function pct(data, metric, p) {
  const m = data.metrics[metric];
  if (!m || !m.values) return "n/a";
  const v = m.values[p];
  return v === undefined ? "n/a" : v.toFixed(2);
}

function textSummary(data) {
  const reqs = data.metrics.http_reqs?.values;
  const failed = data.metrics.http_req_failed?.values;
  const dropped = data.metrics.dropped_iterations?.values?.count ?? 0;

  const lines = [
    "",
    "  ---------------------------------------------------------------",
    `  requests        ${reqs?.count ?? 0} (${(reqs?.rate ?? 0).toFixed(1)}/s achieved)`,
    `  failed          ${((failed?.rate ?? 0) * 100).toFixed(3)}%`,
    `  dropped iters   ${dropped}${dropped > 0 ? "   <-- RUN INVALID, could not sustain the offered rate" : ""}`,
    "",
    "  BLENDED (all endpoints)",
    `  p50 ${pct(data, "http_req_duration{phase:measure}", "med")}   ` +
      `p95 ${pct(data, "http_req_duration{phase:measure}", "p(95)")}   ` +
      `p99 ${pct(data, "http_req_duration{phase:measure}", "p(99)")} ms`,
    "  note: with a 93% redirect mix, p95 and p99 contain no redirects at all.",
    "        The blended tail is login and dashboard. Use the table below.",
    "",
    "  PER ENDPOINT (ms)",
    "  endpoint          n        p50      p95      p99",
  ];

  for (const op of OPS) {
    const key = `http_req_duration{op:${op},phase:measure}`;
    if (!data.metrics[key]) continue;
    const n = data.metrics[`http_reqs{op:${op},phase:measure}`]?.values?.count ?? 0;
    lines.push(
      "  " +
        op.padEnd(17) +
        String(n).padEnd(9) +
        pct(data, key, "med").padStart(7) +
        pct(data, key, "p(95)").padStart(9) +
        pct(data, key, "p(99)").padStart(9)
    );
  }

  lines.push("  ---------------------------------------------------------------", "");
  return lines.join("\n");
}
