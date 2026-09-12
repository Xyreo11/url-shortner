// Process metrics for benchmarking and operational visibility.
//
// Deliberately counters and gauges only. Nothing here allocates per request:
// no latency arrays, no histograms built in JavaScript. A per-request push
// into an array would add allocation and GC pressure to the very path being
// measured, which does not bias the before/after delta but does depress the
// absolute ceiling and muddy the capacity number.
//
// The point of these is attribution. On a thermally throttling laptop with
// the load generator sharing the machine, a 0.4ms change in p50 is inside the
// noise floor and cannot carry a causal claim. "Redis commands per redirect
// went from 2.00 to 1.00" is exact, needs a 45-second run rather than a
// four-minute sweep, and a reviewer can verify it from the source.

import { monitorEventLoopDelay } from "node:perf_hooks";

// 20ms resolution. The 10ms default is fine and 1ms would fire a timer a
// thousand times a second for no extra insight at these latencies.
const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();

export const counters = {
  // Request outcomes
  redirects: 0,
  redirectsNotFound: 0,

  // I/O actually issued. These are the attribution metrics: each optimisation
  // should move one of them by a whole number, not by a percentage.
  redisCommands: 0,
  pgQueries: 0,

  // Cache tiers
  l1Hits: 0,
  l2Hits: 0,
  cacheMisses: 0,
  negativeHits: 0,

  // Write-behind click buffer
  clicksBuffered: 0,
  clicksFlushed: 0,
  clicksDropped: 0,
  countsFlushed: 0,
  flushes: 0,
  flushErrors: 0,

  // Destinations rejected at read time because they are not http(s). Non-zero
  // means there are rows predating URL validation.
  badDestinations: 0,
};

let pool = null;

/** Called once at startup so /metrics can report pool saturation. */
export function registerPool(p) {
  pool = p;
}

export function snapshot() {
  const cpu = process.cpuUsage();
  const mem = process.memoryUsage();

  return {
    uptimeSeconds: Math.round(process.uptime()),
    counters: { ...counters },

    derived: {
      // The headline attribution figures. Whole numbers, not percentages.
      redisCommandsPerRedirect: ratio(counters.redisCommands, counters.redirects),
      pgQueriesPerRedirect: ratio(counters.pgQueries, counters.redirects),
      cpuMicrosPerRedirect: ratio(cpu.user + cpu.system, counters.redirects),
    },

    cpuMicros: { user: cpu.user, system: cpu.system },

    memoryBytes: { rss: mem.rss, heapUsed: mem.heapUsed },

    // Event loop delay in milliseconds. A rising p99 here means the main
    // thread is being blocked, which is what synchronous work on the hot path
    // looks like from the outside.
    eventLoopDelayMs: {
      mean: round(loopDelay.mean / 1e6),
      p50: round(loopDelay.percentile(50) / 1e6),
      p99: round(loopDelay.percentile(99) / 1e6),
      max: round(loopDelay.max / 1e6),
    },

    // waitingCount above zero means requests are queueing for a connection,
    // which is the pool acting as a throughput ceiling.
    pool: pool
      ? { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount }
      : null,
  };
}

/** Zeroes everything, so a run can be measured in isolation. */
export function resetMetrics() {
  for (const key of Object.keys(counters)) counters[key] = 0;
  loopDelay.reset();
  return process.cpuUsage();
}

function ratio(numerator, denominator) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(3)) : null;
}

function round(n) {
  return Number.isFinite(n) ? Number(n.toFixed(3)) : null;
}
