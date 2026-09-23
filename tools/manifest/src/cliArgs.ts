/** Parses `--key value` pairs from argv into a Map. Shared by every CLI in this monorepo. */
export function parseFlags(argv: string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`Missing value for --${key}`);
      }
      flags.set(key, value);
      i += 1;
    }
  }
  return flags;
}

export function requireFlag(flags: Map<string, string>, key: string, usage: string): string {
  const value = flags.get(key);
  if (!value) {
    throw new Error(usage);
  }
  return value;
}

export function parseIntFlag(value: string, flagName: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`--${flagName} must be an integer, got "${value}"`);
  }
  return parsed;
}
