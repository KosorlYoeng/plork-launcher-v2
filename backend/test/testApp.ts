import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

const backendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export interface TestContext {
  app: FastifyInstance;
  prisma: PrismaClient;
  cleanup: () => Promise<void>;
}

export async function createTestApp(): Promise<TestContext> {
  const dir = mkdtempSync(join(tmpdir(), "mzzplork-backend-test-"));
  const databaseUrl = `file:${join(dir, "test.db")}`;

  execSync("npx prisma db push --skip-generate --schema=prisma/schema.prisma", {
    cwd: backendRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const app = await buildApp({ prisma, logger: false });
  await app.ready();

  return {
    app,
    prisma,
    cleanup: async () => {
      await app.close();
      await prisma.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
