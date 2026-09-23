# Authentication Protocol

Implements plan §12. All endpoints below are under `/api/v1`.

## Login

```
POST /api/v1/auth/login
{ "username": "...", "password": "..." }

→ 200 { "accessToken": "...", "refreshToken": "...", "expiresIn": 900 }
→ 400   malformed body
→ 401   invalid username/password
→ 429   too many attempts (rate-limited, see below)
```

- Passwords are hashed with bcrypt (`bcryptjs`, `backend/src/services/authService.ts`);
  plaintext passwords are never stored.
- `accessToken` is a JWT signed with `JWT_SECRET` (env-only, never
  hardcoded — see `backend/.env.example`), valid for
  `ACCESS_TOKEN_TTL_SECONDS` (default 900s / 15 min).
- `refreshToken` is a random 32-byte opaque token. Only its SHA-256 hash is
  stored server-side (`sessions.refreshTokenHash`); the plaintext value is
  never persisted, only returned once to the caller.
- `/auth/login` has a stricter rate limit (`LOGIN_RATE_LIMIT_MAX`, default
  5/min per IP) than the rest of the API, to blunt credential-stuffing.

## Refresh

```
POST /api/v1/auth/refresh
{ "refreshToken": "..." }

→ 200 { "accessToken": "...", "refreshToken": "...", "expiresIn": 900 }
→ 401   unknown, expired, or already-used refresh token
```

Refresh tokens rotate on every use: the presented token is immediately
revoked (`sessions.revokedAt` set) and a brand new session (new access +
refresh token pair) is issued. Presenting an already-used or revoked token
is rejected — this detects refresh-token replay.

## Logout

```
POST /api/v1/auth/logout
{ "refreshToken": "..." }

→ 204
```

Revokes the session server-side (idempotent — logging out twice, or logging
out an already-expired session, still returns 204).

## Client session tokens

```
POST /api/v1/client/session
Authorization: Bearer <accessToken>

→ 200 { "token": "...", "expiresIn": 300 }
→ 401   missing/invalid/expired access token
```

Issues a short-lived (5 min) token intended for the MzzPlork game client to
present to the MzzPlork game server when connecting. There is no game
server yet to validate this token against (blocked on the CitizenFX
integration — `docs/plan.md` Phase 3), so today this is stateless JWT
issuance only; server-side validation is future work once a real game
server exists.

## What is never done

- No plaintext password or token is ever logged — the backend's Pino logger
  is configured with `redact: ["req.body.password", "req.body.refreshToken",
  "req.headers.authorization"]` (`backend/src/app.ts`).
- No secret (`JWT_SECRET`, DB credentials) is embedded in launcher or client
  code — they only ever hold short-lived tokens issued by this API.
