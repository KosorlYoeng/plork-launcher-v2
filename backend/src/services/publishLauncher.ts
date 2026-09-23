import { resolve } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { hashFile } from "@mzzplork/manifest";

export interface PublishLauncherVersionOptions {
  filePath: string;
  channel: string;
  version: string;
  build: number;
  downloadUrl: string;
}

export interface PublishLauncherVersionResult {
  channel: string;
  version: string;
  build: number;
  sha256: string;
}

function assertValidDownloadUrl(downloadUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(downloadUrl);
  } catch {
    throw new Error(`--download-url is not a valid URL: "${downloadUrl}"`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`--download-url must be http(s), got "${downloadUrl}"`);
  }
}

/**
 * Hashes a built launcher installer/archive and upserts a
 * `LauncherVersion` row against its real SHA-256 — unlike the seed data,
 * which only ever held a placeholder hash for a file that never existed.
 * Unlike `publishBuild` (BE-007), this does not also host the file: an
 * installer is typically hosted on a release page/CDN, a distinct
 * decision from client-file storage, so `downloadUrl` is supplied by the
 * caller rather than assumed.
 */
export async function publishLauncherVersion(
  prisma: PrismaClient,
  options: PublishLauncherVersionOptions,
): Promise<PublishLauncherVersionResult> {
  assertValidDownloadUrl(options.downloadUrl);

  // Resolve relative to cwd explicitly — hashFile expects an absolute path
  // (see its usage in tools/manifest/src/generate.ts), and this is the one
  // caller that previously passed a possibly-relative CLI-supplied path
  // straight through.
  const absoluteFilePath = resolve(options.filePath);
  const sha256 = await hashFile(absoluteFilePath);
  const identity = {
    channel: options.channel,
    version: options.version,
    build: options.build,
  };
  const publishedAt = new Date();

  await prisma.launcherVersion.upsert({
    where: { channel_version_build: identity },
    // `publishedAt` is refreshed on every republish, not just `create` —
    // it means "when was the file currently being served published",
    // which changes when the content does, even for the same
    // channel/version/build identity.
    update: { sha256, downloadUrl: options.downloadUrl, publishedAt },
    create: { ...identity, sha256, downloadUrl: options.downloadUrl, publishedAt },
  });

  return { ...identity, sha256 };
}
