import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";
import { hashFile, type Manifest, type ManifestFile } from "@mzzplork/manifest";
import type { ApiClient } from "./ApiClient.js";
import type { UpdateProgressEvent } from "../shared/types.js";

export class PathTraversalError extends Error {}
export class DownloadVerificationError extends Error {}

export interface UpdateManagerOptions {
  installDir: string;
  /** Base URL files are downloaded from; the final path is `${baseDownloadUrl}/${channel}/${file.path}`. */
  baseDownloadUrl: string;
  fetchImpl?: typeof fetch;
  maxAttemptsPerFile?: number;
}

export interface FileDiff {
  toDownload: ManifestFile[];
  upToDate: ManifestFile[];
}

/**
 * Resolves a manifest-listed relative path against `installDir`, rejecting
 * any path that would escape it (`../../x`, an absolute path, etc). Never
 * trust a remote manifest's paths without this check (plan §18, `LN-009`).
 */
export function resolveSafeInstallPath(installDir: string, relativePath: string): string {
  const resolvedRoot = resolve(installDir);
  const resolvedTarget = resolve(resolvedRoot, relativePath);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(resolvedRoot + sep)) {
    throw new PathTraversalError(
      `Manifest file path escapes the install directory: "${relativePath}"`,
    );
  }
  return resolvedTarget;
}

/**
 * Compares the manifest against what's actually on disk (size + SHA-256, so
 * a same-size-but-corrupted file is still caught) and returns which files
 * need downloading — unchanged files are never redownloaded (plan §9).
 */
export async function compareLocalFiles(
  installDir: string,
  manifest: Manifest,
): Promise<FileDiff> {
  const toDownload: ManifestFile[] = [];
  const upToDate: ManifestFile[] = [];

  for (const file of manifest.files) {
    const localPath = resolveSafeInstallPath(installDir, file.path);
    try {
      const localStat = await stat(localPath);
      if (!localStat.isFile() || localStat.size !== file.size) {
        toDownload.push(file);
        continue;
      }
      const localHash = await hashFile(localPath);
      if (localHash === file.sha256) {
        upToDate.push(file);
      } else {
        toDownload.push(file);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        toDownload.push(file);
      } else {
        throw error;
      }
    }
  }

  return { toDownload, upToDate };
}

/**
 * Downloads one file to `${destPath}.tmp`, resuming from wherever that tmp
 * file already ends (via an HTTP Range request) — whether it's left over
 * from a previous crashed run or from an earlier failed attempt in this
 * same call — then verifies size + SHA-256 before atomically renaming it
 * into place. A verified-bad download is deleted (not left to corrupt a
 * future resume); a network failure mid-stream just leaves the tmp file for
 * the next attempt to resume from (plan §10).
 */
async function downloadOneFile(
  url: string,
  destPath: string,
  expected: { size: number; sha256: string },
  fetchImpl: typeof fetch,
  maxAttempts: number,
  onBytes?: (bytesDownloaded: number) => void,
): Promise<void> {
  const tmpPath = `${destPath}.tmp`;
  await mkdir(dirname(destPath), { recursive: true });

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let startByte = 0;
    try {
      startByte = (await stat(tmpPath)).size;
    } catch {
      startByte = 0;
    }

    try {
      if (startByte < expected.size) {
        const response = await fetchImpl(url, {
          headers: startByte > 0 ? { range: `bytes=${startByte}-` } : {},
        });

        if (response.status === 416) {
          // Server says there's nothing left to send at this offset — fall through to verification.
        } else if (response.status === 200 || response.status === 206) {
          const resumed = response.status === 206;
          const writeFromByte = resumed ? startByte : 0;
          if (!response.body) {
            throw new Error(`Download response for ${url} had no body`);
          }
          const nodeStream = Readable.fromWeb(response.body as WebReadableStream);
          const writeStream = createWriteStream(tmpPath, {
            flags: writeFromByte > 0 ? "a" : "w",
          });
          let bytesSoFar = writeFromByte;
          nodeStream.on("data", (chunk: Buffer) => {
            bytesSoFar += chunk.length;
            onBytes?.(bytesSoFar);
          });
          await pipeline(nodeStream, writeStream);
        } else {
          throw new Error(`Unexpected HTTP ${response.status} downloading ${url}`);
        }
      }

      const finalStat = await stat(tmpPath);
      if (finalStat.size !== expected.size) {
        throw new DownloadVerificationError(
          `Downloaded size ${finalStat.size} for "${destPath}" does not match expected ${expected.size}`,
        );
      }
      const actualHash = await hashFile(tmpPath);
      if (actualHash !== expected.sha256) {
        throw new DownloadVerificationError(`SHA-256 mismatch after download for "${destPath}"`);
      }

      await rename(tmpPath, destPath);
      return;
    } catch (error) {
      lastError = error;
      if (error instanceof DownloadVerificationError) {
        await rm(tmpPath, { force: true });
      }
      if (attempt === maxAttempts) {
        throw error;
      }
    }
  }

  // Unreachable, but keeps TypeScript's control-flow analysis happy.
  throw lastError;
}

/**
 * Orchestrates a full update: fetch the manifest, diff against local files,
 * download/verify only what changed. Path validation and hash verification
 * happen before anything is ever written into `installDir` proper.
 */
export class UpdateManager {
  constructor(
    private readonly apiClient: Pick<ApiClient, "getClientManifest">,
    private readonly options: UpdateManagerOptions,
  ) {}

  async update(
    channel: string,
    onProgress?: (event: UpdateProgressEvent) => void,
  ): Promise<Manifest> {
    try {
      onProgress?.({
        status: "checking",
        filesCompleted: 0,
        filesTotal: 0,
        bytesDownloaded: 0,
        bytesTotal: 0,
      });

      const manifest = await this.apiClient.getClientManifest(channel);
      const { toDownload } = await compareLocalFiles(this.options.installDir, manifest);

      if (toDownload.length === 0) {
        onProgress?.({
          status: "up-to-date",
          filesCompleted: 0,
          filesTotal: 0,
          bytesDownloaded: 0,
          bytesTotal: 0,
        });
        return manifest;
      }

      const bytesTotal = toDownload.reduce((sum, file) => sum + file.size, 0);
      const fetchImpl = this.options.fetchImpl ?? fetch;
      const maxAttempts = this.options.maxAttemptsPerFile ?? 3;
      let bytesDownloaded = 0;
      let filesCompleted = 0;

      for (const file of toDownload) {
        const destPath = resolveSafeInstallPath(this.options.installDir, file.path);
        const url = `${this.options.baseDownloadUrl}/${channel}/${file.path}`;

        onProgress?.({
          status: "downloading",
          file: file.path,
          filesCompleted,
          filesTotal: toDownload.length,
          bytesDownloaded,
          bytesTotal,
        });

        await downloadOneFile(url, destPath, file, fetchImpl, maxAttempts, (bytes) => {
          onProgress?.({
            status: "downloading",
            file: file.path,
            filesCompleted,
            filesTotal: toDownload.length,
            bytesDownloaded: bytesDownloaded + bytes,
            bytesTotal,
          });
        });

        bytesDownloaded += file.size;
        filesCompleted += 1;
      }

      onProgress?.({
        status: "complete",
        filesCompleted,
        filesTotal: toDownload.length,
        bytesDownloaded,
        bytesTotal,
      });
      return manifest;
    } catch (error) {
      onProgress?.({
        status: "error",
        filesCompleted: 0,
        filesTotal: 0,
        bytesDownloaded: 0,
        bytesTotal: 0,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
