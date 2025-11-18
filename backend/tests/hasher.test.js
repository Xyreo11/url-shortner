
test("generateShortCode returns a short string code", () => {
  const code = generateShortCode("https://example.com");

  expect(typeof code).toBe("string");
  expect(code.length).toBe(8); // your real implementation
});
