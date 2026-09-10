import { jest } from "@jest/globals";

// ESM: jest.mock is not hoisted, so the module must be mocked before the
// subject is imported, and the import has to be dynamic.
const mockRedis = {
  get: jest.fn(),
  incr: jest.fn(),
  set: jest.fn(),
};

jest.unstable_mockModule("../src/config/redis.js", () => ({
  redis: mockRedis,
  connectRedis: jest.fn(),
  closeRedis: jest.fn(),
}));

const { cacheGet, cacheSet } = await import("../src/utils/cache.js");

let errorSpy;
beforeAll(() => {
  errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => errorSpy.mockRestore());
beforeEach(() => jest.clearAllMocks());

describe("cacheGet", () => {
  test("returns the value on a hit and counts the hit", async () => {
    mockRedis.get.mockResolvedValue("https://example.com/x");
    mockRedis.incr.mockResolvedValue(1);

    await expect(cacheGet("short:abc")).resolves.toBe("https://example.com/x");
    expect(mockRedis.incr).toHaveBeenCalledWith("cache:hits");
  });

  test("returns null on a miss and counts the miss", async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.incr.mockResolvedValue(1);

    await expect(cacheGet("short:nope")).resolves.toBeNull();
    expect(mockRedis.incr).toHaveBeenCalledWith("cache:misses");
  });

  test("regression: a Redis failure resolves to null rather than throwing", async () => {
    // This is the whole point of cache-aside. Callers treat null as a miss and
    // read Postgres instead. Previously redis.get sat outside the try block,
    // so the rejection escaped and every redirect answered 500 with Redis down.
    mockRedis.get.mockRejectedValue(new Error("The client is offline"));

    await expect(cacheGet("short:abc")).resolves.toBeNull();
  });

  test("a failing counter does not break the read it is measuring", async () => {
    mockRedis.get.mockResolvedValue("https://example.com/x");
    mockRedis.incr.mockRejectedValue(new Error("counter unavailable"));

    await expect(cacheGet("short:abc")).resolves.toBe("https://example.com/x");
  });
});

describe("cacheSet", () => {
  test("always writes with an expiry", async () => {
    mockRedis.set.mockResolvedValue("OK");

    await cacheSet("short:abc", "https://example.com/x");

    expect(mockRedis.set).toHaveBeenCalledWith(
      "short:abc",
      "https://example.com/x",
      { EX: 3600 }
    );
  });

  test("honours an explicit TTL", async () => {
    mockRedis.set.mockResolvedValue("OK");

    await cacheSet("k", "v", 60);

    expect(mockRedis.set).toHaveBeenCalledWith("k", "v", { EX: 60 });
  });

  test("a write failure is swallowed, since the source of truth is Postgres", async () => {
    mockRedis.set.mockRejectedValue(new Error("offline"));

    await expect(cacheSet("k", "v")).resolves.toBeUndefined();
  });
});
