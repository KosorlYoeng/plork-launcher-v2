import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { generateManifest, mapWithConcurrencyLimit, resolveSafePath } from "@mzzplork/manifest";

// Matches tools/manifest's own hashing concurrency cap — same reasoning:
// avoid hitting the OS file-descriptor limit on a build with many files.
const COPY_CONCURRENCY = 64;

export interface PublishBuildOptions {
  buildDir: string;
  channel: string;
  version: string;
  build: number;
  storageRoot: string;
}

export interface PublishResult {
  channel: string;
  version: string;
  build: number;
  fileCount: number;
}

/**
 * Ties the manifest generator (`@mzzplork/manifest`) and the backend's file
 * storage/DB together: generates a manifest for `buildDir`, copies every
 * listed file into `storageRoot/<channel>/`, and upserts the
 * `ManifestVersion`/`ClientVersion` rows — this is the "Manifest Generator
 * → Publish manifest" workflow from docs/protocol/manifest.md, previously
 * undefined. Re-publishing the same channel/version/build is idempotent.
 */
export async function publishBuild(
  prisma: PrismaClient,
  options: PublishBuildOptions,
): Promise<PublishResult> {
  const manifest = await generateManifest({
    inputDir: options.buildDir,
    channel: options.channel,
    version: options.version,
    build: options.build,
  });

  const channelStorageRoot = join(options.storageRoot, options.channel);
  await mapWithConcurrencyLimit(manifest.files, COPY_CONCURRENCY, async (file) => {
    const sourcePath = resolveSafePath(options.buildDir, file.path);
    const destPath = resolveSafePath(channelStorageRoot, file.path);
    await mkdir(dirname(destPath), { recursive: true });
    await copyFile(sourcePath, destPath);
  });

  const identity = {
    channel: options.channel,
    version: options.version,
    build: options.build,
  };
  const filesJson = JSON.stringify(manifest.files);

  await prisma.$transaction(async (tx) => {
    const manifestRow = await tx.manifestVersion.upsert({
      where: { channel_version_build: identity },
      update: { filesJson },
      create: { ...identity, filesJson },
    });

    await tx.clientVersion.upsert({
      where: { channel_version_build: identity },
      update: { manifestId: manifestRow.id },
      create: { ...identity, manifestId: manifestRow.id },
    });
  });

  return {
    channel: manifest.channel,
    version: manifest.version,
    build: manifest.build,
    fileCount: manifest.files.length,
  };
}
