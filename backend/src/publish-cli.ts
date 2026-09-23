import "dotenv/config";
import { parseFlags, parseIntFlag, requireFlag } from "@mzzplork/manifest";
import { createPrismaClient } from "./db/client.js";
import { config } from "./config.js";
import { publishBuild } from "./services/publish.js";

const USAGE =
  "Usage: npm run publish-build -- --dir <buildDir> --channel <channel> " +
  "--version <version> --build <buildNumber>";

interface CliArgs {
  dir: string;
  channel: string;
  version: string;
  build: number;
}

function parseArgs(argv: string[]): CliArgs {
  const flags = parseFlags(argv);
  const dir = requireFlag(flags, "dir", USAGE);
  const channel = requireFlag(flags, "channel", USAGE);
  const version = requireFlag(flags, "version", USAGE);
  const build = parseIntFlag(requireFlag(flags, "build", USAGE), "build");
  return { dir, channel, version, build };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const prisma = createPrismaClient(config.databaseUrl);
  try {
    const result = await publishBuild(prisma, {
      buildDir: args.dir,
      channel: args.channel,
      version: args.version,
      build: args.build,
      storageRoot: config.storageRoot,
    });
    console.log(
      `Published ${result.channel}/${result.version} (build ${result.build}) — ${result.fileCount} file(s)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
