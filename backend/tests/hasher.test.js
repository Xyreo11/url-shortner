import { generateShortCode } from "../src/utils/hasher.js";

test("generateShortCode returns a short string code", () => {
  const code = generateShortCode("https://example.com");

  expect(typeof code).toBe("string");
  expect(code.length).toBe(8); // adjust if your function uses a different length
});
