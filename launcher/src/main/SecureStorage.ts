import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Shape of Electron's `safeStorage` module — declared locally so this class
 * has no compile-time dependency on `electron` and can be unit-tested with
 * a fake implementation. The real wiring (in src/main/index.ts) passes
 * Electron's actual `safeStorage`, which is backed by the OS keychain
 * (Keychain on macOS, DPAPI on Windows).
 */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

/**
 * Persists the refresh token to disk, OS-encrypted via `safeStorage` —
 * never in plaintext (plan §18/§6 SecureStorage requirement). The access
 * token is intentionally not handled here: it's short-lived and kept in
 * memory only, re-derived from the refresh token on launcher start.
 */
export class SecureStorage {
  constructor(
    private readonly safeStorage: SafeStorageLike,
    private readonly filePath: string,
  ) {}

  async saveRefreshToken(refreshToken: string): Promise<void> {
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error(
        "OS-level secure storage is unavailable; refusing to persist the refresh token in plaintext",
      );
    }
    const encrypted = this.safeStorage.encryptString(refreshToken);
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, encrypted);
  }

  async loadRefreshToken(): Promise<string | null> {
    let encrypted: Buffer;
    try {
      encrypted = await readFile(this.filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
    if (!this.safeStorage.isEncryptionAvailable()) {
      return null;
    }
    try {
      return this.safeStorage.decryptString(encrypted);
    } catch {
      // Corrupted or undecryptable (e.g. moved to a different machine/user) — treat as logged out.
      return null;
    }
  }

  async clear(): Promise<void> {
    await rm(this.filePath, { force: true });
  }
}
