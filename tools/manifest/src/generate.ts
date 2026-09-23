import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, realpath, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { mapWithConcurrencyLimit } from "./concurrency.js";
import type { Manifest, ManifestFile } from "./types.js";

// Caps concurrently open file handles/read streams so generation doesn't hit
// the OS file-descriptor limit (EMFILE) on build outputs with many files.
const HASH_CONCURRENCY = 64;

export interface GenerateManifestOptions {
  inputDir: string;
  channel: string;
  version: string;
  build: number;
}

export async function hashFile(absPath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(absPath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });
  return hash.digest("hex");
}

/**
 * Recursively collects files under `dir`. A symlink is only followed when it
 * points to a *file* inside `rootRealPath` (so a manifest can never be
 * generated from content living outside the intended build output
 * directory); symlinked directories are skipped rather than recursed into,
 * since a symlink can point back at an ancestor directory and cause
 * unbounded recursion.
 */
async function collectFiles(
  dir: string,
  rootRealPath: string,
  out: string[],
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const absPath = join(dir, entry.name);

    if (entry.isSymbolicLink()) {
      const target = await realpath(absPath);
      const isInsideRoot =
        target === rootRealPath ||
        target.startsWith(rootRealPath + sep);
      if (!isInsideRoot) {
        continue;
      }
      const targetStat = await stat(target);
      if (targetStat.isFile()) {
        out.push(absPath);
      }
      continue;
    }

    if (entry.isDirectory()) {
      await collectFiles(absPath, rootRealPath, out);
    } else if (entry.isFile()) {
      out.push(absPath);
    }
  }
}

export async function generateManifest(
  options: GenerateManifestOptions,
): Promise<Manifest> {
  const rootRealPath = await realpath(options.inputDir);
  const absPaths: string[] = [];
  await collectFiles(rootRealPath, rootRealPath, absPaths);

  const files = await mapWithConcurrencyLimit(
    absPaths,
    HASH_CONCURRENCY,
    async (absPath): Promise<ManifestFile> => {
      // `stat` (not `lstat`) so a symlinked file reports its target's size,
      // matching hashFile's content (createReadStream follows symlinks).
      const [fileStat, sha256] = await Promise.all([
        stat(absPath),
        hashFile(absPath),
      ]);
      const relPath = relative(rootRealPath, absPath).split(sep).join("/");
      return { path: relPath, size: fileStat.size, sha256 };
    },
  );

  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return {
    channel: options.channel,
    version: options.version,
    build: options.build,
    files,
  };
}
