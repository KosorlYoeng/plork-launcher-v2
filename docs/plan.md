# MzzPlork — Task Plan

This tracks implementation as small tasks, per
[plork-launcher-plan.md](../plork-launcher-plan.md) §25. Status values:
`TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`. A task is not `DONE` until it has
been built/run and tested.

Context: this workspace started empty (see
[docs/architecture/repository-audit.md](architecture/repository-audit.md)).
MzzPlork is being built greenfield — there is no in-repo CitizenFX checkout
to extend. Tasks that require an actual CitizenFX client build are marked
`BLOCKED` until the user decides how upstream source is brought into this
workspace; everything else (manifest format, backend, launcher shell) can
proceed independently.

---

## Phase 0 — Repository Audit

| ID | Title | Description | Files | Deps | Status | Testing |
|----|-------|-------------|-------|------|--------|---------|
| P0-01 | Repository audit | Inspect workspace, document findings | `docs/architecture/repository-audit.md` | — | DONE | N/A (documentation) |
| P0-02 | Task plan | Break project into trackable tasks | `docs/plan.md` | P0-01 | DONE | N/A (documentation) |

---

## Phase 1 — Foundations (no CitizenFX dependency)

Goal: a working manifest format + generator, and a backend skeleton that can
serve versions/manifests, with tests. Nothing here requires GTA V or a
CitizenFX build.

| ID | Title | Description | Files/components | Deps | Status | Testing requirements |
|----|-------|-------------|-------------------|------|--------|----------------------|
| MF-001 | Manifest schema | Define the JSON manifest schema (channel, version, build, files[{path,size,sha256}]) per plan §9 | `docs/protocol/manifest.md`, `tools/manifest/src/types.ts` | P0-02 | DONE | Documented; shape enforced by generator + backend tests |
| MF-002 | Manifest generator CLI | Tool that walks a build output dir, computes size+SHA-256 per file, emits manifest.json | `tools/manifest/src/generate.ts`, `tools/manifest/src/cli.ts` | MF-001 | DONE | `tools/manifest` fixture test passing (`npm test`); manual CLI run verified against a throwaway dir + `shasum -a 256` |
| BE-000 | Backend project scaffold | Node/TypeScript + Fastify (no existing backend to reuse) — see ADR-001 | `backend/` | P0-02 | DONE | `GET /health` returns 200 (test + manual curl) |
| BE-001 | DB schema | users, sessions, client_versions, launcher_versions, manifest_versions, server_status (plan §8) via Prisma — see ADR-002 | `backend/prisma/schema.prisma`, `backend/prisma/migrations/` | BE-000 | DONE | `prisma migrate dev` applies clean on empty DB; used by all backend tests |
| BE-002 | `GET /api/v1/client/manifest` | Serve current manifest for a channel | `backend/src/routes/client.ts`, `backend/src/services/manifestService.ts` | BE-001, MF-001 | DONE | Integration test + manual curl against seeded DB |
| BE-003 | `GET /api/v1/client/latest`, `GET /api/v1/launcher/latest` | Version lookup endpoints | `backend/src/routes/client.ts`, `backend/src/routes/launcher.ts` | BE-001 | DONE | Integration tests + manual curl, incl. 404-for-unknown-channel case |
| BE-004 | `POST /auth/login`, `/auth/refresh`, `/auth/logout` | Auth per plan §12 — see ADR-003 (opaque hashed refresh tokens, rotation) | `backend/src/routes/auth.ts`, `backend/src/services/authService.ts` | BE-001 | DONE | Integration tests: valid/invalid creds, malformed body, refresh rotation + reuse-rejection, logout revocation; manual curl end-to-end |
| BE-005 | `GET /server/status`, `POST /client/session` | Status + session endpoints (plan §7, §13) | `backend/src/routes/serverStatus.ts`, `backend/src/routes/client.ts` | BE-001, BE-004 | DONE (status is a served/seeded cache row, not live game-server polling — no game server exists yet, see Phase 3) | Integration tests + manual curl |
| BE-006 | Rate limiting + input validation | Plan §18 security requirements applied to all `/api/v1/*` routes | `backend/src/app.ts` (`@fastify/rate-limit`), per-route `schema` blocks | BE-000..BE-005 | DONE | Test: 8 rapid logins → at least one 429; malformed login body → 400 |

---

## Phase 2 — Launcher shell (no CitizenFX dependency)

Goal: an Electron+Vue launcher that can authenticate, detect GTA V, fetch a
manifest, download/verify files, and report progress — against the Phase 1
backend. Does not yet start a real game client (that needs Phase 4).

