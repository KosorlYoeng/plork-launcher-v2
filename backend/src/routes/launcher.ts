import type { FastifyInstance } from "fastify";
import { getLatestLauncherVersion } from "../services/versionService.js";
import { channelQuerySchema } from "./schemas.js";

export async function launcherRoutes(app: FastifyInstance): Promise<void> {
  app.get("/launcher/latest", { schema: channelQuerySchema }, async (request, reply) => {
    const { channel = "stable" } = request.query as { channel?: string };
    const version = await getLatestLauncherVersion(app.prisma, channel);
    if (!version) {
      return reply.code(404).send({ error: `No launcher version published for channel "${channel}"` });
    }
    return reply.send({
      version: version.version,
      channel: version.channel,
      build: version.build,
      downloadUrl: version.downloadUrl,
      sha256: version.sha256,
      publishedAt: version.publishedAt,
    });
  });
}
