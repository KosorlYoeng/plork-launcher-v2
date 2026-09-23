import "dotenv/config";
import { parseFlags, parseIntFlag, requireFlag } from "@mzzplork/manifest";
import { createPrismaClient } from "./db/client.js";
import { config } from "./config.js";
import { publishLauncherVersion } from "./services/publishLauncher.js";

const USAGE =
  "Usage: npm run publish-launcher -- --file <installerPath> --channel <channel> " +
  "--version <version> --build <buildNumber> --download-url <url>";

interface CliArgs {
  file: string;
  channel: string;
  version: string;
  build: number;
  downloadUrl: string;
}

function parseArgs(argv: string[]): CliArgs {
  const flags = parseFlags(argv);
  const file = requireFlag(flags, "file", USAGE);
  const channel = requireFlag(flags, "channel", USAGE);
  const version = requireFlag(flags, "version", USAGE);
  const build = parseIntFlag(requireFlag(flags, "build", USAGE), "build");
  const downloadUrl = requireFlag(flags, "download-url", USAGE);
  return { file, channel, version, build, downloadUrl };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const prisma = createPrismaClient(config.databaseUrl);
  try {
    const result = await publishLauncherVersion(prisma, {
      filePath: args.file,
      channel: args.channel,
      version: args.version,
      build: args.build,
      downloadUrl: args.downloadUrl,
    });
    console.log(
      `Published launcher ${result.channel}/${result.version} (build ${result.build}) — sha256=${result.sha256}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
