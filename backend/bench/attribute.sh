#!/usr/bin/env bash
#
# Per-commit attribution.
#
# Checks out each optimisation commit in turn, runs one short isolated
# redirect load, and records the DETERMINISTIC counters rather than leaning on
# latency. On a thermally throttling laptop with the load generator sharing
# the machine, a fraction of a millisecond in p50 is inside the noise floor
# and cannot carry a causal claim. "Redis commands per redirect went from 2.00
# to 1.00" is exact, reproducible, and checkable against the source.
#
#   bash bench/attribute.sh
#
# Writes bench/results/attribution.tsv

set -uo pipefail
cd "$(dirname "$0")/.."

export PATH="$PATH:/c/Program Files/k6"
OUT="bench/results/attribution.tsv"
LOGDIR="${BENCH_LOG_DIR:-${TEMP:-/tmp}/shortify-bench-logs}"

RATE="${BENCH_RATE:-400}"
WARMUP="${BENCH_WARMUP_S:-10}"
DURATION="${BENCH_DURATION_S:-45}"

# commit<TAB>label, oldest first. The first row is the baseline: everything in
# Phase A, none of the optimisation work.
STEPS=$(cat <<'EOF'
f72a90f	baseline (instrumented)
f83bd96	B1a remove console.log
05e5376	B1b sync waste
275fcbc	B2 direct 302
43a0101	B3 middleware scoping
66f2124	B4 write-behind clicks
2362243	B5 one redis cmd per read
710a996	B7 near cache
0df8684	B8 dashboard
EOF
)

printf 'commit\tlabel\tredis_per_redirect\tpg_per_redirect\tcpu_us_per_redirect\tloop_p99_ms\tp50_ms\tp95_ms\tp99_ms\trps\n' > "$OUT"

start_app() {
  bash bench/start-app.sh > "$LOGDIR/app-attr.log" 2>&1 &
  APP_PID=$!
  for _ in $(seq 1 40); do
    if curl -sf -m 2 http://localhost:3000/health > /dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "app failed to become healthy" >&2
  return 1
}

stop_app() {
  [ -n "${APP_PID:-}" ] && kill "$APP_PID" 2>/dev/null
  for _ in $(seq 1 20); do
    curl -sf -m 1 http://localhost:3000/health > /dev/null 2>&1 || return 0
    sleep 1
  done
}

while IFS=$'\t' read -r sha label; do
  [ -z "$sha" ] && continue
  echo ""
  echo "########## $label ($sha) ##########"

  git checkout -q "$sha" 2>/dev/null || { echo "checkout failed"; continue; }

  node bench/reset.mjs > /dev/null 2>&1
  node bench/warm.mjs  > /dev/null 2>&1

  start_app || { stop_app; continue; }

  curl -sf -X POST http://localhost:3000/metrics/reset > /dev/null 2>&1

  BENCH_PHASE=attribution BENCH_RUN="$sha" \
  BENCH_RATE="$RATE" BENCH_WARMUP_S="$WARMUP" BENCH_DURATION_S="$DURATION" \
    k6 run bench/k6/redirect_hit.js > "$LOGDIR/k6-$sha.log" 2>&1

  curl -sf -m 5 http://localhost:3000/metrics > "$LOGDIR/metrics-$sha.json" 2>/dev/null

  node -e "
    const fs = require('fs');
    const m = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    const k = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    const d = k.metrics['http_req_duration{op:redirect_hit,phase:measure}'];
    const v = d ? d.values : {};
    const out = [
      process.argv[3], process.argv[4],
      m.derived.redisCommandsPerRedirect, m.derived.pgQueriesPerRedirect,
      m.derived.cpuMicrosPerRedirect, m.eventLoopDelayMs.p99,
      (v.med ?? '').toFixed ? v.med.toFixed(2) : '',
      (v['p(95)'] ?? '').toFixed ? v['p(95)'].toFixed(2) : '',
      (v['p(99)'] ?? '').toFixed ? v['p(99)'].toFixed(2) : '',
      k.metrics.http_reqs ? k.metrics.http_reqs.values.rate.toFixed(1) : '',
    ].join('\t');
    console.log(out);
    fs.appendFileSync(process.argv[5], out + '\n');
  " "$LOGDIR/metrics-$sha.json" "bench/results/attribution/redirect_hit-$sha.json" "$sha" "$label" "$OUT" 2>/dev/null \
    || echo "  (could not parse results for $sha)"

  stop_app
  sleep 5
done <<< "$STEPS"

echo ""
echo "########## attribution ##########"
column -t -s $'\t' "$OUT" 2>/dev/null || cat "$OUT"
