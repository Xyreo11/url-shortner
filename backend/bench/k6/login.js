// Isolation run: login only.
//
// bcrypt bound by design. Included because it saturates the libuv threadpool and inflates every other endpoint in the mixed run, which is worth knowing about.
//
// The mixed workload is the headline; these exist so each endpoint gets
// enough samples for a stable p99, and so "did you only benchmark the cheap
// endpoint?" has a real answer.
//
//   k6 run bench/k6/login.js

import {
  baseOptions,
  thresholds,
  RATE,
  WARMUP_S,
  DURATION_S,
  login,
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
      exec: "login",
      tags: { phase: "warmup", op: "login" },
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
      exec: "login",
      tags: { phase: "measure", op: "login" },
      gracefulStop: "10s",
    },
  },
};

export { login };
export const handleSummary = summaryTo("login");
