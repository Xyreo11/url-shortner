#!/usr/bin/env bash
#
# Runs the full measurement matrix for one phase and writes every raw summary
# under bench/results/<phase>/.
#
#   bash bench/run-matrix.sh baseline
#   bash bench/run-matrix.sh optimized
#
# Reset and warm run before EVERY measurement, so each starts from identical
# state. Without that, the cold pool drains, click counts accumulate and
# Redis fills with keys from the previous run, and later runs measure
# something different from earlier ones.

set -euo pipefail

PHASE="${1:-}"
if [[ "$PHASE" != "baseline" && "$PHASE" != "optimized" ]]; then
  echo "usage: bash bench/run-matrix.sh {baseline|optimized}" >&2
  exit 2
fi

cd "$(dirname "$0")/.."
export PATH="$PATH:/c/Program Files/k6"

# Fixed rate for the latency comparison. Chosen so the SLOWER build sustains
# it with headroom: comparing latency only means something when neither build
# is saturating. Measured separately, the pre-optimisation build holds 850
# rps and breaks at 1000, so 400 leaves ample room.
FIXED_RATE="${BENCH_FIXED_RATE:-400}"

RUNS="${BENCH_RUNS:-3}"
WARMUP="${BENCH_WARMUP_S:-20}"
DURATION="${BENCH_DURATION_S:-90}"
GAP="${BENCH_GAP_S:-45}"

# Capacity sweep. The highest rate that holds zero dropped iterations, zero
# failures and p99 under a second is the sustainable-throughput number.
SWEEP="${BENCH_SWEEP:-400 700 1000 1400 1900 2500}"
SWEEP_WARMUP="${BENCH_SWEEP_WARMUP_S:-8}"
SWEEP_DURATION="${BENCH_SWEEP_DURATION_S:-25}"

OUT="bench/results/$PHASE"
mkdir -p "$OUT"

banner() { printf '\n========== %s ==========\n' "$*"; }

prepare() {
  node bench/reset.mjs > /dev/null
  node bench/warm.mjs  > /dev/null
}

require_healthy() {
  for _ in $(seq 1 30); do
    if curl -sf -m 3 "${BENCH_BASE_URL:-http://localhost:3000}/health" > /dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "app is not healthy at ${BENCH_BASE_URL:-http://localhost:3000}/health" >&2
  exit 1
}

require_healthy
banner "phase: $PHASE   fixed rate: ${FIXED_RATE}/s   runs: $RUNS"

# ---------------------------------------------------------------------------
# 1. Mixed workload at a fixed arrival rate, repeated. The headline latency
#    comparison. Report the median across runs, not the best one.
# ---------------------------------------------------------------------------
for run in $(seq 1 "$RUNS"); do
  banner "mixed run $run/$RUNS"
  prepare
  BENCH_PHASE="$PHASE" BENCH_RUN="$run" \
  BENCH_RATE="$FIXED_RATE" BENCH_WARMUP_S="$WARMUP" BENCH_DURATION_S="$DURATION" \
    k6 run bench/k6/mixed.js 2>&1 | grep -E "requests |failed |dropped |p50 |p95 |p99 " || true

  if [[ "$run" -lt "$RUNS" ]]; then
    # This is a laptop. Back-to-back runs thermally throttle, and the later
    # ones would look slower for reasons that have nothing to do with the code.
    echo "  cooling for ${GAP}s..."
    sleep "$GAP"
  fi
done

# ---------------------------------------------------------------------------
# 2. Isolation runs. The mixed number is the headline; these give each
#    endpoint enough samples for a stable p99 and answer "did you only
#    benchmark the cheap path?".
# ---------------------------------------------------------------------------
for script in redirect_hit redirect_miss create analytics_dash login; do
  banner "isolation: $script"
  prepare
  BENCH_PHASE="$PHASE" BENCH_RUN="iso" \
  BENCH_RATE="$FIXED_RATE" BENCH_WARMUP_S=10 BENCH_DURATION_S=60 \
    k6 run "bench/k6/${script}.js" 2>&1 | grep -E "requests |failed |dropped |p50 |p95 |p99 " || true
  sleep 10
done

# ---------------------------------------------------------------------------
# 3. Capacity sweep. k6 exits non-zero when a threshold is crossed, which is
#    the signal that this rate is past the knee.
# ---------------------------------------------------------------------------
banner "capacity sweep"
for rate in $SWEEP; do
  prepare
  echo "--- offered ${rate}/s ---"
  BENCH_PHASE="$PHASE" BENCH_RUN="sweep-$rate" \
  BENCH_RATE="$rate" BENCH_WARMUP_S="$SWEEP_WARMUP" BENCH_DURATION_S="$SWEEP_DURATION" \
    k6 run bench/k6/mixed.js 2>&1 | grep -E "requests |failed |dropped |p50 |p95 |p99 " || true
  sleep 10
done

banner "done: raw summaries in $OUT"
ls -1 "$OUT"
