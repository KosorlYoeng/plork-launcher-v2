# Architecture Decisions

ADR-style log per plan §24. Newest first.

---

## ADR-005: Phase 1 verification pass found and fixed 6 real bugs

**Context**: before starting Phase 2, ran an independent code-review pass
(`/code-review --level high`) plus manual live-server re-verification over
the Phase 1 backend and manifest generator, rather than treating "tests
pass" as sufficient. It found 8 issues; 6 were real bugs worth fixing now,
2 were accepted as-is.

**Fixed**:
1. `tools/manifest/src/generate.ts` used `lstat` (link's own size) instead
   of `stat` (target's size) for symlinked files, while the hash read the
   target's content — size/hash mismatch for any in-root file symlink. Now
   uses `stat`.
2. The same file recursed into symlinked directories with no cycle guard —
   a symlink pointing back at an ancestor directory caused unbounded
   recursion / a crash. Fixed by no longer recursing into symlinked
   directories at all (only file symlinks are followed); simpler than cycle
   detection and sufficient for build-output trees.
3. `generateManifest` opened an unbounded number of concurrent read
   streams via `Promise.all` over every file — would hit `EMFILE` on a
   large real client build. Added a small concurrency-limited mapper
   (`HASH_CONCURRENCY = 64`).
4. `backend/src/services/manifestService.ts`'s `getManifestForChannel`
   picked "latest manifest" by `createdAt desc` while
   `getLatestClientVersion` picks "latest" by `build desc` — the two could
   disagree if an older build was republished more recently. Fixed by
   fetching the manifest through the latest `ClientVersion`'s `manifest`
   relation, so the two endpoints agree by construction, not by matching
   sort order in two places. Covered by a regression test in
   `backend/test/versions.test.ts`.
5. `authService.rotateSession` read-then-wrote a session's `revokedAt`
   non-atomically, letting two concurrent refresh requests with the same
   token both pass the "not yet revoked" check and each mint a session —
   defeating single-use rotation. Fixed with a single conditional
   `updateMany` (`revokedAt: null` in the `where`) that only one concurrent
   caller can win; the loser sees `count !== 1` and is rejected. Verified
   both in a Vitest integration test and by firing two real concurrent curl
   requests at a running server.
6. `POST /auth/login` short-circuited on `!user`, skipping `bcrypt.compare`
   entirely for unknown usernames — a timing side-channel letting an
   attacker distinguish valid from invalid usernames by response latency.
   Fixed with `verifyLogin`, which always runs `bcrypt.compare` (against a
   fixed dummy hash when there's no user), equalizing response time.
7. `config.databaseUrl` silently fell back to a local dev SQLite path even
   with `NODE_ENV=production`, unlike `jwtSecret` which already refused to.
   Both now go through the same `requireEnvStrictInProduction` helper.

**Not fixed (accepted)**: the duplicated `channelQuerySchema` between
`client.ts`/`launcher.ts` was extracted to `backend/src/routes/schemas.ts`
— trivial, no tradeoff. Nothing was left un-fixed from this pass.

**Consequences**: `tools/manifest` gained 3 new symlink-behavior tests and
`backend` gained 2 new regression tests (concurrent-refresh, manifest/
version consistency) — 16 backend + 5 manifest = 21 tests, all passing,
plus a repeat manual smoke test against the real running dev server for
the concurrency and login-timing fixes specifically (not just the unit/
integration suite).

---

## ADR-004: Test vulnerabilities in vite/vitest left unfixed for now

**Context**: `npm audit` reports 5 vulnerabilities (moderate/high/critical)
after installing dependencies for Phase 1.

**Options**:
1. Run `npm audit fix --force` (bumps to Vitest 5, a breaking major version).
2. Leave as-is and document.

**Chosen approach**: (2), leave as-is.

**Reason**: every reported CVE (`GHSA-82fw-gwwq-j7x9`, `GHSA-67mh-4wv8-2f99`,
`GHSA-4w7w-66w2-5vf9`, and two more) is about the Vite dev server or Vitest
UI server being reachable by a malicious website (CSRF-style / path
traversal against a *running, network-exposed dev server*). This project
only invokes `vitest run` (one-shot test runner, no server) — never `vite
dev` or the Vitest UI — so none of these are reachable in our usage.
Forcing a Vitest 5 major bump was judged out of scope for a foundations
pass.

**Consequences**: revisit before adding an actual `vite`-served
launcher/renderer dev workflow (Phase 2), since at that point a real dev
server would be running and the CVEs become directly relevant.

---

## ADR-003: Refresh tokens are opaque + hashed, not JWTs

**Context**: needed a refresh-token scheme for `/auth/refresh` (plan §12).

**Options**:
1. Long-lived JWT refresh tokens (self-contained, statelessly verifiable).
2. Opaque random tokens, hashed at rest, looked up in `sessions`.

**Chosen approach**: (2).

**Reason**: a stateless long-lived JWT can't be revoked before it expires
without an additional denylist (which reintroduces the state you were
trying to avoid). An opaque, DB-backed, rotate-on-use token gives real
logout/revocation and replay detection (reusing an already-rotated token is
rejected) for a small lookup cost — acceptable for this API's scale.

**Consequences**: every refresh requires a DB round-trip; access tokens stay
short-lived (15 min) so the DB is not on the hot path for most requests.

---

## ADR-002: Prisma + SQLite for the backend datastore

**Context**: plan §8 says "use the existing database technology if
available" — none exists (Phase 0 audit found an empty repo).

**Options**:
1. Postgres + a migration tool, requiring a running Postgres for local dev.
2. SQLite via Prisma, file-based.
3. Hand-rolled SQL with no ORM.

**Chosen approach**: (2).

**Reason**: zero external services needed to develop or test locally (the
whole backend test suite spins up a throwaway SQLite file per test file and
tears it down — see `backend/test/testApp.ts`); Prisma's schema/query layer
is not SQLite-specific, so moving to Postgres later is a `datasource
provider` + connection-string change, not a rewrite.

**Consequences**: SQLite's concurrency model (single-writer) is not meant
for production multi-instance deployment — revisit the `datasource
provider` before a real production rollout (tracked informally; no ticket
yet since Phase 4+ production hardening hasn't been scoped into tasks).

---

## ADR-001: Node.js + TypeScript + Fastify for the backend; npm workspaces monorepo

**Context**: Phase 0 found no existing backend of any kind, so plan §7's
"use the existing backend stack if one already exists" doesn't apply.

**Options**:
1. Fastify (TS-first, JSON-schema validation and rate-limiting as
   first-party plugins).
2. Express (larger ecosystem, but validation/rate-limiting need extra
   hand-wired middleware).

**Chosen approach**: (1) Fastify, inside an npm-workspaces monorepo
(`backend/`, `tools/manifest/`) so both packages share one `npm install`
and TypeScript/Vitest config.

**Reason**: plan §18 requires input validation and rate limiting on every
endpoint; Fastify's built-in JSON Schema validation and
`@fastify/rate-limit` cover both without extra hand-rolled middleware.

**Consequences**: route handlers declare a `schema` object per plan §18;
any new route must do the same rather than validating manually inside the
handler.
