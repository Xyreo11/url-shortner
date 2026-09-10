import { jest } from "@jest/globals";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";
process.env.IP_SALT = "test-salt";

const mockDb = { query: jest.fn(), on: jest.fn() };
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  incr: jest.fn(),
  ping: jest.fn(),
  multi: jest.fn(),
  isOpen: true,
};

jest.unstable_mockModule("../src/config/db.js", () => ({ db: mockDb, closeDb: jest.fn() }));
jest.unstable_mockModule("../src/config/redis.js", () => ({
  redis: mockRedis,
  connectRedis: jest.fn(),
  closeRedis: jest.fn(),
}));

const request = (await import("supertest")).default;
const jwt = (await import("jsonwebtoken")).default;
const { createApp } = await import("../src/app.js");

const app = createApp();
const token = jwt.sign({ id: 1, email: "user@example.com", role: "user" }, "test-secret");
const auth = { Authorization: `Bearer ${token}` };

const PUBLIC_ROW = {
  id: 1,
  email: "user@example.com",
  name: "Renamed",
  role: "user",
  avatar_url: null,
  created_at: new Date().toISOString(),
};

let errorSpy;
beforeAll(() => {
  errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => errorSpy.mockRestore());

beforeEach(() => {
  jest.clearAllMocks();
  mockRedis.ping.mockResolvedValue("PONG");
  mockDb.query.mockResolvedValue({ rows: [PUBLIC_ROW] });
});

describe("PUT /api/user/profile does not leak credentials", () => {
  test("the response body contains no password_hash", async () => {
    const res = await request(app).put("/api/user/profile").set(auth).send({ name: "Renamed" });

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("password_hash");
    expect(Object.keys(res.body).sort()).toEqual(
      ["avatar_url", "created_at", "email", "id", "name", "role"].sort()
    );
  });

  test("the update statement never asks the database for password_hash", async () => {
    // The response assertion above passes trivially if the mock happens not to
    // return the column. This is the real invariant: the query that feeds an
    // HTTP response must not select the hash at all. Reintroducing it in the
    // RETURNING list, which is exactly how the original leak happened, fails
    // this test.
    await request(app).put("/api/user/profile").set(auth).send({ name: "Renamed" });

    const updateSql = mockDb.query.mock.calls.map((c) => c[0]).find((s) => /UPDATE users/i.test(s));

    expect(updateSql).toBeDefined();
    expect(updateSql).not.toMatch(/password_hash/i);
  });

  test("rejects an unauthenticated caller", async () => {
    const res = await request(app).put("/api/user/profile").send({ name: "Renamed" });
    expect(res.status).toBe(401);
  });
});

describe("PUT /api/user/password enforces the same rule as signup", () => {
  test("refuses a password shorter than 8 characters", async () => {
    // Signup required 8 to 128 via Joi from the start. Without the same rule
    // here an existing account could be downgraded to a 1-character password.
    const res = await request(app)
      .put("/api/user/password")
      .set(auth)
      .send({ oldPassword: "correcthorse1", newPassword: "abc" });

    expect(res.status).toBe(400);
    expect(mockDb.query).not.toHaveBeenCalled();
  });

  test("refuses a password over 128 characters", async () => {
    const res = await request(app)
      .put("/api/user/password")
      .set(auth)
      .send({ oldPassword: "correcthorse1", newPassword: "a".repeat(129) });

    expect(res.status).toBe(400);
  });

  test("requires the old password to be supplied", async () => {
    const res = await request(app)
      .put("/api/user/password")
      .set(auth)
      .send({ newPassword: "correcthorse2" });

    expect(res.status).toBe(400);
  });
});

describe("PUT /api/user/avatar restricts the URL scheme", () => {
  test.each([
    ["javascript:alert(1)", "javascript"],
    ["data:text/html;base64,PHN2Zz4=", "data"],
    ["file:///etc/passwd", "file"],
  ])("rejects %s", async (avatarUrl) => {
    // The value is rendered into an img src by the frontend, so anything
    // other than http(s) is a stored-XSS vector.
    const res = await request(app).put("/api/user/avatar").set(auth).send({ avatarUrl });

    expect(res.status).toBe(400);
    expect(mockDb.query).not.toHaveBeenCalled();
  });

  test("accepts an https URL", async () => {
    const res = await request(app)
      .put("/api/user/avatar")
      .set(auth)
      .send({ avatarUrl: "https://cdn.example.com/a.png" });

    expect(res.status).toBe(200);
  });
});
