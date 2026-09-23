import type { PrismaClient } from "@prisma/client";

export interface ManifestFile {
  path: string;
  size: number;
  sha256: string;
}

export interface ManifestResponse {
  channel: string;
  version: string;
  build: number;
  files: ManifestFile[];
}

/**
 * Returns the manifest attached to the latest *published client version*
 * for the channel (by build desc) rather than the latest manifest row in
 * isolation, so this always agrees with getLatestClientVersion — a
 * manifest can only ever be "latest" here by being the one the latest
 * client version actually points at.
 */
export async function getManifestForChannel(
  prisma: PrismaClient,
  channel: string,
): Promise<ManifestResponse | null> {
  const clientVersion = await prisma.clientVersion.findFirst({
    where: { channel },
    orderBy: { build: "desc" },
    include: { manifest: true },
  });

  if (!clientVersion) {
    return null;
  }

  const { manifest } = clientVersion;
  return {
    channel: manifest.channel,
    version: manifest.version,
    build: manifest.build,
    files: JSON.parse(manifest.filesJson) as ManifestFile[],
  };
}
