// The headline workload: a weighted mix, not a single endpoint.
//
// Weights reflect how a link shortener is actually used. A link is created
// once and resolved many times, so reads dominate heavily. The 85/8 split
// between cache hit and cache miss encodes an assumed 91% hit rate, which is
// the single biggest lever on the result and is therefore stated explicitly
// in the results rather than buried here.
//
// Open model (constant-arrival-rate): offered load is fixed and latency is
// what gets measured. A closed model with N connections would instead report
// whatever throughput N connections happened to produce, which is a property
// of the test setup as much as of the server.
//
//   k6 run bench/k6/mixed.js

import {
  baseOptions,
  thresholds,
  RATE,
  WARMUP_S,
  DURATION_S,
  redirectHit,
  redirectMiss,
  create,
  login,
  analyticsDash,
  summaryTo,
} from "./common.js";

const share = (pctOfTotal) => Math.max(1, Math.round(RATE * pctOfTotal));

function measured(execName, pctOfTotal, opName) {
  const rate = share(pctOfTotal);
  return {
    executor: "constant-arrival-rate",
    rate,
    timeUnit: "1s",
    startTime: `${WARMUP_S}s`,
    duration: `${DURATION_S}s`,
    // Headroom so the generator itself is never the bottleneck. Dropped
    // iterations are treated as an invalid run, not as a server result.
    preAllocatedVUs: Math.max(10, rate),
    maxVUs: Math.max(50, rate * 4),
    exec: execName,
    tags: { phase: "measure", op: opName },
    gracefulStop: "10s",
  };
}

export const options = {
  ...baseOptions,
  thresholds,
  scenarios: {
    // Excluded from the reported numbers by the phase tag. V8 needs a few
    // thousand iterations before it reaches steady state, and the connection
    // pool needs to fill.
    warmup: {
      executor: "constant-arrival-rate",
      rate: Math.max(10, Math.round(RATE / 2)),
      timeUnit: "1s",
      duration: `${WARMUP_S}s`,
      preAllocatedVUs: 50,
      maxVUs: 200,
      exec: "redirectHit",
      tags: { phase: "warmup", op: "warmup" },
      gracefulStop: "5s",
    },

    redirect_hit: measured("redirectHit", 0.85, "redirect_hit"),
    redirect_miss: measured("redirectMiss", 0.08, "redirect_miss"),
    create_link: measured("create", 0.04, "create"),
    dashboard: measured("analyticsDash", 0.02, "analytics_dash"),
    auth_login: measured("login", 0.01, "login"),
  },
};

export { redirectHit, redirectMiss, create, login, analyticsDash };
export const handleSummary = summaryTo("mixed");
