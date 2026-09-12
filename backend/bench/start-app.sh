#!/usr/bin/env bash
#
# Starts the application under the pinned benchmark configuration.
#
#   bash bench/start-app.sh            # foreground
#   bash bench/start-app.sh &          # background
#
# Use this for BOTH phases. Starting the app any other way means the
# configuration is not recorded, and an unrecorded configuration makes the
# measurement unreproducible.

set -euo pipefail

cd "$(dirname "$0")/.."

# Load the pinned profile. `set -a` exports everything it defines.
set -a
# shellcheck disable=SC1091
source bench/env.bench
set +a

# Logs must land outside any synced folder. This repository sits inside a
# OneDrive tree and winston writes a rotating file on every request; leaving
# it there means the sync client wakes up mid-run and injects latency that
# cannot be accounted for afterwards.
: "${BENCH_LOG_DIR:=${TEMP:-/tmp}/shortify-bench-logs}"
LOG_DIR="$BENCH_LOG_DIR"
export LOG_DIR
mkdir -p "$LOG_DIR"

case "$LOG_DIR" in
  *OneDrive*|*Dropbox*|*"Google Drive"*)
    echo "refusing to start: LOG_DIR ($LOG_DIR) is inside a synced folder" >&2
    exit 1
    ;;
esac

echo "[bench] node      $(node --version)"
echo "[bench] NODE_ENV  $NODE_ENV"
echo "[bench] port      $PORT"
echo "[bench] pool max  $PG_POOL_MAX"
echo "[bench] bcrypt    $BCRYPT_ROUNDS"
echo "[bench] threadpool $UV_THREADPOOL_SIZE"
echo "[bench] LOG_DIR   $LOG_DIR"

# node directly, never nodemon: a file watcher on a synced folder is its own
# source of interference.
exec node src/index.js
