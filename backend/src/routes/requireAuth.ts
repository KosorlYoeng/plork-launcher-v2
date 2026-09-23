import type { FastifyReply, FastifyRequest } from "fastify";
import { AuthError, verifyAccessToken } from "../services/authService.js";

export function requireAccessToken(
  request: FastifyRequest,
): { userId: string } | null {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  try {
    return verifyAccessToken(header.slice("Bearer ".length));
  } catch (error) {
    if (error instanceof AuthError || (error as Error).name === "JsonWebTokenError" || (error as Error).name === "TokenExpiredError") {
      return null;
    }
    throw error;
  }
}

export function sendUnauthorized(reply: FastifyReply): FastifyReply {
  return reply.code(401).send({ error: "Missing or invalid access token" });
}
