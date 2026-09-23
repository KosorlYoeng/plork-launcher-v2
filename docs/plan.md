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
| LN-000 | Launcher project scaffold | Electron main + Vue renderer, per plan §6 target structure | `launcher/` | P0-02 | TODO | `npm run dev` opens a window |
| LN-001 | Config model | `environment, apiBaseUrl, channel, gamePath, clientPath, autoUpdate` (plan §15), loaded from a config file, not hardcoded | `launcher/src/main/config.*` | LN-000 | TODO | Unit test: load/save/defaults |
| LN-002 | GameDetector | Detect GTA V install (Steam/Epic/Rockstar registry & known paths), validate, persist selection, no single hardcoded path (plan §6) | `launcher/src/main/GameDetector.*` | LN-001 | TODO | Unit test against mocked filesystem/registry for each install type |
| LN-003 | API client | Typed client for backend `/api/v1/*` | `launcher/src/main/ApiClient.*` | BE-002..BE-005 | TODO | Unit test with mocked HTTP |
| LN-004 | Auth/Login UI + SecureStorage | Login screen, token storage (OS keychain / encrypted-at-rest, never plaintext) | `launcher/src/renderer/views/Login.vue`, `launcher/src/main/SecureStorage.*` | LN-003 | TODO | Test: login success/failure paths; tokens not persisted in plaintext |
| LN-005 | UpdateManager | Fetch manifest, diff against local files by SHA-256, download only changed files, resume/retry, atomic `.tmp` → final replace (plan §9, §10) | `launcher/src/main/UpdateManager.*` | LN-003 | TODO | Unit test: unchanged files skipped; interrupted download resumes; corrupt download rejected and not applied |
| LN-006 | ClientManager | Install/validate/prepare/start the MzzPlork client process | `launcher/src/main/ClientManager.*` | LN-005 | BLOCKED (needs Phase 4 client to actually start) | Test once client exists |
| LN-007 | ProcessManager | Start/monitor/handle-exit for spawned processes | `launcher/src/main/ProcessManager.*` | LN-000 | TODO | Unit test with a dummy child process |
| LN-008 | UI states | Splash, Home, Updating, Settings, Error views wired to the above | `launcher/src/renderer/views/*` | LN-002, LN-004, LN-005 | TODO | Manual run-through of each state |
| LN-009 | Path traversal protection | Reject/normalize any manifest file path that escapes the client install dir (plan §18) | `launcher/src/main/UpdateManager.*` | LN-005 | TODO | Unit test: manifest with `../../x` path is rejected |

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

## Phase 4+ — Security hardening, CI/CD, packaging, full test matrix

Deferred until Phases 1–3 have working, tested implementations — see plan
§7 (Production security), §21 (CI/CD), §22 (Testing), §23 Phase 7–9. Will be
broken into tasks here once Phase 1–2 land.

---

## Notes

- No task above is marked `DONE` without a corresponding build/run and test,
  per plan §26.
- `CL-*`/`SV-001`/`LN-006` are blocked on a decision only the user can make
  (where CitizenFX source comes from) — see
  [docs/architecture/repository-audit.md](architecture/repository-audit.md#potential-risks).
- Next actionable work, pending user go-ahead, is Phase 2 (`LN-000`), since
  it depends only on the now-complete Phase 1 backend, not on CitizenFX
  source.
- Phase 1 went through an explicit verification pass (independent code
  review + manual live-server re-testing, not just "tests pass") before
  Phase 2 started, which found and fixed 6 real bugs — see
  [ADR-005](architecture/decisions.md#adr-005-phase-1-verification-pass-found-and-fixed-6-real-bugs).
