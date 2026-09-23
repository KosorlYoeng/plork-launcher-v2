import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigStore } from "../src/main/config.js";

describe("ConfigStore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "mzzplork-config-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns defaults when no config file exists yet", async () => {
    const store = new ConfigStore(join(dir, "config.json"));
    const config = await store.load();
    expect(config.channel).toBe("stable");
    expect(config.autoUpdate).toBe(true);
    expect(config.gamePath).toBe("");
  });

  it("persists updates and merges them with existing values on the next load", async () => {
    const filePath = join(dir, "nested", "config.json");
    const store = new ConfigStore(filePath);
    await store.update({ gamePath: "/games/gta5", channel: "beta" });

    const reloaded = new ConfigStore(filePath);
    const config = await reloaded.load();
    expect(config.gamePath).toBe("/games/gta5");
    expect(config.channel).toBe("beta");
    expect(config.autoUpdate).toBe(true); // untouched default survives the merge
  });
});
