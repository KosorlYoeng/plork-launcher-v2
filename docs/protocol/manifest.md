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

## Generation workflow

```
Build output directory
      ↓
tools/manifest generate  (walks dir, hashes every file)
      ↓
manifest.json
      ↓
published via the backend (ManifestVersion + ClientVersion rows)
```

CLI:

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

## Consumption workflow (launcher — Phase 2, not yet implemented)

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

This consumer-side validation is tracked as `LN-005`/`LN-009` in
`docs/plan.md` and has not been implemented yet — the generator's symlink
guard is a separate, generation-time protection and does not substitute for
it.
