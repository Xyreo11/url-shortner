import { jest } from "@jest/globals";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";
process.env.IP_SALT = "test-salt";

const mockDb = { query: jest.fn(), on: jest.fn() };
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  incr: jest.fn(),
  ping: jest.fn(),
  multi: jest.fn(),
  isOpen: true,
};

jest.unstable_mockModule("../src/config/db.js", () => ({
  db: mockDb,
  closeDb: jest.fn(),
}));
jest.unstable_mockModule("../src/config/redis.js", () => ({
  redis: mockRedis,
  connectRedis: jest.fn(),
  closeRedis: jest.fn(),
}));

const request = (await import("supertest")).default;
const { createApp } = await import("../src/app.js");

const app = createApp();
const TARGET = "https://target.example.com/deep/path?a=1";

let errorSpy;
beforeAll(() => {
  errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => errorSpy.mockRestore());

beforeEach(() => {
  jest.clearAllMocks();
  mockRedis.get.mockResolvedValue(null);
  mockRedis.set.mockResolvedValue("OK");
  mockRedis.incr.mockResolvedValue(1);
  mockRedis.ping.mockResolvedValue("PONG");
});

/** Routes db.query by the SQL it receives, so one mock serves every call. */
function stubDb({ urlRow }) {
  mockDb.query.mockImplementation((sql) => {
    if (/FROM urls\s+WHERE short_code/i.test(sql)) {
      return Promise.resolve({ rows: urlRow ? [urlRow] : [] });
    }
    if (/INSERT INTO analytics/i.test(sql)) return Promise.resolve({ rows: [] });
    if (/UPDATE urls SET click_count/i.test(sql)) return Promise.resolve({ rows: [] });
    if (/SELECT 1/i.test(sql)) return Promise.resolve({ rows: [{ "?column?": 1 }] });
    return Promise.resolve({ rows: [] });
  });
}

describe("GET /:code", () => {
  test("redirects with 302 and the exact destination", async () => {
    stubDb({ urlRow: { short_code: "abc12345", long_url: TARGET } });

    const res = await request(app).get("/abc12345");

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(TARGET);
  });

  test("uses 302, not 301, so repeat clicks keep reaching the server", async () => {
    // A 301 is cached hard by browsers, which silently stops click tracking.
    stubDb({ urlRow: { short_code: "abc12345", long_url: TARGET } });

    const res = await request(app).get("/abc12345");

    expect(res.status).not.toBe(301);
    expect(res.status).toBe(302);
  });

  test("serves a cache hit without querying Postgres for the URL", async () => {
    mockRedis.get.mockResolvedValue(TARGET);
    stubDb({ urlRow: null });

    const res = await request(app).get("/abc12345");

    expect(res.status).toBe(302);
    const lookups = mockDb.query.mock.calls.filter((c) =>
      /FROM urls\s+WHERE short_code/i.test(c[0])
    );
    expect(lookups).toHaveLength(0);
  });

  test("backfills the cache after a miss", async () => {
    stubDb({ urlRow: { short_code: "abc12345", long_url: TARGET } });

    await request(app).get("/abc12345");

    expect(mockRedis.set).toHaveBeenCalledWith("short:abc12345", TARGET, { EX: 3600 });
  });

  test("returns 404 for an unknown code", async () => {
    stubDb({ urlRow: null });

    const res = await request(app).get("/nosuchco");

    expect(res.status).toBe(404);
  });
});

describe("routing", () => {
  test("/health is not swallowed by the catch-all short code route", async () => {
    // app.use("/", httpRouter) matches any single segment, so /health has to
    // be registered ahead of it or readiness checks get parsed as short codes.
    stubDb({ urlRow: null });

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.checks).toBeDefined();
  });

  test("an unmatched method returns JSON, not an HTML stack trace", async () => {
    stubDb({ urlRow: null });

    const res = await request(app).post("/definitely-not-a-route");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });
});

describe("security headers", () => {
  test("sets the headers helmet provides and drops X-Powered-By", async () => {
    stubDb({ urlRow: null });

    const res = await request(app).get("/health");

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});
