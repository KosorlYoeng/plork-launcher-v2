import { describe, expect, it } from "vitest";
import { ProcessManager } from "../src/main/ProcessManager.js";

describe("ProcessManager", () => {
  it("reports the exit code and captured stdout of a real spawned process", async () => {
    const manager = new ProcessManager();
    const { handle, result } = manager.start(process.execPath, {
      args: ["-e", "process.stdout.write('hello from child'); process.exit(0)"],
    });

    expect(typeof handle.pid).toBe("number");
    const outcome = await result;
    expect(outcome.code).toBe(0);
    expect(outcome.stdout).toBe("hello from child");
  });

  it("reports a non-zero exit code and stderr output", async () => {
    const manager = new ProcessManager();
    const { result } = manager.start(process.execPath, {
      args: ["-e", "process.stderr.write('boom'); process.exit(7)"],
    });

    const outcome = await result;
    expect(outcome.code).toBe(7);
    expect(outcome.stderr).toBe("boom");
  });

  it("reports the outcome of a killed process via the signal field", async () => {
    const manager = new ProcessManager();
    const { handle, result } = manager.start(process.execPath, {
      args: ["-e", "setTimeout(() => {}, 30000)"],
    });

    handle.kill("SIGTERM");
    const outcome = await result;
    expect(outcome.signal).toBe("SIGTERM");
    expect(outcome.code).toBeNull();
  });

  it("rejects when the executable doesn't exist", async () => {
    const manager = new ProcessManager();
    const { result } = manager.start("/no/such/executable-mzzplork-test");
    await expect(result).rejects.toThrow();
  });
});
