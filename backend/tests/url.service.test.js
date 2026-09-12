import { jest } from "@jest/globals";

// config is imported for real, so give it what it needs before it loads.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";
process.env.IP_SALT = "test-salt";

const model = {
  findByLongUrl: jest.fn(),
  findByShortCode: jest.fn(),
  insertUrl: jest.fn(),
};
const cache = { cacheGet: jest.fn(), cacheSet: jest.fn() };
const limiter = { rateLimit: jest.fn() };
const blacklist = { isBlacklisted: jest.fn() };

jest.unstable_mockModule("../src/models/url.model.js", () => model);
jest.unstable_mockModule("../src/utils/cache.js", () => cache);
jest.unstable_mockModule("../src/utils/rateLimiter.js", () => limiter);
jest.unstable_mockModule("../src/utils/blacklist.js", () => blacklist);

const { shortenUrl, resolveUrl } = await import("../src/services/url.service.js");

const IP = "1.2.3.4";

beforeEach(() => {
  jest.clearAllMocks();
  limiter.rateLimit.mockResolvedValue(true);
  blacklist.isBlacklisted.mockResolvedValue(false);
  cache.cacheGet.mockResolvedValue(null);
  cache.cacheSet.mockResolvedValue(undefined);
  model.findByLongUrl.mockResolvedValue(undefined);
  model.findByShortCode.mockResolvedValue(undefined);
  // Default: the insert succeeds and echoes back the code it was given.
  model.insertUrl.mockImplementation((_url, code) => Promise.resolve(code));
});

describe("guards", () => {
  test("a throttled request carries a 429 rather than a generic failure", async () => {
    limiter.rateLimit.mockResolvedValue(false);

    await expect(shortenUrl("https://a.example.com", null, IP)).rejects.toMatchObject({
      message: "Rate limit exceeded",
      status: 429,
    });
  });

  test("rejects a URL that is not a URL", async () => {
    // normalizeUrl would otherwise turn this into "https://not a url"
    // and store it, because the validators were never wired in.
    await expect(shortenUrl("not a url", null, IP)).rejects.toThrow("Invalid URL");
    expect(model.insertUrl).not.toHaveBeenCalled();
  });

  test("rejects a malformed alias before doing any I/O", async () => {
    await expect(shortenUrl("https://a.example.com", "ab", IP)).rejects.toThrow(/Invalid alias/);
    expect(blacklist.isBlacklisted).not.toHaveBeenCalled();
    expect(model.insertUrl).not.toHaveBeenCalled();
  });

  test("refuses a blacklisted destination", async () => {
    blacklist.isBlacklisted.mockResolvedValue(true);
    await expect(shortenUrl("https://bad.example.com", null, IP)).rejects.toThrow(/blacklisted/);
  });

  test("stores the destination percent-encoded, so the redirect path is a passthrough", async () => {
    // The redirect writes this value straight into a Location header. Encoding
    // once at creation costs about a hundredth as much as encoding on every
    // read, and it means a stored value needs no further processing.
    await shortenUrl("https://a.example.com/a path?q=1 2", null, IP);

    const stored = model.insertUrl.mock.calls[0][0];
    expect(stored).toBe("https://a.example.com/a%20path?q=1%202");
    expect(stored).not.toContain(" ");
  });
});

describe("deduplication", () => {
  test("returns the cached code without touching the database", async () => {
    cache.cacheGet.mockResolvedValue("cAcHeD01");

    await expect(shortenUrl("https://a.example.com", null, IP)).resolves.toBe("cAcHeD01");
    expect(model.findByLongUrl).not.toHaveBeenCalled();
    expect(model.insertUrl).not.toHaveBeenCalled();
  });

  test("scopes the dedupe lookup and its cache key to the owner", async () => {
    // Without the owner scope, one user shortening a URL another had already
    // shortened was handed that other user's code.
    //
    // The trailing slash is the write-time URL normalisation: the stored form
    // is percent-encoded and normalised once here so the redirect path can
    // write it straight into a Location header without further work.
    await shortenUrl("https://a.example.com", null, IP, "alice@example.com");

    expect(model.findByLongUrl).toHaveBeenCalledWith(
      "https://a.example.com/",
      "alice@example.com"
    );
    const dedupeKeys = cache.cacheGet.mock.calls.map((c) => c[0]);
    expect(dedupeKeys[0]).toContain("alice@example.com");
  });

  test("anonymous links use a distinct dedupe namespace from owned ones", async () => {
    await shortenUrl("https://a.example.com", null, IP, null);
    const anonKey = cache.cacheGet.mock.calls[0][0];

    jest.clearAllMocks();
    limiter.rateLimit.mockResolvedValue(true);
    blacklist.isBlacklisted.mockResolvedValue(false);
    cache.cacheGet.mockResolvedValue(null);
    model.findByLongUrl.mockResolvedValue(undefined);
    model.insertUrl.mockImplementation((_url, code) => Promise.resolve(code));

    await shortenUrl("https://a.example.com", null, IP, "bob@example.com");
    const ownedKey = cache.cacheGet.mock.calls[0][0];

    expect(anonKey).not.toBe(ownedKey);
  });

  test("reuses an existing row rather than minting a second code", async () => {
    model.findByLongUrl.mockResolvedValue({
      short_code: "eXiStInG",
      long_url: "https://a.example.com",
    });

    await expect(shortenUrl("https://a.example.com", null, IP)).resolves.toBe("eXiStInG");
    expect(model.insertUrl).not.toHaveBeenCalled();
  });
});

