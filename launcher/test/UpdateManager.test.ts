import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Manifest } from "@mzzplork/manifest";
import {
  compareLocalFiles,
  DownloadVerificationError,
  PathTraversalError,
  resolveSafeInstallPath,
  UpdateManager,
} from "../src/main/UpdateManager.js";
import { startTestFileServer, type TestFileServer } from "./testFileServer.js";

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

describe("resolveSafeInstallPath", () => {
  it("resolves a normal relative path inside the install dir", () => {
    expect(resolveSafeInstallPath("/install", "client/game.bin")).toBe(
      join("/install", "client/game.bin"),
    );
  });

  it("rejects a path that escapes the install dir", () => {
    expect(() => resolveSafeInstallPath("/install", "../../etc/passwd")).toThrow(
      PathTraversalError,
    );
  });

  it("rejects an absolute path", () => {
    expect(() => resolveSafeInstallPath("/install", "/etc/passwd")).toThrow(PathTraversalError);
  });
});

describe("compareLocalFiles", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "mzzplork-compare-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("skips a file whose content already matches the manifest", async () => {
    const content = Buffer.from("unchanged content");
    await writeFile(join(dir, "a.txt"), content);
    const manifest: Manifest = {
      channel: "stable",
      version: "1.0.0",
      build: 1,
      files: [{ path: "a.txt", size: content.length, sha256: sha256(content) }],
    };

    const diff = await compareLocalFiles(dir, manifest);
    expect(diff.upToDate.map((f) => f.path)).toEqual(["a.txt"]);
    expect(diff.toDownload).toEqual([]);
  });

  it("flags a missing file and a corrupted (same-size, wrong-hash) file for download", async () => {
    const corrupted = Buffer.from("wrong!!!"); // same length as "expected" below
    await writeFile(join(dir, "corrupted.txt"), corrupted);
    const manifest: Manifest = {
      channel: "stable",
      version: "1.0.0",
      build: 1,
      files: [
        { path: "missing.txt", size: 5, sha256: "0".repeat(64) },
        { path: "corrupted.txt", size: corrupted.length, sha256: sha256(Buffer.from("expected")) },
      ],
    };

    const diff = await compareLocalFiles(dir, manifest);
    expect(diff.toDownload.map((f) => f.path).sort()).toEqual(["corrupted.txt", "missing.txt"]);
  });
});

