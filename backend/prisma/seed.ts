import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/services/authService.js";
import { publishBuild } from "../src/services/publish.js";
import { config } from "../src/config.js";

const prisma = new PrismaClient();

/**
 * Publishes a small synthetic fixture build through the real publish
 * pipeline (generates a real manifest, copies real files into storage, and
 * writes the DB rows) so the seeded manifest describes files that actually
 * exist and can genuinely be downloaded — unlike the old hand-inserted
 * fake sha256/size pair, which described a file that never existed
 * anywhere.
 */
async function publishFixtureBuild(): Promise<void> {
  const sourceDir = await mkdtemp(join(tmpdir(), "mzzplork-seed-fixture-"));
  try {
    await mkdir(join(sourceDir, "client"), { recursive: true });
    await writeFile(join(sourceDir, "client", "example.bin"), "MzzPlork seed fixture file\n");
    await writeFile(join(sourceDir, "client", "readme.txt"), "This is placeholder seed data.\n");

    await publishBuild(prisma, {
      buildDir: sourceDir,
      channel: "stable",
      version: "0.1.0",
      build: 100,
      storageRoot: config.storageRoot,
    });
  } finally {
    await rm(sourceDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  await publishFixtureBuild();

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
