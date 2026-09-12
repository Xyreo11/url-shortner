#!/usr/bin/env node
//
// Reads the saved k6 summaries for both phases and prints the comparison.
//
//   node bench/compare.mjs
//
// Reports the median across repeated runs rather than the best one, and
// prints the spread, because a single run on a laptop that thermally
// throttles is not a measurement.

import fs from "node:fs";
import path from "node:path";

const OPS = ["redirect_hit", "redirect_miss", "create", "analytics_dash", "login"];
const PHASES = ["baseline", "optimized"];
const DIR = (p) => path.join("bench", "results", p);

const read = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};

const median = (xs) => {
  const s = [...xs].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (s.length === 0) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const fmt = (n, d = 2) => (n === null || n === undefined ? "-" : n.toFixed(d));

function pctChange(before, after) {
  if (!Number.isFinite(before) || !Number.isFinite(after) || before === 0) return "-";
  const change = ((after - before) / before) * 100;
  return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
}

function durationValues(summary, key) {
  return summary?.metrics?.[key]?.values ?? null;
}

// ---------------------------------------------------------------------------
// 1. Mixed workload, median across runs
// ---------------------------------------------------------------------------
console.log("\n=== MIXED WORKLOAD, median of repeated runs at a fixed arrival rate ===\n");

const mixed = {};
for (const phase of PHASES) {
  const runs = [1, 2, 3].map((n) => read(path.join(DIR(phase), `mixed-${n}.json`))).filter(Boolean);
  if (runs.length === 0) continue;

  const pick = (key, stat) =>
    median(runs.map((r) => durationValues(r, key)?.[stat]).filter(Number.isFinite));

  mixed[phase] = {
    runs: runs.length,
    blended: {
      p50: pick("http_req_duration{phase:measure}", "med"),
      p95: pick("http_req_duration{phase:measure}", "p(95)"),
      p99: pick("http_req_duration{phase:measure}", "p(99)"),
    },
    spread: runs.map((r) => durationValues(r, "http_req_duration{phase:measure}")?.med),
    failed: median(runs.map((r) => r.metrics["http_req_failed{phase:measure}"]?.values?.rate * 100)),
    dropped: Math.max(...runs.map((r) => r.metrics.dropped_iterations?.values?.count ?? 0)),
    perOp: Object.fromEntries(
      OPS.map((op) => {
        const key = `http_req_duration{op:${op},phase:measure}`;
        return [
          op,
          {
            p50: pick(key, "med"),
            p95: pick(key, "p(95)"),
            p99: pick(key, "p(99)"),
          },
        ];
      })
    ),
  };
}

if (mixed.baseline && mixed.optimized) {
  console.log(
    `runs per phase: ${mixed.baseline.runs}   ` +
      `dropped iterations: baseline ${mixed.baseline.dropped}, optimized ${mixed.optimized.dropped}   ` +
      `failures: ${fmt(mixed.baseline.failed, 3)}% / ${fmt(mixed.optimized.failed, 3)}%`
  );
  console.log(
    `p50 spread across runs: baseline [${mixed.baseline.spread.map((n) => fmt(n)).join(", ")}]  ` +
      `optimized [${mixed.optimized.spread.map((n) => fmt(n)).join(", ")}]`
  );

  console.log("\n  endpoint          metric   baseline   optimized     change");
  console.log("  " + "-".repeat(58));
  for (const op of OPS) {
    for (const stat of ["p50", "p95", "p99"]) {
      const b = mixed.baseline.perOp[op][stat];
      const o = mixed.optimized.perOp[op][stat];
      if (b === null && o === null) continue;
      console.log(
        "  " +
          (stat === "p50" ? op.padEnd(17) : " ".repeat(17)) +
          stat.padEnd(9) +
          fmt(b).padStart(8) +
          fmt(o).padStart(12) +
          pctChange(b, o).padStart(11)
      );
    }
  }

  console.log("\n  BLENDED (contains no redirects at p95 or p99; see notes)");
  for (const stat of ["p50", "p95", "p99"]) {
    console.log(
      "  " +
        " ".repeat(17) +
        stat.padEnd(9) +
        fmt(mixed.baseline.blended[stat]).padStart(8) +
        fmt(mixed.optimized.blended[stat]).padStart(12) +
        pctChange(mixed.baseline.blended[stat], mixed.optimized.blended[stat]).padStart(11)
    );
  }
}

// ---------------------------------------------------------------------------
// 2. Isolation runs
// ---------------------------------------------------------------------------
console.log("\n\n=== ISOLATION RUNS, one endpoint at a time ===\n");
console.log("  endpoint          metric   baseline   optimized     change");
console.log("  " + "-".repeat(58));

for (const op of OPS) {
  const b = read(path.join(DIR("baseline"), `${op}-iso.json`));
  const o = read(path.join(DIR("optimized"), `${op}-iso.json`));
  const key = `http_req_duration{op:${op},phase:measure}`;
  for (const [label, stat] of [
    ["p50", "med"],
    ["p95", "p(95)"],
    ["p99", "p(99)"],
  ]) {
    const bv = durationValues(b, key)?.[stat];
    const ov = durationValues(o, key)?.[stat];
    if (bv === undefined && ov === undefined) continue;
    console.log(
      "  " +
        (label === "p50" ? op.padEnd(17) : " ".repeat(17)) +
        label.padEnd(9) +
        fmt(bv).padStart(8) +
        fmt(ov).padStart(12) +
        pctChange(bv, ov).padStart(11)
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Capacity sweep
// ---------------------------------------------------------------------------
console.log("\n\n=== CAPACITY SWEEP ===");
console.log("Sustainable means zero dropped iterations, zero failures, p99 under 1s.\n");
console.log("  offered   phase       achieved   p99(ms)   dropped   failed%   verdict");
console.log("  " + "-".repeat(70));

const rates = [400, 700, 1000, 1400, 1900, 2500];
const maxSustained = { baseline: 0, optimized: 0 };

for (const rate of rates) {
  for (const phase of PHASES) {
    const s = read(path.join(DIR(phase), `mixed-sweep-${rate}.json`));
    if (!s) continue;
    const achieved = s.metrics.http_reqs?.values?.rate ?? 0;
    const p99 = durationValues(s, "http_req_duration{phase:measure}")?.["p(99)"] ?? Infinity;
    const dropped = s.metrics.dropped_iterations?.values?.count ?? 0;
    const failed = (s.metrics["http_req_failed{phase:measure}"]?.values?.rate ?? 0) * 100;

    const ok = dropped === 0 && failed === 0 && p99 < 1000;
    if (ok) maxSustained[phase] = Math.max(maxSustained[phase], rate);

    console.log(
      "  " +
        String(rate).padEnd(10) +
        phase.padEnd(12) +
        fmt(achieved, 1).padStart(8) +
        fmt(p99).padStart(10) +
        String(dropped).padStart(10) +
        fmt(failed, 2).padStart(10) +
        "   " +
        (ok ? "sustained" : "SATURATED")
    );
  }
}

console.log(
  `\n  max sustained: baseline ${maxSustained.baseline}/s, ` +
    `optimized ${maxSustained.optimized}/s` +
    (maxSustained.baseline > 0
      ? `  (${(maxSustained.optimized / maxSustained.baseline).toFixed(2)}x)`
      : "")
);

// ---------------------------------------------------------------------------
// 4. Counters
// ---------------------------------------------------------------------------
console.log("\n\n=== WORK PER REDIRECT (deterministic, from /metrics) ===\n");
console.log("  metric                      baseline   optimized");
console.log("  " + "-".repeat(48));
for (const [label, field] of [
  ["Redis commands per redirect", "redisCommandsPerRedirect"],
  ["Postgres queries per redirect", "pgQueriesPerRedirect"],
  ["CPU microseconds per redirect", "cpuMicrosPerRedirect"],
]) {
  const b = read(path.join(DIR("baseline"), "metrics-end.json"))?.derived?.[field];
  const o = read(path.join(DIR("optimized"), "metrics-end.json"))?.derived?.[field];
  console.log("  " + label.padEnd(30) + fmt(b, 3).padStart(8) + fmt(o, 3).padStart(12));
}
console.log("");
