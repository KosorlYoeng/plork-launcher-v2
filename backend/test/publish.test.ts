import { readFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { publishBuild } from "../src/services/publish.js";
import { createTestApp, type TestContext } from "./testApp.js";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

describe("publishBuild", () => {
  let ctx: TestContext;
  let sourceDir: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  afterEach(async () => {
    if (sourceDir) {
      await rm(sourceDir, { recursive: true, force: true });
    }
  });

  it("generates a manifest, copies files into storage, and writes the DB rows", async () => {
    sourceDir = await mkdtemp(join(tmpdir(), "mzzplork-publish-"));
    await mkdir(join(sourceDir, "client"), { recursive: true });
    await writeFile(join(sourceDir, "client", "a.bin"), "alpha content");
    await writeFile(join(sourceDir, "readme.txt"), "root-level file");

    const result = await publishBuild(ctx.prisma, {
      buildDir: sourceDir,
      channel: "beta",
      version: "0.2.0",
      build: 5,
      storageRoot: ctx.storageRoot,
    });

    expect(result).toEqual({ channel: "beta", version: "0.2.0", build: 5, fileCount: 2 });

    const manifestRow = await ctx.prisma.manifestVersion.findFirst({
      where: { channel: "beta", version: "0.2.0", build: 5 },
    });
    expect(manifestRow).not.toBeNull();
    const files = JSON.parse(manifestRow!.filesJson);
    expect(files).toEqual([
      {
        path: "client/a.bin",
        size: Buffer.byteLength("alpha content"),
        sha256: sha256("alpha content"),
      },
      {
        path: "readme.txt",
        size: Buffer.byteLength("root-level file"),
        sha256: sha256("root-level file"),
      },
    ]);

    const clientVersionRow = await ctx.prisma.clientVersion.findFirst({
      where: { channel: "beta", version: "0.2.0", build: 5 },
    });
    expect(clientVersionRow?.manifestId).toBe(manifestRow!.id);

    const copied = await readFile(join(ctx.storageRoot, "beta", "client", "a.bin"), "utf8");
    expect(copied).toBe("alpha content");
  });

  it("is idempotent when the same channel/version/build is republished", async () => {
    sourceDir = await mkdtemp(join(tmpdir(), "mzzplork-publish-idempotent-"));
    await writeFile(join(sourceDir, "file.bin"), "version one");

    await publishBuild(ctx.prisma, {
      buildDir: sourceDir,
      channel: "dev",
      version: "0.3.0",
      build: 9,
      storageRoot: ctx.storageRoot,
    });

    // Republish the same identity with different content — should update
    // in place (upsert), not create a duplicate row or leave stale content.
    await writeFile(join(sourceDir, "file.bin"), "version two, updated");

    await publishBuild(ctx.prisma, {
      buildDir: sourceDir,
      channel: "dev",
      version: "0.3.0",
      build: 9,
      storageRoot: ctx.storageRoot,
    });

    const manifestRows = await ctx.prisma.manifestVersion.findMany({
      where: { channel: "dev", version: "0.3.0", build: 9 },
    });
    expect(manifestRows).toHaveLength(1);
    const files = JSON.parse(manifestRows[0].filesJson);
    expect(files[0].sha256).toBe(sha256("version two, updated"));

    const copied = await readFile(join(ctx.storageRoot, "dev", "file.bin"), "utf8");
    expect(copied).toBe("version two, updated");
  });
});
