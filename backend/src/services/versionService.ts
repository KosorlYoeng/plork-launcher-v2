import type { PrismaClient } from "@prisma/client";

export async function getLatestClientVersion(
  prisma: PrismaClient,
  channel: string,
) {
  return prisma.clientVersion.findFirst({
    where: { channel },
    orderBy: { build: "desc" },
  });
}

export async function getLatestLauncherVersion(
  prisma: PrismaClient,
  channel: string,
) {
  return prisma.launcherVersion.findFirst({
    where: { channel },
    orderBy: { build: "desc" },
  });
}

/**
 * There is no live MzzPlork game server to poll yet (blocked on CitizenFX
 * integration, see docs/plan.md Phase 3), so this reads the most recently
 * written status row rather than querying a real server in real time.
 */
export async function getServerStatus(prisma: PrismaClient) {
  return prisma.serverStatus.findFirst({
    orderBy: { updatedAt: "desc" },
  });
}
