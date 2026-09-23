import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import type { PrismaClient } from "@prisma/client";
import { config } from "./config.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { clientRoutes } from "./routes/client.js";
import { clientFilesRoutes } from "./routes/clientFiles.js";
import { launcherRoutes } from "./routes/launcher.js";
import { serverStatusRoutes } from "./routes/serverStatus.js";

export interface BuildAppOptions {
  prisma: PrismaClient;
  logger?: boolean;
  /** Defaults to `config.storageRoot`; overridable so tests can use an isolated temp directory. */
  storageRoot?: string;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: (options.logger ?? true)
      ? {
          redact: [
            "req.body.password",
            "req.body.refreshToken",
            "req.headers.authorization",
          ],
        }
      : false,
  });

  app.decorate("prisma", options.prisma);
  app.decorate("storageRoot", options.storageRoot ?? config.storageRoot);

  await app.register(rateLimit, {
    global: true,
    max: config.globalRateLimit.max,
    timeWindow: config.globalRateLimit.timeWindowMs,
  });

  await app.register(healthRoutes);

  await app.register(
    async (v1) => {
      await v1.register(authRoutes);
      await v1.register(clientRoutes);
      await v1.register(clientFilesRoutes);
      await v1.register(launcherRoutes);
      await v1.register(serverStatusRoutes);
    },
    { prefix: "/api/v1" },
  );

  return app;
}
