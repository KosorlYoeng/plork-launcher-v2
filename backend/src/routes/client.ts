import type { FastifyInstance } from "fastify";
import { getLatestClientVersion } from "../services/versionService.js";
import { getManifestForChannel } from "../services/manifestService.js";
import { createClientSessionToken } from "../services/authService.js";
import { requireAccessToken, sendUnauthorized } from "./requireAuth.js";
import { channelQuerySchema } from "./schemas.js";

export async function clientRoutes(app: FastifyInstance): Promise<void> {
  app.get("/client/latest", { schema: channelQuerySchema }, async (request, reply) => {
    const { channel = "stable" } = request.query as { channel?: string };
    const version = await getLatestClientVersion(app.prisma, channel);
    if (!version) {
      return reply.code(404).send({ error: `No client version published for channel "${channel}"` });
    }
    return reply.send({
      version: version.version,
      channel: version.channel,
      build: version.build,
      publishedAt: version.publishedAt,
    });
  });

  app.get("/client/manifest", { schema: channelQuerySchema }, async (request, reply) => {
    const { channel = "stable" } = request.query as { channel?: string };
    const manifest = await getManifestForChannel(app.prisma, channel);
    if (!manifest) {
      return reply.code(404).send({ error: `No manifest published for channel "${channel}"` });
    }
    return reply.send(manifest);
  });

  app.post("/client/session", async (request, reply) => {
    const auth = requireAccessToken(request);
    if (!auth) {
      return sendUnauthorized(reply);
    }
    const session = createClientSessionToken(auth.userId);
    return reply.send(session);
  });
}
