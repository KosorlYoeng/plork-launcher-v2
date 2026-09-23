import { access, constants as fsConstants, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { GameInstallation } from "../shared/types.js";

const GTA5_EXECUTABLE = "GTA5.exe";
const GTA5_DIR_NAME = "Grand Theft Auto V";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export interface GameDetectionStrategy {
  readonly source: GameInstallation["source"];
  detect(): Promise<GameInstallation[]>;
}

/** Parses just enough of Steam's libraryfolders.vdf to extract library root paths. */
function parseSteamLibraryPaths(vdf: string): string[] {
  const paths: string[] = [];
  const pathLine = /"path"\s*"((?:[^"\\]|\\.)*)"/g;
  let match: RegExpExecArray | null;
  while ((match = pathLine.exec(vdf)) !== null) {
    paths.push(match[1].replace(/\\\\/g, "\\"));
  }
  return paths;
}

export class SteamGameDetector implements GameDetectionStrategy {
  readonly source = "steam" as const;

  constructor(private readonly steamRoot: string) {}

  async detect(): Promise<GameInstallation[]> {
    // Missing/unreadable libraryfolders.vdf just means "no extra library
    // folders to check" — the Steam root's own default library is still
    // checked below, so a minimal or unusual Steam layout isn't skipped
    // entirely just because this one file isn't there.
    const libraryFoldersPath = join(this.steamRoot, "steamapps", "libraryfolders.vdf");
    let additionalLibraries: string[] = [];
    try {
      const vdf = await readFile(libraryFoldersPath, "utf8");
      additionalLibraries = parseSteamLibraryPaths(vdf);
    } catch {
      // fall through with no additional libraries
    }

    const libraries = [this.steamRoot, ...additionalLibraries];
    const results: GameInstallation[] = [];
    for (const lib of libraries) {
      const installPath = join(lib, "steamapps", "common", GTA5_DIR_NAME);
      const executablePath = join(installPath, GTA5_EXECUTABLE);
      if (await fileExists(executablePath)) {
        results.push({ source: "steam", installPath, executablePath });
      }
    }
    return results;
  }
}

export class EpicGameDetector implements GameDetectionStrategy {
  readonly source = "epic" as const;

  constructor(private readonly manifestsDir: string) {}

  async detect(): Promise<GameInstallation[]> {
    let entries: string[];
    try {
      entries = await readdir(this.manifestsDir);
    } catch {
      return [];
    }

    const results: GameInstallation[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".item")) {
        continue;
      }
      try {
        const raw = await readFile(join(this.manifestsDir, entry), "utf8");
        const manifest = JSON.parse(raw) as {
          DisplayName?: string;
          InstallLocation?: string;
          LaunchExecutable?: string;
        };
        if (!manifest.DisplayName?.toLowerCase().includes("grand theft auto v")) {
          continue;
        }
        if (!manifest.InstallLocation || !manifest.LaunchExecutable) {
          continue;
        }
        const executablePath = join(manifest.InstallLocation, manifest.LaunchExecutable);
        if (await fileExists(executablePath)) {
          results.push({
            source: "epic",
            installPath: manifest.InstallLocation,
            executablePath,
          });
        }
      } catch {
        continue;
      }
    }
    return results;
  }
}

export class RockstarDefaultPathDetector implements GameDetectionStrategy {
  readonly source = "rockstar-default" as const;

  constructor(private readonly candidateRoots: string[]) {}

  async detect(): Promise<GameInstallation[]> {
    const results: GameInstallation[] = [];
    for (const root of this.candidateRoots) {
      const executablePath = join(root, GTA5_EXECUTABLE);
      if (await fileExists(executablePath)) {
        results.push({ source: "rockstar-default", installPath: root, executablePath });
      }
    }
    return results;
  }
}

export type RegistryReader = (
  hive: "HKLM" | "HKCU",
  key: string,
  valueName: string,
) => Promise<string | null>;

const ROCKSTAR_REGISTRY_KEY = "SOFTWARE\\WOW6432Node\\Rockstar Games\\Grand Theft Auto V";

/**
 * Looks up a non-default Rockstar Games install location via the Windows
 * registry. The actual registry read is injected (`readRegistryValue`)
 * rather than called directly, since the registry can't be reached — or
 * meaningfully tested — outside Windows; this keeps the detection *logic*
 * unit-testable everywhere while the real read only ever runs on win32.
 */
export class RockstarRegistryDetector implements GameDetectionStrategy {
  readonly source = "rockstar-registry" as const;

  constructor(private readonly readRegistryValue: RegistryReader) {}

  async detect(): Promise<GameInstallation[]> {
    if (process.platform !== "win32") {
      return [];
    }
    const installPath = await this.readRegistryValue(
      "HKLM",
      ROCKSTAR_REGISTRY_KEY,
      "InstallFolder",
    );
    if (!installPath) {
      return [];
    }
    const executablePath = join(installPath, GTA5_EXECUTABLE);
    if (!(await fileExists(executablePath))) {
      return [];
    }
    return [{ source: "rockstar-registry", installPath, executablePath }];
  }
}

/**
 * Runs every strategy and returns every valid installation found
 * (deduplicated by installPath) — no single hardcoded path (plan §6).
 */
export class GameDetector {
  constructor(private readonly strategies: GameDetectionStrategy[]) {}

  async detect(): Promise<GameInstallation[]> {
    const all = (await Promise.all(this.strategies.map((s) => s.detect()))).flat();
    const seen = new Set<string>();
    const deduped: GameInstallation[] = [];
    for (const installation of all) {
      if (seen.has(installation.installPath)) {
        continue;
      }
      seen.add(installation.installPath);
      deduped.push(installation);
    }
    return deduped;
  }

  /** Validates a user-provided (manual) game path. */
  async validate(installPath: string): Promise<GameInstallation | null> {
    const executablePath = join(installPath, GTA5_EXECUTABLE);
    if (await fileExists(executablePath)) {
      return { source: "manual", installPath, executablePath };
    }
    return null;
  }
}
