// Isolation run: create only.
//
// The write path: rate limit, blacklist, dedupe lookup, insert. The rate limit must be raised for this run or it measures 429s; that override is disclosed in the results.
//
// The mixed workload is the headline; these exist so each endpoint gets
// enough samples for a stable p99, and so "did you only benchmark the cheap
// endpoint?" has a real answer.
//
//   k6 run bench/k6/create.js

import {
  baseOptions,
  thresholds,
  RATE,
  WARMUP_S,
  DURATION_S,
  create,
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
      exec: "create",
      tags: { phase: "warmup", op: "create" },
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
      exec: "create",
      tags: { phase: "measure", op: "create" },
      gracefulStop: "10s",
    },
  },
};

export { create };
export const handleSummary = summaryTo("create");
