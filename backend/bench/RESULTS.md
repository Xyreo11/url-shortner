# Benchmark results

Measured 2026-09-12. Regenerate the tables with `node bench/compare.mjs`.
Raw k6 summaries and the exact conditions for each phase are committed
alongside this file under `bench/results/`.

## Read this first

**The headline number is the redirect, not the blend.**

The workload is 93% redirect, 4% create, 2% dashboard, 1% login. p95 is the
top 5% of requests and p99 the top 1%, so both sit entirely inside the login
and dashboard populations. The blended p99 is bcrypt by construction and would
read the same if the redirect handler returned a constant. It is reported
below for completeness and is not the claim.

**Conditions, stated up front because they bound what these numbers mean.**

| | |
|---|---|
| Hardware | One Windows laptop, load generator co-located with the service |
| Service | Node v24.11.0, run natively |
| Dependencies | postgres:15 and redis:7 in Docker |
| Load tool | k6 v2.2.0, `constant-arrival-rate` |
| Data | 50,000 links, 500,000 analytics rows, 10 users |
| Assumed cache hit rate | 91%, encoded as an 85/8 hit/miss split |
| bcrypt cost | 10, identical in both phases |
| Connection pool | 20, identical in both phases |
| Rate limit | Raised so the create scenario measures the write path, not 429s |
| Runs | 3 per phase, median reported, spread shown |

The load generator sharing the machine is the largest caveat. It is constant
across phases so the comparison holds, but the absolute figures would differ
on real infrastructure.

## Redirect latency, mixed workload at 400 req/s

Median of three runs. Zero dropped iterations and zero failures in every run.
p50 spread was [6.94, 7.16, 7.29] baseline and [0.55, 0.54, 0.52] optimized.

| Endpoint | Metric | Baseline | Optimized | Change |
|---|---|---|---|---|
| Redirect, cache hit | p50 | 6.88 ms | 0.51 ms | −92.5% |
| | p95 | 10.59 ms | 1.59 ms | −85.0% |
| | p99 | 25.59 ms | 2.05 ms | −92.0% |
| Redirect, cache miss | p50 | 9.27 ms | 2.62 ms | −71.8% |
| | p99 | 26.76 ms | 5.46 ms | −79.6% |
| Analytics dashboard | p50 | 106.03 ms | 69.99 ms | −34.0% |
| Login | p50 | 86.63 ms | 79.18 ms | −8.6% |
| **Create** | **p50** | **9.65 ms** | **10.80 ms** | **+12.0%** |
| | **p99** | **23.09 ms** | **32.30 ms** | **+39.9%** |

## Capacity

Sustainable means zero dropped iterations, zero failures and p99 under one
second.

| Offered | Baseline p99 | Baseline | Optimized p99 | Optimized |
|---|---|---|---|---|
| 400/s | 103 ms | sustained | 76 ms | sustained |
| 700/s | 145 ms | sustained | 82 ms | sustained |
| 1000/s | 1303 ms | saturated, 37 dropped | 106 ms | sustained |
| 1400/s | 7343 ms | saturated | 696 ms | saturated, 5 dropped |

**Max sustained throughput went from 700 to 1000 requests per second, a 1.43x
improvement.** At an offered 2500/s, beyond both builds' limits, the baseline
achieved 1082/s and the optimized build 1894/s.

## Work per redirect

Deterministic counters from `/metrics`, measured on the isolated redirect path
at a fixed 400 req/s. These are exact rather than statistical, which is why
they carry the causal claim rather than the latency deltas.

| Step | Redis cmds | Postgres queries | CPU µs | p50 | p99 |
|---|---|---|---|---|---|
| Baseline | 2 | 2 | 1104 | 5.97 ms | 50.49 ms |
| Remove the console.log | 2 | 2 | 1083 | 5.83 ms | 51.56 ms |
| Remove synchronous waste | 2 | 2 | 1037 | 6.59 ms | 50.70 ms |
| Write the 302 directly | 2 | 2 | 1001 | 6.21 ms | 52.64 ms |
| Scope the middleware | 2 | 2 | 859 | 5.76 ms | 28.46 ms |
| **Write-behind clicks** | 2 | **0.011** | **570** | **1.10 ms** | **2.50 ms** |
| One Redis command per read | **1** | 0.011 | 426 | 0.77 ms | 1.67 ms |
| Near cache | **0.435** | 0.011 | 336 | 0.51 ms | 1.75 ms |

## What this actually shows

**One change dominates.** Moving click tracking off the request path took
Postgres queries per redirect from 2 to effectively 0 and p99 from 52.6ms to
2.5ms in a single step. Everything before it moved CPU without moving the
tail, because the tail was the blocking database writes. Removing a
`console.log` and a dynamic import is real work but it was never the problem.

**Scoping the middleware was the largest of the synchronous wins**, cutting
CPU per redirect by 14% and p99 by nearly half, because helmet, a JSON body
parser, a CORS delegate and a synchronous log serialisation all ran on a
request that needed none of them.

**The near cache underperformed, and the reason matters more than the
number.** Redis commands per redirect fell to 0.435, not to 0. The benchmark
selects codes uniformly across ten thousand hot keys, so each key is touched
roughly 1.6 times in a run and an entry only enters the cache after its first
read. Most requests are therefore first touches. A near cache needs access
skew to work, and real link traffic has a great deal of it while this harness
has none by construction. Quoting a 56% hit rate without that explanation
would mislead in both directions.

**Creating a link got slower, by 12% at p50 and 40% at p99.** This is a real
regression and it is a direct consequence of the write-behind design. The
click write work did not disappear, it moved: over the optimized run the
flusher performed 1,317 flushes writing 379,104 rows, and each of those
batches inserts into a table carrying six indexes. That work now competes for
the connection pool with other writers, and create is the endpoint that feels
it. The trade is deliberate, since the redirect is 93% of traffic and create
is 4%, but it should be stated rather than buried.

**The buffer behaved correctly under load.** 379,104 clicks flushed across
1,317 flushes with zero dropped and zero flush errors.

## Limits of this measurement

- The load generator shares the machine with the service. The comparison is
  valid; the absolute numbers are not transferable.
- Uniform key selection understates the near cache and eliminates the row-lock
  contention the write-behind change is partly designed to fix, so that
  change's benefit is understated here too.
- Skipping the geo lookup for local addresses has a 100% hit rate in this
  environment and would have close to 0% in production. It is part of the CPU
  reduction above and would not be in a real deployment.
- The isolation runs for the dashboard and login are saturated by design: both
  are offered 400 req/s, far beyond what a bcrypt hash or a half-million-row
  aggregate can serve. Their isolation figures are useful only as a relative
  comparison, not as latency numbers.
- Three runs per phase, not the five that would be preferable. The spread was
  tight enough that the conclusion is not in doubt.
