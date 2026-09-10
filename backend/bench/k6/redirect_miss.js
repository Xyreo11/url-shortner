// Isolation run: redirect_miss only.
//
// Every request misses Redis and reads Postgres. Codes are never reused within a run, because resolveUrl caches on a miss and a reused code would silently become a hit.
//
// The mixed workload is the headline; these exist so each endpoint gets
// enough samples for a stable p99, and so "did you only benchmark the cheap
// endpoint?" has a real answer.
//
//   k6 run bench/k6/redirect_miss.js

import {
  baseOptions,
  thresholds,
  RATE,
  WARMUP_S,
  DURATION_S,
  redirectMiss,
  summaryTo,
} from "./common.js";

export const options = {
  ...baseOptions,
  thresholds,
  scenarios: {
    warmup: {
      executor: "constant-arrival-rate",
      rate: Math.max(5, Math.round(RATE / 2)),
      timeUnit: "1s",
      duration: `${WARMUP_S}s`,
      preAllocatedVUs: 50,
      maxVUs: 200,
      exec: "redirectMiss",
      tags: { phase: "warmup", op: "redirect_miss" },
      gracefulStop: "5s",
    },
    measure: {
      executor: "constant-arrival-rate",
      rate: RATE,
      timeUnit: "1s",
      startTime: `${WARMUP_S}s`,
      duration: `${DURATION_S}s`,
      preAllocatedVUs: Math.max(10, RATE),
      maxVUs: Math.max(50, RATE * 4),
      exec: "redirectMiss",
      tags: { phase: "measure", op: "redirect_miss" },
      gracefulStop: "10s",
    },
  },
};

export { redirectMiss };
export const handleSummary = summaryTo("redirect_miss");
