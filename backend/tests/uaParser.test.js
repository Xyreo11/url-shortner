import { parseUA } from "../src/utils/uaParser.js";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD =
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/604.1";
const MAC_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const WIN_EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
const WIN_OPERA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 OPR/105.0.0.0";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const LINUX_FIREFOX =
  "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0";

describe("operating system", () => {
  test("regression: an iPhone is iOS, not macOS", () => {
    // The iPhone user agent contains the literal "like Mac OS X". Both
    // previous parsers checked for "mac" before iOS, so every iPhone was
    // recorded as a Mac and the iOS share of traffic read as zero.
    expect(parseUA(IPHONE).os).toBe("iOS");
  });

  test("regression: an iPad is iOS, not macOS", () => {
    expect(parseUA(IPAD).os).toBe("iOS");
  });

  test.each([
    [MAC_CHROME, "macOS"],
    [WIN_EDGE, "Windows"],
    [ANDROID_CHROME, "Android"],
    [LINUX_FIREFOX, "Linux"],
  ])("classifies the OS correctly", (ua, expected) => {
    expect(parseUA(ua).os).toBe(expected);
  });
});

describe("browser", () => {
  test.each([
    [WIN_EDGE, "Edge"],
    [WIN_OPERA, "Opera"],
    [MAC_CHROME, "Chrome"],
    [LINUX_FIREFOX, "Firefox"],
    [IPHONE, "Safari"],
  ])("classifies the browser correctly", (ua, expected) => {
    // Edge and Opera both carry "chrome" in their user agent and Chrome
    // carries "safari", so the most specific token has to win.
    expect(parseUA(ua).browser).toBe(expected);
  });
});

describe("device", () => {
  test.each([
    [IPHONE, "mobile"],
    [ANDROID_CHROME, "mobile"],
    [IPAD, "tablet"],
    [MAC_CHROME, "desktop"],
    [WIN_EDGE, "desktop"],
  ])("classifies the device correctly", (ua, expected) => {
    expect(parseUA(ua).device).toBe(expected);
  });
});

describe("robustness", () => {
  test.each([["", "empty"], [undefined, "undefined"], [null, "null"]])(
    "handles a %s user agent without throwing",
    (ua) => {
      expect(() => parseUA(ua)).not.toThrow();
      expect(parseUA(ua)).toEqual({ os: "Unknown", browser: "Unknown", device: "desktop" });
    }
  );
});
