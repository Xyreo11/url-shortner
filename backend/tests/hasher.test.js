import { generateShortCode } from "../src/utils/hasher.js";

describe("generateShortCode", () => {
  test("returns an 8 character string", () => {
    const code = generateShortCode("https://example.com");

    expect(typeof code).toBe("string");
    expect(code).toHaveLength(8);
  });

  test("uses only URL-safe alphanumerics", () => {
    // base64 contains + / and =, all of which would change the meaning of the
    // path if they survived into a short code.
    for (let i = 0; i < 50; i++) {
      expect(generateShortCode("https://example.com")).toMatch(/^[A-Za-z0-9]{8}$/);
    }
  });

  test("is not deterministic, so dedupe cannot rely on it", () => {
    const a = generateShortCode("https://example.com");
    const b = generateShortCode("https://example.com");

    expect(a).not.toBe(b);
  });

  test("successive calls differ even within the same millisecond", () => {
    // This is the property the collision retry loop depends on. When the only
    // varying input was Date.now(), calls inside one millisecond produced
    // identical codes, so retrying after a conflict regenerated the code that
    // had just conflicted.
    const start = Date.now();
    const codes = new Set();
    let calls = 0;

    while (Date.now() === start && calls < 500) {
      codes.add(generateShortCode("https://example.com"));
      calls += 1;
    }

    expect(calls).toBeGreaterThan(1);
    expect(codes.size).toBe(calls);
  });

  test("different URLs produce different codes", () => {
    const a = generateShortCode("https://example.com/one");
    const b = generateShortCode("https://example.com/two");

    expect(a).not.toBe(b);
  });
});
