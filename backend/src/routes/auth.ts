import type { FastifyInstance } from "fastify";
import {
  AuthError,
  createSession,
  revokeSession,
  rotateSession,
  verifyLogin,
} from "../services/authService.js";
import { config } from "../config.js";

const loginSchema = {
  body: {
    type: "object",
    required: ["username", "password"],
    properties: {
      username: { type: "string", minLength: 1 },
      password: { type: "string", minLength: 1 },
    },
    additionalProperties: false,
  },
} as const;

const refreshTokenSchema = {
  body: {
    type: "object",
    required: ["refreshToken"],
    properties: {
      refreshToken: { type: "string", minLength: 1 },
    },
    additionalProperties: false,
  },
} as const;

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/auth/login",
    {
      schema: loginSchema,
      config: {
        rateLimit: {
          max: config.loginRateLimit.max,
          timeWindow: config.loginRateLimit.timeWindowMs,
        },
      },
    },
    async (request, reply) => {
      const { username, password } = request.body as {
        username: string;
        password: string;
      };

      const user = await app.prisma.user.findUnique({ where: { username } });
      const loginOk = await verifyLogin(user, password);
      if (!loginOk || !user) {
        return reply.code(401).send({ error: "Invalid username or password" });
      }

      const tokens = await createSession(app.prisma, user.id);
      return reply.send(tokens);
    },
  );

  app.post(
    "/auth/refresh",
    { schema: refreshTokenSchema },
    async (request, reply) => {
      const { refreshToken } = request.body as { refreshToken: string };
      try {
        const tokens = await rotateSession(app.prisma, refreshToken);
        return reply.send(tokens);
      } catch (error) {
        if (error instanceof AuthError) {
          return reply.code(401).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  app.post(
    "/auth/logout",
    { schema: refreshTokenSchema },
    async (request, reply) => {
      const { refreshToken } = request.body as { refreshToken: string };
      await revokeSession(app.prisma, refreshToken);
      return reply.code(204).send();
    },
  );
}
