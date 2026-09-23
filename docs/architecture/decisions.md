# Architecture Decisions

ADR-style log per plan §24. Newest first.

---

## ADR-010: Fixed a relative-sqlite-path footgun that made `dev.db` silently resolve to the wrong file

**Context**: while manually running the launcher against a locally-started
backend (`cd backend && npm run dev`), login failed with `Internal Server
Error`. Backend logs showed `PrismaClientInitializationError: ... Error code
14: Unable to open the database file`. `backend/prisma/dev.db` existed but
was a 0-byte file.

**Root cause**: `.env` had `DATABASE_URL="file:./prisma/dev.db"`. Prisma
resolves a *relative* sqlite datasource URL relative to `schema.prisma`'s
own directory (`backend/prisma/`), not the `backend/` project root — so
that URL actually resolved to `backend/prisma/prisma/dev.db` (a doubly-
nested path), both for the Prisma CLI *and* for the generated client at
runtime (the resolution base is baked in at `prisma generate` time,
independent of `process.cwd()` or what string is passed at runtime). The
real, working database had been living there all along since Phase 1;
`backend/prisma/dev.db` was a stray, never-migrated empty file from an
earlier point that happened to sit at the path everyone — `.env`,
`.gitignore`, `docs/development/building.md`, my own mental model —
assumed was correct. Nothing caught this because every automated test
uses an absolute temp-file `DATABASE_URL` (see `backend/test/testApp.ts`,
`launcher/test/testBackend.ts`), which has no relative-resolution
ambiguity; only ever manually starting the dev server against `.env`
surfaced it.

**Fixed**: changed `DATABASE_URL` to `"file:./dev.db"` in both `.env` and
`.env.example`, and `config.ts`'s fallback to match — this now correctly
(and unambiguously) resolves to `backend/prisma/dev.db`, matching what
`.gitignore` and the docs already assumed. Deleted the stray nested
`backend/prisma/prisma/` directory and the empty top-level `dev.db`,
then rebuilt the database via `prisma migrate dev` (which also re-ran the
seed) at the corrected path.

**Consequences**: anyone who previously set `DATABASE_URL` to a relative
path containing a leading `prisma/` segment (matching the old, wrong
`.env.example`) has the same doubly-nested-file problem; if this recurs,
check `find backend/prisma -iname "*.db"` for an unexpected `prisma/prisma/`
directory before assuming the database is simply missing data.

---

## ADR-009: Launcher verification pass found and fixed a real Electron/ESM bug, plus a missing clientPath wiring gap

**Context**: before calling Phase 2 done, ran the same rigor as Phase 1 —
39 new unit/integration tests, then an actual manual run of the built
Electron app via a Playwright `_electron` driver (real window, real click
events, screenshots), against the real Phase 1 backend.

**Found and fixed**:
1. **Electron's built-in `electron` module only populates its exports for
   a synchronous `require()`, not a native-ESM `import`.** `launcher/`'s
   `package.json` has `"type": "module"`, so electron-vite's default main/
   preload build emitted real ESM (`import { app } from "electron"`). This
   type-checks fine but throws/returns empty at runtime — confirmed by
   direct experimentation (`import electron from "electron"` inside a
   real Electron main process returned `{}`, no `.app` property, only
   during `import`-based ESM loading; a plain CJS `require("electron")` in
   the same real Electron-launched app worked correctly). Fixed by forcing
   genuine CommonJS output for `main`/`preload` specifically
   (`electron.vite.config.ts`, `output: { format: "cjs", entryFileNames:
   "[name].cjs" }`), independent of the package's own `"type"` field —
   this is the same format every working electron-vite app ships, for
   exactly this reason.
