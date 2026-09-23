# Update Protocol

How the launcher's `UpdateManager` (`launcher/src/main/UpdateManager.ts`)
turns a manifest (see [manifest.md](manifest.md)) into an up-to-date local
install. Implements plan §9 (launcher workflow), §10 (download system), and
§18's path-traversal requirement.

## Flow

```
GET /api/v1/client/manifest?channel=<channel>
      ↓
compareLocalFiles(installDir, manifest)
      ↓  — for every manifest entry: stat + SHA-256 the local file
      ↓    (missing, wrong size, or wrong hash → needs download;
      ↓     matches exactly → skipped, never redownloaded)
      ↓
for each file that needs downloading:
      ↓
  resolveSafeInstallPath(installDir, file.path)
      ↓  — rejects any path that would resolve outside installDir
      ↓    (`../../x`, an absolute path) *before* any network call or
      ↓    disk write (LN-009 / plan §18)
      ↓
  download to `<finalPath>.tmp`
      ↓  — if a `.tmp` already exists (from a previous crashed run, or a
      ↓    retry within this same call), resumes via an HTTP `Range`
      ↓    request from its current size rather than starting over
      ↓
  verify size + SHA-256 against the manifest entry
      ↓  — mismatch → delete the `.tmp`, retry (up to `maxAttemptsPerFile`,
      ↓    default 3) or fail
      ↓
  atomically rename `.tmp` → final path
      ↓  — a valid existing file is never overwritten by a
      ↓    still-downloading/corrupt one (plan §10)
```

Progress is reported via a callback (`(event: UpdateProgressEvent) => void`)
with `status` one of `checking | up-to-date | downloading | verifying |
complete | error`, forwarded to the renderer over the `update:progress` IPC
channel (`src/shared/ipc.ts`) and rendered by `Updating.vue`.

## Download source

Each file is fetched from `${baseDownloadUrl}/${channel}/${file.path}`.
`baseDownloadUrl` is configurable (`MZZPLORK_BASE_DOWNLOAD_URL` env var,
plan §15 — never hardcoded) and defaults to a placeholder in this repo,
since **there is no real file-hosting endpoint yet** — the Phase 1 backend
only stores manifest metadata, not file bytes. This is tracked as
`docs/plan.md` task `BE-007`. Until that exists, a real "check for updates"
attempt fails with a real, visible error (verified manually — see
[decisions.md ADR-009](../architecture/decisions.md)) rather than hanging.

## What is never done

- A manifest-listed file whose resolved path escapes `installDir` is
  rejected before any request is made or any byte is written — see
  `resolveSafeInstallPath` in `UpdateManager.ts`, tested with `../../x` and
  absolute-path entries.
- A file already matching the manifest (size + SHA-256) is never
  redownloaded.
- A `.tmp` file is never renamed into place unless its final size and hash
  both match the manifest entry exactly.
