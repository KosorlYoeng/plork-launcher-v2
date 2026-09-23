import type { FastifyInstance } from "fastify";
import { getServerStatus } from "../services/versionService.js";

export async function serverStatusRoutes(app: FastifyInstance): Promise<void> {
  app.get("/server/status", async (_request, reply) => {
    const status = await getServerStatus(app.prisma);
    if (!status) {
      return reply.send({ online: false, players: 0, maxPlayers: 0, version: null });
    }
    return reply.send({
      online: status.online,
      players: status.players,
      maxPlayers: status.maxPlayers,
      version: status.version,
    });
  });
}
