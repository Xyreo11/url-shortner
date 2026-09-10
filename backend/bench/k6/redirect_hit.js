// Isolation run: redirect_hit only.
//
// Every request resolves from Redis. This is the cheapest path in the system and flatters the result, which is exactly why it is reported next to the mix rather than alone.
//
// The mixed workload is the headline; these exist so each endpoint gets
// enough samples for a stable p99, and so "did you only benchmark the cheap
// endpoint?" has a real answer.
//
//   k6 run bench/k6/redirect_hit.js

import {
  baseOptions,
  thresholds,
  RATE,
  WARMUP_S,
  DURATION_S,
  redirectHit,
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
      exec: "redirectHit",
      tags: { phase: "warmup", op: "redirect_hit" },
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
      exec: "redirectHit",
      tags: { phase: "measure", op: "redirect_hit" },
      gracefulStop: "10s",
    },
  },
};

export { redirectHit };
export const handleSummary = summaryTo("redirect_hit");
