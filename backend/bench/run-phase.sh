#!/usr/bin/env bash
#
# Runs a full measurement matrix for one build, end to end.
#
#   bash bench/run-phase.sh baseline  bench-baseline
#   bash bench/run-phase.sh optimized bench-optimized
#
# Checks out the given ref, starts the app under the pinned profile, runs the
# matrix, captures /metrics around it, then stops the app and returns to the
# branch. Both phases go through this same script so the only difference
# between them is the application code.

set -uo pipefail
cd "$(dirname "$0")/.."

PHASE="${1:?usage: run-phase.sh <phase> <ref>}"
REF="${2:?usage: run-phase.sh <phase> <ref>}"
BRANCH="${BENCH_RETURN_BRANCH:-perf/redirect-path}"
LOGDIR="${BENCH_LOG_DIR:-${TEMP:-/tmp}/shortify-bench-logs}"
mkdir -p "$LOGDIR" "bench/results/$PHASE"

echo "########## phase $PHASE, ref $REF ##########"
git checkout -q "$REF" || { echo "checkout failed"; exit 1; }
echo "code under test: $(git rev-parse --short HEAD)"

bash bench/start-app.sh > "$LOGDIR/app-$PHASE.log" 2>&1 &
APP_PID=$!

ready=0
for _ in $(seq 1 45); do
  if curl -sf -m 2 http://localhost:3000/health > /dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "app never became healthy; aborting"
  kill "$APP_PID" 2>/dev/null
  git checkout -q "$BRANCH"
  exit 1
fi

curl -sf -X POST http://localhost:3000/metrics/reset > /dev/null 2>&1
curl -sf -m 5 http://localhost:3000/metrics > "bench/results/$PHASE/metrics-start.json" 2>/dev/null

bash bench/run-matrix.sh "$PHASE"
MATRIX_EXIT=$?

curl -sf -m 5 http://localhost:3000/metrics > "bench/results/$PHASE/metrics-end.json" 2>/dev/null

# Record exactly what was measured, so the numbers are reproducible later.
{
  echo "phase:      $PHASE"
  echo "ref:        $REF"
  echo "commit:     $(git rev-parse HEAD)"
  echo "node:       $(node --version)"
  echo "k6:         $(k6 version 2>/dev/null | head -1)"
  echo "postgres:   $(docker inspect --format '{{.Config.Image}}' urlshort-bench-postgres-1 2>/dev/null)"
  echo "redis:      $(docker inspect --format '{{.Config.Image}}' urlshort-bench-redis-1 2>/dev/null)"
  echo "os:         $(uname -s -r 2>/dev/null)"
  echo "measured:   $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo ""
  echo "--- pinned application configuration ---"
  grep -vE '^\s*#|^\s*$' bench/env.bench
  echo ""
  echo "--- pinned harness configuration ---"
  grep -vE '^\s*#|^\s*$' bench/.env.bench | sed 's#://[^@]*@#://***:***@#'
} > "bench/results/$PHASE/conditions.txt"

kill "$APP_PID" 2>/dev/null
sleep 3
git checkout -q "$BRANCH"

echo "########## $PHASE done (matrix exit $MATRIX_EXIT) ##########"
ls -1 "bench/results/$PHASE"
