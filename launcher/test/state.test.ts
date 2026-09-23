import { mkdtemp, rm } from "node:fs/promises";
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
        baseDownloadUrl: "http://127.0.0.1:0",
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