2. **`ApiClient` always sent `content-type: application/json`, even for
   bodyless requests** (e.g. `POST /client/session`, header-only). Fastify
   rejects a declared-JSON request with an empty body. Found by the
   `ApiClient` integration tests running against the *real* backend (not a
   mock, which wouldn't have caught this). Fixed: only set the header when
   `init.body` is present.
3. **Nothing in the UI ever set `clientPath`** (distinct from `gamePath` —
   the MzzPlork client's own install location vs. the GTA V install), so
   `checkForUpdates` could never succeed no matter what the user did in
   Settings. Found while preparing the manual walkthrough, before even
   running it. Fixed: `LauncherState.selectInstallation` now defaults
   `clientPath` (to a location under `app.getPath('userData')`) the first
   time a game install is selected, if not already set; both
   `validateGamePath` and the Settings UI's auto-detect flow now go
   through it.
4. **`SteamGameDetector` bailed out entirely (returned no results) if
   `steamapps/libraryfolders.vdf` was missing**, instead of still checking
   the Steam root's own default library. Found by its own unit test. Fixed
   to treat a missing/unreadable vdf as "no additional libraries," not
   "no Steam install at all."

**Also noted, not a code bug**: this session's shell has
`ELECTRON_RUN_AS_NODE=1` set in its inherited environment, which forces
any Electron binary invocation into plain-Node CLI mode (skips the entire
app/BrowserWindow bootstrap) — had to be explicitly unset for the
verification driver's launch. Anyone manually running the launcher from a
similar nested-Electron host environment should check for this.

**Consequences**: the manual verification step is not decorative — every
one of these four bugs would have shipped if "the automated tests pass"
had been treated as sufficient. `docs/plan.md` records this the same way
ADR-005 did for Phase 1.

---

## ADR-008: `UpdateManager` targets a generic download URL; real file hosting is a new backend task (BE-007)

**Context**: the Phase 1 manifest schema (`{path, size, sha256}`) has no
per-file download URL, and the backend never grew a way to serve actual
file bytes — Phase 1 only persisted manifest *metadata* in the DB. So
there's nothing real yet for a production launcher to download from.

**Options**:
1. Block Phase 2 on building real file hosting first.
2. Build `UpdateManager`'s downloader generically (configurable base URL +
   relative path per manifest entry), fully tested against a real local
   HTTP test server, and track real file hosting as a separate, explicit
   follow-up task.

**Chosen approach**: (2).

**Reason**: this keeps Phase 2 scoped to what `docs/plan.md` already
agreed to (launcher shell, no backend changes) while still giving
`UpdateManager` full, real (not mocked) test coverage — the download
logic itself doesn't care where the bytes come from, only that resume/
retry/verify/atomic-replace behave correctly against a real HTTP server,
which the test suite exercises directly.

**Consequences**: added `BE-007` (file storage/serving) to `docs/plan.md`
as `TODO`. Until it's built, `MZZPLORK_BASE_DOWNLOAD_URL` defaults to a
placeholder domain, and any real "check for updates" attempt correctly
fails with a real, visible error (verified manually — see ADR-009) rather
than hanging or silently no-opping.

---

## ADR-007: IPC-only security model — renderer never touches network, filesystem, or tokens directly

**Context**: needed a security boundary between the Vue renderer (Electron
webContents, effectively an embedded browser page) and anything sensitive
(API tokens, the filesystem, the backend connection).

**Options**:
1. `nodeIntegration: true` / disabled `contextIsolation`, letting the
   renderer call Node/network APIs directly.
2. `contextIsolation: true`, `nodeIntegration: false`, a typed
   `contextBridge` surface in `src/preload/index.ts`, with `ApiClient`,
   `SecureStorage`, `GameDetector`, `UpdateManager`, `ProcessManager` all
   living in the main process only.

**Chosen approach**: (2).

**Reason**: this is Electron's documented secure baseline, and directly
satisfies plan §6's "Electron Main" ownership list — none of the modules
it lists as Electron-Main-owned are reachable from renderer code at all,
so a compromised/malicious renderer page can't exfiltrate the refresh
token or make arbitrary network calls.

**Consequences**: every new capability needs an IPC channel
(`src/shared/ipc.ts`) plus a `preload` wrapper before the renderer can use
it — more boilerplate than direct access, but the renderer's entire API
surface is auditable in one file (`src/preload/index.ts`).

---

## ADR-006: electron-vite + Vue 3 + Pinia + vue-router for the launcher

**Context**: Phase 0 found no existing launcher, Electron, or Vue code
anywhere in the workspace (plan §6: "if an existing Electron/Vue launcher
exists... reuse it" — none does).

**Options**:
1. electron-vite (main/preload/renderer as three coordinated Vite builds).
2. electron-forge with a Vite plugin.
3. Hand-rolled Electron + esbuild/webpack setup.

**Chosen approach**: (1).

**Reason**: electron-vite is purpose-built for exactly this split-build
shape, TypeScript throughout, and reuses the same Vite/Vitest tooling
`backend`/`tools/manifest` already depend on — no new build philosophy to
introduce. Pinia + vue-router are the standard Vue 3 state/routing
libraries and match the "Splash/Login/Home/Updating/Settings/Error" view
list from plan §6 directly.

**Consequences**: pinned `vite` to `^7.3.6` at the **repo root** (not just
in `launcher/`) so it's the single hoisted version electron-vite and
`@vitejs/plugin-vue` resolve — `vitest@2.x` (used by `backend`/
`tools/manifest`) still privately nests its own older `vite@5.x` wherever
it needs one, which is fine since nothing imports types from vitest's
private copy. Getting this wrong first (letting npm hoist an old `vite`
that `electron-vite` then resolved) produced confusing cross-version
TypeScript errors before the fix.

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
