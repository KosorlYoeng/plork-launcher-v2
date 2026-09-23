import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/services/authService.js";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const manifest = await prisma.manifestVersion.upsert({
    where: { channel_version_build: { channel: "stable", version: "0.1.0", build: 100 } },
    update: {},
    create: {
      channel: "stable",
      version: "0.1.0",
      build: 100,
      filesJson: JSON.stringify([
        { path: "client/example.bin", size: 123456, sha256: "0".repeat(64) },
      ]),
    },
  });

  await prisma.clientVersion.upsert({
    where: { channel_version_build: { channel: "stable", version: "0.1.0", build: 100 } },
    update: {},
    create: { channel: "stable", version: "0.1.0", build: 100, manifestId: manifest.id },
  });

  await prisma.launcherVersion.upsert({
    where: { channel_version_build: { channel: "stable", version: "1.0.0", build: 1 } },
    update: {},
    create: {
      channel: "stable",
      version: "1.0.0",
      build: 1,
      downloadUrl: "https://example.com/downloads/MzzPlorkSetup.exe",
      sha256: "1".repeat(64),
    },
  });

  await prisma.serverStatus.create({
    data: { online: true, players: 4, maxPlayers: 256, version: "0.1.0" },
  });

  await prisma.user.upsert({
    where: { username: "devuser" },
    update: {},
    create: {
      username: "devuser",
      email: "devuser@example.com",
      passwordHash: await hashPassword("dev-password"),
    },
  });

  console.log("Seed complete: channel=stable, user=devuser/dev-password");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
