import "dotenv/config";
import { buildApp } from "./app.js";
import { createPrismaClient } from "./db/client.js";
import { config } from "./config.js";

async function main(): Promise<void> {
  const prisma = createPrismaClient(config.databaseUrl);
  const app = await buildApp({ prisma });

  const shutdown = async (): Promise<void> => {
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await app.listen({ port: config.port, host: "0.0.0.0" });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
