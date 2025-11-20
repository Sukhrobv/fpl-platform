

import { connectDB, disconnectDB, prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { syncFplData, type SyncOptions } from "@/lib/services/fplSync";

interface CliOptions extends SyncOptions {
  help?: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    const [key, value] = arg.split("=");
    switch (key) {
      case "--events":
        options.events = value
          ?.split(/[,\s]+/)
          .map((v) => parseInt(v, 10))
          .filter((v) => Number.isFinite(v) && v > 0);
        break;
      case "--rpm":
      case "--requests-per-minute":
        options.requestsPerMinute = value ? parseInt(value, 10) : undefined;
        break;
      case "--concurrency":
        options.concurrency = value ? parseInt(value, 10) : undefined;
        break;
      case "--max-retries":
        options.maxRetries = value ? parseInt(value, 10) : undefined;
        break;
      case "--retry-base":
        options.retryBaseDelayMs = value ? parseInt(value, 10) : undefined;
        break;
      case "--retry-jitter":
        options.retryJitterMs = value ? parseInt(value, 10) : undefined;
        break;
      default:
        logger.warn(`Unknown argument '${arg}' – use --help for usage.`);
    }
  }
  return options;
}

function printHelp(): void {
  logger.info(`FPL Sync Script\n\nUsage: tsx scripts/sync-fpl.ts [options]\n\nOptions:\n  --events=1,2,3         Comma or space separated list of gameweeks to sync\n  --rpm=45               Override requests-per-minute throttle\n  --concurrency=4        Max concurrent FPL requests\n  --max-retries=3        Number of retry attempts for failed calls\n  --retry-base=500       Base delay (ms) used for exponential backoff\n  --retry-jitter=200     Random jitter (ms) added to each retry delay\n  --help                 Show this message`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const connected = await connectDB();
  if (!connected) {
    process.exitCode = 1;
    return;
  }

  try {
    const summary = await syncFplData(options, { prisma, logger });
    logger.info(
      `Sync log ${summary.syncLogId ?? "n/a"} | Events=${summary.eventsProcessed.join(",") || "none"} | Teams +${summary.teamsCreated}/${summary.teamsUpdated} | Players +${summary.playersCreated}/${summary.playersUpdated} | Matches +${summary.matchesCreated}/${summary.matchesUpdated} | Stats ${summary.statsUpserted}`,
    );
  } catch (error) {
    logger.error("FPL sync failed", error);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
}

main().catch((error) => {
  logger.error("Unexpected sync failure", error);
  process.exitCode = 1;
});
