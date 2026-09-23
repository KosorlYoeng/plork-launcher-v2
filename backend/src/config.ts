const isProduction = process.env.NODE_ENV === "production";

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Falls back to a local default outside production, but requires the
// variable to be explicitly set in production rather than silently running
// against a throwaway/dev value.
function requireEnvStrictInProduction(name: string, devFallback: string): string {
  return requireEnv(name, isProduction ? undefined : devFallback);
}

export const config = {
  env: process.env.NODE_ENV ?? "development",
  port: Number.parseInt(process.env.PORT ?? "3000", 10),
  databaseUrl: requireEnvStrictInProduction("DATABASE_URL", "file:./prisma/dev.db"),
  jwtSecret: requireEnvStrictInProduction("JWT_SECRET", "dev-only-insecure-secret"),
  accessTokenTtlSeconds: Number.parseInt(
    process.env.ACCESS_TOKEN_TTL_SECONDS ?? String(15 * 60),
    10,
  ),
  refreshTokenTtlDays: Number.parseInt(
    process.env.REFRESH_TOKEN_TTL_DAYS ?? "30",
    10,
  ),
  loginRateLimit: {
    max: Number.parseInt(process.env.LOGIN_RATE_LIMIT_MAX ?? "5", 10),
    timeWindowMs: Number.parseInt(
      process.env.LOGIN_RATE_LIMIT_WINDOW_MS ?? String(60 * 1000),
      10,
    ),
  },
  globalRateLimit: {
    max: Number.parseInt(process.env.RATE_LIMIT_MAX ?? "100", 10),
    timeWindowMs: Number.parseInt(
      process.env.RATE_LIMIT_WINDOW_MS ?? String(60 * 1000),
      10,
    ),
  },
} as const;
