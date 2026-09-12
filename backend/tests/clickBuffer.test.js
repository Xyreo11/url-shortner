import { jest } from "@jest/globals";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";
process.env.IP_SALT = "test-salt";

const mockDb = { query: jest.fn(), on: jest.fn() };
jest.unstable_mockModule("../src/config/db.js", () => ({ db: mockDb, closeDb: jest.fn() }));

const { track, flush, drainClickBuffer, _bufferState, _resetBuffer } = await import(
  "../src/services/clickBuffer.js"
);
const { counters } = await import("../src/utils/metrics.js");

const click = (shortCode) => ({
  shortCode,
  ipHash: "hash",
  device: "desktop",
  browser: "Chrome",
  os: "Windows",
  country: "US",
  isQR: false,
  referrer: "",
  at: new Date(),
});

let errorSpy;
beforeAll(() => {
  errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => errorSpy.mockRestore());

beforeEach(() => {
  // Module-level state, so it has to be cleared explicitly or one test's
  // in-flight flush leaves the next one wedged.
  _resetBuffer();
  jest.clearAllMocks();
  mockDb.query.mockResolvedValue({ rows: [] });
  for (const k of Object.keys(counters)) counters[k] = 0;
});

afterEach(() => _resetBuffer());

describe("buffering", () => {
  test("track issues no query at all", () => {
    // The whole point: the redirect enqueues and returns. If this ever starts
    // querying, two Postgres round trips are back on the request path.
    track(click("abc12345"));

    expect(mockDb.query).not.toHaveBeenCalled();
    expect(_bufferState().rows).toBe(1);
  });

  test("merges repeat clicks on one code into a single increment", async () => {
    // Counts are mergeable, which is the reason they get their own buffer.
    for (let i = 0; i < 50; i++) track(click("viral001"));

    await flush();

    const update = mockDb.query.mock.calls.find((c) => /UPDATE urls/i.test(c[0]));
    const [codes, increments] = update[1];
    expect(codes).toEqual(["viral001"]);
    expect(increments).toEqual([50]);
  });

  test("writes all rows in one INSERT rather than one per click", async () => {
    for (let i = 0; i < 10; i++) track(click(`code${i}`));

    await flush();

    const inserts = mockDb.query.mock.calls.filter((c) => /INSERT INTO analytics/i.test(c[0]));
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1][0]).toHaveLength(10);
  });

  test("sorts codes so concurrent flushes take row locks in the same order", async () => {
    // Two overlapping grouped updates with overlapping code sets and
    // different lock orders can deadlock.
    track(click("zzz"));
    track(click("aaa"));
    track(click("mmm"));

    await flush();

    const update = mockDb.query.mock.calls.find((c) => /UPDATE urls/i.test(c[0]));
    expect(update[1][0]).toEqual(["aaa", "mmm", "zzz"]);
  });
});

describe("overload", () => {
  test("never drops a count, even once rows are being dropped", () => {
    // A count is one integer per code however many clicks it represents, so
    // dropping one discards data that was free to keep. Rows are capped and
    // shed; counts are not.
    //
    // The write is held open so the buffer fills past its row cap.
    mockDb.query.mockImplementation(() => new Promise(() => {}));

    for (let i = 0; i < 25000; i++) track(click("hot"));

    expect(counters.clicksDropped).toBeGreaterThan(0);
    expect(counters.clicksBuffered).toBe(25000);
    // One code, still held, with every click accounted for.
    expect(_bufferState().codes).toBe(1);
  });

  test("overlapping flushes do not stack", async () => {
    // Two grouped UPDATEs in flight at once can take the same row locks in
    // different orders and deadlock, so a second flush must return rather
    // than queue behind the first.
    mockDb.query.mockImplementation(() => new Promise(() => {}));

    track(click("abc12345"));
    void flush();

    await flush(); // returns immediately because one is already running

    expect(_bufferState().flushing).toBe(true);
    const inserts = mockDb.query.mock.calls.filter((c) => /INSERT INTO analytics/i.test(c[0]));
    expect(inserts).toHaveLength(1);
  });
});

describe("failure", () => {
  test("keeps counts and drops rows when the write fails", async () => {
    // Counts are bounded by distinct codes so retrying them cannot grow
    // without limit. Retaining rows across a sustained outage could, and
    // would turn a database problem into an out-of-memory crash.
    mockDb.query.mockRejectedValue(new Error("connection terminated"));

    track(click("abc12345"));
    await flush();

    expect(counters.flushErrors).toBe(1);
    expect(counters.clicksDropped).toBe(1);
    expect(_bufferState().codes).toBe(1);
  });

  test("a failed flush is retried on the next one", async () => {
    mockDb.query.mockRejectedValueOnce(new Error("down"));
    track(click("abc12345"));
    await flush();

    mockDb.query.mockResolvedValue({ rows: [] });
    await flush();

    const updates = mockDb.query.mock.calls.filter((c) => /UPDATE urls/i.test(c[0]));
    expect(updates.length).toBeGreaterThan(0);
    expect(_bufferState().codes).toBe(0);
  });
});

describe("shutdown", () => {
  test("drain writes everything still buffered", async () => {
    // This runs before the pool closes. Without it, a container stop discards
    // whatever the timer had not yet flushed.
    track(click("abc12345"));
    track(click("def67890"));

    await drainClickBuffer();

    expect(_bufferState().rows).toBe(0);
    expect(_bufferState().codes).toBe(0);
    expect(mockDb.query).toHaveBeenCalled();
  });
});
