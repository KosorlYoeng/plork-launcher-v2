import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { buildApp, createPrismaClient, hashPassword, type BuildAppOptions } from "@mzzplork/backend";
import type { PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);
const backendRoot = join(dirname(require.resolve("@mzzplork/backend")), "..");

export interface TestBackend {
  baseUrl: string;
  prisma: PrismaClient;
  cleanup: () => Promise<void>;
}

/**
 * Boots the real Phase 1 backend (real Fastify app, real Prisma/SQLite,
 * listening on a real ephemeral port) so ApiClient's tests exercise actual
 * HTTP requests/responses rather than a mocked fetch — the same "real
 * server, not mocks" approach backend/test/testApp.ts already uses.
 */
export async function startTestBackend(): Promise<TestBackend> {
  const dir = mkdtempSync(join(tmpdir(), "mzzplork-launcher-apiclient-"));
  const databaseUrl = `file:${join(dir, "test.db")}`;

  execSync("npx prisma db push --skip-generate --schema=prisma/schema.prisma", {
    cwd: backendRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });

  const prisma = createPrismaClient(databaseUrl);
  const app = await buildApp({ prisma, logger: false } satisfies BuildAppOptions);
  await app.listen({ port: 0, host: "127.0.0.1" });

  const address = app.server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  await prisma.user.create({
    data: {
      username: "apiclienttest",
      email: "apiclienttest@example.com",
      passwordHash: await hashPassword("correct-password"),
    },
  });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    prisma,
    cleanup: async () => {
      await app.close();
      await prisma.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