describe("code collisions", () => {
  test("retries with a different code when the first is taken", async () => {
    model.insertUrl
      .mockResolvedValueOnce(null) // taken
      .mockImplementationOnce((_u, code) => Promise.resolve(code));

    const result = await shortenUrl("https://a.example.com", null, IP);

    expect(model.insertUrl).toHaveBeenCalledTimes(2);
    const firstCode = model.insertUrl.mock.calls[0][1];
    const secondCode = model.insertUrl.mock.calls[1][1];
    // This is why generateShortCode needed random bytes: seeded only on
    // Date.now() at millisecond resolution, a retry regenerated the code that
    // had just collided and the loop was useless.
    expect(secondCode).not.toBe(firstCode);
    expect(result).toBe(secondCode);
  });

  test("yields to a concurrent request that created the same URL first", async () => {
    model.insertUrl.mockResolvedValue(null);
    model.findByLongUrl
      .mockResolvedValueOnce(undefined) // nothing when we looked
      .mockResolvedValueOnce({ short_code: "wInNeR01", long_url: "https://a.example.com" });

    await expect(shortenUrl("https://a.example.com", null, IP)).resolves.toBe("wInNeR01");
  });

  test("gives up after a bounded number of attempts instead of looping forever", async () => {
    model.insertUrl.mockResolvedValue(null);
    model.findByLongUrl.mockResolvedValue(undefined);

    await expect(shortenUrl("https://a.example.com", null, IP)).rejects.toThrow(
      /Could not allocate/
    );
    expect(model.insertUrl).toHaveBeenCalledTimes(5);
  });

  test("caches both directions after a successful insert", async () => {
    model.insertUrl.mockImplementation((_u, code) => Promise.resolve(code));

    const code = await shortenUrl("https://a.example.com", null, IP);

    const keys = cache.cacheSet.mock.calls.map((c) => c[0]);
    expect(keys).toContain(`short:${code}`);
    expect(keys.some((k) => k.startsWith("long:"))).toBe(true);
  });
});

describe("custom alias", () => {
  test("claims a free alias without a separate existence check", async () => {
    model.insertUrl.mockResolvedValue("my-alias");

    await expect(shortenUrl("https://a.example.com", "my-alias", IP)).resolves.toBe("my-alias");
    // The old code did findByShortCode then insertUrl, and two concurrent
    // requests for one alias both passed that check.
    expect(model.findByShortCode).not.toHaveBeenCalled();
  });

  test("reports a taken alias when the insert returns no row", async () => {
    model.insertUrl.mockResolvedValue(null);

    await expect(shortenUrl("https://a.example.com", "taken-alias", IP)).rejects.toThrow(
      "Alias already taken"
    );
  });
});

describe("resolveUrl", () => {
  test("serves from cache without querying Postgres", async () => {
    cache.cacheGet.mockResolvedValue("https://a.example.com");

    await expect(resolveUrl("abc12345")).resolves.toBe("https://a.example.com");
    expect(model.findByShortCode).not.toHaveBeenCalled();
  });

  test("falls back to Postgres on a miss and backfills the cache", async () => {
    cache.cacheGet.mockResolvedValue(null);
    model.findByShortCode.mockResolvedValue({ long_url: "https://a.example.com" });

    await expect(resolveUrl("abc12345")).resolves.toBe("https://a.example.com");
    expect(cache.cacheSet).toHaveBeenCalledWith("short:abc12345", "https://a.example.com");
  });

  test("returns null for an unknown code", async () => {
    cache.cacheGet.mockResolvedValue(null);
    model.findByShortCode.mockResolvedValue(undefined);

    await expect(resolveUrl("nosuch01")).resolves.toBeNull();
  });
});
