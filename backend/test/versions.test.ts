import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../src/services/authService.js";
import { createTestApp, type TestContext } from "./testApp.js";

describe("version, manifest, and status routes", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();

    const manifest = await ctx.prisma.manifestVersion.create({
      data: {
        channel: "stable",
        version: "0.1.0",
        build: 100,
        filesJson: JSON.stringify([
          { path: "client/example.bin", size: 123456, sha256: "a".repeat(64) },
        ]),
      },
    });

    await ctx.prisma.clientVersion.create({
      data: { channel: "stable", version: "0.1.0", build: 100, manifestId: manifest.id },
    });

    await ctx.prisma.launcherVersion.create({
      data: {
        channel: "stable",
        version: "1.0.0",
        build: 1,
        downloadUrl: "https://example.com/MzzPlorkSetup.exe",
        sha256: "b".repeat(64),
      },
    });

    await ctx.prisma.serverStatus.create({
      data: { online: true, players: 12, maxPlayers: 256, version: "0.1.0" },
    });

    await ctx.prisma.user.create({
      data: {
        username: "sessionuser",
        email: "sessionuser@example.com",
        passwordHash: await hashPassword("password123"),
      },
    });
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("GET /api/v1/client/latest returns the latest published version for a channel", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/api/v1/client/latest?channel=stable" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ version: "0.1.0", channel: "stable", build: 100 });
  });

  it("GET /api/v1/client/latest 404s for an unknown channel", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/api/v1/client/latest?channel=nightly" });
    expect(response.statusCode).toBe(404);
  });

  it("GET /api/v1/launcher/latest returns the latest launcher build", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/api/v1/launcher/latest?channel=stable" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ version: "1.0.0", downloadUrl: "https://example.com/MzzPlorkSetup.exe" });
  });

  it("GET /api/v1/client/manifest returns the manifest with files", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/api/v1/client/manifest?channel=stable" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.channel).toBe("stable");
    expect(body.files).toEqual([{ path: "client/example.bin", size: 123456, sha256: "a".repeat(64) }]);
  });

  it("GET /api/v1/server/status returns cached status", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/api/v1/server/status" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ online: true, players: 12, maxPlayers: 256, version: "0.1.0" });
  });

  it("POST /api/v1/client/session requires a bearer access token", async () => {
    const response = await ctx.app.inject({ method: "POST", url: "/api/v1/client/session" });
    expect(response.statusCode).toBe(401);
  });

  it("client/manifest always matches client/latest even if an older build was (re-)published more recently", async () => {
    // Insertion order matters here: the higher-build manifest is created
    // first (earlier createdAt), and the lower-build one is created second
    // (later createdAt) — simulating an operator re-publishing/backfilling
    // an older build. If /client/manifest picked "latest manifest row" by
    // createdAt instead of joining through the latest ClientVersion by
    // build, it would return the wrong (lower-build) manifest here.
    const highBuildManifest = await ctx.prisma.manifestVersion.create({
      data: {
        channel: "beta",
        version: "0.9.0",
        build: 50,
        filesJson: JSON.stringify([{ path: "client/high.bin", size: 1, sha256: "c".repeat(64) }]),
      },
    });
    await ctx.prisma.clientVersion.create({
      data: { channel: "beta", version: "0.9.0", build: 50, manifestId: highBuildManifest.id },
    });

    const lowBuildManifest = await ctx.prisma.manifestVersion.create({
      data: {
        channel: "beta",
        version: "0.5.0",
        build: 10,
        filesJson: JSON.stringify([{ path: "client/low.bin", size: 1, sha256: "d".repeat(64) }]),
      },
    });
    await ctx.prisma.clientVersion.create({
      data: { channel: "beta", version: "0.5.0", build: 10, manifestId: lowBuildManifest.id },
    });

    const latest = await ctx.app.inject({ method: "GET", url: "/api/v1/client/latest?channel=beta" });
    expect(latest.json()).toMatchObject({ build: 50, version: "0.9.0" });

    const manifest = await ctx.app.inject({ method: "GET", url: "/api/v1/client/manifest?channel=beta" });
    expect(manifest.json()).toMatchObject({ build: 50, version: "0.9.0" });
    expect(manifest.json().files).toEqual([{ path: "client/high.bin", size: 1, sha256: "c".repeat(64) }]);
  });

  it("POST /api/v1/client/session issues a token for an authenticated user", async () => {
    const login = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "sessionuser", password: "password123" },
    });
    const { accessToken } = login.json();

    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/client/session",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(typeof response.json().token).toBe("string");
  });
});