describe("UpdateManager", () => {
  let installDir: string;
  let server: TestFileServer;

  afterEach(async () => {
    await rm(installDir, { recursive: true, force: true });
    await server?.close();
  });

  function manifestFor(files: { path: string; content: Buffer }[]): Manifest {
    return {
      channel: "stable",
      version: "1.0.0",
      build: 1,
      files: files.map((f) => ({ path: f.path, size: f.content.length, sha256: sha256(f.content) })),
    };
  }

  function fakeApiClient(manifest: Manifest) {
    return { getClientManifest: async () => manifest };
  }

  it("downloads missing files, skips already-up-to-date ones, and writes verified content", async () => {
    installDir = await mkdtemp(join(tmpdir(), "mzzplork-update-"));
    const missing = Buffer.from("brand new file content");
    const existing = Buffer.from("already have this one");
    await writeFile(join(installDir, "existing.bin"), existing);

    const filesOnServer = new Map([["stable/new.bin", missing]]);
    server = await startTestFileServer(filesOnServer);

    const manifest = manifestFor([
      { path: "existing.bin", content: existing },
      { path: "new.bin", content: missing },
    ]);

    const manager = new UpdateManager(fakeApiClient(manifest), {
      installDir,
      baseDownloadUrl: server.url,
    });

    const events: string[] = [];
    await manager.update("stable", (e) => events.push(e.status));

    const written = await readFile(join(installDir, "new.bin"));
    expect(written).toEqual(missing);
    expect(server.requests.some((r) => r.path === "stable/existing.bin")).toBe(false);
    expect(events[0]).toBe("checking");
    expect(events.at(-1)).toBe("complete");
    expect(events).toContain("downloading");
  });

  it("reports up-to-date without any network request when everything already matches", async () => {
    installDir = await mkdtemp(join(tmpdir(), "mzzplork-update-uptodate-"));
    const content = Buffer.from("nothing to do here");
    await writeFile(join(installDir, "a.bin"), content);
    server = await startTestFileServer(new Map());

    const manifest = manifestFor([{ path: "a.bin", content }]);
    const manager = new UpdateManager(fakeApiClient(manifest), {
      installDir,
      baseDownloadUrl: server.url,
    });

    const events: string[] = [];
    await manager.update("stable", (e) => events.push(e.status));

    expect(events).toEqual(["checking", "up-to-date"]);
    expect(server.requests).toEqual([]);
  });

  it("resumes a download from a partial .tmp file left by a previous crashed run", async () => {
    installDir = await mkdtemp(join(tmpdir(), "mzzplork-update-resume-"));
    const fullContent = Buffer.from("0123456789".repeat(1000)); // 10,000 bytes
    server = await startTestFileServer(new Map([["stable/big.bin", fullContent]]));

    // Simulate a previous run that got partway through.
    const partial = fullContent.subarray(0, 4000);
    await writeFile(join(installDir, "big.bin.tmp"), partial);

    const manifest = manifestFor([{ path: "big.bin", content: fullContent }]);
    const manager = new UpdateManager(fakeApiClient(manifest), {
      installDir,
      baseDownloadUrl: server.url,
    });

    await manager.update("stable");

    const written = await readFile(join(installDir, "big.bin"));
    expect(written).toEqual(fullContent);
    expect(server.requests).toEqual([{ path: "stable/big.bin", range: "bytes=4000-" }]);
  });

  it("rejects a corrupted download (bad hash) and never leaves a bad file in place", async () => {
    installDir = await mkdtemp(join(tmpdir(), "mzzplork-update-corrupt-"));
    const expectedContent = Buffer.from("the real content");
    const wrongContentServedInstead = Buffer.from("the FAKE content"); // same length, different bytes
    server = await startTestFileServer(new Map([["stable/x.bin", wrongContentServedInstead]]));

    const manifest = manifestFor([{ path: "x.bin", content: expectedContent }]);
    const manager = new UpdateManager(fakeApiClient(manifest), {
      installDir,
      baseDownloadUrl: server.url,
      maxAttemptsPerFile: 1,
    });

    await expect(manager.update("stable")).rejects.toThrow(DownloadVerificationError);

    await expect(stat(join(installDir, "x.bin"))).rejects.toThrow(); // never renamed into place
    await expect(stat(join(installDir, "x.bin.tmp"))).rejects.toThrow(); // cleaned up, not left corrupt
  });

  it("rejects a manifest file path that escapes the install directory before touching the network", async () => {
    installDir = await mkdtemp(join(tmpdir(), "mzzplork-update-traversal-"));
    server = await startTestFileServer(new Map());

    const manifest: Manifest = {
      channel: "stable",
      version: "1.0.0",
      build: 1,
      files: [{ path: "../../escape.bin", size: 3, sha256: "a".repeat(64) }],
    };
    const manager = new UpdateManager(fakeApiClient(manifest), {
      installDir,
      baseDownloadUrl: server.url,
    });

    await expect(manager.update("stable")).rejects.toThrow(PathTraversalError);
    expect(server.requests).toEqual([]);
  });

  it("downloads a file whose path contains characters that are special in URLs (#, ?, %)", async () => {
    installDir = await mkdtemp(join(tmpdir(), "mzzplork-update-special-chars-"));
    const content = Buffer.from("content for a tricky filename");
    const trickyPath = "notes/changelog#2 (draft)?.txt";
    server = await startTestFileServer(new Map([[`stable/${trickyPath}`, content]]));

    const manifest = manifestFor([{ path: trickyPath, content }]);
    const manager = new UpdateManager(fakeApiClient(manifest), {
      installDir,
      baseDownloadUrl: server.url,
    });

    await manager.update("stable");

    const written = await readFile(join(installDir, trickyPath));
    expect(written).toEqual(content);
  });
});
