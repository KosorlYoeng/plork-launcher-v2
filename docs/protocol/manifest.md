# Manifest Protocol

The manifest is the deterministic file listing the launcher's UpdateManager
uses to decide what to download (plan §9). It is produced by
`tools/manifest` and served by the backend at
`GET /api/v1/client/manifest?channel=<channel>`.

## Schema

```json
{
  "channel": "stable",
  "version": "0.1.0",
  "build": 100,
  "files": [
    {
      "path": "client/example.bin",
      "size": 123456,
      "sha256": "..."
    }
  ]
}
```

- `channel` — release channel (`stable`, `beta`, `dev`, ...).
- `version` — semantic client version this manifest describes.
- `build` — monotonically increasing build number, used for ordering
  ("latest" queries sort by `build desc`).
- `files` — every file the client install directory should contain.
  - `path` — POSIX-style relative path (forward slashes, no leading `/`,
    no `..` segments). This is the value a consumer must validate before
    joining it to a local install directory (see path traversal note
    below) — the generator does not know the consumer's install root.
  - `size` — file size in bytes.
  - `sha256` — lowercase hex SHA-256 digest of the file contents.

`files` is always sorted by `path` ascending, so two generator runs over
identical input produce byte-identical manifest JSON.

## Generation & publishing workflow

```
Build output directory
      ↓
publishBuild()  (backend/src/services/publish.ts)
      ↓  — calls tools/manifest's generateManifest (walks dir, hashes every file)
      ↓
manifest.json  +  files copied into backend/storage/<channel>/
      ↓
ManifestVersion + ClientVersion rows upserted (idempotent republish)
      ↓
served at GET /api/v1/client/manifest and GET /api/v1/client/files/:channel/*
```

CLI (BE-007):

```sh
cd backend
npm run publish-build -- --dir <buildOutputDir> --channel stable --version 0.1.0 --build 100
```

The manifest generator itself (`tools/manifest`) can also be run standalone
if you just want a `manifest.json` without publishing it anywhere:

```sh
npx tsx tools/manifest/src/cli.ts \
  --input <buildOutputDir> \
  --output <manifest.json> \
  --channel stable \
  --version 0.1.0 \
  --build 100
```

The generator refuses to follow a symlink that resolves outside the input
directory, so a manifest can never be generated from content living outside
the intended build output tree.

## Consumption workflow (launcher)

```
Download manifest
      ↓
Read local files
      ↓
Calculate SHA-256 per local file
      ↓
Compare against manifest
      ↓
Download only changed/missing files
      ↓
Before writing: reject any `path` that escapes the client install
directory (reject `..` segments / absolute paths) — plan §18
```

Implemented in `launcher/src/main/UpdateManager.ts` — see
[update.md](update.md) for the full flow, and `resolveSafePath` in
`tools/manifest/src/paths.ts` for the traversal guard, shared with the
backend's file-serving route (BE-007) so both sides use one
implementation, not two.
