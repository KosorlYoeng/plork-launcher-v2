import { createServer, type IncomingMessage, type Server } from "node:http";

export interface TestFileServer {
  url: string;
  requests: { path: string; range: string | null }[];
  close: () => Promise<void>;
}

/**
 * A real local HTTP server (not a mocked fetch) that serves in-memory files
 * and honors Range requests, so UpdateManager's resume/retry logic is
 * genuinely exercised end-to-end rather than against a stub.
 */
export function startTestFileServer(files: Map<string, Buffer>): Promise<TestFileServer> {
  const requests: { path: string; range: string | null }[] = [];

  const server: Server = createServer((req: IncomingMessage, res) => {
    // Decode percent-encoding (UpdateManager encodes each path segment —
    // see encodeManifestPath in UpdateManager.ts) so lookups match the
    // original, unencoded keys in `files`.
    const path = decodeURIComponent((req.url ?? "").replace(/^\//, ""));
    const range = req.headers.range ?? null;
    requests.push({ path, range });

    const content = files.get(path);
    if (!content) {
      res.writeHead(404).end();
      return;
    }

    if (range) {
      const match = /^bytes=(\d+)-$/.exec(range);
      const start = match ? Number.parseInt(match[1], 10) : 0;
      if (start >= content.length) {
        res.writeHead(416, { "Content-Range": `bytes */${content.length}` }).end();
        return;
      }
      const slice = content.subarray(start);
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${content.length - 1}/${content.length}`,
        "Content-Length": slice.length,
      });
      res.end(slice);
      return;
    }

    res.writeHead(200, { "Content-Length": content.length });
    res.end(content);
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        requests,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}
