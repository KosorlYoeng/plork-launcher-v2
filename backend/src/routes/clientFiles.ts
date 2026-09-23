import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { PathTraversalError, resolveSafePath } from "@mzzplork/manifest";
import { getManifestForChannel } from "../services/manifestService.js";

const CHANNEL_PATTERN = /^[a-zA-Z0-9_-]+$/;

type RangeResult = { start: number; end: number } | "unsatisfiable" | null;

/**
 * Parses a `Range` header per RFC 7233 §2.1: `bytes=N-M` (bounded),
 * `bytes=N-` (open-ended), and `bytes=-N` (suffix, last N bytes). Returns
 * `null` for a missing/malformed header (serve the full file — malformed
 * Range headers are ignored, not rejected, per the RFC) or
 * `"unsatisfiable"` when the requested start is beyond the file's end.
 */
function parseRangeHeader(rangeHeader: string | undefined, fileSize: number): RangeResult {
  if (!rangeHeader) {
    return null;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || (match[1] === "" && match[2] === "")) {
    return null;
  }

  const [, startStr, endStr] = match;
  let start: number;
  let end: number;

  if (startStr === "") {
    const suffixLength = Number.parseInt(endStr, 10);
    if (!(suffixLength > 0)) {
      return null;
    }
    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  } else {
    start = Number.parseInt(startStr, 10);
    end = endStr === "" ? fileSize - 1 : Number.parseInt(endStr, 10);
  }

  if (start >= fileSize || start > end) {
    return "unsatisfiable";
  }
  return { start, end: Math.min(end, fileSize - 1) };
}

export async function clientFilesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/client/files/:channel/*", async (request, reply) => {
    const { channel } = request.params as { channel: string };
    const requestedPath = (request.params as { "*": string })["*"];

    if (!CHANNEL_PATTERN.test(channel)) {
      return reply.code(400).send({ error: `Invalid channel: "${channel}"` });
    }

    const manifest = await getManifestForChannel(app.prisma, channel);
    if (!manifest) {
      return reply.code(404).send({ error: `No manifest published for channel "${channel}"` });
    }

    // Only serve a path that's actually a published manifest entry — a
    // stray file sitting in storage/ (e.g. from an old build) is never
    // reachable even if the path itself would otherwise resolve safely.
    const manifestEntry = manifest.files.find((file) => file.path === requestedPath);
    if (!manifestEntry) {
      return reply.code(404).send({ error: `"${requestedPath}" is not part of the published manifest` });
    }

    let filePath: string;
    try {
      filePath = resolveSafePath(join(app.storageRoot, channel), requestedPath);
    } catch (error) {
      if (error instanceof PathTraversalError) {
        return reply.code(400).send({ error: error.message });
      }
      throw error;
    }

    let fileStat;
    try {
      fileStat = await stat(filePath);
    } catch {
      request.log.error(`Published file missing from storage: ${filePath}`);
      return reply.code(404).send({ error: `"${requestedPath}" is not available` });
    }

    const rangeResult = parseRangeHeader(
      typeof request.headers.range === "string" ? request.headers.range : undefined,
      fileStat.size,
    );

    if (rangeResult === "unsatisfiable") {
      return reply.code(416).header("content-range", `bytes */${fileStat.size}`).send();
    }

    if (rangeResult) {
      const { start, end } = rangeResult;
      reply
        .code(206)
        .header("content-range", `bytes ${start}-${end}/${fileStat.size}`)
        .header("content-length", end - start + 1)
        .header("content-type", "application/octet-stream");
      return reply.send(createReadStream(filePath, { start, end }));
    }

    reply
      .header("content-length", fileStat.size)
      .header("content-type", "application/octet-stream");
    return reply.send(createReadStream(filePath));
  });
}
