import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSession, hashPassword } from "../src/services/authService.js";
import { createTestApp, type TestContext } from "./testApp.js";

describe("auth routes", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ctx.prisma.user.create({
      data: {
        username: "playerone",
        email: "playerone@example.com",
        passwordHash: await hashPassword("correct horse battery staple"),
      },
    });
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("rejects malformed login bodies with 400", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "playerone" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("rejects invalid credentials with 401", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "playerone", password: "wrong-password" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("logs in with valid credentials and issues tokens", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "playerone", password: "correct horse battery staple" },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(typeof body.accessToken).toBe("string");
    expect(typeof body.refreshToken).toBe("string");
    expect(body.expiresIn).toBeGreaterThan(0);
  });

  it("rotates refresh tokens and rejects reuse of the old one", async () => {
    const login = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "playerone", password: "correct horse battery staple" },
    });
    const { refreshToken } = login.json();

    const firstRefresh = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken },
    });
    expect(firstRefresh.statusCode).toBe(200);
    const rotated = firstRefresh.json();
    expect(rotated.refreshToken).not.toBe(refreshToken);

    const reuseOldToken = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken },
    });
    expect(reuseOldToken.statusCode).toBe(401);
  });

  it("logout revokes the session so it can no longer be refreshed", async () => {
    const login = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "playerone", password: "correct horse battery staple" },
    });
    const { refreshToken } = login.json();

    const logout = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      payload: { refreshToken },
    });
    expect(logout.statusCode).toBe(204);

    const refreshAfterLogout = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken },
    });
    expect(refreshAfterLogout.statusCode).toBe(401);
  });

  it("only lets one of two concurrent refreshes with the same token succeed", async () => {
    // Seeds the session directly via createSession rather than through
    // POST /auth/login, so this test's own login attempt doesn't compete
    // with the other tests in this file for the login route's rate-limit
    // budget (see the rate-limit test below).
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { username: "playerone" } });
    const { refreshToken } = await createSession(ctx.prisma, user.id);

    const [first, second] = await Promise.all([
      ctx.app.inject({ method: "POST", url: "/api/v1/auth/refresh", payload: { refreshToken } }),
      ctx.app.inject({ method: "POST", url: "/api/v1/auth/refresh", payload: { refreshToken } }),
    ]);

    const statusCodes = [first.statusCode, second.statusCode].sort();
    expect(statusCodes).toEqual([200, 401]);
  });

  it("rate-limits repeated login attempts", async () => {
    const attempts = await Promise.all(
      Array.from({ length: 8 }, () =>
        ctx.app.inject({
          method: "POST",
          url: "/api/v1/auth/login",
          payload: { username: "playerone", password: "wrong-password" },
        }),
      ),
    );
    const statusCodes = attempts.map((response) => response.statusCode);
    expect(statusCodes).toContain(429);
  });
});
