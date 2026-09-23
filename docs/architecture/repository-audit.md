# Repository Audit

Status: **COMPLETE** — Phase 0 deliverable.
Date: 2026-09-23

## Summary

`/Users/Kosorl/plork` is an **empty workspace**. At audit time it contained a single
file, `plork-launcher-plan.md` (the master implementation plan this audit was
commissioned by). There is no source code, no CitizenFX/FiveM checkout, no
launcher, no backend, no build system, and no tests present anywhere in this
directory.

This is a material deviation from the plan's stated premise ("a standalone
game client ecosystem based on the existing CitizenFX/FiveM codebase available
in this repository" — plan §Master Implementation Instructions). No such
codebase is available here. The user has confirmed (2026-09-23) that this is
intentional: MzzPlork is to be built **greenfield**, not as a fork/extension
of an in-repo CitizenFX checkout.

Findings below are reported against the plan's requested checklist (plan §3),
with "N/A — not present" where the item does not exist.

## Repository structure

```
/Users/Kosorl/plork/
└── plork-launcher-plan.md
```

Not a git repository (no `.git`). No `.gitignore`, no license file, no
README.

## Build system

N/A — not present. No `package.json`, `premake5.lua`, `CMakeLists.txt`,
solution/project files, or any other build manifest exist in this workspace.

## Languages

N/A — not present. No source files of any language exist yet.

## Major projects

N/A — not present.

## Client architecture

N/A — not present. There is no CitizenFX client checkout to extend. Per
plan §5, the MzzPlork client is expected to build on CitizenFX's bootstrap,
networking, and resource runtime; none of that exists here to inspect or
reuse. Building an actual game-connecting client (the "MzzPlork Client" /
"Game Integration" boxes in the plan) requires either:
- vendoring/submoduling the upstream CitizenFX source (e.g.
  `github.com/citizenfx/fivem`), or
- some other arrangement the user has not yet specified.

This audit does not vendor that source — the user should decide when/how to
bring it in, since it is a large (multi-GB, multi-hour build) C++ codebase
with its own build toolchain (Windows-only, VS2019/2022 + specific SDKs).

## Server architecture

N/A — not present. No MzzPlork/FXServer resource-hosting code exists.

## Networking

N/A — not present.

## Resource system

N/A — not present.

## Authentication

N/A — not present. No backend, no user/session store, no token issuance
exists anywhere.

## Configuration

N/A — not present.

## Existing updater

N/A — not present. No manifest format, hash-verification, or download/resume
logic exists.

## Existing launcher

N/A — not present. No Electron/Vue launcher shell exists to inspect or
reuse, contrary to plan §6's "if an existing Electron/Vue launcher exists in
the workspace, inspect and reuse it."

## Build scripts

N/A — not present.

## Testing

N/A — not present. No test runner, no test files.

## Dependencies

N/A — not present. No lockfiles of any kind.

## Potential extension points

None yet — there is nothing to extend. The first real extension point will
be created when the launcher/backend scaffolding described in
[docs/plan.md](../plan.md) is implemented.

## Potential risks

- **CitizenFX integration is unscoped.** The plan assumes deep reuse of
  CitizenFX's client runtime (networking, resource system, bootstrap). None
  of that exists in this workspace. Until the user decides how/when to bring
  in upstream CitizenFX source, the "MzzPlork Client" and "Game Integration"
  portions of the architecture (plan §5, §14) cannot be implemented — only
  designed and stubbed.
- **Platform mismatch.** This audit and any work in this session run on
  macOS (Darwin), but the target runtime is Windows 10/11 x64 (plan §19) and
  CitizenFX's client build toolchain is Windows-only. Launcher/backend code
  (Node/TypeScript) can be developed cross-platform; the actual game client
  cannot be built or tested on this machine.
- **Scope risk.** The full plan describes a client, launcher, backend,
  database, manifest/update infrastructure, CI/CD, and full test matrix —
  effectively a small game-platform company's worth of work. Attempting to
  implement all of it in one pass would produce a large amount of unverified,
  untested code. The user has agreed to scope the first implementation pass
  to Phase 0 (this audit + task plan) only, with further phases to be
  greenlit incrementally.

## Entry points

None yet.

## Important modules / classes / functions

None yet.

## Build commands

Introduced in Phase 1 (`BE-000`, `MF-002`). Verified working — see
[docs/development/building.md](../development/building.md) for the full,
step-by-step version. Summary:

```sh
npm install                        # repo root, npm workspaces
cd backend && npx prisma generate && npx prisma migrate dev
npm run build                      # backend/ and tools/manifest/: tsc → dist/
```

## Test commands

```sh
npm test                           # repo root: runs both workspace packages' vitest suites
```

`backend` tests spin up a fresh temp SQLite DB per test file (via
`prisma db push`) and exercise the real Fastify app through `app.inject()` —
no mocked HTTP layer. `tools/manifest` tests run the real generator against
fixture files and check hashes against expected values.

## Conclusion

This workspace is a blank slate. The plan's "identify and reuse existing
systems" directive is honored: nothing exists to duplicate, so nothing has
been duplicated. Implementation should proceed as new, greenfield work,
scoped incrementally per [docs/plan.md](../plan.md), starting with the parts
of the architecture that do **not** depend on an unavailable CitizenFX
checkout (manifest format, backend API skeleton, launcher shell with
GameDetector/UpdateManager). The game-client integration layer stays
design-only until the user decides how CitizenFX source will be brought into
this workspace.
