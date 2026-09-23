#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { generateManifest } from "./generate.js";

interface CliArgs {
  input: string;
  output: string;
  channel: string;
  version: string;
  build: number;
}

function parseArgs(argv: string[]): CliArgs {
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

  const input = flags.get("input");
  const output = flags.get("output");
  const channel = flags.get("channel");
  const version = flags.get("version");
  const buildRaw = flags.get("build");

  if (!input || !output || !channel || !version || !buildRaw) {
    throw new Error(
      "Usage: mzzplork-manifest --input <dir> --output <manifest.json> " +
        "--channel <channel> --version <version> --build <buildNumber>",
    );
  }

  const build = Number.parseInt(buildRaw, 10);
  if (!Number.isInteger(build)) {
    throw new Error(`--build must be an integer, got "${buildRaw}"`);
  }

  return { input, output, channel, version, build };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const manifest = await generateManifest({
    inputDir: args.input,
    channel: args.channel,
    version: args.version,
    build: args.build,
  });
  await writeFile(args.output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(
    `Wrote manifest with ${manifest.files.length} file(s) to ${args.output}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
