import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiClient, ApiError } from "../src/main/ApiClient.js";
import { startTestBackend, type TestBackend } from "./testBackend.js";

describe("ApiClient (against the real Phase 1 backend)", () => {
  let backend: TestBackend;
  let client: ApiClient;

  beforeAll(async () => {
    backend = await startTestBackend();
    client = new ApiClient(backend.baseUrl);

    const manifest = await backend.prisma.manifestVersion.create({
      data: {
        channel: "stable",
        version: "0.1.0",
        build: 100,
        filesJson: JSON.stringify([{ path: "client/a.bin", size: 1, sha256: "a".repeat(64) }]),
      },
    });
    await backend.prisma.clientVersion.create({
      data: { channel: "stable", version: "0.1.0", build: 100, manifestId: manifest.id },
    });
    await backend.prisma.launcherVersion.create({
      data: {
        channel: "stable",
        version: "1.0.0",
        build: 1,
        downloadUrl: "https://example.com/Setup.exe",
        sha256: "b".repeat(64),
      },
    });
    await backend.prisma.serverStatus.create({
      data: { online: true, players: 3, maxPlayers: 100, version: "0.1.0" },
    });
  });

  afterAll(async () => {
    await backend.cleanup();
  });

  it("rejects an invalid login with an ApiError carrying the HTTP status", async () => {
    await expect(client.login("apiclienttest", "wrong-password")).rejects.toMatchObject({
      status: 401,
    } satisfies Partial<ApiError>);
  });

  it("logs in, refreshes, and logs out against the real auth flow", async () => {
    const tokens = await client.login("apiclienttest", "correct-password");
    expect(typeof tokens.accessToken).toBe("string");

    const refreshed = await client.refresh(tokens.refreshToken);
    expect(refreshed.refreshToken).not.toBe(tokens.refreshToken);

    await client.logout(refreshed.refreshToken);
    await expect(client.refresh(refreshed.refreshToken)).rejects.toThrow(ApiError);
  });

  it("fetches client/launcher version info and the manifest", async () => {
    const clientLatest = await client.getClientLatest("stable");
    expect(clientLatest).toMatchObject({ version: "0.1.0", build: 100 });

    const launcherLatest = await client.getLauncherLatest("stable");
    expect(launcherLatest).toMatchObject({ version: "1.0.0", downloadUrl: "https://example.com/Setup.exe" });

    const manifest = await client.getClientManifest("stable");
    expect(manifest.files).toEqual([{ path: "client/a.bin", size: 1, sha256: "a".repeat(64) }]);
  });

  it("fetches server status", async () => {
    const status = await client.getServerStatus();
    expect(status).toEqual({ online: true, players: 3, maxPlayers: 100, version: "0.1.0" });
  });

  it("creates a client session token when authenticated, and rejects when not", async () => {
    const tokens = await client.login("apiclienttest", "correct-password");
    const session = await client.createClientSession(tokens.accessToken);
    expect(typeof session.token).toBe("string");

    await expect(client.createClientSession("not-a-real-token")).rejects.toMatchObject({
      status: 401,
    } satisfies Partial<ApiError>);
  });
});
