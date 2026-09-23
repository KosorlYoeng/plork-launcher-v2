import { randomBytes, createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

export class AuthError extends Error {}

const BCRYPT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

// A hash of a fixed, non-secret placeholder — never a real password's hash.
// Used to run bcrypt.compare for unknown usernames too (see verifyLogin
// below), so login response time doesn't reveal whether a username exists.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  "mzzplork-timing-safety-placeholder",
  BCRYPT_ROUNDS,
);

/**
 * Verifies login credentials against an optional user record, always
 * running bcrypt.compare (against a dummy hash when `user` is null) so the
 * response time for "unknown username" and "wrong password" is equalized —
 * otherwise an unknown username short-circuits before bcrypt runs and
 * becomes distinguishable by timing.
 */
export async function verifyLogin(
  user: { passwordHash: string } | null,
  password: string,
): Promise<boolean> {
  const isValid = await verifyPassword(
    password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );
  return user !== null && isValid;
}

export function createAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwtSecret, {
    expiresIn: config.accessTokenTtlSeconds,
  });
}

export function verifyAccessToken(token: string): { userId: string } {
  const payload = jwt.verify(token, config.jwtSecret);
  if (typeof payload === "string" || typeof payload.sub !== "string") {
    throw new AuthError("Invalid access token payload");
  }
  return { userId: payload.sub };
}

const CLIENT_SESSION_TOKEN_TTL_SECONDS = 5 * 60;

/**
 * Issues a short-lived token the launcher hands to the MzzPlork game client,
 * which the client will in turn present to the MzzPlork game server. There
 * is no game server to validate it against yet (see docs/plan.md Phase 3),
 * so this is stateless JWT issuance only for now.
 */
export function createClientSessionToken(userId: string): {
  token: string;
  expiresIn: number;
} {
  const token = jwt.sign({ sub: userId, type: "client-session" }, config.jwtSecret, {
    expiresIn: CLIENT_SESSION_TOKEN_TTL_SECONDS,
  });
  return { token, expiresIn: CLIENT_SESSION_TOKEN_TTL_SECONDS };
}

function generateOpaqueToken(): string {
  return randomBytes(32).toString("hex");
}

function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export async function createSession(
  prisma: PrismaClient,
  userId: string,
): Promise<IssuedTokens> {
  const refreshToken = generateOpaqueToken();
  const expiresAt = new Date(
    Date.now() + config.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  );

  await prisma.session.create({
    data: {
      userId,
      refreshTokenHash: hashOpaqueToken(refreshToken),
      expiresAt,
    },
  });

  return {
    accessToken: createAccessToken(userId),
    refreshToken,
    expiresIn: config.accessTokenTtlSeconds,
  };
}

/**
 * Rotates a refresh token: the presented token is revoked and a new
 * session (new refresh token + fresh access token) is issued. Rejects
 * revoked, expired, or unknown tokens.
 *
 * The revoke is a single conditional `updateMany` (revoke only if
 * `revokedAt` is still null) rather than a read-then-write, so two
 * concurrent requests presenting the same token can't both observe it as
 * "not yet revoked" and each mint their own session — only the request
 * whose `updateMany` actually flips the row wins; the other sees `count !==
 * 1` and is rejected as reuse.
 */
export async function rotateSession(
  prisma: PrismaClient,
  presentedRefreshToken: string,
): Promise<IssuedTokens> {
  const tokenHash = hashOpaqueToken(presentedRefreshToken);

  const revoked = await prisma.session.updateMany({
    where: { refreshTokenHash: tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
    data: { revokedAt: new Date() },
  });

  if (revoked.count !== 1) {
    throw new AuthError("Invalid or expired refresh token");
  }

  const session = await prisma.session.findUniqueOrThrow({
    where: { refreshTokenHash: tokenHash },
  });

  return createSession(prisma, session.userId);
}

export async function revokeSession(
  prisma: PrismaClient,
  presentedRefreshToken: string,
): Promise<void> {
  const tokenHash = hashOpaqueToken(presentedRefreshToken);
  await prisma.session.updateMany({
    where: { refreshTokenHash: tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
