import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  EpicGameDetector,
  RockstarDefaultPathDetector,
  RockstarRegistryDetector,
  SteamGameDetector,
  type GameDetectionStrategy,
  type RegistryReader,
} from "./GameDetector.js";

const execFileAsync = promisify(execFile);

const readWindowsRegistryValue: RegistryReader = async (hive, key, valueName) => {
  try {
    const { stdout } = await execFileAsync("reg", ["query", `${hive}\\${key}`, "/v", valueName]);
    const match = stdout.match(/REG_SZ\s+(.+)\r?$/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
};

/**
 * Real per-platform detection strategies for production use. This session
 * runs on macOS, where no real GTA V install can exist, so on non-Windows
 * platforms this deliberately returns no strategies rather than fabricating
 * Windows-shaped paths that could never resolve — matching how the Phase 0
 * audit was upfront about macOS-vs-Windows limits.
 */
export function createDefaultGameDetectionStrategies(): GameDetectionStrategy[] {
  if (process.platform !== "win32") {
    return [];
  }

  const programFiles = process.env["ProgramFiles"] ?? "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const programData = process.env["ProgramData"] ?? "C:\\ProgramData";

  return [
    new SteamGameDetector(join(programFilesX86, "Steam")),
    new EpicGameDetector(join(programData, "Epic", "EpicGamesLauncher", "Data", "Manifests")),
    new RockstarDefaultPathDetector([
      join(programFiles, "Rockstar Games", "Grand Theft Auto V"),
      join(programFilesX86, "Rockstar Games", "Grand Theft Auto V"),
    ]),
    new RockstarRegistryDetector(readWindowsRegistryValue),
  ];
}