| ID | Title | Description | Files/components | Deps | Status | Testing requirements |
|----|-------|-------------|-------------------|------|--------|----------------------|
| LN-000 | Launcher project scaffold | Electron main + Vue renderer, per plan §6 target structure — electron-vite + Vue 3 + Pinia + vue-router, see ADR-006/ADR-007 | `launcher/` | P0-02 | DONE | `npm run dev` / built app opens a real window (Playwright `_electron` driver, screenshotted) |
| LN-001 | Config model | `environment, apiBaseUrl, channel, gamePath, clientPath, autoUpdate` (plan §15), loaded from a config file, not hardcoded | `launcher/src/main/config.ts` | LN-000 | DONE | Unit tests: defaults, persisted merge across reload |
| LN-002 | GameDetector | Detect GTA V install (Steam/Epic/Rockstar registry & known paths), validate, persist selection, no single hardcoded path (plan §6) | `launcher/src/main/GameDetector.ts` | LN-001 | DONE | Unit tests against real temp-dir fixtures per strategy (Steam/Epic/Rockstar-default) + an injected fake registry reader for the Windows-only path |
| LN-003 | API client | Typed client for backend `/api/v1/*` | `launcher/src/main/ApiClient.ts` | BE-002..BE-005 | DONE | Integration tests against the real Phase 1 backend (booted in-process on a real port, not mocked) |
| LN-004 | Auth/Login UI + SecureStorage | Login screen, token storage (OS keychain / encrypted-at-rest, never plaintext) | `launcher/src/renderer/src/views/Login.vue`, `launcher/src/main/SecureStorage.ts` | LN-003 | DONE | Unit tests: round-trip, refuses plaintext fallback, corrupted-file handling; manual run confirmed real login flow end-to-end |
| LN-005 | UpdateManager | Fetch manifest, diff against local files by SHA-256, download only changed files, resume/retry, atomic `.tmp` → final replace (plan §9, §10) | `launcher/src/main/UpdateManager.ts` | LN-003 | DONE | Unit tests against a real local HTTP test server: unchanged files skipped, resume-from-partial-tmp exercises a real `Range` request, corrupt download rejected and not applied |
| LN-006 | ClientManager | Install/validate/prepare/start the MzzPlork client process | `launcher/src/main/ClientManager.ts` | LN-005 | BLOCKED (needs Phase 4 client to actually start) | Test once client exists |
| LN-007 | ProcessManager | Start/monitor/handle-exit for spawned processes | `launcher/src/main/ProcessManager.ts` | LN-000 | DONE | Unit tests spawn real child processes (exit code, stdout/stderr, signal-killed) |
| LN-008 | UI states | Splash, Home, Updating, Settings, Error views wired to the above | `launcher/src/renderer/src/views/*` | LN-002, LN-004, LN-005 | DONE | Manual run-through via a real launched Electron window (Playwright `_electron`): Splash→Login→Home→Settings (path validation)→Updating→Error→Retry, all screenshotted |
| LN-009 | Path traversal protection | Reject/normalize any manifest file path that escapes the client install dir (plan §18) | `launcher/src/main/UpdateManager.ts` (`resolveSafeInstallPath`) | LN-005 | DONE | Unit tests: `../../x` and absolute paths rejected before any disk write or network call |
| BE-007 | Client file storage/serving | Real local file storage + `GET /api/v1/client/files/:channel/*` (Range support, manifest-membership check, shared `resolveSafePath` traversal guard) + a `publishBuild` pipeline tying manifest generation, file storage, and DB rows together (`backend/src/services/publish.ts`, `backend/src/publish-cli.ts`) | `backend/src/routes/clientFiles.ts`, `backend/src/services/publish.ts` | BE-006 | DONE — see ADR-011 | Integration tests: serves real bytes, honors `Range` (206/416), rejects unpublished/traversal paths; `publishBuild` tests verify DB rows + copied files + idempotent republish; manual run: launcher's "Check for updates" now reaches `complete` and the downloaded file matches byte-for-byte |

---

## Phase 3 — CitizenFX integration (BLOCKED)

Everything in this phase requires an actual CitizenFX/FiveM source checkout,
which does not exist in this workspace yet.

| ID | Title | Description | Deps | Status |
|----|-------|-------------|------|--------|
| CL-000 | Bring in CitizenFX upstream source | User decision needed: submodule vs. vendor vs. separate repo | — | BLOCKED (user decision) |
| CL-001 | MzzPlork client integration layer | Bootstrap/auth/session hooks on top of CitizenFX client runtime (plan §5) | CL-000 | BLOCKED |
| CL-002 | Client-side session validation + server connect | Client validates launcher-issued session, connects to MzzPlork server | CL-001, BE-004 | BLOCKED |
| SV-001 | MzzPlork game server integration | Server-side resource/config for the RP server | CL-000 | BLOCKED |

---

## Phase 4a — Packaging & release

