import { spawn, type ChildProcess } from "node:child_process";

export interface ProcessHandle {
  readonly pid: number | undefined;
  kill(signal?: NodeJS.Signals): void;
}

export interface ProcessResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

export interface StartOptions {
  cwd?: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

/**
 * Starts, monitors, and reports the outcome of a spawned process (plan §6
 * ProcessManager). Generic over the executable so it's independently
 * testable today (against a trivial process) and reusable once Phase 3
 * unblocks starting the real MzzPlork client.
 */
export class ProcessManager {
  start(
    executablePath: string,
    options: StartOptions = {},
  ): { handle: ProcessHandle; result: Promise<ProcessResult> } {
    const child: ChildProcess = spawn(executablePath, options.args ?? [], {
      cwd: options.cwd,
      env: options.env ?? process.env,
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout += text;
      options.onStdout?.(text);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr += text;
      options.onStderr?.(text);
    });

    const result = new Promise<ProcessResult>((resolveResult, reject) => {
      child.on("error", reject);
      child.on("exit", (code, signal) => {
        resolveResult({ code, signal, stdout, stderr });
      });
    });

    const handle: ProcessHandle = {
      pid: child.pid,
      kill: (signal) => {
        child.kill(signal);
      },
    };

    return { handle, result };
  }
}
