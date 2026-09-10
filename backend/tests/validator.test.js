import { normalizeUrl, isValidUrl, isValidAlias } from "../src/utils/validator.js";

describe("normalizeUrl", () => {
  test("adds https:// when no scheme is present", () => {
    expect(normalizeUrl("google.com")).toBe("https://google.com");
  });

  test("leaves an https URL unchanged", () => {
    expect(normalizeUrl("https://example.com")).toBe("https://example.com");
  });

  test("leaves an http URL unchanged rather than silently upgrading it", () => {
    expect(normalizeUrl("http://example.com")).toBe("http://example.com");
  });

  test("trims surrounding whitespace", () => {
    expect(normalizeUrl("  example.com  ")).toBe("https://example.com");
  });

  test("normalising is not validating", () => {
    // Which is why isValidUrl has to run afterwards. On its own normalizeUrl
    // turns nonsense into a plausible-looking string, and for a long time
    // nothing checked the result before storing it.
    expect(normalizeUrl("not a url")).toBe("https://not a url");
    expect(isValidUrl(normalizeUrl("not a url"))).toBe(false);
  });
});

describe("isValidUrl", () => {
  test.each([
    "https://example.com",
    "http://example.com/path?q=1#frag",
    "https://sub.domain.example.co.uk/x",
  ])("accepts %s", (url) => {
    expect(isValidUrl(url)).toBe(true);
  });

  test.each([
    ["not a url", "no scheme or host"],
    ["https://nodot", "host has no dot"],
    ["ftp://example.com", "scheme is not http(s)"],
    ["javascript:alert(1)", "scheme is not http(s)"],
    ["", "empty"],
  ])("rejects %s (%s)", (url) => {
    expect(isValidUrl(url)).toBe(false);
  });
});

describe("isValidAlias", () => {
  test("treats an absent alias as acceptable, since it is optional", () => {
    expect(isValidAlias("")).toBe(true);
    expect(isValidAlias(undefined)).toBe(true);
    expect(isValidAlias(null)).toBe(true);
  });

  test.each(["abc", "my-link", "my_link", "my.link", "a1.b2_c3-d4", "a".repeat(50)])(
    "accepts %s",
    (alias) => {
      expect(isValidAlias(alias)).toBe(true);
    }
  );

  test.each([
    ["ab", "shorter than 3"],
    ["a".repeat(51), "longer than 50"],
    [".leading", "leading dot"],
    ["trailing.", "trailing dot"],
    ["double..dot", "consecutive dots"],
    ["has space", "contains a space"],
    ["has/slash", "a slash would change the route"],
    ["has?query", "query character"],
  ])("rejects %s (%s)", (alias) => {
    expect(isValidAlias(alias)).toBe(false);
  });
});
