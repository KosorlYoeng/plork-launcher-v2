import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generateManifest } from "../src/generate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, "fixtures", "build");

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

describe("generateManifest", () => {
  it("produces a manifest with correct sizes, hashes, and sorted forward-slash paths", async () => {
    const manifest = await generateManifest({
      inputDir: fixtureDir,
      channel: "stable",
      version: "0.1.0",
      build: 100,
    });

    expect(manifest.channel).toBe("stable");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.build).toBe(100);

    expect(manifest.files).toEqual([
      {
        path: "a.txt",
        size: Buffer.byteLength("hello world"),
        sha256: sha256("hello world"),
      },
      {
        path: "sub/b.txt",
        size: Buffer.byteLength("nested content"),
        sha256: sha256("nested content"),
      },
    ]);
  });

  it("is deterministic across repeated runs", async () => {
    const first = await generateManifest({
      inputDir: fixtureDir,
      channel: "stable",
      version: "0.1.0",
      build: 100,
    });
    const second = await generateManifest({
      inputDir: fixtureDir,
      channel: "stable",
      version: "0.1.0",
      build: 100,
    });

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("reports the real size and hash of a symlinked file inside the root", async () => {
    const root = await mkdtemp(join(tmpdir(), "mzzplork-manifest-symlink-"));
    try {
      const content = "the real file's content, longer than the link";
      await writeFile(join(root, "real.txt"), content);
      await symlink(join(root, "real.txt"), join(root, "link.txt"));

      const manifest = await generateManifest({
        inputDir: root,
        channel: "stable",
        version: "0.1.0",
        build: 1,
      });

      const link = manifest.files.find((f) => f.path === "link.txt");
      expect(link).toEqual({
        path: "link.txt",
        size: Buffer.byteLength(content),
        sha256: sha256(content),
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("skips a directory symlink that points back at an ancestor instead of recursing forever", async () => {
    const root = await mkdtemp(join(tmpdir(), "mzzplork-manifest-cycle-"));
    try {
      await mkdir(join(root, "sub"));
      await writeFile(join(root, "sub", "file.txt"), "content");
      await symlink(root, join(root, "sub", "loop"), "dir");

      const manifest = await generateManifest({
        inputDir: root,
        channel: "stable",
        version: "0.1.0",
        build: 1,
      });

      expect(manifest.files.map((f) => f.path)).toEqual(["sub/file.txt"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("skips a symlink that resolves outside the input directory", async () => {
    const outside = await mkdtemp(join(tmpdir(), "mzzplork-manifest-outside-"));
    const root = await mkdtemp(join(tmpdir(), "mzzplork-manifest-root-"));
    try {
      await writeFile(join(outside, "secret.txt"), "should not be manifested");
      await symlink(join(outside, "secret.txt"), join(root, "escape.txt"));
      await writeFile(join(root, "inside.txt"), "inside content");

      const manifest = await generateManifest({
        inputDir: root,
        channel: "stable",
        version: "0.1.0",
        build: 1,
      });

      expect(manifest.files.map((f) => f.path)).toEqual(["inside.txt"]);
    } finally {
      await rm(outside, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
    }
  });
});
