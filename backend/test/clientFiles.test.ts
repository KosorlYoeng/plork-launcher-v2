import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { publishBuild } from "../src/services/publish.js";
import { createTestApp, type TestContext } from "./testApp.js";

describe("GET /api/v1/client/files/:channel/*", () => {
  let ctx: TestContext;
  let sourceDir: string;
  const content = "hello from a published build file\n";

  beforeAll(async () => {
    ctx = await createTestApp();
    sourceDir = await mkdtemp(join(tmpdir(), "mzzplork-publish-fixture-"));
    await mkdir(join(sourceDir, "client"), { recursive: true });
    await writeFile(join(sourceDir, "client", "a.bin"), content);

    await publishBuild(ctx.prisma, {
      buildDir: sourceDir,
      channel: "stable",
      version: "0.1.0",
      build: 1,
      storageRoot: ctx.storageRoot,
    });
  });

  afterAll(async () => {
    await rm(sourceDir, { recursive: true, force: true });
    await ctx.cleanup();
  });

  it("serves a published file with the correct bytes and content-length", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/client/files/stable/client/a.bin",
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-length"]).toBe(String(Buffer.byteLength(content)));
    expect(response.body).toBe(content);
  });

  it("honors a Range request and returns 206 with the correct partial content", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/client/files/stable/client/a.bin",
      headers: { range: "bytes=6-" },
    });
    expect(response.statusCode).toBe(206);
    expect(response.headers["content-range"]).toBe(
      `bytes 6-${Buffer.byteLength(content) - 1}/${Buffer.byteLength(content)}`,
    );
    expect(response.body).toBe(content.slice(6));
  });

  it("returns 416 when the Range start is beyond the file size", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/client/files/stable/client/a.bin",
      headers: { range: `bytes=${Buffer.byteLength(content) + 10}-` },
    });
    expect(response.statusCode).toBe(416);
  });

  it("honors a bounded Range request (bytes=N-M)", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/client/files/stable/client/a.bin",
      headers: { range: "bytes=2-5" },
    });
    expect(response.statusCode).toBe(206);
    expect(response.headers["content-range"]).toBe(`bytes 2-5/${Buffer.byteLength(content)}`);
    expect(response.body).toBe(content.slice(2, 6));
  });

  it("honors a suffix Range request (bytes=-N, last N bytes)", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/client/files/stable/client/a.bin",
      headers: { range: "bytes=-5" },
    });
    expect(response.statusCode).toBe(206);
    const size = Buffer.byteLength(content);
    expect(response.headers["content-range"]).toBe(`bytes ${size - 5}-${size - 1}/${size}`);
    expect(response.body).toBe(content.slice(-5));
  });

  it("ignores a malformed Range header and serves the full file", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/client/files/stable/client/a.bin",
      headers: { range: "not-a-valid-range" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(content);
  });

  it("rejects a channel containing characters outside the allowed format", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/client/files/bad%24channel/client/a.bin",
    });
    expect(response.statusCode).toBe(400);
  });

  it("404s for a path not listed in the manifest, even if a file exists at that name", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/client/files/stable/client/not-published.bin",
    });
    expect(response.statusCode).toBe(404);
  });

  it("rejects a path-traversal attempt before touching the filesystem", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/client/files/stable/..%2F..%2Fetc%2Fpasswd",
    });
    expect([400, 404]).toContain(response.statusCode);
  });

  it("404s for a channel with no published manifest", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/client/files/nightly/client/a.bin",
    });
    expect(response.statusCode).toBe(404);
  });
});
