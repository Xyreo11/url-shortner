import { normalizeUrl } from "../src/utils/validator.js";

test("normalizeUrl adds https:// if missing", () => {
  expect(normalizeUrl("google.com")).toBe("https://google.com");
});

test("normalizeUrl leaves https:// URLs unchanged", () => {
  expect(normalizeUrl("https://example.com")).toBe("https://example.com");
});
