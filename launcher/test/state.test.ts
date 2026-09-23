import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigStore } from "../src/main/config.js";
import { SecureStorage, type SafeStorageLike } from "../src/main/SecureStorage.js";
import { GameDetector } from "../src/main/GameDetector.js";
import { LauncherState } from "../src/main/state.js";

function fakeSafeStorage(): SafeStorageLike {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(s, "utf8"),
    decryptString: (b) => Buffer.from(b).toString("utf8"),
  };
}

describe("LauncherState.selectInstallation", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "mzzplork-state-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function makeState() {
    const configStore = new ConfigStore(join(dir, "config.json"));
    const config = await configStore.load();
    const state = new LauncherState(
      {
        configStore,
        secureStorage: new SecureStorage(fakeSafeStorage(), join(dir, "session.enc")),
        gameDetector: new GameDetector([]),
        defaultClientDir: join(dir, "default-client"),
      },
      config,
    );
    return { state, configStore };
  }

  it("persists gamePath and defaults clientPath the first time an install is selected", async () => {
    const { state } = await makeState();

    const config = await state.selectInstallation({
      source: "manual",
      installPath: "/games/gta5",
      executablePath: "/games/gta5/GTA5.exe",
    });

    expect(config.gamePath).toBe("/games/gta5");
    expect(config.clientPath).toBe(join(dir, "default-client"));
  });

  it("does not override an already-configured clientPath on a later re-selection", async () => {
    const { state, configStore } = await makeState();
    await configStore.update({ clientPath: "/custom/client/path" });

    const config = await state.selectInstallation({
      source: "steam",
      installPath: "/games/gta5-v2",
      executablePath: "/games/gta5-v2/GTA5.exe",
    });

    expect(config.gamePath).toBe("/games/gta5-v2");
    expect(config.clientPath).toBe("/custom/client/path");
  });

  it("checkForUpdates fails clearly (not silently) when no client path is configured yet", async () => {
    const { state } = await makeState();
    await expect(state.checkForUpdates()).rejects.toThrow(/client install path/i);
  });
});

describe("LauncherState.checkForUpdates baseDownloadUrl freshness", () => {
  let dir: string;
  let server: Server;
  let serverUrl: string;
  const fileContent = "fresh content";

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "mzzplork-state-freshness-"));

    const sha256 = createHash("sha256").update(fileContent).digest("hex");
    server = createServer((req, res) => {
      if (req.url?.startsWith("/api/v1/client/manifest")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            channel: "stable",
            version: "1.0.0",
            build: 1,
            files: [{ path: "a.bin", size: Buffer.byteLength(fileContent), sha256 }],
          }),
        );
        return;
      }
      if (req.url === "/api/v1/client/files/stable/a.bin") {
        res.writeHead(200);
        res.end(fileContent);
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    serverUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });

  it("downloads from the current apiBaseUrl, not the one captured when LauncherState was constructed", async () => {
    const configStore = new ConfigStore(join(dir, "config.json"));
    // Deliberately wrong at construction time (nothing listens on port 1) —
    // if baseDownloadUrl were still derived from *this* value at download
    // time, the download step would fail even after apiBaseUrl is updated.
    const initialConfig = await configStore.load();
    const state = new LauncherState(
      {
        configStore,
        secureStorage: new SecureStorage(fakeSafeStorage(), join(dir, "session.enc")),
        gameDetector: new GameDetector([]),
        defaultClientDir: join(dir, "default-client"),
      },
      { ...initialConfig, apiBaseUrl: "http://127.0.0.1:1" },
    );

    const clientDir = join(dir, "client");
    await state.updateConfig({ apiBaseUrl: serverUrl, clientPath: clientDir, channel: "stable" });

    const result = await state.checkForUpdates();
    expect(result.files).toHaveLength(1);

    const downloaded = await readFile(join(clientDir, "a.bin"), "utf8");
    expect(downloaded).toBe(fileContent);
  });
});
