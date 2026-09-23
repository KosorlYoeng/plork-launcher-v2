import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SecureStorage, type SafeStorageLike } from "../src/main/SecureStorage.js";

/** A fake safeStorage: XORs with a fixed key so it's reversible but not a no-op, without needing real OS Keychain access in tests. */
function createFakeSafeStorage(available = true): SafeStorageLike {
  const key = 0x5a;
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plainText) => {
      const buf = Buffer.from(plainText, "utf8");
      for (let i = 0; i < buf.length; i += 1) buf[i] ^= key;
      return buf;
    },
    decryptString: (encrypted) => {
      const buf = Buffer.from(encrypted);
      for (let i = 0; i < buf.length; i += 1) buf[i] ^= key;
      return buf.toString("utf8");
    },
  };
}

describe("SecureStorage", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "mzzplork-securestorage-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns null when nothing has been saved yet", async () => {
    const storage = new SecureStorage(createFakeSafeStorage(), join(dir, "session.enc"));
    expect(await storage.loadRefreshToken()).toBeNull();
  });

  it("round-trips a token through encryption", async () => {
    const storage = new SecureStorage(createFakeSafeStorage(), join(dir, "session.enc"));
    await storage.saveRefreshToken("super-secret-refresh-token");
    expect(await storage.loadRefreshToken()).toBe("super-secret-refresh-token");
  });

  it("never writes the token in plaintext to disk", async () => {
    const filePath = join(dir, "session.enc");
    const storage = new SecureStorage(createFakeSafeStorage(), filePath);
    await storage.saveRefreshToken("super-secret-refresh-token");

    const onDisk = (await readFile(filePath)).toString("latin1");
    expect(onDisk).not.toContain("super-secret-refresh-token");
  });

  it("refuses to save when OS-level encryption is unavailable", async () => {
    const storage = new SecureStorage(createFakeSafeStorage(false), join(dir, "session.enc"));
    await expect(storage.saveRefreshToken("token")).rejects.toThrow(/unavailable/i);
  });

  it("clear() removes the persisted token", async () => {
    const filePath = join(dir, "session.enc");
    const storage = new SecureStorage(createFakeSafeStorage(), filePath);
    await storage.saveRefreshToken("token");
    await storage.clear();
    expect(await storage.loadRefreshToken()).toBeNull();
  });

  it("treats a corrupted/undecryptable file as logged out rather than throwing", async () => {
    const filePath = join(dir, "session.enc");
    await writeFile(filePath, Buffer.from("not valid encrypted data"));
    const fake = createFakeSafeStorage();
    const throwing: SafeStorageLike = {
      ...fake,
      decryptString: () => {
        throw new Error("bad data");
      },
    };
    const storage = new SecureStorage(throwing, filePath);
    expect(await storage.loadRefreshToken()).toBeNull();
  });
});
