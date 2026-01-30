import bcrypt from "bcrypt";

test("bcrypt hashes password correctly", async () => {
  const hash = await bcrypt.hash("mypassword", 10);
  const ok = await bcrypt.compare("mypassword", hash);

  expect(ok).toBe(true);
});
