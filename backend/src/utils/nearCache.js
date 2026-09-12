// An in-process cache in front of Redis: the L1 of a two-tier setup.
//
// After the click writes moved off the request path and the instrumentation
// round trip went away, a cache-hit redirect was Express routing plus exactly
// one Redis GET. This removes that too, so a hot redirect completes in a
// single tick with no I/O at all.
//
// Generational, not LRU, and deliberately so.
//
// Two maps, hot and cold. Reads check hot, then cold, promoting on a cold
// hit. On a timer, cold is discarded, hot becomes cold, and a fresh hot is
// started. An entry therefore lives between one and two rotation intervals,
// which gives expiry, bounded memory and O(1) operations without a single
// timer per entry -- a Map holding ten thousand setTimeouts is a pathology.
// It is also far easier to explain than an LRU, and the code is shorter.
//
// STALENESS, stated precisely, because the obvious worry is the wrong one:
//
//   Positive entries cannot be wrong. Nothing in this system mutates the
//   mapping from a short code to a destination once it exists: there is no
//   delete and no edit. A cached entry can only be absent, and absence falls
//   through to Redis and then Postgres. Cross-instance inconsistency on
//   positive entries is therefore unobservable.
//
//   That stops being true the moment a delete or edit endpoint is added. At
//   that point this needs an explicit invalidation channel between instances,
//   and Redis pub/sub is the obvious one. It is not built, and pretending
//   otherwise would be the dishonest version of this comment.
//
//   The TTL is short not because correctness requires it today, but to bound
//   the blast radius when that day comes: "worst case stale for 60 seconds"
//   is a sentence that survives the change.

import { config } from "../config/env.js";
import { counters } from "./metrics.js";

let hot = new Map();
let cold = new Map();
let timer = null;

const MAX_ENTRIES = () => config.NEAR_CACHE_MAX_ENTRIES;

export function nearGet(key) {
  const fromHot = hot.get(key);
  if (fromHot !== undefined) {
    counters.l1Hits += 1;
    return fromHot;
  }

  const fromCold = cold.get(key);
  if (fromCold !== undefined) {
    // Promote, so something still being read survives the next rotation.
    hot.set(key, fromCold);
    counters.l1Hits += 1;
    return fromCold;
  }

  return undefined;
}

export function nearSet(key, value) {
  hot.set(key, value);

  // Bound by entry count. Rotating early is what keeps memory flat under a
  // flood of distinct keys, and costs one discarded generation.
  if (hot.size >= MAX_ENTRIES()) rotate();
}

export function nearDelete(key) {
  hot.delete(key);
  cold.delete(key);
}

export function rotate() {
  cold = hot;
  hot = new Map();
}

export function startNearCacheRotation(intervalMs) {
  if (timer) return timer;
  const ms = intervalMs ?? Math.max(1000, (config.NEAR_CACHE_TTL_S * 1000) / 2);
  timer = setInterval(rotate, ms);
  timer.unref();
  return timer;
}

export function stopNearCacheRotation() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function nearCacheStats() {
  return { hot: hot.size, cold: cold.size, maxEntries: MAX_ENTRIES() };
}

/** Test seam. */
export function _clearNearCache() {
  hot = new Map();
  cold = new Map();
  stopNearCacheRotation();
}
