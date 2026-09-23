import { resolve, sep } from "node:path";

export class PathTraversalError extends Error {}

/**
 * Resolves a manifest-listed relative path against `root`, rejecting any
 * path that would escape it (`../../x`, an absolute path, etc). Shared
 * between the launcher (writing downloaded files under an install dir) and
 * the backend (serving published files under a storage dir) — never trust
 * a manifest-listed path without this check (plan §18).
 */
export function resolveSafePath(root: string, relativePath: string): string {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(resolvedRoot, relativePath);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(resolvedRoot + sep)) {
    throw new PathTraversalError(`Path escapes the root directory: "${relativePath}"`);
  }
  return resolvedTarget;
}
