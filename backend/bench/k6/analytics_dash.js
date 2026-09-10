// Isolation run: analytics_dash only.
//
// Three aggregate queries over the seeded analytics rows. Low frequency, high cost per call, so it shapes the tail rather than the median.
//
// The mixed workload is the headline; these exist so each endpoint gets
// enough samples for a stable p99, and so "did you only benchmark the cheap
// endpoint?" has a real answer.
//
//   k6 run bench/k6/analytics_dash.js

import {
  baseOptions,
  thresholds,
  RATE,
  WARMUP_S,
  DURATION_S,
  analyticsDash,
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
      exec: "analyticsDash",
      tags: { phase: "warmup", op: "analytics_dash" },
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
      exec: "analyticsDash",
      tags: { phase: "measure", op: "analytics_dash" },
      gracefulStop: "10s",
    },
  },
};

export { analyticsDash };
export const handleSummary = summaryTo("analytics_dash");
