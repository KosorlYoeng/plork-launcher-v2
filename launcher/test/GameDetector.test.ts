import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EpicGameDetector,
  GameDetector,
  RockstarDefaultPathDetector,
  RockstarRegistryDetector,
  SteamGameDetector,
} from "../src/main/GameDetector.js";

describe("SteamGameDetector", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "mzzplork-steam-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("finds GTA V directly under the Steam root", async () => {
    const gtaDir = join(dir, "steamapps", "common", "Grand Theft Auto V");
    await mkdir(gtaDir, { recursive: true });
    await writeFile(join(gtaDir, "GTA5.exe"), "stub");

    const detector = new SteamGameDetector(dir);
    const results = await detector.detect();
    expect(results).toEqual([
      { source: "steam", installPath: gtaDir, executablePath: join(gtaDir, "GTA5.exe") },
    ]);
  });

  it("also checks additional library folders listed in libraryfolders.vdf", async () => {
    const secondLibrary = join(dir, "..", "second-library");
    await mkdir(join(dir, "steamapps"), { recursive: true });
    await writeFile(
      join(dir, "steamapps", "libraryfolders.vdf"),
      `"libraryfolders"\n{\n\t"1"\n\t{\n\t\t"path"\t\t"${secondLibrary.replace(/\\/g, "\\\\")}"\n\t}\n}\n`,
    );
    const gtaDir = join(secondLibrary, "steamapps", "common", "Grand Theft Auto V");
    await mkdir(gtaDir, { recursive: true });
    await writeFile(join(gtaDir, "GTA5.exe"), "stub");

    const results = await new SteamGameDetector(dir).detect();
    expect(results).toHaveLength(1);
    expect(results[0].installPath).toBe(gtaDir);

    await rm(secondLibrary, { recursive: true, force: true });
  });

  it("returns nothing when Steam isn't installed at all", async () => {
    const results = await new SteamGameDetector(join(dir, "does-not-exist")).detect();
    expect(results).toEqual([]);
  });
});

describe("EpicGameDetector", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "mzzplork-epic-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("finds GTA V from a matching .item manifest", async () => {
    const installLocation = join(dir, "gta5-install");
    await mkdir(installLocation, { recursive: true });
    await writeFile(join(installLocation, "GTA5.exe"), "stub");
    await writeFile(
      join(dir, "gta5.item"),
      JSON.stringify({
        DisplayName: "Grand Theft Auto V",
        InstallLocation: installLocation,
        LaunchExecutable: "GTA5.exe",
      }),
    );
    await writeFile(join(dir, "unrelated-game.item"), JSON.stringify({ DisplayName: "Some Other Game" }));

    const results = await new EpicGameDetector(dir).detect();
    expect(results).toEqual([
      { source: "epic", installPath: installLocation, executablePath: join(installLocation, "GTA5.exe") },
    ]);
  });

  it("ignores manifests whose executable doesn't actually exist on disk", async () => {
    await writeFile(
      join(dir, "gta5.item"),
      JSON.stringify({
        DisplayName: "Grand Theft Auto V",
        InstallLocation: join(dir, "missing"),
        LaunchExecutable: "GTA5.exe",
      }),
    );
    expect(await new EpicGameDetector(dir).detect()).toEqual([]);
  });
});

describe("RockstarDefaultPathDetector", () => {
  it("checks every candidate root and returns only the ones that exist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mzzplork-rockstar-"));
    try {
      const validRoot = join(dir, "Rockstar Games", "Grand Theft Auto V");
      await mkdir(validRoot, { recursive: true });
      await writeFile(join(validRoot, "GTA5.exe"), "stub");

      const results = await new RockstarDefaultPathDetector([
        join(dir, "nonexistent"),
        validRoot,
      ]).detect();

      expect(results).toEqual([
        { source: "rockstar-default", installPath: validRoot, executablePath: join(validRoot, "GTA5.exe") },
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("RockstarRegistryDetector", () => {
  it("never calls the registry reader on non-Windows platforms", async () => {
    let called = false;
    const detector = new RockstarRegistryDetector(async () => {
      called = true;
      return "C:\\should-not-be-used";
    });

    const results = await detector.detect();
    expect(results).toEqual([]);
    expect(called).toBe(process.platform === "win32");
  });
});

describe("GameDetector", () => {
  it("aggregates and de-duplicates results across strategies", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mzzplork-aggregate-"));
    try {
      const gtaDir = join(dir, "GTAV");
      await mkdir(gtaDir, { recursive: true });
      await writeFile(join(gtaDir, "GTA5.exe"), "stub");

      const detector = new GameDetector([
        new RockstarDefaultPathDetector([gtaDir]),
        new RockstarDefaultPathDetector([gtaDir]), // deliberately duplicate
      ]);

      const results = await detector.detect();
      expect(results).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("validate() confirms a manually-provided path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mzzplork-validate-"));
    try {
      await writeFile(join(dir, "GTA5.exe"), "stub");
      const detector = new GameDetector([]);
      expect(await detector.validate(dir)).toEqual({
        source: "manual",
        installPath: dir,
        executablePath: join(dir, "GTA5.exe"),
      });
      expect(await detector.validate(join(dir, "wrong"))).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
