# Building & Running

All commands below were run and verified working in this repository during
Phase 1 implementation (macOS, Node v24.19.0, npm 11.17.0; Node >=20
required).

## Install

From the repo root (npm workspaces installs `backend/`, `tools/manifest/`,
and `launcher/` together):

```sh
npm install
```

The first install will prompt to approve postinstall scripts for `prisma`,
`@prisma/client`, `@prisma/engines`, and `esbuild` (via
`npm approve-scripts`) — these are required (Prisma's engine download /
client generation, esbuild's binary). Approve them, then run `npm install`
again so the scripts actually execute.

Electron's own binary is *not* fetched by a postinstall hook (unlike most
packages) — its `dist/` is fetched lazily. If `launcher/` commands fail
with a missing Electron binary, run this once:

```sh
node node_modules/electron/install.js
```

## Backend (`backend/`)

```sh
cd backend
cp .env.example .env        # first time only; fill in a real JWT_SECRET for anything beyond local dev
npx prisma generate         # generate the Prisma client from prisma/schema.prisma
npx prisma migrate dev      # create/apply local SQLite migrations (creates prisma/dev.db)
npm run seed                # optional: seed a stable-channel manifest/version/status + a devuser/dev-password login
npm run dev                 # tsx watch src/server.ts — dev server with hot reload
npm run build                # tsc -p tsconfig.json → dist/
npm start                   # node dist/server.js — run the built server
npm test                     # vitest run — integration tests (spins up a temp SQLite DB per test file)
```

Default port is `3000` (override with `PORT`). Config is entirely
env-driven — see `backend/.env.example` — nothing is hardcoded.

To publish a real build so the launcher can actually download it (BE-007):

```sh
npm run publish-build -- --dir <buildOutputDir> --channel stable --version 0.1.0 --build 101
```

Files land under `backend/storage/<channel>/` (gitignored;
override the root with `STORAGE_ROOT`, an absolute path) and are served at
`GET /api/v1/client/files/:channel/*`.

## Manifest generator (`tools/manifest/`)

```sh
cd tools/manifest
npm test                     # vitest run — fixture-based generator tests
npx tsx src/cli.ts \
  --input <buildOutputDir> \
  --output <manifest.json> \
  --channel stable --version 0.1.0 --build 100
npm run build                # tsc -p tsconfig.json → dist/, exposes the `mzzplork-manifest` bin
```

## Launcher (`launcher/`)

```sh
cd launcher
npm run dev                  # electron-vite dev — opens a real Electron window, HMR for the renderer
npm run build                # electron-vite build → out/ (main+preload as CommonJS, renderer as ESM — see ADR-009)
npm run typecheck            # vue-tsc (renderer) + tsc (main/preload)
npm test                     # vitest run — see below for what's real vs. mocked
```

To point the dev/built app at a non-default backend (e.g. a local one for
testing), set `MZZPLORK_API_BASE_URL` before launching:

```sh
MZZPLORK_API_BASE_URL=http://127.0.0.1:3000 npm run dev
```

Test coverage specifics:
- `GameDetector`, `UpdateManager`, `ProcessManager`, `SecureStorage`,
  `config` tests run against real temp directories / real child processes /
  a real local HTTP test server — no mocked filesystem or fetch.
- `ApiClient` tests boot the *real* Phase 1 backend in-process on a real
  ephemeral port (via `@mzzplork/backend`'s exported `buildApp`) and hit it
  with real HTTP requests.

This workspace's shell may inherit `ELECTRON_RUN_AS_NODE=1` (common when
running inside another Electron-based host app) — that forces any Electron
binary invocation into plain-Node mode and silently skips the whole app
bootstrap. Unset it before manually launching the built app outside `npm
run dev`/`electron-vite preview` (which handle this correctly themselves).

## Run everything

```sh
npm test                     # from repo root: runs all three packages' test suites via npm workspaces
```

## Not yet buildable

- `client/`, `server/` (CitizenFX integration) — blocked on a decision about
  how upstream CitizenFX source enters this workspace (see
  `docs/architecture/repository-audit.md`).
- Real file hosting for `launcher/`'s update downloads — see `docs/plan.md`
  task `BE-007`.
