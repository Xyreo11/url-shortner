import { jest } from "@jest/globals";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";
process.env.IP_SALT = "test-salt";
process.env.NEAR_CACHE_MAX_ENTRIES = "100";

const mockRedis = { get: jest.fn(), set: jest.fn(), incr: jest.fn() };
jest.unstable_mockModule("../src/config/redis.js", () => ({
  redis: mockRedis,
  connectRedis: jest.fn(),
  closeRedis: jest.fn(),
}));

const { nearGet, nearSet, nearDelete, rotate, nearCacheStats, _clearNearCache } = await import(
  "../src/utils/nearCache.js"
);
const { cacheGet, cacheSet } = await import("../src/utils/cache.js");
const { counters } = await import("../src/utils/metrics.js");

let errorSpy;
beforeAll(() => {
  errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => errorSpy.mockRestore());

beforeEach(() => {
  _clearNearCache();
  jest.clearAllMocks();
  for (const k of Object.keys(counters)) counters[k] = 0;
});

describe("generational expiry", () => {
  test("an entry survives one rotation and is gone after two", () => {
    // Two maps rather than a timer per entry. A Map holding ten thousand
    // setTimeouts is a pathology; this gives expiry for one interval check.
    nearSet("k", "v");

    rotate();
    expect(nearGet("k")).toBe("v"); // demoted to cold, still readable

    _clearNearCache();
    nearSet("k2", "v2");
    rotate();
    rotate();
    expect(nearGet("k2")).toBeUndefined();
  });

  test("reading an entry promotes it, so hot keys survive rotation", () => {
    nearSet("hot", "v");
    rotate();

    nearGet("hot"); // promotes back into the new generation
    rotate();

    expect(nearGet("hot")).toBe("v");
  });

  test("rotates early when the entry cap is reached, bounding memory", () => {
    for (let i = 0; i < 250; i++) nearSet(`k${i}`, "v");

    const { hot, cold, maxEntries } = nearCacheStats();
    expect(hot).toBeLessThanOrEqual(maxEntries);
    expect(hot + cold).toBeLessThanOrEqual(maxEntries * 2);
  });

  test("delete removes from both generations", () => {
    nearSet("k", "v");
    rotate();
    nearSet("k", "v");

    nearDelete("k");

    expect(nearGet("k")).toBeUndefined();
  });
});

describe("two-tier behaviour through cacheGet", () => {
  test("an L1 hit issues no Redis command at all", async () => {
    // This is the capstone claim: after the click writes and the
    // instrumentation round trip were removed, one Redis GET was all that
    // remained on a hot redirect. An L1 hit removes that too, so the handler
    // completes with no I/O.
    mockRedis.get.mockResolvedValue("https://example.com/x");

    await cacheGet("short:abc"); // miss, populates L1 from L2
    jest.clearAllMocks();
    for (const k of Object.keys(counters)) counters[k] = 0;

    const value = await cacheGet("short:abc");

    expect(value).toBe("https://example.com/x");
    expect(mockRedis.get).not.toHaveBeenCalled();
    expect(counters.redisCommands).toBe(0);
    expect(counters.l1Hits).toBe(1);
  });

  test("falls through to Redis when L1 has nothing", async () => {
    mockRedis.get.mockResolvedValue("https://example.com/x");

    await cacheGet("short:cold");

    expect(mockRedis.get).toHaveBeenCalledTimes(1);
    expect(counters.l2Hits).toBe(1);
    expect(counters.l1Hits).toBe(0);
  });

  test("a miss is not cached, so it cannot mask a later creation", async () => {
    // Negative caching is deliberately not done here. Creating an alias turns
    // a 404 into a 302, and a cached absence on another instance would keep
    // serving 404 with no way to invalidate it.
    mockRedis.get.mockResolvedValue(null);

    await cacheGet("short:missing");
    await cacheGet("short:missing");

    expect(mockRedis.get).toHaveBeenCalledTimes(2);
  });

  test("a write populates L1, so the next read needs no network call", async () => {
    mockRedis.set.mockResolvedValue("OK");

    await cacheSet("short:new", "https://example.com/new");
    jest.clearAllMocks();

    const value = await cacheGet("short:new");

    expect(value).toBe("https://example.com/new");
    expect(mockRedis.get).not.toHaveBeenCalled();
  });

  test("survives Redis being down once the value is local", async () => {
    mockRedis.get.mockResolvedValueOnce("https://example.com/x");
    await cacheGet("short:abc");

    mockRedis.get.mockRejectedValue(new Error("The client is offline"));

    await expect(cacheGet("short:abc")).resolves.toBe("https://example.com/x");
  });
});
