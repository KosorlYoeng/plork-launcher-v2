import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { publishLauncherVersion } from "../src/services/publishLauncher.js";
import { createTestApp, type TestContext } from "./testApp.js";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

describe("publishLauncherVersion", () => {
  let ctx: TestContext;
  let dir: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  afterEach(async () => {
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("hashes the real file and upserts a LauncherVersion row", async () => {
    dir = await mkdtemp(join(tmpdir(), "mzzplork-publish-launcher-"));
    const filePath = join(dir, "MzzPlorkSetup.zip");
    await writeFile(filePath, "fake installer bytes v1");

    const result = await publishLauncherVersion(ctx.prisma, {
      filePath,
      channel: "stable",
      version: "1.0.0",
      build: 1,
      downloadUrl: "https://releases.example.com/MzzPlorkSetup.zip",
    });

    expect(result).toEqual({
      channel: "stable",
      version: "1.0.0",
      build: 1,
      sha256: sha256("fake installer bytes v1"),
    });

    const row = await ctx.prisma.launcherVersion.findFirst({
      where: { channel: "stable", version: "1.0.0", build: 1 },
    });
    expect(row?.sha256).toBe(sha256("fake installer bytes v1"));
    expect(row?.downloadUrl).toBe("https://releases.example.com/MzzPlorkSetup.zip");
  });

  it("matches the hash a real shasum would produce", async () => {
    dir = await mkdtemp(join(tmpdir(), "mzzplork-publish-launcher-shasum-"));
    const filePath = join(dir, "artifact.bin");
    const content = "some binary-ish content for hashing\n";
    await writeFile(filePath, content);

    const result = await publishLauncherVersion(ctx.prisma, {
      filePath,
      channel: "beta",
      version: "1.1.0",
      build: 2,
      downloadUrl: "https://releases.example.com/artifact.bin",
    });

    expect(result.sha256).toBe(createHash("sha256").update(content).digest("hex"));
  });

  it("is idempotent: republishing the same identity updates in place, not a new row", async () => {
    dir = await mkdtemp(join(tmpdir(), "mzzplork-publish-launcher-idempotent-"));
    const filePath = join(dir, "installer.zip");

    await writeFile(filePath, "version one");
    await publishLauncherVersion(ctx.prisma, {
      filePath,
      channel: "dev",
      version: "2.0.0",
      build: 7,
      downloadUrl: "https://releases.example.com/v1.zip",
    });

    await writeFile(filePath, "version two, different bytes");
    await publishLauncherVersion(ctx.prisma, {
      filePath,
      channel: "dev",
      version: "2.0.0",
      build: 7,
      downloadUrl: "https://releases.example.com/v2.zip",
    });

    const rows = await ctx.prisma.launcherVersion.findMany({
      where: { channel: "dev", version: "2.0.0", build: 7 },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].sha256).toBe(sha256("version two, different bytes"));
    expect(rows[0].downloadUrl).toBe("https://releases.example.com/v2.zip");
  });

  it("refreshes publishedAt on republish, not just on first create", async () => {
    dir = await mkdtemp(join(tmpdir(), "mzzplork-publish-launcher-timestamp-"));
    const filePath = join(dir, "installer.zip");

    await writeFile(filePath, "first cut");
    await publishLauncherVersion(ctx.prisma, {
      filePath,
      channel: "dev",
      version: "3.0.0",
      build: 1,
      downloadUrl: "https://releases.example.com/first.zip",
    });
    const first = await ctx.prisma.launcherVersion.findFirstOrThrow({
      where: { channel: "dev", version: "3.0.0", build: 1 },
    });

    await new Promise((r) => setTimeout(r, 5));
    await writeFile(filePath, "fixed release");
    await publishLauncherVersion(ctx.prisma, {
      filePath,
      channel: "dev",
      version: "3.0.0",
      build: 1,
      downloadUrl: "https://releases.example.com/fixed.zip",
    });
    const second = await ctx.prisma.launcherVersion.findFirstOrThrow({
      where: { channel: "dev", version: "3.0.0", build: 1 },
    });

    expect(second.publishedAt.getTime()).toBeGreaterThan(first.publishedAt.getTime());
  });

  it("resolves a relative filePath against the current working directory", async () => {
    dir = await mkdtemp(join(tmpdir(), "mzzplork-publish-launcher-relative-"));
    const filePath = join(dir, "installer.zip");
    const content = "relative path content";
    await writeFile(filePath, content);

    const result = await publishLauncherVersion(ctx.prisma, {
      filePath: relative(process.cwd(), filePath),
      channel: "stable",
      version: "4.0.0",
      build: 1,
      downloadUrl: "https://releases.example.com/relative.zip",
    });

    expect(result.sha256).toBe(sha256(content));
  });

  it("rejects a malformed download URL before hashing or touching the database", async () => {
    dir = await mkdtemp(join(tmpdir(), "mzzplork-publish-launcher-badurl-"));
    const filePath = join(dir, "installer.zip");
    await writeFile(filePath, "content");

    await expect(
      publishLauncherVersion(ctx.prisma, {
        filePath,
        channel: "stable",
        version: "5.0.0",
        build: 1,
        downloadUrl: "htps://typo.example.com/x.exe",
      }),
    ).rejects.toThrow(/not a valid URL|must be http/i);

    const row = await ctx.prisma.launcherVersion.findFirst({
      where: { channel: "stable", version: "5.0.0", build: 1 },
    });
    expect(row).toBeNull();
  });

  it("rejects a non-http(s) download URL", async () => {
    dir = await mkdtemp(join(tmpdir(), "mzzplork-publish-launcher-fileurl-"));
    const filePath = join(dir, "installer.zip");
    await writeFile(filePath, "content");

    await expect(
      publishLauncherVersion(ctx.prisma, {
        filePath,
        channel: "stable",
        version: "5.0.1",
        build: 1,
        downloadUrl: "file:///etc/passwd",
      }),
    ).rejects.toThrow(/must be http/i);
  });
});
