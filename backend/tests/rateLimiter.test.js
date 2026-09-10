import { jest } from "@jest/globals";

// The limiter builds a MULTI chain, so the mock has to be chainable and
// return itself from every command.
const chain = {
  zRemRangeByScore: jest.fn(() => chain),
  zAdd: jest.fn(() => chain),
  zCard: jest.fn(() => chain),
  expire: jest.fn(() => chain),
  exec: jest.fn(),
};

const mockRedis = { multi: jest.fn(() => chain) };

jest.unstable_mockModule("../src/config/redis.js", () => ({
  redis: mockRedis,
  connectRedis: jest.fn(),
  closeRedis: jest.fn(),
}));

const { rateLimit } = await import("../src/utils/rateLimiter.js");

// exec resolves an array positional to the queued commands. Index 2 is zCard.
const execWithCount = (n) => [0, 1, n, 1];

let errorSpy;
beforeAll(() => {
  errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => errorSpy.mockRestore());
beforeEach(() => jest.clearAllMocks());

describe("rateLimit boundary", () => {
  test("allows the request that lands exactly on the limit", async () => {
    chain.exec.mockResolvedValue(execWithCount(10));
    await expect(rateLimit("rl:create:1.2.3.4", 10, 60)).resolves.toBe(true);
  });

  test("refuses the first request over the limit", async () => {
    chain.exec.mockResolvedValue(execWithCount(11));
    await expect(rateLimit("rl:create:1.2.3.4", 10, 60)).resolves.toBe(false);
  });

  test("allows the first request in a window", async () => {
    chain.exec.mockResolvedValue(execWithCount(1));
    await expect(rateLimit("rl:create:1.2.3.4", 10, 60)).resolves.toBe(true);
  });
});

describe("rateLimit mechanics", () => {
  test("issues all four commands in a single MULTI", async () => {
    chain.exec.mockResolvedValue(execWithCount(1));

    await rateLimit("rl:create:1.2.3.4", 10, 60);

    // One round trip, and it cannot half-apply. The previous version was an
    // INCR followed by a separate EXPIRE, so a failure between them left the
    // key with no TTL and that client was limited permanently.
    expect(mockRedis.multi).toHaveBeenCalledTimes(1);
    expect(chain.zRemRangeByScore).toHaveBeenCalledTimes(1);
    expect(chain.zAdd).toHaveBeenCalledTimes(1);
    expect(chain.zCard).toHaveBeenCalledTimes(1);
    expect(chain.expire).toHaveBeenCalledTimes(1);
  });

  test("always sets an expiry, not only on the first request", async () => {
    chain.exec.mockResolvedValue(execWithCount(7));

    await rateLimit("rl:create:1.2.3.4", 10, 60);

    expect(chain.expire).toHaveBeenCalledWith("rl:create:1.2.3.4", 61);
  });

  test("trims entries older than the window, which is what makes it sliding", async () => {
    chain.exec.mockResolvedValue(execWithCount(1));
    const before = Date.now();

    await rateLimit("rl:create:1.2.3.4", 10, 60);

    const [key, min, max] = chain.zRemRangeByScore.mock.calls[0];
    expect(key).toBe("rl:create:1.2.3.4");
    expect(min).toBe(0);
    // A fixed window would reset on a clock boundary and let through twice the
    // limit across it. This trims relative to now instead.
    expect(max).toBeGreaterThanOrEqual(before - 60_000 - 50);
    expect(max).toBeLessThanOrEqual(Date.now() - 60_000 + 50);
  });

  test("uses a unique member so two calls in one millisecond both count", async () => {
    chain.exec.mockResolvedValue(execWithCount(1));

    await rateLimit("k", 10, 60);
    await rateLimit("k", 10, 60);

    const first = chain.zAdd.mock.calls[0][1][0].value;
    const second = chain.zAdd.mock.calls[1][1][0].value;
    expect(first).not.toBe(second);
  });
});

describe("rateLimit failure mode", () => {
  test("fails OPEN when Redis is unreachable", async () => {
    // Deliberate: locking every user out of the service because the cache is
    // down is worse than briefly allowing more traffic than intended. The
    // blacklist check does the opposite and fails closed.
    chain.exec.mockRejectedValue(new Error("The client is offline"));

    await expect(rateLimit("rl:create:1.2.3.4", 10, 60)).resolves.toBe(true);
  });
});
