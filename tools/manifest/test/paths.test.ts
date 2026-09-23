import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PathTraversalError, resolveSafePath } from "../src/paths.js";

describe("resolveSafePath", () => {
  it("resolves a normal relative path inside the root", () => {
    expect(resolveSafePath("/root", "client/game.bin")).toBe(join("/root", "client/game.bin"));
  });

  it("rejects a path that escapes the root via ../", () => {
    expect(() => resolveSafePath("/root", "../../etc/passwd")).toThrow(PathTraversalError);
  });

  it("rejects an absolute path", () => {
    expect(() => resolveSafePath("/root", "/etc/passwd")).toThrow(PathTraversalError);
  });

  it("allows the root itself", () => {
    expect(resolveSafePath("/root", ".")).toBe(join("/root"));
  });
});
