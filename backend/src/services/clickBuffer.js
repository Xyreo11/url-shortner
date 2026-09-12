// Write-behind buffering for click tracking.
//
// The redirect used to await an analytics INSERT and a click-count UPDATE
// before responding, so every visitor paid for two Postgres round trips they
// gained nothing from. Those writes now happen here, on a timer, off the
// request path.
//
// Two buffers, not one, because these are different kinds of data:
//
//   Analytics rows are immutable facts. N clicks produce N rows, they cannot
//   be compressed, and under sustained overload some have to be shed.
//
//   Click counts are a mergeable counter. N clicks on one code produce ONE
//   increment of N. They compress losslessly, so they are never dropped; if
//   the number of distinct codes grows, the buffer flushes early instead.
//
// Treating them the same would mean either dropping counts that could have
// been merged for free, or keeping rows that cannot be.

import { db } from "../config/db.js";
import { counters } from "../utils/metrics.js";

const FLUSH_INTERVAL_MS = 500;

// Flush triggers.
const FLUSH_AT_ROWS = 500;
const FLUSH_AT_CODES = 2000;

// Hard cap on buffered rows. Beyond this, new rows are dropped.
const MAX_BUFFERED_ROWS = 20000;

let rows = [];
let counts = new Map();

// Exactly one flush in flight at a time.
//
// This is a correctness requirement, not a nicety. The grouped UPDATE below
// touches many rows of `urls` in one statement, and two overlapping flushes
// with overlapping code sets can acquire those row locks in different orders
// and deadlock. Single flight plus sorted codes makes the order deterministic.
let flushing = false;
let timer = null;

/**
 * Records a click. Synchronous, allocation-light, never throws, never awaits.
 * The caller has already sent the response by this point.
 */
export function track(event) {
  counters.clicksBuffered += 1;

  // Counts first, and unconditionally. A viral link contributes one key
  // regardless of how many clicks it takes, so this is bounded by the number
  // of distinct codes in the window, not by traffic.
  counts.set(event.shortCode, (counts.get(event.shortCode) || 0) + 1);

  if (rows.length < MAX_BUFFERED_ROWS) {
    rows.push(event);
  } else {
    // Drop NEWEST, not oldest.
    //
    // Both shed a contiguous window, so neither is informationally better,
    // and the decisive arguments are mechanical: this is O(1) where
    // drop-oldest needs a shift or a ring buffer, and dropping the newest
    // keeps the rows the flusher is about to send rather than discarding work
    // already done in favour of work not yet started.
    counters.clicksDropped += 1;
  }

  if (rows.length >= FLUSH_AT_ROWS || counts.size >= FLUSH_AT_CODES) {
    void flush();
  }
}

/**
 * Writes whatever is buffered. Safe to call concurrently: overlapping calls
 * return immediately rather than stacking.
 */
export async function flush() {
  if (flushing) return;
  if (rows.length === 0 && counts.size === 0) return;

  flushing = true;
  const batchRows = rows;
  const batchCounts = counts;
  rows = [];
  counts = new Map();

  try {
    if (batchRows.length > 0) await insertRows(batchRows);
    if (batchCounts.size > 0) await applyCounts(batchCounts);

    counters.flushes += 1;
    counters.clicksFlushed += batchRows.length;
    counters.countsFlushed += batchCounts.size;
  } catch (err) {
    counters.flushErrors += 1;
    console.error("[clicks] flush failed:", err.message);

    // Counts are merged back and retried on the next tick. They are bounded
    // by distinct codes, so this cannot grow without limit, and losing a
    // count loses data that was cheap to keep.
    for (const [code, n] of batchCounts) {
      counts.set(code, (counts.get(code) || 0) + n);
    }

    // Rows are dropped. Retaining them across a sustained outage would grow
    // without bound and turn a database problem into an out-of-memory crash.
    counters.clicksDropped += batchRows.length;
  } finally {
    flushing = false;
  }
}

/**
 * One multi-row INSERT via unnest rather than N statements.
 *
 * Worth being precise about what this saves: it amortises per-statement
 * overhead, not index maintenance. The analytics table carries five secondary
 * indexes plus its primary key, so Postgres still does six index updates per
 * row. The win is that it now does them off the request path, in a batch,
 * where there is capacity for it.
 */
async function insertRows(batch) {
  const shortCodes = new Array(batch.length);
  const ipHashes = new Array(batch.length);
  const devices = new Array(batch.length);
  const browsers = new Array(batch.length);
  const oses = new Array(batch.length);
  const countries = new Array(batch.length);
  const isQRs = new Array(batch.length);
  const referrers = new Array(batch.length);
  const timestamps = new Array(batch.length);

  for (let i = 0; i < batch.length; i++) {
    const e = batch[i];
    shortCodes[i] = e.shortCode;
    ipHashes[i] = e.ipHash;
    devices[i] = e.device;
    browsers[i] = e.browser;
    oses[i] = e.os;
    countries[i] = e.country;
    isQRs[i] = e.isQR;
    referrers[i] = e.referrer;
    timestamps[i] = e.at;
  }

  await db.query(
    `INSERT INTO analytics
       (short_code, ip_hash, device, browser, os, country, is_qr, referrer, "timestamp")
     SELECT * FROM unnest(
       $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
       $6::text[], $7::boolean[], $8::text[], $9::timestamptz[]
     )`,
    [shortCodes, ipHashes, devices, browsers, oses, countries, isQRs, referrers, timestamps]
  );
}

/**
 * One grouped UPDATE rather than one per click.
 *
 * The original `UPDATE urls SET click_count = click_count + 1` took a row
 * lock, so every concurrent click on the same code serialised behind it and
 * each waiter held a pool connection while it waited. On a popular link that
 * is both a throughput ceiling and a pool-exhaustion risk. Merging clicks
 * per code collapses those N lock acquisitions into one.
 *
 * Codes are sorted so lock acquisition order is deterministic across
 * concurrent flushes, including flushes from other application instances.
 */
async function applyCounts(batch) {
  const codes = [...batch.keys()].sort();
  const increments = codes.map((code) => batch.get(code));

  await db.query(
    `UPDATE urls u
        SET click_count = u.click_count + c.n
       FROM (SELECT * FROM unnest($1::text[], $2::bigint[]) AS t(code, n)) c
      WHERE u.short_code = c.code`,
    [codes, increments]
  );
}

export function startClickFlusher(intervalMs = FLUSH_INTERVAL_MS) {
  if (timer) return timer;
  timer = setInterval(() => {
    void flush();
  }, intervalMs);
  // unref so a pending flush timer never holds the process open by itself.
  timer.unref();
  return timer;
}

export function stopClickFlusher() {
  if (timer) clearInterval(timer);
  timer = null;
}

/**
 * Called during shutdown, before the connection pool closes.
 *
 * A crash still loses up to one flush interval of clicks. That is the trade
 * every analytics pipeline makes, and the rows and the counts come from the
 * same buffer, so they stay mutually consistent: you never see a count
 * without its rows. If that were unacceptable the answer is a durable
 * append-only log, not a synchronous insert on the request path.
 */
export async function drainClickBuffer() {
  stopClickFlusher();

  // Wait out an in-flight flush rather than racing it.
  for (let i = 0; i < 50 && flushing; i++) {
    await new Promise((r) => setTimeout(r, 20));
  }

  await flush();
}

/** Test seam. */
export function _bufferState() {
  return { rows: rows.length, codes: counts.size, flushing };
}

/** Test seam: discards all buffered state without writing it. */
export function _resetBuffer() {
  rows = [];
  counts = new Map();
  flushing = false;
  stopClickFlusher();
}
