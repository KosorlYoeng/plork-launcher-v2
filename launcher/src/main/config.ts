import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { LauncherConfig } from "../shared/types.js";

const DEFAULTS: LauncherConfig = {
  environment: "production",
  // Overridable for local development/testing against a non-production
  // backend, without hand-editing the persisted config file (plan §15).
  apiBaseUrl: process.env.MZZPLORK_API_BASE_URL ?? "https://api.mzzplork.example.com",
  channel: "stable",
  gamePath: "",
  clientPath: "",
  autoUpdate: true,
};

/**
 * Reads/writes the launcher's config as JSON at a given file path (plan
 * §15 — no hardcoded production URLs; the path itself is supplied by the
 * caller, normally `app.getPath('userData')/config.json`, so this class
 * has no Electron dependency and is unit-testable with a temp file).
 */
export class ConfigStore {
  private cached: LauncherConfig | null = null;

  constructor(private readonly filePath: string) {}

  async load(): Promise<LauncherConfig> {
    if (this.cached) {
      return this.cached;
    }
    try {
      const raw = await readFile(this.filePath, "utf8");
      this.cached = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<LauncherConfig>) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      this.cached = { ...DEFAULTS };
    }
    return this.cached;
  }

  async update(patch: Partial<LauncherConfig>): Promise<LauncherConfig> {
    const current = await this.load();
    const next = { ...current, ...patch };
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(next, null, 2), "utf8");
    this.cached = next;
    return next;
  }
}
