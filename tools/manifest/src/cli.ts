#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { parseFlags, parseIntFlag, requireFlag } from "./cliArgs.js";
import { generateManifest } from "./generate.js";

const USAGE =
  "Usage: mzzplork-manifest --input <dir> --output <manifest.json> " +
  "--channel <channel> --version <version> --build <buildNumber>";

interface CliArgs {
  input: string;
  output: string;
  channel: string;
  version: string;
  build: number;
}

function parseArgs(argv: string[]): CliArgs {
  const flags = parseFlags(argv);
  const input = requireFlag(flags, "input", USAGE);
  const output = requireFlag(flags, "output", USAGE);
  const channel = requireFlag(flags, "channel", USAGE);
  const version = requireFlag(flags, "version", USAGE);
  const build = parseIntFlag(requireFlag(flags, "build", USAGE), "build");
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
