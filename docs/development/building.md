# Building & Running

All commands below were run and verified working in this repository during
Phase 1 implementation (macOS, Node v24.19.0, npm 11.17.0; Node >=20
required).

## Install

From the repo root (npm workspaces installs `backend/` and
`tools/manifest/` together):

```sh
npm install
```

The first install will prompt to approve postinstall scripts for `prisma`,
`@prisma/client`, `@prisma/engines`, and `esbuild` (via
`npm approve-scripts`) — these are required (Prisma's engine download /
client generation, esbuild's binary). Approve them, then run `npm install`
again so the scripts actually execute.

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

## Run everything

```sh
npm test                     # from repo root: runs both packages' test suites via npm workspaces
```

## Not yet buildable

- `launcher/` — not implemented yet (Phase 2, see `docs/plan.md`).
- `client/`, `server/` (CitizenFX integration) — blocked on a decision about
  how upstream CitizenFX source enters this workspace (see
  `docs/architecture/repository-audit.md`).