Goal: a real, launchable packaged app and a real launcher-version hash —
plan §20 (build/package commands), §23 Phase 9 (release pipeline). Does
not include CI/CD automation or real code signing (no certificate
available).

| ID | Title | Description | Files/components | Deps | Status | Testing requirements |
|----|-------|-------------|-------------------|------|--------|----------------------|
| LN-010 | Packaging config | `electron-builder` config (mac: dmg+zip, win: nsis+zip); `npm run package` | `launcher/electron-builder.yml` | LN-000 | DONE — see ADR-013 | Real mac `.dmg`/`.zip` built and the packaged `.app` launched (not dev build) via a Playwright driver, logged in against the real backend; win `zip` and `nsis` `.exe` both built successfully (structurally verified via `file`; not launch-tested — no Windows/Wine runtime here to execute them) |
| BE-008 | Publish launcher version | Hash a built installer/archive and upsert a real `LauncherVersion` row (`downloadUrl` supplied by caller — installer hosting is a separate decision from BE-007's client-file storage) | `backend/src/services/publishLauncher.ts`, `backend/src/publish-launcher-cli.ts` | BE-007 | DONE | Unit tests: hash matches a real `shasum -a 256`, idempotent republish; manual run against the real packaged `.dmg` — hash matched `shasum` exactly, `GET /api/v1/launcher/latest` served it live |

---

## Phase 4+ — Security hardening, CI/CD, full test matrix

Deferred — see plan §7 (Production security), §21 (CI/CD), §22 (Testing).
Will be broken into tasks here if/when picked next.

---

## Notes

- No task above is marked `DONE` without a corresponding build/run and test,
  per plan §26.
- `CL-*`/`SV-001`/`LN-006` are blocked on a decision only the user can make
  (where CitizenFX source comes from) — see
  [docs/architecture/repository-audit.md](architecture/repository-audit.md#potential-risks).
- Phase 1 went through an explicit verification pass (independent code
  review + manual live-server re-testing, not just "tests pass") before
  Phase 2 started, which found and fixed 6 real bugs — see
  [ADR-005](architecture/decisions.md#adr-005-phase-1-verification-pass-found-and-fixed-6-real-bugs).
- Phase 2 (launcher shell) is now done and independently verified the same
  way: 39 new launcher tests (60 total across the repo — `npm test` from
  root), a real electron-vite build, and a manual run of the actual
  Electron app (login → home → settings → update-check → error → retry)
  via a Playwright driver, screenshotted at each step. That pass also found
  and fixed a real Electron/Node ESM interop bug — see
  [ADR-009](architecture/decisions.md#adr-009-launcher-verification-pass-found-and-fixed-a-real-electronesm-bug-plus-a-missing-clientpath-wiring-gap).
- `BE-007` (real file storage/serving) is now done — see
  [ADR-011](architecture/decisions.md#adr-011-be-007--real-client-file-storageserving-and-a-publish-pipeline).
  Its own verification pass (independent code review) found and fixed 2
  real regressions (a stale `baseDownloadUrl` after `apiBaseUrl` changes;
  unencoded special characters in download URLs — both dead code paths
  before this task made the download path live) plus 4 hardening fixes —
  see [ADR-012](architecture/decisions.md#adr-012-be-007-verification-pass--2-real-regressions-4-hardening-fixes).
  78 tests total across the repo (`npm test` from root), re-verified live
  against the real running backend + launcher.
- Phase 4a (packaging & release) is now done — see
  [ADR-013](architecture/decisions.md#adr-013-packaging--release-electron-builder-and-a-correction-to-my-own-earlier-prediction).
  Includes a correction: I initially told the user the Windows NSIS
  installer couldn't be built on this machine (no wine) — that was wrong
  for the electron-builder version in use; it built successfully when
  actually tried. 81 tests total across the repo, a real packaged macOS
  app built and launch-verified, real Windows `zip`/`nsis` artifacts built
  (structurally verified, not launch-tested — no Windows/Wine runtime here
  to run them), and a real installer hash now served by
  `/api/v1/launcher/latest`, replacing the fake seeded one.
- A follow-up verification pass on that same Phase 4a diff (before
  committing) found and fixed a real packaging bloat bug (~21MB of
  Vite-inlined-but-still-bundled `vue`/`pinia`/`vue-router` shipped in
  every installer) plus 3 smaller correctness fixes — see
  [ADR-014](architecture/decisions.md#adr-014-publish-launcher-verification-pass--4-fixes).
  85 tests total across the repo.
- Next actionable work is Phase 3 (`CL-000`), still blocked on a user
  decision about CitizenFX source — deferred twice now (see prior Notes
  entries). No other non-blocked backend/launcher gaps remain in
  `docs/plan.md`; further work here is either Phase 3, or the remaining
  Phase 4+ items (production security hardening, CI/CD — plan §7, §21) not
  yet broken into tasks.
