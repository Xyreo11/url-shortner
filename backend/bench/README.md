# Benchmark harness

Measures this service before and after the redirect-path optimisation, in a
way that survives being questioned.

The short version of the method: run the same weighted workload against two
builds that differ only in the performance commits, at a fixed arrival rate
neither build saturates, and separately find the highest rate each one
sustains. The first gives a latency comparison, the second a throughput
comparison. Both are reported, along with everything that could be argued to
undermine them.

## Running it

```bash
cd backend
cp bench/.env.bench.example bench/.env.bench   # then edit credentials

docker compose -p urlshort-bench up -d postgres redis
node bench/seed.mjs
node bench/warm.mjs

# start the app on the host with the bench profile (see below), then:
bash bench/run-matrix.sh baseline
```

The app must run **on the host**, not in the compose `app` service. That
service bind-mounts the Windows filesystem into the container and routes
through the WSL2 NAT, and neither has anything to do with the code being
measured. Postgres and Redis stay in Docker, which is realistic since the
application reaches them over a socket either way.

```bash
NODE_ENV=production \
POSTGRES_URL=postgres://…@localhost:5433/shortifydb \
REDIS_URL=redis://localhost:6379 \
JWT_SECRET=bench-secret IP_SALT=bench-salt \
PORT=3000 BASE_URL=http://localhost:3000 \
BCRYPT_ROUNDS=10 PG_POOL_MAX=20 UV_THREADPOOL_SIZE=8 \
RATE_LIMIT_CREATE_MAX=1000000 RATE_LIMIT_AUTH_MAX=1000000 \
LOG_DIR=/some/path/outside/any/synced/folder \
  node src/index.js
```

Every one of those values must be **identical across both phases**. They are
listed in the results for that reason.

## The workload

| Scenario | Weight | Exercises |
|---|---|---|
| Redirect, cache hit | 85% | Redis GET, then 302 |
| Redirect, cache miss | 8% | Redis miss, Postgres lookup, cache backfill, 302 |
| Create | 4% | Rate limit, blacklist, dedupe lookup, insert |
| Analytics dashboard | 2% | Three aggregates over 500,000 rows |
| Login | 1% | bcrypt, deliberately expensive |

Reads dominate because that is what a link shortener does: a link is created
once and resolved many times. The 85/8 split encodes an assumed **91% cache
hit rate**. That assumption is the single biggest lever on the result, which
is why it is stated here and in the results rather than left implicit.

Each scenario also runs in isolation, so every endpoint gets enough samples
for a stable p99. A mixed number alone invites "so you only benchmarked the
cheap path?", and the per-endpoint table is the answer.

## Why an open model

`constant-arrival-rate` fixes the offered load and measures the latency that
results. A closed model with N connections instead reports whatever
throughput N connections happened to produce, which is as much a property of
the test configuration as of the server. Fixing the rate is what makes
"p99 at 400 requests per second" a statement about the service.

`dropped_iterations` greater than zero means the run could not keep up with
the offered rate. That invalidates the run as a latency measurement, and the
summary flags it. In the capacity sweep it is the signal being looked for.

## Things that silently ruin this benchmark

Each of these was hit or specifically guarded against.

**k6 follows redirects by default.** The option is `maxRedirects`, not
`redirects`, and k6 ignores an unknown option without complaint. With the
wrong name, every 302 was chased out to the destination: half the recorded
requests were DNS lookups and the failure rate read 50%. Three defences now:
`maxRedirects: 0`, `redirects: 0` per request, and seeded destinations
pointing at `bench.invalid`, which does not resolve.

**A reused cold code stops being cold.** `resolveUrl` caches on a miss, so
requesting the same cold code twice turns the second into a cache hit and the
miss scenario quietly measures hits. Cold codes are indexed by
`iterationInTest`, which is unique across the run, and the pool is sized far
above the expected miss count.

**The rate limiter flattens the create scenario.** Ten creates per minute per
IP means measuring 429s. It is raised via `RATE_LIMIT_CREATE_MAX` for the run.
That override is disclosed in the results. Do not instead spoof
`X-Forwarded-For` per virtual user: `trust proxy` now defaults to off, so that
would work on one build and silently stop working on the other, which looks
like a regression.

**The repository lives inside a OneDrive folder** and winston writes a
rotating file on every request. The sync client waking up mid-run injects
latency that cannot be explained afterwards. `LOG_DIR` points outside the
synced tree, and OneDrive is paused during runs.

**stdout must go to the same place in both phases.** Console writes on Windows
are synchronous and blocking to a terminal, much cheaper to a file. Redirect
identically in both, or removing a `console.log` shows a win it did not earn.

**initdb only runs on an empty volume.** Editing `db/schema.sql` after the
volume exists does nothing at all. Verify the tables before trusting a run.

**Thermal throttling.** This is a laptop. Runs are spaced, and the median
across runs is reported rather than the best one.

**bcrypt blocks the libuv threadpool**, which defaults to 4 threads. At any
real login rate it inflates every other endpoint's latency in the mixed run.
`UV_THREADPOOL_SIZE` is pinned so this is at least constant, and the effect
is worth mentioning rather than hiding: it is a genuine finding about the
service, not an artefact.

## State between runs

`bench/reset.mjs` runs before every measurement and asserts rather than
assumes:

| Check | Required |
|---|---|
| urls | 50,000 |
| analytics | 500,000 |
| total click_count | 0 |
| Redis DBSIZE after reset | 0 |
| Redis DBSIZE after warm | 10,000 |

It deletes only links whose code does not match the seeded pattern, so
anything the create scenario made is removed and the seeded set is untouched.
It never tears down the compose stack, so volumes belonging to anything else
on the machine are never at risk. Always use `-p urlshort-bench`.

## Reporting

Report p50, p95 and p99, throughput, error rate and dropped iterations. Not a
single average: the average hides the tail, and the tail is where a redirect
service is judged.

State the hardware, that the load generator shares the machine with the
service, the assumed cache hit rate, the rate limit override, the bcrypt cost
and the pool size. A number without its method is not defensible, and
volunteering the limitations makes the number more credible rather than less.

## Cross-check

`npx autocannon -c 50 -d 30 http://localhost:3000/b0000001` measures the hot
redirect with a completely different tool. It is not the headline, and it
adds no dependency because npx fetches it on demand. Its only job is so that
"was that a k6 artefact?" has an answer.
